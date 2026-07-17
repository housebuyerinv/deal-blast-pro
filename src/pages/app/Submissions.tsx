import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabaseClient'
import { useAppStore } from '../../store/useAppStore'
import {

  dismissDealSubmission,
  getDealSubmissionConversionMeta,
  getDealSubmissionQueueBucket,
  hasMissingDealSubmissionDocs,
  isActionableDealSubmission,
  isConvertedDealSubmission,
  listDealSubmissionsForReview,
  markDealSubmissionConverted,
} from '../../lib/dealSubmissionStorage'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

function safeApprovalError(error: any, fallback = 'Approval failed.') {
  const code = cleanText(error?.code || error?.status || error?.statusCode)
  const rawMessage = cleanText(error?.message || error?.error_description || error?.details || error)
  const message = rawMessage || fallback
  const lower = message.toLowerCase()

  let nextStep = 'Check Supabase table/policy/required fields or retry.'
  if (lower.includes('permission') || lower.includes('rls') || lower.includes('policy') || lower.includes('row-level')) {
    nextStep = 'Approval blocked by Supabase permissions. Owner/admin policy may need review.'
  } else if (lower.includes('column') || lower.includes('schema')) {
    nextStep = 'Approval cannot complete because a required Supabase column is missing.'
  } else if (lower.includes('relation') || lower.includes('table') || lower.includes('does not exist')) {
    nextStep = 'Approval cannot complete because a required Supabase table is missing.'
  }

  return {
    reason: `${code ? `Code ${code}: ` : ''}${message}`,
    nextStep,
  }
}

type FieldDef = { key: string; 

label: string; money?: boolean; bool?: boolean }
type SectionDef = { title: string; fields: FieldDef[] }

const DOC_CATS = [
  { key: 'photos', label: 'Photos' },
  { key: 'psa', label: 'PSA / Contract' },
  { key: 'rentRoll', label: 'Rent Roll' },
  { key: 't12', label: 'T12' },
  { key: 'om', label: 'OM' },
  { key: 'comps', label: 'Comps' },
  { key: 'financials', label: 'Financials' },
  { key: 'other', label: 'Other documents' },
]

