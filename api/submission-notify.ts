import { createClient } from '@supabase/supabase-js'

type SubmissionNotifyType = 'deal' | 'buyer'

const VALID_TYPES = new Set<SubmissionNotifyType>(['deal', 'buyer'])

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function clean(value: any, max = 500) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max)
}

function getAppUrl(req: any) {
  const configured = clean(process.env.ADMIN_PORTAL_URL || process.env.VITE_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL, 500)
  if (configured) return configured.replace(/\/$/, '')

  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host, 200)
  const protocol = clean(req.headers?.['x-forwarded-proto'] || 'https', 20)
  return host ? `${protocol}://${host}` : 'https://deal-blast-pro.vercel.app'
}

function getAdminClient() {
  const url = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceKey) throw new Error('Submission notification storage is not configured.')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function readSavedSubmission(type: SubmissionNotifyType, submissionId: string) {
  const admin = getAdminClient()
  const table = type === 'buyer' ? 'buyer_portal_submissions' : 'deal_submissions'
  const select = type === 'buyer'
    ? 'id,status,buyer_data,created_at'
    : 'id,status,deal_data,created_at'

  const { data, error } = await admin
    .from(table)
    .select(select)
    .eq('id', submissionId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return data
}

function buildNotificationData(type: SubmissionNotifyType, row: any, appUrl: string) {
  const payload = type === 'buyer' ? row?.buyer_data || {} : row?.deal_data || {}
  const reviewUrl = type === 'buyer'
    ? `${appUrl}/app/buyers?review=pending`
    : `${appUrl}/app/submissions`

  return {
    ...payload,
    id: row?.id || payload?.id,
    submissionId: row?.id || payload?.submissionId,
    submittedAt: payload?.submittedAt || row?.created_at,
    reviewUrl,
  }
}

async function notifySavedSubmission(req: any, input: {
  type: SubmissionNotifyType
  submissionId: string
}) {
  const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, skipped: true, reason: 'Missing Supabase function environment.' }
  }

  const row = await readSavedSubmission(input.type, input.submissionId)
  if (!row) {
    return { ok: false, status: 404, reason: 'Saved submission was not found.' }
  }

  const appUrl = getAppUrl(req)
  const eventType = input.type === 'buyer' ? 'new_buyer' : 'new_deal'
  const data = buildNotificationData(input.type, row, appUrl)

  const response = await fetch(`${supabaseUrl}/functions/v1/notify-submission`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: input.type,
      eventType,
      workspaceId: 'default',
      relatedRecordId: row.id,
      data,
      idempotencyKey: `${eventType}:${row.id}`,
    }),
  })

  const body = await response.json().catch(() => ({}))
  return {
    ok: response.ok && body?.ok !== false,
    status: response.status,
    body,
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const type = clean(body.type, 30) as SubmissionNotifyType
    const submissionId = clean(body.submissionId || body.relatedRecordId || body.id, 120)

    if (!VALID_TYPES.has(type)) {
      return send(res, 400, { ok: false, error: 'Unsupported notification type.' })
    }

    if (!submissionId) {
      return send(res, 400, { ok: false, error: 'Submission ID is required.' })
    }

    const result = await notifySavedSubmission(req, { type, submissionId })

    if (!result.ok) {
      console.error('[submission-notify] notification returned non-success', {
        type,
        submissionId,
        status: result.status || null,
        response: result.body ? JSON.stringify(result.body).slice(0, 1000) : result.reason || null,
      })
    }

    return send(res, 200, {
      ok: Boolean(result.ok),
      notificationRequested: Boolean(result.ok),
      status: result.status || null,
      skipped: Boolean((result as any).skipped),
      reason: (result as any).reason || null,
    })
  } catch (error: any) {
    console.error('[submission-notify] failed', error?.message || error)
    return send(res, 500, { ok: false, error: 'Submission notification failed.' })
  }
}
