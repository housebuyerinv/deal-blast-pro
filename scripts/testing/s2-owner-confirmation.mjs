// One-shot, owner-run relay. Secrets enter via private stdin, never argv or files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const OWNER = 'housebuyerinv@gmail.com';
export const REF = 'qxhhlprentrufobpcgna';
export const CALLBACK = 'https://dbp-registration-s2-preview-housebuyerinv.vercel.app/auth/callback';
export const SENDER = 'BuyerMatch S2 <s2-verification@s2.housebuyerinvestments.com>';
export const SENDER_DOMAIN_ID = '0c6e05ac-02c7-4864-ba06-7a171f3e610c';
const subject = 'Verify your BuyerMatch S2 staging-owner account';
const origin = `https://${REF}.supabase.co`;
const cli = 'C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/supabase/dist/supabase.js';
const cliHash = '253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240';
// Exact one-owner/one-email authorization; fresh provider preflights and private
// owner key creation/entry remain required. No environment override widens scope.
export const OWNER_SEND_APPROVAL = '6389716524';
const ownerSendAuthorized = OWNER_SEND_APPROVAL === '6389716524';

export function assertOwnerRelayRequest(method, url, body) {
  const u = new URL(url);
  if (u.username || u.password || u.hash) throw Error('Relay request denied');
  if (method === 'GET' && body === undefined &&
      (u.href === `${origin}/auth/v1/admin/users?page=1&per_page=1000` ||
       (u.origin === origin && !u.search && /^\/auth\/v1\/admin\/users\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(u.pathname)))) return;
  if (method === 'POST' && u.origin === origin && u.pathname === '/auth/v1/admin/generate_link' &&
      [...u.searchParams.keys()].join(',') === 'redirect_to' && u.searchParams.get('redirect_to') === CALLBACK &&
      body && Object.keys(body).sort().join(',') === 'email,password,redirect_to,type' &&
      body.email === OWNER && body.type === 'signup' && body.redirect_to === CALLBACK &&
      typeof body.password === 'string' && body.password.length >= 16 && body.password.length <= 1024) return;
  if (method === 'POST' && u.href === 'https://api.resend.com/emails' && body &&
      Object.keys(body).sort().join(',') === 'from,subject,text,to' && body.from === SENDER &&
      Array.isArray(body.to) && body.to.length === 1 && body.to[0] === OWNER &&
      body.subject === subject && typeof body.text === 'string') return;
  throw Error('Relay request denied');
}

export async function relayOwnerConfirmation(input, io) {
  const receipt = { stage: 'preflight', accountMayExist: false, emailAccepted: false, userId: null };
  try {
    if (!input || Object.keys(input).sort().join(',') !== 'password,passwordConfirmation,resendKey' ||
        typeof input.password !== 'string' || input.password.length < 16 || input.password.length > 1024 ||
        input.password !== input.passwordConfirmation ||
        typeof input.resendKey !== 'string' || !/^re_[A-Za-z0-9_]{16,}$/.test(input.resendKey)) throw Error();
    const service = await io.getServiceKey();
    const parts = service.split('.');
    if (parts.length !== 3) throw Error();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (claims.ref !== REF || claims.role !== 'service_role') throw Error();
    // Authenticated provider read is required in addition to decoding the key.
    const users = await io.request('GET', `${origin}/auth/v1/admin/users?page=1&per_page=1000`, service);
    if (!Array.isArray(users.users) || !Number.isSafeInteger(users.total) || users.total !== users.users.length || users.users.length >= 1000 ||
        users.users.some(u => String(u.email).toLowerCase() === OWNER)) throw Error();
    receipt.stage = 'generate-signup-link';
    receipt.accountMayExist = true;
    const generated = await io.request('POST', `${origin}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(CALLBACK)}`, service,
      { type: 'signup', email: OWNER, password: input.password, redirect_to: CALLBACK });
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(generated.id) ||
        generated.email !== OWNER || generated.email_confirmed_at || generated.verification_type !== 'signup') throw Error();
    receipt.userId = generated.id;
    const link = new URL(generated.action_link);
    if (link.origin !== origin || link.pathname !== '/auth/v1/verify' || link.username || link.password || link.hash ||
        link.searchParams.get('type') !== 'signup' || !link.searchParams.get('token') ||
        link.searchParams.get('redirect_to') !== CALLBACK ||
        [...link.searchParams.keys()].some(k => !['token', 'type', 'redirect_to'].includes(k)) ||
        [...new Set(link.searchParams.keys())].length !== [...link.searchParams.keys()].length) throw Error();
    const user = await io.request('GET', `${origin}/auth/v1/admin/users/${generated.id}`, service);
    if (user.id !== generated.id || user.email !== OWNER || user.email_confirmed_at || user.is_anonymous || user.banned_until) throw Error();
    receipt.stage = 'send-owner-confirmation';
    const sent = await io.request('POST', 'https://api.resend.com/emails', input.resendKey, {
      from: SENDER,
      to: [OWNER], subject,
      text: `You authorized this isolated staging-owner setup. This does not activate billing or public registration. Open the following private verification link yourself, then sign in normally using the password you entered locally. Do not share this link or password.\n\n${link.href}\n\nIf you did not initiate this exact setup, do not open the link.`,
    }, { 'Idempotency-Key': `buyermatch-s2-owner-confirmation:${generated.id}:v1` });
    if (typeof sent.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(sent.id)) throw Error();
    receipt.emailAccepted = true;
    receipt.stage = 'awaiting-private-owner-confirmation';
    return { ok: true, ...receipt };
  } catch {
    // No raw provider response, exception, URL, token, password or key escapes.
    return { ok: false, ...receipt, requiresReview: true, retryAttempted: false };
  }
}

async function realRequest(method, url, key, body, extra = {}) {
  const u = new URL(url);
  assertOwnerRelayRequest(method, url, body);
  const response = await fetch(u, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${key}`, ...(u.origin === origin ? { apikey: key } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Error();
  const result = await response.json();
  if (method === 'GET' && u.pathname === '/auth/v1/admin/users') {
    const total = response.headers.get('x-total-count');
    result.total = total !== null && /^\d+$/.test(total) ? Number(total) : null;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result = { ok: false, stage: 'private-input', accountMayExist: false, requiresReview: true };
  try {
    if (!ownerSendAuthorized) {
      result.stage = 'owner-send-not-authorized';
      throw Error();
    }
    if (process.argv.length !== 2 || ['RESEND_API_KEY', 'STRIPE_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].some(k => process.env[k])) throw Error();
    const input = [];
    let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw Error(); input.push(chunk); }
    const parsed = JSON.parse(Buffer.concat(input).toString('utf8'));
    if (createHash('sha256').update(readFileSync(cli)).digest('hex') !== cliHash) throw Error();
    result = await relayOwnerConfirmation(parsed, {
      getServiceKey() {
        const text = execFileSync(process.execPath, [cli, 'projects', 'api-keys', '--project-ref', REF, '--output', 'json'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1048576 });
        const keys = JSON.parse(text).filter(x => x.name === 'service_role');
        if (keys.length !== 1 || !keys[0].api_key) throw Error();
        return keys[0].api_key;
      }, request: realRequest,
    });
  } catch { /* Emit only the fixed sanitized receipt. No automatic retry. */ }
  process.stdout.write(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
