const STORAGE_KEY = 'dealblastpro-v1'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const normalize = (value: unknown) => String(value || '').trim().toLowerCase()

const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
}

const toIso = (seconds?: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) return ''
  return new Date(seconds * 1000).toISOString()
}

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')

const sha256 = async (value: string) => bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

const serviceHeaders = (serviceKey: string, prefer = '') => ({
  apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
})

export const parseRpcDiagnostic = async (response: Response) => {
  let body: Record<string, unknown> = {}
  try {
    const parsed = await response.clone().json()
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    // Keep diagnostics safe when the provider returns a non-JSON body.
  }
  const safe = (value: unknown) => typeof value === 'string' ? value.slice(0, 500) : undefined
  return { status: response.status, code: safe(body.code), message: safe(body.message), details: safe(body.details), hint: safe(body.hint) }
}

export const parseStripeAuthDiagnostic = async (response: Response) => {
  let body: Record<string, unknown> = {}
  try {
    const parsed = await response.clone().json()
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    // Keep diagnostics safe when Stripe returns a non-JSON body.
  }
  const safe = (value: unknown) => typeof value === 'string' ? value.slice(0, 500) : undefined
  const error = body.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : body
  return {
    status: response.status,
    type: safe(error.type),
    code: safe(error.code),
    message: safe(error.message),
    requestId: safe(response.headers.get('request-id')),
  }
}

const claimStripeEvent = async (supabaseUrl: string, serviceKey: string, event: any, payloadHash: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/stripe_event_receipts`, {
    method: 'POST', headers: serviceHeaders(serviceKey, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({ stripe_event_id: String(event.id), event_type: String(event.type), livemode: Boolean(event.livemode), payload_sha256: payloadHash }),
  })
  if (!response.ok) throw new Error('stripe_event_receipt_unavailable')
  const rows = await response.json()
  if (Array.isArray(rows) && rows.length > 0) return true
  const existingResponse = await fetch(`${supabaseUrl}/rest/v1/stripe_event_receipts?stripe_event_id=eq.${encodeURIComponent(event.id)}&select=processing_status,attempt_count`, { headers: serviceHeaders(serviceKey) })
  const existingRows = await existingResponse.json()
  const existing = existingRows?.[0]
  if (existing?.processing_status !== 'failed') return false
  await fetch(`${supabaseUrl}/rest/v1/stripe_event_receipts?stripe_event_id=eq.${encodeURIComponent(event.id)}`, {
    method: 'PATCH', headers: serviceHeaders(serviceKey, 'return=minimal'), body: JSON.stringify({ processing_status: 'processing',
      attempt_count: Number(existing.attempt_count || 1) + 1, last_received_at: new Date().toISOString(), error_category: null }),
  })
  return true
}

const finishStripeEvent = async (supabaseUrl: string, serviceKey: string, eventId: string, status: string, category = '', metadata?: Record<string, unknown>) => {
  await fetch(`${supabaseUrl}/rest/v1/stripe_event_receipts?stripe_event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH', headers: serviceHeaders(serviceKey, 'return=minimal'),
    body: JSON.stringify({ processing_status: status, processed_at: new Date().toISOString(), error_category: category || null, last_received_at: new Date().toISOString(), ...(metadata ? { metadata } : {}) }),
  })
}

type CreditPackDefinition = { key: string; credits: number; amountCents: number; stripePriceId: string }

const readCreditPackDefinitions = (): CreditPackDefinition[] => {
  const defaults = [
    { key: 'credits_10', credits: 10, amountCents: 800, envKey: 'STRIPE_PRICE_CREDITS_10' },
    { key: 'credits_25', credits: 25, amountCents: 1500, envKey: 'STRIPE_PRICE_CREDITS_25' },
    { key: 'credits_100', credits: 100, amountCents: 4900, envKey: 'STRIPE_PRICE_CREDITS_100' },
    { key: 'credits_250', credits: 250, amountCents: 9900, envKey: 'STRIPE_PRICE_CREDITS_250' },
  ]
  let configured: any[] = []
  try { configured = JSON.parse(Deno.env.get('PROPERTY_INTELLIGENCE_CREDIT_PACKS_JSON') || '[]') } catch { configured = [] }
  return defaults.map(fallback => {
    const override = configured.find(item => String(item?.key || '') === fallback.key) || {}
    return {
      key: fallback.key,
      credits: Math.max(1, Number(override.credits) || fallback.credits),
      amountCents: Math.max(1, Number(override.amountCents) || fallback.amountCents),
      stripePriceId: String(override.stripePriceId || Deno.env.get(fallback.envKey) || '').trim(),
    }
  })
}

