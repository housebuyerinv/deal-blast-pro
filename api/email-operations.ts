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
    const outboxRows: any[] = []
    const columns = 'id,workspace_id,event_type,recipient,provider,provider_message_id,status,attempt_count,last_error_category,created_at,sent_at,delivered_at'

    if (workspaceIds.length) {
      const { data, error } = await account.adminClient
        .from('email_outbox')
        .select(columns)
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      outboxRows.push(...(data || []))
    }

    // Legacy Preview tests may have a local workspace ID whose settings row was
    // never retained. Recover only messages addressed to this authenticated,
    // verified Owner Admin email; never broaden this to arbitrary recipients.
    const { data: ownerRecipientRows, error: ownerRecipientError } = await account.adminClient
      .from('email_outbox')
      .select(columns)
      .eq('recipient', account.email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(50)
    if (ownerRecipientError) throw ownerRecipientError
    outboxRows.push(...(ownerRecipientRows || []))

    // The currently deployed notification function predates the outbox worker
    // and durably recorded some accepted test sends in email_notification_logs.
    // Read those real rows and correlate their provider IDs to immutable webhook
    // events; do not manufacture a delivery state.
    const { data: legacyRows, error: legacyError } = await account.adminClient
      .from('email_notification_logs')
      .select('id,workspace_id,event_type,recipient,provider,provider_message_id,status,attempt_count,error_message,created_at,attempted_at,succeeded_at')
      .eq('recipient', account.email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(50)
    if (legacyError) throw legacyError
    outboxRows.push(...(legacyRows || []).map(row => ({
      id: row.id,
      workspace_id: row.workspace_id,
      event_type: row.event_type,
      recipient: row.recipient,
      provider: row.provider,
      provider_message_id: row.provider_message_id,
      status: row.status,
      attempt_count: row.attempt_count,
      last_error_category: row.error_message,
      created_at: row.created_at,
      sent_at: row.succeeded_at || row.attempted_at,
      delivered_at: null,
    })))

    const uniqueOutboxRows = outboxRows
      .filter((row, index, all) => all.findIndex(candidate => candidate.id === row.id) === index)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    const outboxIds = uniqueOutboxRows.map(row => row.id)
    const messageIds = uniqueOutboxRows.map(row => row.provider_message_id).filter(Boolean)
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
    return send(res, 200, { ok: true, operations: correlateEmailOperations(uniqueOutboxRows, uniqueEvents).slice(0, 8) })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), {
      ok: false,
      error: error?.message || 'Email operations are unavailable.',
      code: error?.code || 'email_operations_error',
    })
  }
}
