import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function isSafeReturnOrigin(origin: string) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) return false
    return (
      url.hostname === 'deal-blast-pro.vercel.app' ||
      url.hostname.endsWith('.vercel.app') ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    )
  } catch {
    return false
  }
}

function getReturnOrigin(req: any) {
  const configured = cleanString(process.env.DEALBLAST_APP_URL || process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL)
  if (isSafeReturnOrigin(configured)) return configured.replace(/\/+$/, '')

  const origin = cleanString(req.headers?.origin || req.headers?.Origin)
  if (isSafeReturnOrigin(origin)) return origin.replace(/\/+$/, '')

  return 'https://deal-blast-pro.vercel.app'
}

async function createStripePortalSession(customerId: string, returnUrl: string) {
  const stripeSecretKey = cleanString(process.env.STRIPE_SECRET_KEY)
  if (!stripeSecretKey) {
    throw Object.assign(new Error('Stripe portal is not configured.'), {
      status: 500,
      code: 'stripe_not_configured',
    })
  }

  const params = new URLSearchParams()
  params.set('customer', customerId)
  params.set('return_url', returnUrl)

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.url) {
    const message = cleanString(payload?.error?.message) || 'Stripe portal session could not be created.'
    throw Object.assign(new Error(message), {
      status: response.status || 502,
      code: payload?.error?.code || 'stripe_portal_error',
    })
  }

  return payload.url as string
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const account = await getAuthenticatedAccount(req)
    const workspaceId = cleanString(account.workspace?.id || account.plan?.workspace_id)
    const userId = cleanString(account.user?.id)

    if (!workspaceId || !userId) {
      return send(res, 409, {
        ok: false,
        code: 'workspace_not_found',
        error: 'Workspace billing record could not be resolved.',
      })
    }

    const { data: plan, error: planError } = await account.adminClient
      .from('workspace_plan_assignments')
      .select('workspace_id,user_id,plan_name,billing_status,payment_status,stripe_customer_id,stripe_subscription_id,latest_invoice_hosted_url,latest_invoice_status')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (planError) {
      throw Object.assign(new Error(planError.message || 'Billing lookup failed.'), {
        status: 500,
        code: 'billing_lookup_failed',
      })
    }

    const customerId = cleanString(plan?.stripe_customer_id)
    if (!customerId) {
      return send(res, 409, {
        ok: false,
        code: 'stripe_customer_missing',
        error: 'No Stripe customer is connected to this workspace yet.',
      })
    }

    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const mode = cleanString(body.mode).toLowerCase()
    if (mode === 'invoice') {
      const invoiceUrl = cleanString(plan?.latest_invoice_hosted_url)
      if (invoiceUrl) {
        return send(res, 200, { ok: true, url: invoiceUrl, mode: 'invoice' })
      }
    }

    const returnUrl = `${getReturnOrigin(req)}/app/settings`
    const url = await createStripePortalSession(customerId, returnUrl)
    return send(res, 200, { ok: true, url, mode: 'portal' })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Stripe portal session failed.',
      code: error?.code || 'stripe_portal_session_error',
    })
  }
}
