import { getAuthenticatedAccount } from './_accountAuth.js'

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

async function invokeWaitlistRetry(entryId: string, serviceKey: string, supabaseUrl: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/notify-submission`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'waitlist',
      eventType: 'waitlist_entry_created',
      workspaceId: 'default',
      relatedRecordId: entryId,
      data: { id: entryId },
      idempotencyKey: `waitlist:${entryId}`,
    }),
  })
  const body = await response.json().catch(() => ({}))
  return { ok: response.ok && body?.ok !== false, status: response.status, body }
}

export default async function handler(req: any, res: any) {
  try {
    const account = await getAuthenticatedAccount(req)
    if (!account.isOwnerAdmin) return send(res, 403, { ok: false, error: 'Owner admin access is required.' })

    if (req.method === 'GET') {
      const { data, error } = await account.adminClient
        .from('waitlist_entries')
        .select('id,full_name,email,phone,primary_market,business_type,created_at,admin_notification_status,admin_notification_sent_at,confirmation_email_status,confirmation_email_sent_at,email_last_error,email_attempt_count')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return send(res, 200, { ok: true, entries: data || [] })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const entryId = String(body.entryId || '').trim()
      if (!entryId) return send(res, 400, { ok: false, error: 'Waitlist entry ID is required.' })
      const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
      const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
      if (!supabaseUrl || !serviceKey) return send(res, 500, { ok: false, error: 'Notification retry is not configured.' })
      const result = await invokeWaitlistRetry(entryId, serviceKey, supabaseUrl)
      return send(res, result.ok ? 200 : 502, { ok: result.ok, result })
    }

    res.setHeader('Allow', 'GET, POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Waitlist admin request failed.',
      code: error?.code || 'waitlist_admin_error',
    })
  }
}
