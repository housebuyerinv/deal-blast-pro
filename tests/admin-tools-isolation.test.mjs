import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = (relative) => readFile(join(root, relative), 'utf8')

test('Command Center gates House Buyer Investments tools behind effective owner admin access', async () => {
  const dashboard = await source('src/pages/app/Dashboard.tsx')
  assert.match(dashboard, /hasEffectiveOwnerAdminBypass\(user, settings\)/)
  assert.match(dashboard, /ownerAdminToolsVisible && totalBuyerReviewNotifications > 0/)
  assert.match(dashboard, /ownerAdminToolsVisible && <>/)
  assert.match(dashboard, /LiveOperationalStream ownerAdminToolsVisible=\{ownerAdminToolsVisible\}/)
})

test('submission review route requires the effective owner admin authorization', async () => {
  const shell = await source('src/components/layout/AppShell.tsx')
  assert.match(shell, /location\.pathname === '\/app\/submissions'/)
  assert.match(shell, /!effectiveOwnerAdminAccess \|\| !canUseLaunchedFeature\(restrictedFeature, effectivePlan, effectiveOwnerAdminAccess\)/)
})

test('customer buyer pages do not render the internal portal review center', async () => {
  const buyers = await source('src/pages/app/Buyers.tsx')
  assert.match(buyers, /\{buyerPortalReviewAllowed && \(/)
  assert.doesNotMatch(buyers, /Buyer Portal Review Center - Coming Soon/)
})

test('the existing workspace RLS migration protects deal submissions by workspace', async () => {
  const migration = await source('supabase/migrations/20260802221500_submission_workspace_review_rls.sql')
  assert.match(migration, /create policy/i)
  assert.match(migration, /can_access_inventory_workspace\(workspace_id\)/)
})
