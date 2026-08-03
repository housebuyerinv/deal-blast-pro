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
    waitlist_entry_created: 'enabled',
    test_email: 'enabled',
  }
  return map[eventType] || 'enabled'
}

const ESSENTIAL_EVENTS = new Set([
  'security_alert','email_changed','password_changed','account_deactivated','account_deleted',
  'payment_receipt','payment_failed','payment_action_required','subscription_changed','subscription_cancelled',
  'legal_notice','credit_pack_receipt','credit_pack_refund','credit_pack_dispute',
])

const isEssentialEvent = (eventType: string) => ESSENTIAL_EVENTS.has(String(eventType || '').trim().toLowerCase())

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

async function safeAdminTestRecipients(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const client = getServiceClient()
  if (!client || !token) return []
  const { data } = await client.auth.getUser(token)
  const verifiedEmail = String(data?.user?.email || '').trim().toLowerCase()
  const ownerEmails = String(Deno.env.get('DEALBLAST_OWNER_ADMIN_EMAILS') || 'housebuyerinv@gmail.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  if (!verifiedEmail || !ownerEmails.includes(verifiedEmail)) return []
  const allowlist = parseRecipients(Deno.env.get('EMAIL_TEST_RECIPIENT_ALLOWLIST') || '')
  return Array.from(new Set([verifiedEmail, ...allowlist]))
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

async function getWaitlistEntry(entryId: string) {
  const client = getServiceClient()
  if (!client || !entryId) return null

  const { data, error } = await client
    .from('waitlist_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle()

  if (error) {
    console.warn('Could not read waitlist entry:', error.message)
    return null
  }
  return data
}

async function updateWaitlistEmailStatus(entryId: string, updates: Record<string, any>) {
  const client = getServiceClient()
  if (!client || !entryId) return
  const { error } = await client
    .from('waitlist_entries')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
  if (error) console.warn('Could not update waitlist email status:', error.message)
}

async function sendResendEmail(payload: {
  subject: string
  html: string
  text: string
  recipients: string[]
  replyTo?: string
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

    const client = getServiceClient()
    if (!client) return { ok: false, skipped: true, reason: 'Email outbox is not configured' }
    const { data: queued, error: queueError } = await client.from('email_outbox').upsert({
      workspace_id: payload.workspaceId, event_type: payload.eventType, recipient, subject: payload.subject,
      html_body: payload.html, text_body: payload.text, essential: isEssentialEvent(payload.eventType),
      related_record_id: payload.relatedRecordId || null, idempotency_key: idempotencyKey, status: 'queued',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,status,provider_message_id,attempt_count').maybeSingle()
    if (queueError) {
      results.push({ recipient, ok: false, status: 503, errorCategory: 'outbox_unavailable' })
      continue
    }

    const { data: existingOutbox } = queued ? { data: queued } : await client.from('email_outbox')
      .select('id,status,provider_message_id,attempt_count').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existingOutbox?.status === 'sent' || existingOutbox?.status === 'delivered') {
      results.push({ recipient, ok: true, skipped: true, duplicate: true, providerMessageId: existingOutbox.provider_message_id })
      continue
    }
    await client.from('email_outbox').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', existingOutbox?.id)

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
        reply_to: payload.replyTo || undefined,
        subject: payload.subject,
        html: payload.html,
        text: payload.text
      })
    })

    const bodyText = await res.text()
    let body: any = bodyText
    try { body = JSON.parse(bodyText) } catch {}
    const providerMessageId = body?.id || body?.data?.id || null

    await client.from('email_outbox').update(res.ok ? {
      status: 'sent', provider_message_id: providerMessageId, sent_at: new Date().toISOString(),
      attempt_count: Number(existingOutbox?.attempt_count || 0) + 1, last_error_category: null, updated_at: new Date().toISOString(),
    } : {
      status: res.status === 429 || res.status >= 500 ? 'retrying' : 'failed',
      attempt_count: Number(existingOutbox?.attempt_count || 0) + 1,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error_category: res.status === 429 ? 'rate_limit' : res.status >= 500 ? 'provider_unavailable' : 'provider_rejected',
      updated_at: new Date().toISOString(),
    }).eq('id', existingOutbox?.id)

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

function firstName(fullName: string) {
  return safeText(fullName, 'there').split(/\s+/)[0] || 'there'
}

function appHomeUrl() {
  return Deno.env.get('PUBLIC_APP_URL') || 'https://deal-blast-pro.vercel.app'
}

function buildWaitlistAdminMessage(entry: any) {
  const createdAt = entry?.created_at || new Date().toISOString()
  const appUrl = appHomeUrl()
  return {
    subject: 'New Deal Blast Pro Waitlist Registration',
    text:
`New Deal Blast Pro waitlist registration

Full Name: ${safeText(entry?.full_name)}
Email: ${safeText(entry?.email)}
Phone: ${safeText(entry?.phone)}
Primary Market: ${safeText(entry?.primary_market)}
Business Type / Role: ${safeText(entry?.business_type)}
Notes: ${safeText(entry?.notes)}
Registration Date: ${safeText(createdAt)}
Waitlist Entry ID: ${safeText(entry?.id)}
Source Page: ${safeText(entry?.source_page || entry?.source)}
Referral Data: ${safeText(entry?.referral_data)}

Open Deal Blast Pro: ${appUrl}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:640px;margin:0 auto;padding:24px">
        <h1 style="font-size:22px;margin:0 0 16px">New Deal Blast Pro Waitlist Registration</h1>
        <table style="width:100%;border-collapse:collapse">
          ${[
            ['Full Name', entry?.full_name],
            ['Email', entry?.email],
            ['Phone', entry?.phone],
            ['Primary Market', entry?.primary_market],
            ['Business Type / Role', entry?.business_type],
            ['Notes', entry?.notes],
            ['Registration Date', createdAt],
            ['Waitlist Entry ID', entry?.id],
            ['Source Page', entry?.source_page || entry?.source],
            ['Referral Data', entry?.referral_data],
          ].map(([label, value]) => `
            <tr>
              <td style="border-top:1px solid #e5e7eb;padding:10px 12px;font-weight:700;width:190px">${escapeHtml(label)}</td>
              <td style="border-top:1px solid #e5e7eb;padding:10px 12px">${escapeHtml(value)}</td>
            </tr>
          `).join('')}
        </table>
        <p style="margin-top:20px"><a href="${appUrl}" style="color:#2563eb">Open Deal Blast Pro</a></p>
      </div>
    `,
    sms: `New Deal Blast Pro waitlist registration: ${entry?.full_name || entry?.email || 'New registrant'}.`,
  }
}

function buildWaitlistConfirmationMessage(entry: any) {
  const appUrl = appHomeUrl()
  const name = firstName(entry?.full_name)
  return {
    subject: 'You are on the Deal Blast Pro Waitlist',
    text:
`Hi ${safeText(name)},

Thanks for joining the Deal Blast Pro waitlist.

We are preparing Deal Blast Pro to help real estate professionals organize deals, manage buyers, market opportunities, and improve their acquisition and disposition workflows.

You will be notified when early access becomes available.

We appreciate your interest and look forward to having you in the Deal Blast Pro community.

Marcel G
Deal Blast Pro
House Buyer Investments LLC

${appUrl}`,
    html: `
      <div style="margin:0;padding:0;background:#0A0C12">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0A0C12;padding:24px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#0f172a">
                <tr>
                  <td style="padding:28px 28px 10px">
                    <div style="font-size:14px;font-weight:800;color:#16a34a;letter-spacing:.08em;text-transform:uppercase">Deal Blast Pro</div>
                    <h1 style="font-size:26px;line-height:1.2;margin:12px 0 0">You are on the waitlist</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 28px;font-size:16px;line-height:1.65">
                    <p>Hi ${escapeHtml(name)},</p>
                    <p>Thanks for joining the Deal Blast Pro waitlist.</p>
                    <p>We are preparing Deal Blast Pro to help real estate professionals organize deals, manage buyers, market opportunities, and improve their acquisition and disposition workflows.</p>
                    <p>You will be notified when early access becomes available.</p>
                    <p>We appreciate your interest and look forward to having you in the Deal Blast Pro community.</p>
                    <p style="margin-top:24px">Marcel G<br />Deal Blast Pro<br />House Buyer Investments LLC</p>
                    <p style="margin-top:24px">
                      <a href="${appUrl}" style="display:inline-block;background:#22C55E;color:#020617;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Visit Deal Blast Pro</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
    sms: `Deal Blast Pro waitlist confirmation for ${entry?.email || 'registrant'}.`,
  }
}

async function sendWaitlistEmails(entryId: string, idempotencyKeyBase: string) {
  const entry = await getWaitlistEntry(entryId)
  if (!entry) return { ok: false, error: 'Waitlist entry not found.' }

  await updateWaitlistEmailStatus(entry.id, {
    email_attempt_count: Number(entry.email_attempt_count || 0) + 1,
    email_last_error: null,
  })

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || DEFAULT_RECIPIENT
  const adminMessage = buildWaitlistAdminMessage(entry)
  const adminResult = await sendResendEmail({
    ...adminMessage,
    recipients: [adminEmail],
    replyTo: entry.email,
    workspaceId: 'default',
    eventType: 'waitlist_entry_created',
    relatedRecordId: entry.id,
    idempotencyKeyBase: `${idempotencyKeyBase}:admin`,
  })

  const confirmationMessage = buildWaitlistConfirmationMessage(entry)
  const confirmationResult = await sendResendEmail({
    ...confirmationMessage,
    recipients: [entry.email],
    workspaceId: 'default',
    eventType: 'waitlist_confirmation',
    relatedRecordId: entry.id,
    idempotencyKeyBase: `${idempotencyKeyBase}:confirmation`,
  })

  const now = new Date().toISOString()
  const adminSent = Boolean(adminResult.ok)
  const confirmationSent = Boolean(confirmationResult.ok)
  const error = [
    adminSent ? '' : `Admin notification failed: ${adminResult.reason || adminResult.status || 'provider rejected'}`,
    confirmationSent ? '' : `Confirmation email failed: ${confirmationResult.reason || confirmationResult.status || 'provider rejected'}`,
  ].filter(Boolean).join(' | ')

  await updateWaitlistEmailStatus(entry.id, {
    admin_notification_status: adminSent ? 'sent' : 'failed',
    admin_notification_sent_at: adminSent ? now : null,
    confirmation_email_status: confirmationSent ? 'sent' : 'failed',
    confirmation_email_sent_at: confirmationSent ? now : null,
    email_last_error: error || null,
  })

  return {
    ok: adminSent && confirmationSent,
    admin: adminResult,
    confirmation: confirmationResult,
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
    const company = getValue(data, ['company', 'entity', 'business'])
    const markets = getValue(data, ['markets', 'targetMarkets', 'target_markets'])
    const assetTypes = getValue(data, ['assetTypes', 'asset_types', 'assetFocus'])
    const buyerType = getValue(data, ['type', 'buyerType', 'buyer_type'])
    const budget = getValue(data, ['budget', 'budgetMax', 'maxBudget', 'purchaseBudget'])
    const strategy = getValue(data, ['strategy', 'exitStrategy', 'strategies', 'investmentStrategy'])
    const proofCount = Array.isArray(data?.proofFiles)
      ? data.proofFiles.length
      : Array.isArray(data?.uploadedFiles)
        ? data.uploadedFiles.length
        : getValue(data, ['proofFileCount', 'proof_count']) || '0'
    const reviewUrl = getValue(data, ['reviewUrl']) || portalUrl

    return {
      subject: `New Buyer Submission - ${name}`,
      text:
`New buyer portal submission

Submitted: ${safeText(getValue(data, ['submittedAt', 'createdAt']))}
Name: ${safeText(name)}
Company: ${safeText(company)}
Email: ${safeText(email)}
Phone: ${safeText(phone)}
Markets: ${safeText(markets)}
Asset Types: ${safeText(assetTypes)}
Buyer Type: ${safeText(buyerType)}
Budget: ${formatMoney(budget)}
Strategy: ${safeText(strategy)}
Proof-of-funds file count: ${safeText(proofCount)}

Sign in to Deal Blast Pro to review the complete submission.
Review: ${reviewUrl}`,
      html: `
        <h2>New Buyer Portal Submission</h2>
        <p><strong>Submitted:</strong> ${escapeHtml(getValue(data, ['submittedAt', 'createdAt']))}</p>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Markets:</strong> ${escapeHtml(markets)}</p>
        <p><strong>Asset Types:</strong> ${escapeHtml(assetTypes)}</p>
        <p><strong>Buyer Type:</strong> ${escapeHtml(buyerType)}</p>
        <p><strong>Budget:</strong> ${escapeHtml(formatMoney(budget))}</p>
        <p><strong>Strategy:</strong> ${escapeHtml(strategy)}</p>
        <p><strong>Proof-of-funds file count:</strong> ${escapeHtml(proofCount)}</p>
        <p>Sign in to Deal Blast Pro to review the complete submission.</p>
        <p><a href="${reviewUrl}">Open Buyer Portal Review Center</a></p>
      `,
      sms: `New buyer submission: ${name}. ${email || phone || ''}. Strategy: ${strategy || 'not provided'}.`
    }
  }

  const address = getValue(data, ['address', 'propertyAddress', 'property_address', 'title']) || 'New Deal'
  const seller = getValue(data, ['sellerName', 'seller_name', 'contactName', 'name'])
  const email = getValue(data, ['email', 'sellerEmail', 'seller_email'])
  const phone = getValue(data, ['phone', 'sellerPhone', 'seller_phone'])
  const price = getValue(data, ['askingPrice', 'asking_price', 'price', 'purchasePrice'])
  const arv = getValue(data, ['arv', 'estimatedArv', 'afterRepairValue'])
  const market = [getValue(data, ['city']), getValue(data, ['state'])].filter(Boolean).join(', ') || getValue(data, ['market', 'location'])
  const asset = getValue(data, ['assetType', 'asset_type', 'propertyType', 'property_type'])
  const bedrooms = getValue(data, ['bedrooms', 'beds'])
  const bathrooms = getValue(data, ['bathrooms', 'baths'])
  const sqft = getValue(data, ['sqft', 'squareFeet', 'square_feet'])
  const uploadedFiles = Array.isArray(data?.uploadedFiles) ? data.uploadedFiles : []
  const photoCount = uploadedFiles.filter((file: any) => String(file?.fileType || file?.type || '').startsWith('image/')).length
  const documentCount = uploadedFiles.length ? uploadedFiles.length - photoCount : getValue(data, ['documentCount']) || '0'
  const reviewUrl = getValue(data, ['reviewUrl']) || portalUrl

  return {
    subject: address === 'New Deal' ? 'New Deal Submission Received' : `New Deal Submission - ${address}`,
    text:
`New deal portal submission

Submitted: ${safeText(getValue(data, ['submittedAt', 'createdAt']))}
Property: ${safeText(address)}
Seller/Contact: ${safeText(seller)}
Email: ${safeText(email)}
Phone: ${safeText(phone)}
Market: ${safeText(market)}
Asset Type: ${safeText(asset)}
Asking Price: ${formatMoney(price)}
ARV: ${formatMoney(arv)}
Beds/Baths/Sq Ft: ${safeText([bedrooms, bathrooms, sqft].filter(Boolean).join(' / '))}
Photo Count: ${safeText(photoCount)}
Document Count: ${safeText(documentCount)}

Sign in to Deal Blast Pro to review the complete submission.
Review: ${reviewUrl}`,
    html: `
      <h2>New Deal Portal Submission</h2>
      <p><strong>Submitted:</strong> ${escapeHtml(getValue(data, ['submittedAt', 'createdAt']))}</p>
      <p><strong>Property:</strong> ${escapeHtml(address)}</p>
      <p><strong>Seller/Contact:</strong> ${escapeHtml(seller)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
      <p><strong>Market:</strong> ${escapeHtml(market)}</p>
      <p><strong>Asset Type:</strong> ${escapeHtml(asset)}</p>
      <p><strong>Asking Price:</strong> ${escapeHtml(formatMoney(price))}</p>
      <p><strong>ARV:</strong> ${escapeHtml(formatMoney(arv))}</p>
      <p><strong>Beds/Baths/Sq Ft:</strong> ${escapeHtml([bedrooms, bathrooms, sqft].filter(Boolean).join(' / '))}</p>
      <p><strong>Photo Count:</strong> ${escapeHtml(photoCount)}</p>
      <p><strong>Document Count:</strong> ${escapeHtml(documentCount)}</p>
      <p>Sign in to Deal Blast Pro to review the complete submission.</p>
      <p><a href="${reviewUrl}">Open Deal Submission Review</a></p>
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
          : input?.type === 'waitlist' || input?.eventType === 'waitlist_entry_created'
            ? 'waitlist'
            : 'deal'
    const eventType = input?.eventType || (type === 'account' ? 'new_account_created' : type === 'buyer' ? 'new_buyer' : type === 'test' ? 'test_email' : type === 'contact' ? 'contact' : 'new_deal')
    const workspaceId = String(input?.workspaceId || input?.workspace_id || 'default')
    const relatedRecordId = String(input?.relatedRecordId || input?.related_record_id || input?.data?.id || '')
    const data = input?.data || {}
    const portalUrl = Deno.env.get('ADMIN_PORTAL_URL') || 'https://deal-blast-pro.vercel.app/app/submissions'

    if (type === 'waitlist') {
      const entryId = relatedRecordId || data?.id || data?.entryId
      if (!entryId) return json({ ok: false, error: 'Waitlist entry ID is required.' }, 400)
      const result = await sendWaitlistEmails(String(entryId), input?.idempotencyKey || `waitlist:${entryId}`)
      return json({ ok: Boolean(result.ok), provider: PROVIDER, waitlist: result })
    }

    const settings = eventType === 'new_account_created'
      ? await getAccountNotificationSettings(workspaceId)
      : await getNotificationSettings(workspaceId)
    const settingKey = eventSettingKey(eventType)
    let recipients = parseRecipients(input?.recipients).length
      ? parseRecipients(input?.recipients)
      : parseRecipients(settings.recipients)

    if (type === 'test') {
      const allowed = await safeAdminTestRecipients(req)
      if (!allowed.length) return json({ ok: false, error: 'Owner Admin verification is required for email tests.' }, 403)
      const requested = parseRecipients(input?.recipients)
      recipients = requested.length ? requested.filter((email: string) => allowed.includes(email)) : [allowed[0]]
      if (!recipients.length) return json({ ok: false, error: 'Test recipient is not authorized.' }, 403)
    }

    if (!isEssentialEvent(eventType) && (!settings.enabled || settings[settingKey] === false)) {
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
