import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildProductionPersistedState, MAX_PERSISTED_APP_BYTES, migratePersistedAppState, persistedPayloadIsSafe } from '../src/lib/appPersistence.ts'

const large = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), payload: 'x'.repeat(500) }))
const state: any = {
  workspaceInstanceId: 'workspace', workspaceOwnerId: 'owner', workspaceOwnerEmail: 'owner@example.com', workspaceDataScopeKey: 'scope',
  trial: { plan: 'Pro' }, settings: { ownerPreviewPlan: 'Free', darkMode: true }, sidebarOpen: true,
  deals: large, buyers: large, offers: { huge: large }, activities: { huge: large }, documents: { huge: large }, blastLogs: { huge: large },
}
const persisted = buildProductionPersistedState(state)
assert.equal('deals' in persisted, false)
assert.equal('buyers' in persisted, false)
assert.equal('offers' in persisted, false)
assert.equal(persisted.settings.ownerPreviewPlan, 'Owner Admin')
const serialized = JSON.stringify({ state: persisted })
assert.equal(persistedPayloadIsSafe(serialized), true)
assert.ok(new TextEncoder().encode(serialized).byteLength < MAX_PERSISTED_APP_BYTES)

const migrated = migratePersistedAppState({ version: 1, state })
assert.equal('deals' in migrated.state, false)
assert.equal(migrated.state.settings.ownerPreviewPlan, 'Owner Admin')

const calculator = await readFile(new URL('../src/pages/app/DealCalculator.tsx', import.meta.url), 'utf8')
for (const text of ['You need Property Intelligence credits to run this lookup.', 'Buy Credits', 'View Plans', 'aria-live="assertive"', "setPropertyCreditBlock('zero_balance')"]) assert.equal(calculator.includes(text), true, text)
assert.equal(calculator.indexOf("availableCredits <= 0") < calculator.indexOf("setPropertyLookupLoading(true)"), true)

const adminUi = await readFile(new URL('../src/components/admin/AdminCreditOperations.tsx', import.meta.url), 'utf8')
for (const text of ['Admin Credit Operations', 'Search Workspaces', 'Included remaining', 'Purchased remaining', 'Reserved credits', 'Append Adjustment', 'Required operational reason']) assert.equal(adminUi.includes(text), true, text)

const server = await readFile(new URL('../src/server/platformActions.ts', import.meta.url), 'utf8')
assert.equal(server.includes("if(!account.isOwnerAdmin)return send(403"), true)
assert.equal(server.includes("rpc('admin_adjust_property_intelligence_credits'"), true)
const migration = await readFile(new URL('../supabase/migrations/20260803024500_atomic_admin_credit_adjustments.sql', import.meta.url), 'utf8')
for (const text of ['pg_advisory_xact_lock', 'negative_balance_prevented', 'idempotency_key', 'property_intelligence_credit_ledger']) assert.equal(migration.includes(text), true, text)

const store = await readFile(new URL('../src/store/useAppStore.ts', import.meta.url), 'utf8')
assert.equal(store.includes('readOwnerPreviewSession()'), true)
assert.equal(store.includes('writeOwnerPreviewSession'), true)
assert.equal(store.includes('buildProductionPersistedState'), true)

const sidebar = await readFile(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8')
assert.equal(sidebar.includes('event.preventDefault()'), false)
assert.equal(sidebar.includes('navigate(destination)'), false)
assert.equal(sidebar.includes('to={destination}'), true)
assert.equal(sidebar.includes('onClose?.()'), true)

console.log('Preview repair, zero-credit UX, Admin Credit Operations, and browser-storage contract tests passed.')
