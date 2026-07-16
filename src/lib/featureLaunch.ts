import type { PlanName } from './planAccess'

export type FeatureLaunchStatus = 'active' | 'coming_soon' | 'internal_testing' | 'disabled'

export type FeatureKey =
  | 'dealSubmissionReviewCenter'
  | 'buyerPortalReviewCenter'
  | 'customBuyerPortal'
  | 'customDealSubmissionPortal'
  | 'globalBuyerHub'
  | 'teamAccess'
  | 'rolePermissions'
  | 'agencyMultiUserTools'
  | 'enterpriseIntegrations'

export type FeatureLaunchConfig = {
  minimumPlan: PlanName
  launchStatus: FeatureLaunchStatus
  ownerAdminTestAccess: boolean
  label: string
  description: string
}

const PLAN_RANK: Record<PlanName, number> = {
  Free: 0,
  'Free Demo': 0,
  Starter: 1,
  Pro: 2,
  Agency: 3,
  Enterprise: 4,
  'Owner Admin': 5,
}

export const FEATURE_LAUNCH: Record<FeatureKey, FeatureLaunchConfig> = {
  dealSubmissionReviewCenter: {
    minimumPlan: 'Pro',
    launchStatus: 'internal_testing',
    ownerAdminTestAccess: true,
    label: 'Deal Submission Review Center',
    description: 'Coming soon for Pro and higher plans.',
  },
  buyerPortalReviewCenter: {
    minimumPlan: 'Pro',
    launchStatus: 'internal_testing',
    ownerAdminTestAccess: true,
    label: 'Buyer Portal Review Center',
    description: 'Coming soon for Pro and higher plans.',
  },
  customBuyerPortal: {
    minimumPlan: 'Pro',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Custom Buyer Portal',
    description: 'Custom buyer portals are coming soon.',
  },
  customDealSubmissionPortal: {
    minimumPlan: 'Pro',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Custom Deal Submission Portal',
    description: 'Custom deal submission portals are coming soon.',
  },
  globalBuyerHub: {
    minimumPlan: 'Pro',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: false,
    label: 'Global Buyer Hub',
    description: 'The future network buyer hub is not launched yet.',
  },
  teamAccess: {
    minimumPlan: 'Agency',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Team Access',
    description: 'Team and VA access is coming soon.',
  },
  rolePermissions: {
    minimumPlan: 'Agency',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Role Permissions',
    description: 'Role permissions are coming soon.',
  },
  agencyMultiUserTools: {
    minimumPlan: 'Agency',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Agency Multi-User Tools',
    description: 'Agency multi-user workflows are coming soon.',
  },
  enterpriseIntegrations: {
    minimumPlan: 'Enterprise',
    launchStatus: 'coming_soon',
    ownerAdminTestAccess: true,
    label: 'Enterprise Integrations',
    description: 'Enterprise integrations are handled by custom setup.',
  },
}

export function canUseLaunchedFeature(feature: FeatureKey, plan: PlanName, ownerAdmin = false) {
  const config = FEATURE_LAUNCH[feature]
  if (!config) return false
  if (ownerAdmin && config.ownerAdminTestAccess) return true
  if (config.launchStatus !== 'active') return false
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[config.minimumPlan] ?? 999)
}

export function getFeatureLockedMessage(feature: FeatureKey, _plan: PlanName) {
  const config = FEATURE_LAUNCH[feature]
  if (!config) return 'This feature is unavailable.'
  if (config.launchStatus === 'coming_soon' || config.launchStatus === 'internal_testing') {
    return `${config.label} is coming soon for ${config.minimumPlan} and higher plans.`
  }
  return `${config.label} requires ${config.minimumPlan}.`
}
