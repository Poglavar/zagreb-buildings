// 3D compare dialog: draws the three independent geometric records of one building — the DGU
// cadastre footprint, the GDI LOD2 mesh, and the Overture footprint — in one scene, so their
// size, position and overlap can be read off directly.
//
// Each model uses ONLY its own source's numbers. The cadastre publishes no height and no floor
// count, so its footprint is drawn as a ground slab rather than extruded with a borrowed height;
// an Overture footprint without height or floors gets the same treatment. Any of the three can
// be missing for a given building.
//
// Loaded lazily by index.html when the dialog is first opened (three.js is ~700 KB).

import * as THREE from 'three';
import { makeProjector, ringToLocal, localBounds, meshToPositions, overtureExtrusionHeight } from './geo-local.js';

// Same colours as the map outline toggles, so a footprint means the same thing in both views.
export const MODEL_COLORS = {
    dgu:      0x1864ab,   // katastar — blue
    gdi:      0xd9480f,   // GDI — orange
    overture: 0x2b8a3e,   // Overture — green
};

const SLAB_THICKNESS_M = 0.15;   // visible thickness for a source that reports no height

// A three.js Shape from local {x, z} points. Shape works in 2D (x, y); the mesh is rotated flat
// afterwards, so the shape's y is the scene's z.
function shapeFromPoints(points) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    shape.closePath();
    return shape;
}

function footprintMesh(points, heightM, color) {
    const depth = heightM && heightM > 0 ? heightM : SLAB_THICKNESS_M;
    const geometry = new THREE.ExtrudeGeometry(shapeFromPoints(points), { depth, bevelEnabled: false });
    // ExtrudeGeometry builds along +z; lay it down so the extrusion runs up the scene's +y.
    geometry.rotateX(-Math.PI / 2);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
        color, transparent: true, opacity: 1, side: THREE.DoubleSide,
    })));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    ));
    return group;
}

function lod2Mesh(positions, color) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
        color, transparent: true, opacity: 1, side: THREE.DoubleSide, flatShading: true,
    })));
    group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    ));
    return group;
}

// Cadastral parcel boundaries, drawn flat on the ground around the building. Context, not a
// model: they are never solid, never framed for, and sit just above y=0 so they don't z-fight
// with the cadastre slab.
function parcelLines(parcels, project) {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: 0x868e96, transparent: true, opacity: 0.75 });
    for (const parcel of parcels || []) {
        const pts = ringToLocal(parcel.polygon, project);
        if (pts.length < 3) continue;
        const geometry = new THREE.BufferGeometry().setFromPoints(
            pts.map(p => new THREE.Vector3(p.x, 0.02, p.z)),
        );
        group.add(new THREE.LineLoop(geometry, material));
    }
    return group.children.length ? group : null;
}

// Build every model the payload actually contains. Returns [{key, label, group, note}, ...].
function buildModels(data, project) {
    const models = [];
    const rings = [];

    if (data.dgu && data.dgu.polygon) {
        const pts = ringToLocal(data.dgu.polygon, project);
        if (pts.length >= 3) {
            rings.push(pts);
            models.push({
                key: 'dgu',
                label: 'Katastar (DGU)',
                group: footprintMesh(pts, null, MODEL_COLORS.dgu),
                note: data.dgu.height_note || 'bez visine',
                heightM: null,
            });
        }
    }

    if (data.gdi && Array.isArray(data.gdi.mesh?.coordinates)) {
        const positions = meshToPositions(data.gdi.mesh, project, data.gdi.z_min);
        if (positions.length >= 9) {
            models.push({
                key: 'gdi',
                label: 'GDI (3D model)',
                group: lod2Mesh(positions, MODEL_COLORS.gdi),
                note: data.gdi.building_count > 1
                    ? `objekt obuhvaća ${data.gdi.building_count} kat. zgrada`
                    : (data.gdi.height_m != null ? `sljeme ${data.gdi.height_m.toFixed(1)} m` : ''),
                heightM: data.gdi.height_m ?? null,
            });
            if (data.gdi.polygon) {
                const gp = ringToLocal(data.gdi.polygon, project);
                if (gp.length >= 3) rings.push(gp);
            }
        }
    }

    if (data.overture && data.overture.polygon) {
        const pts = ringToLocal(data.overture.polygon, project);
        if (pts.length >= 3) {
            rings.push(pts);
            const h = overtureExtrusionHeight(data.overture);
            models.push({
                key: 'overture',
                label: 'Overture',
                group: footprintMesh(pts, h, MODEL_COLORS.overture),
                note: h != null
                    ? `visina ${h.toFixed(1)} m${data.overture.height_m == null ? ' (iz katova)' : ''}`
                    : 'bez visine',
                heightM: h,
            });
        }
    }

    return { models, rings };
}

