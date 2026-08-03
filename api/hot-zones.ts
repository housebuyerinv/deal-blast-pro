import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'
import { aggregateHotZones } from './_hotZones.js'

const WINDOWS: Record<string, number> = { weekly: 7, monthly: 30, yearly: 365 }

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const account = await getAuthenticatedAccount(req)
    const workspaceId = cleanString(account.workspace?.id || account.plan?.workspace_id)
    if (!workspaceId) return res.status(409).json({ ok: false, error: 'Workspace unavailable.' })
    const period = WINDOWS[cleanString(req.query?.period)] ? cleanString(req.query.period) : 'monthly'
    const scope = cleanString(req.query?.scope) === 'shared' ? 'shared' : 'workspace'
    const since = new Date(Date.now() - WINDOWS[period] * 86400000).toISOString()
    let query = account.adminClient.from('verified_closings').select('workspace_id,city,state,postal_code,closed_at')
      .eq('outcome', 'closed').eq('is_demo', false).eq('is_sample', false).eq('is_duplicate', false).gte('closed_at', since)
    if (scope === 'workspace') query = query.eq('workspace_id', workspaceId)
    const { data, error } = await query
    if (error) throw error
    const workspaceMinimum = Math.max(1, Number(process.env.HOT_ZONES_WORKSPACE_MIN_CLOSINGS) || 3)
    const sharedMinimum = Math.max(1, Number(process.env.HOT_ZONES_SHARED_MIN_CLOSINGS) || 5)
    const sharedWorkspaces = Math.max(2, Number(process.env.HOT_ZONES_SHARED_MIN_WORKSPACES) || 3)
    const totalVerifiedClosings = (data || []).length
    const zones = aggregateHotZones(data || [], scope, { workspaceMinimum, sharedMinimum, sharedWorkspaceMinimum: sharedWorkspaces })
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json({ ok: true, scope, period, totalVerifiedClosings, zones,
      minimumRequired: scope === 'workspace' ? workspaceMinimum : sharedMinimum,
      message: !zones.length ? 'Hot Zones become more useful as verified closing records accumulate.' : '' })
  } catch (error: any) {
    return res.status(Number(error?.status || 500)).json({ ok: false, error: error?.status ? error.message : 'Hot Zones are temporarily unavailable.' })
  }
}
