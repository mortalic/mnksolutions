'use strict';

// Spawns the real server.js as a child process on a throwaway port and drives
// it over HTTP. The point of these tests is regression cover for the outage of
// 2026-08-04: a request with malformed percent-encoding used to throw
// URIError inside the request handler and crash the whole Node process, which
// surfaced as sustained 503s behind Gandi's proxy. The critical assertion is
// that a malformed URL returns 400 AND the server is still alive afterward.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const PORT = 34871; // unlikely-to-collide test port

let child;

function get(rawPath) {
  return new Promise((resolve, reject) => {
    // Use the raw path verbatim (do not let http re-encode it) so malformed
    // sequences reach the server exactly as a scanner would send them.
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method: 'GET', path: rawPath },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test.before(async () => {
  child = spawn('node', [SERVER], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for the "Serving ... on port" line so requests don't race startup.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 10000);
    child.stdout.on('data', (buf) => {
      if (buf.toString().includes('on port')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
  });
});

test.after(() => {
  if (child) child.kill('SIGKILL');
});

test('serves an existing static file with 200', async () => {
  const res = await get('/privacy.html');
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /Privacy Policy/i);
});

test('malformed percent-encoding returns 400 and does NOT crash the server', async () => {
  // These all throw inside decodeURIComponent.
  for (const bad of ['/%', '/%c0%af', '/%zz', '/%e0%a4%a']) {
    const res = await get(bad);
    assert.strictEqual(res.status, 400, `expected 400 for ${bad}, got ${res.status}`);
  }
  // The whole point: after the bad requests, the process is still serving.
  const still = await get('/privacy.html');
  assert.strictEqual(still.status, 200, 'server should still be alive after malformed requests');
});

test('unknown path returns 404', async () => {
  const res = await get('/does-not-exist.html');
  assert.strictEqual(res.status, 404);
});

test('path traversal is refused (403/404), never escapes the web root', async () => {
  const res = await get('/../server.js');
  assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  assert.doesNotMatch(res.body, /createServer/); // never leak server.js contents
});

test('non-GET/HEAD method returns 405', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method: 'POST', path: '/' },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => resolve({ status: r.statusCode }));
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.strictEqual(res.status, 405);
});
