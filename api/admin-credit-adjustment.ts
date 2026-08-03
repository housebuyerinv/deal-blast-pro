import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const account = await getAuthenticatedAccount(req)
    if (!account.isOwnerAdmin) return res.status(403).json({ ok: false, error: 'Owner Admin access is required.' })
    const workspaceId = cleanString(req.body?.workspaceId)
    const amount = Number(req.body?.amount)
    const reason = cleanString(req.body?.reason)
    const correctionId = cleanString(req.body?.correctionId)
    if (!workspaceId || !Number.isInteger(amount) || amount === 0 || !reason || !correctionId) {
      return res.status(400).json({ ok: false, error: 'Workspace, non-zero whole-credit amount, reason, and correction ID are required.' })
    }
    if (amount < 0) {
      const { data, error } = await account.adminClient.rpc('adjust_property_intelligence_purchased_credits', {
        p_workspace_id: workspaceId, p_requested_debit: Math.abs(amount), p_entry_type: 'admin_correction',
        p_idempotency_key: `admin:credit:${correctionId}`, p_reason: reason, p_stripe_event_id: null, p_created_by_user_id: account.user.id,
      })
      if (error) throw error
      return res.status(200).json({ ok: true, result: data })
    }
    const { data, error } = await account.adminClient.from('property_intelligence_credit_ledger').insert({
      workspace_id: workspaceId, entry_type: 'admin_correction', credit_bucket: 'purchased', amount,
      idempotency_key: `admin:credit:${correctionId}`, audit_reason: reason, created_by_user_id: account.user.id,
    }).select('id').single()
    if (error?.code === '23505') return res.status(200).json({ ok: true, duplicate: true })
    if (error) throw error
    return res.status(201).json({ ok: true, ledgerEntryId: data.id })
  } catch (error: any) {
    return res.status(Number(error?.status || 500)).json({ ok: false, error: error?.status ? error.message : 'Credit adjustment failed.' })
  }
}