const PORTAL_SECTIONS: SectionDef[] = [
  {
    title: '1. Contact Info',
    fields: [
      { key: 'name', label: 'Your name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'role', label: 'Role' },
      { key: 'company', label: 'Company' },
      { key: 'bestContactTime', label: 'Best contact time' },
    ],
  },
  {
    title: '2. Property Info',
    fields: [
      { key: 'address', label: 'Property address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'zip', label: 'ZIP' },
      { key: 'county', label: 'County' },
      { key: 'assetType', label: 'Asset type' },
      { key: 'occupancy', label: 'Occupancy status' },
      { key: 'yearBuilt', label: 'Year built' },
      { key: 'beds', label: 'Beds' },
      { key: 'baths', label: 'Baths' },
      { key: 'sqFt', label: 'Sq Ft' },
      { key: 'units', label: 'Units / doors' },
      { key: 'lotSize', label: 'Lot size' },
    ],
  },
  {
    title: '3. Deal Terms',
    fields: [
      { key: 'askingPrice', label: 'Asking price', money: true },
      { key: 'contractPrice', label: 'Contract price', money: true },
      { key: 'structure', label: 'Deal structure' },
      { key: 'underContract', label: 'Under contract' },
      { key: 'closeTimeline', label: 'Desired close timeline' },
      { key: 'freeAndClearStatus', label: 'Free and clear?' },
      { key: 'debtTotalOwed', label: 'Total amount owed', money: true },
      { key: 'debtLoanBalance', label: 'Loan / mortgage balance', money: true },
      { key: 'debtMonthlyPayment', label: 'Monthly payment', money: true },
      { key: 'debtPaymentsCurrent', label: 'Payments current?' },
      { key: 'debtLiensJudgments', label: 'Liens, taxes, HELOCs, judgments' },
      { key: 'debtNotes', label: 'Debt / lien notes' },
      { key: 'debtExplanation', label: 'Debt explanation' },
      { key: 'arv', label: 'ARV', money: true },
      { key: 'rehab', label: 'Rehab estimate', money: true },
      { key: 'rent', label: 'Rent, monthly', money: true },
      { key: 'noi', label: 'NOI, annual', money: true },
      { key: 'capRate', label: 'Cap rate' },
      { key: 'mortgageBalance', label: 'Current mortgage balance', money: true },
      { key: 'downPayment', label: 'Down payment needed', money: true },
      { key: 'wholesaleFee', label: 'Wholesale / assignment fee', money: true },
      { key: 'sellerFinanceTerms', label: 'Seller finance terms' },
      { key: 'notes', label: 'Notes / deal summary' },
    ],
  },
  {
    title: '4. Directness & Control',
    fields: [
      { key: 'directToSeller', label: 'How direct to seller?' },
      { key: 'proofOfControl', label: 'Proof of control available?' },
      { key: 'permissionsConfirmed', label: 'Permission confirmed', bool: true },
      { key: 'consent', label: 'Consent', bool: true },
      { key: 'sellerMotivation', label: 'Seller motivation' },
      { key: 'accessInstructions', label: 'Access / showing instructions' },
      { key: 'lockboxInfo', label: 'Lockbox / showing info' },
      { key: 'titleLienIssues', label: 'Known title / lien issues' },
    ],
  },
]

function cleanText(value: any, fallback = '') {
  if (value === undefined || value === null) return fallback
  const text = String(value).replace(/\uFFFD/g, '').trim()
  return text || fallback
}

function hasValue(value: any) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

const DEMOGRAPHIC_LOCATION_PATTERN = /\b(hispanic|latino|latina|latinx|race|ethnicity|demographic|classification|white|black|asian|native american|pacific islander|prefer not|unknown)\b/i
const US_STATE_PATTERN = /\b(A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])\b/i

function isBadLocationValue(value: any) {
  const text = cleanText(value)
  return !text || DEMOGRAPHIC_LOCATION_PATTERN.test(text)
}

function parseCityFromAddress(address: any, state: any) {
  const text = cleanText(address)
  if (!text || !text.includes(',')) return ''
  const parts = text.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return ''

  const stateText = cleanText(state).toUpperCase()
  const stateIndex = parts.findIndex(part => {
    const upper = part.toUpperCase()
    return stateText ? upper.includes(stateText) : US_STATE_PATTERN.test(upper)
  })

  if (stateIndex > 0) return parts[stateIndex - 1]
  if (parts.length >= 3) return parts[parts.length - 2]
  return ''
}

function resolveSubmissionLocation(data: any) {
  const state = cleanText(getField(data, 'state'))
  const directCity = cleanText(getField(data, 'city'))
  const parsedCity = parseCityFromAddress(getField(data, 'address'), state)
  const city = isBadLocationValue(directCity) ? parsedCity : directCity
  return {
    city: isBadLocationValue(city) ? '' : city,
    state,
  }
}

function money(value: any) {
  if (!hasValue(value)) return 'Not provided'
  const original = cleanText(value)
  const raw = original.replace(/[^0-9.-]/g, '')
  if (!raw || raw === '-') return original
  const num = Number(raw)
  if (!Number.isFinite(num)) return original
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function yesNo(value: any) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (!hasValue(value)) return 'Not provided'
  return cleanText(value)
}

function formatSource(value: any) {
  const raw = cleanText(value || 'public_portal')
  if (raw.includes('public')) return 'Public Portal'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

function fileSize(bytes: any) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function getField(data: any, key: string) {
  const direct = data?.[key]
  if (hasValue(direct)) return direct

  // Backward compatibility for older/nested local submissions.
  const nested: Record<string, any> = {
    name: data?.submitter?.name,
    email: data?.submitter?.email,
    phone: data?.submitter?.phone,
    role: data?.submitter?.role,
    company: data?.submitter?.company,
    bestContactTime: data?.submitter?.bestContactTime,
    address: data?.property?.address,
    city: data?.property?.city,
    state: data?.property?.state,
    zip: data?.property?.zip,
    county: data?.property?.county,
    assetType: data?.property?.type,
    occupancy: data?.property?.occupancy,
    yearBuilt: data?.property?.yearBuilt,
    beds: data?.property?.beds,
    baths: data?.property?.baths,
    sqFt: data?.property?.sqFt,
    units: data?.property?.units,
    lotSize: data?.property?.lotSize,
    askingPrice: data?.pricing?.askingPrice,
    contractPrice: data?.pricing?.contractPrice,
    arv: data?.pricing?.arv,
    rehab: data?.pricing?.rehab,
    rent: data?.pricing?.rent,
    noi: data?.pricing?.noi,
    capRate: data?.pricing?.capRate,
    wholesaleFee: data?.pricing?.wholesaleFee,
    freeAndClearStatus: data?.debt?.freeAndClearStatus,
    debtTotalOwed: data?.debt?.totalAmountOwed,
    debtLoanBalance: data?.debt?.mortgageBalance,
    debtMonthlyPayment: data?.debt?.monthlyPayment,
    debtPaymentsCurrent: data?.debt?.paymentsCurrent,
    debtLiensJudgments: data?.debt?.liens,
    debtNotes: data?.debt?.notes,
    directToSeller: data?.directness?.toSeller,
    proofOfControl: data?.directness?.proofOfControl,
    permissionsConfirmed: data?.directness?.permissionsConfirmed,
    consent: data?.directness?.consent,
    sellerMotivation: data?.directness?.sellerMotivation,
    accessInstructions: data?.directness?.accessInstructions,
    lockboxInfo: data?.directness?.lockboxShowing,
    titleLienIssues: data?.directness?.titleLienIssues,
  }

  return nested[key]
}

function formatValue(data: any, field: FieldDef) {
  const value = getField(data, field.key)
  if (field.money) return money(value)
  if (field.bool) return yesNo(value)
  if (!hasValue(value)) return 'Not provided'
  return cleanText(value)
}

function parseSubmission(sub: any) {
  const d = sub?.deal_data || {}
  const location = resolveSubmissionLocation(d)
  return {
    address: cleanText(getField(d, 'address'), 'Address not provided'),
    city: location.city,
    state: location.state,
    zip: cleanText(getField(d, 'zip')),
    submitter: cleanText(getField(d, 'name'), 'Unknown submitter'),
    asking: getField(d, 'askingPrice') || getField(d, 'contractPrice'),
    arv: getField(d, 'arv'),
  }
}

function normalizeFile(fileValue: any, fallbackLabel = 'Uploaded File', index = 0) {
  if (!fileValue || typeof fileValue !== 'object') return null

  const nestedFile = fileValue.file && typeof fileValue.file === 'object' ? fileValue.file : {}
  const name = cleanText(fileValue.name || fileValue.filename || fileValue.fileName || nestedFile.name || nestedFile.fileName || `${fallbackLabel} ${index + 1}`)
  const type = cleanText(fileValue.type || fileValue.mimeType || fileValue.mime_type || fileValue.fileType || nestedFile.type || nestedFile.fileType)
  const size = fileValue.fileSize || fileValue.size || fileValue.bytes || fileValue.size_bytes || nestedFile.fileSize || nestedFile.size
  const url = cleanText(fileValue.publicUrl || fileValue.url || fileValue.signedUrl || fileValue.downloadUrl || nestedFile.publicUrl || nestedFile.url || nestedFile.signedUrl || nestedFile.downloadUrl)
  const dataUrl = cleanText(fileValue.fileDataUrl || fileValue.dataUrl || nestedFile.fileDataUrl || nestedFile.dataUrl)
  const storageBucket = cleanText(fileValue.storageBucket || nestedFile.storageBucket)
  const storagePath = cleanText(fileValue.storagePath || nestedFile.storagePath)
  const category = cleanText(fileValue.category || fileValue.label || fallbackLabel)
  const uploadedAt = cleanText(fileValue.uploadedAt || fileValue.createdAt || nestedFile.uploadedAt || nestedFile.createdAt)

  if (!name && !url && !dataUrl && !storagePath) return null
  return { name, type, size, url, dataUrl, storageBucket, storagePath, category, uploadedAt }
}

function getOpenableDealFileUrl(file: any) {
  if (file?.url) return file.url
  if (file?.dataUrl) return file.dataUrl
  if (file?.storagePath && supabase) {
    const { data } = supabase.storage
      .from(file.storageBucket || 'deal-submission-files')
      .getPublicUrl(file.storagePath)
    return data?.publicUrl || ''
  }
  return ''
}

function collectFiles(data: any) {
  const candidates: any[] = []
  const pushArray = (value: any) => { if (Array.isArray(value)) candidates.push(...value) }

  pushArray(data?.docs)
  pushArray(data?.uploadedFiles)
  pushArray(data?.files)
  pushArray(data?.documents)

  const seen = new Set<string>()
  return candidates
    .map((item, index) => normalizeFile(item, 'Uploaded File', index))
    .filter(Boolean)
    .filter((file: any) => {
      const fp = [file.name, file.type, file.size].join('|')
      if (seen.has(fp)) return false
      seen.add(fp)
      return true
    }) as any[]
}

const RAW_FIELD_EXCLUDE_KEYS = new Set([
  'docs',
  'documents',
  'uploadedFiles',
  'files',
  'file',
  'fileDataUrl',
  'dataUrl',
  'publicUrl',
  'url',
  'downloadUrl',
  'signedUrl',
  'storagePath',
  'storageBucket',
])

function titleFromPath(path: string) {
  return path
    .replace(/\[(\d+)\]/g, ' $1')
    .replace(/\./g, ' / ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const KNOWN_ADDITIONAL_LABELS = new Set([
  ...PORTAL_SECTIONS.flatMap(section => section.fields.flatMap(field => [field.label, titleFromPath(field.key)])),
  'Submitted At',
  'Submitted From Page',
  'Submission Status',
  'Queue Source',
  'Source',
  'Page',
  'Submission Status',
  'Admin Warnings',
])

function flattenSubmissionFields(value: any, prefix = '', rows: Array<{ label: string; value: string }> = []) {
  if (!prefix && (!value || typeof value !== 'object')) return rows

  if (Array.isArray(value)) {
    if (!value.length) {
      rows.push({ label: titleFromPath(prefix), value: 'Not Provided' })
      return rows
    }

    const primitives = value.every(item => item === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof item))
    if (primitives) {
      rows.push({ label: titleFromPath(prefix), value: value.map(item => cleanText(item, 'Not Provided')).join(', ') || 'Not Provided' })
      return rows
    }

    value.forEach((item, index) => flattenSubmissionFields(item, `${prefix}[${index + 1}]`, rows))
    return rows
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([key]) => !RAW_FIELD_EXCLUDE_KEYS.has(key))
    if (!entries.length && prefix) rows.push({ label: titleFromPath(prefix), value: 'Not Provided' })
    entries.forEach(([key, item]) => flattenSubmissionFields(item, prefix ? `${prefix}.${key}` : key, rows))
    return rows
  }

  rows.push({ label: titleFromPath(prefix), value: cleanText(value, 'Not Provided') })
  return rows
}


