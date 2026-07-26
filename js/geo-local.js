// Geometry helpers for the 3D compare dialog: turn WGS84 lon/lat (and the absolute-Z GDI mesh)
// into local metres around one building, so three.js can draw the cadastre, GDI and Overture
// records of that building in one coordinate frame. No THREE, no DOM — pure functions, so the
// maths can be unit-tested headlessly (js/geo-local.test.mjs).

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6378137;

// Metres per degree of lon/lat at a given latitude — equirectangular, which is exact enough
// over one building (errors are millimetres at this scale).
export function metresPerDegree(lat) {
    const mPerDegLat = DEG_TO_RAD * EARTH_RADIUS_M;
    const mPerDegLon = mPerDegLat * Math.cos(lat * DEG_TO_RAD);
    return { mPerDegLat, mPerDegLon };
}

// Projector from lon/lat to scene-local metres about an origin: x east, z south (three.js
// convention, where -z points north). Returns a function so every layer of one building shares
// the same origin — that is what makes the three footprints comparable.
export function makeProjector(originLat, originLon) {
    const { mPerDegLat, mPerDegLon } = metresPerDegree(originLat);
    return function project(lon, lat) {
        return {
            x: (lon - originLon) * mPerDegLon,
            z: -(lat - originLat) * mPerDegLat,
        };
    };
}

// [[lon, lat], ...] → [{x, z}, ...], dropping the GeoJSON closing vertex (three.js Shape
// closes the path itself; a duplicated point makes a zero-length segment).
export function ringToLocal(ring, project) {
    if (!Array.isArray(ring) || ring.length < 3) return [];
    const pts = ring.map(([lon, lat]) => project(lon, lat));
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (pts.length > 3 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) {
        pts.pop();
    }
    return pts;
}

// Local {x, z} (x east, z south) → 2D coords for THREE.ExtrudeGeometry's Shape.
// ExtrudeGeometry builds in the XY plane and is then rotateX(-π/2)'d so extrusion
// becomes +Y. That rotation maps shape-Y → scene −Z, so we feed −z as shape-Y —
// otherwise footprints come out mirrored north/south relative to parcels and the
// GDI mesh (which write three.js Z = local z directly).
export function shapeXYFromLocal(points) {
    if (!Array.isArray(points) || points.length < 3) return [];
    return points.map(p => ({ x: p.x, y: -p.z }));
}

// Signed-area magnitude of a local ring, in m². Used to sanity-check a projected footprint
// against the area the database reports for the same polygon.
export function ringArea(points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += a.x * b.z - b.x * a.z;
    }
    return Math.abs(sum) / 2;
}

// Axis-aligned bounds + centre of local points, for framing the camera.
export function localBounds(pointGroups) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const points of pointGroups) {
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
    }
    if (!isFinite(minX)) return null;
    return {
        minX, maxX, minZ, maxZ,
        cx: (minX + maxX) / 2,
        cz: (minZ + maxZ) / 2,
        width: maxX - minX,
        depth: maxZ - minZ,
        radius: Math.max(maxX - minX, maxZ - minZ) / 2,
    };
}

// GDI LOD2 mesh (GeoJSON MultiPolygon with absolute-elevation Z) → a flat triangle-soup
// position array for a THREE.BufferGeometry.
//
// Every polygon is one planar face of the solid, so a triangle fan is a correct triangulation
// (LOD2 faces are convex) and needs no earcut. Y is made ground-relative by subtracting the
// mesh's own z_min — the same datum gdi_building.height_m is expressed in — so the model sits
// on y=0 next to footprints that have no elevation at all.
export function meshToPositions(geometry, project, zMin) {
    const out = [];
    if (!geometry || geometry.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates)) {
        return out;
    }
    const base = Number.isFinite(zMin) ? zMin : 0;

    for (const polygon of geometry.coordinates) {
        const ring = polygon && polygon[0];
        if (!Array.isArray(ring) || ring.length < 4) continue;   // 3 corners + closing vertex

        const verts = ring.slice(0, -1).map(([lon, lat, z]) => {
            const { x, z: zz } = project(lon, lat);
            return [x, (Number.isFinite(z) ? z : base) - base, zz];
        });
        if (verts.length < 3) continue;

        for (let i = 1; i < verts.length - 1; i++) {
            out.push(...verts[0], ...verts[i], ...verts[i + 1]);
        }
    }
    return out;
}

// The height to extrude an Overture footprint to. Overture carries height only sometimes; a
// floor count is the documented fallback at 3 m per floor. Null means "this source says
// nothing about how tall the building is" — the caller draws a ground slab, it does NOT
// borrow a height from another source.
export function overtureExtrusionHeight(overture) {
    if (!overture) return null;
    if (Number.isFinite(overture.height_m) && overture.height_m > 0) return overture.height_m;
    if (Number.isFinite(overture.num_floors) && overture.num_floors > 0) return overture.num_floors * 3;
    return null;
}
