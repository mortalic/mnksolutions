const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, 'htdocs');
const PORT = process.env.PORT || 3000;

// Last-resort guard: a static file server should never die on a single bad
// request. Log and keep serving rather than crash-looping (which surfaces as
// sustained 503s behind Gandi's proxy).
process.on('uncaughtException', (err) => {
  console.error('uncaughtException (kept alive):', (err && err.stack) || err);
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

function send(res, status, body, headers = {}) {
  const base = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
  if (status === 200) base['Cache-Control'] = 'public, max-age=300';
  res.writeHead(status, { ...base, ...headers });
  res.end(body);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch {
    // Malformed percent-encoding (e.g. "/%", "/%c0%af") makes decodeURIComponent
    // throw. Answer 400 instead of letting the error crash the whole process.
    return send(res, 400, 'Bad Request');
  }
  let filePath = path.join(ROOT, pathname);

  if (!(filePath === ROOT || filePath.startsWith(ROOT + path.sep))) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err) return send(res, 404, 'Not Found');
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (err, data) => {
      if (err) return send(res, 404, 'Not Found');
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      send(res, 200, req.method === 'HEAD' ? undefined : data, {
        'Content-Type': type,
        'Content-Length': data.length,
      });
    });
  });
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} on port ${PORT}`);
});
