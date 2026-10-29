import test from 'node:test';
import assert from 'node:assert/strict';
import { readS2StripePermissions } from '../../server/buyermatch/s2-stripe-readiness.js';
import { REQUIRED_S2_ENV, S2_RELEASE as S2 } from '../../scripts/buyermatch-s2-release.mjs';
import { setTimeout, clearTimeout } from 'node:timers';
const secret = 'rk_test_SYNTHETICPRIVATE';
const environment = () => ({ ...REQUIRED_S2_ENV, VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: S2.project, BM_STRIPE_TEST_SECRET_KEY: secret });
const json = (v, status = 200) => new globalThis.Response(JSON.stringify(v), { status });
const price = (id, amount) => ({ id, active: true, livemode: false, type: 'recurring', unit_amount: amount, currency: 'usd', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } });
const bodies = () => [price(S2.starter, 5900), price(S2.pro, 11900), { id: S2.portal, active: true, livemode: false }, { object: 'list', data: [{ livemode: false, private: secret }] }, { object: 'list', data: [] }];
test('five fixed TEST reads pass without exposing credentials or provider data', async () => {
  const data = bodies(), calls = [];
  const r = await readS2StripePermissions(environment(), { fetcher: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options.headers).sort(), ['Authorization', 'Stripe-Version']);
    assert.equal(options.headers.Authorization, `Bearer ${secret}`); assert.equal(options.headers['Stripe-Version'], '2026-08-26.dahlia');
    return json(data.shift());
  } });
  assert.deepEqual(calls, [ '/v1/prices/' + S2.starter, '/v1/prices/' + S2.pro, '/v1/billing_portal/configurations/' + S2.portal, '/v1/checkout/sessions?limit=1', '/v1/subscriptions?limit=1' ].map(p => 'https://api.stripe.com' + p));
  assert.equal(r.status, 'READ_ONLY_PERMISSION_CHECKS_PASS'); assert.equal(r.checks.length, 5);
  assert.equal(r.writePermissions, 'NOT_TESTED'); assert.equal(r.permissionExclusivity, 'NOT_ESTABLISHED_BY_READS');
  assert.ok(!JSON.stringify(r).includes(secret)); assert.ok(!JSON.stringify(r).includes('private'));
});
test('every missing or mismatched paused setting prevents all provider requests', async () => {
  for (const key of Object.keys(REQUIRED_S2_ENV)) for (const value of [undefined, 'wrong']) {
    const r = await readS2StripePermissions({ ...environment(), [key]: value }, { fetcher: () => assert.fail('Unexpected request') });
    assert.equal(r.status, 'UNVERIFIED');
  }
});
test('Production, wrong project, standard/LIVE/missing keys and active window bindings fail closed', async () => {
  for (const patch of [{ VERCEL_ENV: 'production' }, { VERCEL_PROJECT_ID: 'other' },
    ...[undefined, 'sk_test_SYNTHETIC', 'rk_live_SYNTHETIC', 'rk_test_bad\n'].map(k => ({ BM_STRIPE_TEST_SECRET_KEY: k })),
    ...['OWNER_ID','RUN_ID','STARTED_AT','EXPIRES_AT','OPERATIONS'].map(k => ({ ['BM_S2_BILLING_' + k]: 'set' }))]) {
    assert.equal((await readS2StripePermissions({ ...environment(), ...patch }, { fetcher: () => assert.fail() })).status, 'UNVERIFIED');
  }
});
test('permission denial stops immediately with no retry or raw error disclosure', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const r = await readS2StripePermissions(environment(), { fetcher: async () => { calls++; return json({ error: { message: secret } }, status); } });
    assert.equal(calls, 1); assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.checks[0].httpStatus, status); assert.ok(!JSON.stringify(r).includes(secret));
  }
});
test('wrong TEST resource, LIVE response, incorrect price or portal stops at exact failed operation', async () => {
  for (const [index, change] of [[0, p => p.id = 'wrong'], [1, p => p.livemode = true], [1, p => p.unit_amount = 12000], [2, p => p.active = false], [3, p => p.data[0].livemode = true]]) {
    const data = bodies(); change(data[index]); let calls = 0;
    const r = await readS2StripePermissions(environment(), { fetcher: async () => json(data[calls++]) });
    assert.equal(r.status, 'UNVERIFIED'); assert.equal(calls, index + 1); assert.equal(r.checks.at(-1).verified, false);
  }
});
test('malformed or oversized bodies and exceptions remain UNKNOWN without disclosure', async () => {
  for (const fetcher of [async () => new globalThis.Response('not json'), async () => new globalThis.Response('x'.repeat(131073)), async () => { throw Error(secret); }]) {
    const r = await readS2StripePermissions(environment(), { fetcher });
    assert.equal(r.status, 'UNVERIFIED'); assert.ok(!JSON.stringify(r).includes(secret));
  }
});
test('native abort deadline terminates a stalled synthetic fetch without retry', async () => {
  let calls = 0;
  const r = await readS2StripePermissions(environment(), { timeoutMs: 20, fetcher: async (_url, { signal }) => {
    calls++; return new Promise((_resolve, reject) => { const keepalive = setTimeout(() => reject(Error()), 100); signal.addEventListener('abort', () => { clearTimeout(keepalive); reject(Error(secret)); }, { once: true }); });
  } });
  assert.equal(calls, 1); assert.equal(r.status, 'UNVERIFIED'); assert.ok(!JSON.stringify(r).includes(secret));
});
