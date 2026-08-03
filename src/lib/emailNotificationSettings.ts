import { supabase } from './supabaseClient'

export const DEFAULT_NOTIFICATION_RECIPIENT = 'housebuyerinv@gmail.com'

export type EmailNotificationSettings = {
  id?: string
  workspace_id: string
  user_id?: string
  enabled: boolean
  recipients: string[]
  notify_new_account: boolean
  notify_new_deal: boolean
  notify_new_buyer: boolean
  notify_buyer_verification: boolean
  notify_missing_docs: boolean
  notify_buyer_match: boolean
  notify_offer_received: boolean
  notify_offer_response_needed: boolean
  notify_inventory_conversion: boolean
  notify_deal_status_change: boolean
  notify_closing_followup: boolean
  billing_transactional_required: boolean
  renewal_reminders: boolean
  annual_renewal_reminders: boolean
  payment_receipts: boolean
  invoice_notifications: boolean
  card_expiration_reminders: boolean
  billing_summary: boolean
  updated_by_user_id?: string | null
  last_test_status?: string | null
  last_test_at?: string | null
  last_test_error?: string | null
}

export type EmailNotificationLog = {
  id: string
  event_type: string
  recipient: string
  provider: string
  provider_message_id?: string | null
  status: string
  attempt_count: number
  error_message?: string | null
  created_at: string
  attempted_at?: string | null
  succeeded_at?: string | null
  failed_at?: string | null
}

export const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: EmailNotificationSettings = {
  workspace_id: 'default',
  enabled: true,
  recipients: [DEFAULT_NOTIFICATION_RECIPIENT],
  notify_new_account: true,
  notify_new_deal: true,
  notify_new_buyer: true,
  notify_buyer_verification: true,
  notify_missing_docs: true,
  notify_buyer_match: true,
  notify_offer_received: true,
  notify_offer_response_needed: true,
  notify_inventory_conversion: true,
  notify_deal_status_change: true,
  notify_closing_followup: true,
  billing_transactional_required: true,
  renewal_reminders: true,
  annual_renewal_reminders: true,
  payment_receipts: true,
  invoice_notifications: true,
  card_expiration_reminders: true,
  billing_summary: false,
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseNotificationRecipients(input: string | string[]) {
  const values = Array.isArray(input) ? input : String(input || '').split(',')
  const normalized = values
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

export function validateNotificationRecipients(input: string | string[]) {
  const recipients = parseNotificationRecipients(input)
  const invalid = recipients.filter(email => !EMAIL_PATTERN.test(email))

  if (!recipients.length) return { ok: false, recipients, error: 'Add at least one notification recipient.' }
  if (invalid.length) return { ok: false, recipients, error: `Invalid email: ${invalid[0]}` }

  return { ok: true, recipients, error: '' }
}

async function getCurrentUserId() {
  if (!supabase) return ''
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || ''
}

export async function loadEmailNotificationSettings(workspaceId = 'default') {
  if (!supabase) throw new Error('Supabase is not configured.')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Sign in before editing email notifications.')

  const { data, error } = await supabase
    .from('email_notification_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  return {
    ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
    workspace_id: workspaceId,
    user_id: userId,
    ...(data || {}),
    recipients: Array.isArray(data?.recipients) && data.recipients.length ? data.recipients : [DEFAULT_NOTIFICATION_RECIPIENT],
  } as EmailNotificationSettings
}

export async function saveEmailNotificationSettings(settings: EmailNotificationSettings) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Sign in before saving email notifications.')

  const checked = validateNotificationRecipients(settings.recipients)
  if (!checked.ok) throw new Error(checked.error)

  const row = {
    ...settings,
    user_id: userId,
    updated_by_user_id: userId,
    billing_transactional_required: true,
    recipients: checked.recipients,
  }

  const { data, error } = await supabase
    .from('email_notification_settings')
    .upsert(row, { onConflict: 'workspace_id,user_id' })
    .select('*')
    .single()

  if (error) throw error
  return data as EmailNotificationSettings
}

export async function sendEmailNotificationTest(settings: EmailNotificationSettings) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const checked = validateNotificationRecipients(settings.recipients)
  if (!checked.ok) throw new Error(checked.error)

  const { data, error } = await supabase.functions.invoke('notify-submission', {
    body: {
      type: 'test',
      eventType: 'test_email',
      workspaceId: settings.workspace_id || 'default',
      recipients: checked.recipients,
      data: {
        requestedAt: new Date().toISOString(),
      },
    },
  })

  if (error) throw error
  if (data?.ok === false) throw new Error(data?.error || data?.emailResult?.body || 'Test email was not accepted by the provider.')

  return data
}

export async function loadEmailNotificationLogs(workspaceId = 'default') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('email_outbox')
    .select('id,event_type,recipient,provider,provider_message_id,status,attempt_count,last_error_category,created_at,sent_at,delivered_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) throw error
  return (data || []).map((row: any) => ({ ...row, error_message: row.last_error_category,
    attempted_at: row.created_at, succeeded_at: row.delivered_at || row.sent_at, failed_at: row.status === 'failed' ? row.created_at : null })) as EmailNotificationLog[]
}
