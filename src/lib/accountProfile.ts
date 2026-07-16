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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: any) {
  return String(value || '').trim()
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

  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw error

  try {
    await supabase.from('account_profile_email_change_events').insert({
      user_id: userData.user.id,
      current_email: clean(userData.user.email).toLowerCase(),
      requested_email: newEmail,
      status: 'verification_pending',
    })
  } catch (auditError) {
    console.warn('[Deal Blast Pro] Email change audit insert failed', auditError)
  }

  return { requestedEmail: newEmail }
}
