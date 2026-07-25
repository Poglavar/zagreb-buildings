// Headless tests for the 3D-dialog geometry maths. These run in node with no browser and no
// three.js: the point of js/geo-local.js is that everything with a branch worth testing lives
// outside the renderer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    metresPerDegree, makeProjector, ringToLocal, ringArea, localBounds,
    meshToPositions, overtureExtrusionHeight,
} from './geo-local.js';

const ZG_LAT = 45.8186;
const ZG_LON = 15.8478;

test('metresPerDegree shrinks longitude by cos(lat)', () => {
    const { mPerDegLat, mPerDegLon } = metresPerDegree(ZG_LAT);
    assert.ok(Math.abs(mPerDegLat - 111319.49) < 1, `lat degree ${mPerDegLat}`);
    // Zagreb is at ~45.8°, so a degree of longitude is ~70% of a degree of latitude.
    assert.ok(Math.abs(mPerDegLon / mPerDegLat - Math.cos(ZG_LAT * Math.PI / 180)) < 1e-12);
});

test('projector puts the origin at 0,0 and points x east / z south', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    const origin = project(ZG_LON, ZG_LAT);
    assert.ok(origin.x === 0, `origin x ${origin.x}`);      // -0 is fine, strict equal is not
    assert.ok(origin.z === 0, `origin z ${origin.z}`);

    const east = project(ZG_LON + 0.001, ZG_LAT);
    assert.ok(east.x > 0, 'east is +x');
    assert.ok(east.z === 0, `east z ${east.z}`);

    const north = project(ZG_LON, ZG_LAT + 0.001);
    assert.ok(north.z < 0, 'north is -z');
});

test('ringToLocal drops the GeoJSON closing vertex', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    const ring = [
        [ZG_LON, ZG_LAT], [ZG_LON + 0.0001, ZG_LAT], [ZG_LON + 0.0001, ZG_LAT + 0.0001],
        [ZG_LON, ZG_LAT + 0.0001], [ZG_LON, ZG_LAT],
    ];
    const pts = ringToLocal(ring, project);
    assert.equal(pts.length, 4);
});

test('ringToLocal rejects degenerate rings', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    assert.deepEqual(ringToLocal([[ZG_LON, ZG_LAT]], project), []);
    assert.deepEqual(ringToLocal(null, project), []);
});

test('projected ring area matches the real-world area of the polygon', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    // A 10 m x 20 m rectangle expressed in degrees, projected back to metres.
    const { mPerDegLat, mPerDegLon } = metresPerDegree(ZG_LAT);
    const dLon = 10 / mPerDegLon;
    const dLat = 20 / mPerDegLat;
    const ring = [
        [ZG_LON, ZG_LAT], [ZG_LON + dLon, ZG_LAT],
        [ZG_LON + dLon, ZG_LAT + dLat], [ZG_LON, ZG_LAT + dLat], [ZG_LON, ZG_LAT],
    ];
    const area = ringArea(ringToLocal(ring, project));
    assert.ok(Math.abs(area - 200) < 0.01, `expected ~200 m², got ${area}`);
});

test('localBounds spans every group and centres between them', () => {
    const b = localBounds([
        [{ x: 0, z: 0 }, { x: 10, z: 0 }],
        [{ x: -4, z: 6 }],
    ]);
    assert.equal(b.minX, -4);
    assert.equal(b.maxX, 10);
    assert.equal(b.cx, 3);
    assert.equal(b.width, 14);
    assert.equal(b.depth, 6);
    assert.equal(b.radius, 7);
});

test('localBounds returns null when there is nothing to frame', () => {
    assert.equal(localBounds([]), null);
    assert.equal(localBounds([[]]), null);
});

test('meshToPositions fans each face into triangles and rebases Z onto z_min', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    const { mPerDegLat, mPerDegLon } = metresPerDegree(ZG_LAT);
    const dLon = 10 / mPerDegLon;
    const dLat = 10 / mPerDegLat;
    const zMin = 146.873;

    const mesh = {
        type: 'MultiPolygon',
        coordinates: [
            // One quad face at 8 m above the mesh base → 4 corners + closing vertex → 2 triangles.
            [[
                [ZG_LON, ZG_LAT, zMin + 8],
                [ZG_LON + dLon, ZG_LAT, zMin + 8],
                [ZG_LON + dLon, ZG_LAT + dLat, zMin + 8],
                [ZG_LON, ZG_LAT + dLat, zMin + 8],
                [ZG_LON, ZG_LAT, zMin + 8],
            ]],
        ],
    };

    const pos = meshToPositions(mesh, project, zMin);
    assert.equal(pos.length, 2 * 3 * 3, 'two triangles, three vertices, three components');
    for (let i = 1; i < pos.length; i += 3) {
        assert.ok(Math.abs(pos[i] - 8) < 1e-6, `vertex Y should be ground-relative, got ${pos[i]}`);
    }
    // First vertex sits on the projector origin.
    assert.ok(Math.abs(pos[0]) < 1e-9 && Math.abs(pos[2]) < 1e-9);
});

test('meshToPositions ignores faces with too few corners and non-mesh input', () => {
    const project = makeProjector(ZG_LAT, ZG_LON);
    assert.deepEqual(meshToPositions(null, project, 0), []);
    assert.deepEqual(meshToPositions({ type: 'Polygon', coordinates: [] }, project, 0), []);
    assert.deepEqual(meshToPositions({
        type: 'MultiPolygon',
        coordinates: [[[[ZG_LON, ZG_LAT, 1], [ZG_LON, ZG_LAT, 1]]]],
    }, project, 0), []);
});

test('overtureExtrusionHeight prefers height, falls back to floors, else null', () => {
    assert.equal(overtureExtrusionHeight({ height_m: 12.5, num_floors: 2 }), 12.5);
    assert.equal(overtureExtrusionHeight({ height_m: null, num_floors: 4 }), 12);
    assert.equal(overtureExtrusionHeight({ height_m: null, num_floors: null }), null);
    assert.equal(overtureExtrusionHeight({ height_m: 0, num_floors: 0 }), null);
    assert.equal(overtureExtrusionHeight(null), null);
});
