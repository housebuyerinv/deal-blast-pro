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
      planName: account.planName,
      billingStatus: account.billingStatus,
      role: account.profile?.role || 'Admin',
    })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Account status check failed.',
      code: error?.code || 'account_status_error',
    })
  }
}
