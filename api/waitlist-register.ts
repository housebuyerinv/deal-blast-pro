import { createClient } from '@supabase/supabase-js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function clean(value: any, max = 500) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max)
}

function normalizeEmail(value: any) {
  return clean(value, 320).toLowerCase()
}

function getClientIp(req: any) {
  return clean(
    String(req.headers?.['x-forwarded-for'] || '').split(',')[0] ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown',
    120,
  )
}

function checkRateLimit(key: string) {
  const now = Date.now()
  const existing = rateLimitBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (existing.count >= RATE_LIMIT_MAX) return false
  existing.count += 1
  return true
}

function getAdminClient() {
  const url = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceKey) throw new Error('Waitlist storage is not configured.')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function notifyWaitlistEntry(entryId: string) {
  const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceKey) return { ok: false, skipped: true, reason: 'Missing Supabase function environment.' }

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    if (clean(body.website || body.companyWebsite)) {
      return send(res, 200, { ok: true, message: 'Thanks for registering.' })
    }

    const fullName = clean(body.fullName, 180)
    const email = normalizeEmail(body.email)
    const phone = clean(body.phone, 80)
    const primaryMarket = clean(body.primaryMarket, 180)
    const businessType = clean(body.businessType, 120)
    const notes = clean(body.notes, 2000)
    const sourcePage = clean(body.sourcePage || req.headers?.referer || 'public_waitlist', 500)
    const referralData = clean(body.referralData || req.headers?.['x-vercel-id'] || '', 500)

    if (fullName.length < 2) return send(res, 400, { ok: false, error: 'Enter your full name.' })
    if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: 'Enter a valid email address.' })

    const rateKey = `${getClientIp(req)}:${email}`
    if (!checkRateLimit(rateKey)) {
      return send(res, 429, { ok: false, error: 'Please wait a few minutes before trying again.' })
    }

    const admin = getAdminClient()
    const { data, error } = await admin
      .from('waitlist_entries')
      .insert({
        full_name: fullName,
        email,
        phone: phone || null,
        primary_market: primaryMarket || null,
        business_type: businessType || null,
        notes: notes || null,
        source: 'public_waitlist',
        source_page: sourcePage || null,
        referral_data: referralData || null,
        admin_notification_status: 'pending',
        confirmation_email_status: 'pending',
      })
      .select('id,email,created_at')
      .single()

    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (error.code === '23505' || message.includes('duplicate')) {
        return send(res, 200, {
          ok: true,
          duplicate: true,
          message: 'This email is already on the Deal Blast Pro waitlist. We will notify you when early access becomes available.',
        })
      }
      console.error('[waitlist-register] insert failed', { code: error.code, message: error.message })
      return send(res, 500, { ok: false, error: 'Waitlist registration could not be saved.' })
    }

    const notification = await notifyWaitlistEntry(data.id).catch((error: any) => {
      console.error('[waitlist-register] notification failed', { entryId: data.id, message: error?.message || String(error) })
      return { ok: false, error: 'notification_failed' }
    })
    if (!notification?.ok) {
      const notificationAny = notification as any
      console.error('[waitlist-register] notification returned non-success', {
        entryId: data.id,
        status: notificationAny?.status || null,
        response: notificationAny?.body ? JSON.stringify(notificationAny.body).slice(0, 1000) : notificationAny?.error || notificationAny?.reason || null,
      })
    }

    return send(res, 200, {
      ok: true,
      id: data.id,
      createdAt: data.created_at,
      notificationRequested: Boolean(notification?.ok),
      message: 'You are on the waitlist!',
    })
  } catch (error: any) {
    console.error('[waitlist-register] failed', error?.message || error)
    return send(res, 500, { ok: false, error: 'Waitlist registration failed.' })
  }
}
