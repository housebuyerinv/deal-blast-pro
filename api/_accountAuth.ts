import { createClient } from '@supabase/supabase-js'

const PLAN_RANK: Record<string, number> = {
  free: 0,
  'free demo': 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
  'owner admin': 5,
}

const ACTIVE_BILLING_STATUSES = new Set([
  'free active',
  'trial active',
  'paid active',
  'comped',
  'preview active',
])

export function cleanString(value: any) {
  return String(value || '').trim()
}

export function getSupabaseAdminClient() {
  const supabaseUrl = cleanString(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceRoleKey = cleanString(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw Object.assign(new Error('Supabase admin environment is not configured.'), {
      status: 500,
      code: 'supabase_not_configured',
    })
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function getBearerToken(req: any) {
  const header = cleanString(req.headers?.authorization || req.headers?.Authorization)
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

export function isOwnerAdminEmail(email: string) {
  const normalized = cleanString(email).toLowerCase()
  const configured = cleanString(process.env.DEALBLAST_OWNER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAILS)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return normalized === 'housebuyerinv@gmail.com' || configured.includes(normalized)
}

export function planRank(plan: string) {
  return PLAN_RANK[cleanString(plan).toLowerCase()] ?? 0
}

export function isActiveBillingStatus(status: string) {
  const normalized = cleanString(status).toLowerCase()
  return !normalized || ACTIVE_BILLING_STATUSES.has(normalized)
}

export async function getAuthenticatedAccount(req: any) {
  const token = getBearerToken(req)
  if (!token) {
    throw Object.assign(new Error('Sign in is required.'), { status: 401, code: 'auth_required' })
  }

  const adminClient = getSupabaseAdminClient()
  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !userData?.user) {
    throw Object.assign(new Error('Your session could not be verified.'), { status: 401, code: 'invalid_session' })
  }

  const user = userData.user
  const email = cleanString(user.email)
  const isOwnerAdmin = isOwnerAdminEmail(email)

  const { data: profile } = await adminClient
    .from('account_profiles')
    .select('user_id,email,full_name,role,account_status,deactivated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: workspace } = await adminClient
    .from('workspaces')
    .select('id,owner_user_id,owner_email,name,account_status,deactivated_at')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  const { data: plan } = await adminClient
    .from('workspace_plan_assignments')
    .select('workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,access_deactivated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const profileStatus = cleanString(profile?.account_status || 'Active')
  const workspaceStatus = cleanString(workspace?.account_status || 'Active')
  const accessStatus = cleanString(plan?.access_status || 'Active')
  const deactivated = [profileStatus, workspaceStatus, accessStatus].some(status =>
    ['Deactivated', 'Deleted'].includes(status)
  )
  const rawPlanName = cleanString(plan?.plan_name || 'Free')
  const normalizedPlanName = rawPlanName === 'Free Demo' ? 'Free' : rawPlanName
  const rawBillingStatus = cleanString(plan?.billing_status || (normalizedPlanName === 'Free' ? 'Free Active' : 'Trial Active'))

  return {
    adminClient,
    user,
    email,
    isOwnerAdmin,
    profile,
    workspace,
    plan,
    deactivated,
    accountStatus: deactivated ? 'Deactivated' : profileStatus,
    planName: normalizedPlanName,
    billingStatus: rawBillingStatus === 'Trial Active' && normalizedPlanName === 'Free' ? 'Free Active' : rawBillingStatus,
  }
}

export function canUsePropertyIntelligence(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>) {
  if (account.isOwnerAdmin) return true
  if (account.deactivated) return false
  return planRank(account.planName) >= PLAN_RANK.pro && isActiveBillingStatus(account.billingStatus)
}