// Mount the viewer into `canvasEl`'s parent. Returns a handle with dispose()/setVisible()/
// setSolid()/setSpinning(); the caller owns the DOM around it.
export function createViewer(canvasEl, data) {
    const project = makeProjector(data.lat, data.lon);
    const { models, rings } = buildModels(data, project);
    if (models.length === 0) return null;

    const bounds = localBounds(rings.length ? rings : [[{ x: 0, z: 0 }]]);
    const tallest = models.reduce((m, x) => Math.max(m, x.heightM || 0), 0);
    const frameRadius = Math.max(bounds.radius || 8, tallest / 2, 6);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f3f5);

    const pivot = new THREE.Group();
    // Centre the models on the turntable axis so rotation is about the building, not the origin.
    pivot.position.set(0, 0, 0);
    scene.add(pivot);

    const content = new THREE.Group();
    content.position.set(-bounds.cx, 0, -bounds.cz);
    pivot.add(content);
    for (const m of models) content.add(m.group);

    // Parcels join the scene but not `bounds` — framing on them would zoom the building away.
    const parcels = parcelLines(data.parcels, project);
    if (parcels) content.add(parcels);

    // Ground grid for scale: 1 m cells.
    const grid = new THREE.GridHelper(Math.ceil(frameRadius * 4), Math.ceil(frameRadius * 4), 0xced4da, 0xe9ecef);
    grid.position.y = -0.01;
    scene.add(grid);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a6, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    let camAzimuth = Math.PI * 0.25;
    let camPolar = Math.PI * 0.32;                 // 0 = straight down
    let camDistance = frameRadius * 4.2;
    let spinning = true;

    function applyCamera() {
        const target = new THREE.Vector3(0, Math.min(tallest, frameRadius) / 2, 0);
        camera.position.set(
            target.x + camDistance * Math.sin(camPolar) * Math.sin(camAzimuth),
            target.y + camDistance * Math.cos(camPolar),
            target.z + camDistance * Math.sin(camPolar) * Math.cos(camAzimuth),
        );
        camera.lookAt(target);
    }

    // Size the drawing buffer from the canvas's CSS box every frame instead of listening for
    // resize events: the dialog changes size on open, on rotate and on window resize, and a
    // ResizeObserver on the container was observed not to fire in this page — leaving the
    // buffer at the old aspect ratio and the model visibly stretched on a phone.
    let sizedW = 0, sizedH = 0;
    function resizeIfNeeded() {
        const w = Math.max(canvasEl.clientWidth, 1);
        const h = Math.max(canvasEl.clientHeight, 1);
        if (w === sizedW && h === sizedH) return;
        sizedW = w; sizedH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    // ─── Pointer orbit / wheel zoom ─────────────────────────────────────────
    let dragging = false;
    let lastX = 0, lastY = 0;

    function onPointerDown(e) {
        dragging = true;
        spinning = false;
        lastX = e.clientX; lastY = e.clientY;
        canvasEl.setPointerCapture?.(e.pointerId);
    }
    function onPointerMove(e) {
        if (!dragging) return;
        camAzimuth -= (e.clientX - lastX) * 0.008;
        camPolar = Math.min(Math.PI * 0.49, Math.max(0.08, camPolar - (e.clientY - lastY) * 0.006));
        lastX = e.clientX; lastY = e.clientY;
    }
    function onPointerUp(e) {
        dragging = false;
        canvasEl.releasePointerCapture?.(e.pointerId);
    }
    function onWheel(e) {
        e.preventDefault();
        camDistance = Math.min(frameRadius * 20, Math.max(frameRadius * 1.2, camDistance * (1 + Math.sign(e.deltaY) * 0.12)));
    }

    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let disposed = false;
    let lastTime = 0;

    function frame(now) {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
        lastTime = now;
        if (spinning) camAzimuth += dt * 0.45;
        resizeIfNeeded();
        applyCamera();
        renderer.render(scene, camera);
    }

    resizeIfNeeded();
    applyCamera();
    raf = requestAnimationFrame(frame);

    function eachMaterial(key, fn) {
        const model = models.find(m => m.key === key);
        if (!model) return;
        model.group.traverse(obj => { if (obj.material) fn(obj.material, obj); });
    }

    return {
        models: models.map(m => ({ key: m.key, label: m.label, note: m.note })),
        parcelCount: parcels ? parcels.children.length : 0,
        setParcelsVisible(visible) { if (parcels) parcels.visible = visible; },
        setVisible(key, visible) {
            const model = models.find(m => m.key === key);
            if (model) model.group.visible = visible;
        },
        setSolid(key, solid) {
            eachMaterial(key, (material, obj) => {
                if (obj.isLineSegments) return;
                material.opacity = solid ? 1 : 0.28;
                material.depthWrite = solid;
                material.needsUpdate = true;
            });
        },
        setSpinning(on) { spinning = on; },
        isSpinning() { return spinning; },
        dispose() {
            disposed = true;
            cancelAnimationFrame(raf);
            canvasEl.removeEventListener('pointerdown', onPointerDown);
            canvasEl.removeEventListener('pointermove', onPointerMove);
            canvasEl.removeEventListener('pointerup', onPointerUp);
            canvasEl.removeEventListener('pointercancel', onPointerUp);
            canvasEl.removeEventListener('wheel', onWheel);
            scene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            renderer.dispose();
        },
    };
}
