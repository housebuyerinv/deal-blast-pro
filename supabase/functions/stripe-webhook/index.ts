const STORAGE_KEY = 'dealblastpro-v1'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const normalize = (value: unknown) => String(value || '').trim().toLowerCase()

const toIso = (seconds?: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) return ''
  return new Date(seconds * 1000).toISOString()
}

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

const verifyStripeSignature = async (payload: string, signatureHeader: string | null, secret: string) => {
  if (!signatureHeader || !secret) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(part => {
      const [key, value] = part.split('=')
      return [key, value]
    })
  )

  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signedPayload = `${timestamp}.${payload}`
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))

  return safeEqual(bytesToHex(digest), signature)
}

const stripeGet = async (path: string) => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) return null

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })

  if (!response.ok) return null
  return response.json()
}

const inferPlanAndFrequency = (amountTotal?: number | null) => {
  const amount = Number(amountTotal || 0)
  if (amount === 4700) return { plan: 'Starter', billingFrequency: 'monthly' }
  if (amount === 47000) return { plan: 'Starter', billingFrequency: 'annual' }
  if (amount === 9700) return { plan: 'Pro', billingFrequency: 'monthly' }
  if (amount === 97000 || amount === 87300) return { plan: 'Pro', billingFrequency: 'annual' }
  return { plan: '', billingFrequency: '' }
}

const formatAmount = (amount?: number | null, currency = 'usd') => {
  const value = Number(amount || 0)
  if (!value) return ''
  const dollars = value / 100
  const formatted = dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)
  return `${currency.toUpperCase()} $${formatted}`
}

const getId = (value: unknown) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'id' in value) return String((value as any).id || '')
  return ''
}

const addPeriodEndFallback = (periodStart: string, billingFrequency: string) => {
  if (!periodStart) return ''
  const start = new Date(periodStart)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start)
  if (billingFrequency === 'annual') end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  return end.toISOString()
}

const extractActivation = async (event: any) => {
  const object = event?.data?.object || {}
  const metadata = object.metadata || {}
  let subscription: any = null
  let customer: any = null
  let latestInvoice: any = null

  if (object.subscription) {
    subscription = await stripeGet(`/v1/subscriptions/${getId(object.subscription)}`)
  } else if (object.id && String(event?.type || '').startsWith('customer.subscription.')) {
    subscription = object
  }

  if (String(event?.type || '').startsWith('invoice.')) {
    latestInvoice = object
  } else {
    const latestInvoiceId = getId(subscription?.latest_invoice || object.latest_invoice)
    if (latestInvoiceId) latestInvoice = await stripeGet(`/v1/invoices/${latestInvoiceId}`)
  }

  const customerId = getId(object.customer || subscription?.customer || latestInvoice?.customer)
  if (customerId) {
    customer = await stripeGet(`/v1/customers/${customerId}`)
  }

  const subscriptionMetadata = subscription?.metadata || {}
  const inferred = inferPlanAndFrequency(object.amount_total || object.amount_paid || object.amount_due || object.total)
  const plan = String(metadata.selectedPlan || subscriptionMetadata.selectedPlan || inferred.plan || '').trim()
  const billingFrequency = String(metadata.billingFrequency || subscriptionMetadata.billingFrequency || inferred.billingFrequency || '').trim()
  const dealBlastUserId = String(
    metadata.dealBlastUserId ||
    subscriptionMetadata.dealBlastUserId ||
    object.client_reference_id ||
    ''
  ).trim()
  const email = String(
    metadata.dealBlastEmail ||
    subscriptionMetadata.dealBlastEmail ||
    object.customer_details?.email ||
    object.customer_email ||
    customer?.email ||
    ''
  ).trim()
  const periodStart = toIso(subscription?.current_period_start || object.period_start || object.created)
  const periodEnd = toIso(subscription?.current_period_end || object.period_end)
  const amount = object.amount_total || object.amount_paid || object.amount_due || object.total || subscription?.plan?.amount || null
  const currency = object.currency || subscription?.currency || 'usd'
  const latestInvoiceStatus = String(latestInvoice?.status || object.status || '').trim()
  const latestInvoiceId = getId(latestInvoice || (String(event?.type || '').startsWith('invoice.') ? object : null))
  const amountRemaining = Number(latestInvoice?.amount_remaining ?? object.amount_remaining ?? 0)

  return {
    plan,
    billingFrequency,
    dealBlastUserId,
    email,
    periodStart,
    periodEnd: periodEnd || addPeriodEndFallback(periodStart, billingFrequency),
    amount,
    currency,
    stripeCustomerId: customerId,
    stripeSubscriptionId: getId(subscription || object.subscription),
    subscriptionStatus: String(subscription?.status || (String(event?.type || '').startsWith('customer.subscription.') ? object.status : '') || '').trim(),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end || object.cancel_at_period_end),
    latestInvoiceId,
    latestInvoiceStatus,
    latestInvoiceHostedUrl: String(latestInvoice?.hosted_invoice_url || object.hosted_invoice_url || '').trim(),
    latestInvoicePdf: String(latestInvoice?.invoice_pdf || object.invoice_pdf || '').trim(),
    outstandingBalance: String(event?.type || '').startsWith('invoice.paid') || String(event?.type || '') === 'invoice.payment_succeeded'
      ? 0
      : Number.isFinite(amountRemaining)
        ? Math.max(0, amountRemaining)
        : 0,
  }
}

