import { supabase } from './supabaseClient'

export type AccountProfile = {
  user_id: string
  email: string
  full_name: string
  display_name?: string | null
  business_name?: string | null
  company?: string | null
  avatar_url?: string | null
  updated_at?: string | null
}

export type EditableAccountProfile = {
  fullName: string
  displayName: string
  businessName: string
}

type EmailChangeAuditStatus =
  | 'email_change_requested'
  | 'email_change_completed'
  | 'email_change_failed'
  | 'email_change_canceled'
  | 'email_change_expired'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: any) {
  return String(value || '').trim()
}

export function getFriendlyEmailChangeError(error: any) {
  const message = clean(error?.message || error?.error_description || error?.code).toLowerCase()
  if (!message) return 'Unable to update email right now. Please try again.'
  if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
    return 'That email address is already in use.'
  }
  if (message.includes('invalid') || message.includes('format')) {
    return 'Enter a valid email address.'
  }
  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many email change attempts. Please wait and try again.'
  }
  if (message.includes('expired') || message.includes('session') || message.includes('jwt')) {
    return 'Your session expired. Sign in again before changing your email.'
  }
  if (message.includes('confirm') || message.includes('verification')) {
    return 'A verification email is already pending. Check your inbox or try again later.'
  }
  return 'Unable to update email right now. Please try again.'
}

async function resolveAccountWorkspaceId(userId: string) {
  if (!supabase || !userId) return null
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle()

    if (error) return null
    return data?.id || null
  } catch {
    return null
  }
}

export async function auditEmailChangeEvent(input: {
  userId: string
  currentEmail: string
  requestedEmail: string
  status: EmailChangeAuditStatus
  metadata?: Record<string, any>
}) {
  if (!supabase || !input.userId) return
  try {
    const workspaceId = await resolveAccountWorkspaceId(input.userId)
    await supabase.from('account_profile_email_change_events').insert({
      user_id: input.userId,
      workspace_id: workspaceId,
      event_type: input.status,
      current_email: clean(input.currentEmail).toLowerCase(),
      requested_email: clean(input.requestedEmail).toLowerCase(),
      status: input.status,
      metadata: input.metadata || {},
    })
  } catch (auditError) {
    console.warn('[Deal Blast Pro] Email change audit insert failed', auditError)
  }
}

export function deriveDisplayName(profile: Partial<AccountProfile> | null | undefined, fallbackEmail = '') {
  const displayName = clean(profile?.display_name)
  if (displayName) return displayName
  const fullName = clean(profile?.full_name)
  if (fullName) return fullName.split(/\s+/)[0] || fullName
  return clean(fallbackEmail).split('@')[0] || 'User'
}

export function profileToUserNames(profile: Partial<AccountProfile> | null | undefined, fallbackEmail = '') {
  const fullName = clean(profile?.full_name)
  const displayName = clean(profile?.display_name)
  const businessName = clean(profile?.business_name || profile?.company)
  return {
    fullName,
    displayName,
    businessName,
    name: displayName || (fullName ? fullName.split(/\s+/)[0] : '') || clean(fallbackEmail).split('@')[0] || 'User',
    company: businessName || 'Deal Blast Pro Workspace',
  }
}

export async function loadAccountProfile() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const authUser = userData.user
  if (!authUser?.id) throw new Error('Sign in before loading your account profile.')

  const { data, error } = await supabase
    .from('account_profiles')
    .select('user_id,email,full_name,display_name,business_name,company,avatar_url,updated_at')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (error) throw error
  return {
    authUser,
    profile: data as AccountProfile | null,
  }
}

export async function saveAccountProfile(input: EditableAccountProfile) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const fullName = clean(input.fullName)
  const displayName = clean(input.displayName)
  const businessName = clean(input.businessName)
  if (!fullName) throw new Error('Full Name is required.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const authUser = userData.user
  if (!authUser?.id || !authUser.email) throw new Error('Sign in before saving your profile.')

  const row = {
    user_id: authUser.id,
    email: authUser.email.toLowerCase(),
    full_name: fullName,
    display_name: displayName || null,
    business_name: businessName || null,
    company: businessName || null,
    updated_by_user_id: authUser.id,
  }

  const { data, error } = await supabase
    .from('account_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('user_id,email,full_name,display_name,business_name,company,avatar_url,updated_at')
    .single()

  if (error) throw error
  return data as AccountProfile
}

export async function requestVerifiedEmailChange(newEmailInput: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const newEmail = clean(newEmailInput).toLowerCase()
  if (!EMAIL_PATTERN.test(newEmail)) throw new Error('Enter a valid email address.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userData.user?.id) throw new Error('Sign in before changing your email address.')
  if (newEmail === clean(userData.user.email).toLowerCase()) {
    throw new Error('Enter a different email address.')
  }

  const currentEmail = clean(userData.user.email).toLowerCase()
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${window.location.origin}/auth/callback?type=email_change` },
  )
  if (error) {
    await auditEmailChangeEvent({
      userId: userData.user.id,
      currentEmail,
      requestedEmail: newEmail,
      status: 'email_change_failed',
      metadata: { failure_category: getFriendlyEmailChangeError(error) },
    })
    throw new Error(getFriendlyEmailChangeError(error))
  }

  await auditEmailChangeEvent({
    userId: userData.user.id,
    currentEmail,
    requestedEmail: newEmail,
    status: 'email_change_requested',
    metadata: { result: 'verification_pending' },
  })

  return { requestedEmail: newEmail }
}

export async function syncVerifiedAuthEmailToProfile() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const authUser = userData.user
  const verifiedEmail = clean(authUser?.email).toLowerCase()
  if (!authUser?.id || !verifiedEmail) throw new Error('Sign in before syncing your verified email.')

  const { data: before } = await supabase
    .from('account_profiles')
    .select('email')
    .eq('user_id', authUser.id)
    .maybeSingle()

  const previousEmail = clean(before?.email).toLowerCase()
  if (previousEmail && previousEmail !== verifiedEmail) {
    const { error } = await supabase
      .from('account_profiles')
      .update({
        email: verifiedEmail,
        updated_by_user_id: authUser.id,
      })
      .eq('user_id', authUser.id)

    if (error) {
      await auditEmailChangeEvent({
        userId: authUser.id,
        currentEmail: previousEmail,
        requestedEmail: verifiedEmail,
        status: 'email_change_failed',
        metadata: { failure_category: 'profile_sync_failed_after_auth_verification' },
      })
      throw error
    }

    await auditEmailChangeEvent({
      userId: authUser.id,
      currentEmail: previousEmail,
      requestedEmail: verifiedEmail,
      status: 'email_change_completed',
      metadata: { result: 'verified_auth_email_synced_to_profile' },
    })
  }

  return { verifiedEmail, previousEmail }
}
