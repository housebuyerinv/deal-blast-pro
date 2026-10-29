import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { billingConfig, isSoftwarePrice } from './billing-config.js';
import { checkoutStripe, isTestPlanPrice } from './checkout.js';

// This opt-in only reads catalog data. It never enables checkout or billing.
export const catalogDiagnosticEnabled = (env = process.env) =>
  env.BM_S2_CATALOG_DIAGNOSTIC === 'true' && env.VERCEL_ENV === 'preview' &&
  env.BM_ENVIRONMENT === 'staging' && env.BM_STAGING_PROJECT_REF === 'qxhhlprentrufobpcgna' &&
  env.SUPABASE_URL === 'https://qxhhlprentrufobpcgna.supabase.co';

const classes = new Set(['Error', 'StripePermissionError', 'StripeAuthenticationError',
  'StripeInvalidRequestError', 'StripeAPIError', 'StripeConnectionError', 'StripeRateLimitError']);
const codes = new Set(['permission_missing', 'resource_missing', 'api_key_expired',
  'invalid_api_key', 'parameter_unknown', 'rate_limit', 'invalid_request_error']);
const localCodes = new Map([
  ['Stripe test key required', 'test_key_missing_or_invalid'],
  ['Staging environment required', 'staging_environment_invalid'],
  ['Verified staging project required', 'staging_project_invalid'],
  ['Frontend and server project mismatch', 'staging_project_mismatch'],
  ['Explicit Vercel preview origin required', 'preview_origin_invalid'],
  ['Catalog database unavailable', 'catalog_database_unavailable'],
  ['Billing disabled', 'billing_disabled'],
  ['Catalog price mode mismatch', 'price_mode_mismatch'],
]);

export async function subscriptionCatalog(db, { env = process.env, stripeFactory = checkoutStripe,
  log = value => console.error('[BuyerMatch catalog]', JSON.stringify(value)) } = {}) {
  let stage = 'configuration_validation';
  try {
    const { live } = billingConfig(env);
    if (live) {
      const gate = await db.from('bm_live_billing_config').select('enabled,verified').eq('id', true).single();
      if (gate.error || !gate.data?.enabled || !gate.data?.verified) throw new Error('Billing disabled');
    }
    const stripe = stripeFactory(env);
    stage = 'catalog_database_read';
    const approved = await db.from('bm_plans').select('version,product,label,allowance,stripe_price_id').eq('approved', true);
    if (approved.error || !Array.isArray(approved.data)) throw new Error('Catalog database unavailable');
    const catalog = [];
    for (const plan of approved.data) {
      if (!plan.stripe_price_id) continue;
      stage = 'stripe_price_read';
      const price = await stripe.prices.retrieve(plan.stripe_price_id);
      stage = 'account_mode_validation';
      if (price.livemode !== live) throw new Error('Catalog price mode mismatch');
      stage = 'normalization_response';
      if (price.recurring && (plan.product === 'buyermatch' ? isSoftwarePrice(price, plan, live) && plan.allowance > 0 : !live && isTestPlanPrice(price)))
        catalog.push({ version: plan.version, product: plan.product, label: plan.label,
          allowance: plan.allowance, amount: price.unit_amount, currency: price.currency,
          interval: price.recurring.interval, intervalCount: price.recurring.interval_count });
    }
    return { catalog, available: true, live };
  } catch (error) {
    // Never serialize the exception, message, headers, environment or provider body.
    const candidateClass = error?.type || error?.name;
    log({ stage, errorClass: classes.has(candidateClass) ? candidateClass : 'UnknownError',
      code: localCodes.get(error?.message) || (codes.has(error?.code) ? error.code : 'unclassified'),
      status: Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : null,
      requestId: typeof error?.requestId === 'string' && /^req_[A-Za-z0-9]{1,64}$/.test(error.requestId) ? error.requestId : null,
      correlationId: randomUUID() });
    return { catalog: [], available: false, live: false };
  }
}
