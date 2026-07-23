import { notifySubmission } from './submissionNotifications'
import { supabase } from './supabaseClient'

const DEAL_SUBMISSION_FILE_BUCKET = 'deal-submission-files'
const FILE_UPLOAD_WARNING = 'Submission received, but file upload could not be completed. Please email files separately.'
const DEAL_SUBMISSION_LOAD_TIMEOUT_MS = 12000
const DEAL_SUBMISSION_WRITE_TIMEOUT_MS = 20000

const ACTIONABLE_SUBMISSION_STATUSES = new Set([
  'new',
  'pending',
  'pending review',
  'pending_review',
  'submitted',
  'needs review',
  'needs_review',
  'needs info',
  'needs_info',
])

const ACTIONABLE_SUBMISSION_DB_STATUSES = [
  'new',
  'New',
  'pending',
  'Pending',
  'pending review',
  'Pending Review',
  'pending_review',
  'submitted',
  'Submitted',
  'needs review',
  'Needs Review',
  'needs_review',
  'needs info',
  'Needs Info',
  'needs_info',
]

const CONVERTED_SUBMISSION_STATUSES = new Set([
  'converted',
  'imported',
  'imported to pipeline',
  'imported_to_pipeline',
])

const ARCHIVED_SUBMISSION_STATUSES = new Set([
  'archived',
  'reviewed',
  'deleted',
  'dismissed',
])

const REQUIRED_DOC_LABELS: Record<string, string[]> = {
  photos: ['photos', 'photo', 'property photo', 'property photos', 'images'],
  psa: ['psa', 'contract', 'psa / contract', 'purchase agreement'],
  comps: ['comps', 'comparables'],
}

function normalizeSubmissionStatus(value: any) {
  return String(value ?? '').trim().replace(/-/g, ' ').replace(/\s+/g, ' ').toLowerCase()
}

export function getDealSubmissionQueueStatus(submission: any) {
  const status = normalizeSubmissionStatus(submission?.status)
  const nestedStatus = normalizeSubmissionStatus(
    submission?.deal_data?.submissionStatus ||
    submission?.deal_data?.submission_status ||
    submission?.deal_data?.status
  )

  return status || nestedStatus || 'pending'
}

export function isActionableDealSubmission(submission: any) {
  const status = getDealSubmissionQueueStatus(submission)
  return ACTIONABLE_SUBMISSION_STATUSES.has(status)
}

export function isConvertedDealSubmission(submission: any) {
  const status = getDealSubmissionQueueStatus(submission)
  return CONVERTED_SUBMISSION_STATUSES.has(status)
}

export function getDealSubmissionConversionMeta(submission: any) {
  const data = submission?.deal_data || {}
  return {
    convertedAt: submission?.converted_at || data?.convertedAt || data?.converted_at || '',
    convertedBy: submission?.converted_by || data?.convertedBy || data?.converted_by || '',
    inventoryDealId: submission?.inventory_deal_id || data?.inventoryDealId || data?.inventory_deal_id || '',
    previousStatus: data?.previousSubmissionStatus || data?.previous_submission_status || '',
  }
}

export function getDealSubmissionQueueBucket(submission: any) {
  const status = getDealSubmissionQueueStatus(submission)
  if (CONVERTED_SUBMISSION_STATUSES.has(status)) return 'converted'
  if (ARCHIVED_SUBMISSION_STATUSES.has(status)) return 'archived'
  if (status === 'needs info' || status === 'needs_info' || status === 'needs more information') return 'needsInfo'
  return ACTIONABLE_SUBMISSION_STATUSES.has(status) ? 'new' : 'archived'
}

function getSubmissionDealData(submission: any) {
  return submission?.deal_data || submission || {}
}

function getSubmissionAssetType(submission: any) {
  const data = getSubmissionDealData(submission)
  return String(data?.assetType || data?.property?.type || data?.propertyType || '').toLowerCase()
}

export function getRequiredDealSubmissionDocKeys(submission: any) {
  const assetType = getSubmissionAssetType(submission)
  if (assetType.includes('land')) return ['photos', 'comps']
  return ['photos', 'psa']
}

function collectSubmissionFileCandidates(data: any) {
  const candidates: any[] = []
  const pushArray = (value: any) => {
    if (Array.isArray(value)) candidates.push(...value)
  }

  pushArray(data?.docs)
  pushArray(data?.uploadedFiles)
  pushArray(data?.files)
  pushArray(data?.documents)
  return candidates
}

function submissionFileMatchesCategory(file: any, categoryKey: string) {
  const aliases = REQUIRED_DOC_LABELS[categoryKey] || [categoryKey]
  const haystack = [
    file?.category,
    file?.label,
    file?.proofType,
    file?.fileType,
    file?.type,
    file?.name,
    file?.fileName,
    file?.filename,
  ].map(value => String(value || '').toLowerCase()).join(' ')

  return aliases.some(alias => haystack.includes(alias))
}

export function getMissingDealSubmissionDocKeys(submission: any) {
  const data = getSubmissionDealData(submission)
  const files = collectSubmissionFileCandidates(data)
  return getRequiredDealSubmissionDocKeys(submission).filter(key =>
    !files.some(file => submissionFileMatchesCategory(file, key))
  )
}

