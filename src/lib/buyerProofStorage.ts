import { supabase, isSupabaseConfigured } from './supabaseClient'

export const BUYER_PROOF_BUCKET = 'buyer-proof-files'
export const BUYER_REVIEW_MAX_FILE_SIZE = 20 * 1024 * 1024

const ALLOWED_BUYER_REVIEW_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'txt', 'csv'])
const ALLOWED_BUYER_REVIEW_MIME_PREFIXES = ['image/']
const ALLOWED_BUYER_REVIEW_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/csv',
])

export const BUYER_DOCUMENT_TYPES = [
  'Proof of Funds',
  'Bank Statement',
  'Preapproval Letter',
  'Entity Document',
  'Government ID',
  'Buyer Agreement',
  'Purchase History',
  'Other',
] as const

export type BuyerDocumentType = typeof BUYER_DOCUMENT_TYPES[number]

export type BuyerProofFileMeta = {
  id: string
  proofType: string
  otherLabel: string
  fileName: string
  fileSize: number
  fileType: string
  storageProvider: 'supabase' | 'local'
  storageBucket?: string
  storagePath?: string
  publicUrl?: string
  fileDataUrl?: string
  uploadedAt: string
  uploadedBy?: string
  documentType?: BuyerDocumentType | string
  verificationStatus?: 'Pending Review' | 'Verified' | 'Rejected'
  reviewNotes?: string
  originalFileName?: string
}

const safeFileName = (name: string) => {
  return String(name || 'proof-file')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140) || 'proof-file'
}

const fileToDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read file.'))
    }

    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

export function validateBuyerReviewDocument(file: File, maxBytes = BUYER_REVIEW_MAX_FILE_SIZE) {
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() || ''
  const mimeType = file.type || 'application/octet-stream'
  const allowedMime = ALLOWED_BUYER_REVIEW_MIME_TYPES.has(mimeType) || ALLOWED_BUYER_REVIEW_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))

  if (!ALLOWED_BUYER_REVIEW_EXTENSIONS.has(extension) && !allowedMime) {
    throw new Error('Unsupported file type. Upload PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, TXT, or CSV.')
  }

  if (file.size > maxBytes) {
    throw new Error(`File is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  }
}

export async function uploadBuyerProofFile(
  file: File,
  proofType: string,
  otherLabel: string,
  options: {
    documentType?: BuyerDocumentType | string
    uploadedBy?: string
    pathPrefix?: string
    validate?: boolean
  } = {}
): Promise<BuyerProofFileMeta> {
  if (options.validate) validateBuyerReviewDocument(file)

  const id = 'proof_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
  const uploadedAt = new Date().toISOString()
  const fileType = file.type || 'application/octet-stream'
  const documentType = options.documentType || proofType || 'Proof of Funds'

  if (!isSupabaseConfigured || !supabase) {
    return {
      id,
      proofType,
      otherLabel,
      documentType,
      fileName: file.name,
      originalFileName: file.name,
      fileSize: file.size,
      fileType,
      storageProvider: 'local',
      fileDataUrl: await fileToDataUrl(file),
      uploadedAt,
      uploadedBy: options.uploadedBy,
      verificationStatus: 'Pending Review',
    }
  }

  const day = uploadedAt.slice(0, 10)
  let defaultPathPrefix = 'buyer-portal'
  try {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (userId) defaultPathPrefix = `buyer-documents/${userId}`
  } catch {}
  const cleanPrefix = (options.pathPrefix || defaultPathPrefix).replace(/^\/+|\/+$/g, '') || 'buyer-portal'
  const path = `${cleanPrefix}/${day}/${id}-${safeFileName(file.name)}`

  const { error } = await supabase.storage
    .from(BUYER_PROOF_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: fileType,
      upsert: false,
    })

  if (error) throw error

  return {
    id,
    proofType,
    otherLabel,
    documentType,
    fileName: file.name,
    originalFileName: file.name,
    fileSize: file.size,
    fileType,
    storageProvider: 'supabase',
    storageBucket: BUYER_PROOF_BUCKET,
    storagePath: path,
    uploadedAt,
    uploadedBy: options.uploadedBy,
    verificationStatus: 'Pending Review',
  }
}

export async function openBuyerProofFile(file: any) {
  const resolved = await resolveBuyerProofFileUrl(file)
  if (resolved?.url) {
    window.open(resolved.url, '_blank', 'noopener,noreferrer')
    return
  }

  throw new Error('No openable proof file URL found.')
}

export async function resolveBuyerProofFileUrl(file: any): Promise<{ url: string; source: string } | null> {
  if (file?.storagePath && supabase) {
    const bucket = file.storageBucket || BUYER_PROOF_BUCKET
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(file.storagePath, 60 * 10)

    if (error) throw error
    if (!data?.signedUrl) throw new Error('No signed URL returned.')

    return { url: data.signedUrl, source: 'signed' }
  }

  const url = file?.publicUrl || file?.url || file?.downloadUrl || file?.href || ''
  if (url) {
    return { url, source: 'url' }
  }

  const dataUrl = file?.fileDataUrl || file?.dataUrl || ''
  if (dataUrl) {
    const parts = String(dataUrl).split(',')
    const meta = parts[0] || ''
    const base64 = parts.slice(1).join(',')
    const mimeMatch = meta.match(/data:(.*?);base64/)
    const mimeType = mimeMatch?.[1] || file?.fileType || file?.type || file?.mimeType || 'application/octet-stream'
    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const blob = new Blob([bytes], { type: mimeType })
    return { url: window.URL.createObjectURL(blob), source: 'blob' }
  }

  return null
}