const resolvePaidCreditPack = async (object: any) => {
  let lineItems = object?.line_items?.data
  if ((!Array.isArray(lineItems) || !lineItems.length) && object?.id) {
    const response = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(object.id)}/line_items?limit=2`)
    lineItems = response?.data
  }
  if (!Array.isArray(lineItems) || lineItems.length !== 1 || Number(lineItems[0]?.quantity || 0) !== 1) {
    throw new Error('credit_pack_line_items_invalid')
  }
  const priceId = String(lineItems[0]?.price?.id || '').trim()
  const pack = readCreditPackDefinitions().find(item => item.stripePriceId && item.stripePriceId === priceId)
  if (!pack) throw new Error('credit_pack_price_not_configured')
  if (Number(object.amount_total || 0) !== pack.amountCents) throw new Error('credit_pack_amount_mismatch')
  return { pack, priceId }
}

const fulfillCreditPack = async (supabaseUrl: string, serviceKey: string, event: any) => {
  const object = event?.data?.object || {}
  const metadata = object.metadata || {}
  if (metadata.purchaseKind !== 'property_intelligence_credit_pack') return false
  if (String(object.payment_status || '') !== 'paid') throw new Error('credit_pack_payment_not_verified')
  const workspaceId = String(metadata.workspaceId || '').trim()
  const packKey = String(metadata.packKey || '').trim()
  if (!workspaceId || !packKey) throw new Error('credit_pack_metadata_invalid')
  const { pack, priceId } = await resolvePaidCreditPack(object)
  if (pack.key !== packKey) throw new Error('credit_pack_definition_mismatch')
  const purchaseResponse = await fetch(`${supabaseUrl}/rest/v1/property_intelligence_addon_purchases`, {
    method: 'POST', headers: serviceHeaders(serviceKey, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify({ workspace_id: workspaceId, stripe_event_id: event.id, stripe_session_id: object.id,
      pack_key: pack.key, stripe_price_id: priceId, credits_purchased: pack.credits,
      amount_cents: Number(object.amount_total || 0), currency: String(object.currency || 'usd'), status: 'pending' }),
  })
  if (!purchaseResponse.ok) throw new Error('credit_pack_purchase_write_failed')
  let rows = await purchaseResponse.json()
  if (!Array.isArray(rows) || !rows[0]?.id) {
    const existing = await fetch(`${supabaseUrl}/rest/v1/property_intelligence_addon_purchases?stripe_event_id=eq.${encodeURIComponent(event.id)}&select=id`, { headers: serviceHeaders(serviceKey) })
    rows = await existing.json()
  }
  const purchaseId = rows?.[0]?.id
  if (!purchaseId) throw new Error('credit_pack_purchase_unresolved')
  const grant = await fetch(`${supabaseUrl}/rest/v1/rpc/grant_property_intelligence_purchase`, {
    method: 'POST', headers: serviceHeaders(serviceKey), body: JSON.stringify({ p_workspace_id: workspaceId, p_purchase_id: purchaseId,
      p_credits: pack.credits, p_stripe_event_id: event.id, p_idempotency_key: `stripe:credit-pack:${event.id}` }),
  })
  if (!grant.ok) {
    const diagnostic = await parseRpcDiagnostic(grant)
    console.error('credit_pack_grant_rpc_failed', diagnostic)
    throw Object.assign(new Error('credit_pack_grant_failed'), { rpcDiagnostic: diagnostic })
  }
  return true
}

const grantIncludedCredits = async (supabaseUrl: string, serviceKey: string, event: any, workspaceId: string,
  plan: string, periodStart: string, periodEnd: string) => {
  if (!['invoice.paid','invoice.payment_succeeded'].includes(String(event.type)) || !workspaceId || !periodStart || !periodEnd) return
  let enterpriseLimit: number | null = null
  if (plan === 'Enterprise') {
    const configResponse = await fetch(`${supabaseUrl}/rest/v1/workspace_plan_assignments?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=property_intelligence_included_credits`, { headers: serviceHeaders(serviceKey) })
    const rows = configResponse.ok ? await configResponse.json() : []
    const configured = Number(rows?.[0]?.property_intelligence_included_credits)
    if (!Number.isInteger(configured) || configured < 0) throw new Error('enterprise_credit_allowance_not_configured')
    enterpriseLimit = configured
  }
  const invoiceId = String(event?.data?.object?.id || event.id)
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/grant_property_intelligence_included_credits`, {
    method: 'POST', headers: serviceHeaders(serviceKey), body: JSON.stringify({ p_workspace_id: workspaceId, p_plan_name: plan,
      p_period_start: periodStart.slice(0,10), p_period_end: periodEnd.slice(0,10), p_idempotency_key: `stripe:included:${invoiceId}:${periodStart.slice(0,10)}`,
      p_enterprise_limit: enterpriseLimit, p_reason: 'verified_stripe_billing_cycle' }),
  })
  if (!response.ok) throw new Error('included_credit_grant_failed')
}

