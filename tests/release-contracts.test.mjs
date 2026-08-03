import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
