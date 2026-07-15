import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1'

const DEFAULT_RECIPIENT = 'housebuyerinv@gmail.com'
const PROVIDER = 'resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const getValue = (obj: any, keys: string[]) => {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

const safeText = (value: any, fallback = 'Not provided') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const escapeHtml = (value: any) =>
  safeText(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char))

const formatMoney = (value: any) => {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Not provided'
  const n = Number(raw.replace(/[$,]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return raw
  return '$' + n.toLocaleString()
}

const parseRecipients = (value: any) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const emails = raw
    .map((email: any) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
  return Array.from(new Set(emails))
}

const eventSettingKey = (eventType: string) => {
  const map: Record<string, string> = {
    new_deal: 'notify_new_deal',
    deal: 'notify_new_deal',
    new_account_created: 'notify_new_account',
    account: 'notify_new_account',
    new_buyer: 'notify_new_buyer',
    buyer: 'notify_new_buyer',
    buyer_verification: 'notify_buyer_verification',
    missing_docs: 'notify_missing_docs',
    buyer_match: 'notify_buyer_match',
    offer_received: 'notify_offer_received',
    offer_response_needed: 'notify_offer_response_needed',
    inventory_conversion: 'notify_inventory_conversion',
    deal_status_change: 'notify_deal_status_change',
    closing_followup: 'notify_closing_followup',
    contact: 'notify_new_deal',
    test_email: 'enabled',
  }
  return map[eventType] || 'enabled'
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

function getAnonClient() {
  const url = Deno.env.get('SUPABASE_URL') || Deno.env.get('NOTIFY_SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('NOTIFY_SUPABASE_ANON_KEY')
  if (!url || !anonKey) return null
  return createClient(url, anonKey)
}

async function getNotificationSettings(workspaceId: string) {
  const fallback = {
    workspace_id: workspaceId,
    enabled: true,
    recipients: [DEFAULT_RECIPIENT],
  }

  const client = getServiceClient()
  if (!client) return fallback

  const { data, error } = await client
    .from('email_notification_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('Could not read email notification settings:', error.message)
    return fallback
  }

  if (!data) return fallback

  const recipients = parseRecipients(data.recipients)
  return {
    ...fallback,
    ...data,
    recipients: recipients.length ? recipients : [DEFAULT_RECIPIENT],
  }
}

async function getAccountNotificationSettings(workspaceId: string) {
  const fallback = {
    workspace_id: workspaceId,
    enabled: true,
    recipients: [DEFAULT_RECIPIENT],
  }

  const client = getServiceClient()
  if (!client) return fallback

  const { data, error } = await client
    .from('email_notification_settings')
    .select('*')
    .or(`workspace_id.eq.${workspaceId},workspace_id.eq.default`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('Could not read account notification settings:', error.message)
    return fallback
  }

  if (data) {
    const recipients = parseRecipients(data.recipients)
    return {
      ...fallback,
      ...data,
      recipients: recipients.length ? recipients : [DEFAULT_RECIPIENT],
    }
  }

  const { data: newest, error: newestError } = await client
    .from('email_notification_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (newestError) {
    console.warn('Could not read fallback account notification settings:', newestError.message)
    return fallback
  }

  if (!newest) return fallback

  const recipients = parseRecipients(newest.recipients)
  return {
    ...fallback,
    ...newest,
    workspace_id: workspaceId,
    recipients: recipients.length ? recipients : [DEFAULT_RECIPIENT],
  }
}

async function writeLog(input: {
  workspaceId: string
  userId?: string | null
  eventType: string
  relatedRecordId?: string
  recipient: string
  status: string
  providerMessageId?: string
  attemptCount?: number
  errorMessage?: string
  response?: any
  idempotencyKey?: string
}) {
  const now = new Date().toISOString()
  const row = {
    workspace_id: input.workspaceId,
    user_id: input.userId || null,
    event_type: input.eventType,
    related_record_id: input.relatedRecordId || null,
    recipient: input.recipient,
    provider: PROVIDER,
    provider_message_id: input.providerMessageId || null,
    status: input.status,
    attempt_count: input.attemptCount ?? 1,
    attempted_at: now,
    succeeded_at: input.status === 'sent' ? now : null,
    failed_at: input.status === 'failed' || input.status === 'skipped' ? now : null,
    error_message: input.errorMessage || null,
    response: input.response || null,
    idempotency_key: input.idempotencyKey || null,
  }

  const logClient = getServiceClient() || getAnonClient()
  const logClientType = getServiceClient() ? 'service-rpc' : 'anon-rpc'
  if (!logClient) return { ok: false, via: 'none', error: 'Missing Supabase logging client env' }

  const { error } = await logClient.rpc('insert_email_notification_log', {
    p_workspace_id: row.workspace_id,
    p_user_id: row.user_id,
    p_event_type: row.event_type,
    p_related_record_id: row.related_record_id,
    p_recipient: row.recipient,
    p_provider: row.provider,
    p_provider_message_id: row.provider_message_id,
    p_status: row.status,
    p_attempt_count: row.attempt_count,
    p_error_message: row.error_message,
    p_response: row.response,
    p_idempotency_key: row.idempotency_key,
  })

  if (error) {
    console.warn('Could not write email notification log via RPC:', error.message)
    return { ok: false, via: logClientType, error: error.message }
  }

  return { ok: true, via: logClientType }
}

async function updateLastTestStatus(workspaceId: string, status: string, errorMessage = '') {
  const client = getServiceClient()
  if (!client) return

  try {
    await client
      .from('email_notification_settings')
      .update({
        last_test_status: status,
        last_test_at: new Date().toISOString(),
        last_test_error: errorMessage || null,
      })
      .eq('workspace_id', workspaceId)
  } catch (error) {
    console.warn('Could not update last test status:', String(error))
  }
}

async function getExistingNotificationLog(idempotencyKey: string) {
  const client = getServiceClient()
  if (!client || !idempotencyKey) return null

  const { data, error } = await client
    .from('email_notification_logs')
    .select('status,provider_message_id,recipient,event_type,created_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (error) {
    console.warn('Could not read idempotency log:', error.message)
    return null
  }

  return data
}

async function sendResendEmail(payload: {
  subject: string
  html: string
  text: string
  recipients: string[]
  workspaceId: string
  eventType: string
  relatedRecordId?: string
  idempotencyKeyBase?: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') || 'Deal Blast Pro <onboarding@resend.dev>'

  if (!apiKey) {
    for (const recipient of payload.recipients) {
      await writeLog({
        workspaceId: payload.workspaceId,
        eventType: payload.eventType,
        relatedRecordId: payload.relatedRecordId,
        recipient,
        status: 'skipped',
        errorMessage: 'Missing RESEND_API_KEY',
      })
    }
    return { ok: false, skipped: true, reason: 'Missing RESEND_API_KEY' }
  }

  const results = []
  for (const recipient of payload.recipients) {
    const idempotencyKey = [
      payload.idempotencyKeyBase || [payload.workspaceId, payload.eventType, payload.relatedRecordId || 'none'].join('|'),
      recipient,
    ].join('|').slice(0, 500)

    const existingLog = await getExistingNotificationLog(idempotencyKey)
    if (existingLog?.status === 'sent') {
      results.push({
        recipient,
        ok: true,
        skipped: true,
        duplicate: true,
        providerMessageId: existingLog.provider_message_id,
        body: { duplicateSuppressed: true },
      })
      continue
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: payload.subject,
        html: payload.html,
        text: payload.text
      })
    })

    const bodyText = await res.text()
    let body: any = bodyText
    try { body = JSON.parse(bodyText) } catch {}
    const providerMessageId = body?.id || body?.data?.id || null

    const logResult = await writeLog({
      workspaceId: payload.workspaceId,
      eventType: payload.eventType,
      relatedRecordId: payload.relatedRecordId,
      recipient,
      status: res.ok ? 'sent' : 'failed',
      providerMessageId,
      errorMessage: res.ok ? '' : bodyText,
      response: typeof body === 'string' ? { body } : body,
      idempotencyKey,
    })

    results.push({ recipient, ok: res.ok, status: res.status, providerMessageId, body, logResult })
  }

  const failed = results.filter(result => !result.ok)
  return {
    ok: failed.length === 0,
    status: failed.length ? failed[0].status : 200,
    results,
  }
}

async function sendTwilioSms(message: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_FROM_NUMBER')
  const to = Deno.env.get('NOTIFY_TO_PHONE')

  if (!sid || !token || !from || !to) {
    return { skipped: true, reason: 'Missing Twilio SMS secrets' }
  }

  const form = new URLSearchParams()
  form.set('From', from)
  form.set('To', to)
  form.set('Body', message.slice(0, 1500))

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  })

  const body = await res.text()

  if (!res.ok) {
    console.error('Twilio failed:', body)
    return { ok: false, status: res.status, body }
  }

  return { ok: true, status: res.status, body }
}

