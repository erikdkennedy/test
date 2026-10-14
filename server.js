// Local dev server: runs middleware.js (the same password gate Vercel runs)
// in front of the static files in ./public.
// Run with `npm run dev`, which loads SITE_PASSWORD from .env.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import middleware from './middleware.js';

const PORT = Number(process.env.PORT) || 4317;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

if (!process.env.SITE_PASSWORD) {
  console.error('SITE_PASSWORD is not set. Copy .env.example to .env and set it.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function toRequest(req) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
    method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half',
  });
}

async function sendResponse(res, response, method) {
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  headers['set-cookie'] = response.headers.getSetCookie();
  res.writeHead(response.status, headers);
  if (method === 'HEAD' || !response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

function serveStatic(req, res, pathname, extraHeaders) {
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, extraHeaders).end('Not found'); return; }
  res.writeHead(200, {
    ...extraHeaders,
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const response = await middleware(toRequest(req));
    if (response.headers.get('x-middleware-next') !== '1') return sendResponse(res, response, req.method);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Method not allowed'); return; }
    const extra = {};
    response.headers.forEach((v, k) => { if (k !== 'x-middleware-next') extra[k] = v; });
    serveStatic(req, res, new URL(req.url, 'http://localhost').pathname, extra);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end('Server error');
  }
}).listen(PORT, () => console.log(`Kite preview running at http://localhost:${PORT}`));
