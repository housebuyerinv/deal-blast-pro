import type { User } from './types'
import { SUPER_ADMIN_EMAILS } from './constants'

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export function isSuperAdmin(user?: Pick<User, 'email'> | null) {
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(user?.email) as typeof SUPER_ADMIN_EMAILS[number])
}

export function isInternalAdmin(user?: Pick<User, 'email'> | null) {
  return isSuperAdmin(user)
}

/**
 * Authoritative product-entitlement bypass for the allowlisted platform owner.
 * This covers plans, trials, credits, billing gates, and feature navigation only.
 * Callers must still enforce authentication, legal, consent, and proof-of-control safeguards.
 */
export function hasOwnerAdminBypass(user?: Pick<User, 'email'> | null) {
  return isSuperAdmin(user)
}

export function isRegularUser(user?: Pick<User, 'email'> | null) {
  return !isSuperAdmin(user)
}
