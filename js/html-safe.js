// Helpers that keep data out of markup: HTML escaping that is safe in text AND quoted attribute
// contexts, a URL check for href values, and a latest-request-wins gate for async selection.
// No DOM — pure functions, so the behaviour is unit-tested in node (js/html-safe.test.mjs).
//
// UMD on purpose: index.html loads it as a classic script (exposing window.HtmlSafe, one
// namespaced global that cannot shadow another), and the tests require() the same file.

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HtmlSafe = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

    // Safe for element text and for values inside "double-quoted", 'single-quoted' and unquoted
    // attributes. The previous helper set a div's textContent and read innerHTML back, which
    // escapes & < > but NOT quotes — fine between tags, an attribute-injection hole inside
    // href="…", title="…" and value="…".
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"'`]/g, ch => ENTITIES[ch]);
    }

    // Returns the normalised URL when it is http(s), else ''. An href built from data must go
    // through this before escapeHtml: escaping stops attribute breakout but not a
    // `javascript:` or `data:` URL, which is a script when clicked.
    function safeHttpUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const url = new URL(value.trim());
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
        } catch {
            return '';
        }
    }

    // Latest-wins gate for requests that can complete out of order. Take a token when a request
    // starts; apply its response only while the token is still current. begin() supersedes every
    // earlier token; invalidate() supersedes them all without starting a request (a popup or
    // dialog was closed), so a late response for something no longer on screen is dropped.
    function createLatestGate() {
        let current = 0;
        return {
            begin() { return ++current; },
            isCurrent(token) { return token === current; },
            invalidate() { current++; },
        };
    }

    return { escapeHtml, safeHttpUrl, createLatestGate };
});
