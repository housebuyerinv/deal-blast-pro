export type EmailOutboxRow = {
  id: string
  workspace_id: string
  event_type: string
  recipient: string
  provider: string
  provider_message_id?: string | null
  status: string
  attempt_count: number
  last_error_category?: string | null
  created_at: string
  sent_at?: string | null
  delivered_at?: string | null
}

export type EmailDeliveryEventRow = {
  id?: string
  outbox_id?: string | null
  provider_event_id: string
  provider_message_id?: string | null
  event_type: string
  status: string
  occurred_at: string
}

const DELIVERY_RANK: Record<string, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  provider_accepted: 2,
  retry_scheduled: 3,
  retrying: 3,
  delivered: 4,
  bounced: 5,
  complained: 5,
  suppressed: 5,
  failed: 5,
  failed_permanently: 5,
  permanent_failure: 5,
}

export function correlateEmailOperations(outboxRows: EmailOutboxRow[], eventRows: EmailDeliveryEventRow[]) {
  const eventsByOutbox = new Map<string, EmailDeliveryEventRow[]>()
  const eventsByMessage = new Map<string, EmailDeliveryEventRow[]>()

  for (const event of eventRows) {
    if (event.outbox_id) eventsByOutbox.set(event.outbox_id, [...(eventsByOutbox.get(event.outbox_id) || []), event])
    if (event.provider_message_id) eventsByMessage.set(event.provider_message_id, [...(eventsByMessage.get(event.provider_message_id) || []), event])
  }

  return outboxRows.map(row => {
    const correlated = [
      ...(eventsByOutbox.get(row.id) || []),
      ...(row.provider_message_id ? eventsByMessage.get(row.provider_message_id) || [] : []),
    ].filter((event, index, all) => all.findIndex(candidate => candidate.provider_event_id === event.provider_event_id) === index)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

    const lifecycle = correlated.reduce<EmailDeliveryEventRow | undefined>((current, event) => {
      if (!current) return event
      const eventRank = DELIVERY_RANK[event.status] ?? 0
      const currentRank = DELIVERY_RANK[current.status] ?? 0
      return eventRank > currentRank || (eventRank === currentRank && event.occurred_at > current.occurred_at) ? event : current
    }, undefined)

    const status = lifecycle?.status || row.status
    return {
      id: row.id,
      event_type: row.event_type,
      recipient: row.recipient,
      provider: row.provider,
      provider_message_id: row.provider_message_id || lifecycle?.provider_message_id || null,
      status,
      attempt_count: row.attempt_count,
      error_message: row.last_error_category || null,
      created_at: row.created_at,
      attempted_at: row.created_at,
      succeeded_at: status === 'delivered' ? lifecycle?.occurred_at || row.delivered_at : row.sent_at,
      failed_at: ['bounced', 'complained', 'suppressed', 'failed', 'failed_permanently', 'permanent_failure'].includes(status)
        ? lifecycle?.occurred_at || row.created_at
        : null,
      delivery_events: correlated.map(event => ({
        provider_event_id: event.provider_event_id,
        event_type: event.event_type,
        status: event.status,
        occurred_at: event.occurred_at,
      })),
    }
  })
}