const getSnapshotByUserId = async (supabaseUrl: string, serviceKey: string, userId: string) => {
  if (!userId) return null
  const url = `${supabaseUrl}/rest/v1/cloud_snapshots?user_id=eq.${encodeURIComponent(userId)}&storage_key=eq.${encodeURIComponent(STORAGE_KEY)}&select=user_id,snapshot`
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })
  if (!response.ok) return null
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] || null : null
}

const getSnapshotByEmail = async (supabaseUrl: string, serviceKey: string, email: string) => {
  if (!email) return null
  const url = `${supabaseUrl}/rest/v1/cloud_snapshots?storage_key=eq.${encodeURIComponent(STORAGE_KEY)}&select=user_id,snapshot&limit=1000`
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })
  if (!response.ok) return null
  const rows = await response.json()
  if (!Array.isArray(rows)) return null

  const target = normalize(email)
  return rows.find(row => {
    const state = row?.snapshot?.state || {}
    return normalize(state.workspaceOwnerEmail) === target || normalize(state.user?.email) === target
  }) || null
}

const getBillingOutcome = (event: any) => {
  const type = String(event?.type || '')
  const object = event?.data?.object || {}
  const subscriptionStatus = String(object.status || '').toLowerCase()

  if (type === 'invoice.payment_failed') {
    return { billingStatus: 'Past Due', paymentCollectionStatus: 'Past Due', paymentStatus: 'Failed', note: 'Stripe payment failed', isPaid: false }
  }

  if (type === 'invoice.payment_action_required') {
    return { billingStatus: 'Past Due', paymentCollectionStatus: 'Payment Action Required', paymentStatus: 'Failed', note: 'Stripe payment action is required', isPaid: false }
  }

  if (type === 'customer.subscription.deleted' || subscriptionStatus === 'canceled') {
    return { billingStatus: 'Cancelled', paymentCollectionStatus: 'Cancelled', paymentStatus: 'Cancelled', note: 'Stripe subscription cancelled', isPaid: false }
  }

  if (object.cancel_at_period_end) {
    return { billingStatus: 'Paid Active', paymentCollectionStatus: 'Cancellation Scheduled', paymentStatus: 'Paid', note: 'Stripe subscription cancellation scheduled at period end', isPaid: true }
  }

  if (subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') {
    return { billingStatus: 'Past Due', paymentCollectionStatus: 'Past Due', paymentStatus: 'Failed', note: 'Stripe subscription is past due', isPaid: false }
  }

  return { billingStatus: 'Paid Active', paymentCollectionStatus: 'Active / Paid', paymentStatus: 'Paid', note: 'Activated automatically from Stripe webhook', isPaid: true }
}

