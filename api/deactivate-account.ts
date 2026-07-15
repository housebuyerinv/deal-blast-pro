import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    if (cleanString(body.confirmation) !== 'DELETE MY ACCOUNT') {
      return send(res, 400, {
        ok: false,
        error: 'Type DELETE MY ACCOUNT to deactivate this account.',
        code: 'confirmation_required',
      })
    }

    const account = await getAuthenticatedAccount(req)
    if (account.deactivated) {
      return send(res, 200, {
        ok: true,
        accountStatus: 'Deactivated',
        alreadyDeactivated: true,
      })
    }

    const now = new Date().toISOString()
    const reason = cleanString(body.reason || 'User requested account deactivation')
    const workspaceId = account.workspace?.id || account.plan?.workspace_id || null

    const { error: profileError } = await account.adminClient
      .from('account_profiles')
      .update({
        account_status: 'Deactivated',
        deactivated_at: now,
        deactivation_reason: reason,
      })
      .eq('user_id', account.user.id)
    if (profileError) throw profileError

    if (workspaceId) {
      const { error: workspaceError } = await account.adminClient
        .from('workspaces')
        .update({
          account_status: 'Deactivated',
          deactivated_at: now,
          deactivation_reason: reason,
        })
        .eq('id', workspaceId)
        .eq('owner_user_id', account.user.id)
      if (workspaceError) throw workspaceError

      const { error: planError } = await account.adminClient
        .from('workspace_plan_assignments')
        .update({
          access_status: 'Deactivated',
          access_deactivated_at: now,
        })
        .eq('workspace_id', workspaceId)
        .eq('user_id', account.user.id)
      if (planError) throw planError
    }

    await account.adminClient
      .from('account_deactivation_audit')
      .insert({
        user_id: account.user.id,
        workspace_id: workspaceId,
        email: account.email,
        requested_by: account.email,
        action: 'account_deactivated',
        reason,
        diagnostics: {
          userAgent: cleanString(req.headers?.['user-agent']).slice(0, 240),
          source: 'settings_danger_zone',
        },
      })

    return send(res, 200, {
      ok: true,
      accountStatus: 'Deactivated',
      deactivatedAt: now,
      workspaceId,
    })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Account deactivation failed.',
      code: error?.code || 'account_deactivation_error',
    })
  }
}
