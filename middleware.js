// Password gate for the Kite landing page concept.
// On Vercel this runs as Routing Middleware in front of every request, including
// the static files in ./public. Locally, server.js runs the same function.

import { next } from '@vercel/functions';

export const config = { runtime: 'nodejs' };

const COOKIE = 'kite_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 10;            // per IP…
const FAILURE_WINDOW = 15 * 60e3;   // …per 15 minutes (best effort: per instance)

const enc = new TextEncoder();
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Sessions are signed with a key derived from the password, so changing
// the password signs everyone out.
const keys = new Map();
function hmacKey(password) {
  if (!keys.has(password)) {
    keys.set(password, crypto.subtle.importKey(
      'raw', enc.encode('kite-session:' + password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    ));
  }
  return keys.get(password);
}
async function sign(password, value) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(password), enc.encode(value)));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeSession(password) {
  const expires = String(Date.now() + SESSION_DAYS * 864e5);
  return `${expires}.${await sign(password, expires)}`;
}

async function validSession(password, token) {
  const [expires, sig] = (token || '').split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return equal(sig, await sign(password, expires));
}

// Compare HMACs rather than raw strings so timing doesn't leak the password length.
async function passwordMatches(password, attempt) {
  return equal(await sign(password, 'pw:' + attempt), await sign(password, 'pw:' + password));
}

function getCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
}

function sessionCookie(request, value, maxAge) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (new URL(request.url).protocol === 'https:') attrs.push('Secure');
  return attrs.join('; ');
}

// Only allow redirects back to a path on this site.
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '/');

/* ───────── Brute-force throttle ───────── */
const failures = new Map(); // ip -> { count, since }
const clientIp = (request) =>
  (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
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

/* ───────── Responses ───────── */
const BASE_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' };

function html(status, body, extra = {}) {
  return new Response(body, { status, headers: { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', ...extra } });
}
function redirect(location, extra = {}) {
  return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: location, ...extra } });
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loginPage(nextPath, error) {
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
      <input type="hidden" name="next" value="${esc(nextPath)}">
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

/* ───────── Gate ───────── */
export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  // Fail closed: never serve the site if the password isn't configured.
  if (!password) return new Response('SITE_PASSWORD is not configured.', { status: 503, headers: BASE_HEADERS });

  const url = new URL(request.url);

  if (url.pathname === '/login' && request.method === 'POST') {
    const body = await request.text();
    if (body.length > 4096) return new Response('Payload too large', { status: 413, headers: BASE_HEADERS });
    const form = new URLSearchParams(body);
    const nextPath = safeNext(form.get('next'));
    const ip = clientIp(request);
    if (throttled(ip)) return html(429, loginPage(nextPath, 'Too many attempts. Try again in a few minutes.'));
    if (!(await passwordMatches(password, form.get('password') || ''))) {
      recordFailure(ip);
      return html(401, loginPage(nextPath, 'That password isn’t right.'));
    }
    failures.delete(ip);
    return redirect(nextPath, { 'Set-Cookie': sessionCookie(request, await makeSession(password), SESSION_DAYS * 86400) });
  }

  if (url.pathname === '/logout') {
    return redirect('/login', { 'Set-Cookie': sessionCookie(request, '', 0) });
  }

  const authed = await validSession(password, getCookie(request, COOKIE));

  if (url.pathname === '/login') {
    const nextPath = safeNext(url.searchParams.get('next'));
    return authed ? redirect(nextPath) : html(200, loginPage(nextPath));
  }

  if (!authed) return redirect('/login?next=' + encodeURIComponent(url.pathname + url.search));

  // Let the request through to the static file, but keep it out of shared caches.
  return next({ headers: BASE_HEADERS });
}