function buildMessage(type: string, data: any, portalUrl: string) {
  if (type === 'test') {
    const requestedAt = getValue(data, ['requestedAt']) || new Date().toISOString()
    return {
      subject: 'Deal Blast Pro Test Email',
      text: `Deal Blast Pro email notifications are working.\n\nRequested At: ${requestedAt}\n\nOpen Deal Blast Pro: ${portalUrl}`,
      html: `
        <h2>Deal Blast Pro Test Email</h2>
        <p>Email notifications are working.</p>
        <p><strong>Requested At:</strong> ${escapeHtml(requestedAt)}</p>
        <p><a href="${portalUrl}">Open Deal Blast Pro</a></p>
      `,
      sms: 'Deal Blast Pro test email requested.'
    }
  }

  if (type === 'account') {
    const name = getValue(data, ['name', 'fullName', 'full_name', 'userName']) || 'New User'
    const email = getValue(data, ['email', 'userEmail'])
    const workspace = getValue(data, ['workspaceName', 'workspace', 'company', 'companyName'])
    const plan = getValue(data, ['plan', 'selectedPlan']) || 'Free Demo'
    const billingStatus = getValue(data, ['billingStatus', 'billing_status']) || 'Trial Active'
    const trialStatus = getValue(data, ['trialStatus', 'trial_status']) || (plan === 'Free Demo' ? 'Trial Active' : 'Not provided')
    const source = getValue(data, ['registrationSource', 'source']) || 'Admin Register'
    const createdAt = getValue(data, ['createdAt', 'created_at']) || new Date().toISOString()
    const userId = getValue(data, ['userId', 'user_id'])
    const workspaceId = getValue(data, ['workspaceId', 'workspace_id'])
    const paymentConfirmed = getValue(data, ['paymentConfirmed']) || (plan === 'Free Demo' ? 'No payment required' : 'No')
    const emailVerified = getValue(data, ['emailVerified']) || 'Unknown'
    const accountUrl = getValue(data, ['accountUrl']) || `${portalUrl.replace(/\/app\/submissions.*$/, '')}/app/settings`

    return {
      subject: `New Deal Blast Pro Account | ${plan} | ${name}`,
      text:
`A new Deal Blast Pro account was created.

Name: ${safeText(name)}
Email: ${safeText(email)}
Workspace: ${safeText(workspace)}
Plan: ${safeText(plan)}
Billing Status: ${safeText(billingStatus)}
Trial Status: ${safeText(trialStatus)}
Registration Source: ${safeText(source)}
Created: ${safeText(createdAt)}
User ID: ${safeText(userId)}
Workspace ID: ${safeText(workspaceId)}
Payment Confirmed: ${safeText(paymentConfirmed)}
Email Verification Complete: ${safeText(emailVerified)}

Open Account: ${accountUrl}`,
      html: `
        <h2>New Deal Blast Pro Account</h2>
        <p>A new Deal Blast Pro account was created.</p>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Workspace:</strong> ${escapeHtml(workspace)}</p>
        <p><strong>Plan:</strong> ${escapeHtml(plan)}</p>
        <p><strong>Billing Status:</strong> ${escapeHtml(billingStatus)}</p>
        <p><strong>Trial Status:</strong> ${escapeHtml(trialStatus)}</p>
        <p><strong>Registration Source:</strong> ${escapeHtml(source)}</p>
        <p><strong>Created:</strong> ${escapeHtml(createdAt)}</p>
        <p><strong>User ID:</strong> ${escapeHtml(userId)}</p>
        <p><strong>Workspace ID:</strong> ${escapeHtml(workspaceId)}</p>
        <p><strong>Payment Confirmed:</strong> ${escapeHtml(paymentConfirmed)}</p>
        <p><strong>Email Verification Complete:</strong> ${escapeHtml(emailVerified)}</p>
        <p><a href="${accountUrl}">Open Account</a></p>
      `,
      sms: `New Deal Blast Pro account: ${name}. ${email}. Plan: ${plan}.`
    }
  }

  if (type === 'contact') {
    const name = getValue(data, ['fullName', 'name', 'Full Name']) || 'New Contact'
    const email = getValue(data, ['email', 'Email'])
    const phone = getValue(data, ['phone', 'Phone'])
    const company = getValue(data, ['company', 'Company'])
    const role = getValue(data, ['role', 'Role'])
    const interest = getValue(data, ['interestType', 'interest', 'planInterest'])
    const message = getValue(data, ['message', 'Message'])
    const submittedAt = getValue(data, ['submittedAt', 'created_at'])
    const source = getValue(data, ['sourcePage', 'source'])

    return {
      subject: 'New Deal Blast Pro Contact Request',
      text:
`New Deal Blast Pro contact request

Name: ${safeText(name)}
Email: ${safeText(email)}
Phone: ${safeText(phone)}
Company: ${safeText(company)}
Role: ${safeText(role)}
Interest Type: ${safeText(interest)}
Message: ${safeText(message)}
Submitted At: ${safeText(submittedAt)}
Source: ${safeText(source)}

Review: ${portalUrl}`,
      html: `
        <h2>New Deal Blast Pro Contact Request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company)}</p>
        <p><strong>Role:</strong> ${escapeHtml(role)}</p>
        <p><strong>Interest Type:</strong> ${escapeHtml(interest)}</p>
        <p><strong>Message:</strong><br />${escapeHtml(message).replace(/\n/g, '<br />')}</p>
        <p><strong>Submitted At:</strong> ${escapeHtml(submittedAt)}</p>
        <p><strong>Source:</strong> ${escapeHtml(source)}</p>
        <p><a href="${portalUrl}">Open Deal Blast Pro</a></p>
      `,
      sms: `New Deal Blast Pro contact: ${name}. ${email || company || ''}. Interest: ${interest || 'not provided'}.`
    }
  }

  if (type === 'buyer') {
    const name = getValue(data, ['name', 'fullName', 'buyerName', 'contactName']) || 'New Buyer'
    const email = getValue(data, ['email', 'Email'])
    const phone = getValue(data, ['phone', 'mobile', 'cell'])
    const markets = getValue(data, ['markets', 'targetMarkets', 'target_markets'])
    const budget = getValue(data, ['budget', 'budgetMax', 'maxBudget', 'purchaseBudget'])
    const strategy = getValue(data, ['strategy', 'exitStrategy', 'strategies', 'investmentStrategy'])

    return {
      subject: `New Buyer Portal Submission: ${name}`,
      text:
`New buyer portal submission

Name: ${safeText(name)}
Email: ${safeText(email)}
Phone: ${safeText(phone)}
Markets: ${safeText(markets)}
Budget: ${formatMoney(budget)}
Strategy: ${safeText(strategy)}

Review: ${portalUrl}`,
      html: `
        <h2>New Buyer Portal Submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Markets:</strong> ${escapeHtml(markets)}</p>
        <p><strong>Budget:</strong> ${escapeHtml(formatMoney(budget))}</p>
        <p><strong>Strategy:</strong> ${escapeHtml(strategy)}</p>
        <p><a href="${portalUrl}">Open Deal Blast Pro</a></p>
      `,
      sms: `New buyer submission: ${name}. ${email || phone || ''}. Strategy: ${strategy || 'not provided'}.`
    }
  }

  const address = getValue(data, ['address', 'propertyAddress', 'property_address', 'title']) || 'New Deal'
  const seller = getValue(data, ['sellerName', 'seller_name', 'contactName', 'name'])
  const email = getValue(data, ['email', 'sellerEmail', 'seller_email'])
  const phone = getValue(data, ['phone', 'sellerPhone', 'seller_phone'])
  const price = getValue(data, ['askingPrice', 'asking_price', 'price', 'purchasePrice'])
  const market = [getValue(data, ['city']), getValue(data, ['state'])].filter(Boolean).join(', ') || getValue(data, ['market', 'location'])
  const asset = getValue(data, ['assetType', 'asset_type', 'propertyType', 'property_type'])

  return {
    subject: `New Deal Portal Submission: ${address}`,
    text:
`New deal portal submission

Property: ${safeText(address)}
Seller/Contact: ${safeText(seller)}
Email: ${safeText(email)}
Phone: ${safeText(phone)}
Market: ${safeText(market)}
Asset Type: ${safeText(asset)}
Asking Price: ${formatMoney(price)}

Review: ${portalUrl}`,
    html: `
      <h2>New Deal Portal Submission</h2>
      <p><strong>Property:</strong> ${escapeHtml(address)}</p>
      <p><strong>Seller/Contact:</strong> ${escapeHtml(seller)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
      <p><strong>Market:</strong> ${escapeHtml(market)}</p>
      <p><strong>Asset Type:</strong> ${escapeHtml(asset)}</p>
      <p><strong>Asking Price:</strong> ${escapeHtml(formatMoney(price))}</p>
      <p><a href="${portalUrl}">Open Deal Blast Pro</a></p>
    `,
    sms: `New deal submission: ${address}. ${price ? 'Ask ' + formatMoney(price) + '. ' : ''}${seller || email || phone || ''}`
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const input = await req.json()
    const type = input?.type === 'account'
      ? 'account'
      : input?.type === 'buyer'
      ? 'buyer'
      : input?.type === 'contact'
        ? 'contact'
        : input?.type === 'test'
          ? 'test'
          : 'deal'
    const eventType = input?.eventType || (type === 'account' ? 'new_account_created' : type === 'buyer' ? 'new_buyer' : type === 'test' ? 'test_email' : type === 'contact' ? 'contact' : 'new_deal')
    const workspaceId = String(input?.workspaceId || input?.workspace_id || 'default')
    const relatedRecordId = String(input?.relatedRecordId || input?.related_record_id || input?.data?.id || '')
    const data = input?.data || {}
    const portalUrl = Deno.env.get('ADMIN_PORTAL_URL') || 'https://deal-blast-pro.vercel.app/app/submissions'
    const settings = eventType === 'new_account_created'
      ? await getAccountNotificationSettings(workspaceId)
      : await getNotificationSettings(workspaceId)
    const settingKey = eventSettingKey(eventType)
    const recipients = parseRecipients(input?.recipients).length
      ? parseRecipients(input?.recipients)
      : parseRecipients(settings.recipients)

    if (!settings.enabled || settings[settingKey] === false) {
      for (const recipient of recipients) {
        await writeLog({
          workspaceId,
          eventType,
          relatedRecordId,
          recipient,
          status: 'skipped',
          errorMessage: 'Notification disabled by admin settings',
        })
      }
      return json({ ok: true, skipped: true, reason: 'Notification disabled by admin settings' })
    }

    const message = buildMessage(type, data, portalUrl)
    const emailResult = await sendResendEmail({
      ...message,
      recipients: recipients.length ? recipients : [DEFAULT_RECIPIENT],
      workspaceId,
      eventType,
      relatedRecordId,
      idempotencyKeyBase: input?.idempotencyKey || (eventType === 'new_account_created' ? `new_account_created:${relatedRecordId || data?.userId || workspaceId}` : undefined),
    })
    const smsResult = type === 'test' ? { skipped: true, reason: 'SMS not used for test email' } : await sendTwilioSms(message.sms)

    if (type === 'test') {
      await updateLastTestStatus(workspaceId, emailResult.ok ? 'Sent' : 'Failed', emailResult.ok ? '' : String(emailResult.reason || emailResult.status || 'Provider rejected test email'))
    }

    return json({ ok: Boolean(emailResult.ok), provider: PROVIDER, recipients, emailResult, smsResult })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: String(error?.message || error) }, 500)
  }
})
