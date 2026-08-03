import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canAccessRoute,
  getAllowedRoutes,
  getEffectivePlan,
  getOwnerPreviewContext,
  hasEffectiveOwnerAdminBypass,
} from '../src/lib/planAccess.ts'
import {
  canAccessCalculatorEntitlement,
  getAllowedCalculatorTabs,
} from '../src/lib/calculatorAccess.ts'
import { getBuyerCapacity } from '../src/lib/planEntitlements.ts'
import {
  getWorkspaceDisplayName,
  isValidWorkspaceName,
  sanitizeWorkspaceName,
  validateWorkspaceNameInput,
} from '../src/lib/workspaceName.ts'
import type { AppSettings, TrialState, User } from '../src/lib/types.ts'

const owner = { email: 'housebuyerinv@gmail.com' } as User
const trial: TrialState = {
  isActive: true,
  daysLeft: 999,
  endDate: '',
  usage: { dealsSubmitted: 0, buyersImported: 0, blastsSent: 0, exports: 0 },
  isPaid: true,
  plan: 'Pro',
  billingStatus: 'Paid Active',
}
const settingsFor = (ownerPreviewPlan: AppSettings['ownerPreviewPlan']) => ({ ownerPreviewPlan }) as AppSettings

assert.equal(getWorkspaceDisplayName(''), 'My Workspace')
assert.equal(getWorkspaceDisplayName('dddsss'), 'My Workspace')
assert.equal(getWorkspaceDisplayName('test'), 'My Workspace')
assert.equal(getWorkspaceDisplayName('\u0000  River City   Home Buyers LLC  '), 'River City Home Buyers LLC')
assert.equal(isValidWorkspaceName('River City Home Buyers LLC'), true)
assert.equal(isValidWorkspaceName('dddsss'), false)
assert.equal(sanitizeWorkspaceName('  Acme\nInvestments  '), 'Acme Investments')
assert.equal(validateWorkspaceNameInput('').valid, true)
assert.equal(validateWorkspaceNameInput('dddsss').valid, false)

for (const plan of ['Free', 'Starter', 'Pro', 'Agency', 'Enterprise'] as const) {
  const settings = settingsFor(plan)
  const context = getOwnerPreviewContext(owner, settings)
  assert.equal(context.active, true)
  assert.equal(context.plan, plan)
  assert.equal(context.role, 'Workspace Owner')
  assert.equal(context.mutatesAccount, false)
  assert.equal(getEffectivePlan(trial, owner, settings), plan)
  assert.equal(hasEffectiveOwnerAdminBypass(owner, settings), false)
}

const freeSettings = settingsFor('Free')
assert.deepEqual(getAllowedCalculatorTabs(trial, owner, freeSettings), ['arv'])
assert.equal(canAccessCalculatorEntitlement('propertyIntelligence', trial, owner, freeSettings), false)
assert.equal(canAccessRoute('/app/blast', trial, owner, freeSettings), false)
assert.equal(canAccessRoute('/app/calculator', trial, owner, freeSettings), true)
assert.equal(getBuyerCapacity(getEffectivePlan(trial, owner, freeSettings), 25).isAtLimit, true)

const starterSettings = settingsFor('Starter')
assert.deepEqual(getAllowedCalculatorTabs(trial, owner, starterSettings), ['arv', 'rehab', 'mao'])
assert.equal(canAccessCalculatorEntitlement('propertyIntelligence', trial, owner, starterSettings), false)
assert.equal(canAccessRoute('/app/blast', trial, owner, starterSettings), true)
assert.equal(canAccessRoute('/app/analytics', trial, owner, starterSettings), false)

const proSettings = settingsFor('Pro')
assert.equal(getAllowedRoutes(trial, owner, proSettings).includes('/app/analytics'), true)
assert.equal(canAccessCalculatorEntitlement('propertyIntelligence', trial, owner, proSettings), true)
assert.equal(getBuyerCapacity(getEffectivePlan(trial, owner, proSettings), 1000).isAtLimit, true)

const exitedSettings = settingsFor('Owner Admin')
assert.equal(getOwnerPreviewContext(owner, exitedSettings).active, false)
assert.equal(hasEffectiveOwnerAdminBypass(owner, exitedSettings), true)
assert.equal(canAccessRoute('/app/analytics', trial, owner, exitedSettings), true)
assert.equal(canAccessCalculatorEntitlement('propertyIntelligence', trial, owner, exitedSettings), true)

const storeSource = await readFile(new URL('../src/store/useAppStore.ts', import.meta.url), 'utf8')
assert.equal(storeSource.includes("ownerPreviewPlan: 'Owner Admin'"), true)
assert.equal(storeSource.includes('if (ownerPreviewActive) return true'), true)
const shellSource = await readFile(new URL('../src/components/layout/AppShell.tsx', import.meta.url), 'utf8')
assert.equal(shellSource.includes('Viewing as {ownerPreviewPlan}'), true)
assert.equal(shellSource.includes('This does not change your owner account or billing.'), true)
const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8')
assert.equal(sidebarSource.includes('hasEffectiveOwnerAdminBypass(user, settings)'), true)
const topbarSource = await readFile(new URL('../src/components/layout/Topbar.tsx', import.meta.url), 'utf8')
assert.equal(topbarSource.includes('<PlanStatusBadge trial={displayedTrial}'), true)

console.log('Workspace and Owner Preview release-contract tests passed.')
