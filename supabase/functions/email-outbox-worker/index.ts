import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map(v => v.toString(16).padStart(2, '0')).join('')
const recipientHash = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase())))

Deno.serve(async req => {
  const cronSecret = Deno.env.get('EMAIL_OUTBOX_CRON_SECRET') || ''
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return json({ ok: false }, 401)
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const from = Deno.env.get('NOTIFY_FROM_EMAIL') || ''
  if (!url || !key || !resendKey || !from) return json({ ok: false, error: 'not_configured' }, 503)
  const client = createClient(url, key, { auth: { persistSession: false } })
  const workerToken = crypto.randomUUID()
  const { data: rows, error } = await client.rpc('claim_email_outbox_batch', {
    p_worker_token: workerToken, p_batch_size: 25, p_lease_seconds: 120,
  })
  if (error) return json({ ok: false, error: 'outbox_claim_failed' }, 500)
  let sent = 0; let failed = 0; let suppressed = 0
  for (const row of rows || []) {
    const hash = await recipientHash(row.recipient)
    const { data: suppression } = await client.from('email_suppressions').select('recipient_hash').eq('recipient_hash', hash).maybeSingle()
    if (suppression && !row.essential) {
      await client.from('email_outbox').update({ status: 'suppressed', completed_at: new Date().toISOString(),
        lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', row.id).eq('lease_token', workerToken)
      suppressed += 1; continue
    }
    let response: Response | null = null
    let payload: Record<string, unknown> = {}
    try {
      response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
        authorization: `Bearer ${resendKey}`, 'content-type': 'application/json', 'Idempotency-Key': row.idempotency_key,
      }, body: JSON.stringify({ from, to: [row.recipient], subject: row.subject, html: row.html_body, text: row.text_body }) })
      payload = await response.json().catch(() => ({}))
    } catch {
      response = null
    }
    if (response?.ok) {
      await client.from('email_outbox').update({ status: 'provider_accepted', provider_message_id: payload?.id || null,
        sent_at: new Date().toISOString(), last_error_category: null, lease_token: null, lease_expires_at: null,
        updated_at: new Date().toISOString() }).eq('id', row.id).eq('lease_token', workerToken)
      sent += 1
    } else {
      const statusCode = response?.status || 0
      const terminal = Number(row.attempt_count || 0) >= 6 || (statusCode >= 400 && statusCode < 500 && statusCode !== 429)
      await client.from('email_outbox').update({ status: terminal ? 'failed_permanently' : 'retry_scheduled',
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** Number(row.attempt_count || 1)) * 60_000).toISOString(),
        last_error_category: statusCode === 429 ? 'rate_limit' : statusCode >= 500 || statusCode === 0 ? 'provider_unavailable' : 'provider_rejected',
        completed_at: terminal ? new Date().toISOString() : null, lease_token: null, lease_expires_at: null,
        updated_at: new Date().toISOString() }).eq('id', row.id).eq('lease_token', workerToken)
      failed += 1
    }
  }
  return json({ ok: true, processed: (rows || []).length, sent, failed, suppressed })
})
