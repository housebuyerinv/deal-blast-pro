import { createClient } from '@supabase/supabase-js'

type StepStatus = 'pending' | 'ok' | 'skipped' | 'failed'

type RegistrationDiagnostics = Record<string, {
  status: StepStatus
  detail?: string
  id?: string
}>

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function readSupabaseEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase registration environment is not configured.')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

function cleanString(value: any) {
  return String(value || '').trim()
}

function isInternalTestRequest(req: any, body: any) {
  const configuredKey = process.env.REGISTRATION_TEST_KEY
  const providedKey = cleanString(req.headers['x-dealblast-registration-test-key'] || body.registrationTestKey)
  return Boolean(configuredKey && providedKey && providedKey === configuredKey && body.internalTestMode === true)
}

function publicDiagnostics(input: RegistrationDiagnostics, includeDetails: boolean) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      includeDetails ? value : { status: value.status },
    ]),
  )
}

async function findUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const match = data?.users?.find((user: any) => String(user.email || '').toLowerCase() === email)
    if (match) return match
    if (!data?.users || data.users.length < 1000) break
  }
  return null
}

async function notifyAccountCreated(input: {
  supabaseUrl: string
  supabaseAnonKey: string
  origin: string
  userId: string
  workspaceId: string
  email: string
  name: string
  company: string
  role: string
  plan: string
  billingStatus: string
  trialStatus: string
  paymentConfirmed: string
  emailVerified: string
  createdAt: string
}) {
  const idempotencyKey = `new_account_created:${input.userId}`
  const response = await fetch(`${input.supabaseUrl}/functions/v1/notify-submission`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.supabaseAnonKey}`,
      apikey: input.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'account',
      eventType: 'new_account_created',
      workspaceId: input.workspaceId,
      relatedRecordId: input.userId,
      idempotencyKey,
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        name: input.name,
        email: input.email,
        company: input.company,
        workspaceName: input.company || `${input.name}'s Workspace`,
        role: input.role,
        plan: input.plan,
        billingStatus: input.billingStatus,
        trialStatus: input.trialStatus,
        registrationSource: 'Admin Register',
        paymentConfirmed: input.paymentConfirmed,
        emailVerified: input.emailVerified,
        createdAt: input.createdAt,
        accountUrl: `${input.origin}/app/settings`,
      },
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || payload?.emailResult?.reason || `Notification failed with ${response.status}`)
  }

  return payload
}

