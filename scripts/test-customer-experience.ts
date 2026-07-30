import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canShowSamplePropertyIntelligence,
  getBillingControlPolicy,
} from '../src/lib/customerExperiencePolicies.ts'

assert.equal(canShowSamplePropertyIntelligence({ isOwnerAdmin: true, ownerPreviewActive: true }), true)
assert.equal(canShowSamplePropertyIntelligence({ isOwnerAdmin: true, ownerPreviewActive: false }), false)
assert.equal(canShowSamplePropertyIntelligence({ isOwnerAdmin: false, ownerPreviewActive: false }), false)
assert.equal(canShowSamplePropertyIntelligence({ isOwnerAdmin: false, ownerPreviewActive: false, explicitDemo: true }), true)

const free = getBillingControlPolicy({ plan: 'Free', billingStatus: 'Free Active', ownerPreviewActive: false, cancelAtPeriodEnd: false })
assert.equal(free.showUpgrade, true)
assert.equal(free.showManage, false)

const paid = getBillingControlPolicy({ plan: 'Pro', billingStatus: 'Paid Active', ownerPreviewActive: false, cancelAtPeriodEnd: false })
assert.equal(paid.showManage, true)
assert.equal(paid.showChange, true)
assert.equal(paid.showDowngrade, true)
assert.equal(paid.showCancel, true)

const scheduled = getBillingControlPolicy({ plan: 'Pro', billingStatus: 'Paid Active', ownerPreviewActive: false, cancelAtPeriodEnd: true })
assert.equal(scheduled.showCancel, false)
assert.equal(scheduled.showUndoCancellation, true)

const preview = getBillingControlPolicy({ plan: 'Pro', billingStatus: 'Paid Active', ownerPreviewActive: true, cancelAtPeriodEnd: false })
assert.equal(preview.simulated, true)
assert.equal(preview.showManage, true)
assert.equal(preview.showUpgrade, true)
assert.equal(preview.showCancel, true)

const settingsSource = await readFile(new URL('../src/pages/app/Settings.tsx', import.meta.url), 'utf8')
assert.equal(settingsSource.includes('Free Plan & Upgrade Options'), false)
assert.equal(settingsSource.includes('Free Plan Billing Summary'), true)
assert.equal((settingsSource.match(/handleUserFacingUpgrade\('Starter'\)/g) || []).length, 1)
assert.equal(settingsSource.includes('Preview simulation only. These controls do not contact Stripe or change billing.'), true)
assert.equal(settingsSource.includes('Manage Billing</button>'), true)
assert.equal(settingsSource.includes('Change Plan</button>'), true)
assert.equal(settingsSource.includes('Downgrade Plan</button>'), true)
assert.equal(settingsSource.includes('Cancel Subscription</button>'), true)
assert.equal(settingsSource.includes('Undo Scheduled Cancellation</button>'), true)

console.log('Customer experience policy tests passed.')