const adjustCreditPack = async (supabaseUrl: string, serviceKey: string, event: any) => {
  if (!['charge.refunded','charge.dispute.created'].includes(String(event.type))) return false
  const metadata = event?.data?.object?.metadata || {}
  if (metadata.purchaseKind !== 'property_intelligence_credit_pack') return false
  const workspaceId = String(metadata.workspaceId || '').trim(); const packKey = String(metadata.packKey || '').trim()
  const pack = readCreditPackDefinitions().find(item => item.key === packKey)
  if (!workspaceId || !pack) throw new Error('credit_adjustment_metadata_invalid')
  const entryType = event.type === 'charge.refunded' ? 'refund' : 'dispute'
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/adjust_property_intelligence_purchased_credits`, {
    method: 'POST', headers: serviceHeaders(serviceKey), body: JSON.stringify({ p_workspace_id: workspaceId,
      p_requested_debit: pack.credits, p_entry_type: entryType, p_idempotency_key: `stripe:${entryType}:${event.id}`,
      p_reason: `verified_stripe_${entryType}`, p_stripe_event_id: event.id, p_created_by_user_id: null }),
  })
  if (!response.ok) throw new Error('credit_adjustment_failed')
  return true
}

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

const getPricePlan = (priceId: string) => {
  const normalized = String(priceId || '').trim()
  const pairs: Array<[string | undefined, string, string]> = [
    [Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY'), 'Starter', 'monthly'],
    [Deno.env.get('STRIPE_PRICE_STARTER_ANNUAL'), 'Starter', 'annual'],
    [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'), 'Pro', 'monthly'],
    [Deno.env.get('STRIPE_PRICE_PRO_ANNUAL'), 'Pro', 'annual'],
    [Deno.env.get('STRIPE_PRICE_AGENCY_MONTHLY'), 'Agency', 'monthly'],
    [Deno.env.get('STRIPE_PRICE_AGENCY_ANNUAL'), 'Agency', 'annual'],
    [Deno.env.get('STRIPE_PRICE_ENTERPRISE_MONTHLY'), 'Enterprise', 'monthly'],
    [Deno.env.get('STRIPE_PRICE_ENTERPRISE_ANNUAL'), 'Enterprise', 'annual'],
  ]
  const match = pairs.find(([id]) => String(id || '').trim() === normalized)
  return match ? { plan: match[1], billingFrequency: match[2] } : null
}

const rankPlan = (plan: string) => PLAN_RANK[normalize(plan)] ?? 0

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
  const stripePriceId = getId(subscription?.items?.data?.[0]?.price || object.lines?.data?.[0]?.price || object.price)
  const stripeProductId = getId(subscription?.items?.data?.[0]?.price?.product || object.lines?.data?.[0]?.price?.product || object.price?.product)
  const mappedPrice = getPricePlan(stripePriceId)
  const inferred = inferPlanAndFrequency(object.amount_total || object.amount_paid || object.amount_due || object.total)
  const plan = String(mappedPrice?.plan || metadata.selectedPlan || subscriptionMetadata.selectedPlan || inferred.plan || '').trim()
  const billingFrequency = String(mappedPrice?.billingFrequency || metadata.billingFrequency || subscriptionMetadata.billingFrequency || inferred.billingFrequency || '').trim()
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
    stripePriceId,
    stripeProductId,
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
  const nextPlan = outcome.billingStatus === 'Cancelled' ? 'Free' : activation.plan || existingTrial.plan || 'Free Demo'
  const nextFrequency = activation.billingFrequency || existingTrial.billingFrequency || 'monthly'
  const nextPeriodStart = activation.periodStart || existingTrial.billingPeriodStart || now
  const nextPeriodEnd = activation.periodEnd || existingTrial.billingPeriodEnd || ''
  const currentAccessPlan = existingTrial.effectiveAccessPlan || existingTrial.plan || nextPlan
  const isDowngrade = rankPlan(nextPlan) < rankPlan(currentAccessPlan)
  const scheduledPlan = activation.cancelAtPeriodEnd && nextPeriodEnd
    ? 'Free'
    : isDowngrade && nextPeriodEnd
      ? nextPlan
      : ''
  const effectiveAccessPlan = scheduledPlan && nextPeriodEnd ? currentAccessPlan : nextPlan
  const trialPlan = scheduledPlan && nextPeriodEnd ? currentAccessPlan : nextPlan
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
        plan: outcome.isPaid ? trialPlan : existingTrial.plan || nextPlan,
        currentPlan: outcome.isPaid ? nextPlan : existingTrial.currentPlan || existingTrial.plan || nextPlan,
        effectiveAccessPlan: outcome.isPaid ? effectiveAccessPlan : existingTrial.effectiveAccessPlan || existingTrial.plan || nextPlan,
        scheduledPlan,
        scheduledPlanChangeAt: scheduledPlan ? nextPeriodEnd : '',
        scheduledPlanChangeReason: scheduledPlan ? 'period_end_downgrade' : '',
        isPaid: outcome.isPaid,
        isActive: outcome.isPaid,
        daysLeft: outcome.isPaid ? 999 : existingTrial.daysLeft,
        billingStatus: outcome.billingStatus,
        billingFrequency: nextFrequency,
        billingInterval: nextFrequency,
        stripePriceId: activation.stripePriceId || existingTrial.stripePriceId || '',
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
          currentPlan: outcome.isPaid ? nextPlan : existingBillingCenter.currentPlan || existingTrial.currentPlan || existingTrial.plan || nextPlan,
          effectiveAccessPlan: outcome.isPaid ? effectiveAccessPlan : existingBillingCenter.effectiveAccessPlan || existingTrial.effectiveAccessPlan || existingTrial.plan || nextPlan,
          scheduledPlan,
          scheduledPlanChangeAt: scheduledPlan ? nextPeriodEnd : '',
          scheduledPlanChangeReason: scheduledPlan ? 'period_end_downgrade' : '',
          billingInterval: nextFrequency,
          stripePriceId: activation.stripePriceId || existingBillingCenter.stripePriceId || '',
          stripeProductId: activation.stripeProductId || existingBillingCenter.stripeProductId || '',
          prorationBehavior: scheduledPlan ? 'period_end' : '',
          lastPlanSyncAt: now,
          planChangeSource: 'stripe_webhook',
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
        plan_name: outcome.isPaid ? trialPlan : existingTrial.plan || nextPlan,
        current_plan: outcome.isPaid ? nextPlan : existingTrial.currentPlan || existingTrial.plan || nextPlan,
        effective_access_plan: outcome.isPaid ? effectiveAccessPlan : existingTrial.effectiveAccessPlan || existingTrial.plan || nextPlan,
        scheduled_plan: scheduledPlan || null,
        scheduled_plan_change_at: scheduledPlan ? nextPeriodEnd : null,
        scheduled_plan_change_reason: scheduledPlan ? 'period_end_downgrade' : null,
        billing_interval: nextFrequency,
        stripe_price_id: activation.stripePriceId || null,
        stripe_product_id: activation.stripeProductId || null,
        proration_behavior: scheduledPlan ? 'period_end' : null,
        last_plan_sync_at: now,
        plan_change_source: 'stripe_webhook',
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
  const claimed = await claimStripeEvent(supabaseUrl, serviceKey, event, await sha256(payload))
  if (!claimed) return json({ ok: true, duplicate: true })
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
    'charge.refunded',
    'charge.dispute.created',
  ])

  if (!supportedEvents.has(event.type)) {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'ignored')
    return json({ ok: true, ignored: true })
  }

  try {
    if (await adjustCreditPack(supabaseUrl, serviceKey, event)) {
      await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'processed')
      return json({ ok: true, creditPackAdjusted: true })
    }
    if (await fulfillCreditPack(supabaseUrl, serviceKey, event)) {
      await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'processed')
      return json({ ok: true, creditPackFulfilled: true })
    }
  } catch (error) {
    const rpcDiagnostic = (error as { rpcDiagnostic?: Record<string, unknown> })?.rpcDiagnostic
    const stripeAuthDiagnostic = (error as { stripeAuthDiagnostic?: Record<string, unknown> })?.stripeAuthDiagnostic
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'failed', String((error as { message?: string })?.message || 'credit_pack_failed'),
      rpcDiagnostic ? { credit_pack_grant_rpc: rpcDiagnostic } : stripeAuthDiagnostic ? { credit_pack_provider_auth: stripeAuthDiagnostic } : undefined)
    return json({ ok: false, error: 'Credit pack fulfillment failed' }, 500)
  }

  const activation = await extractActivation(event)
  const freeCancellationEvent = event.type === 'customer.subscription.deleted' || activation.cancelAtPeriodEnd
  if (!['Starter','Pro','Agency','Enterprise'].includes(activation.plan) && !freeCancellationEvent) {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'needs_review', 'unsupported_plan')
    return json({ ok: true, needsReview: true, reason: 'Unsupported or missing plan' }, 202)
  }
  if (activation.billingFrequency !== 'monthly' && activation.billingFrequency !== 'annual' && !freeCancellationEvent) {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'needs_review', 'unsupported_frequency')
    return json({ ok: true, needsReview: true, reason: 'Unsupported or missing billing frequency' }, 202)
  }

  const row =
    await getSnapshotByUserId(supabaseUrl, serviceKey, activation.dealBlastUserId) ||
    await getSnapshotByEmail(supabaseUrl, serviceKey, activation.email)

  if (!row?.user_id) {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'needs_review', 'workspace_not_matched')
    return json({ ok: true, needsReview: true, reason: 'No matching workspace snapshot' }, 202)
  }

  const saved = await saveBillingEvent(supabaseUrl, serviceKey, row, activation, event)
  if (!saved) {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'failed', 'billing_update_failed')
    return json({ ok: false, error: 'Billing update failed' }, 500)
  }

  const savedWorkspaceId = String(row?.snapshot?.state?.workspaceInstanceId || row?.snapshot?.state?.settings?.workspaceInstanceId || '').trim()
  try {
    await grantIncludedCredits(supabaseUrl, serviceKey, event, savedWorkspaceId, activation.plan, activation.periodStart, activation.periodEnd)
  } catch {
    await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'failed', 'included_credit_grant_failed')
    return json({ ok: false, error: 'Included credit grant failed' }, 500)
  }

  await finishStripeEvent(supabaseUrl, serviceKey, event.id, 'processed')

  return json({ ok: true, updated: true })
})