function toNumberOrUndefined(value: any) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const n = Number(String(value).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function boolLike(value: any) {
  if (typeof value === 'boolean') return value;
  const text = safeLower(value).trim();
  if (!text) return false;
  return ['yes', 'y', 'true', '1', 'owner', 'direct', 'confirmed'].some(x => text === x || text.includes(x));
}

function buildInventoryDealFromSubmission(sub: any) {
  const data = sub?.deal_data || {};
  const address = cleanText(getField(data, 'address'), 'Address not provided');
  const location = resolveSubmissionLocation(data);
  const city = location.city;
  const state = location.state;
  const zip = cleanText(getField(data, 'zip'));
  const county = cleanText(getField(data, 'county'));

  const assetType = cleanText(getField(data, 'assetType'), 'Unknown');
  const structure = cleanText(getField(data, 'structure'));
  const notes = [
    cleanText(getField(data, 'notes')),
    cleanText(getField(data, 'sellerFinanceTerms') ? `Seller finance terms: ${getField(data, 'sellerFinanceTerms')}` : ''),
    cleanText(getField(data, 'sellerMotivation') ? `Seller motivation: ${getField(data, 'sellerMotivation')}` : ''),
    cleanText(getField(data, 'accessInstructions') ? `Access/showing: ${getField(data, 'accessInstructions')}` : ''),
    cleanText(getField(data, 'titleLienIssues') ? `Title/lien issues: ${getField(data, 'titleLienIssues')}` : ''),
    cleanText(getField(data, 'debtNotes') ? `Debt notes: ${getField(data, 'debtNotes')}` : ''),
  ].filter(Boolean).join('\n\n');

  const docs = collectFiles(data).map((file: any, index: number) => ({
    id: file.id || `submission-doc-${sub?.id || Date.now()}-${index}`,
    name: file.name || file.fileName || `Uploaded File ${index + 1}`,
    type: file.type || file.fileType || 'file',
    url: file.url || file.publicUrl || file.dataUrl || file.fileDataUrl || '',
    category: file.category || 'Uploaded File',
    size: file.size || file.fileSize || undefined,
    uploadedAt: file.uploadedAt || new Date().toISOString(),
    source: 'deal_submission',
    meta: file,
  }));

  return {
    status: 'Approved',
    source: 'Public Portal',
    submitter: {
      name: cleanText(getField(data, 'name'), 'Unknown submitter'),
      email: cleanText(getField(data, 'email')),
      phone: cleanText(getField(data, 'phone')),
      role: cleanText(getField(data, 'role')),
      company: cleanText(getField(data, 'company')),
      isOwner: boolLike(getField(data, 'directToSeller')) || boolLike(getField(data, 'consent')),
      consent: boolLike(getField(data, 'consent')) || boolLike(getField(data, 'permissionsConfirmed')),
    },
    property: {
      address,
      city,
      state,
      zip,
      county,
      type: assetType,
      strategy: structure || cleanText(getField(data, 'dealStrategy')) || 'Review Needed',
      units: toNumberOrUndefined(getField(data, 'units')),
      beds: toNumberOrUndefined(getField(data, 'beds')),
      baths: toNumberOrUndefined(getField(data, 'baths')),
      sqft: toNumberOrUndefined(getField(data, 'sqFt')),
      lotSize: cleanText(getField(data, 'lotSize')),
      yearBuilt: toNumberOrUndefined(getField(data, 'yearBuilt')),
      occupancy: cleanText(getField(data, 'occupancy')),
    },
    pricing: {
      askingPrice: toNumberOrUndefined(getField(data, 'askingPrice')),
      contractPrice: toNumberOrUndefined(getField(data, 'contractPrice')) || toNumberOrUndefined(getField(data, 'askingPrice')),
      arv: toNumberOrUndefined(getField(data, 'arv')),
      rehab: toNumberOrUndefined(getField(data, 'rehab')),
      rent: toNumberOrUndefined(getField(data, 'rent')),
      noi: toNumberOrUndefined(getField(data, 'noi')),
      capRate: toNumberOrUndefined(getField(data, 'capRate')),
      wholesaleFee: toNumberOrUndefined(getField(data, 'wholesaleFee')),
      downPayment: toNumberOrUndefined(getField(data, 'downPayment')),
      sellerFinance: /seller|creative|owner|finance/i.test(String(structure || getField(data, 'sellerFinanceTerms') || '')),
    },
    debt: {
      isFreeClear: /free|clear|yes/i.test(String(getField(data, 'freeAndClearStatus') || '')),
      mortgageBalance: toNumberOrUndefined(getField(data, 'debtLoanBalance')) || toNumberOrUndefined(getField(data, 'mortgageBalance')),
      totalOwed: toNumberOrUndefined(getField(data, 'debtTotalOwed')),
      monthlyPayment: toNumberOrUndefined(getField(data, 'debtMonthlyPayment')),
      paymentsCurrent: cleanText(getField(data, 'debtPaymentsCurrent')),
      liens: cleanText(getField(data, 'debtLiensJudgments')),
      notes: cleanText(getField(data, 'debtNotes')),
    },
    condition: {
      occupancyStatus: cleanText(getField(data, 'occupancy')),
      walkthroughAvailable: Boolean(cleanText(getField(data, 'lockboxInfo') || getField(data, 'accessInstructions'))),
      notes,
    },
    docs,
    notes,
    originalSubmissionId: sub?.id,
    originalSubmission: data,
  };
}

function DetailBox({ label, value, highlight = false }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={highlight ? 'panel p-3 border border-[#22C55E]/40' : 'panel p-3'}>
      <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
      <div className="text-sm whitespace-pre-wrap break-words">{value}</div>
    </div>
  )
}

