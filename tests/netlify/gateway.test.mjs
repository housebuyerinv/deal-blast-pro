import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createGateway, boundedBody } from '../../server/netlify/gateway.mjs';
import { netlifyProfile, excludedProjects, bindNetlifyOrigin } from '../../server/netlify/profile.mjs';
import { stagingOrigin } from '../../server/buyermatch/staging.js';
import { fixture, instant } from './fixture.mjs';
function setup(handlers = {}) {
  const f = fixture(); let clock = instant; const calls = [];
  const gateway = createGateway({ env: f.env, handlers, now: () => clock,
    assets: { '/index.html': Buffer.from('<html>private app</html>').toString('base64'), '/assets/app.js': Buffer.from('private script').toString('base64') } });
  const basic = 'Basic ' + Buffer.from('buyermatch:' + f.env.BM_NETLIFY_ACCESS_SECRET).toString('base64');
  const send = (path = '/', init = {}, context = f.context) => gateway(new Request(f.origin + path, init), context);
  return { ...f, gateway, send, basic, calls, expire: () => { clock += 1800000; } };
}
async function cookie(s) {
  const result = await s.send('/', { headers: { authorization: s.basic } });
  assert.equal(result.status, 200); return result.headers.get('set-cookie').split(';')[0];
}
test('conversion actions pass through private transport but still require a user session', async () => {
  const seen=[];const s=setup({buyermatch:(req,res)=>{seen.push(req.method==='GET'?req.query.action:req.body.action);res.status(200).json({ok:true});}});
  const c=await cookie(s),headers={cookie:c,authorization:'Bearer synthetic-session','Content-Type':'application/json'};
  assert.equal((await s.send('/api/buyermatch?action=conversion-report',{headers})).status,200);
  for(const action of ['conversion-record','conversion-review']) assert.equal((await s.send('/api/buyermatch',{method:'POST',headers,body:JSON.stringify({action})})).status,200);
  assert.equal((await s.send('/api/buyermatch?action=conversion-report',{headers:{cookie:c}})).status,401);
  assert.deepEqual(seen,['conversion-report','conversion-record','conversion-review']);
});
test('valid independent profile and staging origin; original projects rejected', () => {
  const f = fixture(); assert.equal(netlifyProfile(f.env, f.context, instant).origin, f.origin);
  assert.equal(stagingOrigin(f.env), f.origin);
  for (const ref of excludedProjects) assert.throws(() => netlifyProfile({ ...f.env, BM_NETLIFY_SUPABASE_REF: ref }, f.context, instant));
});
test('reject mixed hosting, billing, delivery, registration and provider credentials', () => {
  const f = fixture();
  for (const patch of [{ VERCEL_ENV: 'preview' }, { BM_LOCAL_SYNTHETIC: 'true' }, { BM_CHECKOUT_ENABLED: 'true' },
    { BM_LIVE_BILLING_ENABLED: 'true' }, { DBP_REGISTRATION_PAUSED: 'false' }, { BM_DELIVERY_MODE: 'mock' },
    { STRIPE_SECRET_KEY: 'forbidden-fixture' }, { BM_RESPONSE_ENABLED: 'true' }, { SUPABASE_URL: 'https://other.invalid' },
    { BM_NETLIFY_TEAM_SLUG: 'other' }, { BM_NETLIFY_ACCESS_SECRET: 'short' }, { BUYERMATCH_IDENTITY_KEY: 'bad' }])
    assert.throws(() => netlifyProfile({ ...f.env, ...patch }, f.context, instant));
});
test('provider account, site, deploy and unpublished context must all match', () => {
  const f = fixture();
  for (const patch of [{ account: { id: 'other' } }, { site: { ...f.context.site, id: 'other' } },
    { deploy: { ...f.context.deploy, published: true } }, { deploy: { ...f.context.deploy, context: 'production' } },
    { deploy: { ...f.context.deploy, id: 'ffffffffffffffffffffffff' } }])
    assert.throws(() => netlifyProfile(f.env, { ...f.context, ...patch }, instant));
});
test('expired, future and overlong windows fail closed', () => {
  const f = fixture();
  assert.throws(() => netlifyProfile(f.env, f.context, instant - 1));
  assert.throws(() => netlifyProfile(f.env, f.context, instant + 1800000));
  assert.throws(() => netlifyProfile({ ...f.env, BM_NETLIFY_WINDOW_END: new Date(instant + 1800001).toISOString() }, f.context, instant));
});
test('pages, auth callback and bundled assets require private access', async () => {
  const s = setup();
  for (const path of ['/', '/auth/callback', '/assets/app.js', '/app/buyermatch']) assert.equal((await s.send(path)).status, 401);
  const c = await cookie(s);
  for (const path of ['/', '/auth/callback', '/app/buyermatch']) assert.match(await (await s.send(path, { headers: { cookie: c } })).text(), /private app/);
  assert.equal(await (await s.send('/assets/app.js', { headers: { cookie: c } })).text(), 'private script');
});
test('private cookie is secure, cannot be forged, and expires with window', async () => {
  const s = setup(); const r = await s.send('/', { headers: { authorization: s.basic } });
  assert.match(r.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await s.send('/', { headers: { cookie: '__Host-bm-preview=forged' } })).status, 401);
  const c = r.headers.get('set-cookie').split(';')[0]; s.expire();
  assert.equal((await s.send('/', { headers: { cookie: c } })).status, 503);
});
test('private gate never substitutes for user session, on either API alias', async () => {
  let invoked = 0; const s = setup({ buyermatch: () => { invoked++; } }); const c = await cookie(s);
  for (const path of ['/api/buyermatch?action=plans', '/api/platform/buyermatch?action=admin-list'])
    assert.equal((await s.send(path, { headers: { cookie: c } })).status, 401);
  assert.equal(invoked, 0);
});
test('Node API adaptation preserves bearer, query, body and response headers', async () => {
  const s = setup({ buyermatch: (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer synthetic-token');
    assert.equal(req.url, '/api/buyermatch'); assert.equal(req.body.action, 'analyze');
    assert.equal(req.rawBody.toString(), '{"action":"analyze"}');
    res.setHeader('X-Adapter-Test', 'pass'); res.status(201).json({ ok: true });
  } }); const c = await cookie(s);
  const r = await s.send('/api/platform/buyermatch', { method: 'POST', headers: { cookie: c, authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json', origin: s.origin }, body: '{"action":"analyze"}' });
  assert.equal(r.status, 201); assert.equal(r.headers.get('x-adapter-test'), 'pass'); assert.deepEqual(await r.json(), { ok: true });
});
test('billing, Portal, webhook, distribution, worker and registration issuance never dispatch', async () => {
  let calls = 0; const s = setup({ buyermatch: () => { calls++; }, 'register-account': () => { calls++; } }); const c = await cookie(s);
  const headers = { cookie: c, authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' };
  for (const action of ['checkout', 'billing-portal', 'distribution', 'admin-test-dispatch', 'admin-configure', 'admin-reminder'])
    assert.equal((await s.send('/api/buyermatch', { method: 'POST', headers, body: JSON.stringify({ action }) })).status, 503);
  for (const path of ['/api/create-billing-portal-session', '/api/stripe-webhook', '/api/platform/buyermatch-worker', '/api/buyermatch-response', '/api/create-billing-portal-session.json'])
    assert.equal((await s.send(path, { method: 'POST', headers, body: '{}' })).status, 404);
  assert.equal((await s.send('/api/register-account', { method: 'POST', headers, body: '{}' })).status, 503);
  assert.equal(calls, 0);
});
test('duplicate query, wrong content type, JSON errors and cross-site calls are denied', async () => {
  const s = setup({ buyermatch: () => assert.fail('must not dispatch') }); const c = await cookie(s);
  const headers = { cookie: c, authorization: 'Bearer synthetic-token' };
  assert.equal((await s.send('/api/buyermatch?action=plans&action=save', { headers })).status, 400);
  assert.equal((await s.send('/api/buyermatch', { method: 'POST', headers, body: '{}' })).status, 400);
  assert.equal((await s.send('/api/buyermatch', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await s.send('/api/buyermatch', { headers: { ...headers, origin: 'https://unrelated.invalid' } })).status, 403);
});
test('unknown API, direct function, encoded paths, missing assets and methods do not reach SPA', async () => {
  const s = setup(); const c = await cookie(s); const headers = { cookie: c };
  for (const path of ['/api', '/api/unknown', '/.netlify/functions/buyermatch', '/missing.js']) assert.equal((await s.send(path, { headers })).status, 404);
  assert.equal((await s.send('/api/%62uyermatch', { headers })).status, 400);
  assert.equal((await s.send('/', { method: 'OPTIONS', headers })).status, 405);
  assert.equal((await s.gateway(new Request('https://other.netlify.app/'), s.context)).status, 403);
});
test('production errors and security headers do not expose handler details', async () => {
  const s = setup({ buyermatch: (_req, res) => res.status(500).json({ error: 'private database detail' }) }); const c = await cookie(s);
  const r = await s.send('/api/buyermatch?action=plans', { headers: { cookie: c, authorization: 'Bearer synthetic-token' } });
  assert.equal(r.status, 500); assert.doesNotMatch(await r.text(), /private database/);
  const page = await s.send('/', { headers: { cookie: c } });
  for (const h of ['cache-control', 'content-security-policy', 'x-frame-options', 'referrer-policy', 'x-content-type-options']) assert.ok(page.headers.get(h));
});
test('actual body byte limit and bytes are independent of content-length', async () => {
  assert.equal((await boundedBody(new Request('https://test.invalid', { method: 'POST', body: 'abc' }), 3)).toString(), 'abc');
  await assert.rejects(boundedBody(new Request('https://test.invalid', { method: 'POST', body: 'abcd' }), 3), { status: 413 });
});
test('warm-instance brute-force limiter returns 429 without handler execution', async () => {
  const s = setup(); for (let i = 0; i < 5; i++) assert.equal((await s.send('/')).status, 401);
  assert.equal((await s.send('/')).status, 429);
});
test('first-deploy origin binding uses provider context and refuses changed identity', () => {
  const f = fixture(); delete f.env.BM_APP_ORIGIN; delete f.env.PUBLIC_APP_URL;
  assert.throws(() => bindNetlifyOrigin(f.env, { ...f.context, account: { id: 'other' } }));
  assert.equal(f.env.BM_APP_ORIGIN, undefined);
  assert.equal(bindNetlifyOrigin(f.env, f.context), f.origin);
  assert.throws(() => bindNetlifyOrigin(f.env, { ...f.context, deploy: { ...f.context.deploy, id: 'ffffffffffffffffffffffff' } }));
});
