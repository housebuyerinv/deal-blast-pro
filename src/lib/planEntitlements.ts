import type { TrialState } from './types'
import type { PlanName } from './planAccess'

export type PublicPlanName = TrialState['plan']
export type BuyerPortalReviewAccess = 'available' | 'locked' | 'coming-soon' | 'custom'

export type PlanEntitlement = {
  buyerLimit: number | null
  buyerLimitLabel: string
  activeDealLimit: number | null
  activeDealLimitLabel: string
  buyerPortalReview: BuyerPortalReviewAccess
  buyerPortalReviewLabel: string
}

export const PLAN_ENTITLEMENTS: Record<PublicPlanName, PlanEntitlement> = {
  Free: {
    buyerLimit: 25,
    buyerLimitLabel: 'Up to 25 buyers',
    activeDealLimit: 3,
    activeDealLimitLabel: 'Up to 3 active deals',
    buyerPortalReview: 'locked',
    buyerPortalReviewLabel: 'Not included',
  },
  'Free Demo': {
    buyerLimit: 25,
    buyerLimitLabel: 'Up to 25 buyers',
    activeDealLimit: 3,
    activeDealLimitLabel: 'Up to 3 active deals',
    buyerPortalReview: 'locked',
    buyerPortalReviewLabel: 'Not included',
  },
  Starter: {
    buyerLimit: 250,
    buyerLimitLabel: 'Up to 250 buyers',
    activeDealLimit: 25,
    activeDealLimitLabel: 'Up to 25 active deals',
    buyerPortalReview: 'locked',
    buyerPortalReviewLabel: 'Not included',
  },
  Pro: {
    buyerLimit: 1000,
    buyerLimitLabel: 'Up to 1,000 buyers',
    activeDealLimit: 999,
    activeDealLimitLabel: 'High-volume active deals',
    buyerPortalReview: 'coming-soon',
    buyerPortalReviewLabel: 'Coming Soon',
  },
  Agency: {
    buyerLimit: 2000,
    buyerLimitLabel: 'Up to 2,000 buyers',
    activeDealLimit: 999,
    activeDealLimitLabel: 'Team active deal capacity',
    buyerPortalReview: 'coming-soon',
    buyerPortalReviewLabel: 'Coming Soon',
  },
  Enterprise: {
    buyerLimit: 5000,
    buyerLimitLabel: 'Up to 5,000 buyers',
    activeDealLimit: null,
    activeDealLimitLabel: 'Custom',
    buyerPortalReview: 'custom',
    buyerPortalReviewLabel: 'Custom / Contact Admin',
  },
}

export const OWNER_ADMIN_ENTITLEMENTS: PlanEntitlement = {
  buyerLimit: null,
  buyerLimitLabel: 'Owner Admin testing',
  activeDealLimit: null,
  activeDealLimitLabel: 'Owner Admin testing',
  buyerPortalReview: 'available',
  buyerPortalReviewLabel: 'Owner Admin only',
}

export function normalizePlanName(plan?: string | null): PublicPlanName {
  const normalized = String(plan || '').trim().toLowerCase()
  if (normalized === 'free' || normalized === 'free demo') return 'Free'
  if (normalized === 'starter') return 'Starter'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'agency') return 'Agency'
  if (normalized === 'enterprise') return 'Enterprise'
  return 'Free'
}

export function getPlanEntitlement(plan?: PlanName | string | null): PlanEntitlement {
  if (plan === 'Owner Admin') return OWNER_ADMIN_ENTITLEMENTS
  return PLAN_ENTITLEMENTS[normalizePlanName(plan)]
}

export function canUseBuyerPortalReview(plan?: PlanName | string | null) {
  return getPlanEntitlement(plan).buyerPortalReview === 'available'
}

export function getBuyerCapacity(plan: PlanName | string | null | undefined, savedBuyerCount: number, purchasedCapacity = 0) {
  const entitlement = getPlanEntitlement(plan)
  const limit = entitlement.buyerLimit
  const purchased = Math.max(0, Number(purchasedCapacity) || 0)
  const effectiveLimit = limit === null ? null : limit + purchased
  const current = Math.max(0, Number(savedBuyerCount) || 0)
  const remaining = effectiveLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, effectiveLimit - current)

  return {
    plan: normalizePlanName(plan),
    limit: effectiveLimit,
    baseLimit: limit,
    purchasedCapacity: purchased,
    limitLabel: purchased > 0 && limit !== null ? `${entitlement.buyerLimitLabel} + ${purchased.toLocaleString()} purchased` : entitlement.buyerLimitLabel,
    current,
    remaining,
    isUnlimited: effectiveLimit === null,
    isAtLimit: effectiveLimit !== null && current >= effectiveLimit,
  }
}

export function formatBuyerCapacityRemaining(remaining: number, isUnlimited: boolean) {
  return isUnlimited ? 'Unlimited' : remaining.toLocaleString()
}