async function upsertRegistrationRows(input: {
  adminClient: any
  diagnostics: RegistrationDiagnostics
  userId: string
  email: string
  name: string
  company: string
  role: string
  plan: string
  billingStatus: string
  trialStatus: string
  paymentStatus: string
}) {
  const { adminClient, diagnostics } = input

  const { error: profileError } = await adminClient
    .from('account_profiles')
    .upsert({
      user_id: input.userId,
      email: input.email,
      full_name: input.name,
      company: input.company || null,
      role: input.role,
    }, { onConflict: 'user_id' })
  if (profileError) throw profileError
  diagnostics.profile = { status: 'ok', id: input.userId, detail: 'Profile upserted' }

  const workspaceName = input.company || `${input.name}'s Workspace`
  const { data: workspace, error: workspaceError } = await adminClient
    .from('workspaces')
    .upsert({
      owner_user_id: input.userId,
      owner_email: input.email,
      name: workspaceName,
    }, { onConflict: 'owner_user_id' })
    .select('id')
    .single()
  if (workspaceError) throw workspaceError
  const workspaceId = workspace.id
  diagnostics.workspace = { status: 'ok', id: workspaceId, detail: 'Workspace upserted' }

  const { error: planError } = await adminClient
    .from('workspace_plan_assignments')
    .upsert({
      workspace_id: workspaceId,
      user_id: input.userId,
      plan_name: input.plan,
      billing_status: input.billingStatus,
      trial_status: input.trialStatus,
      payment_status: input.paymentStatus,
      source: 'Admin Register',
    }, { onConflict: 'workspace_id' })
  if (planError) throw planError
  diagnostics.plan = { status: 'ok', id: workspaceId, detail: 'Plan assigned' }

  const idempotencyKey = `new_account_created:${input.userId}`
  const { error: eventError } = await adminClient
    .from('account_registration_events')
    .upsert({
      user_id: input.userId,
      workspace_id: workspaceId,
      email: input.email,
      event_type: 'new_account_created',
      idempotency_key: idempotencyKey,
      status: 'created',
      diagnostics,
    }, { onConflict: 'idempotency_key' })
  if (eventError) throw eventError
  diagnostics.event = { status: 'ok', id: idempotencyKey, detail: 'Registration event recorded' }

  return { workspaceId, workspaceName, idempotencyKey }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  const diagnostics: RegistrationDiagnostics = {
    validation: { status: 'pending' },
    auth: { status: 'pending' },
    profile: { status: 'pending' },
    workspace: { status: 'pending' },
    plan: { status: 'pending' },
    event: { status: 'pending' },
    notification: { status: 'pending' },
    emailConfirmation: { status: 'pending' },
  }

  try {
    const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = readSupabaseEnv()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const name = cleanString(body.name)
    const email = cleanString(body.email).toLowerCase()
    const password = String(body.password || '')
    const company = cleanString(body.company)
    const role = cleanString(body.role) || 'Admin'
    const plan = cleanString(body.plan) || 'Free Demo'
    const internalTestMode = isInternalTestRequest(req, body)
    const includeDiagnostics = internalTestMode || body.includeDiagnostics === true

    if (!name || !email || !password) {
      diagnostics.validation = { status: 'failed', detail: 'Name, email, and password are required' }
      return send(res, 400, { ok: false, error: 'Name, email, and password are required.', diagnostics: publicDiagnostics(diagnostics, includeDiagnostics) })
    }
    if (password.length < 6) {
      diagnostics.validation = { status: 'failed', detail: 'Password too short' }
      return send(res, 400, { ok: false, error: 'Password must be at least 6 characters.', diagnostics: publicDiagnostics(diagnostics, includeDiagnostics) })
    }
    diagnostics.validation = { status: 'ok' }

    const origin = cleanString(req.headers.origin) || 'https://deal-blast-pro.vercel.app'
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    const adminClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null

    let authUser: any = adminClient ? await findUserByEmail(adminClient, email) : null
    let session: any = null
    let authCreated = false

    if (authUser) {
      diagnostics.auth = { status: 'ok', id: authUser.id, detail: 'Existing Auth user reused' }
      diagnostics.emailConfirmation = {
        status: authUser.email_confirmed_at ? 'ok' : 'skipped',
        detail: authUser.email_confirmed_at ? 'Email already confirmed' : 'Existing user has pending confirmation',
      }
    } else if (internalTestMode) {
      if (!adminClient) throw new Error('Internal registration test mode requires SUPABASE_SERVICE_ROLE_KEY.')
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          company,
          role,
          plan,
          internal_test: true,
        },
      })
      if (error) throw error
      authUser = data.user
      authCreated = true
      diagnostics.auth = { status: 'ok', id: authUser.id, detail: 'Auth user created with admin test flow' }
      diagnostics.emailConfirmation = { status: 'skipped', detail: 'Admin test flow did not send Supabase confirmation email' }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            full_name: name,
            company,
            role,
            plan,
          },
        },
      })

      if (error) {
        diagnostics.auth = { status: 'failed', detail: error.message }
        diagnostics.emailConfirmation = { status: error.message.toLowerCase().includes('email rate limit') ? 'failed' : 'pending', detail: error.message }
        return send(res, 400, {
          ok: false,
          error: error.message,
          rateLimitHint: error.message.toLowerCase().includes('rate limit')
            ? 'Supabase Auth email delivery is rate-limited. Wait for the project email window to reset or configure production SMTP.'
            : undefined,
          diagnostics: publicDiagnostics(diagnostics, includeDiagnostics),
        })
      }

      authUser = data.user
      session = data.session
      authCreated = true
      diagnostics.auth = { status: 'ok', id: authUser?.id, detail: 'Auth signup requested' }
      diagnostics.emailConfirmation = {
        status: authUser?.email_confirmed_at ? 'ok' : 'ok',
        detail: authUser?.email_confirmed_at ? 'Email already confirmed' : 'Supabase confirmation email requested',
      }
    }

    if (!authUser?.id) {
      diagnostics.auth = { status: 'failed', detail: 'No Auth user id returned' }
      return send(res, 500, { ok: false, error: 'Account was not created.', diagnostics: publicDiagnostics(diagnostics, includeDiagnostics) })
    }

    if (!adminClient) {
      diagnostics.profile = { status: 'skipped', detail: 'SUPABASE_SERVICE_ROLE_KEY is required for durable profile creation' }
      diagnostics.workspace = { status: 'skipped', detail: 'SUPABASE_SERVICE_ROLE_KEY is required for durable workspace creation' }
      diagnostics.plan = { status: 'skipped', detail: 'SUPABASE_SERVICE_ROLE_KEY is required for durable plan assignment' }
      diagnostics.event = { status: 'skipped', detail: 'SUPABASE_SERVICE_ROLE_KEY is required for durable event recording' }
      throw new Error('Registration Auth succeeded but durable registration storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY and retry reconciliation.')
    }

    const billingStatus = plan === 'Free Demo' ? 'Trial Active' : 'Pending Payment'
    const paymentStatus = plan === 'Free Demo' ? 'No payment required' : 'Pending Stripe checkout'
    const { workspaceId, workspaceName, idempotencyKey } = await upsertRegistrationRows({
      adminClient,
      diagnostics,
      userId: authUser.id,
      email,
      name,
      company,
      role,
      plan,
      billingStatus,
      trialStatus: billingStatus,
      paymentStatus,
    })

    const notification = await notifyAccountCreated({
      supabaseUrl,
      supabaseAnonKey,
      origin,
      userId: authUser.id,
      workspaceId,
      email,
      name,
      company,
      role,
      plan,
      billingStatus,
      trialStatus: billingStatus,
      paymentConfirmed: paymentStatus,
      emailVerified: authUser.email_confirmed_at ? 'Yes' : 'No',
      createdAt: authUser.created_at || new Date().toISOString(),
    })
    const providerMessageId = notification?.emailResult?.results?.find((result: any) => result?.providerMessageId)?.providerMessageId || null
    diagnostics.notification = {
      status: notification?.skipped ? 'skipped' : 'ok',
      id: providerMessageId || idempotencyKey,
      detail: notification?.skipped ? notification.reason || 'Notification skipped' : 'Notification sent or duplicate-suppressed',
    }

    await adminClient
      .from('account_registration_events')
      .update({
        status: notification?.skipped ? 'notification_skipped' : 'notification_sent',
        diagnostics,
        notification_response: notification,
        provider_message_id: providerMessageId,
      })
      .eq('idempotency_key', idempotencyKey)

    return send(res, 200, {
      ok: true,
      reconciled: !authCreated,
      user: {
        id: authUser.id,
        email: authUser.email,
        createdAt: authUser.created_at,
        emailVerified: Boolean(authUser.email_confirmed_at),
      },
      session: session
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }
        : null,
      workspace: {
        id: workspaceId,
        ownerEmail: email,
        name: workspaceName,
      },
      plan: {
        name: plan,
        billingStatus,
      },
      notification,
      diagnostics: publicDiagnostics(diagnostics, includeDiagnostics),
    })
  } catch (error: any) {
    console.error('[Deal Blast Pro] Registration API failed:', error)
    return send(res, 500, {
      ok: false,
      error: error?.message || 'Registration failed.',
      diagnostics: publicDiagnostics(diagnostics, true),
    })
  }
}
