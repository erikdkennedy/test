// Password-gated server for the Kite landing page concept.
// Everything in ./public is served only after the visitor enters SITE_PASSWORD.
// No dependencies: run with `node --env-file=.env server.js` (Node 20.6+).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 4317;
const PASSWORD = process.env.SITE_PASSWORD;
const PUBLIC_DIR = path.join(__dirname, 'public');
const COOKIE = 'kite_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 10;            // per IP…
const FAILURE_WINDOW = 15 * 60e3;   // …per 15 minutes

if (!PASSWORD) {
  console.error('SITE_PASSWORD is not set. Copy .env.example to .env and set it.');
  process.exit(1);
}

// Sessions are signed with a key derived from the password, so changing
// the password signs everyone out.
const sessionKey = crypto.createHash('sha256').update('kite-session:' + PASSWORD).digest();
const sign = (v) => crypto.createHmac('sha256', sessionKey).update(v).digest('base64url');
const sha = (v) => crypto.createHash('sha256').update(v).digest();

function makeSession() {
  const expires = String(Date.now() + SESSION_DAYS * 864e5);
  return `${expires}.${sign(expires)}`;
}

function validSession(token) {
  const [expires, sig] = (token || '').split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const want = Buffer.from(sign(expires));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isHttps = (req) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';

function setSessionCookie(req, res, value, maxAge) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

// Only allow redirects back to a path on this site.
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '/');

/* ───────── Brute-force throttle ───────── */
const failures = new Map(); // ip -> { count, since }
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}
function throttled(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > FAILURE_WINDOW) { failures.delete(ip); return false; }
  return f.count >= MAX_FAILURES;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > FAILURE_WINDOW) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

/* ───────── Login page ───────── */
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loginPage(next, error) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Kite — Private preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz@8..60&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #F6F1EA; --paper: #FCF9F4; --ink: #1E1A16; --ink-2: #4A433C; --ink-3: #857B71; --line: rgba(30,26,22,.12); --apricot: #EE915F; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
      background: radial-gradient(120% 80% at 50% 0%, #F9E3CF 0%, var(--bg) 60%);
      color: var(--ink); font: 400 17px/1.55 Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
    }
    main { width: 100%; max-width: 400px; background: var(--paper); border: 1px solid var(--line); border-radius: 28px; padding: 40px 32px 36px; box-shadow: 0 24px 60px -30px rgba(30,26,22,.35); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
    .brand svg { width: 22px; height: 28px; }
    .brand span, h1 { font-family: "Source Serif 4", Georgia, serif; font-variation-settings: "opsz" 8; font-weight: 400; }
    .brand span { font-size: 24px; }
    h1 { font-size: 34px; line-height: 1.1; letter-spacing: -.02em; margin: 0 0 8px; }
    p { margin: 0 0 24px; color: var(--ink-2); }
    label { display: block; font-size: 14px; font-weight: 500; color: var(--ink-2); margin-bottom: 8px; }
    input { width: 100%; height: 54px; padding: 0 18px; border: 1px solid var(--line); border-radius: 14px; background: #fff; font: inherit; color: var(--ink); }
    input:focus-visible, button:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
    button { width: 100%; height: 54px; margin-top: 14px; border: 0; border-radius: 999px; background: var(--ink); color: var(--paper); font: 500 17px/1 Inter, system-ui, sans-serif; cursor: pointer; }
    button:hover { background: #2B2520; }
    .error { margin: 12px 0 0; font-size: 15px; color: #A3401A; }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <svg viewBox="0 0 28 36" aria-hidden="true">
        <path d="M14 1.5 25 12 14 24.5 3 12Z" fill="currentColor"/>
        <path d="M14 1.5v23M3 12h22" stroke="#FCF9F4" stroke-width="1.2" opacity=".55"/>
        <path d="M14 24.5c-1.5 3 2.5 4.2.6 6.6-1.3 1.7-3.4 1.6-4.4 3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>Kite</span>
    </div>
    <h1>Private preview</h1>
    <p>This concept isn’t public yet. Enter the password to take a look.</p>
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${esc(next)}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus
        ${error ? 'aria-invalid="true" aria-describedby="err"' : ''}>
      ${error ? `<p class="error" id="err" role="alert">${esc(error)}</p>` : ''}
      <button type="submit">Enter</button>
    </form>
  </main>
</body>
</html>`;
}

/* ───────── Static files ───────── */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let file;
  try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname))); }
  catch { return send(res, 400, 'Bad request'); }
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) && fs.statSync(file); }
    if (err || !st) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'private, no-store', // so a logout or password change takes effect immediately
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function readForm(req, cb) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 4096) req.destroy();
  });
  req.on('end', () => cb(new URLSearchParams(body)));
}

/* ───────── Routes ───────── */
const server = http.createServer((req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/login' && req.method === 'POST') {
    const ip = clientIp(req);
    return readForm(req, (form) => {
      const next = safeNext(form.get('next'));
      if (throttled(ip)) {
        return send(res, 429, loginPage(next, 'Too many attempts. Try again in a few minutes.'), 'text/html; charset=utf-8');
      }
      const ok = crypto.timingSafeEqual(sha(form.get('password') || ''), sha(PASSWORD));
      if (!ok) {
        recordFailure(ip);
        return send(res, 401, loginPage(next, 'That password isn’t right.'), 'text/html; charset=utf-8');
      }
      failures.delete(ip);
      setSessionCookie(req, res, makeSession(), SESSION_DAYS * 86400);
      redirect(res, next);
    });
  }

  if (url.pathname === '/logout') {
    setSessionCookie(req, res, '', 0);
    return redirect(res, '/login');
  }

  const authed = validSession(cookies(req)[COOKIE]);

  if (url.pathname === '/login') {
    const next = safeNext(url.searchParams.get('next'));
    return authed ? redirect(res, next) : send(res, 200, loginPage(next), 'text/html; charset=utf-8');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  if (!authed) return redirect(res, '/login?next=' + encodeURIComponent(url.pathname + url.search));

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => console.log(`Kite preview running at http://localhost:${PORT}`));
