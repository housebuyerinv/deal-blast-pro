import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readCreditPacks } from '../src/server/creditPacks.ts'
import { aggregateHotZones } from '../src/server/hotZones.ts'
import { handlePlatformAction } from '../src/server/platformActions.ts'

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

const runHotZonesDenial = async (planName:string, scope:'workspace'|'shared') => {
  let status = 0; let body:any = null; let queried = false
  const res = { status(value:number){ status=value; return this }, json(value:any){ body=value; return this }, setHeader(){} }
  const account = { isOwnerAdmin:false, planName, workspace:{id:'workspace'}, adminClient:{from(){queried=true;throw new Error('query_must_not_run')}} }
  await handlePlatformAction('hot-zones',{method:'GET',query:{period:'monthly',scope}},res,account)
  return {status,body,queried}
}
const starterHotZones = await runHotZonesDenial('Starter','workspace')
assert.deepEqual([starterHotZones.status,starterHotZones.body.code,starterHotZones.queried],[403,'pro_required',false])
const proSharedHotZones = await runHotZonesDenial('Pro','shared')
assert.deepEqual([proSharedHotZones.status,proSharedHotZones.body.code,proSharedHotZones.queried],[403,'agency_required',false])

const migration = await readFile(new URL('../supabase/migrations/20260803013000_credit_email_closing_foundation.sql',import.meta.url),'utf8')
for (const required of ['idempotency_key text not null unique','pg_advisory_xact_lock','purchase_grant','reservation','release','refund','dispute','admin_correction','email_outbox','email_delivery_events','verified_closings']) assert.equal(migration.includes(required),true,required)
assert.equal(migration.includes("when 'enterprise' then greatest(0, coalesce(p_enterprise_limit, 0))"),true)
assert.equal(migration.includes("when 'enterprise' then 1000"),false)

const policyMigration = await readFile(new URL('../supabase/migrations/20260803143000_update_property_intelligence_credit_policy.sql',import.meta.url),'utf8')
for (const required of ["when 'starter' then 20","when 'pro' then 50","when 'agency' then 150",'property_intelligence_included_credits','v_limit - greatest(0, v_already_granted)','cycle_allowance_already_satisfied']) assert.equal(policyMigration.includes(required),true,required)

const stripe = await readFile(new URL('../supabase/functions/stripe-webhook/index.ts',import.meta.url),'utf8')
assert.equal(stripe.includes('claimStripeEvent'),true)
assert.equal(stripe.includes('stripe:credit-pack:'),true)
assert.equal(stripe.includes("metadata.purchaseKind !== 'property_intelligence_credit_pack'"),true)
assert.equal(stripe.includes('resolvePaidCreditPack'),true)
assert.equal(stripe.includes("String(object.payment_status || '') !== 'paid'"),true)
assert.equal(stripe.includes("Number(lineItems[0]?.quantity || 0) !== 1"),true)
assert.equal(stripe.includes('const credits = Number(metadata.credits'),false)
assert.equal(stripe.includes('enterprise_credit_allowance_not_configured'),true)

const propertyRoute = await readFile(new URL('../api/property-intelligence/[action].ts',import.meta.url),'utf8')
assert.equal(propertyRoute.includes("const purchasedAccess = Number(ledgerBalance?.purchasedRemaining || 0) > 0"),true)
assert.equal(propertyRoute.includes("rpc('property_intelligence_credit_balance'"),true)
assert.equal(propertyRoute.includes("normalized === 'starter') return 20"),true)
assert.equal(propertyRoute.includes("normalized === 'pro') return 50"),true)
assert.equal(propertyRoute.includes("normalized === 'agency') return 150"),true)
assert.equal(propertyRoute.includes('RENTCAST_CAPACITY_PAUSED'),true)
assert.equal(propertyRoute.indexOf('const cached = await readDurableLookupCache') < propertyRoute.lastIndexOf("logDiagnostic('provider_capacity_paused', { requestAction: action"),true)
assert.equal(propertyRoute.lastIndexOf("logDiagnostic('provider_capacity_paused', { requestAction: action") < propertyRoute.indexOf('reservation = await reserveLookupCredit'),true)

const calculator = await readFile(new URL('../src/pages/app/DealCalculator.tsx',import.meta.url),'utf8')
for (const required of ['Included Credits','Purchased Credits','Total Available','Next Refill Date',"fetchPropertyIntelligence('status', {})\n            .then(payload => ({ payload, error: null }))"]) assert.equal(calculator.includes(required),true,required)

const dashboard = await readFile(new URL('../src/pages/app/Dashboard.tsx',import.meta.url),'utf8')
assert.equal(dashboard.includes('const canReadSubmissionActivity = isSuperAdmin(store.user) && !isOwnerPreviewActive(store.user, store.settings)'),true)

const platformActions = await readFile(new URL('../src/server/platformActions.ts',import.meta.url),'utf8')
assert.equal(platformActions.includes("accountRank<PLAN_RANK.pro"),true)
assert.equal(platformActions.includes("scope==='shared'&&accountRank<PLAN_RANK.agency"),true)

const appShell = await readFile(new URL('../src/components/layout/AppShell.tsx',import.meta.url),'utf8')
assert.equal(appShell.includes('This feature is included with {requiredPlan}.'),true)
assert.equal(appShell.includes('Upgrade to {requiredPlan}'),true)

const accountAuth = await readFile(new URL('../api/_accountAuth.ts',import.meta.url),'utf8')
assert.equal(accountAuth.includes('planRank(account.planName) >= PLAN_RANK.starter'),true)

const email = await readFile(new URL('../supabase/functions/notify-submission/index.ts',import.meta.url),'utf8')
assert.equal(email.includes("from('email_outbox')"),true)
assert.equal(email.includes('safeAdminTestRecipients'),true)
assert.equal(email.includes('isEssentialEvent'),true)

const emailWorker = await readFile(new URL('../supabase/functions/email-outbox-worker/index.ts',import.meta.url),'utf8')
for (const required of ['claim_email_outbox_batch','p_worker_token','provider_accepted','retry_scheduled','failed_permanently',".eq('lease_token', workerToken)"]) assert.equal(emailWorker.includes(required),true,required)
const resendWebhook = await readFile(new URL('../supabase/functions/resend-webhook/index.ts',import.meta.url),'utf8')
for (const required of ["req.headers.get('svix-id') || event?.data?.id","'email.sent': 'provider_accepted'",'duplicate: true','delivery_event_write_failed']) assert.equal(resendWebhook.includes(required),true,required)
const emailHardeningMigration = await readFile(new URL('../supabase/migrations/20260803190000_harden_email_outbox_delivery.sql',import.meta.url),'utf8')
for (const required of ['for update skip locked','claim_email_outbox_batch','lease_expires_at','failed_permanently']) assert.equal(emailHardeningMigration.includes(required),true,required)

console.log('Credit, email outbox, Stripe idempotency, and Hot Zones contract tests passed.')