export default function Submissions() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const addDeal = useAppStore((state: any) => state.addDeal)
  const deleteDeal = useAppStore((state: any) => state.deleteDeal)
  const safeOpenDeal = useAppStore((state: any) => state.safeOpenDeal)
  const deals = useAppStore((state: any) => state.deals || [])
  const user = useAppStore((state: any) => state.user)
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [queueTab, setQueueTab] = useState<'actionable' | 'new' | 'needsInfo' | 'pendingDocs' | 'converted' | 'archived'>(
    searchParams.get('filter') === 'pending-docs' ? 'pendingDocs' : 'actionable'
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [reviewSub, setReviewSub] = useState<any>(null)
  const [approvalErrors, setApprovalErrors] = useState<Record<string, { reason: string; nextStep: string; checkedAt: string }>>({})
  const [approvingIds, setApprovingIds] = useState<Record<string, boolean>>({})

  const loadSubmissions = async () => {
    setLoading(true)
    setLoadError('')
    const result = await listDealSubmissionsForReview()

    if (!result.ok) {
      console.error('Failed to load deal submissions:', result.error)
      toast.error('Could not load deal submissions from Supabase')
      setSubs([])
      setLoadError('Unable to load deal submissions.')
    } else {
      setSubs(result.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadSubmissions()

    const refresh = () => loadSubmissions()
    window.addEventListener('focus', refresh)
    window.addEventListener('dealblastpro:deal-submission-queue-changed', refresh)
    window.addEventListener('dealblastpro:storage-sync', refresh)

    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('dealblastpro:deal-submission-queue-changed', refresh)
      window.removeEventListener('dealblastpro:storage-sync', refresh)
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('filter') === 'pending-docs') {
      setQueueTab('pendingDocs')
      setSelectedIds([])
    }
  }, [searchParams])

  const visibleSubs = useMemo(() => {
    if (queueTab === 'actionable') return subs.filter(isActionableDealSubmission)
    if (queueTab === 'pendingDocs') return subs.filter((sub: any) => isActionableDealSubmission(sub) && hasMissingDealSubmissionDocs(sub))
    return subs.filter((sub: any) => getDealSubmissionQueueBucket(sub) === queueTab)
  }, [subs, queueTab])

  const tabCounts = useMemo(() => ({
    actionable: subs.filter(isActionableDealSubmission).length,
    new: subs.filter((sub: any) => getDealSubmissionQueueBucket(sub) === 'new').length,
    needsInfo: subs.filter((sub: any) => getDealSubmissionQueueBucket(sub) === 'needsInfo').length,
    pendingDocs: subs.filter((sub: any) => isActionableDealSubmission(sub) && hasMissingDealSubmissionDocs(sub)).length,
    converted: subs.filter((sub: any) => getDealSubmissionQueueBucket(sub) === 'converted').length,
    archived: subs.filter((sub: any) => getDealSubmissionQueueBucket(sub) === 'archived').length,
  }), [subs])

  const preparedSubs = useMemo(() => visibleSubs.map((sub: any) => ({ ...sub, parsed: parseSubmission(sub) })), [visibleSubs])

  useEffect(() => {
    const submissionId = searchParams.get('submissionId')
    if (!submissionId || !subs.length) return
    const match = subs.find((sub: any) => String(sub.id) === submissionId)
    if (match) setReviewSub({ ...match, parsed: parseSubmission(match) })
  }, [searchParams, subs])
  const allSelected = visibleSubs.length > 0 && selectedIds.length === visibleSubs.length && visibleSubs.every((s: any) => selectedIds.includes(s.id))

  const toggleOne = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const selectAll = () => setSelectedIds(allSelected ? [] : visibleSubs.map((s: any) => s.id))

  const clearSelected = async () => {
    if (!selectedIds.length) return toast.error('No submissions selected')
    if (!confirm(`Delete ${selectedIds.length} selected submission(s)? This cannot be undone.`)) return

    const result = await dismissDealSubmission(selectedIds)
    if (!result.ok) return toast.error('Could not delete selected submissions')

    setSelectedIds([])
    toast.success('Selected submissions deleted')
    await loadSubmissions()
  }

  const clearAll = async () => {
    if (!visibleSubs.length) return toast.error('No submissions in this view')
    if (!confirm(`Delete all ${visibleSubs.length} submission(s) in this view? This cannot be undone.`)) return

    const result = await dismissDealSubmission(visibleSubs.map((s: any) => s.id))
    if (!result.ok) return toast.error('Could not delete all submissions')

    setSelectedIds([])
    toast.success('All submissions deleted')
    await loadSubmissions()
  }

  const openInventoryDeal = (dealId: string) => {
    if (!dealId) {
      toast.error('No linked Inventory Hub deal is available for this submission.')
      return
    }
    safeOpenDeal(dealId)
    navigate('/app/inventory')
  }

  const moveToInventory = async (sub: any) => {
    setApprovingIds(prev => ({ ...prev, [sub.id]: true }))
    setApprovalErrors(prev => {
      const next = { ...prev }
      delete next[sub.id]
      return next
    })

    try {
      const conversionMeta = getDealSubmissionConversionMeta(sub)
      if (isConvertedDealSubmission(sub) && conversionMeta.inventoryDealId) {
        openInventoryDeal(conversionMeta.inventoryDealId)
        toast.info('This submission is already converted. Opening the linked Inventory Hub deal.')
        return
      }

      const parsed = sub.parsed || parseSubmission(sub)
      if (!cleanText(parsed.address) || parsed.address === 'Address not provided') {
        const safe = safeApprovalError('Property address is required before approving to Inventory Hub.')
        setApprovalErrors(prev => ({ ...prev, [sub.id]: { ...safe, checkedAt: new Date().toISOString() } }))
        toast.error('Approval failed. Open error details on the submission row.')
        return
      }

      const existingDeal = deals.find((deal: any) =>
        deal?.originalSubmissionId === sub.id ||
        deal?.sourceSubmissionId === sub.id ||
        deal?.originalSubmission?.id === sub.id
      )
      const dealPayload = buildInventoryDealFromSubmission(sub)
      const createdDeal = existingDeal || addDeal({
        ...(dealPayload as any),
        sourceSubmissionId: sub.id,
      })
      const createdNewDeal = !existingDeal

      if (!createdDeal?.id) {
        const safe = safeApprovalError('Could not create inventory deal from submission')
        setApprovalErrors(prev => ({ ...prev, [sub.id]: { ...safe, checkedAt: new Date().toISOString() } }))
        toast.error('Approval failed. Open error details on the submission row.')
        return
      }

      const result = await markDealSubmissionConverted(sub, {
        inventoryDealId: createdDeal.id,
        convertedBy: user?.id || user?.email || 'unknown',
        previousStatus: sub.status || sub.deal_data?.submissionStatus || 'pending',
      })
      if (!result.ok) {
        if (createdNewDeal) deleteDeal(createdDeal.id)
        const safe = safeApprovalError(result.error)
        console.warn('[Deal Blast Pro] Deal submission approval failed', {
          action: 'moveToInventory',
          submissionType: 'deal',
          submissionId: sub.id,
          targetTable: 'deal_submissions',
          reason: safe.reason,
        })
        setApprovalErrors(prev => ({ ...prev, [sub.id]: { ...safe, checkedAt: new Date().toISOString() } }))
        toast.error('Approval failed. Open error details on the submission row.')
        return
      }

      setReviewSub(null)
      setApprovalErrors(prev => {
        const next = { ...prev }
        delete next[sub.id]
        return next
      })
      toast.success(existingDeal ? 'Submission linked to existing Inventory Hub deal' : 'Submission approved to Inventory Hub')
      await loadSubmissions()
    } catch (error) {
      const safe = safeApprovalError(error)
      console.warn('[Deal Blast Pro] Deal submission approval crashed', {
        action: 'moveToInventory',
        submissionType: 'deal',
        submissionId: sub.id,
        targetTable: 'deal_submissions',
        reason: safe.reason,
      })
      setApprovalErrors(prev => ({ ...prev, [sub.id]: { ...safe, checkedAt: new Date().toISOString() } }))
      toast.error('Approval failed. Open error details on the submission row.')
    } finally {
      setApprovingIds(prev => ({ ...prev, [sub.id]: false }))
    }
  }

  const copySummary = async (sub: any) => {
    const p = sub.parsed || parseSubmission(sub)
    const text = [
      `Property: ${p.address}`,
      `Location: ${[p.city, p.state, p.zip].filter(Boolean).join(', ')}`,
      `Submitter: ${p.submitter}`,
      `Asking Price: ${money(p.asking)}`,
      `ARV: ${money(p.arv)}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Summary copied')
    } catch {
      toast.error('Could not copy summary')
    }
  }

  const renderFiles = (data: any) => {
    const files = collectFiles(data)

    return (
      <div className="mb-5">
        <div className="text-sm font-semibold mb-2">Uploads / Files</div>
        <div className="grid gap-3">
          {DOC_CATS.map(cat => {
            const catFiles = files.filter(file => {
              const c = String(file.category || '').replace(/[^a-z0-9]/g, '')
              const k = safeLower(cat.key).replace(/[^a-z0-9]/g, '')
              const label = safeLower(cat.label).replace(/[^a-z0-9]/g, '')
              return c === k || c === label || c.includes(k) || c.includes(label)
            })

            return (
              <div key={cat.key} className="panel p-3">
                <div className="text-xs text-[#8B92A3] mb-1">{cat.label}</div>
                {catFiles.length > 0 ? (
                  <div className="grid gap-2">
                    {catFiles.map((file, index) => {
                      const fileUrl = getOpenableDealFileUrl(file)
                      const hasOpenableUrl = Boolean(fileUrl)

                      return (
                        <div key={`${file.name}-${index}`} className="flex flex-wrap justify-between items-center gap-2 rounded border border-[#252A38] px-2 py-1">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{file.name}</div>
                            <div className="text-xs text-[#8B92A3]">
                              {file.type || 'file'}{file.size ? ` | ${fileSize(file.size)}` : ''}
                              {file.uploadedAt ? ` | Uploaded ${new Date(file.uploadedAt).toLocaleString()}` : ''}
                            </div>
                          </div>
                          {hasOpenableUrl ? (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs shrink-0">Open File</a>
                          ) : (
                            <span className="text-xs text-amber-300 shrink-0">File received, link unavailable</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[#8B92A3]">Not provided</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderReviewModal = () => {
    if (!reviewSub) return null

    const data = reviewSub.deal_data || {}
    const p = reviewSub.parsed || parseSubmission(reviewSub)
    const allSubmittedFields = flattenSubmissionFields(data)
    const additionalFields = allSubmittedFields.filter(field => !KNOWN_ADDITIONAL_LABELS.has(field.label))
    const converted = isConvertedDealSubmission(reviewSub)
    const conversionMeta = getDealSubmissionConversionMeta(reviewSub)

    return (
      <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
        <div className="card w-full max-w-6xl p-6 max-h-[88vh] overflow-auto">
          <div className="flex justify-between gap-4 mb-5">
            <div>
              <div className="text-xs tracking-widest text-[#8B92A3]">SUBMISSION REVIEW</div>
              <div className="text-2xl font-semibold mt-1">{p.address}</div>
              <div className="text-sm text-[#8B92A3] mt-1">
                {[p.city, p.state, p.zip].filter(Boolean).join(', ') || 'Location not provided'} | {formatSource(reviewSub.source)}
              </div>
            </div>
            <button onClick={() => setReviewSub(null)} className="btn btn-ghost h-fit">Close</button>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-5">
            <DetailBox label="Asking Price" value={money(p.asking)} highlight />
            <DetailBox label="ARV" value={money(p.arv)} highlight />
            <DetailBox label="Submitter" value={p.submitter} />
            <DetailBox label="Source" value={formatSource(reviewSub.source)} />
          </div>

          {PORTAL_SECTIONS.map(section => (
            <div key={section.title} className="mb-5">
              <div className="text-sm font-semibold mb-2">{section.title.replace(/^\d+\.\s*/, '')}</div>
              <div className="grid md:grid-cols-2 gap-3">
                {section.fields.map(field => (
                  <DetailBox
                    key={field.key}
                    label={field.label}
                    value={formatValue(data, field)}
                    highlight={['askingPrice', 'contractPrice', 'arv', 'wholesaleFee'].includes(field.key)}
                  />
                ))}
              </div>
            </div>
          ))}

          {renderFiles(data)}

          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">Notes</div>
            <div className="grid md:grid-cols-2 gap-3">
              <DetailBox label="Notes / Deal Summary" value={formatValue(data, { key: 'notes', label: 'Notes / deal summary' })} />
              <DetailBox label="Admin Warnings" value={Array.isArray(data.adminWarnings) && data.adminWarnings.length ? data.adminWarnings.join('\n') : 'Not Provided'} />
            </div>
          </div>

          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">System Info</div>
            <div className="grid md:grid-cols-2 gap-3">
              <DetailBox label="Submitted At" value={cleanText(data.submittedAt, 'Not provided')} />
              <DetailBox label="Submitted From Page" value={cleanText(data.page, 'Not provided')} />
              <DetailBox label="Submission Status" value={cleanText(reviewSub.status, 'Not provided')} />
              <DetailBox label="Queue Source" value={formatSource(reviewSub.source)} />
              {converted && (
                <>
                  <DetailBox label="Converted At" value={conversionMeta.convertedAt ? new Date(conversionMeta.convertedAt).toLocaleString() : 'Missing conversion timestamp'} highlight />
                  <DetailBox label="Converted By" value={cleanText(conversionMeta.convertedBy, 'Missing converting user')} highlight />
                  <DetailBox label="Linked Inventory Deal" value={cleanText(conversionMeta.inventoryDealId, 'Missing linked deal')} highlight />
                </>
              )}
            </div>
          </div>

          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">Additional Fields</div>
            <div className="grid md:grid-cols-2 gap-3">
              {additionalFields.length > 0 ? additionalFields.map((field, index) => (
                <DetailBox key={`${field.label}-${index}`} label={field.label} value={field.value || 'Not Provided'} />
              )) : (
                <DetailBox label="Additional Fields" value="Not Provided" />
              )}
            </div>
          </div>

          {approvalErrors[reviewSub.id] && (
            <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
              <div className="font-semibold text-red-200 mb-1">Approval failed.</div>
              <div className="text-red-100">Reason: {approvalErrors[reviewSub.id].reason}</div>
              <div className="text-[#C5CAD6] mt-1">Next step: {approvalErrors[reviewSub.id].nextStep}</div>
              <button
                onClick={() => setApprovalErrors(prev => {
                  const next = { ...prev }
                  delete next[reviewSub.id]
                  return next
                })}
                className="btn btn-ghost text-xs mt-3"
              >
                Dismiss Error
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-4 border-t border-white/10">
            {converted ? (
              <button
                onClick={() => openInventoryDeal(conversionMeta.inventoryDealId)}
                className="btn btn-green"
              >
                Open Inventory Deal
              </button>
            ) : (
              <button
                onClick={() => moveToInventory(reviewSub)}
                disabled={Boolean(approvingIds[reviewSub.id])}
                className="btn btn-green disabled:opacity-60"
              >
                {approvingIds[reviewSub.id] ? 'Approving...' : 'Approve to Inventory'}
              </button>
            )}
            <button onClick={() => copySummary(reviewSub)} className="btn btn-ghost">Copy Summary</button>
            {!converted && (
              <button
                onClick={async () => {
                  if (!confirm('Delete this submission?')) return
                  const result = await dismissDealSubmission([reviewSub.id])
                  if (!result.ok) return toast.error('Could not delete submission')
                  setReviewSub(null)
                  toast.success('Submission deleted')
                  await loadSubmissions()
                }}
                className="btn btn-ghost text-red-400"
              >
                Delete
              </button>
            )}
            <button onClick={() => setReviewSub(null)} className="btn btn-ghost ml-auto">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between mb-5 items-center gap-4">
        <div>
          <div className="text-xs tracking-widest text-[#8B92A3]">DEAL FLOW</div>
          <div className="text-2xl font-semibold">Deal Submissions Queue</div>
          <div className="text-xs text-[#8B92A3] mt-1">
            {loading ? 'Loading submissions...' : loadError ? 'Unable to load deal submissions.' : `${visibleSubs.length} shown | ${selectedIds.length} selected`}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={loadSubmissions} className="btn btn-ghost">Refresh</button>
          <button onClick={selectAll} className="btn btn-ghost">{allSelected ? 'Unselect All' : 'Select All'}</button>
          <button onClick={clearSelected} className="btn btn-ghost text-red-400">Delete Selected</button>
          <button onClick={clearAll} className="btn btn-ghost text-red-400">Delete All</button>
          <Link to="/portal" className="btn btn-green">+ New Submission</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['actionable', 'Actionable'],
          ['new', 'New / Pending Review'],
          ['needsInfo', 'Needs Info'],
          ['pendingDocs', 'Pending Docs'],
          ['converted', 'Converted'],
          ['archived', 'Archived'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setQueueTab(key as any)
              setSelectedIds([])
              if (key === 'pendingDocs') setSearchParams({ filter: 'pending-docs' })
              else setSearchParams({})
            }}
            className={`btn ${queueTab === key ? 'btn-green' : 'btn-ghost'} text-xs`}
          >
            {label} ({tabCounts[key as keyof typeof tabCounts]})
          </button>
        ))}
      </div>

      {!loading && loadError && (
        <div className="panel p-8 text-center text-[#8B92A3]">
          <div className="text-[#E6E8EE] font-medium mb-1">Unable to load deal submissions.</div>
          <div className="text-sm">Check the Supabase connection and try again.</div>
          <button onClick={loadSubmissions} className="btn btn-green inline-flex mt-4">Retry</button>
        </div>
      )}

      {!loading && !loadError && visibleSubs.length === 0 && (
        <div className="panel p-8 text-center text-[#8B92A3]">
          <div className="text-[#E6E8EE] font-medium mb-1">No deal submissions need review right now.</div>
          <div className="text-sm">New public deal submissions will appear here.</div>
          <Link to="/portal" className="btn btn-green inline-flex mt-4">Open Public Deal Portal</Link>
        </div>
      )}

      {renderReviewModal()}

      <div className="grid gap-3">
        {!loadError && preparedSubs.map((sub: any) => {
          const converted = isConvertedDealSubmission(sub)
          const conversionMeta = getDealSubmissionConversionMeta(sub)
          const bucket = getDealSubmissionQueueBucket(sub)
          const badge = converted ? 'CONVERTED' : bucket === 'needsInfo' ? 'NEEDS INFO' : 'NEW'
          const badgeClass = converted ? 'badge bg-[#3B82F6] text-white text-xs mt-2' : bucket === 'needsInfo' ? 'badge bg-amber-500 text-black text-xs mt-2' : 'badge bg-[#22C55E] text-black text-xs mt-2'

          return (
          <div key={sub.id} className="card p-4">
            <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <input
                type="checkbox"
                checked={selectedIds.includes(sub.id)}
                onChange={() => toggleOne(sub.id)}
                className="h-4 w-4 accent-[#22C55E]"
              />
              <div className="min-w-0">
                <div className="font-medium">{sub.parsed.address}</div>
                <div className="text-sm text-[#8B92A3]">
                  {[sub.parsed.city, sub.parsed.state].filter(Boolean).join(', ') || 'Location not provided'} | {sub.parsed.submitter} | {formatSource(sub.source)}
                </div>
                <div className="text-xs text-[#8B92A3] mt-1">
                  {sub.parsed.asking ? `Asking Price: ${money(sub.parsed.asking)}` : 'Asking price not provided'}
                  {sub.parsed.arv ? ` | ARV: ${money(sub.parsed.arv)}` : ''}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={badgeClass}>{badge}</span>
                  {converted && (
                    <span className="text-xs text-[#8B92A3] mt-2">
                      Converted to Inventory{conversionMeta.convertedAt ? ` ${new Date(conversionMeta.convertedAt).toLocaleDateString()}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button onClick={() => setReviewSub(sub)} className="btn btn-ghost">{converted ? 'View Submission' : 'Review Submission'}</button>
              {converted ? (
                <button
                  onClick={() => openInventoryDeal(conversionMeta.inventoryDealId)}
                  className="btn btn-green"
                >
                  Open Inventory Deal
                </button>
              ) : (
                <button
                  onClick={() => moveToInventory(sub)}
                  disabled={Boolean(approvingIds[sub.id])}
                  className="btn btn-green disabled:opacity-60"
                >
                  {approvingIds[sub.id] ? 'Approving...' : 'Approve to Inventory'}
                </button>
              )}
            </div>
            </div>
            {approvalErrors[sub.id] && (
              <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <div className="font-semibold text-red-200">Approval failed</div>
                <div className="text-red-100 mt-1">Reason: {approvalErrors[sub.id].reason}</div>
                <div className="text-[#C5CAD6] mt-1">Next step: {approvalErrors[sub.id].nextStep}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => moveToInventory(sub)} className="btn btn-green text-xs">Retry</button>
                  <button onClick={() => setReviewSub(sub)} className="btn btn-ghost text-xs">View error details</button>
                  <button
                    onClick={() => setApprovalErrors(prev => {
                      const next = { ...prev }
                      delete next[sub.id]
                      return next
                    })}
                    className="btn btn-ghost text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
