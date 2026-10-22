import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { build } from 'esbuild'

const ref = 'qxhhlprentrufobpcgna'
const url = `https://${ref}.supabase.co`
const signingSecret = 'synthetic-only-webhook-secret'
let handler, values, reads, bodyReads, calls
const priorDeno = globalThis.Deno
const priorFetch = globalThis.fetch
globalThis.Deno = { serve(fn) { handler = fn }, env: { get(key) { reads.push(key); return values[key] } } }
const compiled = await build({ entryPoints: ['supabase/functions/stripe-webhook/index.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))

test.beforeEach(() => {
  reads = []; bodyReads = 0; calls = []
  values = { BM_ENVIRONMENT: 'staging', BM_STAGING_PROJECT_REF: ref, SUPABASE_URL: url,
    STRIPE_WEBHOOK_SECRET: signingSecret, STRIPE_SECRET_KEY: 'rk_test_synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }
  globalThis.fetch = async (target, options) => {
    calls.push({ target, options })
    return new globalThis.Response(JSON.stringify(true), { status: 200 })
  }
})
test.after(() => { globalThis.fetch = priorFetch; if (priorDeno === undefined) delete globalThis.Deno; else globalThis.Deno = priorDeno })

function request({ method = 'POST', body = '{malformed', signed = false, headers = {}, unreadable = false, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')
  return { method, headers: new globalThis.Headers({ ...headers, ...(signed ? { 'stripe-signature': `t=${timestamp},v1=${signature}` } : {}) }),
    async text() { bodyReads++; if (unreadable) throw new Error('Body must not be read'); return body } }
}
async function blocked(req) {
  const response = await handler(req)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false, error: 'Staging webhook processing paused' })
  assert.equal(bodyReads, 0)
  assert.deepEqual(calls, [])
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(reads.includes(name), false)
}

for (const flag of [undefined, 'false', '', 'TRUE', '1']) test(`S2 fails closed before secrets/body/network: flag=${String(flag)}`, async () => {
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = flag
  await blocked(request({ unreadable: true }))
})
test('valid Stripe signature and forged internal/authorization headers cannot bypass pause', async () => {
  await blocked(request({ signed: true, body: '{}', headers: { authorization: 'Bearer synthetic', 'x-internal': 'true', 'x-bm-s2-stripe-webhook-enabled': 'true' } }))
})
for (const [key, value] of [['BM_ENVIRONMENT', undefined], ['BM_ENVIRONMENT', 'production'], ['BM_STAGING_PROJECT_REF', 'foreign'], ['SUPABASE_URL', 'https://aigvnbxiydbzzqbetlhl.supabase.co']]) {
  test(`explicit enable cannot bypass inconsistent S2 binding: ${key}=${String(value)}`, async () => {
    values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'true'; values[key] = value
    await blocked(request({ unreadable: true }))
  })
}
test('non-POST method remains 405 without reading body or credentials', async () => {
  const response = await handler(request({ method: 'GET', unreadable: true }))
  assert.equal(response.status, 405); assert.equal(bodyReads, 0); assert.deepEqual(reads, []); assert.deepEqual(calls, [])
})
test('enabled S2 still rejects invalid signature before Stripe or database access', async () => {
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'true'
  assert.equal((await handler(request({ body: '{}' }))).status, 400)
  assert.equal(bodyReads, 1); assert.deepEqual(calls, [])
})
test('enabled S2 still rejects expired valid signature before Stripe or database access', async () => {
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'true'
  assert.equal((await handler(request({ body: '{}', signed: true, timestamp: 1 }))).status, 400)
  assert.deepEqual(calls, [])
})
test('enabled and correctly bound S2 retains signed BuyerMatch reconciliation', async () => {
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'true'
  const body = JSON.stringify({ id: 'evt_synthetic', type: 'checkout.session.expired', livemode: false,
    data: { object: { id: 'cs_synthetic', metadata: { dbpProduct: 'buyermatch', dbpCheckoutId: 'synthetic-checkout', dealBlastUserId: 'synthetic-owner' } } } })
  const response = await handler(request({ body, signed: true }))
  assert.equal(response.status, 200); assert.equal(bodyReads, 1); assert.equal(calls.length, 1)
  assert.equal(calls[0].target, url + '/rest/v1/rpc/bm_checkout_event')
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_id: 'synthetic-checkout', p_owner: 'synthetic-owner', p_session: 'cs_synthetic', p_state: 'expired' })
})
test('restoring pause blocks the next request immediately', async () => {
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'true'
  assert.equal((await handler(request({ body: '{}' }))).status, 400)
  reads = []; bodyReads = 0
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'false'
  await blocked(request({ signed: true, body: '{}' }))
})
test('unrelated Production path retains signature rejection irrespective of S2 flag', async () => {
  values.BM_ENVIRONMENT = 'production'
  values.SUPABASE_URL = 'https://aigvnbxiydbzzqbetlhl.supabase.co'
  values.BM_S2_STRIPE_WEBHOOK_ENABLED = 'false'
  assert.equal((await handler(request({ body: '{}' }))).status, 400)
  assert.equal(bodyReads, 1); assert.deepEqual(calls, [])
})
