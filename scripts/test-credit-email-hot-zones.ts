import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readCreditPacks } from '../api/_creditPacks.ts'
import { aggregateHotZones } from '../api/_hotZones.ts'

const packs = readCreditPacks({})
assert.deepEqual(packs.map(p => [p.credits,p.amountCents]), [[10,800],[25,1500],[100,4900],[250,9900]])
assert.equal(packs.every(p => p.stripePriceId === ''), true)

const rows = [
  {workspace_id:'w1',city:'Pittsburgh',state:'PA',postal_code:'15201'},
  {workspace_id:'w1',city:'Pittsburgh',state:'PA',postal_code:'15201'},
  {workspace_id:'w1',city:'Pittsburgh',state:'PA',postal_code:'15201'},
]
assert.equal(aggregateHotZones(rows.slice(0,2),'workspace',{workspaceMinimum:3,sharedMinimum:5,sharedWorkspaceMinimum:3}).length,0)
assert.equal(aggregateHotZones(rows,'workspace',{workspaceMinimum:3,sharedMinimum:5,sharedWorkspaceMinimum:3})[0].count,3)
const shared = [...rows,{...rows[0],workspace_id:'w2'},{...rows[0],workspace_id:'w3'}]
assert.equal(aggregateHotZones(shared,'shared',{workspaceMinimum:3,sharedMinimum:5,sharedWorkspaceMinimum:3})[0].count,5)
assert.equal(aggregateHotZones(shared.slice(0,4),'shared',{workspaceMinimum:3,sharedMinimum:5,sharedWorkspaceMinimum:3}).length,0)

const migration = await readFile(new URL('../supabase/migrations/20260803013000_credit_email_closing_foundation.sql',import.meta.url),'utf8')
for (const required of ['idempotency_key text not null unique','pg_advisory_xact_lock','purchase_grant','reservation','release','refund','dispute','admin_correction','email_outbox','email_delivery_events','verified_closings']) assert.equal(migration.includes(required),true,required)
assert.equal(migration.includes("when 'enterprise' then greatest(0, coalesce(p_enterprise_limit, 0))"),true)
assert.equal(migration.includes("when 'enterprise' then 1000"),false)

const stripe = await readFile(new URL('../supabase/functions/stripe-webhook/index.ts',import.meta.url),'utf8')
assert.equal(stripe.includes('claimStripeEvent'),true)
assert.equal(stripe.includes('stripe:credit-pack:'),true)
assert.equal(stripe.includes("metadata.purchaseKind !== 'property_intelligence_credit_pack'"),true)

const email = await readFile(new URL('../supabase/functions/notify-submission/index.ts',import.meta.url),'utf8')
assert.equal(email.includes("from('email_outbox')"),true)
assert.equal(email.includes('safeAdminTestRecipients'),true)
assert.equal(email.includes('isEssentialEvent'),true)

console.log('Credit, email outbox, Stripe idempotency, and Hot Zones contract tests passed.')
