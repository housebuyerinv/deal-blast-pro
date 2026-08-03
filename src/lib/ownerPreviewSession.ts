import type { AppSettings } from './types'

export const OWNER_PREVIEW_SESSION_KEY = 'dealblastpro:owner-preview-plan:v1'
const PLANS = new Set(['Owner Admin', 'Free', 'Starter', 'Pro', 'Agency', 'Enterprise'])

export type OwnerPreviewPlan = NonNullable<AppSettings['ownerPreviewPlan']>

export function readOwnerPreviewSession(): OwnerPreviewPlan {
  if (typeof window === 'undefined') return 'Owner Admin'
  try {
    const value = window.sessionStorage.getItem(OWNER_PREVIEW_SESSION_KEY) || ''
    return PLANS.has(value) ? value as OwnerPreviewPlan : 'Owner Admin'
  } catch {
    return 'Owner Admin'
  }
}

export function writeOwnerPreviewSession(plan: OwnerPreviewPlan) {
  if (typeof window === 'undefined') return
  try {
    if (plan === 'Owner Admin') window.sessionStorage.removeItem(OWNER_PREVIEW_SESSION_KEY)
    else window.sessionStorage.setItem(OWNER_PREVIEW_SESSION_KEY, plan)
  } catch {
    // Preview remains safe in memory if session storage is unavailable.
  }
}

export function clearOwnerPreviewSession() {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(OWNER_PREVIEW_SESSION_KEY) } catch {}
}
