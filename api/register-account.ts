import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { getBearerToken, getSupabaseAdminClient } from './_accountAuth.js'
import { signRegistrationIntent, verifyRegistrationIntent } from './_registrationIntent.js'

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

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const neutral = { ok: true, message: 'Check your email to continue, or sign in if you already have an account.' }
async function documents(admin: ReturnType<typeof getSupabaseAdminClient>) {
  if (process.env.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS !== 'true') return []
  const { data, error } = await admin.from('bm_documents').select('id,kind,version,document_hash,content')
    .in('kind', ['platform_terms', 'privacy']).eq('current', true).eq('approved', true)
  if (error || data?.length !== 2) throw new Error('Platform agreement configuration unavailable')
  return data
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const admin = getSupabaseAdminClient()
    if (req.method === 'GET') return res.status(200).json({ required: process.env.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS === 'true', documents: await documents(admin) })
    let body: any
    try { body = typeof req.body === 'string' ? JSON.parse(req.body.replace(/^\uFEFF/, '')) : req.body || {} }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }) }
    if (body.action === 'complete') {
      const bearer = getBearerToken(req)
      if (!bearer) return res.status(401).json({ ok: false, error: 'Sign in to complete registration.' })
      const { data, error } = await admin.auth.getUser(bearer)
      const user = data.user
      if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return res.status(401).json({ ok: false, error: 'A verified session is required.' })
      // Existing customers log in without any registration-side writes.
      const profile = await admin.from('account_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
      if (profile.error) throw new Error('Account verification unavailable')
      if (profile.data) return res.status(200).json({ ok: true, created: false })
      let intent
      try { intent = verifyRegistrationIntent(user.user_metadata?.registration_intent, user.email, process.env.SUPABASE_SERVICE_ROLE_KEY || '') }
      catch { return res.status(409).json({ ok: false, error: 'Registration could not be completed. Contact support to review your account.' }) }
      const result = await admin.rpc('dbp_provision_registration', {
        p_user: user.id, p_email: user.email.toLowerCase(), p_name: intent.name, p_company: intent.company,
        p_role: intent.role, p_plan: intent.plan, p_documents: intent.documents,
        p_require_documents: process.env.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS === 'true',
      })
      if (result.error) throw new Error('Atomic account provisioning failed')
      if (result.data.created) {
        // Notification failure must not roll back or falsely report failure of a committed account.
        try {
          await notifyAccountCreated({ supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
            origin: new URL(process.env.PUBLIC_APP_URL || 'https://deal-blast-pro.vercel.app').origin,
            userId: user.id, workspaceId: result.data.workspaceId, email: user.email,
            name: intent.name, company: intent.company, role: intent.role, plan: intent.plan,
            billingStatus: intent.plan === 'Free' ? 'Free Active' : 'Pending Payment',
            trialStatus: intent.plan === 'Free' ? 'Free Active' : 'Pending Payment',
            paymentConfirmed: intent.plan === 'Free' ? 'No payment required' : 'Pending Stripe checkout',
            emailVerified: 'Yes', createdAt: user.created_at })
        } catch { console.error('[Deal Blast Pro] Account created; registration notification unavailable') }
      }
      return res.status(200).json({ ok: true, ...result.data })
    }
    if (body.action && body.action !== 'start') return res.status(400).json({ ok: false, error: 'Invalid registration request.' })
    if (body.product && body.product !== 'crm') return res.status(400).json({ ok: false, error: 'This registration endpoint supports DBP CRM only.' })
    if (process.env.DBP_REGISTRATION_PAUSED === 'true') return res.status(503).json({ ok: false, error: 'New registrations are temporarily paused. Existing customers can sign in.' })
    const name = clean(body.name), email = clean(body.email).toLowerCase(), company = clean(body.company)
    const password = typeof body.password === 'string' ? body.password : ''
    const role = clean(body.role) || 'Admin'
    const plan = body.plan === 'Free Demo' ? 'Free' : clean(body.plan) || 'Free'
    const docs = await documents(admin)
    if (!name || !email || password.length < 6 || password.length > 1024) return res.status(400).json({ ok: false, error: 'Name, email and a valid password are required.' })
    if (docs.length && (body.agreementsAccepted !== true || !docs.every(doc =>
      body.platformAgreements?.some((d: any) => d.id === doc.id && d.hash === doc.document_hash) &&
      createHash('sha256').update(doc.content).digest('hex') === doc.document_hash))) return res.status(400).json({ ok: false, error: 'Review and accept the current platform agreements.' })
    let intent
    try { intent = signRegistrationIntent({ version: 1, email, name, company, role, plan,
      documents: docs.map(doc => ({ id: doc.id, hash: doc.document_hash })), expires: Date.now() + 7 * 86400000,
    }, process.env.SUPABASE_SERVICE_ROLE_KEY || '') }
    catch { return res.status(400).json({ ok: false, error: 'Invalid registration details.' }) }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const origin = new URL(process.env.PUBLIC_APP_URL || 'https://deal-blast-pro.vercel.app').origin
    // Keep Auth signup rate limits, CAPTCHA support and email confirmation; never admin-create a public user.
    const { data, error } = await auth.auth.signUp({ email, password, options: {
      emailRedirectTo: `${origin}/auth/callback`, captchaToken: clean(body.captchaToken) || undefined,
      data: { full_name: name, registration_intent: intent },
    } })
    if (error) {
      if (error.status === 429) return res.status(429).json({ ok: false, error: 'Please wait before trying registration again.' })
      if (error.code !== 'user_already_exists' && error.code !== 'email_exists') return res.status(400).json({ ok: false, error: 'Registration could not be started. Check your details and try again.' })
      return res.status(200).json(neutral)
    }
    return res.status(200).json({ ...neutral, ...(data.session ? { session: data.session } : {}) })
  } catch {
    console.error('[Deal Blast Pro] Registration provisioning unavailable')
    return res.status(503).json({ ok: false, error: 'Registration is temporarily unavailable. Please retry or contact support.' })
  }
}
