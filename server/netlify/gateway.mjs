import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { netlifyProfile } from './profile.mjs';
import { previewAccess } from './access.mjs';

export const protectedHeaders = {
  'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
const readActions = new Set(['list', 'detail', 'activity', 'plans', 'access', 'documents', 'onboarding', 'admin-list', 'admin-usage', 'admin-operations']);
const writeActions = new Set(['save', 'accept', 'onboarding-accept', 'analyze', 'upload', 'title', 'update', 'message',
  'admin-preview', 'admin-import', 'admin-sync-buyer', 'admin-buyer', 'admin-detail', 'admin-document', 'admin-progress', 'admin-review', 'admin-duplicates', 'admin-duplicate-review']);
const json = (status, error, headers = {}) => new Response(JSON.stringify({ error }), { status, headers: { ...protectedHeaders, 'Content-Type': 'application/json', ...headers } });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
export async function boundedBody(request, max = 3000000) {
  if (Number(request.headers.get('content-length') || 0) > max) throw Object.assign(Error('Too large'), { status: 413 });
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw Object.assign(Error('Too large'), { status: 413 }); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
export function createGateway({ handlers, assets, env, now = Date.now }) {
  // Bounded warm-instance abuse control. Existing database quota/hourly guards
  // remain authoritative across instances; this is not a distributed WAF.
  const attempts = new Map();
  function limited(key, max) {
    const minute = Math.floor(now() / 60000);
    for (const [id, value] of attempts) if (value.minute !== minute) attempts.delete(id);
    if (!attempts.has(key) && attempts.size >= 2000) return true;
    const value = attempts.get(key) || { minute, count: 0 };
    value.count++; attempts.set(key, value); return value.count > max;
  }
  return async (request, context) => {
    let profile;
    try { profile = netlifyProfile(env, context, now()); } catch { return json(503, 'Private preview unavailable'); }
    const url = new URL(request.url);
    if (url.origin !== profile.origin) return json(403, 'Origin unavailable');
    const fingerprint = createHash('sha256').update(String(context.ip || 'unknown')).digest('hex');
    if (limited(`request:${fingerprint}`, 240)) return json(429, 'Request limit reached', { 'Retry-After': '60' });
    const access = previewAccess(request, env, profile, now());
    if (!access.allowed) {
      if (limited(`denied:${fingerprint}`, 5)) return json(429, 'Request limit reached', { 'Retry-After': '60' });
      return json(401, 'Private preview access required', { 'WWW-Authenticate': 'Basic realm="BuyerMatch private preview", charset="UTF-8"' });
    }
    const headers = { ...protectedHeaders, 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${profile.supabase} wss://${profile.project}.supabase.co; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'` };
    if (access.cookie) headers['Set-Cookie'] = access.cookie;
    try {
      if (request.headers.has('origin') && request.headers.get('origin') !== profile.origin) return json(403, 'Cross-origin request denied');
      if (request.headers.get('sec-fetch-site') === 'cross-site') return json(403, 'Cross-site request denied');
      const path = url.pathname;
      if (/%|\\|\/\//.test(path)) return json(400, 'Invalid route');
      if (/^\/api(?:\/|\.|$)/.test(path) || path.startsWith('/.netlify/')) {
        // Function's default route is intentionally not an alternative dispatcher.
        if (path.startsWith('/.netlify/')) return json(404, 'Not found');
        const canonical = path.replace(/^\/api\/platform\//, '/api/');
        const name = canonical.slice(5);
        if (!Object.hasOwn(handlers, name)) return json(404, 'Not found');
        if (!['GET', 'POST'].includes(request.method)) return json(405, 'Method not allowed');
        const query = Object.create(null);
        for (const [key, value] of url.searchParams) { if (Object.hasOwn(query, key)) return json(400, 'Duplicate parameter'); query[key] = value; }
        const raw = await boundedBody(request);
        let body;
        if (request.method === 'POST') {
          if (url.search || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json(400, 'JSON body required');
          try { body = JSON.parse(raw.toString('utf8')); } catch { return json(400, 'Invalid JSON'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, 'Invalid body');
        } else if (raw.length) return json(400, 'Body not allowed');
        const input = request.method === 'POST' ? body : query;
        if (name === 'buyermatch' && !(request.method === 'GET' ? readActions : writeActions).has(input.action || 'list')) return json(503, 'Operation disabled in private preview');
        if (name === 'register-account' && request.method !== 'GET') return json(503, 'Registration paused');
        if (name === 'account-status' && request.method !== 'GET') return json(405, 'GET required');
        if (name === 'buyermatch-buyer' && (!['POST'].includes(request.method) || input.action === 'create')) return json(503, 'Buyer registration paused');
        // Gate cookie never substitutes for a Supabase session.
        if (name !== 'register-account' && !/^Bearer\s+\S+$/i.test(request.headers.get('authorization') || '')) return json(401, 'Sign in required');
        const req = { method: request.method, url: canonical + url.search, query, body,
          rawBody: raw, headers: Object.fromEntries(request.headers) };
        let status = 200, output = '', ended = false;
        const res = { status(code) { if (!Number.isInteger(code) || code < 100 || code > 599) throw Error('Invalid status'); status = code; return res; },
          setHeader(key, value) { headers[key] = String(value); return res; },
          json(value) { headers['Content-Type'] = 'application/json'; output = JSON.stringify(value); ended = true; return res; },
          send(value) { output = value; ended = true; return res; }, end(value = '') { output = value; ended = true; return res; } };
        await handlers[name](req, res);
        if (!ended) return json(503, 'Operation unavailable');
        if (status >= 500) return json(status, 'Operation unavailable');
        return new Response(output, { status, headers: { ...headers, ...protectedHeaders } });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(405, 'Method not allowed');
      const item = assets[path] || (!path.split('/').at(-1).includes('.') ? assets['/index.html'] : null);
      if (!item) return json(404, 'Not found');
      const extension = (assets[path] ? path : '/index.html').match(/\.[a-z0-9]+$/)?.[0];
      return new Response(request.method === 'HEAD' ? null : Buffer.from(item, 'base64'), { headers: { ...headers, 'Content-Type': mime[extension] || 'application/octet-stream' } });
    } catch (error) { return json(error?.status === 413 ? 413 : 503, error?.status === 413 ? 'File too large' : 'Operation unavailable'); }
  };
}
