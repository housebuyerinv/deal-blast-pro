import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map(v => v.toString(16).padStart(2, '0')).join('')
const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
const safeEqual = (a: string, b: string) => a.length === b.length && [...a].reduce((n, c, i) => n | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0

async function verify(body: string, req: Request, secret: string) {
  const id = req.headers.get('svix-id') || ''
  const timestamp = req.headers.get('svix-timestamp') || ''
  const signatures = (req.headers.get('svix-signature') || '').split(' ').map(v => v.replace(/^v1,/, '')).filter(Boolean)
  if (!id || !timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let key: Uint8Array
  try { key = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)) } catch { return false }
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return signatures.some(signature => safeEqual(signature, expected))
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ ok: false }, 405)
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') || ''
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const body = await req.text()
  if (!secret || !url || !key) return json({ ok: false, error: 'not_configured' }, 503)
  if (!await verify(body, req, secret)) return json({ ok: false, error: 'invalid_signature' }, 401)
  const event = JSON.parse(body)
  const providerEventId = String(event?.data?.id || req.headers.get('svix-id') || '')
  const providerMessageId = String(event?.data?.email_id || event?.data?.email?.id || '')
  const eventType = String(event?.type || '').toLowerCase()
  const statusMap: Record<string, string> = {
    'email.sent': 'sent', 'email.delivered': 'delivered', 'email.delivery_delayed': 'retrying',
    'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed', 'email.suppressed': 'suppressed',
  }
  const status = statusMap[eventType] || 'sent'
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data: outbox } = await client.from('email_outbox').select('id,recipient').eq('provider_message_id', providerMessageId).maybeSingle()
  await client.from('email_delivery_events').insert({ outbox_id: outbox?.id || null, provider_event_id: providerEventId,
    provider_message_id: providerMessageId || null, event_type: eventType, status,
    safe_metadata: { provider: 'resend' }, occurred_at: event?.created_at || new Date().toISOString() })
  if (outbox?.id) await client.from('email_outbox').update({ status,
    delivered_at: status === 'delivered' ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() }).eq('id', outbox.id)
  if (outbox?.recipient && ['bounced','complained','suppressed'].includes(status)) {
    await client.from('email_suppressions').upsert({ recipient_hash: await sha256(String(outbox.recipient).trim().toLowerCase()),
      reason: status === 'complained' ? 'complaint' : 'bounce', provider_event_id: providerEventId }, { onConflict: 'recipient_hash' })
  }
  return json({ ok: true })
})
