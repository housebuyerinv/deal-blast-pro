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

const SOFTWARE_ACCESS_BILLING_STATUSES = new Set([
  'free active',
  'trial active',
  'paid active',
  'comped',
  'preview active',
])

const PAID_EXTERNAL_RESOURCE_BILLING_STATUSES = new Set([
  'paid active',
])

const PAID_EXTERNAL_RESOURCE_SUBSCRIPTION_STATUSES = new Set([
  'active',
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

export function hasSoftwareAccessBillingStatus(status: string) {
  const normalized = cleanString(status).toLowerCase()
  return !normalized || SOFTWARE_ACCESS_BILLING_STATUSES.has(normalized)
}

export function hasPaidExternalResourceEntitlement(input: {
  billingStatus?: string | null
  paymentStatus?: string | null
  subscriptionStatus?: string | null
}) {
  return PAID_EXTERNAL_RESOURCE_BILLING_STATUSES.has(cleanString(input.billingStatus).toLowerCase()) &&
    cleanString(input.paymentStatus).toLowerCase() === 'paid' &&
    PAID_EXTERNAL_RESOURCE_SUBSCRIPTION_STATUSES.has(cleanString(input.subscriptionStatus).toLowerCase())
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
  const fullName = cleanString(user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'User')
  const workspaceName = cleanString(user.user_metadata?.company || user.user_metadata?.business_name || `${fullName}'s Workspace`)

  let { data: profile } = await adminClient
    .from('account_profiles')
    .select('user_id,email,full_name,display_name,business_name,company,role,account_status,deactivated_at,dismissed_promotion_key,dismissed_promotion_at,product_updates_opt_in,product_updates_preference_updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const { data: repairedProfile } = await adminClient
      .from('account_profiles')
      .upsert({
        user_id: user.id,
        email: email.toLowerCase(),
        full_name: fullName,
        company: cleanString(user.user_metadata?.company || user.user_metadata?.business_name),
        role: 'Admin',
      }, { onConflict: 'user_id' })
      .select('user_id,email,full_name,display_name,business_name,company,role,account_status,deactivated_at,dismissed_promotion_key,dismissed_promotion_at,product_updates_opt_in,product_updates_preference_updated_at')
      .maybeSingle()
    profile = repairedProfile || null
  }

  let { data: workspace } = await adminClient
    .from('workspaces')
    .select('id,owner_user_id,owner_email,name,account_status,deactivated_at')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!workspace) {
    const { data: repairedWorkspace } = await adminClient
      .from('workspaces')
      .upsert({
        owner_user_id: user.id,
        owner_email: email.toLowerCase(),
        name: workspaceName,
      }, { onConflict: 'owner_user_id' })
      .select('id,owner_user_id,owner_email,name,account_status,deactivated_at')
      .maybeSingle()
    workspace = repairedWorkspace || null
  }

  let { data: plan } = await adminClient
    .from('workspace_plan_assignments')
    .select('workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,access_deactivated_at,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,cancel_at_period_end,outstanding_balance,latest_invoice_status,latest_invoice_hosted_url,latest_invoice_pdf,current_plan,effective_access_plan,scheduled_plan,scheduled_plan_change_at,billing_interval,stripe_price_id,purchased_buyer_capacity,buyer_capacity_mode,buyer_capacity_limit,property_intelligence_included_credits,trial_started_at,trial_ends_at,trial_converted_at,trial_consumed_at,first_paid_at,trial_checkout_session_id,trial_checkout_created_at,promotion_code,stripe_promotion_code_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!plan && workspace?.id) {
    const { data: planByWorkspace } = await adminClient
      .from('workspace_plan_assignments')
      .select('workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,access_deactivated_at,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,cancel_at_period_end,outstanding_balance,latest_invoice_status,latest_invoice_hosted_url,latest_invoice_pdf,current_plan,effective_access_plan,scheduled_plan,scheduled_plan_change_at,billing_interval,stripe_price_id,purchased_buyer_capacity,buyer_capacity_mode,buyer_capacity_limit,property_intelligence_included_credits,trial_started_at,trial_ends_at,trial_converted_at,trial_consumed_at,first_paid_at,trial_checkout_session_id,trial_checkout_created_at,promotion_code,stripe_promotion_code_id')
      .eq('workspace_id', workspace.id)
      .maybeSingle()
    plan = planByWorkspace || null
  }

  if (workspace?.id && (!plan || cleanString(plan.user_id) !== user.id || cleanString(plan.workspace_id) !== workspace.id)) {
    const repairedPlan = {
      ...(plan || {}),
      workspace_id: workspace.id,
      user_id: user.id,
      plan_name: cleanString(plan?.plan_name) || (isOwnerAdmin ? 'Owner Admin' : 'Free'),
      billing_status: cleanString(plan?.billing_status) || (isOwnerAdmin ? 'Comped' : 'Free Active'),
      trial_status: cleanString(plan?.trial_status) || (isOwnerAdmin ? 'Comped' : 'Trial Active'),
      payment_status: cleanString(plan?.payment_status) || (isOwnerAdmin ? 'No payment required' : 'No payment required'),
      access_status: cleanString(plan?.access_status) || 'Active',
      current_plan: cleanString(plan?.current_plan) || cleanString(plan?.plan_name) || (isOwnerAdmin ? 'Owner Admin' : 'Free'),
      effective_access_plan: cleanString(plan?.effective_access_plan) || cleanString(plan?.plan_name) || (isOwnerAdmin ? 'Owner Admin' : 'Free'),
      buyer_capacity_mode: isOwnerAdmin ? 'unlimited' : cleanString(plan?.buyer_capacity_mode) || 'finite',
      buyer_capacity_limit: isOwnerAdmin ? null : plan?.buyer_capacity_limit ?? null,
    }

    const { data: updatedPlan } = await adminClient
      .from('workspace_plan_assignments')
      .upsert(repairedPlan, { onConflict: 'workspace_id' })
      .select('workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,access_deactivated_at,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,cancel_at_period_end,outstanding_balance,latest_invoice_status,latest_invoice_hosted_url,latest_invoice_pdf,current_plan,effective_access_plan,scheduled_plan,scheduled_plan_change_at,billing_interval,stripe_price_id,purchased_buyer_capacity,buyer_capacity_mode,buyer_capacity_limit,property_intelligence_included_credits')
      .maybeSingle()
    plan = updatedPlan || plan
  }

  if (isOwnerAdmin && workspace?.id && cleanString(plan?.buyer_capacity_mode).toLowerCase() !== 'unlimited') {
    const { data: updatedCapacityPlan } = await adminClient
      .from('workspace_plan_assignments')
      .update({
        buyer_capacity_mode: 'unlimited',
        buyer_capacity_limit: null,
      })
      .eq('workspace_id', workspace.id)
      .select('workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,access_deactivated_at,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,cancel_at_period_end,outstanding_balance,latest_invoice_status,latest_invoice_hosted_url,latest_invoice_pdf,current_plan,effective_access_plan,scheduled_plan,scheduled_plan_change_at,billing_interval,stripe_price_id,purchased_buyer_capacity,buyer_capacity_mode,buyer_capacity_limit,property_intelligence_included_credits')
      .maybeSingle()
    plan = updatedCapacityPlan || plan
  }

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
  return planRank(account.planName) >= PLAN_RANK.starter && hasPaidExternalResourceEntitlement({
    billingStatus: account.billingStatus,
    paymentStatus: account.plan?.payment_status,
    subscriptionStatus: account.plan?.subscription_status,
  })
}
