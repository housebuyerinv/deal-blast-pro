import { supabase } from './supabaseClient'
import { notifySubmission, type SubmissionNotificationResult } from './submissionNotifications'

export const CONTACT_SUBMISSIONS_TABLE = 'contact_submissions'
const CONTACT_STATUS_KEY = 'dealblastpro:last-contact-submission-status'

export type ContactSubmissionPayload = {
  fullName: string
  email: string
  phone?: string
  company: string
  role: string
  interestType: string
  message: string
  submittedAt: string
  sourcePage: 'Contact'
  userAgent?: string
  currentUrl?: string
  accountEmail?: string
  planStatus?: string
  status: 'New'
  ownerUserEmail: string
}

export type ContactSubmissionStatus = {
  checkedAt: string
  saveStatus: 'Saved' | 'Needs Review' | 'Failed'
  emailStatus: 'Sent' | 'Needs Review' | 'Failed'
  detail: string
}

const OWNER_EMAIL = 'housebuyerinv@gmail.com'

function recordContactStatus(status: ContactSubmissionStatus) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CONTACT_STATUS_KEY, JSON.stringify(status))
    window.dispatchEvent(new CustomEvent('dealblastpro:contact-submission-status', { detail: status }))
  } catch {}
}

export function getLastContactSubmissionStatus(): ContactSubmissionStatus | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(CONTACT_STATUS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function saveContactSubmission(payload: ContactSubmissionPayload) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const baseRow = {
    created_at: payload.submittedAt,
    full_name: payload.fullName,
    email: payload.email,
    company: payload.company,
    role: payload.role,
    interest_type: payload.interestType,
    message: payload.message,
    source_page: payload.sourcePage,
    status: payload.status,
    email_notification_status: 'pending',
    owner_user_email: payload.ownerUserEmail || OWNER_EMAIL,
  }

  const rowWithSafeMetadata = {
    ...baseRow,
    user_agent: payload.userAgent || '',
    current_url: payload.currentUrl || '',
  }

  const result = await supabase
    .from(CONTACT_SUBMISSIONS_TABLE)
    .insert(rowWithSafeMetadata)

  if (!result.error) return { id: undefined }

  const schemaError = String(result.error.message || '').toLowerCase()
  if (!schemaError.includes('user_agent') && !schemaError.includes('current_url') && !schemaError.includes('column')) {
    throw result.error
  }

  const fallback = await supabase
    .from(CONTACT_SUBMISSIONS_TABLE)
    .insert(baseRow)

  if (fallback.error) throw fallback.error
  return { id: undefined }
}

export async function updateContactEmailStatus(id: string | undefined, status: string) {
  if (!id || !supabase) return
  try {
    await supabase
      .from(CONTACT_SUBMISSIONS_TABLE)
      .update({ email_notification_status: status })
      .eq('id', id)
  } catch {}
}

export async function submitContactMessage(payload: ContactSubmissionPayload): Promise<{
  saved: boolean
  notified: boolean
  saveError?: any
  notification?: SubmissionNotificationResult
}> {
  let savedId: string | undefined
  let saveError: any = null
  let notification: SubmissionNotificationResult | undefined

  try {
    const saved = await saveContactSubmission(payload)
    savedId = saved?.id
  } catch (error) {
    saveError = error
    console.warn('[Deal Blast Pro] Contact submission save failed:', error)
  }

  try {
    notification = await notifySubmission('contact', payload, {
      eventType: 'contact',
      workspaceId: 'default',
      relatedRecordId: savedId,
    })
  } catch (error) {
    notification = { ok: false, error, warning: 'Email Notifications Needs Review' }
  }

  const saved = !saveError
  const notified = Boolean(notification?.ok && !notification?.data?.emailResult?.skipped && notification?.data?.emailResult?.ok !== false)
  const emailStatus = notified ? 'sent' : 'needs_review'

  await updateContactEmailStatus(savedId, emailStatus)

  recordContactStatus({
    checkedAt: new Date().toISOString(),
    saveStatus: saved ? 'Saved' : saveError ? 'Failed' : 'Needs Review',
    emailStatus: notified ? 'Sent' : notification?.ok ? 'Needs Review' : 'Failed',
    detail: saved
      ? notified
        ? 'Latest contact submission saved and notification requested.'
        : 'Latest contact submission saved; email notification needs review.'
      : 'Latest contact submission could not be saved. Public fallback should direct the user to email support.',
  })

  return { saved, notified, saveError, notification }
}
