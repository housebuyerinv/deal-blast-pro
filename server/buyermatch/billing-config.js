import process from 'node:process';
import { URL } from 'node:url';
import plans from '../../supabase/functions/_shared/buyermatchPlans.json' with { type: 'json' };
import { stagingOrigin, PRODUCTION_SUPABASE_REF } from './staging.js';

// This gate is independent of delivery. Never enable it as part of a core rollout.
export function billingConfig(env = process.env) {
  if (env.BM_ENVIRONMENT !== 'production') return { origin: stagingOrigin(env), live: false, key: env.BM_STRIPE_TEST_SECRET_KEY };
  const origin = new URL(env.BM_APP_ORIGIN || '');
  if (env.VERCEL_ENV !== 'production' || env.BM_LIVE_BILLING_ENABLED !== 'true' ||
    env.BM_BILLING_VERIFIED !== 'true' || env.BM_CHECKOUT_ENABLED !== 'true' ||
    env.BM_PRODUCTION_PROJECT_REF !== PRODUCTION_SUPABASE_REF ||
    env.SUPABASE_URL !== `https://${PRODUCTION_SUPABASE_REF}.supabase.co` ||
    (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL !== env.SUPABASE_URL) ||
    origin.origin !== env.PUBLIC_APP_URL || origin.protocol !== 'https:' ||
    origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
    /localhost|git-codex|staging/.test(origin.hostname) ||
    !/^(sk|rk)_live_/.test(env.BM_STRIPE_LIVE_SECRET_KEY || '')) throw new Error('Live BuyerMatch billing disabled');
  return { origin: origin.origin, live: true, key: env.BM_STRIPE_LIVE_SECRET_KEY };
}

export function isPlanPrice(price, live = false) {
  return price.livemode === live && price.active === true && price.type === 'recurring' &&
    price.currency === 'usd' && Number.isSafeInteger(price.unit_amount) && price.unit_amount >= 0 &&
    price.recurring?.usage_type === 'licensed';
}

export function isLiveSoftwarePrice(price, plan) {
  // Versioned DB catalog remains authoritative; only the two approved software tiers may launch.
  const expected = plans.find((item) => item.version === plan.version);
  return Boolean(expected) && plan.product === 'buyermatch' && expected.amountCents === price.unit_amount &&
    isPlanPrice(price, true) && price.recurring.interval === 'month' && price.recurring.interval_count === 1;
}
