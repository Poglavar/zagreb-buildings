// Headless tests for js/html-safe.js: that escaped data cannot break out of text or of a quoted
// attribute, that only http(s) URLs survive into an href, and that out-of-order request
// completions cannot replace the current selection. (The real-parser check — Chrome parsing a
// popup built from hostile data — is done in the browser; here the property that makes it safe
// is asserted directly: no raw delimiter survives, and decoding restores the original.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { escapeHtml, safeHttpUrl, createLatestGate } = require('./html-safe.js');

const DECODE = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#96;': '`' };
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39|#96);/g, m => DECODE[m]);

const HOSTILE = [
    '" onmouseover="alert(1)',
    "' onfocus='alert(1)",
    '"><script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '` autofocus onfocus=alert(1) `',
    'https://example.org/?a=1&b="2"&c=\'3\'',
    '&amp; &lt;already&gt; &quot;escaped&quot;',
    'Željko Šarić & Ćiro',
    '',
    'plain text',
];

test('escaped data holds no raw delimiter and decodes back to exactly what was put in', () => {
    for (const s of HOSTILE) {
        const out = escapeHtml(s);
        assert.doesNotMatch(out, /[<>"'`]/, `raw delimiter left in: ${s}`);
        assert.equal(decode(out), s, `round trip failed for: ${s}`);
        // every & that remains starts one of our entities, so nothing is left half-open
        assert.doesNotMatch(out.replace(/&(?:amp|lt|gt|quot|#39|#96);/g, ''), /&/);
    }
});

test('null, undefined and numbers are rendered as text, not dropped or thrown', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(0), '0');
    assert.equal(escapeHtml(12.5), '12.5');
    assert.equal(escapeHtml({ toString: () => '<b>' }), '&lt;b&gt;');
});

test('only http(s) URLs survive into an href', () => {
    assert.equal(safeHttpUrl('https://example.org/a b'), 'https://example.org/a%20b');
    assert.equal(safeHttpUrl('  http://example.org/x '), 'http://example.org/x');
    for (const bad of [
        'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
        'vbscript:x', 'file:///etc/passwd', '//example.org', 'example.org', '/relative', '', '   ', null, undefined, 42, {},
    ]) {
        assert.equal(safeHttpUrl(bad), '', String(bad));
    }
});

test('a hostile https URL is still neutralised once escaped into an attribute', () => {
    const url = safeHttpUrl('https://example.org/?q=" onclick="alert(1)');
    assert.ok(url);
    assert.doesNotMatch(escapeHtml(url), /["'<>`]/);
});

test('out-of-order completions: only the latest request may be applied', () => {
    const gate = createLatestGate();
    const a = gate.begin();
    const b = gate.begin();
    assert.equal(gate.isCurrent(a), false, 'a superseded request must not apply');
    assert.equal(gate.isCurrent(b), true);
    const c = gate.begin();
    assert.equal(gate.isCurrent(b), false);
    assert.equal(gate.isCurrent(c), true);
});

test('invalidate drops a response for something that was closed, and a new request can still start', () => {
    const gate = createLatestGate();
    const t = gate.begin();
    gate.invalidate();
    assert.equal(gate.isCurrent(t), false);
    assert.equal(gate.isCurrent(gate.begin()), true);
});

test('reproduces the reported race and shows the gate resolves it: select A then B, B answers first', async () => {
    const gate = createLatestGate();
    let detail = null;
    const resolvers = {};
    const fetchDetail = id => new Promise(res => { resolvers[id] = () => res({ id }); });

    async function select(id) {
        const token = gate.begin();
        const d = await fetchDetail(id);
        if (!gate.isCurrent(token)) return;     // the fix
        detail = d;
    }

    const pa = select('A');
    const pb = select('B');
    resolvers.B();
    await pb;
    resolvers.A();
    await pa;
    assert.equal(detail.id, 'B', 'selected B must end with B\'s detail, not A\'s');

    // and without the guard the same interleaving ends with the wrong building (the audit's repro)
    let unguarded = null;
    const un = id => fetchDetail(id).then(d => { unguarded = d; });
    const ua = un('A2'); const ub = un('B2');
    resolvers.B2(); await ub; resolvers.A2(); await ua;
    assert.equal(unguarded.id, 'A2');
});
