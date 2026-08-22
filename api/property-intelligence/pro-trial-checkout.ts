import { getAuthenticatedAccount } from '../_accountAuth.js'
import { handlePlatformAction } from '../../src/server/platformActions.js'
import { PRO_TRIAL_PROMOTION } from '../../src/lib/promotionConfig.js'
import { canCreateProTrialCheckout } from '../../src/server/proTrialCheckoutAuthorization.js'

const clean = (value: any) => String(value || '').trim()

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  let account: Awaited<ReturnType<typeof getAuthenticatedAccount>>
  try {
    account = await getAuthenticatedAccount(req)
  } catch (error: any) {
    return send(res, Number(error?.status || 401), {
      ok: false,
      error: error?.message || 'Sign in is required.',
      code: error?.code || 'auth_required',
    })
  }

  if (account.deactivated) {
    return send(res, 403, {
      ok: false,
      error: 'This account has been deactivated.',
      code: 'account_deactivated',
    })
  }
  if (account.isOwnerAdmin) {
    return send(res, 403, {
      ok: false,
      code: 'owner_admin_ineligible',
      error: 'Owner Admin accounts do not use customer trials.',
    })
  }

  const workspaceId = clean(account.workspace?.id || account.plan?.workspace_id)
  if (!workspaceId) return send(res, 409, { ok: false, error: 'Workspace unavailable.' })

  const trialFlowVerified = PRO_TRIAL_PROMOTION.enabled && clean(process.env.PRO_TRIAL_LAUNCH20_VERIFIED).toLowerCase() === 'true'
  const trialCheckoutAuthorized = PRO_TRIAL_PROMOTION.enabled && canCreateProTrialCheckout({
    publicGateEnabled: trialFlowVerified,
    qaBypassEnabled: clean(process.env.PRO_TRIAL_QA_CHECKOUT_ENABLED).toLowerCase() === 'true',
    vercelEnvironment: clean(process.env.VERCEL_ENV),
    authenticatedEmail: clean(account.user.email),
    authenticatedWorkspaceId: workspaceId,
  })
  if (!trialCheckoutAuthorized) {
    return send(res, 409, {
      ok: false,
      code: 'promotion_unverified',
      error: 'The Pro trial is awaiting final Stripe lifecycle verification.',
    })
  }

  const assignment = account.plan || {}
  const billingStatus = clean(assignment.billing_status).toLowerCase()
  const subscriptionStatus = clean(assignment.subscription_status).toLowerCase()
  const currentPlan = clean(assignment.current_plan || assignment.plan_name).toLowerCase()
  if (assignment.trial_consumed_at) {
    return send(res, 409, {
      ok: false,
      code: 'trial_already_consumed',
      error: 'This workspace has already used its Pro trial.',
    })
  }
  if (billingStatus === 'trial active' || subscriptionStatus === 'trialing') {
    return send(res, 409, {
      ok: false,
      code: 'trial_already_active',
      error: 'A Pro trial is already active for this workspace.',
    })
  }
  if (billingStatus === 'paid active' || ['active','past_due','unpaid','incomplete'].includes(subscriptionStatus) || ['pro','agency','enterprise'].includes(currentPlan)) {
    return send(res, 409, {
      ok: false,
      code: 'subscription_exists',
      error: 'This workspace already has a paid or pending subscription.',
    })
  }

  const secret = clean(process.env.STRIPE_SECRET_KEY)
  if (secret) {
    const stripe = async (path: string) => {
      const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw Object.assign(new Error(payload?.error?.message || 'Stripe request failed.'), {
          status: 502,
          code: 'stripe_request_failed',
        })
      }
      return payload
    }

    try {
      const email = clean(account.user.email).toLowerCase()
      if (email) {
        const customers = await stripe(`customers?email=${encodeURIComponent(email)}&limit=100`)
        const matchingCustomers = (customers?.data || []).filter((customer: any) =>
          clean(customer?.metadata?.workspaceId) === workspaceId &&
          clean(customer?.metadata?.userId) === clean(account.user.id)
        )

        for (const customer of matchingCustomers) {
          const customerId = clean(customer?.id)
          if (!customerId) continue
          const sessions = await stripe(`checkout/sessions?customer=${encodeURIComponent(customerId)}&limit=100`)
          const existing = (sessions?.data || []).find((session: any) =>
            session?.status === 'open' &&
            Boolean(session?.url) &&
            session?.mode === 'subscription' &&
            clean(session?.metadata?.purchaseKind) === 'pro_trial' &&
            clean(session?.metadata?.workspaceId) === workspaceId &&
            clean(session?.metadata?.userId) === clean(account.user.id) &&
            clean(session?.metadata?.promotionKey) === PRO_TRIAL_PROMOTION.key &&
            clean(session?.metadata?.promotionCode) === PRO_TRIAL_PROMOTION.code
          )

          if (!existing) continue

          const promotionCodeId = clean(
            (existing?.discounts || []).find((discount: any) => clean(discount?.promotion_code))?.promotion_code
          ) || null
          const createdAt = Number(existing?.created)
            ? new Date(Number(existing.created) * 1000).toISOString()
            : new Date().toISOString()
          const now = new Date().toISOString()

          const { error: updateError } = await account.adminClient
            .from('workspace_plan_assignments')
            .update({
              stripe_customer_id: customerId,
              trial_checkout_session_id: clean(existing.id),
              trial_checkout_created_at: createdAt,
              promotion_code: PRO_TRIAL_PROMOTION.code,
              stripe_promotion_code_id: promotionCodeId,
              updated_at: now,
            })
            .eq('workspace_id', workspaceId)
            .is('trial_consumed_at', null)

          if (updateError) throw updateError

          return send(res, 200, {
            ok: true,
            url: existing.url,
            reused: true,
            promotion: {
              key: PRO_TRIAL_PROMOTION.key,
              code: PRO_TRIAL_PROMOTION.code,
              trialDays: PRO_TRIAL_PROMOTION.trialDays,
            },
          })
        }
      }
    } catch (error: any) {
      return send(res, Number(error?.status || 500), {
        ok: false,
        code: error?.code || 'trial_checkout_recovery_failed',
        error: error?.status ? error.message : 'Existing trial checkout could not be recovered safely.',
      })
    }
  }

  try {
    if (await handlePlatformAction('pro-trial-checkout', req, res, account)) return
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.status ? error.message : 'Platform operation failed.',
    })
  }

  return send(res, 500, { ok: false, error: 'Trial checkout handler unavailable.' })
}
