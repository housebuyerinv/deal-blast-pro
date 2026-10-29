import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
const cookieName = '__Host-bm-preview';
function equal(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function previewAccess(request, env, profile, now = Date.now()) {
  const value = `${env.BM_NETLIFY_SITE_ID}:${profile.origin}:${profile.end}`;
  const signed = createHmac('sha256', env.BM_NETLIFY_ACCESS_SECRET).update(value).digest('hex');
  const cookies = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookieName + '='));
  if (cookies.length === 1 && equal(cookies[0].slice(cookieName.length + 1), signed)) return { allowed: true };
  const auth = request.headers.get('authorization') || '';
  if (request.method !== 'GET' || !auth.startsWith('Basic ') || auth.length > 1024) return { allowed: false };
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  if (!equal(decoded, `buyermatch:${env.BM_NETLIFY_ACCESS_SECRET}`)) return { allowed: false };
  return { allowed: true, cookie: `${cookieName}=${signed}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((profile.end - now) / 1000))}` };
}
