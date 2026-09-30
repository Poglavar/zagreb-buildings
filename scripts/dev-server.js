/**
 * dev-server.js — Local static server for the explorer, for development only.
 *
 * Serves this directory with no caching (a stale asset is indistinguishable from a broken
 * change) and answers /<cadastre id> with index.html, the same deep-link fallback nginx gives the
 * public site, so a refresh on an open building works. It serves files only — the API is a
 * separate service (default http://localhost:3001, or ?apiBase=…).
 *
 * Usage:
 *   node scripts/dev-server.js --port 8099        (npm start)
 *   node scripts/dev-server.js --help
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.geojson': 'application/geo+json',
};

// Pure: what a request path should be answered with. { file } is an absolute path under ROOT,
// { notFound: true } is a 404. Anything that would leave ROOT, or name a dotfile (.env), is a 404.
function resolveRequest(urlPath, root = ROOT) {
    let decoded;
    try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch { return { notFound: true }; }
    if (decoded.includes('\0')) return { notFound: true };
    if (/^\/\d+\/?$/.test(decoded)) return { file: path.join(root, 'index.html') };        // /<cadastre id>
    const rel = decoded === '/' ? '/index.html' : decoded;
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return { notFound: true };
    if (path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) return { notFound: true };
    return { file };
}

function handler(req, res) {
    const hit = resolveRequest(req.url);
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
        res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
        res.end(body);
    };
    if (hit.notFound) return send(404, 'Not found');
    fs.stat(hit.file, (err, st) => {
        if (err || !st.isFile()) return send(404, 'Not found');
        fs.readFile(hit.file, (readErr, data) => {
            if (readErr) return send(500, 'Read error');
            send(200, data, TYPES[path.extname(hit.file).toLowerCase()] || 'application/octet-stream');
        });
    });
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const at = args.indexOf('--port');
    if (args.includes('--help') || at === -1) {
        console.log('Usage: node scripts/dev-server.js --port N\n\nServes this directory with no caching; /<cadastre id> falls back to index.html.');
        process.exit(0);
    }
    const port = Number(args[at + 1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error(`--port must be 1-65535, got '${args[at + 1]}'`);
        process.exit(2);
    }
    http.createServer(handler).listen(port, '127.0.0.1', () => {
        console.log(`[${new Date().toISOString()}] explorer on http://localhost:${port}/  (API: ?apiBase=… or localhost:3001)`);
    });
}

module.exports = { resolveRequest, handler };
