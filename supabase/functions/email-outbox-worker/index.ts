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
  const { data: rows, error } = await client.from('email_outbox').select('*')
    .in('status', ['queued','retrying']).lte('next_attempt_at', new Date().toISOString()).lt('attempt_count', 6)
    .order('next_attempt_at').limit(25)
  if (error) return json({ ok: false, error: 'outbox_read_failed' }, 500)
  let sent = 0; let failed = 0; let suppressed = 0
  for (const row of rows || []) {
    const hash = await recipientHash(row.recipient)
    const { data: suppression } = await client.from('email_suppressions').select('recipient_hash').eq('recipient_hash', hash).maybeSingle()
    if (suppression && !row.essential) {
      await client.from('email_outbox').update({ status: 'suppressed', updated_at: new Date().toISOString() }).eq('id', row.id)
      suppressed += 1; continue
    }
    await client.from('email_outbox').update({ status: 'sending', attempt_count: row.attempt_count + 1, updated_at: new Date().toISOString() }).eq('id', row.id)
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
      authorization: `Bearer ${resendKey}`, 'content-type': 'application/json', 'Idempotency-Key': row.idempotency_key,
    }, body: JSON.stringify({ from, to: [row.recipient], subject: row.subject, html: row.html_body, text: row.text_body }) })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) {
      await client.from('email_outbox').update({ status: 'sent', provider_message_id: payload?.id || null,
        sent_at: new Date().toISOString(), last_error_category: null, updated_at: new Date().toISOString() }).eq('id', row.id)
      sent += 1
    } else {
      const terminal = row.attempt_count + 1 >= 6 || (response.status >= 400 && response.status < 500 && response.status !== 429)
      await client.from('email_outbox').update({ status: terminal ? 'failed' : 'retrying',
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** (row.attempt_count + 1)) * 60_000).toISOString(),
        last_error_category: response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'provider_unavailable' : 'provider_rejected',
        updated_at: new Date().toISOString() }).eq('id', row.id)
      failed += 1
    }
  }
  return json({ ok: true, processed: (rows || []).length, sent, failed, suppressed })
})
