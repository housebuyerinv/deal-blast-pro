import type { AppSettings, TrialState, User } from './types'
import { hasOwnerAdminBypass, isSuperAdmin } from './accessControl'
import { getPastDueEffectivePlan, getPastDuePolicyMessage, getPastDueStage } from './accountLifecycle'

export type PlanName = TrialState['plan'] | 'Owner Admin'
export type AppRoute =
  | '/app/dashboard'
  | '/app/submissions'
  | '/app/inventory'
  | '/app/buyers'
  | '/app/resources'
  | '/app/blast'
  | '/app/calculator'
  | '/app/settings'
  | '/app/upgrade'
  | '/app/intake'
  | '/app/followups'
  | '/app/analytics'
  | '/app/pipeline'

export const ALL_APP_ROUTES: AppRoute[] = [
  '/app/dashboard',
  '/app/submissions',
  '/app/inventory',
  '/app/buyers',
  '/app/resources',
  '/app/blast',
  '/app/calculator',
  '/app/settings',
  '/app/upgrade',
  '/app/intake',
  '/app/followups',
  '/app/analytics',
  '/app/pipeline',
]

export const PLAN_ROUTE_ACCESS: Record<Exclude<PlanName, 'Owner Admin'>, AppRoute[]> = {
  Free: ['/app/dashboard', '/app/inventory', '/app/buyers', '/app/calculator', '/app/settings', '/app/upgrade'],
  'Free Demo': ['/app/dashboard', '/app/inventory', '/app/buyers', '/app/calculator', '/app/settings', '/app/upgrade'],
  Starter: ['/app/dashboard', '/app/submissions', '/app/inventory', '/app/buyers', '/app/blast', '/app/calculator', '/app/settings', '/app/upgrade', '/app/followups', '/app/pipeline'],
  Pro: ['/app/dashboard', '/app/submissions', '/app/inventory', '/app/buyers', '/app/resources', '/app/blast', '/app/calculator', '/app/settings', '/app/upgrade', '/app/followups', '/app/analytics', '/app/pipeline'],
  Agency: ALL_APP_ROUTES,
  Enterprise: ALL_APP_ROUTES,
}

function normalizeAccessPlan(plan?: string | null): Exclude<PlanName, 'Owner Admin'> {
  const normalized = String(plan || '').trim().toLowerCase()
  if (normalized === 'starter') return 'Starter'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'agency') return 'Agency'
  if (normalized === 'enterprise') return 'Enterprise'
  return 'Free'
}

export function getOwnerPreviewPlan(settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null): PlanName {
  const previewPlan = settings?.ownerPreviewPlan || 'Owner Admin'
  return previewPlan || 'Owner Admin'
}

export function isOwnerPreviewActive(user?: Pick<User, 'email'> | null, settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null) {
  return isSuperAdmin(user) && getOwnerPreviewPlan(settings) !== 'Owner Admin'
}

export function hasEffectiveOwnerAdminBypass(
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  return hasOwnerAdminBypass(user) && !isOwnerPreviewActive(user, settings)
}

export function getOwnerPreviewContext(
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  const plan = getOwnerPreviewPlan(settings)
  const active = isOwnerPreviewActive(user, settings)
  return {
    active,
    plan,
    role: active ? 'Workspace Owner' as const : 'Owner Admin' as const,
    billingStatus: active ? (plan === 'Free' ? 'Free Active' as const : 'Preview Active' as const) : 'Owner Admin' as const,
    mutatesAccount: false,
  }
}

export function getEffectivePlan(
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
): PlanName {
  if (isSuperAdmin(user)) return getOwnerPreviewPlan(settings)
  const pastDuePlan = getPastDueEffectivePlan(trial.plan || (trial.isPaid ? 'Pro' : 'Free'), getPastDueStage(trial))
  if (pastDuePlan === 'Free') return 'Free'
  const scheduledPlan = trial.scheduledPlan
  const scheduledAt = trial.scheduledPlanChangeAt ? new Date(trial.scheduledPlanChangeAt).getTime() : 0
  if (scheduledPlan && Number.isFinite(scheduledAt) && scheduledAt > 0 && Date.now() >= scheduledAt) {
    return normalizeAccessPlan(scheduledPlan)
  }
  if (trial.effectiveAccessPlan) {
    return normalizeAccessPlan(trial.effectiveAccessPlan)
  }
  return trial.plan === 'Free Demo' ? 'Free' : trial.plan || (trial.isPaid ? 'Pro' : 'Free')
}

