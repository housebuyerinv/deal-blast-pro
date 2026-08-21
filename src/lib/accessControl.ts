import type { User } from './types'

export function isSuperAdmin(user?: Pick<User, 'isOwnerAdmin'> | null) {
  return user?.isOwnerAdmin === true
}

export function isInternalAdmin(user?: Pick<User, 'isOwnerAdmin'> | null) {
  return isSuperAdmin(user)
}

/**
 * Authoritative product-entitlement bypass for the allowlisted platform owner.
 * This covers plans, trials, credits, billing gates, and feature navigation only.
 * Callers must still enforce authentication, legal, consent, and proof-of-control safeguards.
 */
export function hasOwnerAdminBypass(user?: Pick<User, 'isOwnerAdmin'> | null) {
  return isSuperAdmin(user)
}

export function isRegularUser(user?: Pick<User, 'isOwnerAdmin'> | null) {
  return !isSuperAdmin(user)
}
