import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const bundle = await build({ entryPoints: ['src/lib/s2DenialVerification.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const module = { exports: {} }; new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { runS2Denials, validDenialPlan } = module.exports;
const UID = '368f5f93-acf7-4cc3-9805-a4c0817506c3', now = 1793140000000;
const origin = 'https://dbp-registration-s2-synthetic-housebuyerinv.vercel.app', backend = 'https://qxhhlprentrufobpcgna.supabase.co';
const json = (status, body) => new globalThis.Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture() {
  const plan = { source: 'a'.repeat(40), deploymentId: 'dpl_SyntheticOnly', runId: '5bab24c5-e50c-4854-a051-610f4334943b', expiresAt: now + 60000 };
  const requests = [], progress = [], controller = new globalThis.AbortController(); let authCalls = 0;
  const input = { plan, origin, backend, confirmed: true, signal: controller.signal, currentUser: () => UID, isCurrent: () => true, now: () => now,
    client: { auth: {
      getUser: async function () { assert.equal(this, input.client.auth); authCalls++; return { data: { user: { id: UID, email: 'dbp-s2-pro-1792721835370@example.com', role: 'authenticated', email_confirmed_at: '2026-10-20T00:00:00Z' } } }; },
      getSession: async () => ({ data: { session: { user: { id: UID }, access_token: 'DUMMY_PRIVATE_BEARER' } } }),
      signOut: () => assert.fail('No auth mutation'), refreshSession: () => assert.fail('No explicit refresh'),
    } }, progress: checks => progress.push(checks) };
  const status = () => ({ schema: 1, source: plan.source, deploymentId: plan.deploymentId, attestationRunId: plan.runId,
    projectId: 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl', pausedSettingsVerified: true, registrationPaused: true,
    checkoutEnabled: false, liveBillingDisabled: true, deliveryDisabled: true,
    ...Object.fromEntries(['OWNER_ID', 'RUN_ID', 'STARTED_AT', 'EXPIRES_AT', 'OPERATIONS'].map(k => ['BM_S2_BILLING_' + k, ''])) });
  const respond = async (path, options) => {
    if (path.includes('billing-status')) return options.headers.Authorization ? json(200, status()) : json(401, { error: 'Sign in required' });
    if (path.startsWith('/api/platform/')) return json(403, { error: 'Owner access required' });
    if (path === '/api/create-billing-portal-session') return json(503, { ok: false, code: 's2_legacy_portal_disabled' });
    if (path.startsWith('/api/property-intelligence/')) return json(503, { ok: false, code: 's2_legacy_checkout_disabled' });
    return json(503, { error: 'S2 billing test window is closed or this operation is not approved.' });
  };
  input.fetcher = async (path, options) => { requests.push({ path, options }); return respond(path, options); };
  return { input, requests, progress, controller, status, respond, authCalls: () => authCalls };
}
test('complete native flow uses only fixed same-origin routes, correct methods and sanitized receipts', async () => {
  const f = fixture(), result = await runS2Denials(f.input);
  assert.equal(result.status, 'PASS'); assert.equal(f.authCalls(), 1); assert.equal(f.requests.length, 15);
  assert.deepEqual(result.binding, { ...f.input.plan, origin, startedAt: now, completedAt: now });
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 5);
  for (const { path, options } of f.requests) {
    assert.ok(path.startsWith('/api/') && !path.includes('://')); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'same-origin');
    if (options.headers.Authorization) assert.equal(options.headers.Authorization, 'Bearer DUMMY_PRIVATE_BEARER');
  }
  assert.equal(f.requests[0].options.headers.Authorization, undefined);
  assert.equal(result.checks.every(check => check.verified), true);
  assert.equal(JSON.stringify({ result, progress: f.progress }).includes('DUMMY'), false);
});
test('unknown plan fields are not read or projected into evidence', async () => {
  const f = fixture(); Object.defineProperty(f.input.plan, 'secret', { enumerable: true, get() { throw Error('Unknown field access'); } });
  const result = await runS2Denials(f.input); assert.equal(result.status, 'PASS'); assert.equal(Object.hasOwn(result.binding, 'secret'), false);
});
test('invalid approval, origin, fallback, source, run or deadline causes zero Auth/HTTP calls', async () => {
  const changes = [ { confirmed: false }, { origin: 'https://production.example' }, { backend: '' }, { origin: 'https://dbp-registration-s2-preview-housebuyerinv.vercel.app' }, { origin: 'https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app' } ];
  for (const change of changes) { const f = fixture(); Object.assign(f.input, change); assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED'); assert.equal(f.authCalls(), 0); assert.equal(f.requests.length, 0); }
  for (const change of [{ source: 'bad' }, { deploymentId: 'dpl_nr5RVunmUGdryPUtWkRkVdsA96pT' }, { runId: 'bad' }, { expiresAt: now - 1 }, { expiresAt: now + 1800001 }]) {
    const f = fixture(); Object.assign(f.input.plan, change); assert.equal(validDenialPlan(f.input.plan, origin, backend, now), false); assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED'); assert.equal(f.requests.length, 0); assert.equal(f.authCalls(), 0);
  }
});
test('wrong fresh identity or missing/mismatched local session prevents all HTTP', async () => {
  for (const change of ['identity', 'session', 'token']) {
    const f = fixture(); if (change === 'identity') f.input.client.auth.getUser = async () => ({ data: { user: { id: 'wrong' } } });
    else f.input.client.auth.getSession = async () => ({ data: { session: { user: { id: change === 'session' ? 'wrong' : UID } } } });
    assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED'); assert.equal(f.requests.length, 0);
  }
});
for (const key of ['source', 'deploymentId', 'attestationRunId', 'projectId', 'schema', 'pausedSettingsVerified', 'registrationPaused', 'checkoutEnabled', 'liveBillingDisabled', 'deliveryDisabled', 'BM_S2_BILLING_RUN_ID', 'BM_S2_BILLING_OPERATIONS'])
  test('incorrect runtime gate fails before negative POST: ' + key, async () => {
    const f = fixture(); f.input.fetcher = async (path, options) => { f.requests.push({ path, options });
      if (path.includes('billing-status') && options.headers.Authorization) return json(200, { ...f.status(), [key]: 'UNEXPECTED' }); return f.respond(path, options); };
    const result = await runS2Denials(f.input); assert.equal(result.status, 'UNVERIFIED'); assert.equal(result.binding, undefined); assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 0);
  });
test('pause drift between negative requests stops at the next guard', async () => {
  const f = fixture(); let posts = 0;
  f.input.fetcher = async (path, options) => { if (options.method === 'POST') posts++; if (posts === 2 && path.includes('billing-status')) return json(200, { ...f.status(), pausedSettingsVerified: false }); return f.respond(path, options); };
  assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED'); assert.equal(posts, 2);
});
for (const failAt of [0, 1, 2, 3, 4]) test('unexpected successful POST stops immediately and never reflects private response: index ' + failAt, async () => {
  const f = fixture(); let posts = 0;
  f.input.fetcher = async (path, options) => { if (options.method === 'POST' && posts++ === failAt) return json(200, { url: 'DUMMY_PRIVATE_SESSION_URL', secret: 'DUMMY_PRIVATE' }); return f.respond(path, options); };
  const result = await runS2Denials(f.input); assert.equal(result.status, 'UNVERIFIED'); assert.equal(posts, failAt + 1); assert.equal(result.checks.at(-1).httpStatus, 200); assert.ok(!JSON.stringify(result).includes('DUMMY'));
});
test('agreement prerequisite denial is distinguished and accepted only for BuyerMatch checkout', async () => {
  const f = fixture(); f.input.fetcher = async (path, options) => path === '/api/buyermatch' && JSON.parse(options.body).action === 'checkout' ? json(409, { error: 'Review and sign the current platform terms and privacy policy before checkout.' }) : f.respond(path, options);
  assert.equal((await runS2Denials(f.input)).status, 'PASS');
});
for (const malformed of [new globalThis.Response('not json'), new globalThis.Response('x'.repeat(65537)), json(503, { code: 's2_legacy_portal_disabled', url: 'DUMMY_PRIVATE' })])
  test('malformed, oversized or extra-field responses are never accepted', async () => {
    const f = fixture(); f.input.fetcher = async () => malformed;
    const result = await runS2Denials(f.input); assert.equal(result.status, 'UNVERIFIED'); assert.ok(!JSON.stringify(result).includes('DUMMY'));
  });
test('timeout is UNKNOWN, not denial; no retry', async () => {
  const f = fixture(); let calls = 0; f.input.timeoutMs = 5; f.input.fetcher = () => { calls++; return new Promise(() => {}); };
  const result = await runS2Denials(f.input); assert.equal(result.status, 'UNVERIFIED'); assert.equal(result.checks.at(-1).httpStatus, null); assert.equal(calls, 1);
});
test('pre-abort and account change stop without negative requests', async () => {
  const f = fixture(); f.controller.abort(); assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED'); assert.equal(f.authCalls(), 0);
  const g = fixture(); let current = true; g.input.isCurrent = () => current; g.input.fetcher = async (path, options) => { current = false; return g.respond(path, options); };
  assert.equal((await runS2Denials(g.input)).status, 'UNVERIFIED');
});
test('deadline expiry and clock rollback during a response cannot produce PASS', async () => {
  for (const delta of [-1, 60001]) {
    const f = fixture(); let time = now; f.input.now = () => time;
    f.input.fetcher = async (path, options) => { time = now + delta; return f.respond(path, options); };
    assert.equal((await runS2Denials(f.input)).status, 'UNVERIFIED');
  }
});
