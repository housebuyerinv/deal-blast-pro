import { notifySubmission } from './submissionNotifications'

function notifyBuyerPortalQueueChanged() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dealblastpro:buyer-portal-queue-changed'))
      window.dispatchEvent(new CustomEvent('dealblastpro:storage-sync'))
    }
  } catch {}
}

import { supabase } from './supabaseClient'

export const BUYER_PORTAL_SUBMISSIONS_TABLE = 'buyer_portal_submissions'

const REVIEWABLE_BUYER_PORTAL_STATUSES = new Set([
  'pending_review',
  'pending review',
  'submitted / pending review',
  'submitted pending review',
  'submitted',
  'pending',
  'new',
  'needs_recheck',
  'needs recheck',
  'pending_verification',
  'pending verification',
])

const RESOLVED_BUYER_PORTAL_STATUSES = new Set([
  'approved',
  'imported',
  'dismissed',
  'removed',
  'rejected',
  'archived',
  'duplicate_resolved',
  'duplicate resolved',
  'resolved',
])

export function normalizeBuyerPortalSubmissionStatus(value: any) {
  return String(value ?? '')
    .trim()
    .replace(/[-/]+/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function isReviewableBuyerPortalSubmission(submission: any) {
  const buyerData = submission?.buyer_data || submission?.buyerData || submission || {}
  const statuses = [
    submission?.status,
    buyerData?.submissionStatus,
    buyerData?.submission_status,
    buyerData?.verificationStatus,
    buyerData?.verification_status,
    buyerData?.status,
  ].map(normalizeBuyerPortalSubmissionStatus).filter(Boolean)

  if (statuses.some(status => RESOLVED_BUYER_PORTAL_STATUSES.has(status))) return false
  return statuses.some(status => REVIEWABLE_BUYER_PORTAL_STATUSES.has(status))
}

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}

export const createBuyerPortalSubmission = async (buyerData: any) => {
  const client = requireSupabase()
  const payload = {
    ...buyerData,
    submittedAt: buyerData?.submittedAt || new Date().toISOString(),
    submissionStatus: buyerData?.submissionStatus || 'Pending Review',
    status: buyerData?.status || 'Submitted / Pending Review',
  }

  const { data, error } = await client
    .from(BUYER_PORTAL_SUBMISSIONS_TABLE)
    .insert({
      status: 'pending_review',
      buyer_data: payload,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  const notification = await notifySubmission('buyer', { ...payload, id: data?.id }, {
    eventType: 'new_buyer',
    workspaceId: 'default',
    relatedRecordId: data?.id,
  })
  notifyBuyerPortalQueueChanged()

  return { ...(data || {}), notification }
}

export const listPendingBuyerPortalSubmissions = async () => {
  const client = requireSupabase()

  const { data, error } = await client
    .from(BUYER_PORTAL_SUBMISSIONS_TABLE)
    .select('id, status, buyer_data, created_at')
    .in('status', [
      'pending_review',
      'pending',
      'new',
      'Pending Review',
      'New',
      'Submitted / Pending Review',
      'Needs Recheck',
      'needs_recheck',
      'Pending Verification',
      'pending_verification',
    ])
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data || []).filter(isReviewableBuyerPortalSubmission)
}

export const countPendingBuyerPortalSubmissions = async () => {
  const rows = await listPendingBuyerPortalSubmissions()
  return rows.length
}

export const markBuyerPortalSubmissionsImported = async (ids: string[]) => {
  if (!ids.length) return

  const client = requireSupabase()

  const { error } = await client
    .from(BUYER_PORTAL_SUBMISSIONS_TABLE)
    .update({
      status: 'imported',
      imported_at: new Date().toISOString(),
    })
    .in('id', ids)

  if (error) {
    throw error
  }

  notifyBuyerPortalQueueChanged()
}


export async function markBuyerPortalSubmissionsDismissed(ids: string[]) {
  if (!ids.length) return

  const client = requireSupabase ? requireSupabase() : supabase

  if (!client) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const { error } = await client
    .from(BUYER_PORTAL_SUBMISSIONS_TABLE)
    .update({
      status: 'dismissed',
      imported_at: new Date().toISOString(),
    })
    .in('id', ids)

  if (error) {
    throw error
  }
  notifyBuyerPortalQueueChanged()
}

