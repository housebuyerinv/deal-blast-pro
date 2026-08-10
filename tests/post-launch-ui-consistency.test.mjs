import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Command Center and queue use the same canonical Pending Docs policy', async () => {
  const dashboard = await source('src/pages/app/Dashboard.tsx')
  const submissions = await source('src/pages/app/Submissions.tsx')
  const storage = await source('src/lib/dealSubmissionStorage.ts')

  assert.match(storage, /countPendingDealSubmissionDocsFromRows\(submissions/)
  assert.match(storage, /filter\(isPendingDealSubmissionDocs\)/)
  assert.match(dashboard, /countPendingDealSubmissionDocs\(\)/)
  assert.match(dashboard, /label: 'Pending Docs', value: pendingDocsCount/)
  assert.match(submissions, /pendingDocs: countPendingDealSubmissionDocsFromRows\(subs\)/)
  assert.match(submissions, /queueTab === 'pendingDocs'\) return subs\.filter\(isPendingDealSubmissionDocs\)/)
  assert.doesNotMatch(dashboard, /label: 'Pending Docs', value: 'Review'/)
})

test('Owner-only Property Intelligence messaging requires the effective owner bypass', async () => {
  const calculator = await source('src/pages/app/DealCalculator.tsx')
  const planAccess = await source('src/lib/planAccess.ts')

  assert.match(planAccess, /canShowOwnerPropertyIntelligenceBypass[\s\S]*hasEffectiveOwnerAdminBypass\(user, settings\)/)
  assert.match(planAccess, /hasOwnerAdminBypass\(user\) && !isOwnerPreviewActive\(user, settings\)/)
  assert.match(calculator, /ownerAdminMode = canShowOwnerPropertyIntelligenceBypass\(user, settings\)/)
  assert.match(calculator, /canUseLivePropertyData && ownerAdminMode/)
  assert.match(calculator, /canUseLivePropertyData && !ownerAdminMode && propertyCreditBalance/)

  const canShowBypass = ({ owner, preview }) => owner && !preview
  for (const plan of ['Free', 'Starter', 'Pro', 'Agency', 'Enterprise']) {
    assert.equal(canShowBypass({ plan, owner: false, preview: false }), false, `${plan} customer must not see owner bypass copy`)
  }
  assert.equal(canShowBypass({ plan: 'Pro', owner: true, preview: true }), false, 'Owner Preview must render customer behavior')
  assert.equal(canShowBypass({ plan: 'Owner Admin', owner: true, preview: false }), true)
})

test('all pricing surfaces consume the canonical Property Intelligence policy', async () => {
  const policy = await source('src/lib/propertyIntelligencePolicy.ts')
  const pricing = await source('src/pages/public/Pricing.tsx')
  const settings = await source('src/pages/app/Settings.tsx')
  const calculator = await source('src/pages/app/DealCalculator.tsx')
  const handler = await source('api/property-intelligence/[action].ts')
  const packs = await source('src/server/creditPacks.ts')

  assert.match(policy, /Free: 0/)
  assert.match(policy, /Starter: 20/)
  assert.match(policy, /Pro: 50/)
  assert.match(policy, /Agency: 150/)
  assert.match(policy, /Enterprise: null/)
  for (const [credits, cents] of [[10, 800], [25, 1500], [100, 4900], [250, 9900]]) {
    assert.match(policy, new RegExp(`credits: ${credits}, amountCents: ${cents}`))
  }
  assert.match(pricing, /PROPERTY_INTELLIGENCE_PLAN_COMPARISON_LABELS/)
  assert.match(settings, /PROPERTY_INTELLIGENCE_PLAN_COMPARISON_LABELS/)
  assert.match(calculator, /getIncludedPropertyIntelligenceCredits\(previewPlan\)/)
  assert.match(handler, /getIncludedPropertyIntelligenceCredits\(planName, enterpriseLimit\)/)
  assert.match(packs, /PROPERTY_INTELLIGENCE_CREDIT_PACKS/)
})