export function hasMissingDealSubmissionDocs(submission: any) {
  return getMissingDealSubmissionDocKeys(submission).length > 0
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = DEAL_SUBMISSION_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer))
  })
}

function notifyDealSubmissionQueueChanged() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dealblastpro:deal-submission-queue-changed'))
      window.dispatchEvent(new CustomEvent('dealblastpro:storage-sync'))
    }
  } catch {}
}

function requireSupabase() {
  if (!supabase) {
    return { ok: false as const, error: new Error('Supabase client is not configured'), client: null }
  }

  return { ok: true as const, error: null, client: supabase }
}

function safeFileName(name: string) {
  return String(name || 'uploaded-file')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140) || 'uploaded-file'
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read uploaded file.'))
    reader.readAsDataURL(file)
  })
}

async function fileToMeta(file: File, label = 'Uploaded File') {
  const uploadedAt = new Date().toISOString()
  const fileType = file.type || 'application/octet-stream'
  const fileDataUrl = await fileToDataUrl(file)

  const meta: any = {
    label,
    name: file.name,
    fileName: file.name,
    size: file.size,
    fileSize: file.size,
    type: fileType,
    fileType,
    uploadedAt,
    fileDataUrl,
  }

  if (supabase) {
    try {
      const day = uploadedAt.slice(0, 10)
      const path = `deal-submissions/${day}/${crypto.randomUUID()}-${safeFileName(file.name)}`

      const { error } = await supabase.storage
        .from(DEAL_SUBMISSION_FILE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: fileType,
        })

      if (!error) {
        meta.storageBucket = DEAL_SUBMISSION_FILE_BUCKET
        meta.storagePath = path

        const { data } = supabase.storage
          .from(DEAL_SUBMISSION_FILE_BUCKET)
          .getPublicUrl(path)

        if (data?.publicUrl) meta.publicUrl = data.publicUrl
      } else {
        console.warn('Deal submission file storage upload failed; saved fallback fileDataUrl only:', error)
        meta.uploadStatus = 'Needs Review'
        meta.uploadWarning = FILE_UPLOAD_WARNING
      }
    } catch (error) {
      console.warn('Deal submission file storage unavailable; saved fallback fileDataUrl only:', error)
      meta.uploadStatus = 'Needs Review'
      meta.uploadWarning = FILE_UPLOAD_WARNING
    }
  }

  return meta
}

async function safeDealPayload(value: any, keyLabel = 'Uploaded File'): Promise<any> {
  if (typeof File !== 'undefined' && value instanceof File) {
    return fileToMeta(value, keyLabel)
  }

  if (typeof FileList !== 'undefined' && value instanceof FileList) {
    return Promise.all(Array.from(value).map(file => fileToMeta(file, keyLabel)))
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map(item => safeDealPayload(item, keyLabel)))
  }

  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, val]) => {
      if (key === 'file' && typeof File !== 'undefined' && val instanceof File) {
        const meta = await fileToMeta(val, String(value.label || value.category || keyLabel || 'Uploaded File'))
        return Object.entries(meta)
      }
      return [[key, await safeDealPayload(val, key)]]
    }))

    const cleaned: any = {}
    entries.flat().forEach(([key, val]) => {
      cleaned[key] = val
    })

    return cleaned
  }

  return value
}

function looksLikeUploadedFile(value: any) {
  if (!value || typeof value !== 'object') return false

  const hasName = value.fileName || value.name || value.filename
  const hasType = value.fileType || value.type || value.mimeType || value.mime_type
  const hasSize = value.fileSize || value.size || value.size_bytes || value.bytes
  const hasOpenable = value.storagePath || value.publicUrl || value.fileDataUrl || value.dataUrl || value.url || value.downloadUrl

  return Boolean(hasOpenable || (hasName && (hasType || hasSize)))
}

function collectUploadedFileMeta(value: any, found: any[] = [], seen = new Set<string>()) {
  if (!value) return found

  if (Array.isArray(value)) {
    value.forEach(item => collectUploadedFileMeta(item, found, seen))
    return found
  }

  if (typeof value === 'object') {
    if (looksLikeUploadedFile(value)) {
      const fp = [value.fileName || value.name || value.filename, value.fileSize || value.size, value.fileType || value.type].join('|')
      if (!seen.has(fp)) {
        seen.add(fp)
        found.push(value)
      }
      return found
    }

    Object.values(value).forEach(item => collectUploadedFileMeta(item, found, seen))
  }

  return found
}