const saveBillingEvent = async (
  supabaseUrl: string,
  serviceKey: string,
  row: any,
  activation: Awaited<ReturnType<typeof extractActivation>>,
  event: any
) => {
  const snapshot = row?.snapshot || {}
  const state = snapshot.state || {}
  const existingTrial = state.trial || {}
  const existingSettings = state.settings || {}
  const existingBillingCenter = existingSettings.billingCenter || {}
  const existingHistory = Array.isArray(existingBillingCenter.paymentHistory) ? existingBillingCenter.paymentHistory : []
  const now = new Date().toISOString()
  const outcome = getBillingOutcome(event)
  const eventId = String(event?.id || `stripe_${Date.now()}`)
  const nextPlan = activation.plan || existingTrial.plan || 'Free Demo'
  const nextFrequency = activation.billingFrequency || existingTrial.billingFrequency || 'monthly'
  const nextPeriodStart = activation.periodStart || existingTrial.billingPeriodStart || now
  const nextPeriodEnd = activation.periodEnd || existingTrial.billingPeriodEnd || ''
  const historyRecord = {
    id: `stripe-${eventId}`,
    paymentDate: now,
    plan: nextPlan,
    billingFrequency: nextFrequency,
    amount: formatAmount(activation.amount, activation.currency) || 'Needs Review',
    status: outcome.paymentStatus,
    provider: 'Stripe',
    providerReference: eventId,
    receiptLink: '',
    adminNote: outcome.note,
    createdAt: now,
    billingPeriodStart: nextPeriodStart,
    billingPeriodEnd: nextPeriodEnd,
  }

  const nextSnapshot = {
    ...snapshot,
    state: {
      ...state,
      trial: {
        ...existingTrial,
        plan: outcome.isPaid ? nextPlan : existingTrial.plan || nextPlan,
        isPaid: outcome.isPaid,
        isActive: outcome.isPaid,
        daysLeft: outcome.isPaid ? 999 : existingTrial.daysLeft,
        billingStatus: outcome.billingStatus,
        billingFrequency: nextFrequency,
        paymentProvider: 'Stripe',
        billingPeriodStart: nextPeriodStart,
        billingPeriodEnd: nextPeriodEnd,
        billingAdminNote: outcome.note,
        billingUpdatedAt: now,
        stripeLastEventId: eventId,
      },
      settings: {
        ...existingSettings,
        billingCenter: {
          ...existingBillingCenter,
          paymentCollectionStatus: outcome.paymentCollectionStatus,
          stripeWebhookStatus: 'Configured',
          autoActivationStatus: 'Ready',
          lastStripeSyncAt: now,
          unmatchedStripePaymentCount: existingBillingCenter.unmatchedStripePaymentCount || 0,
          stripeCustomerId: activation.stripeCustomerId || existingBillingCenter.stripeCustomerId || '',
          stripeSubscriptionId: activation.stripeSubscriptionId || existingBillingCenter.stripeSubscriptionId || '',
          subscriptionStatus: activation.subscriptionStatus || existingBillingCenter.subscriptionStatus || '',
          currentPeriodEnd: nextPeriodEnd,
          cancelAtPeriodEnd: activation.cancelAtPeriodEnd,
          outstandingBalance: activation.outstandingBalance,
          latestInvoiceStatus: activation.latestInvoiceStatus || existingBillingCenter.latestInvoiceStatus || '',
          latestInvoiceId: activation.latestInvoiceId || existingBillingCenter.latestInvoiceId || '',
          latestInvoiceHostedUrl: activation.latestInvoiceHostedUrl || existingBillingCenter.latestInvoiceHostedUrl || '',
          latestInvoicePdf: activation.latestInvoicePdf || existingBillingCenter.latestInvoicePdf || '',
          paymentHistory: [historyRecord, ...existingHistory.filter((record: any) => record?.providerReference !== eventId)].slice(0, 100),
        },
      },
    },
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/cloud_snapshots?user_id=eq.${encodeURIComponent(row.user_id)}&storage_key=eq.${encodeURIComponent(STORAGE_KEY)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      snapshot: nextSnapshot,
      updated_at: now,
    }),
  })

  if (!response.ok) return false

  const workspaceId = String(state.workspaceInstanceId || state.settings?.workspaceInstanceId || '').trim()
  if (workspaceId) {
    const isPastDue = outcome.billingStatus === 'Past Due'
    const isRecovered = outcome.billingStatus === 'Paid Active'
    await fetch(`${supabaseUrl}/rest/v1/workspace_plan_assignments?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        plan_name: outcome.isPaid ? nextPlan : existingTrial.plan || nextPlan,
        billing_status: outcome.billingStatus,
        payment_status: outcome.paymentStatus,
        past_due_since: isPastDue ? existingTrial.billingUpdatedAt || now : null,
        payment_recovered_at: isRecovered ? now : null,
        subscription_access_ends_at: outcome.billingStatus === 'Cancelled' ? nextPeriodEnd || now : null,
        subscription_cancel_at_period_end: activation.cancelAtPeriodEnd,
        stripe_customer_id: activation.stripeCustomerId || null,
        stripe_subscription_id: activation.stripeSubscriptionId || null,
        subscription_status: activation.subscriptionStatus || null,
        current_period_end: nextPeriodEnd || null,
        cancel_at_period_end: activation.cancelAtPeriodEnd,
        outstanding_balance: activation.outstandingBalance,
        latest_invoice_status: activation.latestInvoiceStatus || null,
        latest_invoice_id: activation.latestInvoiceId || null,
        latest_invoice_hosted_url: activation.latestInvoiceHostedUrl || null,
        latest_invoice_pdf: activation.latestInvoicePdf || null,
        updated_at: now,
      }),
    })
  }

  return true
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'Webhook environment not configured' }, 500)
  }

  const verified = await verifyStripeSignature(payload, signature, webhookSecret)
  if (!verified) return json({ ok: false, error: 'Invalid signature' }, 400)

  const event = JSON.parse(payload)
  const supportedEvents = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'invoice.paid',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ])

  if (!supportedEvents.has(event.type)) return json({ ok: true, ignored: true })

  const activation = await extractActivation(event)
  if (activation.plan !== 'Starter' && activation.plan !== 'Pro') {
    return json({ ok: true, needsReview: true, reason: 'Unsupported or missing plan' }, 202)
  }
  if (activation.billingFrequency !== 'monthly' && activation.billingFrequency !== 'annual') {
    return json({ ok: true, needsReview: true, reason: 'Unsupported or missing billing frequency' }, 202)
  }

  const row =
    await getSnapshotByUserId(supabaseUrl, serviceKey, activation.dealBlastUserId) ||
    await getSnapshotByEmail(supabaseUrl, serviceKey, activation.email)

  if (!row?.user_id) {
    return json({ ok: true, needsReview: true, reason: 'No matching workspace snapshot' }, 202)
  }

  const saved = await saveBillingEvent(supabaseUrl, serviceKey, row, activation, event)
  if (!saved) return json({ ok: false, error: 'Billing update failed' }, 500)

  return json({ ok: true, updated: true })
})
