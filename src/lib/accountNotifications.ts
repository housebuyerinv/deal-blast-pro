import { supabase } from './supabaseClient'

export type AccountCreatedNotificationInput = {
  userId?: string
  workspaceId?: string
  name?: string
  email: string
  company?: string
  plan?: string
  billingStatus?: string
  trialStatus?: string
  registrationSource?: string
  paymentConfirmed?: string
  emailVerified?: string
  createdAt?: string
}

export async function notifyAccountCreated(input: AccountCreatedNotificationInput) {
  if (!supabase) return { ok: false, skipped: true, reason: 'Supabase client missing' }

  const userId = input.userId || input.email
  const workspaceId = input.workspaceId || userId || 'default'

  const { data, error } = await supabase.functions.invoke('notify-submission', {
    body: {
      type: 'account',
      eventType: 'new_account_created',
      workspaceId,
      relatedRecordId: userId,
      idempotencyKey: `new_account_created:${userId}`,
      data: {
        ...input,
        userId,
        workspaceId,
        accountUrl: `${window.location.origin}/app/settings`,
        createdAt: input.createdAt || new Date().toISOString(),
      },
    },
  })

  if (error) throw error
  return data
}
