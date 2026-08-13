import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
/* global URL */
import test from 'node:test'

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('owner preview does not inherit the owner route bypass', async () => {
  const planAccess = await source('src/lib/planAccess.ts')
  assert.match(planAccess, /hasOwnerAdminBypass\(user\) && !isOwnerPreviewActive\(user, settings\)/)
})

test('submission loading always clears in a finally block', async () => {
  const submissions = await source('src/pages/app/Submissions.tsx')
  assert.match(submissions, /finally\s*\{[\s\S]*setLoading\(false\)/)
})

test('conversion uses the atomic Supabase function and returns its durable row', async () => {
  const storage = await source('src/lib/inventoryStorage.ts')
  assert.match(storage, /rpc\('convert_deal_submission_to_inventory'/)
  assert.match(storage, /data:\s*rowToDeal\(row\)/)
})

test('inventory reads named columns and has no polling loop', async () => {
  const storage = await source('src/lib/inventoryStorage.ts')
  const inventory = await source('src/pages/app/Inventory.tsx')
  assert.match(storage, /const INVENTORY_COLUMNS = 'id,source_submission_id,status,deal_data,created_at,updated_at'/)
  assert.doesNotMatch(inventory, /setInterval\s*\(/)
})

test('dashboard activity refresh is event driven', async () => {
  const dashboard = await source('src/pages/app/Dashboard.tsx')
  assert.doesNotMatch(dashboard, /setInterval\(load,\s*15000\)/)
  assert.match(dashboard, /dealblastpro:storage-sync/)
})

test('owner Property Intelligence requests do not reserve credits', async () => {
  const handler = await source('api/property-intelligence/[action].ts')
  assert.match(handler, /creditSource:\s*'owner_internal'/)
  assert.match(handler, /creditUsed:\s*!account\.isOwnerAdmin/)
})

test('submission review migration is additive and workspace scoped', async () => {
  const migration = await source('supabase/migrations/20260802221500_submission_workspace_review_rls.sql')
  assert.match(migration, /add column if not exists workspace_id/)
  assert.match(migration, /can_access_inventory_workspace\(workspace_id\)/)
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i)
})

test('converted inventory corrective backfill is workspace scoped and duplicate safe', async () => {
  const migration = await source('supabase/migrations/20260802233000_backfill_workspace_assigned_converted_inventory.sql')
  assert.match(migration, /join public\.workspaces w on w\.id = ds\.workspace_id/)
  assert.match(migration, /not exists[\s\S]*existing\.source_submission_id = ds\.id::text/)
  assert.match(migration, /on conflict do nothing/)
  assert.match(migration, /inventory_deal_from_submission\([\s\S]*ds,[\s\S]*ds\.inventory_deal_id/)
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i)
})

test('legacy workspace repair uses the original authenticated reservation owner', async () => {
  const migration = await source('supabase/migrations/20260802234500_assign_legacy_submission_workspace_and_backfill.sql')
  assert.match(migration, /join public\.workspaces w on w\.owner_user_id = link\.user_id/)
  assert.match(migration, /link\.source_submission_id = ds\.id::text/)
  assert.match(migration, /where ds\.workspace_id is null/)
  assert.match(migration, /not exists[\s\S]*existing\.source_submission_id = ds\.id::text/)
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i)
})

test('durable-evidence workspace repair skips ambiguous converter mappings', async () => {
  const migration = await source('supabase/migrations/20260802235500_resolve_legacy_workspace_from_durable_evidence.sql')
  assert.match(migration, /having count\(distinct workspace_id\) = 1/)
  assert.match(migration, /resolved\.user_id = link\.user_id/)
  assert.match(migration, /where ds\.workspace_id is null/)
  assert.match(migration, /not exists[\s\S]*existing\.source_submission_id = ds\.id::text/)
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i)
})

test('legacy conversion variants require durable conversion metadata', async () => {
  const migration = await source('supabase/migrations/20260803000500_backfill_legacy_conversion_metadata_variants.sql')
  assert.match(migration, /ds\.converted_at is not null/)
  assert.match(migration, /nullif\(ds\.inventory_deal_id, ''\) is not null/)
  assert.match(migration, /deal_data->>'submissionStatus'/)
  assert.match(migration, /having count\(distinct workspace_id\) = 1/)
  assert.match(migration, /not exists[\s\S]*existing\.source_submission_id = ds\.id::text/)
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i)
})
