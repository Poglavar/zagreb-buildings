// Tests the dev server's request resolution: the deep-link fallback, and that nothing outside the
// project directory (or a dotfile such as .env) can be read through it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const { resolveRequest } = createRequire(import.meta.url)('./dev-server.js');
const ROOT = path.resolve('/srv/site');

test('the root and a bare cadastre id both serve index.html, so a refresh on /<id> works', () => {
    assert.deepEqual(resolveRequest('/', ROOT), { file: path.join(ROOT, 'index.html') });
    assert.deepEqual(resolveRequest('/14244354', ROOT), { file: path.join(ROOT, 'index.html') });
    assert.deepEqual(resolveRequest('/14244354/?3d', ROOT), { file: path.join(ROOT, 'index.html') });
});

test('ordinary assets resolve under the root, query strings ignored', () => {
    assert.deepEqual(resolveRequest('/js/html-safe.js?v=1', ROOT), { file: path.join(ROOT, 'js/html-safe.js') });
    assert.deepEqual(resolveRequest('/favicon.svg', ROOT), { file: path.join(ROOT, 'favicon.svg') });
});

test('nothing outside the project directory can be reached', () => {
    for (const evil of ['/../etc/passwd', '/..%2f..%2fetc/passwd', '/js/../../secret', '/%2e%2e/x', '/a/../../b']) {
        assert.deepEqual(resolveRequest(evil, ROOT), { notFound: true }, evil);
    }
});

test('dotfiles (.env, .git) and malformed requests are a 404', () => {
    for (const bad of ['/.env', '/.git/config', '/js/.secret', '/%E0%A4%A', '/x\0y']) {
        assert.deepEqual(resolveRequest(bad, ROOT), { notFound: true }, JSON.stringify(bad));
    }
});
