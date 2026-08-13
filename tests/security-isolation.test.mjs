import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = async (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('workspace-sensitive tables use RLS and owner/member predicates', async () => {
  const buyers = await source('supabase/migrations/20260716090000_workspace_buyers_rls_and_limits.sql')
  const credits = await source('supabase/migrations/20260716113000_property_intelligence_credits.sql')
  const inventory = await source('supabase/migrations/20260729193000_durable_submission_inventory.sql')
  const submissions = await source('supabase/migrations/20260802221500_submission_workspace_review_rls.sql')

  for (const migration of [buyers, credits, inventory]) {
    assert.match(migration, /enable row level security/i)
    assert.match(migration, /auth\.uid\(\)/)
  }
  assert.match(submissions, /create policy/i)
  assert.match(submissions, /auth\.uid\(\)|can_access_inventory_workspace/i)
  assert.match(buyers, /workspace owner/i)
  assert.match(credits, /Workspace owners can view property intelligence/i)
  assert.match(inventory, /can_access_inventory_workspace\(workspace_id\)/)
  assert.match(submissions, /can_access_inventory_workspace\(workspace_id\)/)
})

test('admin email operations require server-derived owner workspace scope', async () => {
  const endpoint = await source('api/email-operations.ts')
  assert.match(endpoint, /owner/i)
  assert.match(endpoint, /workspace/i)
  assert.doesNotMatch(endpoint, /req\.query.*workspace|req\.body.*workspace/)
})
