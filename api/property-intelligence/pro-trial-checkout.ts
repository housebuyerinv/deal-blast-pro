import { getAuthenticatedAccount } from '../_accountAuth.js'
import { handlePlatformAction } from '../../src/server/platformActions.js'
import { PRO_TRIAL_PROMOTION } from '../../src/lib/promotionConfig.js'

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

  const workspaceId = clean(account.workspace?.id || account.plan?.workspace_id)
  if (!workspaceId) return send(res, 409, { ok: false, error: 'Workspace unavailable.' })

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