export async function submitDealToSupabase(dealData: any) {
  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error }

  try {
    const payload = await safeDealPayload(dealData)
    const uploadedFiles = collectUploadedFileMeta(payload)
    const fileUploadNeedsReview = uploadedFiles.some((file: any) => file?.uploadStatus === 'Needs Review' || file?.uploadWarning)
    const submittedAt = payload.submittedAt || new Date().toISOString()
    const submissionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

    const finalPayload = {
      ...payload,
      id: submissionId || payload.id,
      submittedAt,
      submissionStatus: payload.submissionStatus || 'Pending Review',
      uploadedFiles,
      adminWarnings: [
        ...(Array.isArray(payload.adminWarnings) ? payload.adminWarnings : []),
        ...(fileUploadNeedsReview ? [FILE_UPLOAD_WARNING] : []),
      ],
    }

    const insertRow: any = {
      deal_data: finalPayload,
      status: 'pending',
      source: 'public_portal',
    }
    if (submissionId) insertRow.id = submissionId

    const { error } = await withTimeout<any>(
      ready.client
        .from('deal_submissions')
        .insert(insertRow),
      'Deal submission save timed out. Please try again.',
      DEAL_SUBMISSION_WRITE_TIMEOUT_MS
    )

    if (error) return { ok: false, error }

    const notification = await notifySubmission('deal', finalPayload, {
      eventType: 'new_deal',
      workspaceId: 'default',
      relatedRecordId: submissionId,
    })
    notifyDealSubmissionQueueChanged()

    const warnings = [
      ...(fileUploadNeedsReview ? [FILE_UPLOAD_WARNING] : []),
      ...(notification?.ok ? [] : ['Submission saved, but email notification needs review.']),
    ]

    return { ok: true, data: submissionId ? { id: submissionId } : null, warnings, notification }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function listPendingDealSubmissions() {
  const result = await listDealSubmissionsForReview()
  if (!result.ok) return result
  return { ok: true, data: (result.data || []).filter(isActionableDealSubmission) }
}

export async function countPendingDealSubmissions() {
  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error, count: 0 }

  try {
    const { count, error } = await withTimeout<any>(
      ready.client
        .from('deal_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ACTIONABLE_SUBMISSION_DB_STATUSES),
      'Deal submission count timed out.'
    )

    if (error) return { ok: false, error, count: 0 }
    return { ok: true, count: count || 0 }
  } catch (error) {
    return { ok: false, error, count: 0 }
  }
}

export async function listDealSubmissionsForReview() {
  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error, data: [] }

  try {
    const { data, error } = await withTimeout<any>(
      ready.client
        .from('deal_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250),
      'Deal submission queue load timed out.'
    )

    if (error) return { ok: false, error, data: [] }
    return { ok: true, data: data || [] }
  } catch (error) {
    return { ok: false, error, data: [] }
  }
}

export async function markDealSubmissionConverted(submission: any, input: {
  inventoryDealId: string
  convertedBy: string
  previousStatus?: string
}) {
  const id = typeof submission === 'string' ? submission : submission?.id
  if (!id) return { ok: false, error: new Error('Missing submission ID') }
  if (!input.inventoryDealId) return { ok: false, error: new Error('Missing linked Inventory deal ID') }

  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error }

  try {
    const now = new Date().toISOString()
    const existingDealData = typeof submission === 'string' ? {} : (submission?.deal_data || {})
    const conversionAudit = Array.isArray(existingDealData?.conversionAudit) ? existingDealData.conversionAudit : []
    const dealData = {
      ...existingDealData,
      submissionStatus: 'Converted',
      convertedAt: now,
      convertedBy: input.convertedBy,
      inventoryDealId: input.inventoryDealId,
      previousSubmissionStatus: input.previousStatus || getDealSubmissionQueueStatus(submission),
      conversionAudit: [
        ...conversionAudit,
        {
          event: 'submission_converted',
          previousStatus: input.previousStatus || getDealSubmissionQueueStatus(submission),
          newStatus: 'converted',
          inventoryDealId: input.inventoryDealId,
          convertedBy: input.convertedBy,
          at: now,
        },
      ],
    }

    const fullUpdate = {
      status: 'converted',
      converted_at: now,
      converted_by: input.convertedBy,
      inventory_deal_id: input.inventoryDealId,
      deal_data: dealData,
      updated_at: now,
    }

    const fallbackUpdate = {
      status: 'converted',
      deal_data: dealData,
      updated_at: now,
    }

    let { error } = await ready.client
      .from('deal_submissions')
      .update(fullUpdate)
      .eq('id', id)

    if (error && /converted_at|converted_by|inventory_deal_id|column|schema/i.test(String(error.message || error.details || error))) {
      const fallback = await ready.client
        .from('deal_submissions')
        .update(fallbackUpdate)
        .eq('id', id)
      error = fallback.error
    }

    if (error) return { ok: false, error }

    notifyDealSubmissionQueueChanged()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function markDealSubmissionImported(ids: string[]) {
  if (!ids.length) return { ok: true }

  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error }

  try {
    const { error } = await ready.client
      .from('deal_submissions')
      .update({
        status: 'converted',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)

    if (error) return { ok: false, error }

    notifyDealSubmissionQueueChanged()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function dismissDealSubmission(ids: string[]) {
  if (!ids.length) return { ok: true }

  const ready = requireSupabase()
  if (!ready.ok) return { ok: false, error: ready.error }

  try {
    const { error } = await ready.client
      .from('deal_submissions')
      .update({
        status: 'dismissed',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)

    if (error) return { ok: false, error }
    notifyDealSubmissionQueueChanged()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
