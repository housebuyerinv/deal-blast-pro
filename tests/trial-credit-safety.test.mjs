import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('trialing Stripe subscriptions receive software access but are not paid', async () => {
  const webhook = await read('supabase/functions/stripe-webhook/index.ts')
  assert.match(webhook, /resolvedSubscriptionStatus === 'trialing'/)
  assert.match(webhook, /billingStatus: 'Trial Active'/)
  assert.match(webhook, /paymentStatus: 'Trialing'/)
  assert.match(webhook, /isPaid: false, hasSoftwareAccess: true/)
})

test('included grants require a non-zero paid active subscription invoice', async () => {
  const webhook = await read('supabase/functions/stripe-webhook/index.ts')
  assert.match(webhook, /amountPaid <= 0/)
  assert.match(webhook, /subscriptionStatus\)\.toLowerCase\(\) !== 'active'/)
  assert.match(webhook, /paymentStatus\.toLowerCase\(\) !== 'paid'/)
  assert.match(webhook, /subscription_create.*subscription_cycle.*subscription_update/)
  assert.match(webhook, /p_invoice_amount_paid: amountPaid/)
  assert.match(webhook, /p_subscription_status: subscriptionStatus/)
})

test('paid external-resource entitlement excludes trial status', async () => {
  const auth = await read('api/_accountAuth.ts')
  assert.match(auth, /SOFTWARE_ACCESS_BILLING_STATUSES/)
  assert.match(auth, /PAID_EXTERNAL_RESOURCE_BILLING_STATUSES/)
  assert.match(auth, /PAID_EXTERNAL_RESOURCE_SUBSCRIPTION_STATUSES/)
  assert.match(auth, /hasPaidExternalResourceEntitlement/)
  assert.doesNotMatch(auth, /PAID_EXTERNAL_RESOURCE_BILLING_STATUSES[\s\S]{0,120}'trial active'/)
})

test('forward migration disables plan-only grants and enforces paid state again in SQL', async () => {
  const migration = await read('supabase/migrations/20260821150000_trial_paid_credit_safety.sql')
  assert.match(migration, /revoke all on function public\.grant_property_intelligence_included_credits\([\s\S]*service_role/)
  assert.match(migration, /p_invoice_amount_paid integer default 0/)
  assert.match(migration, /p_subscription_status text default null/)
  assert.match(migration, /billing_status[\s\S]*'paid active'/)
  assert.match(migration, /trial_status[\s\S]*'trial active'/)
  assert.doesNotMatch(migration, /delete from|truncate|drop table/i)
})

test('all legacy uncached RentCast actions reserve through the shared authorization path', async () => {
  const handler = await read('api/property-intelligence/[action].ts')
  assert.match(handler, /async function withReservedProviderCredit/)
  assert.match(handler, /const reservation = await reserveLookupCredit/)
  for (const action of ['search', 'value', 'rent', 'comps', 'listings', 'market']) {
    assert.match(handler, new RegExp(`account\\.user\\.id}:${action}`))
  }
  assert.match(handler, /account\.user\.id}:\$\{action}:\$\{normalizedAddress}/)
  assert.match(handler, /mayProbeProvider = account\.isOwnerAdmin && internal/)
})
