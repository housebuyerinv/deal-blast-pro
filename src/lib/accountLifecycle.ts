import type { TrialState } from './types'

export const PAST_DUE_READ_ONLY_DAYS = 6
export const PAST_DUE_RESTRICTED_DAYS = 29
export const ACCOUNT_RETENTION_DAYS = 30

export type PastDueStage = 'current' | 'read-only' | 'restricted' | 'free-effective'

export function daysSince(dateValue?: string | null) {
  if (!dateValue) return 0
  const time = new Date(dateValue).getTime()
  if (!Number.isFinite(time)) return 0
  return Math.max(0, Math.floor((Date.now() - time) / 86400000))
}

export function getPastDueStage(trial: Pick<TrialState, 'billingStatus' | 'billingUpdatedAt'>): PastDueStage {
  if (trial.billingStatus !== 'Past Due') return 'current'

  const daysPastDue = daysSince(trial.billingUpdatedAt)
  if (daysPastDue >= 30) return 'free-effective'
  if (daysPastDue >= 7) return 'restricted'
  return 'read-only'
}

export function getPastDuePolicyMessage(stage: PastDueStage) {
  if (stage === 'read-only') {
    return 'Your payment is past due. Access is read-only during days 1-6 so you can review records, update billing, cancel, or deactivate.'
  }

  if (stage === 'restricted') {
    return 'Your payment is past due. Paid workflows are restricted during days 7-29 until payment is recovered, cancellation is completed, or support resolves the account.'
  }

  if (stage === 'free-effective') {
    return 'Your payment is 30+ days past due. Access is limited to the effective Free plan until payment is recovered. Your billing plan and retained data are not erased.'
  }

  return ''
}

export function getPastDueEffectivePlan<T extends string>(plan: T, stage: PastDueStage): T | 'Free' {
  return stage === 'free-effective' ? 'Free' : plan
}
