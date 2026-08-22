import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { canCreateProTrialCheckout } from '../src/server/proTrialCheckoutAuthorization.ts'
import { couponAppliesOnlyToProduct, stripeCouponRetrievalPath } from '../src/server/stripePromotionVerification.ts'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const qaAccount = {
  authenticatedEmail: 'housebuyerinv+dbp-trialcheckoutqa@gmail.com',
  authenticatedWorkspaceId: '09a8234e-3eaa-46e9-8aed-eb6f6b62ce94',
}

test('Pro trial Checkout QA bypass is restricted to the dedicated Preview account', () => {
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: false, qaBypassEnabled: true, vercelEnvironment: 'production', ...qaAccount }), false)
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: false, qaBypassEnabled: false, vercelEnvironment: 'preview', ...qaAccount }), false)
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: false, qaBypassEnabled: true, vercelEnvironment: 'preview', ...qaAccount, authenticatedEmail: 'other@example.com' }), false)
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: false, qaBypassEnabled: true, vercelEnvironment: 'preview', ...qaAccount, authenticatedWorkspaceId: 'wrong-workspace' }), false)
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: false, qaBypassEnabled: true, vercelEnvironment: 'preview', ...qaAccount }), true)
  assert.equal(canCreateProTrialCheckout({ publicGateEnabled: true, qaBypassEnabled: false, vercelEnvironment: 'production', authenticatedEmail: '', authenticatedWorkspaceId: '' }), true)
})

test('Pro trial Checkout is authenticated, monthly, durable, idempotent, and promotion-controlled', async () => {
  const actions = await read('src/server/platformActions.ts')
  assert.match(actions, /action==='pro-trial-checkout'/)
  assert.match(actions, /STRIPE_PRO_MONTHLY_PRICE_ID/)
  assert.match(actions, /PRO_TRIAL_LAUNCH20_VERIFIED/)
  assert.match(actions, /trial_period_days/)
  assert.match(actions, /payment_method_collection:'always'/)
  assert.match(actions, /missing_payment_method\]':'cancel'/)
  assert.match(actions, /discounts\[0\]\[promotion_code\]/)
  assert.match(actions, /Idempotency-Key.*pro-trial-/)
  assert.match(actions, /trial_consumed_at/)
  assert.match(actions, /trial_checkout_session_id/)
  assert.match(actions, /pending\?\.status==='open'/)
  assert.match(actions, /trial_already_consumed/)
  assert.match(actions, /stripe_subscription_exists/)
  assert.doesNotMatch(actions, /sk_live_/)
})

test('LAUNCH10 annual and LAUNCH20 monthly promotions remain separately scoped', async () => {
  const pricing = await read('src/lib/planPricing.ts')
  const promotion = await read('src/lib/promotionConfig.ts')
  const actions = await read('src/server/platformActions.ts')
  assert.match(pricing, /code: 'LAUNCH10'/)
  assert.match(pricing, /billing !== 'annual'/)
  assert.match(promotion, /code: 'LAUNCH20'/)
  assert.match(promotion, /percentOff: 20/)
  assert.match(promotion, /duration: 'once'/)
  assert.match(promotion, /expiresOn: '2026-12-31'/)
  assert.match(actions, /candidate\?\.max_redemptions===PRO_TRIAL_PROMOTION\.maximumRedemptions/)
  assert.match(actions, /restrictions\?\.first_time_transaction===PRO_TRIAL_PROMOTION\.firstTimeTransactionOnly/)
  assert.match(actions, /couponAppliesOnlyToProduct\(coupon,clean\(price\?\.product\)\)/)
  assert.match(promotion, /billingInterval: 'monthly'/)
  assert.match(promotion, /trialDays: 14/)
})

test('LAUNCH20 coupon retrieval expands and strictly verifies product applicability', () => {
  assert.equal(stripeCouponRetrievalPath('coupon/example'), 'coupons/coupon%2Fexample?expand[]=applies_to')
  assert.equal(couponAppliesOnlyToProduct({ applies_to: { products: ['prod_pro'] } }, 'prod_pro'), true)
  assert.equal(couponAppliesOnlyToProduct({ applies_to: { products: ['prod_pro', 'prod_other'] } }, 'prod_pro'), false)
  assert.equal(couponAppliesOnlyToProduct({ applies_to: { products: ['prod_other'] } }, 'prod_pro'), false)
  assert.equal(couponAppliesOnlyToProduct({}, 'prod_pro'), false)
})

test('pricing clearly excludes trial included Property Intelligence credits', async () => {
  const policy = await read('src/lib/propertyIntelligencePolicy.ts')
  const pricing = await read('src/pages/public/Pricing.tsx')
  assert.match(policy, /50 Property Intelligence lookups\/month with paid Pro/)
  assert.match(pricing, /PRO_TRIAL_INCLUDED_CREDIT_DISCLOSURE/)
  assert.match(pricing, /14-Day Free Trial/)
  assert.match(pricing, /20% off your first paid month with LAUNCH20/)
})

test('promotion dismissal is versioned and stored server-side', async () => {
  const actions = await read('src/server/platformActions.ts')
  const migration = await read('supabase/migrations/20260821153000_pro_trial_eligibility_and_promotion_preferences.sql')
  assert.match(actions, /dismissed_promotion_key:PRO_TRIAL_PROMOTION.key/)
  assert.match(actions, /dismissPermanently!==true/)
  assert.match(migration, /dismissed_promotion_key text/)
  assert.match(migration, /product_updates_opt_in boolean not null default false/)
})

test('announcement campaigns reuse outbox with confirmation, suppression, and deduplication', async () => {
  const actions = await read('src/server/platformActions.ts')
  const migration = await read('supabase/migrations/20260821160000_announcement_campaigns.sql')
  const worker = await read('supabase/functions/email-outbox-worker/index.ts')
  assert.match(actions, /operation==='queue'/)
  assert.match(actions, /confirmed!==true/)
  assert.match(actions, /product_updates_opt_in===true/)
  assert.match(actions, /campaign:\$\{campaign.id\}:\$\{recipient\}/)
  assert.match(migration, /campaign_id uuid references public\.announcement_campaigns/)
  assert.match(migration, /email_outbox_campaign_recipient_unique/)
  assert.match(worker, /email_suppressions/)
  assert.match(worker, /!row\.essential/)
})