export function getAllowedRoutes(
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
): AppRoute[] {
  if (hasEffectiveOwnerAdminBypass(user, settings)) return ALL_APP_ROUTES
  const plan = getEffectivePlan(trial, user, settings)
  if (plan === 'Owner Admin') return ALL_APP_ROUTES
  return Array.from(new Set([...(PLAN_ROUTE_ACCESS[plan] || PLAN_ROUTE_ACCESS.Free), '/app/settings' as AppRoute]))
}

export function canAccessRoute(
  route: string,
  trial: TrialState,
  user?: Pick<User, 'email'> | null,
  settings?: Pick<AppSettings, 'ownerPreviewPlan'> | null,
) {
  if (hasEffectiveOwnerAdminBypass(user, settings)) return true
  return getAllowedRoutes(trial, user, settings).includes(route as AppRoute)
}

export function getRequiredPlanForRoute(route: string): 'Starter' | 'Pro' {
  if (PLAN_ROUTE_ACCESS.Starter.includes(route as AppRoute)) return 'Starter'
  return 'Pro'
}

export type BillingNoticeKind =
  | 'none'
  | 'upcoming'
  | 'due-today'
  | 'past-due'
  | 'past-due-grace-ended'
  | 'cancellation-scheduled'
  | 'payment-pending'
  | 'free-demo-limit'

export function getDaysUntil(dateValue?: string) {
  if (!dateValue) return null
  const time = new Date(dateValue).getTime()
  if (!Number.isFinite(time)) return null
  return Math.ceil((time - Date.now()) / 86400000)
}

export function getBillingNotice(
  trial: TrialState,
  deletionRequest?: { accountStatus?: string; scheduledDeletionAt?: string; cancellationRequestedAt?: string },
) {
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : 'Trial Active')
  const dueDays = getDaysUntil(trial.billingPeriodEnd || '')
  const cancelDate = deletionRequest?.scheduledDeletionAt || deletionRequest?.cancellationRequestedAt || trial.billingPeriodEnd || ''

  if (deletionRequest?.accountStatus === 'Cancellation Scheduled') {
    return {
      kind: 'cancellation-scheduled' as BillingNoticeKind,
      title: 'Cancellation scheduled',
      message: `Your account is scheduled to cancel${cancelDate ? ` on ${new Date(cancelDate).toLocaleDateString()}` : ''}. Access remains active until then.`,
      action: 'View Billing Center',
    }
  }

  if (billingStatus === 'Payment Pending') {
    return {
      kind: 'payment-pending' as BillingNoticeKind,
      title: 'Payment pending',
      message: 'Your payment is pending confirmation. Complete payment or choose Free to continue with limited access.',
      action: 'Complete Payment',
    }
  }

  if (billingStatus === 'Past Due') {
    const stage = getPastDueStage(trial)
    const graceEnded = stage !== 'read-only'
    return {
      kind: graceEnded ? 'past-due-grace-ended' as BillingNoticeKind : 'past-due' as BillingNoticeKind,
      title: 'Payment past due',
      message: getPastDuePolicyMessage(stage),
      action: 'Complete Payment',
    }
  }

  if ((billingStatus === 'Paid Active' || billingStatus === 'Comped') && dueDays !== null && dueDays <= 7) {
    return {
      kind: dueDays <= 0 ? 'due-today' as BillingNoticeKind : 'upcoming' as BillingNoticeKind,
      title: dueDays <= 0 ? 'Payment due today' : 'Upcoming payment',
      message: dueDays <= 0
        ? 'Your next payment is due today.'
        : `Your next payment is due in ${dueDays} day${dueDays === 1 ? '' : 's'}.`,
      action: 'View Billing Center',
    }
  }

  if (billingStatus === 'Trial Active' && (trial.plan || 'Free') === 'Free Demo' && (!trial.isActive || (trial.daysLeft || 0) <= 0)) {
    return {
      kind: 'free-demo-limit' as BillingNoticeKind,
      title: 'Free plan limit reached',
      message: 'Upgrade to Starter or Pro to continue creating new activity.',
      action: 'Upgrade',
    }
  }

  return {
    kind: 'none' as BillingNoticeKind,
    title: 'No billing notice',
    message: 'Your billing status does not need attention right now.',
    action: '',
  }
}
