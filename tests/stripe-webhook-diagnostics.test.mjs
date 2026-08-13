import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8')

test('credit-pack RPC failure keeps a safe diagnostic and stable external error', () => {
  assert.match(source, /parseRpcDiagnostic/)
  assert.match(source, /status: response\.status/)
  assert.match(source, /code: safe\(body\.code\)/)
  assert.match(source, /message: safe\(body\.message\)/)
  assert.match(source, /details: safe\(body\.details\)/)
  assert.match(source, /hint: safe\(body\.hint\)/)
  assert.match(source, /new Error\('credit_pack_grant_failed'\)/)
  assert.match(source, /console\.error\('credit_pack_grant_rpc_failed', diagnostic\)/)
  assert.match(source, /credit_pack_grant_rpc/)
  assert.match(source, /rpcDiagnostic \? \{ credit_pack_grant_rpc: rpcDiagnostic \}/)
  assert.doesNotMatch(source, /console\.error\([^\n]*(Authorization|STRIPE_SECRET|STRIPE_WEBHOOK|SUPABASE_SERVICE_ROLE)/)
  assert.match(source, /property_intelligence_addon_purchases/)
})

test('credit-pack Stripe provider failures preserve safe auth diagnostics before classification', () => {
  assert.match(source, /response\.status === 401 \|\| response\.status === 403/)
  assert.match(source, /parseStripeAuthDiagnostic\(response\)/)
  assert.match(source, /stripeAuthDiagnostic: diagnostic/)
  assert.match(source, /credit_pack_provider_authentication_failed/)
  assert.match(source, /requestId: safe\(response\.headers\.get\('request-id'\)\)/)
  assert.doesNotMatch(source, /stripeAuthDiagnostic[^\n]*Authorization/)
  assert.doesNotMatch(source, /parseStripeAuthDiagnostic[\s\S]{0,1200}STRIPE_SECRET_KEY/)
})
