import type { AppSettings, TrialState, User } from './types'
import { isSuperAdmin } from './accessControl'
import { getOwnerPreviewPlan } from './planAccess'

export type CalculatorTabId = 'arv' | 'rehab' | 'mao' | 'rental' | 'creative'
type PlanName = TrialState['plan']
type CalculatorMinimumPlan = 'Free' | 'Free Demo' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'

export type CalculatorEntitlementId = CalculatorTabId | 'propertyIntelligence'

export const PLAN_RANK: Record<CalculatorMinimumPlan, number> = {
  Free: 0,
  'Free Demo': 0,
  Starter: 1,
  Pro: 2,
  Agency: 3,
  Enterprise: 4,
}

export const CALCULATOR_ENTITLEMENTS: Record<CalculatorEntitlementId, {
  label: string
  minimumPlan: CalculatorMinimumPlan
  availability?: 'included' | 'limited-preview' | 'planned' | 'advanced' | 'custom'
}> = {
  arv: { label: 'ARV Calculator', minimumPlan: 'Free', availability: 'included' },
  rehab: { label: 'Rehab Calculator', minimumPlan: 'Starter', availability: 'included' },
  mao: { label: 'MAO / Offer Calculator', minimumPlan: 'Starter', availability: 'included' },
  rental: { label: 'Rental Deal Calculator', minimumPlan: 'Pro', availability: 'included' },
  creative: { label: 'Creative Finance Calculator', minimumPlan: 'Pro', availability: 'included' },
  propertyIntelligence: { label: 'Property Intelligence', minimumPlan: 'Pro', availability: 'included' },
}

export const CALCULATOR_ACCESS_BY_PLAN: Record<PlanName, CalculatorTabId[]> = {
  Free: ['arv'],
  'Free Demo': ['arv'],
  Starter: ['arv', 'rehab', 'mao'],
  Pro: ['arv', 'rehab', 'mao', 'rental', 'creative'],
  Agency: ['arv', 'rehab', 'mao', 'rental', 'creative'],
  Enterprise: ['arv', 'rehab', 'mao', 'rental', 'creative'],
}

export function getEffectiveCalculatorPlan(
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
): CalculatorMinimumPlan | 'Owner Admin' {
  if (isSuperAdmin(user)) {
    const previewPlan = getOwnerPreviewPlan(settings)
    return previewPlan === 'Owner Admin' ? 'Owner Admin' : previewPlan
  }
  return trial.plan === 'Free Demo' ? 'Free' : trial.plan || (trial.isPaid ? 'Pro' : 'Free')
}

export function getAllowedCalculatorTabs(
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
): CalculatorTabId[] {
  const plan = getEffectiveCalculatorPlan(trial, user, settings)
  if (plan === 'Owner Admin') return CALCULATOR_ACCESS_BY_PLAN.Pro
  return CALCULATOR_ACCESS_BY_PLAN[plan] || CALCULATOR_ACCESS_BY_PLAN.Free
}

export function canAccessCalculatorTab(
  tab: CalculatorTabId,
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  return getAllowedCalculatorTabs(trial, user, settings).includes(tab)
}

export function canAccessCalculatorEntitlement(
  entitlement: CalculatorEntitlementId,
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  const plan = getEffectiveCalculatorPlan(trial, user, settings)
  if (plan === 'Owner Admin') return true
  const config = CALCULATOR_ENTITLEMENTS[entitlement]
  return PLAN_RANK[plan] >= PLAN_RANK[config.minimumPlan]
}

export function getCalculatorLockMessage(
  entitlement: CalculatorEntitlementId,
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  const config = CALCULATOR_ENTITLEMENTS[entitlement]
  const plan = getEffectiveCalculatorPlan(trial, user, settings)
  const currentPlan = plan === 'Owner Admin' ? 'Owner Admin' : plan
  return {
    label: config.label,
    requiredPlan: config.minimumPlan,
    currentPlan,
    message: `${config.label} requires ${config.minimumPlan} or higher.`,
  }
}

export function getCalculatorPlanSubtitle(plan: CalculatorMinimumPlan | 'Owner Admin') {
  if (plan === 'Owner Admin') return 'Owner Admin: all calculators'
  if (plan === 'Free' || plan === 'Free Demo') return 'Free: ARV only'
  if (plan === 'Starter') return 'Starter: ARV, Rehab, MAO / Offer'
  if (plan === 'Pro') return 'Pro: All deal calculators'
  if (plan === 'Agency') return 'Agency: All calculators and advanced workflows'
  return 'Enterprise: All calculators and custom property-data integrations'
}
