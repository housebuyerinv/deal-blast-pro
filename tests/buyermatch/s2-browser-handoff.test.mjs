import test from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { verifyExistingBrowserHandoff as verify, prepareBrowserVerification, PRO_FIXTURE, EXISTING_LOGIN } from '../../scripts/testing/s2-browser-handoff.mjs';
const time = 1793140000000;
function setup(changes = {}) {
  let calls = 0;
  const user = { ...PRO_FIXTURE, role: 'authenticated', email_confirmed_at: '2026-10-20T00:00:00Z', ...changes };
  const input = { existingAppClient: { supabaseUrl: 'https://qxhhlprentrufobpcgna.supabase.co', auth: { getUser: async () => { calls++; return { data: { user } }; } } }, browserOrigin: new URL(EXISTING_LOGIN).origin, ownerConfirmedSignedIn: true, confirmedAt: time, now: () => time + 1000 };
  return { input, calls: () => calls };
}
test('same-browser server-validated fixture produces boolean-only receipt', async () => {
  const s = setup(); assert.deepEqual(await verify(s.input), { status: 'BROWSER_AUTH_VERIFIED', fixtureVerified: true }); assert.equal(s.calls(), 1);
});
test('no owner confirmation, stale confirmation or wrong origin makes zero calls', async () => {
  for (const change of [{ ownerConfirmedSignedIn: false }, { confirmedAt: time - 121000 }, { confirmedAt: time + 5000 }, { browserOrigin: 'https://example.com' }]) {
    const s = setup(); assert.equal((await verify({ ...s.input, ...change })).status, 'UNVERIFIED'); assert.equal(s.calls(), 0);
  }
});
test('wrong or unavailable backend/client fails closed without calls', async () => {
  const s = setup(); s.input.existingAppClient.supabaseUrl = 'https://production.example.com';
  assert.equal((await verify(s.input)).status, 'UNVERIFIED'); assert.equal(s.calls(), 0);
  assert.equal((await verify()).status, 'UNVERIFIED');
});
test('wrong identity, unconfirmed or anonymous fixture is rejected', async () => {
  for (const change of [{ id: 'wrong' }, { email: 'wrong@example.com' }, { role: 'service_role' }, { email_confirmed_at: null }, { is_anonymous: true }]) {
    const s = setup(change); assert.equal((await verify(s.input)).status, 'UNVERIFIED'); assert.equal(s.calls(), 1);
  }
});
test('provider errors and thrown sensitive details never leave verifier; no retry', async () => {
  for (const throws of [true, false]) {
    const s = setup(); let calls = 0;
    s.input.existingAppClient.auth.getUser = async () => { calls++; if (throws) throw Error('DUMMY_PRIVATE'); return { error: { message: 'DUMMY_PRIVATE' } }; };
    const result = await verify(s.input); assert.deepEqual(result, { status: 'UNVERIFIED', fixtureVerified: false }); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes('DUMMY_PRIVATE'));
  }
});
test('result arriving after handoff expiry is not accepted', async () => {
  const s = setup(); let calls = 0; s.input.now = () => time + (++calls === 1 ? 1000 : 121000);
  assert.equal((await verify(s.input)).status, 'UNVERIFIED');
});
test('unsupported browser adapter cannot emit application-scope evaluation even after owner confirmation', () => {
  for (const input of [undefined, {}, { ownerConfirmedSignedIn: true, confirmedAt: time }])
    assert.throws(() => prepareBrowserVerification(input), /UNSUPPORTED_BROWSER_APP_SCOPE/);
});
test('clock rollback during server validation fails closed', async () => {
  const s = setup(); let calls = 0;
  s.input.now = () => time + (++calls < 3 ? 1000 : -1000);
  assert.equal((await verify(s.input)).status, 'UNVERIFIED');
});
test('stalled provider fails closed within bounded wait; no retry', async () => {
  const s = setup(); let calls = 0;
  s.input.existingAppClient.auth.getUser = () => { calls++; return new Promise(() => {}); };
  assert.equal((await verify({ ...s.input, timeoutMs: 5 })).status, 'UNVERIFIED');
  assert.equal(calls, 1);
});
test('invalid timeout settings cannot cause a provider call', async () => {
  for (const timeoutMs of [0, -1, 10001, Infinity, 1.1]) {
    const s = setup(); assert.equal((await verify({ ...s.input, timeoutMs })).status, 'UNVERIFIED'); assert.equal(s.calls(), 0);
  }
});
