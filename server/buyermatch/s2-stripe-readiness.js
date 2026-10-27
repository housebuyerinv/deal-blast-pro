import { REQUIRED_S2_ENV, S2_RELEASE as S2 } from '../../scripts/buyermatch-s2-release.mjs';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
const unknown = () => ({
  schema: 1, status: 'UNVERIFIED',
  writePermissions: 'NOT_TESTED', permissionExclusivity: 'NOT_ESTABLISHED_BY_READS',
});
// No database writes, sessions, account-wide mutations, logging, retries or key export.
// The caller must authorize the confirmed platform owner and attest all17 settings.
export async function readS2StripePermissions(env, { fetcher = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const result = unknown();
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 ||
      env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== S2.project ||
      Object.entries(REQUIRED_S2_ENV).some(([k,v]) => env[k] !== v) ||
      ['OWNER_ID','RUN_ID','STARTED_AT','EXPIRES_AT','OPERATIONS'].some(k => env['BM_S2_BILLING_' + k]) ||
      !/^rk_test_[A-Za-z0-9]+$/.test(env.BM_STRIPE_TEST_SECRET_KEY || '')) return result;
  const signal = globalThis.AbortSignal.timeout(timeoutMs);
  const checks = [];
  async function read(path, name, valid) {
    const response = await fetcher('https://api.stripe.com' + path, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${env.BM_STRIPE_TEST_SECRET_KEY}`, 'Stripe-Version': '2026-08-26.dahlia' },
    });
    let bytes = 0;
    const chunks = [];
    if (!response.body) throw Error();
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 131072) { await response.body.cancel().catch(() => {}); throw Error(); }
      chunks.push(chunk);
    }
    const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    const status = response.status;
    const pass = status === 200 && valid(body);
    checks.push({ operation: name, httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, verified: pass });
    if (!pass) throw Error();
    return body;
  }
  try {
    const price = (id, amount) => p => p.id === id && p.livemode === false && p.active === true &&
      p.unit_amount === amount && p.currency === 'usd' && p.type === 'recurring' &&
      p.recurring?.interval === 'month' && p.recurring.interval_count === 1 && p.recurring.usage_type === 'licensed';
    await read('/v1/prices/' + S2.starter, 'starter_price_read', price(S2.starter, 5900));
    await read('/v1/prices/' + S2.pro, 'pro_price_read', price(S2.pro, 11900));
    await read('/v1/billing_portal/configurations/' + S2.portal, 'portal_configuration_read', p =>
      p.id === S2.portal && p.livemode === false && p.active === true);
    const list = p => p.object === 'list' && Array.isArray(p.data) && p.data.length <= 1 &&
      p.data.every(item => item.livemode === false);
    await read('/v1/checkout/sessions?limit=1', 'checkout_read', list);
    await read('/v1/subscriptions?limit=1', 'subscription_read', list);
    return { ...result, status: 'READ_ONLY_PERMISSION_CHECKS_PASS',
      accountBinding: 'EXACT_APPROVED_S2_RESOURCES', checks };
  } catch { return { ...result, checks }; }
}
