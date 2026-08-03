import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const account = await getAuthenticatedAccount(req)
    const workspaceId = cleanString(account.workspace?.id || account.plan?.workspace_id)
    const body = req.body || {}
    if (body.confirmVerified !== true) return res.status(400).json({ ok: false, code: 'explicit_confirmation_required', error: 'Explicit closing verification is required.' })
    const dealId = cleanString(body.inventoryDealId)
    const closedAt = cleanString(body.closedAt)
    const postalCode = cleanString(body.postalCode)
    const city = cleanString(body.city)
    const state = cleanString(body.state).toUpperCase()
    if (!workspaceId || !dealId || !closedAt || !postalCode || !city || !/^[A-Z]{2}$/.test(state) || Number.isNaN(Date.parse(closedAt))) {
      return res.status(400).json({ ok: false, code: 'closing_fields_required', error: 'Closing date and complete market fields are required.' })
    }
    if (body.isDemo || body.isSample || body.isDuplicate || ['canceled','failed'].includes(cleanString(body.outcome).toLowerCase())) {
      return res.status(400).json({ ok: false, code: 'ineligible_closing', error: 'Demo, sample, duplicate, canceled, and failed records cannot be verified.' })
    }
    const { data: deal } = await account.adminClient.from('inventory_deals').select('id,workspace_id').eq('id', dealId).eq('workspace_id', workspaceId).maybeSingle()
    if (!deal) return res.status(404).json({ ok: false, error: 'Inventory deal was not found in this workspace.' })
    const { data, error } = await account.adminClient.from('verified_closings').insert({ workspace_id: workspaceId,
      inventory_deal_id: dealId, closed_at: new Date(closedAt).toISOString(), verified_by_user_id: account.user.id,
      verification_method: cleanString(body.verificationMethod) || 'owner_confirmation', city, state, postal_code: postalCode,
      county: cleanString(body.county) || null, outcome: 'closed', evidence_metadata: { source: 'mark_as_closed_workflow' } }).select('id,closed_at').single()
    if (error?.code === '23505') return res.status(200).json({ ok: true, duplicate: true, message: 'This deal already has a verified closing.' })
    if (error) throw error
    return res.status(201).json({ ok: true, closing: data })
  } catch (error: any) {
    return res.status(Number(error?.status || 500)).json({ ok: false, error: error?.status ? error.message : 'Closing verification failed.' })
  }
}
