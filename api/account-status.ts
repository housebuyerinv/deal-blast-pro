import { getAuthenticatedAccount } from './_accountAuth.js'

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const account = await getAuthenticatedAccount(req)
    return send(res, account.deactivated ? 403 : 200, {
      ok: !account.deactivated,
      accountStatus: account.accountStatus,
      deactivated: account.deactivated,
      workspaceId: account.workspace?.id || null,
      isOwnerAdmin: account.isOwnerAdmin,
      planName: account.planName,
      billingStatus: account.billingStatus,
      paymentStatus: account.plan?.payment_status || null,
      stripeSubscriptionStatus: account.plan?.subscription_status || null,
      currentPeriodEnd: account.plan?.current_period_end || null,
      cancelAtPeriodEnd: Boolean(account.plan?.cancel_at_period_end),
      outstandingBalance: account.plan?.outstanding_balance || 0,
      latestInvoiceStatus: account.plan?.latest_invoice_status || null,
      currentPlan: account.plan?.current_plan || account.planName,
      effectiveAccessPlan: account.plan?.effective_access_plan || account.planName,
      trialStartedAt: account.plan?.trial_started_at || null,
      trialEndsAt: account.plan?.trial_ends_at || null,
      includedPropertyIntelligenceCredits: Number(account.plan?.property_intelligence_included_credits || 0),
      paidPropertyIntelligenceEntitlement:
        String(account.billingStatus || '').toLowerCase() === 'paid active' &&
        String(account.plan?.payment_status || '').toLowerCase() === 'paid' &&
        String(account.plan?.subscription_status || '').toLowerCase() === 'active',
      scheduledPlan: account.plan?.scheduled_plan || null,
      scheduledPlanChangeAt: account.plan?.scheduled_plan_change_at || null,
      billingInterval: account.plan?.billing_interval || null,
      stripePriceId: account.plan?.stripe_price_id || null,
      role: account.profile?.role || 'Admin',
      profile: account.profile ? {
        email: account.profile.email || account.email,
        fullName: account.profile.full_name || '',
        displayName: account.profile.display_name || '',
        businessName: account.profile.business_name || account.profile.company || '',
      } : null,
      workspace: account.workspace ? {
        id: account.workspace.id,
        name: account.workspace.name || '',
      } : null,
    })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Account status check failed.',
      code: error?.code || 'account_status_error',
    })
  }
}
