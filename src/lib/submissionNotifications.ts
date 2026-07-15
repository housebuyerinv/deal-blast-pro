import { supabase } from './supabaseClient'

export type SubmissionNotificationType = 'buyer' | 'deal' | 'contact'
export type SubmissionNotificationOptions = {
  eventType?: string
  workspaceId?: string
  relatedRecordId?: string
}
export type SubmissionNotificationResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  warning?: string
  data?: any
  error?: any
}

const WARNING_KEY = 'dealblastpro:last-submission-notification-warning'

function recordNotificationWarning(type: SubmissionNotificationType, reason: string) {
  try {
    const payload = {
      type,
      label: 'Needs Review',
      reason,
      checkedAt: new Date().toISOString(),
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WARNING_KEY, JSON.stringify(payload))
      window.dispatchEvent(new CustomEvent('dealblastpro:submission-notification-warning', { detail: payload }))
    }
  } catch {}
}

export function getLastSubmissionNotificationWarning() {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(WARNING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const notifySubmission = async (type: SubmissionNotificationType, data: any, options: SubmissionNotificationOptions = {}): Promise<SubmissionNotificationResult> => {
  try {
    if (!supabase) {
      recordNotificationWarning(type, 'Email notification provider is not configured.')
      return { ok: false, skipped: true, reason: 'Supabase client missing', warning: 'Email Notifications Needs Review' }
    }

    const { data: response, error } = await supabase.functions.invoke('notify-submission', {
      body: {
        type,
        data,
        eventType: options.eventType,
        workspaceId: options.workspaceId || 'default',
        relatedRecordId: options.relatedRecordId || data?.id || data?.submissionId,
      },
    })

    if (error) {
      console.warn('[Deal Blast Pro] Submission notification failed:', error)
      recordNotificationWarning(type, 'Email notification provider could not send.')
      return { ok: false, error, warning: 'Email Notifications Needs Review' }
    }

    return { ok: true, data: response }
  } catch (error) {
    console.warn('[Deal Blast Pro] Submission notification crashed:', error)
    recordNotificationWarning(type, 'Email notification provider could not be verified.')
    return { ok: false, error, warning: 'Email Notifications Needs Review' }
  }
}
