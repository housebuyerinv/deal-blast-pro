import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPrivateRuntime } from '../../scripts/testing/s2-payment-free-readback.mjs';
import { REQUIRED_S2_ENV } from '../../scripts/buyermatch-s2-release.mjs';
const secret = 'rk_test_SYNTHETIC_NOT_A_CREDENTIAL';
test('missing local Secret stays unavailable, never reported missing from provider', async () => {
  const r = await inspectPrivateRuntime(REQUIRED_S2_ENV, { fetcher: () => assert.fail('No key: no request'), readReceiver: async () => true });
  assert.equal(r.credential.availability, 'NOT_AVAILABLE_TO_CHILD');
  assert.equal(r.stripe, 'NOT_RUN');
  assert.equal(r.receiverPaused, true);
});
test('exact synthetic TEST Starter GET and strict redacted output', async () => {
  let calls = 0;
  const r = await inspectPrivateRuntime({ ...REQUIRED_S2_ENV, BM_STRIPE_TEST_SECRET_KEY: secret }, {
    fetcher: async (url, options) => { calls++; assert.equal(url, 'https://api.stripe.com/v1/prices/price_1UTRdfL6efr9LhPIchNeE7u1'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${secret}`); return { ok: true, status: 200, json: async () => ({ id: 'price_1UTRdfL6efr9LhPIchNeE7u1', livemode: false, unit_amount: 5900, currency: 'usd', recurring: { interval: 'month' }, privateField: secret }) }; },
    readReceiver: async () => true,
  });
  assert.equal(calls, 1); assert.equal(r.stripe.exactTestStarter, true); assert.ok(!JSON.stringify(r).includes(secret));
});
test('wrong backend prevents both provider requests', async () => {
  const r = await inspectPrivateRuntime({ ...REQUIRED_S2_ENV, SUPABASE_URL: 'https://wrong.invalid', BM_STRIPE_TEST_SECRET_KEY: secret }, { fetcher: () => assert.fail(), readReceiver: () => assert.fail() });
  assert.equal(r.stripe, 'NOT_RUN'); assert.equal(r.receiverPaused, 'UNKNOWN');
});
test('native/provider failures remain UNKNOWN without exception disclosure', async () => {
  const r = await inspectPrivateRuntime({ ...REQUIRED_S2_ENV, BM_STRIPE_TEST_SECRET_KEY: secret }, { fetcher: async () => { throw Error(secret); }, readReceiver: async () => { throw Error(secret); } });
  assert.equal(r.stripe, 'READ_FAILED_UNKNOWN'); assert.equal(r.receiverPaused, 'UNKNOWN'); assert.ok(!JSON.stringify(r).includes(secret));
});
test('standard or LIVE authority is never used for runtime read', async () => {
  for (const key of ['sk_test_SYNTHETIC', 'rk_live_SYNTHETIC']) {
    const r = await inspectPrivateRuntime({ ...REQUIRED_S2_ENV, BM_STRIPE_TEST_SECRET_KEY: key }, { fetcher: () => assert.fail(), readReceiver: async () => true });
    assert.equal(r.stripe, 'NOT_RUN'); assert.equal(r.credential.restrictedTestFormat, false);
  }
});
