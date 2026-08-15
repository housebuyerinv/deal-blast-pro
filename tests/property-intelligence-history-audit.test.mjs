import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

const api = readFileSync(new URL('../api/property-intelligence/[action].ts', import.meta.url), 'utf8')
const platform = readFileSync(new URL('../src/server/platformActions.ts', import.meta.url), 'utf8')
const calculator = readFileSync(new URL('../src/pages/app/DealCalculator.tsx', import.meta.url), 'utf8')
const admin = readFileSync(new URL('../src/components/admin/AdminCreditOperations.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260815160000_property_intelligence_history_audit.sql', import.meta.url), 'utf8')

test('live, cached, and failed lookups write the required durable audit outcomes', () => {
  assert.match(api, /cache_hit: true,[\s\S]*provider_called: false,[\s\S]*credits_consumed: 0/)
  assert.match(api, /provider_succeeded: true,[\s\S]*credit_finalization_reference:[\s\S]*credits_consumed: account\.isOwnerAdmin \? 0 : 1/)
  assert.match(api, /releaseLookupCredit[\s\S]*credit_release_reference:[\s\S]*credits_consumed: 0/)
  assert.ok(api.indexOf('readDurableLookupCache') < api.indexOf('reserveLookupCredit(account, operationId'))
})

test('recent and saved searches are durable and use the normal lookup endpoint', () => {
  for (const value of ['property_intelligence_searches', 'last_searched_at', 'is_saved', 'result_reference', 'result_metadata']) {
    assert.ok(migration.includes(value), value)
  }
  assert.match(platform, /action==='recent-searches'[\s\S]*req\.method!=='GET'/)
  assert.match(platform, /action==='saved-searches'[\s\S]*req\.method!=='POST'/)
  assert.match(calculator, /Run Again[\s\S]*loadPropertyIntelligenceForAddress\(address, \{ history: true \}\)/)
  assert.doesNotMatch(platform, /action==='recent-searches'[\s\S]{0,1200}reserve_property_intelligence_credit/)
  assert.doesNotMatch(platform, /action==='saved-searches'[\s\S]{0,1200}reserve_property_intelligence_credit/)
})

test('history and audit RLS isolate workspace users', () => {
  assert.match(migration, /alter table public\.property_intelligence_searches enable row level security/)
  assert.match(migration, /alter table public\.property_intelligence_operation_audit enable row level security/)
  assert.match(migration, /user_id = auth\.uid\(\)/)
  assert.match(migration, /w\.id = workspace_id and w\.owner_user_id = auth\.uid\(\)/)
  assert.match(platform, /eq\('workspace_id',workspaceId\)\.eq\('user_id',account\.user\.id\)/)
})

test('Owner Admin diagnostics are read-only and expose audit references', () => {
  assert.match(platform, /propertyIntelligenceAudit:auditResult\.data\|\|\[\]/)
  assert.match(admin, /Property Intelligence Diagnostics/)
  for (const field of ['credit_reservation_reference', 'credit_finalization_reference', 'credit_release_reference', 'cache_reference']) {
    assert.ok(platform.includes(field), field)
  }
  assert.match(migration, /revoke insert, update, delete on public\.property_intelligence_operation_audit from anon, authenticated/)
})
