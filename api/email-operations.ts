import { getAuthenticatedAccount } from './_accountAuth.js'
import { correlateEmailOperations } from './_emailOperations.js'

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return send(res, 405, { ok: false, error: 'Method not allowed.' })
    }

    const account = await getAuthenticatedAccount(req)
    if (!account.isOwnerAdmin) return send(res, 403, { ok: false, error: 'Owner admin access is required.' })

    // Preview deployments have separate browser storage origins, so their local
    // workspace instance IDs can differ. Scope durable operations through every
    // notification-settings workspace owned by this authenticated user instead
    // of trusting a browser-supplied workspace ID.
    const { data: settings, error: settingsError } = await account.adminClient
      .from('email_notification_settings')
      .select('workspace_id')
      .eq('user_id', account.user.id)
    if (settingsError) throw settingsError

    const workspaceIds = Array.from(new Set((settings || []).map(row => String(row.workspace_id || '')).filter(Boolean)))
    if (!workspaceIds.length) return send(res, 200, { ok: true, operations: [] })

    const { data: outboxRows, error: outboxError } = await account.adminClient
      .from('email_outbox')
      .select('id,workspace_id,event_type,recipient,provider,provider_message_id,status,attempt_count,last_error_category,created_at,sent_at,delivered_at')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: false })
      .limit(50)
    if (outboxError) throw outboxError

    const outboxIds = (outboxRows || []).map(row => row.id)
    const messageIds = (outboxRows || []).map(row => row.provider_message_id).filter(Boolean)
    const events: any[] = []

    if (outboxIds.length) {
      const { data, error } = await account.adminClient
        .from('email_delivery_events')
        .select('id,outbox_id,provider_event_id,provider_message_id,event_type,status,occurred_at')
        .in('outbox_id', outboxIds)
      if (error) throw error
      events.push(...(data || []))
    }

    if (messageIds.length) {
      const { data, error } = await account.adminClient
        .from('email_delivery_events')
        .select('id,outbox_id,provider_event_id,provider_message_id,event_type,status,occurred_at')
        .in('provider_message_id', messageIds)
      if (error) throw error
      events.push(...(data || []))
    }

    const uniqueEvents = events.filter((event, index, all) => all.findIndex(candidate => candidate.provider_event_id === event.provider_event_id) === index)
    return send(res, 200, { ok: true, operations: correlateEmailOperations(outboxRows || [], uniqueEvents).slice(0, 8) })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Email operations are unavailable.',
      code: error?.code || 'email_operations_error',
    })
  }
}
