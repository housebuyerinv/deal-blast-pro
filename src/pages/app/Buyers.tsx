
import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { Upload, X, Building2, Home, TrendingUp, MapPin, Flame, CheckSquare, Square, Warehouse, Hotel, Store, Building, Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { BUYER_DOCUMENT_TYPES, BUYER_REVIEW_MAX_FILE_SIZE, openBuyerProofFile, resolveBuyerProofFileUrl, uploadBuyerProofFile, validateBuyerReviewDocument, type BuyerDocumentType } from '../../lib/buyerProofStorage'
import { countPendingBuyerPortalSubmissions, listPendingBuyerPortalSubmissions, markBuyerPortalSubmissionsImported, markBuyerPortalSubmissionsDismissed } from '../../lib/buyerPortalSubmissionStorage'
import { Buyer } from '../../lib/types'
import Tooltip from '../../components/Tooltip'
import { fetchBuyersFromSupabase, updateBuyerInSupabase, deleteBuyersFromSupabase, deleteAllBuyersFromSupabase, upsertBuyersToSupabase } from '../../lib/buyerSupabaseSync'
import { getEffectivePlan } from '../../lib/planAccess'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

// Keep corrupted import/parse values like 38B from taking over the edit form/cards.
// Realistic buyer budgets can still be large, but values above this need manual re-entry.
const MAX_REASONABLE_BUYER_BUDGET = 500000000;

const BUYER_STRATEGY_OPTIONS = [
  'Fix & Flip',
  'BRRRR',
  'Buy & Hold',
  'Section 8',
  'Long-Term Rental',
  'Short-Term Rental',
  'Wholesale',
  'Seller Finance',
  'Creative Finance',
  'Subject To',
  'DSCR Rental',
  'Development',
  'JV',
  'Novation',
  'Wrap',
  'Lease Option',
  'Other'
]

const EXIT_STRATEGIES = BUYER_STRATEGY_OPTIONS

const normalizeBuyerStrategies = (buyer: any) => {
  const values: string[] = []

  const addValue = (value: any) => {
    if (!value) return

    if (Array.isArray(value)) {
      value.forEach(addValue)
      return
    }

    let stringValue = String(value)
    try {
      const parsed = JSON.parse(stringValue)
      if (Array.isArray(parsed)) {
        parsed.forEach(addValue)
        return
      }
    } catch {}

    stringValue
      .split(/[|,;\n]+/)
      .map(v => v.trim())
      .filter(Boolean)
      .forEach(v => values.push(v))
  }

  addValue(buyer?.strategies)
  addValue(buyer?.strategy)
  addValue(buyer?.exitStrategy)
  addValue(buyer?.exit_strategy)
  addValue(buyer?.investmentStrategy)
  addValue(buyer?.investment_strategy)

  const haystack = [
    buyer?.strategy,
    buyer?.strategies,
    buyer?.exitStrategy,
    buyer?.exit_strategy,
    buyer?.investmentStrategy,
    buyer?.investment_strategy,
    buyer?.notes,
    buyer?.buyBox,
    buyer?.buy_box,
    buyer?.rawText,
    buyer?.criteria,
    buyer?.comments,
    buyer?.description,
    buyer?.buyerCriteria,
    buyer?.buyer_criteria
  ].filter(Boolean).join(' ').toLowerCase()

  const inferred: string[] = []

  if (/fix\s*(?:&|and)?\s*flip|fix.?n.?flip|(?:house|property|real estate|sfh|sfr)\s+flipping?|\bflipper\b/.test(haystack)) inferred.push('Fix & Flip')
  if (/brrrr|brrr/.test(haystack)) inferred.push('BRRRR')
  if (/buy\s*(?:&|and)?\s*hold|buy.?hold|landlord/.test(haystack)) inferred.push('Buy & Hold')
  if (/section\s*8|sec\s*8|voucher/.test(haystack)) inferred.push('Section 8')
  if (/long[\s-]?term rental|\bltr\b/.test(haystack)) inferred.push('Long-Term Rental')
  if (/short[\s-]?term rental|\bstr\b|airbnb|vrbo/.test(haystack)) inferred.push('Short-Term Rental')
  if (/subto|sub[\s-]?to|subject[\s-]?to/.test(haystack)) inferred.push('Subject To')
  if (/\bwholesal(?:e|er|ing)\b|\bassign(?:ment|s)?\b|wholesale contract/.test(haystack)) inferred.push('Wholesale')
  if (/seller finance|owner finance/.test(haystack)) inferred.push('Seller Finance')
  if (/creative finance|creative deal|creative structure|\bcreative\b/.test(haystack)) inferred.push('Creative Finance')
  if (/dscr/.test(haystack)) inferred.push('DSCR Rental')
  if (/development|build/.test(haystack)) inferred.push('Development')
  if (/\bjv\b|joint venture/.test(haystack)) inferred.push('JV')
  if (/novation/.test(haystack)) inferred.push('Novation')
  if (/wrap/.test(haystack)) inferred.push('Wrap')
  if (/lease option|rent to own|rto/.test(haystack)) inferred.push('Lease Option')

  const all = [...values, ...inferred]
    .map(v => {
      const clean = String(v || '').trim()
      const normalized = clean.toLowerCase().replace(/[^a-z0-9]+/g, '')
      const aliasMap: Record<string, string> = {
        fixandflip: 'Fix & Flip',
        fixflip: 'Fix & Flip',
        fixnflip: 'Fix & Flip',
        flip: 'Fix & Flip',
        flipper: 'Fix & Flip',
        brrr: 'BRRRR',
        brrrr: 'BRRRR',
        buyandhold: 'Buy & Hold',
        buyhold: 'Buy & Hold',
        section8: 'Section 8',
        sec8: 'Section 8',
        longtermrental: 'Long-Term Rental',
        ltr: 'Long-Term Rental',
        shorttermrental: 'Short-Term Rental',
        str: 'Short-Term Rental',
        wholesale: 'Wholesale',
        wholesaler: 'Wholesale',
        wholesaling: 'Wholesale',
        sellerfinance: 'Seller Finance',
        sellerfinancing: 'Seller Finance',
        ownerfinance: 'Seller Finance',
        ownerfinancing: 'Seller Finance',
        creative: 'Creative Finance',
        creativefinance: 'Creative Finance',
        creativefinancing: 'Creative Finance',
        subjectto: 'Subject To',
        subto: 'Subject To',
        dscr: 'DSCR Rental',
        dscrrental: 'DSCR Rental',
        development: 'Development',
        developer: 'Development',
        jv: 'JV',
        jointventure: 'JV',
        novation: 'Novation',
        wrap: 'Wrap',
        leaseoption: 'Lease Option',
        renttoown: 'Lease Option',
        rto: 'Lease Option',
        other: 'Other',
      }
      const match = BUYER_STRATEGY_OPTIONS.find(opt => opt.toLowerCase() === clean.toLowerCase())
      return match || aliasMap[normalized] || ''
    })
    .filter(Boolean)
    .filter(v => !['Buyer','Cash Buyer','Creative Buyer','Verified Buyer','VIP Buyer'].includes(v))

  return Array.from(new Set(all))
}

const getSelectedBuyerStrategies = (buyer: any) => {
  // BUYER_STRATEGY_SAVE_FIX_V1
  const direct = Array.isArray(buyer?.strategies)
    ? buyer.strategies
    : []

  const fallback = normalizeBuyerStrategies({
    ...buyer,
    strategies: [
      ...direct,
      buyer?.strategy,
      buyer?.exitStrategy,
      buyer?.investmentStrategy,
      buyer?.buyerStrategy,
    ].filter(Boolean)
  })

  return Array.from(new Set(
    fallback
      .map((strategy: any) => String(strategy || '').trim())
      .filter(Boolean)
      .filter((strategy: string) => strategy !== 'Strategy Missing')
  ))
}

const buildBuyerStrategyUpdate = (buyer: any) => {
  const strategies = getSelectedBuyerStrategies(buyer)

  return {
    ...buyer,
    strategies,
    strategy: strategies.join(', '),
    exitStrategy: strategies.join(', '),
    investmentStrategy: strategies.join(', '),
    creativeFinance: strategies.some(strategy => ['Creative Finance', 'Seller Finance', 'Subject To', 'Wrap', 'Lease Option', 'Novation'].includes(strategy)),
    sellerFinance: strategies.includes('Seller Finance'),
    cashBuyer: strategies.some(strategy => ['Fix & Flip', 'BRRRR', 'Buy & Hold', 'Section 8', 'Wholesale', 'DSCR Rental'].includes(strategy)),
  }
}

const StrategyChipSelector = ({
  value,
  onChange,
  otherValue,
  onOtherChange,
  compact = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  otherValue?: string
  onOtherChange?: (next: string) => void
  compact?: boolean
}) => {
  const selected = Array.from(new Set((value || []).map(strategy => String(strategy || '').trim()).filter(Boolean)))

  return (
    <div>
      <div className="flex flex-wrap gap-1 text-[10px] border border-[#252A38] rounded-xl p-2 bg-[#070A0F]">
        {EXIT_STRATEGIES.map(strategy => {
          const active = selected.includes(strategy)
          return (
            <button
              key={strategy}
              type="button"
              onClick={() => {
                const next = active
                  ? selected.filter((x: string) => x !== strategy)
                  : [...selected, strategy]
                onChange(next)
              }}
              className={`px-2 py-0.5 rounded border ${active ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#171B26] border-[#252A38] hover:border-[#3B82F6]'}`}
            >
              {strategy}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <div className="text-[10px] text-amber-300 mt-1">Exit strategy not provided</div>
      )}
      {selected.includes('Other') && onOtherChange && (
        <input
          className={`input mt-2 ${compact ? 'text-xs py-1' : ''}`}
          value={otherValue || ''}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="Other Strategy"
        />
      )}
    </div>
  )
}

const formatBuyerFileSize = (bytes: any) => {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return 'Size unavailable'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const normalizeBuyerReviewDocument = (file: any): any => ({
  id: file?.id || `buyer-doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  proofType: file?.proofType || file?.documentType || file?.category || 'Proof of Funds',
  documentType: file?.documentType || file?.proofType || file?.category || 'Proof of Funds',
  otherLabel: file?.otherLabel || '',
  fileName: file?.fileName || file?.name || file?.filename || 'Uploaded document',
  originalFileName: file?.originalFileName || file?.fileName || file?.name || file?.filename || 'Uploaded document',
  fileSize: file?.fileSize || file?.size || 0,
  fileType: file?.fileType || file?.type || file?.mimeType || 'application/octet-stream',
  storageProvider: file?.storageProvider || (file?.storagePath ? 'supabase' : 'local'),
  storageBucket: file?.storageBucket,
  storagePath: file?.storagePath,
  publicUrl: file?.publicUrl || file?.url || file?.downloadUrl,
  fileDataUrl: file?.fileDataUrl || file?.dataUrl,
  uploadedAt: file?.uploadedAt || file?.createdAt || new Date().toISOString(),
  uploadedBy: file?.uploadedBy || file?.uploader || 'Unknown',
  verificationStatus: file?.verificationStatus || file?.status || 'Pending Review',
  reviewNotes: file?.reviewNotes || '',
})

const BuyerDocumentManager = ({
  files,
  onChange,
  uploadedBy,
  contextId,
  compact = false,
}: {
  files: any[]
  onChange: (next: any[]) => void
  uploadedBy?: string
  contextId: string
  compact?: boolean
}) => {
  const docs = (files || []).map(normalizeBuyerReviewDocument)
  const [documentType, setDocumentType] = useState<BuyerDocumentType>('Proof of Funds')
  const [uploading, setUploading] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const inputId = `buyer-doc-upload-${contextId}`

  const updateDoc = (id: string, changes: any) => {
    onChange(docs.map(doc => doc.id === id ? { ...doc, ...changes } : doc))
  }

  const removeDoc = (id: string) => {
    onChange(docs.filter(doc => doc.id !== id))
  }

  const replaceDoc = (id: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.csv'
    input.onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        validateBuyerReviewDocument(file)
        setUploading(true)
        setProgressLabel(`Replacing ${file.name}...`)
        const existing = docs.find(doc => doc.id === id)
        const uploaded = await uploadBuyerProofFile(file, existing?.documentType || documentType, '', {
          documentType: existing?.documentType || documentType,
          uploadedBy,
          pathPrefix: `buyer-review/${contextId || 'unassigned'}`,
          validate: true,
        })
        updateDoc(id, { ...uploaded, id, verificationStatus: 'Pending Review' })
        toast.success('Document replaced')
      } catch (error: any) {
        toast.error(error?.message || 'Document replacement failed')
      } finally {
        setUploading(false)
        setProgressLabel('')
      }
    }
    input.click()
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return

    const nextDocs = [...docs]
    setUploading(true)

    try {
      for (const file of selectedFiles) {
        validateBuyerReviewDocument(file, BUYER_REVIEW_MAX_FILE_SIZE)
        setProgressLabel(`Uploading ${file.name}...`)
        const uploaded = await uploadBuyerProofFile(file, documentType, '', {
          documentType,
          uploadedBy,
          pathPrefix: `buyer-review/${contextId || 'unassigned'}`,
          validate: true,
        })
        nextDocs.push(uploaded)
        onChange([...nextDocs])
      }
      toast.success(`${selectedFiles.length} document${selectedFiles.length === 1 ? '' : 's'} uploaded`)
    } catch (error: any) {
      toast.error(error?.message || 'Document upload failed')
    } finally {
      setUploading(false)
      setProgressLabel('')
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedFiles = Array.from(event.dataTransfer.files || [])
    if (!droppedFiles.length) return

    const nextDocs = [...docs]
    setUploading(true)

    try {
      for (const file of droppedFiles) {
        validateBuyerReviewDocument(file, BUYER_REVIEW_MAX_FILE_SIZE)
        setProgressLabel(`Uploading ${file.name}...`)
        const uploaded = await uploadBuyerProofFile(file, documentType, '', {
          documentType,
          uploadedBy,
          pathPrefix: `buyer-review/${contextId || 'unassigned'}`,
          validate: true,
        })
        nextDocs.push(uploaded)
        onChange([...nextDocs])
      }
      toast.success(`${droppedFiles.length} document${droppedFiles.length === 1 ? '' : 's'} uploaded`)
    } catch (error: any) {
      toast.error(error?.message || 'Document upload failed')
    } finally {
      setUploading(false)
      setProgressLabel('')
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-[#252A38] bg-[#070A0F] p-3"
        onDragOver={event => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            className={`input ${compact ? 'text-xs py-1' : ''}`}
            value={documentType}
            onChange={e => setDocumentType(e.target.value as BuyerDocumentType)}
          >
            {BUYER_DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <label htmlFor={inputId} className={`btn btn-green cursor-pointer ${compact ? 'text-xs px-3 py-1' : ''}`}>
            <Upload size={14} /> Upload Buyer Document
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.csv"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
        <div className="mt-2 text-[10px] text-[#8B92A3]">
          PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, TXT, CSV. Max {Math.round(BUYER_REVIEW_MAX_FILE_SIZE / 1024 / 1024)} MB per file. Drop files here or use Upload Buyer Document.
        </div>
        {uploading && (
          <div className="mt-2 rounded border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-2 py-1 text-xs text-[#93C5FD]">
            {progressLabel || 'Uploading...'}
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div>No buyer verification documents uploaded.</div>
          <div className="mt-1 text-amber-100/80">Upload a document now, or approve the buyer without documentation.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-xs text-white break-words">{doc.fileName}</div>
                  <div className="mt-1 text-[10px] text-[#8B92A3]">
                    {doc.documentType} | {formatBuyerFileSize(doc.fileSize)} | Uploaded {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : 'Unknown'} | By {doc.uploadedBy || 'Unknown'}
                  </div>
                  <div className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] ${doc.verificationStatus === 'Verified' ? 'bg-[#22C55E]/10 text-[#22C55E]' : doc.verificationStatus === 'Rejected' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
                    {doc.verificationStatus || 'Pending Review'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <BuyerProofFileLink file={doc} label="View" compact />
                  <BuyerProofFileLink file={doc} label="Download" download compact />
                  <button type="button" onClick={() => replaceDoc(doc.id)} className="btn btn-ghost px-2 py-0.5 text-[10px]">Replace</button>
                  <button type="button" onClick={() => updateDoc(doc.id, { verificationStatus: 'Verified' })} className="btn btn-ghost px-2 py-0.5 text-[10px]">Mark Verified</button>
                  <button type="button" onClick={() => updateDoc(doc.id, { verificationStatus: 'Rejected' })} className="btn btn-ghost px-2 py-0.5 text-[10px]">Mark Rejected</button>
                  <button type="button" onClick={() => removeDoc(doc.id)} className="btn btn-ghost px-2 py-0.5 text-[10px] text-red-300">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ImportResult {
  total: number
  added: number
  dups: number
  suppressed: number
  invalid: number
  preview: Array<{ existing?: Buyer; incoming: any; action: string }>
}


const cleanDisplayValue = (value: any, fallback = '') => {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  const badValues = [
    'n/a',
    'na',
    'none',
    'unknown',
    'undefined',
    'null',
    'buyer',
    'name missing',
    'company missing',
    'phone missing',
    'market missing',
    'budget unknown'
  ]

  if (badValues.includes(raw.toLowerCase())) return fallback

  return raw.replace(/\s+/g, ' ').trim()
}

const firstMeaningfulBuyerText = (...values: any[]): string => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested: string = firstMeaningfulBuyerText(...value)
      if (nested) return nested
      continue
    }

    const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!raw) continue

    if (/^(undefined|null|n\/?a|na|none|unknown|notes missing|buy box missing|criteria missing)$/i.test(raw)) continue

    return raw
  }

  return ''
}

// BUYER_LOCAL_EDIT_OVERRIDE_FIX_V1
// Some Supabase rows still come back with older/default parsed values after a refresh.
// Keep the user's latest manual edit in localStorage and merge it over the cloud row
// on hydrate so edited cards do not revert to default/stale asset focus, budget, notes, etc.
const BUYER_LOCAL_EDIT_OVERRIDES_KEY = 'dbp_buyer_local_edit_overrides_v1'

const getBuyerEditOverrideKeys = (buyer: any): string[] => {
  const id = String(buyer?.id || '').trim()
  const email = String(buyer?.email || '').trim().toLowerCase()
  return [
    id ? 'id:' + id : '',
    email ? 'email:' + email : ''
  ].filter(Boolean)
}

const readBuyerEditOverrides = (): Record<string, any> => {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(BUYER_LOCAL_EDIT_OVERRIDES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const writeBuyerEditOverride = (buyer: any) => {
  try {
    if (typeof window === 'undefined' || !buyer) return
    const overrides = readBuyerEditOverrides()
    const cleanBuyer = {
      ...buyer,
      data: buyer?.data && typeof buyer.data === 'object' ? buyer.data : {},
      localManualEditAt: new Date().toISOString(),
    }

    getBuyerEditOverrideKeys(cleanBuyer).forEach(key => {
      overrides[key] = cleanBuyer
    })

    window.localStorage.setItem(BUYER_LOCAL_EDIT_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch (error) {
    console.warn('[Deal Blast Pro] Could not save local buyer edit override:', error)
  }
}

const applyBuyerEditOverrides = (rows: any[]): any[] => {
  const overrides = readBuyerEditOverrides()
  if (!Object.keys(overrides).length) return rows

  return (rows || []).map((buyer: any) => {
    const override = getBuyerEditOverrideKeys(buyer)
      .map(key => overrides[key])
      .find(Boolean)

    if (!override) return buyer

    return {
      ...buyer,
      ...override,
      id: buyer?.id || override?.id,
      email: buyer?.email || override?.email,
      data: {
        ...(buyer?.data && typeof buyer.data === 'object' ? buyer.data : {}),
        ...(override?.data && typeof override.data === 'object' ? override.data : {}),
      }
    }
  })
}

const deriveDisplayNameFromEmail = (email: any) => {
  const raw = String(email || '').split('@')[0] || '';
  const cleaned = raw
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Buyer';

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((piece: string) => piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase())
    .join(' ');
};

const displayBuyerText = (value: any, fallback = '') => {
  const text = String(value ?? '').trim();

  if (!text) return fallback;

  const bad = [
    'undefined',
    'null',
    'n/a',
    'na',
    'none',
    'buyer name',
    'name missing'
  ];

  return bad.includes(text.toLowerCase()) ? fallback : text;
};

const getDisplayName = (buyer: any) => {
  const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
  const merged: any = { ...buyerData, ...buyer }

  const direct = cleanDisplayValue(
    merged.name ||
    merged.fullName ||
    merged.full_name ||
    merged.buyerName ||
    merged.buyer_name ||
    merged.contactName ||
    merged.contact_name,
    ''
  )

  if (direct) return direct

  const emailName = deriveDisplayNameFromEmail(merged.email)
  return cleanDisplayValue(emailName, '')
}

const getDisplayCompany = (buyer: any) => {
  const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
  const merged: any = { ...buyerData, ...buyer }

  return displayBuyerText(
    merged.company ||
    merged.companyName ||
    merged.company_name ||
    merged.entity ||
    merged.business ||
    merged.organization,
    ''
  )
}

const getDisplayPhone = (buyer: any) => {
  return cleanDisplayValue(
    buyer?.phone ||
      buyer?.mobile ||
      buyer?.cell ||
      buyer?.phoneNumber ||
      buyer?.phone_number,
    ''
  );
};


const getMarketDisplayList = (...values: any[]) => {
  return getDisplayList(...values);
};


// BUYER_BUDGET_PROOF_FIX_V1
const normalizeBuyerBudgetMin = (value: any) => {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 1 || n > MAX_REASONABLE_BUYER_BUDGET) return 0
  return Math.round(n)
}

const normalizeBuyerBudgetMax = (value: any) => {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0 || n > MAX_REASONABLE_BUYER_BUDGET) return 0
  return Math.round(n)
}

const displayBudgetInputValue = (value: any) => {
  const n = normalizeBuyerBudgetMax(value)
  return n > 0 ? String(n) : ''
}

const getBuyerProofFiles = (buyer: any) => {
  const merged = buyer && typeof buyer.data === 'object' && buyer.data ? { ...buyer, ...buyer.data } : (buyer || {})

  const buckets = [
    merged.proofFiles,
    merged.uploadedFiles,
    merged.verificationFiles,
    merged.documents,
    merged.files,
    merged.buyerPortalSubmission?.proofFiles,
    merged.buyerPortalSubmission?.uploadedFiles,
    merged.rawPortalSubmission?.buyer_data?.proofFiles,
    merged.rawPortalSubmission?.buyer_data?.uploadedFiles,
  ]

  const files = buckets.flatMap((bucket: any) => Array.isArray(bucket) ? bucket : [])
  const seen = new Set<string>()

  return files.filter((file: any) => {
    const key = [
      file?.id,
      file?.storagePath,
      file?.publicUrl,
      file?.fileDataUrl,
      file?.url,
      file?.downloadUrl,
      file?.fileName || file?.name || file?.filename,
      file?.fileSize || file?.size,
    ].filter(Boolean).join('|') || JSON.stringify(file || {})

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const formatProofFileSize = (size?: number) => {
  const n = Number(size || 0)
  if (!n || Number.isNaN(n)) return ''
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

function BuyerProofFileLink({ file, label = 'View File', download = false, compact = false }: { file: any; label?: string; download?: boolean; compact?: boolean }) {
  const [resolvedUrl, setResolvedUrl] = useState('')
  const [loading, setLoading] = useState(Boolean(file?.storagePath))
  const [error, setError] = useState('')
  const fileName = file?.fileName || file?.name || file?.filename || 'Uploaded proof file'
  const fileType = file?.proofType || file?.fileType || file?.type || file?.mimeType || 'file'
  const fileSizeLabel = formatProofFileSize(file?.fileSize || file?.size)
  const uploadedAt = file?.uploadedAt || file?.createdAt || ''
  const hasStoredReference = Boolean(file?.storagePath || file?.publicUrl || file?.signedUrl || file?.url || file?.downloadUrl || file?.fileDataUrl || file?.dataUrl)

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const resolved = await resolveBuyerProofFileUrl(file)
        if (!alive) return
        setResolvedUrl(resolved?.url || '')
        if (!resolved?.url && hasStoredReference) setError('Unable to load file')
      } catch (err) {
        console.error('Could not resolve proof file:', err)
        if (alive) setError('Unable to load file')
      } finally {
        if (alive) setLoading(false)
      }
    }

    if (hasStoredReference) void load()
    else {
      setLoading(false)
      setError('Legacy file unavailable')
    }

    return () => {
      alive = false
    }
  }, [file, hasStoredReference])

  const openResolved = () => {
    if (resolvedUrl) window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
    else {
      void openBuyerProofFile(file).catch((err) => {
        console.error('Could not open proof file:', err)
        toast.error('Could not open this proof file. Check Supabase Storage permissions.')
      })
    }
  }

  if (compact) {
    if (!resolvedUrl && !hasStoredReference) {
      return <span className="text-[10px] text-amber-300">Legacy file unavailable</span>
    }

    if (download && resolvedUrl) {
      return (
        <a href={resolvedUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="btn btn-ghost px-2 py-0.5 text-[10px] border border-[#3B82F6]/40 text-[#93C5FD]">
          {label}
        </a>
      )
    }

    return (
      <button type="button" onClick={openResolved} disabled={loading} className="btn btn-ghost px-2 py-0.5 text-[10px] border border-[#3B82F6]/40 text-[#93C5FD] disabled:opacity-50">
        {loading ? 'Loading...' : error ? 'Retry' : label}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#252A38] bg-[#070A0F] p-2 text-xs">
      <div>
        {resolvedUrl ? (
          <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-white break-all hover:text-[#93C5FD]">
            {fileName}
          </a>
        ) : (
          <div className="font-medium text-white break-all">{fileName}</div>
        )}
        <div className="text-[#8B92A3]">
          {fileType}{fileSizeLabel ? ' | ' + fileSizeLabel : ''}{uploadedAt ? ' | Uploaded ' + new Date(uploadedAt).toLocaleString() : ''}
        </div>
        {loading && <div className="text-[10px] text-[#93C5FD]">Loading file link...</div>}
        {!loading && error && <div className="text-[10px] text-amber-300">{error}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {resolvedUrl || hasStoredReference ? (
          <>
            <button type="button" onClick={openResolved} className="btn btn-ghost text-xs px-2 py-1 border border-[#3B82F6]/40 text-[#93C5FD]">
              {label}
            </button>
            {resolvedUrl && (
              <a href={resolvedUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-xs px-2 py-1 border border-[#3B82F6]/40 text-[#93C5FD]">
                Download
              </a>
            )}
          </>
        ) : (
          <span className="text-[10px] text-amber-300">Legacy file unavailable</span>
        )}
      </div>
    </div>
  )
}

const getDisplayList = (...values: any[]) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const cleaned = value.map(v => cleanDisplayValue(v, '')).filter(Boolean);
      if (cleaned.length) return cleaned;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map(v => cleanDisplayValue(v, '')).filter(Boolean);
          if (cleaned.length) return cleaned;
        }
      } catch {}

      const cleaned = trimmed
        .split(/[;,|]/g)
        .map(v => cleanDisplayValue(v, ''))
        .filter(Boolean);

      if (cleaned.length) return cleaned;
    }
  }

  return [];
};


// BUYER_MANUAL_NAME_SAVE_FIX_V1
const formatManualBuyerName = (value: any, emailValue = '') => {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  const email = String(emailValue ?? '').trim().toLowerCase()

  const titleCase = (input: string) =>
    String(input || '')
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(word => {
        const lower = word.toLowerCase()
        if (['llc', 'inc', 'lp', 'llp', 'rei', 'usa', 'dc'].includes(lower)) return lower.toUpperCase()
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      })
      .join(' ')

  // If user manually typed a real spaced name, keep it.
  if (raw && /\s/.test(raw) && !/missing|unknown|undefined|null/i.test(raw)) {
    return titleCase(raw)
  }

  // If user typed a compact name, do not destroy it, but title it.
  // Example: "martinchristopher" becomes "Martinchristopher" unless manually edited.
  if (raw && !/missing|unknown|undefined|null/i.test(raw)) {
    return titleCase(raw)
  }

  const local = email
    .replace(/@.*/, '')
    .replace(/\+.*/, '')
    .replace(/\d+$/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return titleCase(local)
}

export default function Buyers() {
  const { 
    buyers, isNewBuyer, markBuyerViewed, importBuyers, 
    addToSuppression, updateBuyer, deleteBuyer,
    getBuyerMatchHistory, user, trial, settings
  } = useAppStore()
  const effectivePlan = getEffectivePlan(trial, user, settings)

  const persistBuyerUpdate = async (id: string, updates: any, successMessage?: string) => {
    const cleanId = String(id || '').trim()
    if (!cleanId) return false

    const strategySyncedUpdates = buildBuyerStrategyUpdate(updates)

    // BUYER_BUDGET_TOP_LEVEL_WINS_FIX_V1
    // Normalize once, then save to every budget alias plus nested data so stale
    // Supabase JSON/data values cannot override the newly edited budget in cards.
    const existingBuyerForSave: any = selectedBuyer || {}
    const existingBuyerDataForSave: any = existingBuyerForSave && typeof existingBuyerForSave.data === 'object' && existingBuyerForSave.data ? existingBuyerForSave.data : {}
    const normalizedBudgetMin = normalizeBuyerBudgetMin(strategySyncedUpdates?.budgetMin)
    const normalizedBudgetMax = normalizeBuyerBudgetMax(strategySyncedUpdates?.budgetMax)
    const cleanAssetTypes = Array.isArray(strategySyncedUpdates?.assetTypes) && strategySyncedUpdates.assetTypes.length
      ? strategySyncedUpdates.assetTypes
      : Array.isArray(strategySyncedUpdates?.assetFocus) && strategySyncedUpdates.assetFocus.length
        ? strategySyncedUpdates.assetFocus
        : Array.isArray(strategySyncedUpdates?.asset_focus) && strategySyncedUpdates.asset_focus.length
          ? strategySyncedUpdates.asset_focus
          : Array.isArray(strategySyncedUpdates?.data?.assetTypes) && strategySyncedUpdates.data.assetTypes.length
            ? strategySyncedUpdates.data.assetTypes
            : Array.isArray(existingBuyerForSave?.assetTypes) && existingBuyerForSave.assetTypes.length
              ? existingBuyerForSave.assetTypes
              : Array.isArray(existingBuyerDataForSave?.assetTypes) && existingBuyerDataForSave.assetTypes.length
                ? existingBuyerDataForSave.assetTypes
                : []
    const cleanNotes = firstMeaningfulBuyerText(
      strategySyncedUpdates?.notes,
      strategySyncedUpdates?.buyBox,
      strategySyncedUpdates?.buy_box,
      strategySyncedUpdates?.criteria,
      strategySyncedUpdates?.buyBoxSummary,
      strategySyncedUpdates?.buyerNotes,
      strategySyncedUpdates?.data?.notes,
      strategySyncedUpdates?.data?.buyBox,
      strategySyncedUpdates?.data?.buy_box,
      strategySyncedUpdates?.data?.criteria,
      strategySyncedUpdates?.data?.rawText,
      existingBuyerForSave?.notes,
      existingBuyerDataForSave?.notes,
      existingBuyerForSave?.buyBox,
      existingBuyerDataForSave?.buyBox,
      existingBuyerForSave?.buy_box,
      existingBuyerDataForSave?.buy_box,
      existingBuyerForSave?.criteria,
      existingBuyerDataForSave?.criteria,
      existingBuyerForSave?.rawText,
      existingBuyerDataForSave?.rawText
    )

    const cleanSellerFinanceTerms = {
      downPaymentMax: firstMeaningfulBuyerText(strategySyncedUpdates?.downPaymentMax, strategySyncedUpdates?.downPayment, strategySyncedUpdates?.data?.downPaymentMax, strategySyncedUpdates?.data?.downPayment, existingBuyerForSave?.downPaymentMax, existingBuyerDataForSave?.downPaymentMax, existingBuyerForSave?.downPayment, existingBuyerDataForSave?.downPayment),
      monthlyPaymentMax: firstMeaningfulBuyerText(strategySyncedUpdates?.monthlyPaymentMax, strategySyncedUpdates?.monthlyPayment, strategySyncedUpdates?.data?.monthlyPaymentMax, strategySyncedUpdates?.data?.monthlyPayment, existingBuyerForSave?.monthlyPaymentMax, existingBuyerDataForSave?.monthlyPaymentMax, existingBuyerForSave?.monthlyPayment, existingBuyerDataForSave?.monthlyPayment),
      interestRateMax: firstMeaningfulBuyerText(strategySyncedUpdates?.interestRateMax, strategySyncedUpdates?.interestRate, strategySyncedUpdates?.data?.interestRateMax, strategySyncedUpdates?.data?.interestRate, existingBuyerForSave?.interestRateMax, existingBuyerDataForSave?.interestRateMax, existingBuyerForSave?.interestRate, existingBuyerDataForSave?.interestRate),
      capRateTarget: firstMeaningfulBuyerText(strategySyncedUpdates?.capRateTarget, strategySyncedUpdates?.capRate, strategySyncedUpdates?.data?.capRateTarget, strategySyncedUpdates?.data?.capRate, existingBuyerForSave?.capRateTarget, existingBuyerDataForSave?.capRateTarget, existingBuyerForSave?.capRate, existingBuyerDataForSave?.capRate),
      balloonTerm: firstMeaningfulBuyerText(strategySyncedUpdates?.balloonTerm, strategySyncedUpdates?.balloon, strategySyncedUpdates?.data?.balloonTerm, strategySyncedUpdates?.data?.balloon, existingBuyerForSave?.balloonTerm, existingBuyerDataForSave?.balloonTerm, existingBuyerForSave?.balloon, existingBuyerDataForSave?.balloon),
      creativeStructure: firstMeaningfulBuyerText(strategySyncedUpdates?.creativeStructure, strategySyncedUpdates?.creative_structure, strategySyncedUpdates?.data?.creativeStructure, strategySyncedUpdates?.data?.creative_structure, existingBuyerForSave?.creativeStructure, existingBuyerDataForSave?.creativeStructure, existingBuyerForSave?.creative_structure, existingBuyerDataForSave?.creative_structure),
    }

    const cleanUpdates = {
      ...strategySyncedUpdates,
      name: formatManualBuyerName(strategySyncedUpdates?.name || strategySyncedUpdates?.buyerName || strategySyncedUpdates?.fullName, strategySyncedUpdates?.email),
      buyerName: formatManualBuyerName(strategySyncedUpdates?.name || strategySyncedUpdates?.buyerName || strategySyncedUpdates?.fullName, strategySyncedUpdates?.email),
      fullName: formatManualBuyerName(strategySyncedUpdates?.name || strategySyncedUpdates?.buyerName || strategySyncedUpdates?.fullName, strategySyncedUpdates?.email),
      budgetMin: normalizedBudgetMin,
      budgetMax: normalizedBudgetMax,
      budget_min: normalizedBudgetMin,
      budget_max: normalizedBudgetMax,
      minBudget: normalizedBudgetMin,
      maxBudget: normalizedBudgetMax,
      notes: cleanNotes,
      buyBox: firstMeaningfulBuyerText(strategySyncedUpdates?.buyBox, strategySyncedUpdates?.buy_box, cleanNotes),
      buy_box: firstMeaningfulBuyerText(strategySyncedUpdates?.buy_box, strategySyncedUpdates?.buyBox, cleanNotes),
      criteria: firstMeaningfulBuyerText(strategySyncedUpdates?.criteria, cleanNotes),
      assetTypes: cleanAssetTypes,
      assetFocus: cleanAssetTypes,
      asset_focus: cleanAssetTypes,
      propertyTypes: cleanAssetTypes,
      property_types: cleanAssetTypes,
      downPaymentMax: cleanSellerFinanceTerms.downPaymentMax,
      downPayment: cleanSellerFinanceTerms.downPaymentMax,
      monthlyPaymentMax: cleanSellerFinanceTerms.monthlyPaymentMax,
      monthlyPayment: cleanSellerFinanceTerms.monthlyPaymentMax,
      interestRateMax: cleanSellerFinanceTerms.interestRateMax,
      interestRate: cleanSellerFinanceTerms.interestRateMax,
      capRateTarget: cleanSellerFinanceTerms.capRateTarget,
      capRate: cleanSellerFinanceTerms.capRateTarget,
      balloonTerm: cleanSellerFinanceTerms.balloonTerm,
      creativeStructure: cleanSellerFinanceTerms.creativeStructure,
      creative_structure: cleanSellerFinanceTerms.creativeStructure,
      bedRequirement: strategySyncedUpdates?.bedRequirement || 'Any',
      bathRequirement: strategySyncedUpdates?.bathRequirement || 'Any',
      unitRequirement: strategySyncedUpdates?.unitRequirement || 'Any',
      sqftRequirement: strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.squareFootageRequirement || strategySyncedUpdates?.minSqft || '',
      squareFootageRequirement: strategySyncedUpdates?.squareFootageRequirement || strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.minSqft || '',
      minSqft: strategySyncedUpdates?.minSqft || strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.squareFootageRequirement || '',
      data: {
        ...(strategySyncedUpdates?.data || {}),
        notes: cleanNotes,
        buyBox: firstMeaningfulBuyerText(strategySyncedUpdates?.buyBox, strategySyncedUpdates?.buy_box, cleanNotes),
        buy_box: firstMeaningfulBuyerText(strategySyncedUpdates?.buy_box, strategySyncedUpdates?.buyBox, cleanNotes),
        criteria: firstMeaningfulBuyerText(strategySyncedUpdates?.criteria, cleanNotes),
        assetTypes: cleanAssetTypes,
        assetFocus: cleanAssetTypes,
        asset_focus: cleanAssetTypes,
        propertyTypes: cleanAssetTypes,
        property_types: cleanAssetTypes,
        bedRequirement: strategySyncedUpdates?.bedRequirement || 'Any',
        bathRequirement: strategySyncedUpdates?.bathRequirement || 'Any',
        unitRequirement: strategySyncedUpdates?.unitRequirement || 'Any',
        sqftRequirement: strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.squareFootageRequirement || strategySyncedUpdates?.minSqft || '',
        squareFootageRequirement: strategySyncedUpdates?.squareFootageRequirement || strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.minSqft || '',
        minSqft: strategySyncedUpdates?.minSqft || strategySyncedUpdates?.sqftRequirement || strategySyncedUpdates?.squareFootageRequirement || '',
        budgetMin: normalizedBudgetMin,
        budgetMax: normalizedBudgetMax,
        budget_min: normalizedBudgetMin,
        budget_max: normalizedBudgetMax,
        minBudget: normalizedBudgetMin,
        maxBudget: normalizedBudgetMax,
      },
      proofFiles: getBuyerProofFiles(updates).length ? getBuyerProofFiles(updates) : strategySyncedUpdates?.proofFiles,
      uploadedFiles: Array.isArray(strategySyncedUpdates?.uploadedFiles) ? updates.uploadedFiles : strategySyncedUpdates?.uploadedFiles,
      id: cleanId,
      updatedAt: new Date().toISOString(),
    }

    const result = await updateBuyerInSupabase(cleanId, cleanUpdates)

    if (!result.ok) {
      toast.error('Supabase update failed: ' + result.error)
      return false
    }

    // BUYER_SAVE_LOCAL_VALUES_WIN_V1
    // Supabase may return an older/normalized row. Keep the values the user just saved
    // as the local source of truth so edited names like "Martin Christopher" do not
    // immediately revert to email-derived names like "Martinchristopher".
    const submittedUpdates = typeof cleanUpdates !== 'undefined' ? cleanUpdates : { ...updates, id: cleanId, updatedAt: new Date().toISOString() }
    const savedBuyer = {
      ...(result.data || {}),
      ...submittedUpdates,
      id: cleanId,
      name: submittedUpdates.name || submittedUpdates.buyerName || submittedUpdates.fullName || result.data?.name || result.data?.buyerName || result.data?.fullName || '',
      buyerName: submittedUpdates.name || submittedUpdates.buyerName || submittedUpdates.fullName || result.data?.buyerName || result.data?.name || '',
      fullName: submittedUpdates.name || submittedUpdates.buyerName || submittedUpdates.fullName || result.data?.fullName || result.data?.name || '',
      budgetMin: submittedUpdates.budgetMin,
      budgetMax: submittedUpdates.budgetMax,
      budget_min: submittedUpdates.budget_min,
      budget_max: submittedUpdates.budget_max,
      notes: firstMeaningfulBuyerText(submittedUpdates.notes, result.data?.notes, result.data?.data?.notes),
      buyBox: firstMeaningfulBuyerText(submittedUpdates.buyBox, submittedUpdates.notes, result.data?.buyBox, result.data?.data?.buyBox),
      buy_box: firstMeaningfulBuyerText(submittedUpdates.buy_box, submittedUpdates.notes, result.data?.buy_box, result.data?.data?.buy_box),
      criteria: firstMeaningfulBuyerText(submittedUpdates.criteria, submittedUpdates.notes, result.data?.criteria, result.data?.data?.criteria),
      downPaymentMax: submittedUpdates.downPaymentMax,
      downPayment: submittedUpdates.downPayment,
      monthlyPaymentMax: submittedUpdates.monthlyPaymentMax,
      monthlyPayment: submittedUpdates.monthlyPayment,
      interestRateMax: submittedUpdates.interestRateMax,
      interestRate: submittedUpdates.interestRate,
      capRateTarget: submittedUpdates.capRateTarget,
      capRate: submittedUpdates.capRate,
      balloonTerm: submittedUpdates.balloonTerm,
      creativeStructure: submittedUpdates.creativeStructure,
      creative_structure: submittedUpdates.creative_structure,
      bedRequirement: submittedUpdates.bedRequirement,
      bathRequirement: submittedUpdates.bathRequirement,
      unitRequirement: submittedUpdates.unitRequirement,
      sqftRequirement: submittedUpdates.sqftRequirement,
      squareFootageRequirement: submittedUpdates.squareFootageRequirement,
      minSqft: submittedUpdates.minSqft,
      assetTypes: Array.isArray(submittedUpdates.assetTypes) ? submittedUpdates.assetTypes : [],
      assetFocus: Array.isArray(submittedUpdates.assetFocus) ? submittedUpdates.assetFocus : (Array.isArray(submittedUpdates.assetTypes) ? submittedUpdates.assetTypes : []),
      asset_focus: Array.isArray(submittedUpdates.asset_focus) ? submittedUpdates.asset_focus : (Array.isArray(submittedUpdates.assetTypes) ? submittedUpdates.assetTypes : []),
      propertyTypes: Array.isArray(submittedUpdates.propertyTypes) ? submittedUpdates.propertyTypes : (Array.isArray(submittedUpdates.assetTypes) ? submittedUpdates.assetTypes : []),
      property_types: Array.isArray(submittedUpdates.property_types) ? submittedUpdates.property_types : (Array.isArray(submittedUpdates.assetTypes) ? submittedUpdates.assetTypes : []),
      data: { ...(result.data?.data || {}), ...(submittedUpdates.data || {}) },
    }

    writeBuyerEditOverride(savedBuyer)
    updateBuyer(cleanId, savedBuyer as any)

    // BUYER_FORCE_GRID_UPDATE_AFTER_SAVE_V1
    // Force the visible Deal Blast Pro buyer grid/store to use the values just saved.
    // This prevents the card from staying on stale Supabase/local state after the toast says saved.
    useAppStore.setState((state: any) => {
      const savedEmail = String(savedBuyer?.email || '').trim().toLowerCase()

      return {
        buyers: (state.buyers || []).map((buyer: any) => {
          const sameId = String(buyer?.id || '') === cleanId
          const sameEmail = savedEmail && String(buyer?.email || '').trim().toLowerCase() === savedEmail

          if (!sameId && !sameEmail) return buyer

          return {
            ...buyer,
            ...savedBuyer,
            id: buyer?.id || savedBuyer.id || cleanId,
            name: savedBuyer.name || savedBuyer.buyerName || savedBuyer.fullName || buyer?.name,
            buyerName: savedBuyer.buyerName || savedBuyer.name || savedBuyer.fullName || buyer?.buyerName,
            fullName: savedBuyer.fullName || savedBuyer.name || savedBuyer.buyerName || buyer?.fullName,
            budgetMin: savedBuyer.budgetMin,
            budgetMax: savedBuyer.budgetMax,
            budget_min: savedBuyer.budget_min,
            budget_max: savedBuyer.budget_max,
            notes: firstMeaningfulBuyerText(savedBuyer.notes, buyer?.notes, buyer?.data?.notes),
            buyBox: firstMeaningfulBuyerText(savedBuyer.buyBox, savedBuyer.notes, buyer?.buyBox, buyer?.data?.buyBox),
            buy_box: firstMeaningfulBuyerText(savedBuyer.buy_box, savedBuyer.notes, buyer?.buy_box, buyer?.data?.buy_box),
            criteria: firstMeaningfulBuyerText(savedBuyer.criteria, savedBuyer.notes, buyer?.criteria, buyer?.data?.criteria),
            downPaymentMax: savedBuyer.downPaymentMax,
            downPayment: savedBuyer.downPayment,
            monthlyPaymentMax: savedBuyer.monthlyPaymentMax,
            monthlyPayment: savedBuyer.monthlyPayment,
            interestRateMax: savedBuyer.interestRateMax,
            interestRate: savedBuyer.interestRate,
            capRateTarget: savedBuyer.capRateTarget,
            capRate: savedBuyer.capRate,
            balloonTerm: savedBuyer.balloonTerm,
            creativeStructure: savedBuyer.creativeStructure,
            creative_structure: savedBuyer.creative_structure,
            bedRequirement: savedBuyer.bedRequirement,
            bathRequirement: savedBuyer.bathRequirement,
            unitRequirement: savedBuyer.unitRequirement,
            sqftRequirement: savedBuyer.sqftRequirement,
            squareFootageRequirement: savedBuyer.squareFootageRequirement,
            minSqft: savedBuyer.minSqft,
            assetTypes: Array.isArray(savedBuyer.assetTypes) ? savedBuyer.assetTypes : [],
            assetFocus: Array.isArray(savedBuyer.assetFocus) ? savedBuyer.assetFocus : (Array.isArray(savedBuyer.assetTypes) ? savedBuyer.assetTypes : []),
            asset_focus: Array.isArray(savedBuyer.asset_focus) ? savedBuyer.asset_focus : (Array.isArray(savedBuyer.assetTypes) ? savedBuyer.assetTypes : []),
            propertyTypes: Array.isArray(savedBuyer.propertyTypes) ? savedBuyer.propertyTypes : (Array.isArray(savedBuyer.assetTypes) ? savedBuyer.assetTypes : []),
            property_types: Array.isArray(savedBuyer.property_types) ? savedBuyer.property_types : (Array.isArray(savedBuyer.assetTypes) ? savedBuyer.assetTypes : []),
            data: { ...(buyer?.data || {}), ...(savedBuyer?.data || {}) },
            updatedAt: new Date().toISOString(),
          }
        })
      }
    })

    if (selectedBuyer?.id === cleanId) {
      setSelectedBuyer((current: any) => current ? ({ ...current, ...savedBuyer }) : savedBuyer as any)
      setEditBuyer((current: any) => ({ ...current, ...savedBuyer }))
    }

    if (successMessage) toast.success(successMessage)
    return true
  }

  const removeBuyersEverywhere = async (ids: any[], successMessage?: string) => {
    const cleanIds = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)))
    if (!cleanIds.length) return false

    const result = await deleteBuyersFromSupabase(cleanIds)
    if (!result.ok) {
      toast.error('Supabase delete failed: ' + result.error)
      return false
    }

    cleanIds.forEach(id => deleteBuyer(id))
    setSelectedBuyerIds(prev => prev.filter(id => !cleanIds.includes(id)))
    if (selectedBuyer && cleanIds.includes(selectedBuyer.id)) setSelectedBuyer(null)

    if (successMessage) toast.success(successMessage)
    return true
  }


  // BUYER_SUPABASE_HYDRATE_ON_PAGE_OPEN
  useEffect(() => {
    let cancelled = false

    const buyerKey = (buyer: any) =>
      safeLower(String(buyer?.email || buyer?.id || '').trim())

    const dedupeCloudBuyers = (rows: any[]) => {
      const map = new Map<string, any>()

      ;(rows || []).forEach((buyer: any) => {
        const key = buyerKey(buyer)
        if (!key) return

        const existing = map.get(key)

        if (!existing) {
          map.set(key, buyer)
          return
        }

        map.set(key, {
          ...existing,
          ...buyer,
          id: existing.id || buyer.id,
          email: existing.email || buyer.email,
          createdAt: existing.createdAt || buyer.createdAt || buyer.created_at,
          updatedAt: buyer.updatedAt || buyer.updated_at || existing.updatedAt,
        })
      })

      return Array.from(map.values())
    }

    ;(async () => {
      const result = await fetchBuyersFromSupabase()

      if (!result.ok) {
        if (effectivePlan !== 'Free Demo') {
          console.warn('[Deal Blast Pro] Supabase buyer load failed; keeping local buyers fallback:', result.error)
        }
        return
      }

      const cloudBuyers = applyBuyerEditOverrides(dedupeCloudBuyers(Array.isArray(result.data) ? result.data : []))

      if (!cancelled) {
        useAppStore.setState({ buyers: cloudBuyers as any })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectivePlan])

  const [search, setSearch] = useState('')
const [showImport, setShowImport] = useState(false)
  const [showAddBuyer, setShowAddBuyer] = useState(false)
  const [buyerPortalQueueCount, setBuyerPortalQueueCount] = useState(0)
  const [addBuyerMode, setAddBuyerMode] = useState<'quick' | 'manual' | 'detailed' | 'multi' | 'text'>('manual')
  const [buyerPasteText, setBuyerPasteText] = useState('')
  const [manualBuyer, setManualBuyer] = useState<any>({
    name: '',
    email: '',
    phone: '',
    company: '',
    type: '',
    status: 'Active',
    markets: [],
    assetTypes: [],
    strategies: [],
    otherStrategy: '',
    budgetMin: '',
    budgetMax: '',
    notes: '',
    proofFiles: [],
    uploadedFiles: []
  })
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pendingImport, setPendingImport] = useState<any[]>([]) // CSV/TXT/manual rows waiting for review/approve before any store write
  const [importReviewSearch, setImportReviewSearch] = useState('')
  const [importReviewFilter, setImportReviewFilter] = useState<'all' | 'valid' | 'invalid' | 'duplicate' | 'missingCriteria' | 'hot'>('all')
  const [collapsedImportRows, setCollapsedImportRows] = useState<Record<string, boolean>>({})
  const [importApprovalStatus, setImportApprovalStatus] = useState<Record<string, 'approving' | 'approved' | 'failed'>>({})
  const [importApprovalSummary, setImportApprovalSummary] = useState('')
  const [showPortalReview, setShowPortalReview] = useState(false)
  const [pendingPortalImport, setPendingPortalImport] = useState<any[]>([]) // buyer portal submissions only, kept separate from CSV/TXT imports
  const [portalApprovalStatus, setPortalApprovalStatus] = useState<Record<string, 'approving' | 'approved' | 'failed'>>({})
  const [portalApprovalSummary, setPortalApprovalSummary] = useState('')
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([])
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null) // Buyer profile drawer state
  const [editBuyer, setEditBuyer] = useState<any>({}) // for inline editing in drawer

  function hydrateBuyerForEdit(buyer: any) {
    const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
    const merged: any = { ...buyerData, ...buyer }

    const asArray = (...values: any[]) => {
      const out: string[] = []

      values.forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(v => out.push(String(v || '').trim()))
        } else if (typeof value === 'string') {
          value
            .split(/[|,;/\n]+/)
            .map(v => v.trim())
            .filter(Boolean)
            .forEach(v => out.push(v))
        }
      })

      return Array.from(new Set(out.filter(Boolean)))
    }

    const asMoney = (...values: any[]) => {
      for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_REASONABLE_BUYER_BUDGET) return value

        if (typeof value === 'string') {
          const cleaned = value.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
          const match = cleaned.match(/(\d+(?:\.\d+)?)(k|m)?/)
          if (!match) continue

          let n = Number(match[1])
          if (!Number.isFinite(n) || n <= 0) continue

          if (match[2] === 'k') n *= 1000
          if (match[2] === 'm') n *= 1000000

          if (n > MAX_REASONABLE_BUYER_BUDGET) continue
          return Math.round(n)
        }
      }

      return 0
    }

    const normalizeState = (value: any) => {
      const raw = String(value || '').trim()
      if (!raw) return ''

      const upper = raw.toUpperCase()
      const stateMatch = upper.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/)
      if (stateMatch) return stateMatch[1]

      if (/NATIONWIDE|NATIONAL|ANYWHERE|ALL MARKETS/.test(upper)) return 'Nationwide'

      return ''
    }

    const normalizeAsset = (value: any) => {
      const raw = String(value || '').trim()
      if (!raw) return ''

      const lower = raw.toLowerCase()

      if (['buyer','cash buyer','creative buyer','verified buyer','vip buyer','seller finance buyer','wholesaler','agent','broker','lender','other'].includes(lower)) return ''

      if (/\b(sfh|single family|single-family|sfr)\b/i.test(raw)) return 'SFH'
      if (/\b(multifamily|multi family|multi-family|apartment|apartments|units?)\b/i.test(raw)) return 'Multifamily'
      if (/\b(duplex|triplex|quad|fourplex)\b/i.test(raw)) return 'Small Multifamily'
      if (/\b(land|lot|acre|acres)\b/i.test(raw)) return 'Land'
      if (/\b(hotel|hospitality|motel)\b/i.test(raw)) return 'Hotel'
      if (/\b(retail|strip center|shopping center)\b/i.test(raw)) return 'Retail'
      if (/\b(office)\b/i.test(raw)) return 'Office'
      if (/\b(industrial|warehouse)\b/i.test(raw)) return 'Industrial'
      if (/\b(storage|self storage)\b/i.test(raw)) return 'Storage'
      if (/\b(mixed use|mixed-use)\b/i.test(raw)) return 'Mixed-Use'
      if (/\b(mobile home park|mhp|rv park)\b/i.test(raw)) return 'MHP'

      return ''
    }

    const marketSource = asArray(
      merged.markets,
      merged.targetMarkets,
      merged.target_markets,
      merged.states,
      merged.state,
      merged.locations,
      merged.market,
      merged.notes,
      merged.buyBox,
      merged.buy_box
    )

    const markets = Array.from(new Set(marketSource.map(normalizeState).filter(Boolean)))

    const assetSource = asArray(
      merged.assetTypes,
      merged.asset_types,
      merged.assetFocus,
      merged.asset_focus,
      merged.propertyTypes,
      merged.property_types,
      merged.propertyType,
      merged.asset,
      merged.assets,
      merged.notes,
      merged.buyBox,
      merged.buy_box
    )

    const assetTypes = Array.from(new Set(assetSource.map(normalizeAsset).filter(Boolean)))

    const strategyText = asArray(
      merged.strategy,
      merged.strategies,
      merged.exitStrategy,
      merged.exit_strategy,
      merged.investmentStrategy,
      merged.investment_strategy,
      merged.notes,
      merged.buyBox,
      merged.buy_box,
      merged.rawText,
      merged.criteria
    ).join(' ').toLowerCase()

    const isCreative = !!merged.creativeFinance || !!merged.sellerFinance || /creative|seller finance|owner finance|subject to|subto|sub-to|wrap|lease option|novation/.test(strategyText)
    const isCash = !!merged.cashBuyer || /cash|fix.?flip|flip|wholesale/.test(strategyText)

    const buyerType =
      merged.buyerType ||
      merged.buyer_type ||
      merged.type ||
      (isCreative ? 'Creative Buyer' : isCash ? 'Cash Buyer' : 'Buyer')

    const status = merged.status || merged.verificationStatus || 'Active'

    return {
      ...merged,
      name: merged.name || merged.buyerName || merged.buyer_name || merged.fullName || merged.full_name || '',
      email: merged.email || merged.Email || '',
      company: merged.company || merged.entity || merged.companyName || merged.company_name || '',
      phone: merged.phone || merged.mobile || merged.cell || merged.Phone || '',
      mobile: merged.mobile || merged.cell || '',
      type: buyerType,
      buyerType,
      markets,
      targetMarkets: markets,
      target_markets: markets,
      assetTypes,
      assetFocus: assetTypes,
      asset_focus: assetTypes,
      // BUYER_BUDGET_ZERO_FALLBACK_FIX_V2
      // Top-level edited budget wins only when it has a real positive value.
      // If top-level is 0/blank from old imports, fall back to nested data fields.
      budgetMin: normalizeBuyerBudgetMin(
        asMoney((buyer as any).budgetMin, (buyer as any).budget_min, (buyer as any).minBudget, (buyer as any).min_budget, (buyer as any).priceMin, (buyer as any).price_min) ||
        asMoney(buyerData.budgetMin, buyerData.budget_min, buyerData.minBudget, buyerData.min_budget, buyerData.priceMin, buyerData.price_min)
      ),
      budgetMax:
        asMoney((buyer as any).budgetMax, (buyer as any).budget_max, (buyer as any).maxBudget, (buyer as any).max_budget, (buyer as any).priceMax, (buyer as any).price_max, (buyer as any).budget, (buyer as any).maxPrice, (buyer as any).max_price) ||
        asMoney(buyerData.budgetMax, buyerData.budget_max, buyerData.maxBudget, buyerData.max_budget, buyerData.priceMax, buyerData.price_max, buyerData.budget, buyerData.maxPrice, buyerData.max_price),
      downPaymentMax: firstMeaningfulBuyerText((buyer as any).downPaymentMax, (buyer as any).downPayment, buyerData.downPaymentMax, buyerData.downPayment),
      downPayment: firstMeaningfulBuyerText((buyer as any).downPayment, (buyer as any).downPaymentMax, buyerData.downPayment, buyerData.downPaymentMax),
      monthlyPaymentMax: firstMeaningfulBuyerText((buyer as any).monthlyPaymentMax, (buyer as any).monthlyPayment, buyerData.monthlyPaymentMax, buyerData.monthlyPayment),
      monthlyPayment: firstMeaningfulBuyerText((buyer as any).monthlyPayment, (buyer as any).monthlyPaymentMax, buyerData.monthlyPayment, buyerData.monthlyPaymentMax),
      interestRateMax: firstMeaningfulBuyerText((buyer as any).interestRateMax, (buyer as any).interestRate, buyerData.interestRateMax, buyerData.interestRate),
      interestRate: firstMeaningfulBuyerText((buyer as any).interestRate, (buyer as any).interestRateMax, buyerData.interestRate, buyerData.interestRateMax),
      capRateTarget: firstMeaningfulBuyerText((buyer as any).capRateTarget, (buyer as any).capRate, buyerData.capRateTarget, buyerData.capRate),
      capRate: firstMeaningfulBuyerText((buyer as any).capRate, (buyer as any).capRateTarget, buyerData.capRate, buyerData.capRateTarget),
      balloonTerm: firstMeaningfulBuyerText((buyer as any).balloonTerm, (buyer as any).balloon, buyerData.balloonTerm, buyerData.balloon),
      creativeStructure: firstMeaningfulBuyerText((buyer as any).creativeStructure, (buyer as any).creative_structure, buyerData.creativeStructure, buyerData.creative_structure),
      creative_structure: firstMeaningfulBuyerText((buyer as any).creative_structure, (buyer as any).creativeStructure, buyerData.creative_structure, buyerData.creativeStructure),
      creativeFinance: isCreative,
      sellerFinance: !!merged.sellerFinance || /seller finance|owner finance/i.test(strategyText),
      cashBuyer: isCash,
      strategies: normalizeBuyerStrategies(merged),
      strategy: normalizeBuyerStrategies(merged).join(', '),
      exitStrategy: normalizeBuyerStrategies(merged).join(', '),
      investmentStrategy: normalizeBuyerStrategies(merged).join(', '),
      otherStrategy: merged.otherStrategy || merged.other_strategy || buyerData.otherStrategy || buyerData.other_strategy || '',
      status,
      verificationStatus: status,
      notes: firstMeaningfulBuyerText(
        buyer?.notes,
        buyerData?.notes,
        buyer?.buyBox,
        buyerData?.buyBox,
        buyer?.buy_box,
        buyerData?.buy_box,
        buyer?.criteria,
        buyerData?.criteria,
        buyer?.buyBoxSummary,
        buyerData?.buyBoxSummary,
        buyer?.buyerNotes,
        buyerData?.buyerNotes,
        buyer?.rawText,
        buyerData?.rawText
      ),
      buyBox: merged.buyBox || merged.buy_box || merged.notes || merged.criteria || merged.buyBoxSummary || merged.buy_box_summary || merged.rawText || '',
      buy_box: merged.buy_box || merged.buyBox || merged.notes || merged.criteria || merged.buyBoxSummary || merged.buy_box_summary || merged.rawText || '',
      criteria: merged.criteria || merged.notes || merged.buyBox || merged.buy_box || merged.rawText || '',
      bedRequirement: merged.bedRequirement || merged.bed_requirement || merged.beds || 'Any',
      bathRequirement: merged.bathRequirement || merged.bath_requirement || merged.baths || 'Any',
      unitRequirement: merged.unitRequirement || merged.unit_requirement || merged.units || 'Any',
      sqftRequirement: merged.sqftRequirement || merged.squareFootageRequirement || merged.square_footage_requirement || merged.minSqft || merged.min_sqft || ''
    }
  }

  // Buyer Custom Lists (localStorage persisted)
  const [buyerLists, setBuyerLists] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('dbp_buyer_lists')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showListModal, setShowListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [currentListId, setCurrentListId] = useState<string | null>(null) // for viewing a specific list

  // Sort & Filter state for Buyer DB
  const [sortMode, setSortMode] = useState('heat-high')
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // all | segments | lists
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null) // for viewing specific segment
  const [buyerPage, setBuyerPage] = useState(1)
  const [buyersPerPage, setBuyersPerPage] = useState(12)

  // Persist buyer lists
  React.useEffect(() => {
    try { localStorage.setItem('dbp_buyer_lists', JSON.stringify(buyerLists)) } catch {}
  }, [buyerLists])

  useEffect(() => {
    if (!selectedBuyer?.id) return
    const fresh = buyers.find(b => b.id === selectedBuyer.id)

    // BUYER_DRAWER_STABILITY_PATCH_V1
    // Do not auto-close the profile drawer if the Supabase buyer refresh briefly
    // does not contain the selected buyer. This was causing Review & Edit Profile
    // to flash open for a second and then disappear.
    if (!fresh) {
      return
    }

    const hydrated = hydrateBuyerForEdit(fresh)
    setSelectedBuyer((current: any) => current ? { ...current, ...hydrated } : hydrated as any)
    // Do not keep overwriting the edit form while the drawer is open.
    // This was making budget/notes fields change back while typing.
    setEditBuyer((current: any) => {
      if (!current?.id || current.id !== selectedBuyer.id) return hydrated
      return current
    })
  }, [buyers, selectedBuyer?.id])


  const normalizeDuplicateText = (value: any) => String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const normalizeDuplicatePhone = (value: any) => String(value ?? '').replace(/\D/g, '')

  const getDuplicateKeys = (buyer: any): string[] => {
    const keys: string[] = []
    const email = String(buyer?.email || '').trim().toLowerCase()
    const phone = normalizeDuplicatePhone(getDisplayPhone(buyer) || buyer?.phone)
    const name = normalizeDuplicateText(getDisplayName(buyer))
    const markets = getMarketDisplayList(
      buyer?.markets,
      buyer?.targetMarkets,
      buyer?.target_markets,
      buyer?.states,
      buyer?.locations,
      buyer?.target_states
    ).join('|').toLowerCase()

    if (email && email.includes('@')) keys.push('email:' + email)
    if (phone.length >= 7) keys.push('phone:' + phone.slice(-10))
    if (name && name !== 'buyer' && name !== 'name missing' && markets) keys.push('name_market:' + name + '|' + markets)

    return keys
  }

  const getDuplicateGroups = (buyerRows: any[]) => {
    const keyMap = new Map<string, any[]>()

    ;(buyerRows || []).forEach((buyer: any) => {
      getDuplicateKeys(buyer).forEach(key => {
        const rows = keyMap.get(key) || []
        rows.push(buyer)
        keyMap.set(key, rows)
      })
    })

    const seen = new Set<string>()
    const groups: Array<{ key: string; label: string; buyers: any[] }> = []

    keyMap.forEach((rows, key) => {
      const uniqueRows = rows.filter((row, index, arr) => row?.id && arr.findIndex(x => x?.id === row.id) === index)
      if (uniqueRows.length < 2) return

      const signature = uniqueRows.map(row => row.id).sort().join('|')
      if (seen.has(signature)) return
      seen.add(signature)

      const label = key.startsWith('email:')
        ? 'Same email: ' + key.replace('email:', '')
        : key.startsWith('phone:')
          ? 'Same phone: ' + key.replace('phone:', '')
          : 'Same name + market'

      groups.push({ key, label, buyers: uniqueRows })
    })

    return groups.sort((a, b) => b.buyers.length - a.buyers.length || a.label.localeCompare(b.label))
  }

  const mergeBuyerRecords = async (keeper: any, duplicateRows: any[]) => {
    const rows = [keeper, ...duplicateRows].filter(Boolean)
    const firstValue = (...values: any[]) => values.find(v => String(v ?? '').trim())
    const unionList = (...values: any[]) => Array.from(new Set(values.flatMap(value => {
      if (Array.isArray(value)) return value
      if (value === undefined || value === null) return []
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return []
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed
        } catch {}
        return trimmed.split(/[;,|]/g)
      }
      return [value]
    }).map(v => String(v || '').trim()).filter(Boolean)))

    const numberValues = (field: string) => rows.map(r => Number(r?.[field] || 0)).filter(n => Number.isFinite(n) && n > 0)
    const minBudgetValues = numberValues('budgetMin')
    const maxBudgetValues = numberValues('budgetMax')

    const duplicateIds = duplicateRows
      .map(row => String(row?.id || '').trim())
      .filter(id => id && id !== keeper.id)

    const merged: any = {
      ...keeper,
      name: cleanBuyerName(firstValue(keeper.name, ...rows.map(r => r.name), getDisplayName(keeper)), firstValue(keeper.email, ...rows.map(r => r.email))),
      email: firstValue(keeper.email, ...rows.map(r => r.email)),
      phone: firstValue(keeper.phone, ...rows.map(r => r.phone), ...rows.map(r => getDisplayPhone(r))),
      company: firstValue(keeper.company, ...rows.map(r => r.company), ...rows.map(r => getDisplayCompany(r))),
      type: firstValue(keeper.type, ...rows.map(r => r.type)),
      status: firstValue(keeper.status, ...rows.map(r => r.status)),
      verificationStatus: firstValue(keeper.verificationStatus, ...rows.map(r => r.verificationStatus)),
      markets: unionList(...rows.map(r => getMarketDisplayList(r.markets, r.targetMarkets, r.target_markets, r.states, r.locations, r.target_states))),
      assetTypes: unionList(...rows.map(r => r.assetTypes), ...rows.map(r => r.asset_types), ...rows.map(r => r.assetFocus), ...rows.map(r => r.asset_focus)),
      tags: unionList(...rows.map(r => r.tags)),
      creativeFinance: rows.some(r => !!r.creativeFinance),
      sellerFinance: rows.some(r => !!r.sellerFinance),
      budgetMin: minBudgetValues.length ? Math.min(...minBudgetValues) : keeper.budgetMin,
      budgetMax: maxBudgetValues.length ? Math.max(...maxBudgetValues) : keeper.budgetMax,
      notes: unionList(...rows.map(r => r.notes)).join('\n') || keeper.notes,
      updatedAt: new Date().toISOString(),
    }

    const updateResult = await updateBuyerInSupabase(keeper.id, merged)
    if (!updateResult.ok) {
      toast.error('Supabase merge update failed: ' + updateResult.error)
      return
    }

    if (duplicateIds.length) {
      const deleteResult = await deleteBuyersFromSupabase(duplicateIds)
      if (!deleteResult.ok) {
        toast.error('Supabase duplicate delete failed: ' + deleteResult.error)
        return
      }
    }

    updateBuyer(keeper.id, (updateResult.data || merged) as any)
    duplicateIds.forEach(id => deleteBuyer(id))

    setSelectedBuyerIds([])
    if (selectedBuyer && duplicateIds.includes(selectedBuyer.id)) setSelectedBuyer(null)
    toast.success('Merged ' + duplicateIds.length + ' duplicate' + (duplicateIds.length === 1 ? '' : 's') + ' and saved to Supabase')
  }

  const deleteDuplicateRecord = async (buyer: any) => {
    if (!buyer?.id) return
    if (confirm('Delete duplicate buyer "' + (getDisplayName(buyer) || buyer.email || 'this buyer') + '" from Supabase?')) {
      await removeBuyersEverywhere([buyer.id], 'Duplicate deleted from Supabase')
    }
  }

  const BED_REQUIREMENT_OPTIONS = ['Any', 'Studio', '1+', '2+', '3+', '4+', '5+']
  const BATH_REQUIREMENT_OPTIONS = ['Any', '1+', '1.5+', '2+', '2.5+', '3+', '4+']
  const UNIT_REQUIREMENT_OPTIONS = ['Any', '1+', '2+', '3+', '4+', '5+', '10+', '20+', '50+', '100+']

  const US_STATE_CODES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

  const extractBuyerField = (text: string, label: string) => {
    const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    const labelRegex = new RegExp(`^${label}\\s*:?\\s*(.*)$`, 'i')

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(labelRegex)
      if (!match) continue
      const inlineValue = (match[1] || '').trim()
      if (inlineValue) return inlineValue

      const collected: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^(name|email|phone|company|location\/?s?\s+of\s+interest|locations?|markets?|buy\s*box|price\s*range|budget|notes?)\s*:?/i.test(lines[j])) break
        collected.push(lines[j])
      }
      return collected.join(', ').trim()
    }

    return ''
  }

  const parseMoneyValue = (raw: string) => {
    const value = String(raw || '').trim().replace(/\$/g, '').replace(/,/g, '')
    const match = value.match(/(\d+(?:\.\d+)?)\s*([kKmM])?/)
    if (!match) return 0

    const num = Number(match[1])
    const suffix = safeLower(match[2] || '')
    if (suffix === 'm') return Math.round(num * 1000000)
    if (suffix === 'k') return Math.round(num * 1000)
    return Math.round(num)
  }


  const STATE_NAME_TO_CODE: Record<string, string> = {
    Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA',
    Colorado:'CO', Connecticut:'CT', Delaware:'DE',
  'district of columbia': 'DC', Florida:'FL', Georgia:'GA',
    Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA',
    Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD',
    Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO',
    Montana:'MT', Nebraska:'NE', Nevada:'NV', Ohio:'OH', Oklahoma:'OK',
    Oregon:'OR', Pennsylvania:'PA', Tennessee:'TN', Texas:'TX', Utah:'UT',
    Vermont:'VT', Virginia:'VA', Washington:'WA', Wisconsin:'WI', Wyoming:'WY',
    'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY',
    'North Carolina':'NC', 'North Dakota':'ND', 'Rhode Island':'RI',
    'South Carolina':'SC', 'South Dakota':'SD', 'West Virginia':'WV'
  }

  const extractSpecificStateMarkets = (value: any, allowLooseCodes = false): string[] => {
    const text = Array.isArray(value) ? value.join(' ') : String(value || '')
    const found = new Set<string>()

    Object.entries(STATE_NAME_TO_CODE).forEach(([name, code]) => {
      if (new RegExp('\\b' + name.replace(/ /g, '\\s+') + '\\b', 'i').test(text)) found.add(code)
    })

    // Trust short state codes only in explicit market/location strings.
    if (allowLooseCodes) {
      US_STATE_CODES.forEach(code => {
        const re = new RegExp('(?:^|[^A-Za-z])' + code + '(?:$|[^A-Za-z])')
        if (re.test(text)) found.add(code)
      })
    }

    return Array.from(found)
  }

  const hasNationwideLanguage = (value: any) =>
    /\b(nationwide|national|anywhere|all\s+states|all\s+markets|any\s+state|any\s+market)\b/i.test(String(value || ''))

  const normalizeExplicitMarkets = (value: any, fallbackText: any = ''): string[] => {
    const explicitText = Array.isArray(value) ? value.join(' ') : String(value || '')
    const fallback = Array.isArray(fallbackText) ? fallbackText.join(' ') : String(fallbackText || '')

    const explicitStates = extractSpecificStateMarkets(explicitText, true)
    const fallbackStates = extractSpecificStateMarkets(fallback, false)

    const states = Array.from(new Set([...explicitStates, ...fallbackStates]))
    if (states.length) return states

    if (hasNationwideLanguage(explicitText) || (!explicitText && hasNationwideLanguage(fallback))) return ['Nationwide']

    const manual = explicitText
      .split(/[,;|/]+/)
      .map(x => x.trim())
      .filter(x => x && !/^(nationwide|any)$/i.test(x))

    return manual
  }

  const KNOWN_NAME_PART_FIXES: Record<string, string> = {
    garciare: 'Garcia',
    gaciare: 'Garcia',
    russelll: 'Russell',
    griffth: 'Griffith',
  }

  const autoCapBuyerName = (value: any) => {
    const raw = String(value || '').replace(/\s+/g, ' ').trim()
    if (!raw) return ''

    const upperWords = new Set(['llc', 'inc', 'corp', 'co', 'lp', 'llp', 'pllc', 'gkw', 'des', 'usa', 'rei'])
    const smallWords = new Set(['of', 'and', 'the'])

    return raw
      .split(' ')
      .filter(Boolean)
      .map((word, index) => {
        const lower = safeLower(word)

        if (upperWords.has(lower)) return lower.toUpperCase()
        if (index > 0 && smallWords.has(lower)) return lower

        return lower
          .split(/([-'ï¿½])/)
          .map((piece: any) => {
            if (piece === '-' || piece === "'" || piece === 'ï¿½') return piece
            if (!piece) return piece
            return piece.charAt(0).toUpperCase() + piece.slice(1)
          })
          .join('')
      })
      .join(' ')
      .trim()
  }


  const splitEmailUsernameName = (emailValue: any) => {
    const email = String(emailValue || '').trim().toLowerCase();
    const match = email.match(/^([^@]+)@/);
    if (!match) return '';

    const local = match[1]
      .replace(/\+.*/, '')
      .replace(/\d+$/g, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!local) return '';

    const generic = new Set([
      'info', 'admin', 'administrator', 'contact', 'hello', 'team', 'office',
      'support', 'sales', 'deals', 'deal', 'acquisitions', 'acquisition',
      'buyers', 'buyer', 'investors', 'investor', 'dispo', 'offers',
      'properties', 'property', 'realestate', 'realty', 'homes', 'home',
      'marketing', 'operations', 'ops', 'management', 'mail'
    ]);

    const compact = local.replace(/\s+/g, '');
    if (generic.has(compact)) return '';

    return local
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };
  void KNOWN_NAME_PART_FIXES;

const cleanBuyerName = (value: any, emailValue = '') => {
  const rawName = String(value ?? '').trim();
  const email = String(emailValue ?? '').trim().toLowerCase();

  const genericNameWords = new Set([
    'info', 'admin', 'administrator', 'contact', 'hello', 'team', 'office',
    'support', 'sales', 'deals', 'deal', 'acquisitions', 'acquisition',
    'buyers', 'buyer', 'investors', 'investor', 'dispo', 'offers',
    'properties', 'property', 'realestate', 'realty', 'homes', 'home',
    'marketing', 'operations', 'ops', 'management', 'mail',
    'info team', 'deals team', 'sales team', 'admin team', 'acquisition team',
    'acquisitions team', 'buyer team', 'buyers team'
  ]);

  const titleCase = (input: string) =>
    String(input || '')
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(word => {
        const lower = word.toLowerCase();
        if (['llc', 'inc', 'lp', 'llp', 'rei', 'usa', 'dc'].includes(lower)) return lower.toUpperCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');

  const splitKnownBusinessWords = (input: string) => {
    let text = String(input || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!text) return '';

    const emailProviders = new Set([
      'gmail','yahoo','hotmail','outlook','icloud','aol','protonmail','msn',
      'live','me','comcast','att','verizon'
    ]);
    if (emailProviders.has(text)) return '';

    const words = [
      'capital','stay','holdings','holding','properties','property','investments',
      'investment','investors','investor','buyers','buyer','homes','home',
      'house','houses','realty','real','estate','group','partners','partner',
      'solutions','solution','ventures','venture','equity','wealth','cash',
      'land','fund','funding','acquisitions','acquisition','elevations',
      'entertainment','movies','realtors','realtor','wholesale','wholesaling',
      'development','developers','developer','management','mgmt','loans','loan',
      'capital','financial','finance','lending','holdings','property'
    ];

    for (const w of words) {
      text = text.replace(new RegExp(w, 'g'), ' ' + w + ' ');
    }

    return titleCase(text.replace(/\s+/g, ' ').trim());
  };

  const getEmailParts = () => {
    const match = email.match(/^([^@]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!match) return { local: '', domainRoot: '' };

    const local = match[1]
      .replace(/\+.*/, '')
      .replace(/\d+$/g, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const domainRoot = match[2]
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/\d+$/g, '')
      .trim();

    return { local, domainRoot };
  };

  const fromEmail = () => {
    const { local, domainRoot } = getEmailParts();
    const compactLocal = local.toLowerCase().replace(/\s+/g, '');
    const domainName = splitKnownBusinessWords(domainRoot);

    if (genericNameWords.has(compactLocal)) return domainName;

    if (local && !genericNameWords.has(compactLocal)) {
      return titleCase(local);
    }

    return domainName;
  };

  const isBadSavedName = (name: string) => {
    const n = String(name || '').trim();
    const lower = n.toLowerCase().replace(/\s+/g, ' ');
    const compact = lower.replace(/\s+/g, '');

    if (!n) return true;
    if (genericNameWords.has(lower) || genericNameWords.has(compact)) return true;

    // Market/location names should not become buyer names.
    if (/\b(memphis|pittsburgh|birmingham|cleveland|atlanta|dallas|houston|miami|jacksonville|chicago|nationwide|any)\b/i.test(n)) return true;
    if (/^[A-Z]{2}$/i.test(n)) return true;
    if (/^[A-Z]{2}\s+[A-Z]{2}$/i.test(n)) return true;

    // Strategy/field labels should not become buyer names.
    if (/\b(cash buyer|seller finance|creative only|target markets?|asset focus|company missing|phone missing)\b/i.test(n)) return true;

    return false;
  };

  const emailDerived = fromEmail();

  if (isBadSavedName(rawName)) {
    return emailDerived || titleCase(rawName);
  }

  return titleCase(rawName);
};const formatDownPaymentField = (value: any) => {
    const n = parseMoneyValue(String(value || ''))
    return n ? '$' + Math.round(n).toLocaleString() : String(value || '').replace(/\.0\b/g, '')
  }

  const formatMonthlyPaymentField = (value: any) => {
    const n = parseMoneyValue(String(value || ''))
    return n ? '$' + Math.round(n).toLocaleString() + '/mo' : String(value || '').replace(/\.0\b/g, '')
  }

  const normalizeRequirementOption = (value: any, options: string[]) => {
    const raw = String(value || '').trim()
    if (!raw) return 'Any'

    const clean = raw
      .replace(/bed(?:room)?s?/gi, '')
      .replace(/bath(?:room)?s?/gi, '')
      .replace(/units?|doors?/gi, '')
      .replace(/\s+/g, '')
      .trim()

    if (!clean || /^(any|none|nopreference|n\/a|na)$/i.test(clean)) return 'Any'

    if (/studio/i.test(raw)) {
      return options.includes('Studio') ? 'Studio' : 'Any'
    }

    const normalized = /^\d+(?:\.5)?$/.test(clean) ? clean + '+' : clean
    const exact = options.find(option => safeLower(option) === safeLower(normalized))
    return exact || 'Any'
  }

  const normalizeUnitRequirementFromNumber = (value: any) => {
    const n = Number(String(value || '').replace(/[^0-9]/g, ''))
    if (!n) return 'Any'
    if (n >= 100) return '100+'
    if (n >= 50) return '50+'
    if (n >= 20) return '20+'
    if (n >= 10) return '10+'
    if (n >= 5) return '5+'
    if (n >= 4) return '4+'
    if (n >= 3) return '3+'
    if (n >= 2) return '2+'
    return '1+'
  }

  const parsePropertyRequirements = (textValue: any) => {
    const raw = String(textValue || '')
    const text = safeLower(raw).replace(/[ï¿½ï¿½]/g, '-')

    let bedRequirement = 'Any'
    let bathRequirement = 'Any'
    let unitRequirement = 'Any'

    // Studio
    if (/\bstudio\b/i.test(text)) {
      bedRequirement = 'Studio'
    }

    // Common residential shorthand: 3/2, 3 / 2, 3-2, 3br/2ba, 3 bed 2 bath
    const slashBedBath =
      text.match(/\b(\d+)\s*(?:br|bd|bed|beds|bedroom|bedrooms)?\s*[\/x-]\s*(\d+(?:\.5)?)\s*(?:ba|bath|baths|bathroom|bathrooms)?\b/i)

    if (slashBedBath?.[1] && slashBedBath?.[2]) {
      bedRequirement = normalizeRequirementOption(slashBedBath[1] + '+', BED_REQUIREMENT_OPTIONS)
      bathRequirement = normalizeRequirementOption(slashBedBath[2] + '+', BATH_REQUIREMENT_OPTIONS)
    }

    const bedMatch =
      text.match(/\b(\d+)\s*\+?\s*(?:br|bd|bed|beds|bedroom|bedrooms)\b/i) ||
      text.match(/\b(?:br|bd|bed|beds|bedroom|bedrooms)\s*[:\-]?\s*(\d+)\s*\+?/i)

    if (bedMatch?.[1]) {
      bedRequirement = normalizeRequirementOption(bedMatch[1] + '+', BED_REQUIREMENT_OPTIONS)
    }

    const bathMatch =
      text.match(/\b(\d+(?:\.5)?)\s*\+?\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i) ||
      text.match(/\b(?:ba|bath|baths|bathroom|bathrooms)\s*[:\-]?\s*(\d+(?:\.5)?)\s*\+?/i)

    if (bathMatch?.[1]) {
      bathRequirement = normalizeRequirementOption(bathMatch[1] + '+', BATH_REQUIREMENT_OPTIONS)
    }

    // Multifamily / unit preferences
    const unitMatch =
      text.match(/\b(\d+)\s*\+?\s*(?:unit|units|door|doors)\b/i) ||
      text.match(/\b(?:unit|units|door|doors)\s*[:\-]?\s*(\d+)\s*\+?/i)

    if (unitMatch?.[1]) {
      unitRequirement = normalizeUnitRequirementFromNumber(unitMatch[1])
    }

    // Property-type clues
    if (/\bduplex\b/i.test(text)) unitRequirement = unitRequirement === 'Any' ? '2+' : unitRequirement
    if (/\btriplex\b/i.test(text)) unitRequirement = unitRequirement === 'Any' ? '3+' : unitRequirement
    if (/\bquad\b|\bfourplex\b/i.test(text)) unitRequirement = unitRequirement === 'Any' ? '4+' : unitRequirement
    if (/\bsmall\s*multi(?:family)?\b|\b2\s*-\s*4\b|\b1\s*-\s*4\b/i.test(text)) {
      unitRequirement = unitRequirement === 'Any' ? '2+' : unitRequirement
    }

    return { bedRequirement, bathRequirement, unitRequirement }
  }

  const normalizeBuyerReviewRow = (row: any) => ({
    ...row,
    name: cleanBuyerName(row.name || row.Name || row.fullName || row.buyerName, row.email || row.Email || row['Email Address'] || ''),
    markets: normalizeExplicitMarkets(row.markets || row.market || row.Markets || row.Market || row.location || row.locations, row.notes || row.Notes || row.buyBox || row['Buy Box'] || row.rawText),
    downPaymentMax: formatDownPaymentField(row.downPaymentMax || row['Down Payment Max'] || row.downPayment || row.DP),
    monthlyPaymentMax: formatMonthlyPaymentField(row.monthlyPaymentMax || row['Monthly Payment Max'] || row.monthlyPayment || row.monthlyBudget),
  })

  const isValidBuyerEmail = (value: any) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())


  const normalizeImportedMarkets = (value: any): string[] => {
    return normalizeExplicitMarkets(value)
  }

  const parseCreativeTerms = (text: string) => {
    const raw = String(text || '').replace(/[â€“â€”]/g, '-')

    const normalizeMoneyMax = (value: string) => {
      const v = String(value || '').trim()
      if (!v) return ''
      const moneyMatches = Array.from(
        v.matchAll(/\$\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?|\d[\d,]*(?:\.\d+)?\s*[kKmM]/g)
      ).map(m => m[0].trim())
      if (!moneyMatches.length) return ''
      return moneyMatches[moneyMatches.length - 1]
    }

    const normalizePercentMax = (value: string) => {
      const v = String(value || '').trim()
      if (!v) return ''
      const nums = Array.from(v.matchAll(/\d+(?:\.\d+)?/g)).map(m => Number(m[0]))
      if (!nums.length) return ''
      return nums[nums.length - 1] + '%'
    }

    const normalizeBalloonMax = (value: string) => {
      const v = String(value || '').trim()
      if (!v) return ''
      const nums = Array.from(v.matchAll(/\d+/g)).map(m => Number(m[0]))
      if (!nums.length) return ''
      return nums[nums.length - 1] + ' years'
    }

    const normalizeCapMax = (value: string) => {
      const v = String(value || '').trim()
      if (!v) return ''
      const nums = Array.from(v.matchAll(/\d+(?:\.\d+)?/g)).map(m => Number(m[0]))
      if (!nums.length) return ''
      return nums[nums.length - 1] + '% cap'
    }

    const downRaw =
      raw.match(/(?:down payment|down|dp)\s*[:\-]?\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?(?:\s*-\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)?/i)?.[0] ||
      raw.match(/\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?(?:\s*-\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)?\s*(?:down payment|down|dp)/i)?.[0] || ''

    const monthlyRaw =
      raw.match(/(?:monthly payment|monthly budget|monthly|per month|\/\s*mo|\/\s*mth|mo|mth)\s*[:\-]?\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?/i)?.[0] ||
      raw.match(/\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?\s*(?:\/\s*mo|\/\s*mth|per month|monthly|mo|mth)/i)?.[0] || ''

    const interestRaw =
      raw.match(/(?:interest rate|rate|interest)\s*[:\-]?\s*\d+(?:\.\d+)?\s*%?(?:\s*-\s*\d+(?:\.\d+)?\s*%?)?/i)?.[0] ||
      raw.match(/\d+(?:\.\d+)?\s*%?(?:\s*-\s*\d+(?:\.\d+)?\s*%?)?\s*(?:interest|rate)/i)?.[0] || ''

    const balloonRaw =
      raw.match(/(?:balloon term|balloon)\s*[:\-]?\s*\d+\s*(?:-\s*\d+\s*)?(?:year|yr|yrs|years|month|mo|mos|months)?/i)?.[0] ||
      raw.match(/\d+\s*(?:-\s*\d+\s*)?(?:year|yr|yrs|years|month|mo|mos|months)\s*(?:balloon|term)?/i)?.[0] || ''

    const capRaw =
      raw.match(/(?:cap rate target|target cap|cap rate|cap)\s*[:\-]?\s*\d+(?:\.\d+)?\s*%?(?:\s*-\s*\d+(?:\.\d+)?\s*%?)?/i)?.[0] ||
      raw.match(/\d+(?:\.\d+)?\s*%?(?:\s*-\s*\d+(?:\.\d+)?\s*%?)?\s*(?:cap|cap rate)/i)?.[0] || ''

    const structures = []
    if (/seller\s*financ(?:e|ing)/i.test(raw)) structures.push('Seller Finance')
    if (/owner\s*financ(?:e|ing)/i.test(raw)) structures.push('Owner Finance')
    if (/subject[ -]?to|subto|sub-to/i.test(raw)) structures.push('Subject-To')
    if (/wrap/i.test(raw)) structures.push('Wrap')
    if (/lease option/i.test(raw)) structures.push('Lease Option')
    if (/rent to own|rto/i.test(raw)) structures.push('Rent To Own')
    if (/contract for deed/i.test(raw)) structures.push('Contract For Deed')
    if (/creative/i.test(raw)) structures.push('Creative Finance')

    return {
      downPaymentMax: normalizeMoneyMax(downRaw),
      monthlyPaymentMax: normalizeMoneyMax(monthlyRaw),
      interestRateMax: normalizePercentMax(interestRaw),
      balloonTerm: normalizeBalloonMax(balloonRaw),
      capRateTarget: normalizeCapMax(capRaw),
      creativeStructure: Array.from(new Set(structures)).join(', ')
    }
  }

  const parseBudgetRange = (text: string) => {
    const raw = String(text || '')
    const cleaned = raw
      .replace(/\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?\s*(?:\/\s*mo|\/\s*mth|per month|monthly|mo|mth)/gi, '')
      .replace(/\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?\s*(?:down payment|down|dp)/gi, '')
      .replace(/\d+(?:\.\d+)?\s*%\s*(?:interest|rate|cap|cap rate)?/gi, '')
      .replace(/\d+\s*(?:year|yr|yrs|years)\s*(?:balloon|term)?/gi, '')

    const values = Array.from(cleaned.matchAll(/\$?\s*\d+(?:\.\d+)?\s*[kKmM]?/g))
      .map(m => parseMoneyValue(m[0]))
      .filter(n => n > 0)

    const purchaseLanguage = /budget|price|purchase|asking|buy|acquisition|up to|max|under|less than|range|=|</i.test(cleaned)
    if (!values.length || !purchaseLanguage) return { budgetMin: 0, budgetMax: 0 }
    if (values.length === 1) return { budgetMin: 0, budgetMax: values[0] }
    return { budgetMin: Math.min(...values), budgetMax: Math.max(...values) }
  }

  const detectMarkets = (text: string) => {
    const upper = String(text || '').toUpperCase()
    const markets = new Set<string>()

    US_STATE_CODES.forEach(st => {
      const stateRegex = new RegExp(`\\b${st}\\b`, 'i')
      if (stateRegex.test(upper)) markets.add(st)
    })

    const stateNames: Record<string, string> = {
      Pennsylvania: 'PA',
      'South Carolina': 'SC',
      Florida: 'FL',
      Alabama: 'AL',
      Arkansas: 'AR',
      Tennessee: 'TN',
      Georgia: 'GA',
      Texas: 'TX',
      Ohio: 'OH',
      Virginia: 'VA',
      Wisconsin: 'WI',
      'North Carolina': 'NC',
      Louisiana: 'LA',
      Illinois: 'IL',
      California: 'CA',
      'New York': 'NY',
    }

    Object.entries(stateNames).forEach(([name, code]) => {
      if (new RegExp(`\\b${name}\\b`, 'i').test(text)) markets.add(code)
    })

    if (/nationwide|anywhere|all states/i.test(text)) markets.add('Nationwide')

    return Array.from(markets)
  }
  void detectMarkets

  const detectAssetTypes = (text: string) => {
    const assets = new Set<string>()
    const lower = String(text || '')

    if (/\b1\s*[-to]+\s*4\b|1-4|one\s*to\s*four|single\s*family|sfh|sfr/i.test(lower)) {
      assets.add('SFH')
      assets.add('Small Multifamily')
    }
    if (/duplex|triplex|quad|fourplex|small multifamily|small multi/i.test(lower)) assets.add('Small Multifamily')
    if (/multi[\s-]*family|multifamily|apartment|units/i.test(lower)) assets.add('Multifamily')
    if (/land|lot|acre/i.test(lower)) assets.add('Land')
    if (/hotel|motel|hospitality|ihg|hilton/i.test(lower)) assets.add('Hotel')
    if (/retail|storefront/i.test(lower)) assets.add('Retail')
    if (/office/i.test(lower)) assets.add('Office')
    if (/industrial|warehouse/i.test(lower)) assets.add('Industrial')
    if (/storage|self storage/i.test(lower)) assets.add('Storage')
    if (/mixed use|mixed-use/i.test(lower)) assets.add('Mixed Use')
    if (/mobile home park|mhp|rv park/i.test(lower)) assets.add('Mobile Home Park')

    return Array.from(assets)
  }

  const parseBuyerTextBlock = (text: string) => {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() || ''
    const nameField = extractBuyerField(text, 'Name')
    const emailPrefixName = email ? email.split('@')[0].replace(/[._-]+/g, ' ') : ''
    const locationText =
      extractBuyerField(text, 'Location\/?s? of Interest') ||
      extractBuyerField(text, 'Locations') ||
      extractBuyerField(text, 'Markets')
    const buyBoxText = extractBuyerField(text, 'Buy Box')
    const priceRangeText =
      extractBuyerField(text, 'Price Range') ||
      extractBuyerField(text, 'Budget')
    const company = extractBuyerField(text, 'Company')
    const phone = extractBuyerField(text, 'Phone')
    const combined = [text, locationText, buyBoxText, priceRangeText].filter(Boolean).join('\\n')
    const isCreative = /seller\s*financ(?:e|ing)|owner\s*financ(?:e|ing)|subto|subject\s*to|creative|wrap|lease\s*option|rent\s*to\s*own|rto|novation|balloon|down\s*payment|interest/i.test(combined)
    const budget = parseBudgetRange(priceRangeText || combined)
    const markets = normalizeExplicitMarkets(locationText, combined)
    const assetTypes = detectAssetTypes(buyBoxText || combined)
    const creativeTerms = parseCreativeTerms(combined)
    const strategies = normalizeBuyerStrategies({ notes: text, buyBox: buyBoxText, rawText: combined })

    return {
      name: cleanBuyerName(nameField || emailPrefixName, email),
      email,
      phone,
      company,
      type: /hedge/i.test(combined) ? 'Hedge Fund' : isCreative ? 'Creative Buyer' : 'Cash Buyer',
      markets: markets.length ? markets : [],
      assetTypes: assetTypes.length ? assetTypes : [],
      strategies,
      strategy: strategies.join(', '),
      exitStrategy: strategies.join(', '),
      investmentStrategy: strategies.join(', '),
      budgetMin: budget.budgetMin || undefined,
      budgetMax: budget.budgetMax || undefined,
      notes: text.trim(),
      status: 'Active' as const,
      sellerFinance: /seller\s*financ(?:e|ing)|owner\s*financ(?:e|ing)/i.test(combined) || strategies.includes('Seller Finance'),
      creativeFinance: isCreative || strategies.some(strategy => ['Creative Finance', 'Seller Finance', 'Subject To', 'Wrap', 'Lease Option', 'Novation'].includes(strategy)),
      ...creativeTerms,
      tags: [
        ...(/class\s*c\+?/i.test(combined) ? ['Class C+'] : []),
        ...(/class\s*b/i.test(combined) ? ['Class B'] : [])
      ]
    }
  }

  const savePastedBuyers = () => {
    const raw = buyerPasteText.trim()
    if (!raw) {
      toast.error('Paste buyer text first')
      return
    }

    const emailCount = (raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length
    const blocks = emailCount <= 1
      ? [raw]
      : raw
          .split(/\n\s*\n|(?=Name\s*:)|(?=\S+@\S+\.\S+)/i)
          .map(x => x.trim())
          .filter(Boolean)

    const parsed = blocks
      .map(parseBuyerTextBlock)
      .filter(b => b.email)

    if (parsed.length === 0) {
      toast.error('No valid buyer emails found')
      return
    }

    const rowsForReview = parsed.map((b: any) => ({
      ...b,
      _id: 'tmp_' + Date.now() + Math.random().toString(36).slice(2),
      _valid: true,
      _dup: buyers.some((x: any) => safeLower(x.email || '') === safeLower(b.email || ''))
    }))

    setPendingImport(rowsForReview)
    setImportResult(null)
    setBuyerPasteText('')
    setShowAddBuyer(false)
    setShowImport(true)
    toast.success(rowsForReview.length + ' parsed buyer' + (rowsForReview.length === 1 ? '' : 's') + ' ready for review')
  }

  const saveManualBuyer = () => {
    if (!manualBuyer.email || !manualBuyer.name) {
      toast.error('Name and email are required')
      return
    }

    const buyerForReview = {
      ...manualBuyer,
      _id: 'tmp_' + Date.now() + Math.random().toString(36).slice(2),
      markets: Array.isArray(manualBuyer.markets) ? manualBuyer.markets : String(manualBuyer.markets || '').split(',').map((x:string)=>x.trim()).filter(Boolean),
      assetTypes: Array.isArray(manualBuyer.assetTypes) ? manualBuyer.assetTypes : String(manualBuyer.assetTypes || '').split(',').map((x:string)=>x.trim()).filter(Boolean),
      ...buildBuyerStrategyUpdate(manualBuyer),
      budgetMin: Number(manualBuyer.budgetMin) || 0,
      budgetMax: Number(manualBuyer.budgetMax) || 0,
      proofFiles: getBuyerProofFiles(manualBuyer),
      uploadedFiles: getBuyerProofFiles(manualBuyer),
      status: manualBuyer.status || 'Active',
      _valid: true,
      _dup: buyers.some((x: any) => safeLower(x.email || '') === String(manualBuyer.email || ''))
    }

    setPendingImport([buyerForReview])
    setImportResult(null)
    setShowAddBuyer(false)
    setShowImport(true)
    toast.success('Buyer ready for review')

    setManualBuyer({
      name: '',
      email: '',
      phone: '',
      company: '',
      type: '',
      status: 'Active',
      markets: [],
      assetTypes: [],
      strategies: [],
      otherStrategy: '',
      budgetMin: '',
      budgetMax: '',
      notes: '',
      proofFiles: [],
      uploadedFiles: []
    })
  }

  const toggleManualBuyerArray = (field: 'markets' | 'assetTypes', value: string) => {
    const current = Array.isArray(manualBuyer[field]) ? manualBuyer[field] : []
    const next = current.includes(value) ? current.filter((x:string) => x !== value) : [...current, value]
    setManualBuyer({ ...manualBuyer, [field]: next })
  }

  const refreshBuyerPortalQueueCount = async () => {
    try {
      setBuyerPortalQueueCount(await countPendingBuyerPortalSubmissions())
    } catch (error) {
      console.error('Could not refresh buyer portal submission count:', error)
      setBuyerPortalQueueCount(0)
    }
  }

  useEffect(() => {
    void refreshBuyerPortalQueueCount()
    const id = window.setInterval(() => { void refreshBuyerPortalQueueCount() }, 3000)
    return () => window.clearInterval(id)
  }, [])

  const importBuyerPortalQueue = async () => {
    try {
      const queue = await listPendingBuyerPortalSubmissions()

      if (!Array.isArray(queue) || queue.length === 0) {
        setPendingPortalImport([])
        setShowPortalReview(false)
        toast.info('No buyer portal submissions waiting for review')
        void refreshBuyerPortalQueueCount()
        return
      }

      const rowsForReview = queue.map((submission: any, index: number) => {
        const buyer = submission.buyer_data || {}

        return {
          ...normalizeBuyerReviewRow(buyer),
          _id: buyer._id || buyer.id || 'buyer_portal_' + Date.now() + '_' + index,
          _valid: isValidBuyerEmail(buyer.email),
          _error: isValidBuyerEmail(buyer.email) ? '' : 'Valid email is required for approval.',
          _dup: false,
          _merge: false,
          buyerPortalSubmission: buyer,
          rawPortalSubmission: submission,
          buyerPortalSubmissionId: submission.id,
          proofFiles: Array.isArray(buyer.proofFiles) ? buyer.proofFiles : [],
          uploadedFiles: Array.isArray(buyer.uploadedFiles) ? buyer.uploadedFiles : Array.isArray(buyer.proofFiles) ? buyer.proofFiles : [],
          status: buyer.status || 'Submitted / Pending Review',
          verificationStatus: buyer.verificationStatus || 'Submitted / Pending Review',
          blastEligible: true,
          tags: Array.from(new Set([...(buyer.tags || []), 'Buyer Portal', 'Verified Buyer']))
        }
      })

      setPendingPortalImport(rowsForReview)
      setPortalApprovalStatus({})
      setPortalApprovalSummary('')
      setShowPortalReview(true)

      void refreshBuyerPortalQueueCount()

      toast.success(queue.length + ' buyer portal submission' + (queue.length === 1 ? '' : 's') + ' ready for review')
    } catch (error) {
      console.error(error)
      toast.error('Could not import buyer portal submissions from Supabase')
    }
  }

  const closeBuyerReview = () => {
    setShowPortalReview(false)
  }

  const toggleBuyerSelection = (id: string) => {
    setSelectedBuyerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  }

  // Base buyer set per user's spec: tab + selection first, then search/sort/filters on top
  let baseBuyers = buyers;

  if (activeTab === 'lists' && currentListId) {
    const list = buyerLists.find(l => l.id === currentListId);
    baseBuyers = buyers.filter(b => list && (list.buyerIds || []).includes(b.id));
  } else if (activeTab === 'segments' && selectedSegment) {
    const seg = [
      { name: 'Alabama Buyers', filter: (b: any) => (b.markets ?? []).some((m: any) => m.includes('AL')) },
      { name: 'Nationwide Buyers', filter: (b: any) => (b.markets ?? []).some((m: any) => ['Nationwide','Any'].includes(m)) },
      { name: 'Creative Finance Buyers', filter: (b: any) => b.creativeFinance || b.sellerFinance },
      { name: 'Seller Finance Buyers', filter: (b: any) => b.sellerFinance },
      { name: 'Fix & Flip Buyers', filter: (b: any) => normalizeBuyerStrategies(b).includes('Fix & Flip') },
      { name: 'Buy & Hold Buyers', filter: (b: any) => normalizeBuyerStrategies(b).includes('Buy & Hold') },
      { name: 'Cash Buyers', filter: (b: any) => !b.creativeFinance && !b.sellerFinance },
      { name: 'Hot Buyers', filter: (b: any) => b.status === 'Hot' },
      { name: 'High Budget Buyers', filter: (b: any) => (b.budgetMax || 0) >= 1000000 },
      { name: 'Multifamily Buyers', filter: (b: any) => (b.assetTypes ?? []).includes('Multifamily') },
    ].find(s => s.name === selectedSegment);
    if (seg) baseBuyers = buyers.filter(seg.filter);
  } else {
    baseBuyers = buyers;
  }


  const duplicateGroups = getDuplicateGroups(buyers as any[])
  const duplicateBuyerIds = new Set(duplicateGroups.flatMap(group => group.buyers.map((buyer: any) => buyer.id)))
  const duplicateRecordCount = duplicateGroups.reduce((total, group) => total + group.buyers.length, 0)
  const pendingReviewCount = buyerPortalQueueCount
  const newBuyerCount = buyers.filter((b: any) => isNewBuyer(b.id)).length

  // Apply search on the correct base
  let workingBuyers = baseBuyers.filter((b: any) => {
    const q = String(search || '').toLowerCase().trim();
    if (!q) return true;

    const asText = (value: any): string => {
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) return value.map(asText).join(' ');
      if (typeof value === 'object') return '';
      return String(value);
    };

    const parseMaybeList = (value: any): string => {
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) return value.map(asText).join(' ');
      if (typeof value !== 'string') return String(value || '');

      const trimmed = value.trim();
      if (!trimmed) return '';

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(asText).join(' ');
      } catch {}

      return trimmed;
    };

    // IMPORTANT:
    // Only search visible/profile fields.
    // Do NOT search raw import objects, submission payloads, or entire buyer objects,
    // because those can contain the full CSV/TXT import and cause false matches.
    const searchable = [
      asText(b.name),
      asText(b.firstName),
      asText(b.lastName),
      asText(b.email),
      asText(b.phone),
      asText(b.company),
      asText(b.type),
      asText(b.status),
      asText(b.verificationStatus),
      asText(b.strategy),
      asText(b.exitStrategy),
      asText(b.investmentStrategy),
      parseMaybeList(b.strategies),
      asText(b.buyerType),
      asText(b.assetFocus),
      asText(b.asset_focus),
      parseMaybeList(b.markets),
      parseMaybeList(b.targetMarkets),
      parseMaybeList(b.target_markets),
      parseMaybeList(b.locations),
      parseMaybeList(b.states),
      parseMaybeList(b.target_states),
      parseMaybeList(b.assetTypes),
      parseMaybeList(b.asset_types),
      parseMaybeList(b.tags),
      asText(b.notes)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(q);
  });

  // Apply filters on top of the base + search
  if (activeFilters.includes('creative')) workingBuyers = workingBuyers.filter(b => b.creativeFinance || b.sellerFinance)
  if (activeFilters.includes('hot')) workingBuyers = workingBuyers.filter(b => b.status === 'Hot')
  if (activeFilters.includes('seller')) workingBuyers = workingBuyers.filter(b => b.sellerFinance)
  if (activeFilters.includes('cash')) workingBuyers = workingBuyers.filter(b => !b.creativeFinance && !b.sellerFinance)
  if (activeFilters.includes('hedge')) workingBuyers = workingBuyers.filter(b => safeLower(b.type || '').includes('hedge'))
  if (activeFilters.includes('pendingVerification') || activeFilters.includes('pendingReview')) workingBuyers = workingBuyers.filter((b: any) => ['Submitted / Pending Review', 'Pending Review'].includes(String(b.status || b.verificationStatus || '')))
  if (activeFilters.includes('duplicates')) workingBuyers = workingBuyers.filter((b: any) => duplicateBuyerIds.has(b.id))
  if (activeFilters.includes('verifiedBuyer')) workingBuyers = workingBuyers.filter((b: any) => (b.status || b.verificationStatus) === 'Verified Buyer')
  if (activeFilters.includes('vipBuyer')) workingBuyers = workingBuyers.filter((b: any) => (b.status || b.verificationStatus) === 'VIP Buyer')
  if (activeFilters.includes('needsMoreInfo')) workingBuyers = workingBuyers.filter((b: any) => (b.status || b.verificationStatus) === 'Needs More Info')
  if (activeFilters.includes('doNotBlast')) workingBuyers = workingBuyers.filter((b: any) => (b.status || b.verificationStatus) === 'Do Not Blast')

  // Advanced dropdown filters (state and asset) - applied on top of base + search + button filters
  const stateFilter = activeFilters.find(f => f.startsWith('state:'));
  if (stateFilter) {
    const st = stateFilter.split(':')[1].toUpperCase();
    workingBuyers = workingBuyers.filter(b => {
      const markets = (b.markets ?? []).map((m: string) => (m || '').toUpperCase());
      return markets.includes(st) || markets.includes('NATIONWIDE') || markets.includes('ANY');
    });
  }

  const assetFilter = activeFilters.find(f => f.startsWith('asset:'));
  if (assetFilter) {
    const at = safeLower(assetFilter.split(':')[1]);
    workingBuyers = workingBuyers.filter(b => {
      const assets = (b.assetTypes ?? []).map((a: string) => safeLower(a || ''));
      return assets.some((a: string) => a.includes(at) || at.includes(a));
    });
  }

  const strategyFilter = activeFilters.find(f => f.startsWith('strategy:'));
  if (strategyFilter) {
    const wanted = strategyFilter.slice('strategy:'.length);
    workingBuyers = workingBuyers.filter(b => normalizeBuyerStrategies(b).includes(wanted));
  }
  // Apply sort using normalized buyer data so dropdown options actually reorder cards.
  const getSortableBuyer = (buyer: any) => {
    const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
    const merged: any = { ...buyerData, ...buyer }

    const moneyValue = (...values: any[]) => {
      for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value

        if (typeof value === 'string') {
          const cleaned = value.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
          const match = cleaned.match(/(\d+(?:\.\d+)?)(k|m)?/)
          if (!match) continue

          let n = Number(match[1])
          if (!Number.isFinite(n) || n <= 0) continue

          if (match[2] === 'k') n *= 1000
          if (match[2] === 'm') n *= 1000000

          if (n > MAX_REASONABLE_BUYER_BUDGET) continue
          return Math.round(n)
        }
      }

      return 0
    }

    // BUYER_SORT_BUDGET_ZERO_FALLBACK_FIX_V2
    // Do not let a top-level 0/blank budget hide a valid nested data budget.
    const budgetMax =
      moneyValue(
        buyer?.budgetMax,
        buyer?.budget_max,
        buyer?.maxBudget,
        buyer?.max_budget,
        buyer?.priceMax,
        buyer?.price_max,
        buyer?.budget,
        buyer?.maxPrice,
        buyer?.max_price
      ) ||
      moneyValue(
        buyerData?.budgetMax,
        buyerData?.budget_max,
        buyerData?.maxBudget,
        buyerData?.max_budget,
        buyerData?.priceMax,
        buyerData?.price_max,
        buyerData?.budget,
        buyerData?.maxPrice,
        buyerData?.max_price
      )

    const budgetMin =
      moneyValue(
        buyer?.budgetMin,
        buyer?.budget_min,
        buyer?.minBudget,
        buyer?.min_budget,
        buyer?.priceMin,
        buyer?.price_min
      ) ||
      moneyValue(
        buyerData?.budgetMin,
        buyerData?.budget_min,
        buyerData?.minBudget,
        buyerData?.min_budget,
        buyerData?.priceMin,
        buyerData?.price_min
      )

    return {
      ...merged,
      displayName: getDisplayName(merged) || merged.name || merged.email || '',
      buyerType: merged.buyerType || merged.buyer_type || merged.type || '',
      budgetMax,
      budgetMin,
      createdTime: new Date(merged.createdAt || merged.created_at || merged.updatedAt || merged.updated_at || 0).getTime() || 0,
      heatScore: useAppStore.getState().getBuyerHeatScore?.(merged.id) || merged.heatScore || 0,
      strengthScore: merged.strengthScore || 0
    }
  }

  workingBuyers = [...workingBuyers].sort((a, b) => {
    const aa = getSortableBuyer(a)
    const bb = getSortableBuyer(b)

    switch (sortMode) {
      case 'heat-high':
        return (bb.heatScore || 0) - (aa.heatScore || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'strength-high':
        return (bb.strengthScore || 0) - (aa.strengthScore || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'budget-high':
        return (bb.budgetMax || 0) - (aa.budgetMax || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'budget-low':
        return (aa.budgetMax || 0) - (bb.budgetMax || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'recent':
        return (bb.createdTime || 0) - (aa.createdTime || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'type':
        return String(aa.buyerType || '').localeCompare(String(bb.buyerType || '')) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))

      case 'name-az':
        return String(aa.displayName || '').localeCompare(String(bb.displayName || '')) ||
          String(aa.email || '').localeCompare(String(bb.email || ''))

      default:
        return (bb.heatScore || 0) - (aa.heatScore || 0) ||
          String(aa.displayName || '').localeCompare(String(bb.displayName || ''))
    }
  })

  const getBuyerBorderColor = (b: any) => {
    if (b.creativeFinance || b.sellerFinance) return '#f59e0b'; // Amber - Creative/Seller Finance
    if (!b.creativeFinance && !b.sellerFinance) return '#22c55e'; // Green - Cash
    if (safeLower(b.type || '').includes('hedge')) return '#ef4444'; // Red - Hedge
    if (safeLower(b.type || '').includes('institutional')) return '#a855f7'; // Purple
    if (safeLower(b.type || '').includes('jv') || safeLower(b.type || '').includes('partner')) return '#06b6d4'; // Cyan
    if (safeLower(b.type || '').includes('broker') || safeLower(b.type || '').includes('agent')) return '#6b7280'; // Gray
    return '#22c55e'; // Default Emerald/Green
  }

  const filtered = workingBuyers

  const totalBuyerPages = Math.max(1, Math.ceil(filtered.length / buyersPerPage))
  const safeBuyerPage = Math.min(Math.max(1, buyerPage), totalBuyerPages)
  const buyerPageStartIndex = filtered.length ? (safeBuyerPage - 1) * buyersPerPage : 0
  const buyerPageEndIndex = Math.min(buyerPageStartIndex + buyersPerPage, filtered.length)
  const paginatedBuyers = filtered.slice(buyerPageStartIndex, buyerPageEndIndex)

  useEffect(() => {
    setBuyerPage(1)
  }, [search, sortMode, activeFilters.join('|'), activeTab, selectedSegment, currentListId, buyersPerPage])

  useEffect(() => {
    if (buyerPage > totalBuyerPages) setBuyerPage(totalBuyerPages)
  }, [buyerPage, totalBuyerPages])

  const renderBuyerPaginationControls = (position: 'top' | 'bottom' = 'top') => (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${position === 'top' ? 'mb-3' : 'mt-4 mb-2'} rounded-lg border border-[#252A38] bg-[#11151F] px-3 py-2 text-xs`}>
      <div className="text-[#8B92A3]">
        Showing buyers <span className="text-white font-medium tabular-nums">{filtered.length ? buyerPageStartIndex + 1 : 0}-{buyerPageEndIndex}</span>
        {' '}of <span className="text-white font-medium tabular-nums">{filtered.length.toLocaleString()}</span>
        <span className="ml-2 text-[#64748B]">Page {safeBuyerPage} of {totalBuyerPages}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[#8B92A3]">Per page</label>
        <select
          value={buyersPerPage}
          onChange={(e) => setBuyersPerPage(Number(e.target.value))}
          className="select text-xs py-1 w-20"
        >
          <option value={12}>12</option>
          <option value={24}>24</option>
          <option value={48}>48</option>
          <option value={96}>96</option>
        </select>

        <button
          onClick={() => setBuyerPage(1)}
          disabled={safeBuyerPage <= 1}
          className="btn btn-ghost text-xs px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          First
        </button>
        <button
          onClick={() => setBuyerPage(prev => Math.max(1, prev - 1))}
          disabled={safeBuyerPage <= 1}
          className="btn btn-ghost text-xs px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => setBuyerPage(prev => Math.min(totalBuyerPages, prev + 1))}
          disabled={safeBuyerPage >= totalBuyerPages}
          className="btn btn-ghost text-xs px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <button
          onClick={() => setBuyerPage(totalBuyerPages)}
          disabled={safeBuyerPage >= totalBuyerPages}
          className="btn btn-ghost text-xs px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Last
        </button>
      </div>
    </div>
  )

  const formatBudget = (min?: number, max?: number): string => {
    const fmt = (n: number): string => {
      if (!n || n <= 0) return ''
      const abs = Math.abs(n)
      if (abs >= 1000000000) return '$' + (abs / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
      if (abs >= 1000000) return '$' + (abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M'
      if (abs >= 1000) return '$' + Math.round(abs / 1000) + 'K'
      return '$' + abs.toLocaleString()
    }
    // BUYER_BUDGET_UP_TO_PATCH_V2
    // Blank, zero, or placeholder $1 minimum should display as "Up to $X" instead of "$1 - $X".
    const minStr = min != null && min > 1 ? fmt(min) : ''
    const maxStr = max != null && max > 0 ? fmt(max) : ''
    if (minStr && maxStr) return `${minStr} - ${maxStr}`
    if (maxStr) return `Up to ${maxStr}`
    if (minStr) return `${minStr}+`
    return 'Budget Unknown'
  }

  const parseBuyerMoneyValue = (...values: any[]) => {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_REASONABLE_BUYER_BUDGET) return Math.round(value)

      if (typeof value === 'string') {
        const cleaned = value.replace(/\$/g, '').replace(/,/g, '').toLowerCase()
        const matches = Array.from(cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|b)?/g))
        if (!matches.length) continue

        const nums = matches.map(match => {
          let n = Number(match[1])
          if (!Number.isFinite(n) || n <= 0) return 0

          if (match[2] === 'k') n *= 1000
          if (match[2] === 'm') n *= 1000000
          if (match[2] === 'b') n *= 1000000000

          if (n > MAX_REASONABLE_BUYER_BUDGET) return 0
          return Math.round(n)
        }).filter(n => n > 0)

        if (nums.length) return nums[0]
      }
    }

    return 0
  }

  const parseBuyerBudgetRange = (...values: any[]) => {
    for (const value of values) {
      if (typeof value !== 'string') continue

      const cleaned = value.replace(/,/g, '').toLowerCase()
      const matches = Array.from(cleaned.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m|b)?/g))

      const nums = matches.map(match => {
        let n = Number(match[1])
        if (!Number.isFinite(n) || n <= 0) return 0

        if (match[2] === 'k') n *= 1000
        if (match[2] === 'm') n *= 1000000
        if (match[2] === 'b') n *= 1000000000

        if (n > MAX_REASONABLE_BUYER_BUDGET) return 0
        return Math.round(n)
      }).filter(n => n > 0)

      if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums) }
      if (nums.length === 1) return { min: 0, max: nums[0] }
    }

    return { min: 0, max: 0 }
  }

  const getBuyerFullNameForCard = (buyer: any) => {
    const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
    const merged: any = { ...buyerData, ...buyer }

    const cleanNameValue = (value: any) => {
      const raw = String(value || '').trim()
      if (!raw) return ''

      if (/^(buyer|cash buyer|creative buyer|company missing|name missing|phone missing|budget unknown)$/i.test(raw)) return ''
      if (raw.includes('@')) return ''

      return raw
        .replace(/[_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const fieldName = cleanNameValue(
      merged.fullName ||
      merged.full_name ||
      merged.buyerName ||
      merged.buyer_name ||
      merged.contactName ||
      merged.contact_name ||
      merged.name
    )

    const notes = String(merged.notes || merged.buyBox || merged.buy_box || merged.rawText || '')
    const noteNameMatch = notes.match(/^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*(?:[ï¿½ï¿½-]|,|\|)/)

    const noteName = cleanNameValue(noteNameMatch?.[1])

    const emailUser = String(merged.email || '').split('@')[0]?.toLowerCase() || ''
    const fieldIsEmailStub = fieldName && emailUser && emailUser.includes(fieldName.toLowerCase().replace(/\s+/g, ''))

    if (noteName && (!fieldName || fieldName.split(' ').length === 1 || fieldIsEmailStub)) return noteName

    if (fieldName) return fieldName

    const fallback = cleanNameValue(getDisplayName(merged))
    return fallback || 'Name Missing'
  }

  const getBuyerStrategyLabelsForCard = (buyer: any) => {
    const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}
    const merged: any = { ...buyerData, ...buyer }

    const explicit = normalizeBuyerStrategies(merged)
      .filter((strategy: string) => !/^(buyer|cash buyer|creative buyer|verified buyer|vip buyer)$/i.test(strategy))
      .map((strategy: string) => strategy === 'Creative' || strategy === 'Creative Finance' ? 'Creative Finance' : strategy)
      .map((strategy: string) => strategy === 'Cash' ? 'Fix & Flip' : strategy)

    if (explicit.length) return Array.from(new Set(explicit))

    return ['Strategy Missing']
  }

  const getBuyerBudgetDisplay = (buyer: any) => {
    const buyerData: any = buyer && typeof buyer.data === 'object' && buyer.data ? buyer.data : {}

    // BUYER_BUDGET_DISPLAY_ZERO_FALLBACK_FIX_V2
    // Top-level edited values win only when positive. Otherwise fall back to nested data.
    let min =
      parseBuyerMoneyValue(
        buyer?.budgetMin,
        buyer?.budget_min,
        buyer?.minBudget,
        buyer?.min_budget,
        buyer?.priceMin,
        buyer?.price_min,
        buyer?.purchaseBudgetMin,
        buyer?.purchase_budget_min
      ) ||
      parseBuyerMoneyValue(
        buyerData?.budgetMin,
        buyerData?.budget_min,
        buyerData?.minBudget,
        buyerData?.min_budget,
        buyerData?.priceMin,
        buyerData?.price_min,
        buyerData?.purchaseBudgetMin,
        buyerData?.purchase_budget_min
      )

    let max =
      parseBuyerMoneyValue(
        buyer?.budgetMax,
        buyer?.budget_max,
        buyer?.maxBudget,
        buyer?.max_budget,
        buyer?.priceMax,
        buyer?.price_max,
        buyer?.purchaseBudgetMax,
        buyer?.purchase_budget_max,
        buyer?.budget,
        buyer?.maxPrice,
        buyer?.max_price,
        buyer?.purchaseBudget,
        buyer?.purchase_budget
      ) ||
      parseBuyerMoneyValue(
        buyerData?.budgetMax,
        buyerData?.budget_max,
        buyerData?.maxBudget,
        buyerData?.max_budget,
        buyerData?.priceMax,
        buyerData?.price_max,
        buyerData?.purchaseBudgetMax,
        buyerData?.purchase_budget_max,
        buyerData?.budget,
        buyerData?.maxPrice,
        buyerData?.max_price,
        buyerData?.purchaseBudget,
        buyerData?.purchase_budget
      )

    if (!min && !max) {
      const range = parseBuyerBudgetRange(
        buyer?.budget,
        buyer?.budgetRange,
        buyer?.budget_range,
        buyer?.priceRange,
        buyer?.price_range,
        buyer?.notes,
        buyer?.buyBox,
        buyer?.buy_box,
        buyer?.rawText,
        buyer?.criteria,
        buyerData?.budget,
        buyerData?.budgetRange,
        buyerData?.budget_range,
        buyerData?.priceRange,
        buyerData?.price_range,
        buyerData?.notes,
        buyerData?.buyBox,
        buyerData?.buy_box,
        buyerData?.rawText,
        buyerData?.criteria
      )

      min = range.min
      max = range.max
    }

    return formatBudget(min, max)
  }

  // Support direct open of Buyer Profile Drawer from Dashboard Hot Buyers (or external links)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const buyerId = searchParams.get('buyer')
    if (buyerId && !selectedBuyer) {
      const found = buyers.find(b => b.id === buyerId)
      if (found) {
        const hydrated = hydrateBuyerForEdit(found)
        setSelectedBuyer(hydrated as any)
        setEditBuyer(hydrated)
        // Clear param so it doesn't re-open on every render
        setSearchParams({})
      }
    }
  }, [searchParams, buyers, selectedBuyer, setSearchParams])

  useEffect(() => {
    if (searchParams.get('review') === 'pending') {
      void importBuyerPortalQueue()

      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('review')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Buyer import: parse only into pending review state. No store write until user approves in review screen.
  // Supports CSV plus raw TXT buyer lists, one email per line, comma-separated emails, and name + email lines.
  const handleFile = (file: File) => {
    const isTxt = safeLower(file.name).endsWith('.txt')

    const cleanKey = (key: string) =>
      safeLower(String(key || ''))
        .replace(/[^a-z0-9]/g, '')

    const pick = (raw: any, aliases: string[]) => {
      if (!raw) return ''
      const keys = Object.keys(raw)
      for (const alias of aliases) {
        const wanted = cleanKey(alias)
        const found = keys.find(k => cleanKey(k) === wanted)
        if (found && raw[found] !== undefined && raw[found] !== null && String(raw[found]).trim() !== '') {
          return String(raw[found]).trim()
        }
      }
      return ''
    }

    const splitList = (value: any) => {
      const text = String(value || '').trim()
      if (!text) return []
      return text
        .split(/[,;|\/]+/)
        .map(x => x.trim())
        .filter(Boolean)
    }

    const publicEmailDomains = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'msn.com', 'live.com', 'me.com', 'protonmail.com'])

    const getEmailDomain = (emailValue: any) => String(emailValue || '').toLowerCase().split('@')[1] || ''

    const inferCompanyFromEmailDomain = (emailValue: any) => {
      const domain = getEmailDomain(emailValue)
      if (!domain || publicEmailDomains.has(domain)) return ''
      const root = domain.split('.')[0]
      if (!root || root.length < 3) return ''
      return autoCapBuyerName(root.replace(/[-_]+/g, ' '))
    }

    const parseMoney = (value: any) => {
      const text = String(value || '').toLowerCase().replace(/[$,\s]/g, '')
      if (!text) return 0

      const match = text.match(/[0-9]+(?:\.[0-9]+)?/)
      if (!match) return 0

      let num = parseFloat(match[0])
      if (text.includes('m')) num *= 1000000
      if (text.includes('k')) num *= 1000
      return Math.round(num)
    }

    const hasBudgetLanguage = (value: any) =>
      /\b(budget|max(?:imum)?|min(?:imum)?|price\s*range|purchase\s*price|buy\s*up\s*to|up\s*to|target\s*price|spend|acquisition\s*price)\b/i.test(String(value || ''))

    const parseBudgetRange = (raw: any) => {
      const directMin = parseMoney(pick(raw, ['Budget Min', 'Min Budget', 'Minimum Budget', 'Min Price', 'Price Min', 'Minimum Price']))
      const directMax = parseMoney(pick(raw, ['Budget Max', 'Max Budget', 'Maximum Budget', 'Max Price', 'Price Max', 'Maximum Price']))

      if (directMin || directMax) {
        return { budgetMin: directMin || 0, budgetMax: directMax || 0 }
      }

      const combined = pick(raw, ['Budget', 'Budget Range', 'Price Range', 'Purchase Price', 'Target Price', 'Buy Box Price', 'Price'])
      if (!hasBudgetLanguage(combined)) return { budgetMin: 0, budgetMax: 0, confidence: 'Missing' }
      const numbers = String(combined || '')
        .match(/[0-9]+(?:\.[0-9]+)?\s*[kKmM]?/g)
        ?.map(parseMoney)
        .filter(Boolean) || []

      if (numbers.length >= 2) return { budgetMin: numbers[0], budgetMax: numbers[1], confidence: 'Parsed' }
      if (numbers.length === 1) return { budgetMin: 0, budgetMax: numbers[0], confidence: 'Parsed' }

      return { budgetMin: 0, budgetMax: 0, confidence: 'Missing' }
    }

    const inferStates = (text: string) => normalizeImportedMarkets(text)
    void inferStates

    const normalizeAssetTypes = (value: any, fallbackText = '') => {
      const rawList = splitList(value)
      const text = safeLower(rawList.join(' ') + ' ' + fallbackText)
      const assets: string[] = []

      if (/single family|sfh|sfr|house|houses|residential/.test(text)) assets.push('SFH')
      if (/duplex|triplex|quad|2-4|1-4|small multi|small multifamily/.test(text)) assets.push('Small Multifamily')
      if (/multifamily|multi family|apartment|apartments|units/.test(text)) assets.push('Multifamily')
      if (/mobile home park|mhp|trailer park/.test(text)) assets.push('MHP')
      if (/rv park/.test(text)) assets.push('RV Park')
      if (/\bland\b|development|lot|acre|build.?to.?rent|btr/.test(text)) assets.push(/build.?to.?rent|btr/.test(text) ? 'Build-to-Rent' : 'Land')
      if (/retail/.test(text)) assets.push('Retail')
      if (/office/.test(text)) assets.push('Office')
      if (/warehouse|industrial/.test(text)) assets.push('Industrial')
      if (/storage|self storage/.test(text)) assets.push('Storage')
      if (/mixed use|mixed-use/.test(text)) assets.push('Mixed Use')
      if (/commercial/.test(text)) assets.push('Commercial')
      if (/hotel|motel|hospitality/.test(text)) assets.push('Hotel')

      rawList.forEach(x => {
        if (!assets.some(a => safeLower(a) === safeLower(x))) assets.push(x)
      })

      return assets.length ? Array.from(new Set(assets)) : []
    }

    const normalizeImportedBuyer = (raw: any) => {
      const email = (pick(raw, ['Email', 'Email Address', 'E-mail', 'Buyer Email', 'Contact Email', 'Primary Email']) || '').toLowerCase()
      const explicitName =
        pick(raw, ['Name', 'Full Name', 'Buyer Name', 'Contact Name', 'First Last', 'Principal', 'Investor Name']) ||
        [pick(raw, ['First Name', 'Firstname', 'first_name']), pick(raw, ['Last Name', 'Lastname', 'last_name'])].filter(Boolean).join(' ')
      const inferredName = explicitName ? '' : splitEmailUsernameName(email)
      const fullName = explicitName || inferredName || ''
      const explicitCompany = pick(raw, ['Company', 'Company Name', 'Entity', 'Business', 'Organization', 'LLC', 'company_name'])
      const inferredCompany = explicitCompany ? '' : inferCompanyFromEmailDomain(email)

      const notes = pick(raw, ['Notes', 'Buy Box', 'Criteria', 'Buyer Criteria', 'Description', 'Comments', 'Strategy Notes'])
      const marketText = pick(raw, ['Markets', 'Market', 'Target Markets', 'Locations', 'Location', 'States', 'Target States', 'Buying Areas', 'Areas'])
      const assetText = pick(raw, ['Asset Types', 'Asset Type', 'Property Types', 'Property Type', 'Category', 'Asset Focus', 'Product Type'])
      const strategyText = pick(raw, ['Strategy', 'Strategies', 'Exit Strategy', 'Exit Strategies', 'Investment Strategy', 'Investment Strategies'])
      const financeText = pick(raw, ['Finance Type', 'Financing', 'Buyer Type', 'Type', 'Purchase Type'])
      const rawImportedText = Object.entries(raw || {})
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`)
        .join(' | ')
      const combinedText = [notes, marketText, assetText, strategyText, financeText, rawImportedText].filter(Boolean).join(' ')

      const downText = pick(raw, ['downPaymentMax', 'Down Payment Max', 'Down Payment', 'DP', 'Max Down Payment'])
      const monthlyText = pick(raw, ['monthlyPaymentMax', 'Monthly Payment Max', 'Monthly Payment', 'Monthly Budget', 'Payment Max'])
      const interestText = pick(raw, ['interestRateMax', 'Interest Rate Max', 'Interest Rate', 'Rate'])
      const capText = pick(raw, ['capRateTarget', 'Cap Rate Target', 'Cap Rate', 'Target Cap'])
      const balloonText = pick(raw, ['balloonTerm', 'Balloon Term', 'Balloon'])

      const creativeParseText = [
        combinedText,
        downText ? 'Down Payment ' + downText : '',
        monthlyText ? 'Monthly Payment ' + monthlyText : '',
        interestText ? 'Interest Rate ' + interestText : '',
        capText ? 'Cap Rate ' + capText : '',
        balloonText ? 'Balloon Term ' + balloonText : ''
      ].filter(Boolean).join(' | ')

      const markets = normalizeExplicitMarkets(marketText, [combinedText, notes].filter(Boolean).join(' '))
      const finalMarkets = markets.length ? markets : []
      const assetTypes = normalizeAssetTypes(assetText, combinedText)
      const strategies = normalizeBuyerStrategies({
        strategy: strategyText,
        exitStrategy: strategyText,
        investmentStrategy: strategyText,
        notes,
        buyBox: notes,
        criteria: pick(raw, ['Buyer Criteria', 'Criteria']),
        comments: pick(raw, ['Comments']),
        description: pick(raw, ['Description']),
        rawText: combinedText,
      })

      const isCreative = /creative|seller\s*financ(?:e|ing)|owner\s*financ(?:e|ing)|subto|subject\s*to|wrap|lease\s*option|rent\s*to\s*own|rto|novation|balloon|down\s*payment|interest/i.test(creativeParseText)
      const isSellerFinance = /seller\s*financ(?:e|ing)|owner\s*financ(?:e|ing)/i.test(creativeParseText)
      const isCash = /\b(cash buyer|cash|proof of funds|pof|closes cash|cash close)\b/i.test(combinedText) && !isCreative
      const budgets = parseBudgetRange(raw)
      const creativeTerms = parseCreativeTerms(creativeParseText)
      const explicitBuyerType = pick(raw, ['Buyer Type', 'Type', 'Investor Type', 'Strategy'])
      const parsedType = explicitBuyerType ||
        (isCreative ? (isSellerFinance ? 'Seller Finance Buyer' : 'Creative Finance Buyer') :
          isCash ? 'Cash Buyer' :
            /\bhedge fund|fund\b/i.test(combinedText) ? 'Hedge Fund' :
              /\bwholesaler|jv|joint venture\b/i.test(combinedText) ? 'JV / Wholesaler' :
                /\bagent|broker|realtor\b/i.test(combinedText) ? 'Agent' :
                  /\blender|private money|hard money\b/i.test(combinedText) ? 'Lender' :
                    /\bdeveloper|builder\b/i.test(combinedText) ? 'Developer' :
                      /\bland\b/i.test(combinedText) ? 'Land Buyer' :
                        /\bcommercial|retail|office|industrial|hotel|storage\b/i.test(combinedText) ? 'Commercial Buyer' : '')
      const rawNotes = notes || ''
      const parserNotes = [
        'Imported from CSV. Missing fields left blank.',
        explicitName ? 'Name parsed from source.' : inferredName ? 'Name inferred from email.' : 'Name missing.',
        explicitCompany ? 'Company parsed from source.' : inferredCompany ? 'Company inferred from business email domain.' : 'Company missing.',
        finalMarkets.length ? 'Markets parsed from source.' : 'Markets missing.',
        assetTypes.length ? 'Asset focus parsed from source.' : 'Asset focus missing.',
        budgets.budgetMax || budgets.budgetMin ? 'Budget parsed from source.' : 'Budget unknown.',
      ]

      return {
        _id: 'tmp_' + Date.now() + Math.random().toString(36).slice(2),
        name: cleanBuyerName(fullName, email),
        email: String(email || '').trim(),
        phone: pick(raw, ['Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Phone']),
        company: explicitCompany || inferredCompany,
        type: parsedType,
        markets: finalMarkets,
        assetTypes,
        strategies,
        strategy: strategies.join(', '),
        exitStrategy: strategies.join(', '),
        investmentStrategy: strategies.join(', '),
        rawText: rawImportedText,
        budgetMin: budgets.budgetMin,
        budgetMax: budgets.budgetMax,
        creativeFinance: isCreative || strategies.some(strategy => ['Creative Finance', 'Seller Finance', 'Subject To', 'Wrap', 'Lease Option', 'Novation'].includes(strategy)),
        sellerFinance: isSellerFinance || strategies.includes('Seller Finance'),
        cashBuyer: isCash || strategies.some(strategy => ['Fix & Flip', 'BRRRR', 'Buy & Hold', 'Section 8', 'Wholesale', 'DSCR Rental'].includes(strategy)),
        downPaymentMax: formatDownPaymentField(creativeTerms.downPaymentMax || downText || ''),
        monthlyPaymentMax: formatMonthlyPaymentField(creativeTerms.monthlyPaymentMax || monthlyText || ''),
        interestRateMax: creativeTerms.interestRateMax || interestText || '',
        capRateTarget: creativeTerms.capRateTarget || capText || '',
        balloonTerm: creativeTerms.balloonTerm || balloonText || '',
        creativeStructure: creativeTerms.creativeStructure || (isSellerFinance ? 'Seller Finance' : ''),
        notes: [rawNotes, parserNotes.join(' ')].filter(Boolean).join('\n\n'),
        status: /(\bhot\b|vip|priority|responded|active|recent buyer)/i.test(combinedText) ? 'Hot' : 'New',
        source: 'CSV/TXT Import',
        tags: [
          ...(isCreative ? ['Creative Finance'] : []),
          ...(inferredName ? ['Name Inferred'] : []),
          ...(inferredCompany ? ['Company Inferred'] : []),
        ],
        parserConfidence: {
          name: explicitName ? 'Parsed' : inferredName ? 'Inferred' : 'Missing',
          company: explicitCompany ? 'Parsed' : inferredCompany ? 'Inferred' : 'Missing',
          markets: finalMarkets.length ? 'Parsed' : 'Missing',
          budget: budgets.budgetMax || budgets.budgetMin ? 'Parsed' : 'Missing',
          assetTypes: assetTypes.length ? 'Parsed' : 'Missing',
          buyerType: parsedType ? 'Parsed' : 'Missing',
          strategy: strategies.length ? 'Parsed' : 'Missing',
        },
        _valid: /\S+@\S+\.\S+/.test(String(email || ''))
      }
    }

    if (isTxt) {
      const reader = new FileReader()

      reader.onload = (e) => {
        const text = ((e.target?.result as string) || '').trim()

        const chunks = text
          .split(/[\r\n,;]+/)
          .map(x => x.trim())
          .filter(Boolean)

        const mapped: any[] = []
        let invalidCount = 0

        chunks.forEach(chunk => {
          const emailMatch = chunk.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
          const email = emailMatch?.[0] || ''

          if (!email) {
            invalidCount++
            return
          }

          const cleanedName = chunk
            .replace(email, '')
            .replace(/phone\s*missing/ig, '')
            .replace(/company\s*missing/ig, '')
            .replace(/\s+/g, ' ')
            .trim()

          mapped.push(normalizeBuyerReviewRow(normalizeImportedBuyer({
            Name: cleanedName.length > 1 ? cleanedName : email.split('@')[0],
            Email: email,
            Notes: chunk
          })))
        })

        const uniqueByEmail = Array.from(
          new Map(mapped.map(m => [safeLower(m.email), m])).values()
        )

        const withDupFlag = uniqueByEmail.map(m => ({
          ...m,
          _dup: buyers.some((b: any) => safeLower(b.email) === safeLower(m.email))
        }))

        setPendingImport(prev => {
          const existingEmails = new Set(prev.map((p: any) => String(p.email || '')))
          return [
            ...prev,
            ...withDupFlag.map((row: any) => ({
              ...row,
              _dup: row._dup || existingEmails.has(String(row.email || ''))
            }))
          ]
        })
        setImportResult(null)
        toast.info(`${withDupFlag.length} TXT buyers ready for review. ${invalidCount} invalid skipped.`)
      }

      reader.onerror = () => toast.error('Could not read TXT file.')
      reader.readAsText(file)
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[]
        const mapped: any[] = []
        let invalidCount = 0

        rows.forEach((r: any) => {
          const normalized = normalizeImportedBuyer(r)

          if (!normalized._valid) {
            invalidCount++
            return
          }

          mapped.push(normalizeBuyerReviewRow(normalized))
        })

        const uniqueByEmail = Array.from(
          new Map(mapped.map(m => [safeLower(m.email), m])).values()
        )

        const withDupFlag = uniqueByEmail.map(m => ({
          ...m,
          _dup: buyers.some((b: any) => safeLower(b.email) === safeLower(m.email))
        }))

        setPendingImport(prev => {
          const existingEmails = new Set(prev.map((p: any) => String(p.email || '')))
          return [
            ...prev,
            ...withDupFlag.map((row: any) => ({
              ...row,
              _dup: row._dup || existingEmails.has(String(row.email || ''))
            }))
          ]
        })
        setImportResult(null)
        toast.info(`${withDupFlag.length} unique rows ready for review. ${invalidCount} invalid skipped.`)
      },
      error: () => toast.error('Could not parse CSV file.')
    })
  }

  // Review screen actions (edit/remove/merge/approve)
  const getParsedRequirementsForRow = (row: any) => {
    return parsePropertyRequirements([
      row.notes,
      row.Notes,
      row.buyBox,
      row['Buy Box'],
      row.rawText,
      row.assetTypes,
      row.assetType,
      row.propertyTypes
    ].filter(Boolean).join(' | '))
  }

  const getRequirementValue = (row: any, field: 'bedRequirement' | 'bathRequirement' | 'unitRequirement') => {
    const current = row?.[field]
    if (current && current !== 'Any') return current

    const parsed = getParsedRequirementsForRow(row)
    return parsed?.[field] || 'Any'
  }

  const updatePendingRow = (id: string, changes: any) => {
    setPendingImport(prev => prev.map(r => r._id === id ? { ...r, ...changes } : r))
  }
  const removePendingRow = async (id: string) => {
    const row = pendingImport.find((r: any) => r._id === id)

    try {
      if (row?.buyerPortalSubmissionId) {
        await markBuyerPortalSubmissionsDismissed([row.buyerPortalSubmissionId])
      }

      setPendingImport(prev => {
        const next = prev.filter((r: any) => r._id !== id)

        if (next.length === 0 && row?.buyerPortalSubmissionId) {
          setImportResult(null)
          setShowImport(false)
        }

        return next
      })

      if (row?.buyerPortalSubmissionId) {
        void refreshBuyerPortalQueueCount()
        toast.success('Buyer portal submission removed from review queue')
      }
    } catch (error) {
      console.error(error)
      toast.error('Could not remove buyer portal submission')
    }
  }

  const clearPendingImportRows = async () => {
    const submissionIds = pendingImport
      .map((r: any) => r.buyerPortalSubmissionId)
      .filter(Boolean)

    try {
      if (submissionIds.length) {
        await markBuyerPortalSubmissionsDismissed(submissionIds)
        toast.success('Buyer portal review queue cleared')
      }

      setPendingImport([])
      setImportResult(null)

      if (submissionIds.length) {
        setShowImport(false)
      }

      void refreshBuyerPortalQueueCount()
    } catch (error) {
      console.error(error)
      toast.error('Could not clear buyer portal review queue')
    }
  }
  const toggleMergePending = (id: string) => {
    setPendingImport(prev => prev.map(r => r._id === id ? { ...r, _merge: !r._merge } : r))
  }


  const normalizeBuyerBeforeApproval = (buyer: any) => {
    const splitToArray = (value: any) => {
      if (Array.isArray(value)) return value.map(x => String(x).trim()).filter(Boolean)
      if (value === undefined || value === null) return []
      return String(value)
        .split(/[,;|\/]+/)
        .map(x => x.trim())
        .filter(Boolean)
    }

    const toBool = (value: any) => {
      if (typeof value === 'boolean') return value
      const text = String(value || '').trim()
      return ['true', 'yes', 'y', '1'].includes(text)
    }

    const toNumber = (value: any) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0
      const text = String(value || '').replace(/[$,\s]/g, '')
      const match = text.match(/[0-9]+(?:\.[0-9]+)?/)
      if (!match) return 0
      let num = parseFloat(match[0])
      if (text.includes('m')) num *= 1000000
      if (text.includes('k')) num *= 1000
      return Math.round(num)
    }

    const markets = normalizeExplicitMarkets(splitToArray(buyer.markets || buyer.market || buyer.Markets || buyer.Market), buyer.notes || buyer.Notes || buyer.buyBox || buyer['Buy Box'])
    const assetTypes = splitToArray(buyer.assetTypes || buyer.assetType || buyer['Asset Types'] || buyer.Property_Types || buyer.propertyTypes)

    const creativeFinance = toBool(buyer.creativeFinance)
    const sellerFinance = toBool(buyer.sellerFinance)
    const strategies = normalizeBuyerStrategies(buyer)

    return {
      ...buyer,
      name: autoCapBuyerName(cleanBuyerName(buyer.name || buyer.Name || buyer.fullName, buyer.email || buyer.Email || '')),
      email: buyer.email || buyer.Email || buyer['Email Address'] || '',
      phone: buyer.phone || buyer.Phone || '',
      company: buyer.company || buyer.Company || '',
      type: buyer.type || buyer.Type || buyer['Buyer Type'] || (creativeFinance ? 'Creative Buyer' : ''),
      markets,
      assetTypes,
      budgetMin: toNumber(buyer.budgetMin || buyer['Budget Min'] || buyer.minBudget),
      budgetMax: toNumber(buyer.budgetMax || buyer['Budget Max'] || buyer.maxBudget),
      bedRequirement: buyer.bedRequirement && buyer.bedRequirement !== 'Any' ? buyer.bedRequirement : parsePropertyRequirements([buyer.notes, buyer.buyBox, buyer.rawText, buyer.assetTypes].filter(Boolean).join(' | ')).bedRequirement,
      bathRequirement: buyer.bathRequirement && buyer.bathRequirement !== 'Any' ? buyer.bathRequirement : parsePropertyRequirements([buyer.notes, buyer.buyBox, buyer.rawText, buyer.assetTypes].filter(Boolean).join(' | ')).bathRequirement,
      unitRequirement: buyer.unitRequirement && buyer.unitRequirement !== 'Any' ? buyer.unitRequirement : parsePropertyRequirements([buyer.notes, buyer.buyBox, buyer.rawText, buyer.assetTypes].filter(Boolean).join(' | ')).unitRequirement,
      downPaymentMax: formatDownPaymentField(buyer.downPaymentMax || buyer['Down Payment Max'] || buyer.downPayment),
      monthlyPaymentMax: formatMonthlyPaymentField(buyer.monthlyPaymentMax || buyer['Monthly Payment Max'] || buyer.monthlyPayment),
      interestRateMax: buyer.interestRateMax || buyer['Interest Rate Max'] || buyer.interestRate || '',
      capRateTarget: buyer.capRateTarget || buyer['Cap Rate Target'] || buyer.capRate || '',
      balloonTerm: buyer.balloonTerm || buyer['Balloon Term'] || buyer.balloon || '',
      sellerFinance,
      creativeFinance,
      cashBuyer: buyer.cashBuyer !== undefined ? toBool(buyer.cashBuyer) : /\bcash\b|pof|proof of funds/i.test([buyer.type, buyer.Type, buyer['Buyer Type'], buyer.notes, buyer.Notes, buyer.buyBox].filter(Boolean).join(' ')),
      strategies,
      strategy: strategies.join(', '),
      exitStrategy: strategies.join(', '),
      investmentStrategy: strategies.join(', '),
      otherStrategy: buyer.otherStrategy || buyer.other_strategy || '',
      notes: buyer.notes || buyer.Notes || '',
      tags: splitToArray(buyer.tags || buyer.Tags),
      status: buyer.status || buyer.Status || 'New',
    }
  }

  const cleanAllPendingBuyerNames = () => {
    setPendingImport(prev => prev.map((row: any) => {
      const normalized = normalizeBuyerReviewRow(row)
      const parsed = getParsedRequirementsForRow(row)

      return {
        ...normalized,
        bedRequirement:
          row.bedRequirement && row.bedRequirement !== 'Any'
            ? row.bedRequirement
            : parsed.bedRequirement,
        bathRequirement:
          row.bathRequirement && row.bathRequirement !== 'Any'
            ? row.bathRequirement
            : parsed.bathRequirement,
        unitRequirement:
          row.unitRequirement && row.unitRequirement !== 'Any'
            ? row.unitRequirement
            : parsed.unitRequirement,
      }
    }))

    toast.success('Auto-fix complete. Names and bed/bath/unit requirements parsed where possible.')
  }

  const updatePortalPendingRow = (id: string, changes: any) => {
    setPendingPortalImport(prev => prev.map(r => {
      if (r._id !== id) return r
      const next = { ...r, ...changes }
      if ('email' in changes) {
        next._valid = isValidBuyerEmail(changes.email)
        next._error = next._valid ? '' : 'Valid email is required for approval.'
      }
      return next
    }))
  }

  const removePortalPendingRow = async (id: string) => {
    const row = pendingPortalImport.find((r: any) => r._id === id)

    try {
      if (row?.buyerPortalSubmissionId) {
        await markBuyerPortalSubmissionsDismissed([row.buyerPortalSubmissionId])
      }

      setPendingPortalImport(prev => prev.filter((r: any) => r._id !== id))
      void refreshBuyerPortalQueueCount()
      toast.success('Buyer portal submission removed from review queue')
    } catch (error) {
      console.error(error)
      toast.error('Could not remove buyer portal submission')
    }
  }

  const clearPortalPendingRows = async () => {
    const submissionIds = pendingPortalImport
      .map((r: any) => r.buyerPortalSubmissionId)
      .filter(Boolean)

    try {
      if (submissionIds.length) {
        await markBuyerPortalSubmissionsDismissed(submissionIds)
      }

      setPendingPortalImport([])
      setShowPortalReview(false)
      void refreshBuyerPortalQueueCount()
      toast.success('Buyer portal review queue cleared')
    } catch (error) {
      console.error(error)
      toast.error('Could not clear buyer portal review queue')
    }
  }

  const cleanAllPortalBuyerNames = () => {
    setPendingPortalImport(prev => prev.map((row: any) => {
      const normalized = normalizeBuyerReviewRow(row)
      const parsed = getParsedRequirementsForRow(row)

      return {
        ...normalized,
        bedRequirement: row.bedRequirement || parsed?.bedRequirement || 'Any',
        bathRequirement: row.bathRequirement || parsed?.bathRequirement || 'Any',
        unitRequirement: row.unitRequirement || parsed?.unitRequirement || 'Any',
        buyerPortalSubmission: row.buyerPortalSubmission,
        buyerPortalSubmissionId: row.buyerPortalSubmissionId,
      }
    }))

    toast.success('Portal buyer review cleaned.')
  }

  const approvePortalSelected = async () => {
    await approvePortalRows(pendingPortalImport.filter(r => r._valid !== false))
  }

  const approveAllPortalValid = () => approvePortalSelected()

  const approveSinglePortalBuyer = async (rowId: string) => {
    const row = pendingPortalImport.find((r: any) => r._id === rowId)
    if (!row) return
    await approvePortalRows([row])
  }

  const buildApprovedPortalBuyer = (row: any) => {
    const normalized = normalizeBuyerBeforeApproval(row)
    const strategySynced = buildBuyerStrategyUpdate({ ...normalized, ...row })
    const email = String(normalized.email || row.email || '').trim().toLowerCase()
    const name = cleanBuyerName(normalized.name || row.name, email) || deriveDisplayNameFromEmail(email)
    const portalNotes = [
      normalized.notes,
      row.notes,
      row.buyerPortalSubmission?.notes,
      'Recovered from Buyer Portal submission',
    ].filter(Boolean).join(' | ')

    return {
      ...normalized,
      ...strategySynced,
      email,
      name,
      company: normalized.company || row.company || '',
      phone: normalized.phone || row.phone || '',
      markets: Array.isArray(normalized.markets) && normalized.markets.length ? normalized.markets : normalizeExplicitMarkets(row.markets || row.buyerPortalSubmission?.markets),
      assetTypes: Array.isArray(normalized.assetTypes) && normalized.assetTypes.length ? normalized.assetTypes : getDisplayList(row.assetTypes, row.buyerPortalSubmission?.assetTypes),
      status: row.status && !String(row.status).includes('Pending') ? row.status : 'Verified Buyer',
      verificationStatus: 'Verified Buyer',
      source: 'Buyer Portal',
      buyerPortalSubmission: row.buyerPortalSubmission || true,
      buyerPortalSubmissionId: row.buyerPortalSubmissionId,
      rawPortalSubmission: row.rawPortalSubmission,
      proofFiles: row.proofFiles || row.uploadedFiles || [],
      uploadedFiles: row.uploadedFiles || row.proofFiles || [],
      tags: Array.from(new Set([...(Array.isArray(normalized.tags) ? normalized.tags : []), 'Buyer Portal', 'Verified Buyer'])),
      notes: portalNotes,
      blastEligible: true,
      updatedAt: new Date().toISOString(),
    }
  }

  const approvePortalRows = async (rows: any[]) => {
    if (!rows.length) {
      toast.error('No valid buyer portal rows selected for approval.')
      return
    }

    let approved = 0
    let merged = 0
    let skippedInvalid = 0
    let failed = 0
    const approvedIds: string[] = []
    const seenEmails = new Set<string>()
    const existingEmails = new Set((buyers || []).map((b: any) => safeLower(b.email).trim()).filter(Boolean))

    setPortalApprovalSummary('')

    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase()

      if (!isValidBuyerEmail(email)) {
        skippedInvalid++
        setPendingPortalImport(prev => prev.map((r: any) => r._id === row._id ? { ...r, _valid: false, _error: 'Valid email is required for approval.' } : r))
        continue
      }

      setPortalApprovalStatus(prev => ({ ...prev, [row._id]: 'approving' }))

      try {
        const buyerToApprove = buildApprovedPortalBuyer({ ...row, email })
        const wasDuplicate = existingEmails.has(email) || seenEmails.has(email)
        const saveResult = await upsertBuyersToSupabase([buyerToApprove])

        if (!saveResult.ok) {
          failed++
          setPortalApprovalStatus(prev => ({ ...prev, [row._id]: 'failed' }))
          setPendingPortalImport(prev => prev.map((r: any) => r._id === row._id ? { ...r, _error: saveResult.error || 'Buyer import failed.' } : r))
          continue
        }

        if (row.buyerPortalSubmissionId) {
          await markBuyerPortalSubmissionsImported([row.buyerPortalSubmissionId])
        }

        approved++
        if (wasDuplicate) merged++
        seenEmails.add(email)
        existingEmails.add(email)
        approvedIds.push(row._id)
        setPortalApprovalStatus(prev => ({ ...prev, [row._id]: 'approved' }))
      } catch (error: any) {
        failed++
        setPortalApprovalStatus(prev => ({ ...prev, [row._id]: 'failed' }))
        setPendingPortalImport(prev => prev.map((r: any) => r._id === row._id ? { ...r, _error: error?.message || 'Buyer import failed.' } : r))
      }
    }

    if (approvedIds.length) {
      setPendingPortalImport(prev => prev.filter((r: any) => !approvedIds.includes(r._id)))
    }

    const cloud = await fetchBuyersFromSupabase()
    if (cloud.ok) {
      useAppStore.setState({ buyers: Array.isArray(cloud.data) ? cloud.data as any : [] })
    } else {
      console.warn('[Deal Blast Pro] Buyer reload after portal approval failed:', cloud.error)
      if (approved > 0) toast.warning('Approved buyers saved, but the buyer list refresh needs review.')
    }

    const summary = `Approved: ${approved} | Merged duplicates: ${merged} | Skipped invalid: ${skippedInvalid} | Failed: ${failed}`
    setPortalApprovalSummary(summary)
    void refreshBuyerPortalQueueCount()

    if (approved > 0 && failed === 0 && skippedInvalid === 0) {
      toast.success(summary)
    } else if (approved > 0) {
      toast.warning(summary)
    } else if (failed > 0) {
      toast.error('Buyer import requires owner-scoped buyer storage. No buyers were imported.')
    } else {
      toast.error(summary)
    }
  }

  const skipPortalInvalid = async () => {
    const rowsToResolve = pendingPortalImport.filter(r => r._valid === false || r._dup)
    const submissionIds = rowsToResolve.map((r: any) => r.buyerPortalSubmissionId).filter(Boolean)

    try {
      if (submissionIds.length) {
        await markBuyerPortalSubmissionsDismissed(submissionIds)
      }

      setPendingPortalImport(prev => prev.filter(r => r._valid !== false && !r._dup))
      void refreshBuyerPortalQueueCount()
      toast.success(rowsToResolve.length ? 'Resolved duplicate and invalid portal submissions.' : 'No duplicate or invalid portal submissions to skip.')
    } catch (error) {
      console.error(error)
      toast.error('Could not resolve duplicate or invalid portal submissions.')
    }
  }

  const approveSelected = async (rowsOverride?: any[]) => {
    const sourceRows = Array.isArray(rowsOverride) ? rowsOverride : pendingImport
    const toApprove = sourceRows.filter(r => r._valid !== false)
    if (toApprove.length === 0) return
    setImportApprovalSummary('')
    setImportApprovalStatus(prev => ({
      ...prev,
      ...Object.fromEntries(toApprove.map((row: any) => [row._id, 'approving']))
    }))

    const buyersToApprove = toApprove.map(({_id, _dup, _valid, _merge, buyerPortalSubmissionId, buyerPortalSubmission, rawPortalSubmission, ...rest}) =>
      buildBuyerStrategyUpdate(normalizeBuyerBeforeApproval(rest))
    )

    const result = importBuyers(buyersToApprove)

    const saveResult = await upsertBuyersToSupabase(buyersToApprove)
    if (!saveResult.ok) {
      setImportApprovalStatus(prev => ({
        ...prev,
        ...Object.fromEntries(toApprove.map((row: any) => [row._id, 'failed']))
      }))
      setImportApprovalSummary('Approval failed. Buyer import requires owner-scoped buyer storage. No buyers were imported.')
      toast.error('Buyer approval failed before Supabase save: ' + saveResult.error)
      return
    }

    const cloud = await fetchBuyersFromSupabase()
    if (cloud.ok) {
      useAppStore.setState({ buyers: Array.isArray(cloud.data) ? cloud.data as any : [] })
    } else {
      console.warn('[Deal Blast Pro] Buyer reload after approval failed:', cloud.error)
    }

    toast.success(`Approved ${toApprove.length} buyers (${result.added} new, ${result.dups} dups handled)`)
    setImportApprovalStatus(prev => ({
      ...prev,
      ...Object.fromEntries(toApprove.map((row: any) => [row._id, 'approved']))
    }))
    setImportApprovalSummary(`Approved: ${toApprove.length} | Merged duplicates: ${result.dups} | Skipped invalid: ${sourceRows.length - toApprove.length} | Failed: 0`)

    if (Array.isArray(rowsOverride)) {
      const approvedIds = new Set(toApprove.map((row: any) => row._id))
      setPendingImport(prev => prev.filter((row: any) => !approvedIds.has(row._id)))
    } else {
      setPendingImport([])
    }
    setImportResult(null)
    if (!Array.isArray(rowsOverride)) setShowImport(false)
  }
  const approveAllValid = () => approveSelected()


  const downloadSelectedBuyerProfiles = () => {
    const selectedBuyers = buyers.filter((buyer: any) => selectedBuyerIds.includes(buyer.id))

    if (!selectedBuyers.length) {
      toast.error('Select at least one buyer to download')
      return
    }

    const formatList = (value: any) => {
      if (Array.isArray(value)) return value.filter(Boolean).join('; ')
      if (value === null || value === undefined) return ''
      return String(value)
    }

    const formatMoney = (value: any) => {
      if (value === null || value === undefined || value === '') return ''
      const numberValue = Number(String(value).replace(/[$,\s]/g, ''))
      if (!Number.isFinite(numberValue)) return String(value)
      return '$' + numberValue.toLocaleString()
    }

    const csvCell = (value: any) => {
      const text = formatList(value).replace(/\r?\n/g, ' ').trim()
      return '"' + text.replace(/"/g, '""') + '"'
    }

    const headers = [
      'Buyer Name',
      'Email',
      'Company',
      'Phone',
      'Mobile',
      'Buyer Type',
      'Status',
      'Target Markets',
      'Asset Focus',
      'Zip Codes',
      'Budget Min',
      'Budget Max',
      'Down Payment Max',
      'Monthly Payment Max',
      'Bed Requirement',
      'Bath Requirement',
      'Unit Requirement',
      'Creative Finance',
      'Seller Finance',
      'Cash Buyer',
      'Nationwide',
      'Exit Strategies',
      'Other Strategy',
      'Tags',
      'Source',
      'Notes',
      'Heat Score',
      'Strength Score',
      'Created At',
      'Updated At'
    ]

    const rows = selectedBuyers.map((buyer: any) => [
      buyer.name,
      buyer.email,
      buyer.company,
      buyer.phone,
      buyer.mobile,
      buyer.buyerType || buyer.type,
      buyer.status,
      buyer.targetMarkets || buyer.markets,
      buyer.assetFocus || buyer.assetTypes,
      buyer.zipCodes,
      formatMoney(buyer.budgetMin),
      formatMoney(buyer.budgetMax || buyer.budget),
      formatMoney(buyer.downPaymentMax),
      formatMoney(buyer.monthlyPaymentMax),
      buyer.bedRequirement,
      buyer.bathRequirement,
      buyer.unitRequirement,
      buyer.creativeFinance ? 'Yes' : 'No',
      buyer.sellerFinance ? 'Yes' : 'No',
      buyer.cashBuyer ? 'Yes' : 'No',
      buyer.nationwide ? 'Yes' : 'No',
      normalizeBuyerStrategies(buyer),
      buyer.otherStrategy || buyer.other_strategy,
      buyer.tags,
      buyer.source,
      buyer.buyBoxSummary || buyer.notes,
      buyer.heatScore,
      buyer.strengthScore,
      buyer.createdAt || buyer.created_at,
      buyer.updatedAt || buyer.updated_at
    ])

    const csv = '\ufeff' + [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'deal-blast-pro-selected-buyer-profiles-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    toast.success('Downloaded ' + selectedBuyers.length + ' buyer profile' + (selectedBuyers.length === 1 ? '' : 's'))
  }
  const skipInvalid = () => {
    setPendingImport(prev => prev.filter(r => r._valid !== false && !r._dup))
  }

  const importRowMissingCriteria = (row: any) =>
    !(Array.isArray(row.markets) && row.markets.length) ||
    !(Array.isArray(row.assetTypes) && row.assetTypes.length) ||
    !(Number(row.budgetMax || 0) > 0 || Number(row.budgetMin || 0) > 0)

  const importReviewRows = pendingImport.filter((row: any) => {
    const haystack = [
      row.name,
      row.email,
      row.company,
      row.phone,
      row.type,
      row.status,
      normalizeBuyerStrategies(row).join(' '),
      Array.isArray(row.markets) ? row.markets.join(' ') : row.markets,
      Array.isArray(row.assetTypes) ? row.assetTypes.join(' ') : row.assetTypes,
      row.notes,
    ].filter(Boolean).join(' ').toLowerCase()
    const query = importReviewSearch.trim().toLowerCase()
    if (query && !haystack.includes(query)) return false

    if (importReviewFilter === 'valid') return row._valid !== false
    if (importReviewFilter === 'invalid') return row._valid === false
    if (importReviewFilter === 'duplicate') return Boolean(row._dup)
    if (importReviewFilter === 'missingCriteria') return importRowMissingCriteria(row)
    if (importReviewFilter === 'hot') return String(row.status || '').toLowerCase() === 'hot'
    return true
  })

  const importSummary = {
    total: pendingImport.length,
    validEmails: pendingImport.filter((row: any) => row._valid !== false).length,
    duplicates: pendingImport.filter((row: any) => row._dup).length,
    missingNames: pendingImport.filter((row: any) => !String(row.name || '').trim()).length,
    missingCompany: pendingImport.filter((row: any) => !String(row.company || '').trim()).length,
    missingMarkets: pendingImport.filter((row: any) => !(Array.isArray(row.markets) && row.markets.length)).length,
    missingBudget: pendingImport.filter((row: any) => !(Number(row.budgetMax || 0) > 0 || Number(row.budgetMin || 0) > 0)).length,
    ready: pendingImport.filter((row: any) => row._valid !== false).length,
  }

  const approveVisibleImportRows = async () => {
    await approveSelected(importReviewRows)
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <div>
          <div className="text-xs tracking-[1.5px] text-[#8B92A3]">ASSET STRATEGY</div>
          <div className="text-2xl font-semibold">Global Buyer Database - {buyers.length} records</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAddBuyer(true)} className="btn btn-primary flex items-center gap-2">
            Add Buyer
          </button>
          <button onClick={importBuyerPortalQueue} className="btn btn-ghost flex items-center gap-2 text-[#22C55E]">
            {buyerPortalQueueCount > 0 ? 'Import Buyer Portal Queue (' + buyerPortalQueueCount + ')' : 'Import Buyer Portal Queue'}
          </button>
          <button onClick={() => setShowImport(true)} className="btn btn-ghost flex items-center gap-2">
            <Upload size={16} /> Import Buyers (CSV / TXT)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <button onClick={() => { setActiveFilters(prev => prev.filter(f => f !== 'duplicates')); setShowDuplicatePanel(false); }} className="card p-3 text-left hover:border-[#3B82F6]/50">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8B92A3]">Total Buyers</div>
          <div className="text-2xl font-semibold">{buyers.length.toLocaleString()}</div>
        </button>
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8B92A3]">Showing</div>
          <div className="text-2xl font-semibold tabular-nums">{paginatedBuyers.length.toLocaleString()} / {filtered.length.toLocaleString()}</div>
          <div className="text-[10px] text-[#8B92A3]">Page {safeBuyerPage}: buyers {filtered.length ? buyerPageStartIndex + 1 : 0}-{buyerPageEndIndex} of {filtered.length.toLocaleString()}</div>
        </div>
        <button onClick={() => { setActiveFilters(prev => prev.includes('duplicates') ? prev.filter(f => f !== 'duplicates') : [...prev, 'duplicates']); setShowDuplicatePanel(true); }} className={'card p-3 text-left hover:border-amber-400/50 ' + (activeFilters.includes('duplicates') ? 'border-amber-400/60 bg-amber-500/10' : '')}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8B92A3]">Duplicate Groups</div>
          <div className="text-2xl font-semibold text-amber-300">{duplicateGroups.length.toLocaleString()}</div>
        </button>
        <button onClick={() => { setActiveFilters(prev => prev.includes('duplicates') ? prev : [...prev, 'duplicates']); setShowDuplicatePanel(true); }} className="card p-3 text-left hover:border-amber-400/50">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8B92A3]">Duplicate Records</div>
          <div className="text-2xl font-semibold text-amber-300">{duplicateRecordCount.toLocaleString()}</div>
        </button>
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8B92A3]">New / Pending</div>
          <div className="text-2xl font-semibold text-[#22C55E]">{newBuyerCount.toLocaleString()} / {pendingReviewCount.toLocaleString()}</div>
        </div>
      </div>

      {true && (
        <div data-testid="buyer-submission-review-alert" className="mb-3 card p-3 border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-amber-300">Buyer Portal Review Center</div>
            <div className="text-xs text-[#8B92A3]">
              {buyerPortalQueueCount > 0 ? buyerPortalQueueCount + ' verified buyer portal submission' + (buyerPortalQueueCount === 1 ? '' : 's') + ' waiting in the review queue.' : 'No buyer portal submissions waiting right now.'}
              {buyerPortalQueueCount === 0 ? ' Send buyers to the public Buyer Portal, then refresh this review center.' : ''}
            </div>
          </div>
          <button onClick={importBuyerPortalQueue} className={buyerPortalQueueCount > 0 ? 'btn btn-primary text-xs' : 'btn btn-ghost text-xs'}>
            Open Buyer Review
          </button>
        </div>
      )}

      {/* Tabs for All Buyers / Segments / Lists */}
      <div className="flex gap-2 mb-3 text-sm border-b border-[#252A38] pb-1">
        <button onClick={() => { setActiveTab('all'); setCurrentListId(null); setSelectedSegment(null); }} className={`px-3 py-1 ${activeTab === 'all' ? 'border-b-2 border-[#22C55E] font-medium' : 'text-[#8B92A3]'}`}>All Buyers</button>
        <button onClick={() => { setActiveTab('segments'); setCurrentListId(null); setSelectedSegment(null); }} className={`px-3 py-1 ${activeTab === 'segments' ? 'border-b-2 border-[#22C55E] font-medium' : 'text-[#8B92A3]'}`}>Saved Segments</button>
        <button onClick={() => { setActiveTab('lists'); setCurrentListId(null); setSelectedSegment(null); }} className={`px-3 py-1 ${activeTab === 'lists' ? 'border-b-2 border-[#22C55E] font-medium' : 'text-[#8B92A3]'}`}>Custom Lists</button>
      </div>

      {(activeTab === 'all' || (activeTab === 'lists' && currentListId) || (activeTab === 'segments' && selectedSegment)) && (
      <div className="flex gap-3 mb-4">
        <input
          type="search"
          className="input w-full min-w-[260px] sm:w-[320px] lg:w-[380px] flex-none"
          placeholder="Search name, email, market..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('');
          }}
        />
        <select className="select text-xs" value={sortMode} onChange={e => setSortMode(e.target.value)}>
          <option value="heat-high">Sort: Heat High to Low</option>
          <option value="strength-high">Sort: Strength High to Low</option>
          <option value="budget-high">Sort: Budget High to Low</option>
          <option value="budget-low">Sort: Budget Low to High</option>
          <option value="recent">Sort: Recently Added</option>
          <option value="type">Sort: Buyer Type</option>
          <option value="name-az">Sort: Name A to Z</option>
        </select>

        <div className="flex gap-1 text-xs">
          <button 
            onClick={() => setActiveFilters(prev => prev.includes('creative') ? prev.filter(x => x !== 'creative') : [...prev, 'creative'])} 
            className={`btn btn-ghost px-2 py-0.5 text-[10px] ${activeFilters.includes('creative') ? 'ring-1 ring-emerald-500 text-emerald-400' : ''}`}
          >Creative Finance</button>
          <button 
            onClick={() => setActiveFilters(prev => prev.includes('hot') ? prev.filter(x => x !== 'hot') : [...prev, 'hot'])} 
            className={`btn btn-ghost px-2 py-0.5 text-[10px] ${activeFilters.includes('hot') ? 'ring-1 ring-orange-500 text-orange-400' : ''}`}
          >Hot</button>
          <button 
            onClick={() => setActiveFilters(prev => prev.includes('seller') ? prev.filter(x => x !== 'seller') : [...prev, 'seller'])} 
            className={`btn btn-ghost px-2 py-0.5 text-[10px] ${activeFilters.includes('seller') ? 'ring-1 ring-amber-500 text-amber-400' : ''}`}
          >Seller Finance</button>
          <button 
            onClick={() => setActiveFilters(prev => prev.includes('cash') ? prev.filter(x => x !== 'cash') : [...prev, 'cash'])} 
            className={`btn btn-ghost px-2 py-0.5 text-[10px] ${activeFilters.includes('cash') ? 'ring-1 ring-sky-500 text-sky-400' : ''}`}
          >Cash Buyers</button>
          <button 
            onClick={() => setActiveFilters(prev => prev.includes('hedge') ? prev.filter(x => x !== 'hedge') : [...prev, 'hedge'])} 
            className={`btn btn-ghost px-2 py-0.5 text-[10px] ${activeFilters.includes('hedge') ? 'ring-1 ring-purple-500 text-purple-400' : ''}`}
          >Hedge Funds</button>
          <button
            onClick={() => setActiveFilters(prev => prev.includes('pendingReview') ? prev.filter(f => f !== 'pendingReview') : [...prev, 'pendingReview'])}
            className={'btn btn-ghost text-xs ' + (activeFilters.includes('pendingReview') ? 'ring-1 ring-amber-400 text-amber-300' : '')}
          >Pending Review</button>
          <button
            onClick={() => { setActiveFilters(prev => prev.includes('duplicates') ? prev.filter(f => f !== 'duplicates') : [...prev, 'duplicates']); setShowDuplicatePanel(true); }}
            className={'btn btn-ghost text-xs ' + (activeFilters.includes('duplicates') ? 'ring-1 ring-amber-400 text-amber-300' : '')}
          >Duplicates</button>
        </div>

        <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`btn btn-ghost text-xs ${showAdvancedFilters ? 'ring-1 ring-blue-500' : ''}`}>Advanced Filters</button>
        <button onClick={() => { setSearch(''); setSortMode('heat-high'); setActiveFilters([]); setShowAdvancedFilters(false); setShowDuplicatePanel(false); setCurrentListId(null); setSelectedSegment(null); }} className="btn btn-ghost text-xs">Clear Filters</button>
        <button onClick={() => setSelectedBuyerIds(filtered.map(b => b.id))} className="btn btn-ghost text-xs">Select All</button>
        <button onClick={() => setSelectedBuyerIds([])} className="btn btn-ghost text-xs">Deselect All</button>
      </div>
      )}

      {/* Simple Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="mb-3 p-3 bg-[#171B26] rounded text-xs">
          <div className="flex flex-wrap gap-2">
            <select className="select text-xs py-1 w-40" value={activeFilters.find(f => f.startsWith('state:'))?.split(':')[1] || 'All States'} onChange={e => {
              const val = e.target.value;
              if (val === 'All States') {
                setActiveFilters(prev => prev.filter(x => !x.startsWith('state:')));
              } else {
                setActiveFilters(prev => [...new Set([...prev.filter(x => !x.startsWith('state:')), `state:${val}`])]);
              }
            }}>
              <option value="All States">All States</option>
              <option value="Nationwide">Nationwide</option>
              <option value="Any">Any</option>
              <option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option><option value="AR">AR</option>
              <option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option>
              <option value="FL">FL</option><option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option>
              <option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option><option value="KS">KS</option>
              <option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option><option value="MD">MD</option>
              <option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option>
              <option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option><option value="NV">NV</option>
              <option value="NH">NH</option><option value="NJ">NJ</option><option value="NM">NM</option><option value="NY">NY</option>
              <option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option>
              <option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option><option value="SC">SC</option>
              <option value="SD">SD</option><option value="TN">TN</option><option value="TX">TX</option><option value="UT">UT</option>
              <option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option>
              <option value="WI">WI</option><option value="WY">WY</option>
            </select>
            <select className="select text-xs py-1 w-40" value={activeFilters.find(f => f.startsWith('asset:'))?.split(':')[1] || 'All Asset Types'} onChange={e => {
              const val = e.target.value;
              if (val === 'All Asset Types') {
                setActiveFilters(prev => prev.filter(x => !x.startsWith('asset:')));
              } else {
                setActiveFilters(prev => [...new Set([...prev.filter(x => !x.startsWith('asset:')), `asset:${val}`])]);
              }
            }}>
              <option value="All Asset Types">All Asset Types</option>
              <option value="Single Family">Single Family</option>
              <option value="Multifamily">Multifamily</option>
              <option value="Small Multifamily">Small Multifamily</option>
              <option value="Mobile Home Park">Mobile Home Park</option>
              <option value="Hotel">Hotel</option>
              <option value="Retail">Retail</option>
              <option value="Storage">Storage</option>
              <option value="Land">Land</option>
              <option value="Mixed Use">Mixed Use</option>
              <option value="Commercial">Commercial</option>
              <option value="Industrial">Industrial</option>
              <option value="Office">Office</option>
              <option value="Development">Development</option>
              <option value="Build-to-Rent">Build-to-Rent</option>
              <option value="Notes">Notes</option>
              <option value="Creative Finance">Creative Finance</option>
            </select>
            <select className="select text-xs py-1 w-44" value={activeFilters.find(f => f.startsWith('strategy:'))?.slice('strategy:'.length) || 'All Exit Strategies'} onChange={e => {
              const val = e.target.value;
              if (val === 'All Exit Strategies') {
                setActiveFilters(prev => prev.filter(x => !x.startsWith('strategy:')));
              } else {
                setActiveFilters(prev => [...new Set([...prev.filter(x => !x.startsWith('strategy:')), `strategy:${val}`])]);
              }
            }}>
              <option value="All Exit Strategies">All Exit Strategies</option>
              {EXIT_STRATEGIES.map(strategy => (
                <option key={strategy} value={strategy}>{strategy}</option>
              ))}
            </select>
            <button onClick={() => setActiveFilters([])} className="btn btn-ghost text-xs">Clear All Filters</button>
          </div>
          <div className="text-[10px] text-[#8B92A3] mt-1">Active: {activeFilters.length ? activeFilters.join(', ') : 'None'} (search + buttons also apply)</div>
        </div>
      )}

      {showDuplicatePanel && (
        <div className="mb-3 card p-3 border border-amber-500/40 bg-amber-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <div className="font-semibold text-amber-300">Duplicate Review</div>
              <div className="text-xs text-[#8B92A3]">Email matches are strongest. Phone matches are strong. Name + market matches are review-only, so merge carefully.</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setActiveFilters(prev => prev.includes('duplicates') ? prev : [...prev, 'duplicates'])} className="btn btn-ghost text-xs">Show Only Duplicates</button>
              <button onClick={() => { setShowDuplicatePanel(false); setActiveFilters(prev => prev.filter(f => f !== 'duplicates')); }} className="btn btn-ghost text-xs">Close</button>
            </div>
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="text-sm text-[#8B92A3]">No duplicate groups found.</div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
              {duplicateGroups.slice(0, 50).map(group => (
                <div key={group.key} className="rounded-lg border border-[#252A38] bg-[#0F131D] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold">{group.label} <span className="text-xs text-[#8B92A3]">({group.buyers.length} records)</span></div>
                    <button onClick={() => setSelectedBuyerIds(group.buyers.map((buyer: any) => buyer.id))} className="btn btn-ghost text-xs px-2 py-1">Select Group</button>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {group.buyers.map((buyer: any) => (
                      <div key={buyer.id} className="rounded border border-[#252A38] p-2 text-xs bg-[#111827]">
                        <div className="font-semibold text-white">{getDisplayName(buyer)}</div>
                        <div className="text-blue-400 truncate">{buyer.email || 'Email Missing'}</div>
                        <div className="text-[#8B92A3]">{getDisplayPhone(buyer) || 'Phone Missing'}</div>
                        <div className="text-[#8B92A3] truncate">{getMarketDisplayList(buyer.markets, buyer.targetMarkets, buyer.target_markets, buyer.states, buyer.locations, buyer.target_states).join(', ') || 'Market Missing'}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <button onClick={() => { const hydrated = hydrateBuyerForEdit(buyer); setSelectedBuyer(hydrated as any); setEditBuyer(hydrated); }} className="btn btn-ghost px-2 py-1 text-[10px]">Open</button>
                          <button onClick={() => mergeBuyerRecords(buyer, group.buyers.filter((row: any) => row.id !== buyer.id))} className="btn btn-ghost px-2 py-1 text-[10px] text-[#22C55E]">Keep + Merge Others</button>
                          <button onClick={() => deleteDuplicateRecord(buyer)} className="btn btn-ghost px-2 py-1 text-[10px] text-red-400">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {duplicateGroups.length > 50 && <div className="text-xs text-[#8B92A3]">Showing first 50 duplicate groups. Use search/filter to narrow more.</div>}
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      {selectedBuyerIds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs bg-[#171B26] p-2 rounded">
          <span className="text-[#8B92A3] mr-2">{selectedBuyerIds.length} selected</span>
          <button onClick={() => { /* export BCC */ const emails = buyers.filter(b => selectedBuyerIds.includes(b.id)).map(b => b.email).join(', '); navigator.clipboard.writeText(emails); toast.success('BCC copied'); }} className="btn btn-ghost px-2 py-0.5">Export BCC</button>
          <button onClick={downloadSelectedBuyerProfiles} className="btn btn-ghost px-2 py-0.5 text-[#22C55E]">Download Profiles</button>
          <button onClick={() => { selectedBuyerIds.forEach(id => { const b = buyers.find(x => x.id === id); if (b) addToSuppression(b.email); }); setSelectedBuyerIds([]); toast.success('Suppressed selected'); }} className="btn btn-ghost px-2 py-0.5 text-amber-400">Suppress Selected</button>
          <button onClick={async () => {
            const idsToDelete = Array.from(new Set<string>(selectedBuyerIds.filter(Boolean) as string[]))
            if (idsToDelete.length === 0) return

            if (confirm(`Delete ${idsToDelete.length} selected buyer(s) from this app AND Supabase? This cannot be undone.`)) {
              const removeSet = new Set(idsToDelete)

              const result = await deleteBuyersFromSupabase(idsToDelete)
              if (!result.ok) {
                toast.error('Supabase delete failed: ' + result.error)
                return
              }

              useAppStore.setState((state: any) => {
                const nextBuyerResponses = { ...(state.buyerResponses || {}) }
                idsToDelete.forEach(id => delete nextBuyerResponses[id])

                const nextDealSuppressions: any = {}
                Object.entries(state.dealSuppressions || {}).forEach(([dealId, rows]: any) => {
                  nextDealSuppressions[dealId] = Array.isArray(rows)
                    ? rows.filter((row: any) => !removeSet.has(row.buyerId))
                    : rows
                })

                return {
                  buyers: (state.buyers || []).filter((b: any) => !removeSet.has(b.id)),
                  viewedBuyerIds: (state.viewedBuyerIds || []).filter((id: string) => !removeSet.has(id)),
                  buyerResponses: nextBuyerResponses,
                  dealSuppressions: nextDealSuppressions,
                  followUps: (state.followUps || []).filter((f: any) => !removeSet.has(f.buyerId)),
                }
              })

              setBuyerLists(prev => prev.map(list => ({
                ...list,
                buyerIds: (list.buyerIds || []).filter((id: string) => !removeSet.has(id)),
                updatedAt: Date.now()
              })))

              setSelectedBuyerIds([])
              if (selectedBuyer && removeSet.has(selectedBuyer.id)) setSelectedBuyer(null)

              toast.success(`Deleted ${idsToDelete.length} buyer${idsToDelete.length === 1 ? "" : "s"} from Supabase`)
            }
          }} className="btn btn-ghost px-2 py-0.5 text-red-400">Delete Selected</button>
          {selectedBuyerIds.length === buyers.length && buyers.length > 0 && (
            <button onClick={async () => {
              const allIds = (buyers || []).map((b: any) => b.id).filter(Boolean)
              if (!allIds.length) return
              if (!confirm('CLEAR ALL buyers from Supabase and the app? This is permanent.')) return

              const result = await deleteAllBuyersFromSupabase()
              if (!result.ok) {
                toast.error('Supabase clear failed: ' + result.error)
                return
              }

              useAppStore.setState((state: any) => ({
                buyers: [],
                viewedBuyerIds: [],
                buyerResponses: {},
                followUps: (state.followUps || []).filter((f: any) => !allIds.includes(f.buyerId)),
              }))
              setSelectedBuyerIds([])
              setSelectedBuyer(null)
              setBuyerLists(prev => prev.map(list => ({ ...list, buyerIds: [], updatedAt: Date.now() })))
              toast.success('Cleared all buyers from Supabase')
            }} className="btn btn-ghost px-2 py-0.5 text-red-300">Clear ALL Buyers</button>
          )}
          <button onClick={() => { setShowListModal(true); }} className="btn btn-ghost px-2 py-0.5 text-[#22C55E]">Add to List</button>
          {currentListId && <button onClick={() => {
            const list = buyerLists.find(l => l.id === currentListId);
            if (!list) return;
            const updatedLists = buyerLists.map(l => l.id === currentListId ? { ...l, buyerIds: (l.buyerIds || []).filter((id: string) => !selectedBuyerIds.includes(id)), updatedAt: Date.now() } : l);
            setBuyerLists(updatedLists);
            setSelectedBuyerIds([]);
            toast.success('Removed from list');
          }} className="btn btn-ghost px-2 py-0.5 text-red-400">Remove from List</button>}
          <button onClick={() => setSelectedBuyerIds([])} className="btn btn-ghost px-2 py-0.5">Clear Selection</button>
        </div>
      )}

      {(activeTab === 'all' || (activeTab === 'lists' && currentListId) || (activeTab === 'segments' && selectedSegment)) && (
      <>
        {renderBuyerPaginationControls('top')}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedBuyers.map(b => {
          const isSelected = selectedBuyerIds.includes(b.id);
          const buyerData: any = b && typeof (b as any).data === 'object' && (b as any).data ? (b as any).data : {};
          const buyerAny: any = {
            ...(b as any),
            ...buyerData,
            id: (b as any).id || buyerData.id,
            email: (b as any).email || buyerData.email || '',
            name: buyerData.name || (b as any).name,
            company: buyerData.company || (b as any).company,
            phone: buyerData.phone || (b as any).phone,
            markets: Array.isArray(buyerData.markets) && buyerData.markets.length ? buyerData.markets : (b as any).markets,
            targetMarkets: Array.isArray(buyerData.markets) && buyerData.markets.length ? buyerData.markets : (b as any).targetMarkets,
            // BUYER_ASSET_TOP_LEVEL_WINS_FIX_V1
            // After editing, the saved top-level assetTypes should win on the card.
            // Fall back to nested data only when the top-level list is blank.
            assetTypes: Array.isArray((b as any).assetTypes) && (b as any).assetTypes.length ? (b as any).assetTypes : buyerData.assetTypes,
            assetFocus: Array.isArray((b as any).assetTypes) && (b as any).assetTypes.length ? (b as any).assetTypes : (Array.isArray((b as any).assetFocus) && (b as any).assetFocus.length ? (b as any).assetFocus : buyerData.assetFocus),
            // Do not let old top-level 0/blank budget values hide valid nested data budgets on cards.
            budgetMin: parseBuyerMoneyValue((b as any).budgetMin, (b as any).budget_min, (b as any).minBudget, (b as any).min_budget) || parseBuyerMoneyValue(buyerData.budgetMin, buyerData.budget_min, buyerData.minBudget, buyerData.min_budget),
            budgetMax: parseBuyerMoneyValue((b as any).budgetMax, (b as any).budget_max, (b as any).maxBudget, (b as any).max_budget, (b as any).budget, (b as any).maxPrice, (b as any).max_price) || parseBuyerMoneyValue(buyerData.budgetMax, buyerData.budget_max, buyerData.maxBudget, buyerData.max_budget, buyerData.budget, buyerData.maxPrice, buyerData.max_price),
            creativeFinance: buyerData.creativeFinance ?? (b as any).creativeFinance,
            sellerFinance: buyerData.sellerFinance ?? (b as any).sellerFinance,
            cashBuyer: buyerData.cashBuyer ?? (b as any).cashBuyer,
            notes: firstMeaningfulBuyerText((b as any).notes, buyerData.notes, (b as any).buyBox, buyerData.buyBox, (b as any).buy_box, buyerData.buy_box, (b as any).criteria, buyerData.criteria),
            type: buyerData.type || (b as any).type || 'Buyer',
            buyerType: buyerData.type || (b as any).buyerType || (b as any).type || 'Buyer'
          };
          const strategyLabelsForCard = getBuyerStrategyLabelsForCard(buyerAny);
const company = getDisplayCompany(buyerAny) || 'Company Missing';
          const phone = getDisplayPhone(buyerAny) || 'Phone Missing';
          const assetTypesSafe = getDisplayList(
            buyerAny.assetTypes,
            buyerAny.asset_types,
            buyerAny.assetFocus,
            buyerAny.asset_focus,
            buyerAny.propertyTypes,
            buyerAny.property_types
          );
          const marketsSafe = (typeof getMarketDisplayList === 'function' ? getMarketDisplayList : getDisplayList)(
            buyerAny.markets,
            buyerAny.targetMarkets,
            buyerAny.target_markets,
            buyerAny.states,
            buyerAny.locations,
            buyerAny.target_states
          );
          const heatScore = useAppStore.getState().getBuyerHeatScore(b.id);
          const strScore = b.strengthScore || 65;

          return (
            <div key={b.id} className={`card interactive-border buyer p-4 hover:border-[#3B82F6]/40 relative group flex flex-col ${selectedBuyerIds.includes(b.id) ? 'is-selected' : ''}`} style={{ '--border-color': getBuyerBorderColor(b) } as any}>
              {/* HEADER */}
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toggleBuyerSelection(b.id); }} className="text-[#8B92A3] hover:text-white">
                    {isSelected ? <CheckSquare size={16} className="text-[#22C55E]" /> : <Square size={16} />}
                  </button>
                  <div className="font-semibold text-base">{getBuyerFullNameForCard(buyerAny)}</div>
                </div>
                {isNewBuyer(b.id) && <span className="badge bg-[#22C55E] text-black text-[10px] px-1.5 py-0">NEW</span>}
                {(b.status === 'Hot') && <span className="badge bg-orange-500 text-black text-[10px] px-1.5 py-0">HOT</span>}
                {(() => {
                  const count = buyerLists.filter(l => (l.buyerIds || []).includes(b.id)).length;
                  return count > 0 ? <span className="text-[9px] text-[#8B92A3] ml-1">Lists:{count}</span> : null;
                })()}
              </div>

              {/* CONTACT */}
              <div className="text-xs text-[#8B92A3] truncate">{company}</div>
              <div className="text-sm text-[#3B82F6] truncate">{b.email}</div>
              <div className="text-xs text-[#8B92A3] mb-1">{phone}</div>

              {/* TARGET MARKETS  up to 3 rows (collapse only on 4th row) */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[1px] text-[#8B92A3] mb-1 font-medium">Target Markets</div>
                <div className="flex flex-wrap gap-1.5 min-h-[18px]">
                  {(() => {
                    const states = marketsSafe.filter((m: string) => !/^(any|market missing)$/i.test(String(m || '').trim()));
                    const visible = (states.length ? states : ['Market Missing']).slice(0, 15);
                    const extra = Math.max(0, states.length - 15);
                    return (
                      <>
                        {visible.map((m: string, i: number) => (
                          <span key={i} className="badge bg-[#1F2937] text-[#93C5FD] text-[10px] px-1.5 py-0 flex items-center gap-0.5 border border-[#334155]">
                            <MapPin size={10} /> {m}
                          </span>
                        ))}
                        {extra > 0 && (
                          <Tooltip content={states.slice(15).join(', ')} position="top">
                            <span className="badge bg-[#1F2937] text-[#93C5FD] text-[10px] px-1.5 py-0 cursor-help border border-[#334155]">+{extra} more</span>
                          </Tooltip>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* ASSET FOCUS  SHOW ALL (up to 3 rows, no collapse) */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[1px] text-[#8B92A3] mb-1 font-medium">Asset Focus</div>
                <div className="flex flex-wrap gap-1.5 min-h-[18px]">
                  {(() => {
                    const buyerTextForAssets = [buyerAny.assetTypes, buyerAny.asset_types, buyerAny.assetFocus, buyerAny.asset_focus, buyerAny.propertyTypes, buyerAny.property_types, buyerAny.notes, buyerAny.rawText].flat().filter(Boolean).join(' ');
                    const assets = assetTypesSafe.filter((t: string) => {
                      const v = String(t || '').trim();
                      if (!v || /creative|seller finance|cash|hedge/i.test(v)) return false;
                      if (/^(sfh|sfr|single family)$/i.test(v) && !/\b(sfh|sfr|single\s*family|house|houses|1\s*-\s*4)\b/i.test(buyerTextForAssets)) return false;
                      return true;
                    });

                    const normalize = (s: string) => safeLower(s).replace(/[^a-z0-9]/g, '');
                    const iconMap: Record<string, any> = {
                      'SFH': Home, 'Single Family': Home, 'SingleFamily': Home,
                      'Multifamily': Building2, 'Multi Family': Building2,
                      'Small Multifamily': Building2, 'SmallMulti': Building2,
                      'MHP': Warehouse, 'Mobile Home': Warehouse,
                      'Hotel': Hotel,
                      'Retail': Store,
                      'Storage': Warehouse, 'Self Storage': Warehouse,
                      'Land': MapPin,
                      'Mixed Use': Building2, 'Mixed-Use': Building2, 'MixedUse': Building2,
                      'Commercial': Building,
                      'Value-Add': TrendingUp, 'Value Add': TrendingUp, 'ValueAdd': TrendingUp,
                      'Fix & Flip': Flame, 'Fix and Flip': Flame, 'FixFlip': Flame,
                    };

                    const getAssetStyle = (t: string) => {
                      const k = normalize(t);
                      if (k.startsWith('sf') || k.includes('single')) return 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30';
                      if (k.includes('smallmulti') || k.includes('smallmf')) return 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30';
                      if (k.includes('multi')) return 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-400/30';
                      if (k === 'mhp' || k.includes('mobile')) return 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/30';
                      if (k.includes('hotel')) return 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-400/30';
                      if (k.includes('retail')) return 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30';
                      if (k.includes('storage')) return 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30';
                      if (k.includes('land')) return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30';
                      if (k.includes('mixed')) return 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30';
                      if (k.includes('commercial')) return 'bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/30';
                      if (k.includes('value')) return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30';
                      if (k.includes('fix') || k.includes('flip')) return 'bg-red-500/15 text-red-300 ring-1 ring-red-400/30';
                      return 'bg-[#1F2937] text-[#CBD5E1] ring-1 ring-[#334155]';
                    };
                    const getIconFor = (t: string) => {
                      const k = normalize(t);
                      if (k.startsWith('sf') || k.includes('single')) return Home;
                      if (k.includes('multi')) return Building2;
                      if (k === 'mhp' || k.includes('mobile')) return Warehouse;
                      if (k.includes('hotel')) return Hotel;
                      if (k.includes('retail')) return Store;
                      if (k.includes('storage')) return Warehouse;
                      if (k.includes('land')) return MapPin;
                      if (k.includes('mixed')) return Building2;
                      if (k.includes('commercial')) return Building;
                      if (k.includes('value')) return TrendingUp;
                      if (k.includes('fix') || k.includes('flip')) return Flame;
                      return Landmark;
                    };

                    return (
                      <>
                        {assets.map((t: string, i: number) => {
                          const IconComp = getIconFor(t) || iconMap[t];
                          const style = getAssetStyle(t);
                          const label = t.length > 14 ? t.slice(0, 12) + '...' : t;
                          return (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${style}`}
                              title={t}
                            >
                              {IconComp ? <IconComp size={13} /> : null}
                              <span>{label}</span>
                            </span>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* STRATEGY  up to 3 rows (collapse only on 4th row) */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[1px] text-[#8B92A3] mb-1 font-medium">Strategy</div>
                <div className="flex flex-wrap gap-1.5 min-h-[18px]">
                  {strategyLabelsForCard
                    .filter((strategy: string) => strategy && strategy !== 'Strategy Missing')
                    .slice(0, 6)
                    .map((strategy: string) => (
                      <span key={strategy} className="badge bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/50 text-[10px] px-1.5 py-0.5 flex items-center gap-1 border border-sky-400/30">
                        {strategy}
                      </span>
                    ))}
                  {strategyLabelsForCard.filter((strategy: string) => strategy && strategy !== 'Strategy Missing').length > 6 && (
                    <span className="badge bg-[#1F2937] text-[#C5CAD6] text-[10px] px-1.5 py-0.5 border border-[#374151]">
                      +{strategyLabelsForCard.filter((strategy: string) => strategy && strategy !== 'Strategy Missing').length - 6} more
                    </span>
                  )}
                  {strategyLabelsForCard.includes('Strategy Missing') && (
                    <span className="badge bg-[#1F2937] text-[#94A3B8] text-[10px] px-1.5 py-0.5 border border-[#334155]">
                      Strategy Missing
                    </span>
                  )}
                </div>
              </div>

              {/* BUDGET  polished centered green bar */}
              <div className="mt-auto">
                <div className="mt-3">
                  <div className="w-full rounded-xl bg-emerald-500/10 border border-emerald-900/50 px-4 py-2.5 text-center">
                    <div className="text-[10px] uppercase tracking-[1px] text-emerald-400/70 mb-0.5">Budget</div>
                    <div className="text-base font-semibold text-[#22C55E]">
                      {getBuyerBudgetDisplay(buyerAny)}
                    </div>
                  </div>
                </div>

                {/* HEAT / STR  glowing pills below budget */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/40 shadow-[0_0_4px_rgba(52,211,153,0.2)]">Heat {heatScore}</span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/40 shadow-[0_0_4px_rgba(52,211,153,0.2)]">STR {strScore}</span>
                </div>

                {/* ACTIONS  full width at bottom */}
                <div className="mt-3 pt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); markBuyerViewed(b.id); const hydrated = hydrateBuyerForEdit(b); setSelectedBuyer(hydrated as any); setEditBuyer(hydrated); }}
                  className="btn btn-ghost text-xs w-full py-2"
                >
                  Review &amp; Edit Profile
                </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>
        {filtered.length > buyersPerPage && renderBuyerPaginationControls('bottom')}
      </>
      )}

      {currentListId && (
        <div className="mb-2 text-xs bg-[#171B26] p-2 rounded flex items-center justify-between">
          Viewing list: <strong>{buyerLists.find(l => l.id === currentListId)?.name}</strong>
          <button onClick={() => setCurrentListId(null)} className="btn btn-ghost text-xs px-2 py-0.5">Show All</button>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="empty-state text-[#8B92A3]">
          {buyers.length === 0
            ? 'No buyers yet. Import a CSV/TXT list, add a buyer manually, or open the Buyer Portal Review Center after buyers submit criteria.'
            : 'No buyers match your search. Clear filters or search by name, email, market, or tag.'}
        </div>
      )}

      {/* Buyer Segments - only in segments tab */}
      {activeTab === 'segments' && (
      <div className="mt-8">
        <div className="font-medium mb-3 flex items-center justify-between">
          <span>Saved Buyer Segments</span>
          {selectedSegment && <button onClick={() => setSelectedSegment(null)} className="btn btn-ghost text-xs">Show All Segments</button>}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            { name: 'Alabama Buyers', filter: (b: any) => (b.markets ?? []).some((m: string) => m.includes('AL')) },
            { name: 'Nationwide Buyers', filter: (b: any) => (b.markets ?? []).some((m: string) => ['Nationwide','Any'].includes(m)) },
            { name: 'Creative Finance Buyers', filter: (b: any) => b.creativeFinance || b.sellerFinance },
            { name: 'Seller Finance Buyers', filter: (b: any) => b.sellerFinance },
            { name: 'Fix & Flip Buyers', filter: (b: any) => normalizeBuyerStrategies(b).includes('Fix & Flip') },
            { name: 'Buy & Hold Buyers', filter: (b: any) => normalizeBuyerStrategies(b).includes('Buy & Hold') },
            { name: 'Cash Buyers', filter: (b: any) => !b.creativeFinance && !b.sellerFinance },
            { name: 'Hot Buyers', filter: (b: any) => b.status === 'Hot' },
            { name: 'High Budget Buyers', filter: (b: any) => (b.budgetMax || 0) >= 1000000 },
            { name: 'Multifamily Buyers', filter: (b: any) => (b.assetTypes ?? []).includes('Multifamily') },
          ].map(seg => {
            const count = buyers.filter(seg.filter).length
            return (
              <div key={seg.name} className="card p-3">
                <div className="flex justify-between">
                  <div>{seg.name}</div>
                  <div className="text-[#22C55E]">{count}</div>
                </div>
                <button onClick={() => {
                  const list = buyers.filter(seg.filter).map(b => b.email).join(', ')
                  navigator.clipboard.writeText(list)
                  toast.success(`${count} emails copied for ${seg.name}`)
                }} className="btn btn-ghost text-xs mt-2">Copy Gmail BCC</button>
                <button onClick={() => setSelectedSegment(seg.name)} className="btn btn-ghost text-xs mt-2">View Buyers</button>
              </div>
            )
          })}
        </div>
        <div className="text-xs text-[#8B92A3] mt-2">Segments auto-update. Use in Blast Builder by filtering buyers first.</div>
      </div>
      )}

      {/* Buyer Custom Lists - only in lists tab */}
      {activeTab === 'lists' && (
      <div className="mt-8">
        <div className="font-medium mb-3 flex items-center justify-between">
          <span>Buyer Lists</span>
          <button onClick={() => { setCurrentListId(null); }} className="btn btn-ghost text-xs">Show All Buyers</button>
        </div>
        {buyerLists.length === 0 ? (
          <div className="text-xs text-[#8B92A3]">No custom lists yet. Select buyers and use "Add to List".</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {buyerLists.map(list => (
              <div key={list.id} className="card p-3">
                <div className="font-medium">{list.name}</div>
                <div className="text-xs text-[#8B92A3]">{(list.buyerIds || []).length} buyers - {new Date(list.createdAt).toLocaleDateString()}</div>
                {list.description && <div className="text-xs mt-1">{list.description}</div>}
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <button onClick={() => {
                    const emails = buyers.filter(b => (list.buyerIds || []).includes(b.id)).map(b => b.email).join(', ');
                    navigator.clipboard.writeText(emails);
                    toast.success(`BCC copied for ${list.name}`);
                  }} className="btn btn-ghost px-2 py-0.5">Copy BCC</button>
                  <button onClick={() => setCurrentListId(list.id)} className="btn btn-ghost px-2 py-0.5">View List</button>
                  <button onClick={() => {
                    if (confirm(`Delete list "${list.name}"?`)) {
                      setBuyerLists(prev => prev.filter(l => l.id !== list.id));
                      if (currentListId === list.id) setCurrentListId(null);
                    }
                  }} className="btn btn-ghost px-2 py-0.5 text-red-400">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Buyer Profile Drawer - Upgraded Flow-style Intelligence Profile */}
      {selectedBuyer && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={() => setSelectedBuyer(null)}>
          <div className="card w-full max-w-4xl max-h-[92vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <div className="text-2xl font-semibold">{getBuyerFullNameForCard(editBuyer || selectedBuyer)}</div>
                <div className="text-[#3B82F6]">{editBuyer.email || selectedBuyer.email}</div>
                <div className="text-xs mt-0.5 flex gap-3">
                  <span className="text-[#22C55E]">Heat: {useAppStore.getState().getBuyerHeatScore?.(selectedBuyer.id) ?? ''}</span>
                  <span>STR: {editBuyer.strengthScore || 65}</span>
                  <span className="text-amber-400">Status: {editBuyer.status || selectedBuyer.status}</span>
                </div>
                {/* Member of Lists */}
                {(() => {
                  const memberLists = buyerLists.filter(l => (l.buyerIds || []).includes(selectedBuyer.id));
                  if (memberLists.length === 0) return null;
                  return (
                    <div className="text-xs mt-1 text-[#8B92A3]">Member of: {memberLists.map(l => l.name).join(', ')}</div>
                  );
                })()}
              </div>
              <button onClick={() => setSelectedBuyer(null)}><X size={20} /></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
              {/* A. Core Information */}
              <div>
                <div className="font-semibold mb-2 text-base">Core Information</div>
                <div className="grid grid-cols-1 gap-2">
                  <div><div className="text-xs text-[#8B92A3]">Buyer Name</div><input className="input" value={editBuyer.name || editBuyer.buyerName || editBuyer.fullName || ''} onChange={e => setEditBuyer({...editBuyer, name: e.target.value, buyerName: e.target.value, fullName: e.target.value})} placeholder={getDisplayName(selectedBuyer)} /></div>
                  <div><div className="text-xs text-[#8B92A3]">Company / Entity</div><input className="input" value={editBuyer.company || ''} onChange={e => setEditBuyer({...editBuyer, company: e.target.value})} placeholder="Company / Entity" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="text-xs text-[#8B92A3]">Phone</div><input className="input" value={editBuyer.phone || ''} onChange={e => setEditBuyer({...editBuyer, phone: e.target.value})} placeholder="Phone" /></div>
                    <div><div className="text-xs text-[#8B92A3]">Mobile</div><input className="input" value={editBuyer.mobile || ''} onChange={e => setEditBuyer({...editBuyer, mobile: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="text-xs text-[#8B92A3]">Buyer Type</div><input className="input" value={editBuyer.type || ''} onChange={e => setEditBuyer({...editBuyer, type: e.target.value})} /></div>
                    <div><div className="text-xs text-[#8B92A3]">Status</div>
                      <select className="select min-w-[220px]" value={editBuyer.status || 'Active'} onChange={e => setEditBuyer({...editBuyer, status: e.target.value})}>
                        <option>Active</option><option>Hot</option><option>New</option><option>Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div><div className="text-xs text-[#8B92A3]">Lead Source / Channel</div><input className="input" value={editBuyer.leadSource || ''} onChange={e => setEditBuyer({...editBuyer, leadSource: e.target.value})} /></div>

                  <div>
<div className="text-xs text-[#8B92A3]">Notes / Buy Box Summary</div><textarea className="input h-20" value={firstMeaningfulBuyerText(editBuyer.notes, editBuyer.buyBox, editBuyer.buy_box, editBuyer.criteria, editBuyer.data?.notes, editBuyer.data?.buyBox, editBuyer.data?.buy_box, editBuyer.data?.criteria)} onChange={e => {
                  const nextNotes = e.target.value
                  setEditBuyer({
                    ...editBuyer,
                    notes: nextNotes,
                    buyBox: nextNotes,
                    buy_box: nextNotes,
                    criteria: nextNotes,
                    data: { ...(editBuyer.data || {}), notes: nextNotes, buyBox: nextNotes, buy_box: nextNotes, criteria: nextNotes }
                  })
                }} /></div>
                </div>
              </div>

              {/* B. Buy Box & Criteria */}
              <div>
                <div className="font-semibold mb-2 text-base">Buy Box & Criteria</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-xs text-[#8B92A3]">Budget Min</div><input className="input" type="number" value={displayBudgetInputValue(editBuyer.budgetMin)} onChange={e => setEditBuyer({...editBuyer, budgetMin: e.target.value})} /></div>
                  <div><div className="text-xs text-[#8B92A3]">Budget Max</div><input className="input" type="number" value={displayBudgetInputValue(editBuyer.budgetMax)} onChange={e => setEditBuyer({...editBuyer, budgetMax: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <div>
                    <div className="text-xs text-[#8B92A3]">Beds</div>
                    <select className="input" value={editBuyer.bedRequirement || 'Any'} onChange={e => setEditBuyer({...editBuyer, bedRequirement: e.target.value})}>
                      {BED_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-[#8B92A3]">Baths</div>
                    <select className="input" value={editBuyer.bathRequirement || 'Any'} onChange={e => setEditBuyer({...editBuyer, bathRequirement: e.target.value})}>
                      {BATH_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-[#8B92A3]">Units</div>
                    <select className="input" value={editBuyer.unitRequirement || 'Any'} onChange={e => setEditBuyer({...editBuyer, unitRequirement: e.target.value})}>
                      {UNIT_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-[#8B92A3]">Sq Ft Min</div>
                    <input className="input" type="number" value={editBuyer.sqftRequirement || ''} onChange={e => setEditBuyer({...editBuyer, sqftRequirement: e.target.value, squareFootageRequirement: e.target.value, minSqft: e.target.value})} />
                  </div>
                </div>
                <div className="mt-1 text-center text-sm font-medium text-[#22C55E]">
                  {getBuyerBudgetDisplay(editBuyer)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!editBuyer.creativeFinance} onChange={e => setEditBuyer({...editBuyer, creativeFinance: e.target.checked})} /> Creative Finance</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!editBuyer.sellerFinance} onChange={e => setEditBuyer({...editBuyer, sellerFinance: e.target.checked})} /> Seller Finance</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!editBuyer.cashBuyer} onChange={e => setEditBuyer({...editBuyer, cashBuyer: e.target.checked})} /> Cash Buyer</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!editBuyer.nationwide} onChange={e => setEditBuyer({...editBuyer, nationwide: e.target.checked})} /> Nationwide</label>
                </div>
                <div className="mt-3 rounded-lg border border-[#252A38] p-3">
                  <div className="font-semibold mb-2 text-sm">Seller Finance / Creative Terms</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs text-[#8B92A3]">Down Payment Max</div>
                      <input className="input" value={editBuyer.downPaymentMax || editBuyer.downPayment || ''} onChange={e => setEditBuyer({...editBuyer, downPaymentMax: e.target.value, downPayment: e.target.value, data: { ...(editBuyer.data || {}), downPaymentMax: e.target.value, downPayment: e.target.value }})} placeholder="$10K" />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3]">Monthly Payment Max</div>
                      <input className="input" value={editBuyer.monthlyPaymentMax || editBuyer.monthlyPayment || ''} onChange={e => setEditBuyer({...editBuyer, monthlyPaymentMax: e.target.value, monthlyPayment: e.target.value, data: { ...(editBuyer.data || {}), monthlyPaymentMax: e.target.value, monthlyPayment: e.target.value }})} placeholder="$1,000/mo" />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3]">Interest Rate Max</div>
                      <input className="input" value={editBuyer.interestRateMax || editBuyer.interestRate || ''} onChange={e => setEditBuyer({...editBuyer, interestRateMax: e.target.value, interestRate: e.target.value, data: { ...(editBuyer.data || {}), interestRateMax: e.target.value, interestRate: e.target.value }})} placeholder="7%" />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3]">Balloon Term</div>
                      <input className="input" value={editBuyer.balloonTerm || ''} onChange={e => setEditBuyer({...editBuyer, balloonTerm: e.target.value, data: { ...(editBuyer.data || {}), balloonTerm: e.target.value }})} placeholder="5 years" />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3]">Cap Rate Target</div>
                      <input className="input" value={editBuyer.capRateTarget || editBuyer.capRate || ''} onChange={e => setEditBuyer({...editBuyer, capRateTarget: e.target.value, capRate: e.target.value, data: { ...(editBuyer.data || {}), capRateTarget: e.target.value, capRate: e.target.value }})} placeholder="8% cap" />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3]">Creative Structure</div>
                      <input className="input" value={editBuyer.creativeStructure || editBuyer.creative_structure || ''} onChange={e => setEditBuyer({...editBuyer, creativeStructure: e.target.value, creative_structure: e.target.value, data: { ...(editBuyer.data || {}), creativeStructure: e.target.value, creative_structure: e.target.value }})} placeholder="Seller Finance, Subto, Wrap" />
                    </div>
                  </div>
                </div>
              </div>

              {/* C. Target States - All 50 + Nationwide/Any */}
              <div className="lg:col-span-2">
                <div className="font-semibold mb-1.5 text-base">Target States</div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {['Any','Nationwide','AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(st => {
                    const active = (editBuyer.markets || []).includes(st);
                    return <button key={st} type="button" onClick={() => {
                      const cur = editBuyer.markets || [];
                      const next = active ? cur.filter((x:string) => x !== st) : [...cur, st];
                      setEditBuyer({...editBuyer, markets: next});
                    }} className={`px-2 py-0.5 rounded border ${active ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#171B26] border-[#252A38] hover:border-[#3B82F6]'}`}>{st}</button>;
                  })}
                </div>
              </div>

              {/* D. Asset Focus */}
              <div className="lg:col-span-2">
                <div className="font-semibold mb-1.5 text-base">Asset Focus</div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {['SFH','Multifamily','MHP','Hotel','Retail','Storage','Land','Mixed-Use','Commercial','Any'].map(t => {
                    const active = (editBuyer.assetTypes || []).includes(t);
                    return <button key={t} type="button" onClick={() => {
                      const cur = editBuyer.assetTypes || [];
                      const next = active ? cur.filter((x:string)=>x!==t) : [...cur, t];
                      setEditBuyer({
                        ...editBuyer,
                        assetTypes: next,
                        assetFocus: next,
                        asset_focus: next,
                        propertyTypes: next,
                        property_types: next,
                        data: {
                          ...(editBuyer.data || {}),
                          assetTypes: next,
                          assetFocus: next,
                          asset_focus: next,
                          propertyTypes: next,
                          property_types: next,
                        }
                      });
                    }} className={`px-2 py-0.5 rounded border ${active ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#171B26] border-[#252A38] hover:border-[#3B82F6]'}`}>{t}</button>;
                  })}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="font-semibold mb-1.5 text-base">Exit Strategy</div>
                <StrategyChipSelector
                  value={getSelectedBuyerStrategies(editBuyer)}
                  otherValue={editBuyer.otherStrategy || editBuyer.other_strategy || ''}
                  onChange={(next) => setEditBuyer(buildBuyerStrategyUpdate({
                    ...editBuyer,
                    strategies: next,
                    strategy: next.join(', '),
                    exitStrategy: next.join(', '),
                    investmentStrategy: next.join(', '),
                  }))}
                  onOtherChange={(next) => setEditBuyer({
                    ...editBuyer,
                    otherStrategy: next,
                    other_strategy: next,
                    data: { ...(editBuyer.data || {}), otherStrategy: next, other_strategy: next },
                  })}
                />
              </div>

              <div className="lg:col-span-2 rounded-lg border border-[#252A38] bg-[#0B0F17] p-3">
                <div className="font-semibold mb-2 text-base text-[#22C55E]">Buyer Verification / Proof Files</div>
                <BuyerDocumentManager
                  files={getBuyerProofFiles(editBuyer).length ? getBuyerProofFiles(editBuyer) : getBuyerProofFiles(selectedBuyer)}
                  uploadedBy={user?.email || user?.name || 'Admin Reviewer'}
                  contextId={editBuyer.id || selectedBuyer.id || editBuyer.email || 'buyer-edit'}
                  onChange={(nextDocs) => setEditBuyer({
                    ...editBuyer,
                    proofFiles: nextDocs,
                    uploadedFiles: nextDocs,
                    data: { ...(editBuyer.data || {}), proofFiles: nextDocs, uploadedFiles: nextDocs },
                  })}
                />
              </div>
            </div>

            {/* Match History */}
            <div className="mt-5">
              <div className="font-medium text-sm mb-2">Match History</div>
              <div className="space-y-1 text-xs max-h-48 overflow-auto">
                {getBuyerMatchHistory(selectedBuyer.id).length === 0 && <div className="text-[#8B92A3]">No match history yet.</div>}
                {getBuyerMatchHistory(selectedBuyer.id).slice(0, 6).map((h: any, idx: number) => (
                  <div key={idx} className="panel p-2 flex justify-between text-[10px]">
                    <span onClick={() => { setSelectedBuyer(null); useAppStore.getState().safeOpenDeal(h.deal.id); }} className="cursor-pointer hover:text-[#3B82F6]">{h.deal.property.address}</span>
                    <span className="text-[#22C55E]">{h.score}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#252A38]">
              <button onClick={async () => {
                const selectedStrategies = Array.isArray(editBuyer.strategies)
                  ? editBuyer.strategies
                  : normalizeBuyerStrategies(editBuyer)

                const finalStatus = editBuyer.verificationStatus || editBuyer.status || selectedBuyer.status
                const finalProofFiles = getBuyerProofFiles(editBuyer)
                await persistBuyerUpdate(selectedBuyer.id, {
                  ...editBuyer,
                  id: selectedBuyer.id,
                  strategies: selectedStrategies,
                  strategy: selectedStrategies.join(', '),
                  exitStrategy: selectedStrategies.join(', '),
                  investmentStrategy: selectedStrategies.join(', '),
                  otherStrategy: editBuyer.otherStrategy || editBuyer.other_strategy || '',
                  name: cleanBuyerName(editBuyer.name || selectedBuyer.name, editBuyer.email || selectedBuyer.email),
                  status: finalStatus,
                  verificationStatus: finalStatus,
                  proofFiles: finalProofFiles,
                  uploadedFiles: finalProofFiles,
                  data: { ...(editBuyer.data || {}), proofFiles: finalProofFiles, uploadedFiles: finalProofFiles },
                  blastEligible: finalStatus === 'Verified Buyer' || finalStatus === 'VIP Buyer'
                } as any, 'Buyer updated in Supabase')
              }} className="btn btn-primary">Save Changes</button>
              <button onClick={async () => { await persistBuyerUpdate(selectedBuyer.id, { status: 'Hot' }, 'Marked Hot'); }} className="btn btn-ghost">Mark Hot</button>
              <button onClick={async () => { await persistBuyerUpdate(selectedBuyer.id, { status: 'Verified Buyer', verificationStatus: 'Verified Buyer', blastEligible: true } as any, 'Marked Verified'); }} className="btn btn-ghost text-[#22C55E]">Mark Verified</button>
              <button onClick={async () => { await persistBuyerUpdate(selectedBuyer.id, { status: 'VIP Buyer', verificationStatus: 'VIP Buyer', blastEligible: true } as any, 'Marked VIP'); }} className="btn btn-ghost text-purple-300">Mark VIP</button>
              <button onClick={async () => { await persistBuyerUpdate(selectedBuyer.id, { status: 'Needs More Info', verificationStatus: 'Needs More Info', blastEligible: true } as any, 'Marked Needs More Info'); }} className="btn btn-ghost text-amber-300">Needs More Info</button>
              <button onClick={async () => { await persistBuyerUpdate(selectedBuyer.id, { status: 'Do Not Blast', verificationStatus: 'Do Not Blast', blastEligible: true } as any, 'Marked Do Not Blast'); }} className="btn btn-ghost text-red-400">Do Not Blast</button>
              <button onClick={() => { if (confirm(`Suppress ${selectedBuyer.name}?`)) { addToSuppression(selectedBuyer.email); toast.success('Suppressed'); } }} className="btn btn-ghost text-amber-400">Suppress</button>
              <button onClick={async () => { if (confirm(`Delete ${selectedBuyer.name || "this buyer"} from Supabase?`)) { await removeBuyersEverywhere([selectedBuyer.id], "Buyer deleted from Supabase"); } }} className="btn btn-ghost text-red-400">Delete</button>
              <button onClick={() => { setShowListModal(true); }} className="btn btn-ghost text-[#22C55E]">Add to List</button>
              <button onClick={() => setSelectedBuyer(null)} className="btn btn-ghost ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}


      {/* ADD BUYER MODAL */}
      {showAddBuyer && (
        <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4" onClick={() => setShowAddBuyer(false)}>
          <div className="card w-full max-w-4xl max-h-[92vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xl font-semibold">Add Buyer</div>
                <div className="text-xs text-[#8B92A3]">Manual, quick, detailed, or multiple buyer entry</div>
              </div>
              <button onClick={() => setShowAddBuyer(false)}><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5 text-sm">
              {[
                ['quick','Quick Add Buyer'],
                ['manual','Manual Add Buyer'],
                ['detailed','Detailed Add Buyer'],
                ['multi','Add Multiple Buyers'],
                ['text','Paste Text / Auto Parse']
              ].map(([mode,label]) => (
                <button key={mode} type="button" onClick={() => setAddBuyerMode(mode as any)} className={`rounded-xl border px-3 py-2 ${addBuyerMode === mode ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE] hover:border-[#3B82F6]'}`}>
                  {label}
                </button>
              ))}
            </div>

            {addBuyerMode === 'text' ? (
              <div>
                <div className="text-sm text-[#8B92A3] mb-2">Paste buyer text, emails, or buy box notes. The app will auto-detect email, states, asset types, and buyer type when possible.</div>
                <textarea className="input h-56" value={buyerPasteText} onChange={e => setBuyerPasteText(e.target.value)} placeholder="Example: dmitri@polascapital.com, Memphis TN  SFH, Max , Cash Buyer" />
                <div className="flex gap-2 mt-4">
                  <button onClick={savePastedBuyers} className="btn btn-primary flex-1">Parse & Add Buyers</button>
                  <button onClick={() => setShowAddBuyer(false)} className="btn btn-ghost flex-1">Cancel</button>
                </div>
              </div>
            ) : addBuyerMode === 'multi' ? (
              <div>
                <div className="text-sm text-[#8B92A3] mb-2">For multiple buyers, use the Import Buyers button for CSV / TXT review and approval.</div>
                <button onClick={() => { setShowAddBuyer(false); setShowImport(true); }} className="btn btn-primary">Open Import Buyers</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-[#8B92A3] mb-1">Name</div>
                  <input className="input" value={manualBuyer.name} onChange={e => setManualBuyer({ ...manualBuyer, name: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-[#8B92A3] mb-1">Email</div>
                  <input className="input" value={manualBuyer.email} onChange={e => setManualBuyer({ ...manualBuyer, email: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-[#8B92A3] mb-1">Phone</div>
                  <input className="input" value={manualBuyer.phone} onChange={e => setManualBuyer({ ...manualBuyer, phone: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-[#8B92A3] mb-1">Company</div>
                  <input className="input" value={manualBuyer.company} onChange={e => setManualBuyer({ ...manualBuyer, company: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-[#8B92A3] mb-2">Buyer Type</div>
                  <div className="flex flex-wrap gap-2">
                    {['Cash Buyer','Creative Buyer','Seller Finance','Subto','Hedge Fund','Institutional','Private Equity','JV Partner','Broker','Agent','Wholesaler','Hotel Buyer','Land Buyer','MHP Buyer','Other'].map(type => (
                      <button key={type} type="button" onClick={() => setManualBuyer({ ...manualBuyer, type })} className={`px-3 py-1 rounded-lg border text-xs ${manualBuyer.type === type ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE]'}`}>
                        {type}
                      </button>
                    ))}
                  </div>
                  {manualBuyer.type === 'Other' && (
                    <input className="input mt-2" placeholder="Custom buyer type" onChange={e => setManualBuyer({ ...manualBuyer, type: e.target.value })} />
                  )}
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-[#8B92A3] mb-2">Markets / States</div>
                  <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto border border-[#252A38] rounded-xl p-3 bg-[#070A0F]">
                    {['Nationwide','AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','Other'].map(st => {
                      const active = (manualBuyer.markets || []).includes(st)
                      return (
                        <button key={st} type="button" onClick={() => toggleManualBuyerArray('markets', st)} className={`px-2.5 py-1 rounded-lg border text-[10px] ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE]'}`}>
                          {st}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-[#8B92A3] mb-2">Asset Types</div>
                  <div className="flex flex-wrap gap-2">
                    {['SFH','Multifamily','Small Multifamily','Apartment','Land','Hotel','Retail','Office','Industrial','Storage','Mixed Use','Mobile Home Park','RV Park','Build To Rent','Notes','Commercial','Development','Other'].map(asset => {
                      const active = (manualBuyer.assetTypes || []).includes(asset)
                      return (
                        <button key={asset} type="button" onClick={() => toggleManualBuyerArray('assetTypes', asset)} className={`px-3 py-1 rounded-lg border text-xs ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE]'}`}>
                          {asset}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-[#8B92A3] mb-2">Exit Strategy</div>
                  <StrategyChipSelector
                    value={getSelectedBuyerStrategies(manualBuyer)}
                    otherValue={manualBuyer.otherStrategy || manualBuyer.other_strategy || ''}
                    onChange={(next) => setManualBuyer(buildBuyerStrategyUpdate({
                      ...manualBuyer,
                      strategies: next,
                      strategy: next.join(', '),
                      exitStrategy: next.join(', '),
                      investmentStrategy: next.join(', '),
                    }))}
                    onOtherChange={(next) => setManualBuyer({ ...manualBuyer, otherStrategy: next, other_strategy: next })}
                  />
                </div>

                <div className="md:col-span-2 rounded-lg border border-[#252A38] bg-[#0B0F17] p-3">
                  <div className="font-semibold mb-2 text-base text-[#22C55E]">Buyer Verification / Proof Files</div>
                  <BuyerDocumentManager
                    files={manualBuyer.proofFiles || manualBuyer.uploadedFiles || []}
                    uploadedBy={user?.email || user?.name || 'Admin Reviewer'}
                    contextId={manualBuyer.email || 'manual-buyer'}
                    onChange={(nextDocs) => setManualBuyer({
                      ...manualBuyer,
                      proofFiles: nextDocs,
                      uploadedFiles: nextDocs,
                    })}
                  />
                </div>

                {addBuyerMode === 'detailed' && (
                  <>
                    <div>
                      <div className="text-xs text-[#8B92A3] mb-1">Budget Min</div>
                      <input className="input" type="number" value={manualBuyer.budgetMin} onChange={e => setManualBuyer({ ...manualBuyer, budgetMin: normalizeBuyerBudgetMin(e.target.value) })} />
                    </div>
                    <div>
                      <div className="text-xs text-[#8B92A3] mb-1">Budget Max</div>
                      <input className="input" type="number" value={manualBuyer.budgetMax} onChange={e => setManualBuyer({ ...manualBuyer, budgetMax: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-[#8B92A3] mb-1">Notes / Buy Box</div>
                      <textarea className="input h-24" value={manualBuyer.notes} onChange={e => setManualBuyer({ ...manualBuyer, notes: e.target.value })} />
                    </div>
                  </>
                )}

                <div className="md:col-span-2 flex gap-2 pt-2">
                  <button onClick={saveManualBuyer} className="btn btn-primary flex-1">Save Buyer</button>
                  <button onClick={() => setShowAddBuyer(false)} className="btn btn-ghost flex-1">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Buyer Custom Lists Modal */}
      {showListModal && (
        <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4" onClick={() => { setShowListModal(false); setNewListName(''); }}>
          <div className="card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-4">Add to Buyer List</div>

            {buyerLists.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-[#8B92A3] mb-1">Existing Lists</div>
                {buyerLists.map(list => (
                  <button key={list.id} onClick={() => {
                    const idsToAdd = selectedBuyer ? [selectedBuyer.id] : selectedBuyerIds;
                    const updated = buyerLists.map(l => l.id === list.id ? { ...l, buyerIds: Array.from(new Set([...(l.buyerIds || []), ...idsToAdd])) , updatedAt: Date.now() } : l);
                    setBuyerLists(updated);
                    setShowListModal(false);
                    setSelectedBuyerIds([]);
                    toast.success(`Added to ${list.name}`);
                  }} className="w-full text-left btn btn-ghost px-3 py-1 mb-1 text-sm border border-[#252A38]">
                    {list.name} <span className="text-[#8B92A3] text-xs">({(list.buyerIds || []).length})</span>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-[#252A38] pt-4">
              <div className="text-xs text-[#8B92A3] mb-1">Create New List</div>
              <input className="input mb-2" placeholder="List name (e.g. Alabama Buyers)" value={newListName} onChange={e => setNewListName(e.target.value)} />
              <button onClick={() => {
                if (!newListName.trim()) return;
                const newList = {
                  id: 'list_' + Date.now(),
                  name: newListName.trim(),
                  description: '',
                  buyerIds: selectedBuyer ? [selectedBuyer.id] : selectedBuyerIds,
                  tags: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                };
                setBuyerLists([...buyerLists, newList]);
                setShowListModal(false);
                setNewListName('');
                setSelectedBuyerIds([]);
                toast.success(`Created list "${newListName}" and added buyers`);
              }} className="btn btn-primary w-full" disabled={!newListName.trim()}>Create & Add</button>
            </div>

            <button onClick={() => { setShowListModal(false); setNewListName(''); }} className="btn btn-ghost w-full mt-3">Cancel</button>
          </div>
        </div>
      )}

      {/* BUYER PORTAL REVIEW MODAL - separate from CSV/TXT import review. */}
      {showPortalReview && (
        <div className="fixed inset-0 bg-black/70 z-[220] flex items-center justify-center p-4">
          <div className="card w-full max-w-5xl max-h-[92vh] overflow-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-xl">Buyer Portal Review Center</div>
                <div className="text-xs text-[#8B92A3] mt-1">
                  Portal submissions stay pending here until you approve or dismiss them. CSV/TXT uploads are separate.
                </div>
              </div>
              <button onClick={closeBuyerReview}><X /></button>
            </div>

            {pendingPortalImport.length === 0 ? (
              <div className="border border-dashed border-[#252A38] rounded-xl p-8 text-center">
                <div className="mb-2">No buyer portal submissions loaded.</div>
                <div className="text-sm text-[#8B92A3]">Send buyers to the public Buyer Portal, then refresh this queue to review and approve submitted criteria.</div>
                <button onClick={importBuyerPortalQueue} className="btn btn-primary mt-3">Refresh Buyer Portal Queue</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-[#252A38] pb-4">
                  <div>
                    <div className="text-sm font-medium">{pendingPortalImport.length} portal buyer{pendingPortalImport.length === 1 ? '' : 's'} pending approval</div>
                    <div className="text-[10px] text-[#8B92A3]">These are separate from uploaded CSV/TXT buyers.</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => { void clearPortalPendingRows() }} className="btn btn-ghost px-3 py-1">Clear Portal Queue</button>
                    <button onClick={cleanAllPortalBuyerNames} className="btn btn-ghost px-3 py-1 text-[#22C55E]">Auto-Fix Names</button>
                    <button onClick={skipPortalInvalid} className="btn btn-ghost px-3 py-1">Skip Dups &amp; Invalid</button>
                    <button
                      onClick={approveAllPortalValid}
                      disabled={Object.values(portalApprovalStatus).includes('approving')}
                      className="btn btn-green px-3 py-1 disabled:opacity-60"
                    >
                      {Object.values(portalApprovalStatus).includes('approving') ? 'Approving...' : 'Approve All Valid'}
                    </button>
                  </div>
                </div>

                {portalApprovalSummary && (
                  <div className="mb-4 rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 p-3 text-sm text-[#C5CAD6]">
                    {portalApprovalSummary}
                  </div>
                )}

                <div className="space-y-5 max-h-[62vh] overflow-auto pr-1">
                  {pendingPortalImport.map((row, idx) => {
                    const rowMarkets = Array.isArray(row.markets) ? row.markets : []
                    const rowAssets = Array.isArray(row.assetTypes) ? row.assetTypes : []

                    // PORTAL_FULL_REVIEW_PATCH_V1
                    const rawPortalBuyer = row.buyerPortalSubmission && typeof row.buyerPortalSubmission === 'object'
                      ? row.buyerPortalSubmission
                      : {}
                    const rawPortalForm = rawPortalBuyer.portalForm && typeof rawPortalBuyer.portalForm === 'object'
                      ? rawPortalBuyer.portalForm
                      : {}

                    const portalFirst = (...values: any[]) => {
                      for (const value of values) {
                        if (Array.isArray(value)) {
                          const joined = value.map(v => String(v ?? '').trim()).filter(Boolean).join(', ')
                          if (joined) return joined
                        }

                        if (value !== undefined && value !== null && String(value).trim()) {
                          return String(value).trim()
                        }
                      }

                      return ''
                    }

                    const portalDisplay = (value: any) => {
                      if (Array.isArray(value)) {
                        const joined = value.map(v => String(v ?? '').trim()).filter(Boolean).join(', ')
                        return joined || 'Not Provided'
                      }

                      if (value === true) return 'Yes'
                      if (value === false) return 'No'
                      const text = String(value ?? '').trim()
                      return text || 'Not Provided'
                    }

                    const portalBool = (...values: any[]) => {
                      for (const value of values) {
                        if (value === true) return 'Yes'
                        if (value === false) return 'No'
                        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
                      }

                      return ''
                    }

                    const portalProofFiles = (() => {
                      const buckets = [
                        row.proofFiles,
                        row.uploadedFiles,
                        row.files,
                        rawPortalBuyer.proofFiles,
                        rawPortalBuyer.uploadedFiles,
                        rawPortalBuyer.files,
                        rawPortalBuyer.documents,
                      ]

                      const files = buckets.flatMap((bucket: any) => Array.isArray(bucket) ? bucket : [])
                      const seen = new Set<string>()

                      return files.filter((file: any) => {
                        const key = [
                          file?.id,
                          file?.storagePath,
                          file?.publicUrl,
                          file?.fileDataUrl,
                          file?.url,
                          file?.fileName || file?.name || file?.filename,
                          file?.fileSize || file?.size,
                        ].filter(Boolean).join('|') || JSON.stringify(file || {})

                        if (seen.has(key)) return false
                        seen.add(key)
                        return true
                      })
                    })()

                    const portalKnownFormKeys = new Set([
                      'name', 'email', 'phone', 'company', 'website', 'buyerTypeOther', 'marketsOther', 'assetTypeOther', 'exitStrategyOther',
                      'priceMin', 'priceMax', 'priceRange', 'unitsMin', 'unitsMax', 'downPaymentMax', 'monthlyPaymentMax',
                      'interestRateMax', 'balloonTerm', 'capRateTarget', 'creativeStructure', 'cities', 'notes',
                      'bedRequirement', 'bathRequirement', 'unitRequirement', 'consent', 'buyerTypes', 'markets', 'assetTypes',
                      'exitStrategies', 'cleanBuyerTypes', 'cleanMarkets', 'cleanAssetTypes', 'cleanExitStrategies',
                      'proofSummary', 'fileUploadWarning',
                    ])

                    const portalAdditionalFields: Array<[string, any]> = Object.entries(rawPortalForm)
                      .filter(([key]) => !portalKnownFormKeys.has(key))
                      .map(([key, value]) => [
                        key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        value,
                      ])

                    const portalGroupedFields: Array<{ title: string; fields: Array<[string, any]> }> = [
                      {
                        title: 'Contact Info',
                        fields: [
                          ['Buyer Name', portalFirst(row.name, rawPortalBuyer.name, rawPortalForm.name)],
                          ['Email', portalFirst(row.email, rawPortalBuyer.email, rawPortalForm.email)],
                          ['Phone', portalFirst(row.phone, rawPortalBuyer.phone, rawPortalForm.phone)],
                          ['Company / Entity', portalFirst(row.company, rawPortalBuyer.company, rawPortalForm.company)],
                          ['Website / LinkedIn / Company Profile', portalFirst(row.website, row.linkedin, row.companyProfile, row.company_profile, rawPortalBuyer.website, rawPortalBuyer.linkedin, rawPortalBuyer.companyProfile, rawPortalBuyer.company_profile)],
                        ],
                      },
                      {
                        title: 'Buyer Criteria',
                        fields: [
                          ['Buyer Types', portalFirst(row.type, rawPortalBuyer.type, rawPortalForm.cleanBuyerTypes, rawPortalForm.buyerTypes)],
                          ['Markets', portalFirst(row.markets, rawPortalBuyer.markets, rawPortalForm.cleanMarkets, rawPortalForm.markets)],
                          ['Target Cities / Counties', portalFirst(row.targetCities, row.target_cities, row.cities, row.counties, rawPortalBuyer.targetCities, rawPortalBuyer.target_cities, rawPortalBuyer.cities, rawPortalBuyer.counties)],
                          ['Asset Types', portalFirst(row.assetTypes, rawPortalBuyer.assetTypes, rawPortalForm.cleanAssetTypes, rawPortalForm.assetTypes)],
                          ['Strategy / Exit Strategy', portalFirst(row.strategy, row.exitStrategy, rawPortalBuyer.strategy, rawPortalBuyer.exitStrategy, rawPortalForm.cleanExitStrategies, rawPortalForm.exitStrategies)],
                          ['Price Range', portalFirst(row.priceRange, rawPortalBuyer.priceRange, rawPortalForm.priceRange)],
                          ['Bed Requirement', portalFirst(row.bedRequirement, rawPortalBuyer.bedRequirement, rawPortalBuyer.beds)],
                          ['Bath Requirement', portalFirst(row.bathRequirement, rawPortalBuyer.bathRequirement, rawPortalBuyer.baths)],
                          ['Unit Requirement', portalFirst(row.unitRequirement, rawPortalBuyer.unitRequirement, rawPortalBuyer.units)],
                        ],
                      },
                      {
                        title: 'Funding / Proof of Funds',
                        fields: [
                          ['Funding Status', portalFirst(row.fundingStatus, rawPortalBuyer.fundingStatus)],
                          ['Down Payment Max', portalFirst(row.downPaymentMax, rawPortalBuyer.downPaymentMax, rawPortalBuyer.downPayment)],
                          ['Monthly Payment Max', portalFirst(row.monthlyPaymentMax, rawPortalBuyer.monthlyPaymentMax, rawPortalBuyer.monthlyPayment)],
                          ['Interest Rate Max', portalFirst(row.interestRateMax, rawPortalBuyer.interestRateMax, rawPortalBuyer.interestRate)],
                          ['Balloon Term', portalFirst(row.balloonTerm, rawPortalBuyer.balloonTerm, rawPortalBuyer.balloon)],
                          ['Cap Rate Target', portalFirst(row.capRateTarget, rawPortalBuyer.capRateTarget, rawPortalBuyer.capRate)],
                          ['Creative Structure', portalFirst(row.creativeStructure, rawPortalBuyer.creativeStructure)],
                          ['Proof Summary', portalFirst(rawPortalForm.proofSummary)],
                        ],
                      },
                      {
                        title: 'Notes',
                        fields: [
                          ['Notes', portalFirst(row.notes, rawPortalBuyer.notes, rawPortalForm.notes)],
                          ['Upload Warning', portalFirst(row.fileUploadWarning, rawPortalBuyer.fileUploadWarning, rawPortalForm.fileUploadWarning, rawPortalBuyer.adminWarnings)],
                        ],
                      },
                      {
                        title: 'System Info',
                        fields: [
                          ['Submitted At', portalFirst(row.submittedAt, rawPortalBuyer.submittedAt)],
                          ['Submission Status', portalFirst(row.status, rawPortalBuyer.status, rawPortalBuyer.submissionStatus)],
                          ['Consent Confirmed', portalBool(row.consent, row.consentConfirmed, rawPortalBuyer.consent, rawPortalBuyer.consentConfirmed)],
                        ],
                      },
                      {
                        title: 'Additional Fields',
                        fields: portalAdditionalFields.length ? portalAdditionalFields : [['Additional Fields', 'Not Provided']],
                      },
                    ]

                    return (
                      <div key={row._id} className={`rounded-2xl border p-5 bg-[#111623] ${row._valid === false ? 'border-red-500/50' : row._dup ? 'border-amber-500/50' : 'border-[#252A38]'}`}>
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                          <div>
                            <div className="text-lg font-semibold">{row.name || 'Name Missing'}</div>
                            <div className="text-sm text-blue-400">{row.email || 'Email Missing'}</div>
                            <div className="text-xs text-[#22C55E] mt-1">Portal Review #{idx + 1}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { void approveSinglePortalBuyer(row._id) }}
                              disabled={portalApprovalStatus[row._id] === 'approving' || portalApprovalStatus[row._id] === 'approved'}
                              className="btn btn-green text-xs px-3 py-1 disabled:opacity-60"
                            >
                              {portalApprovalStatus[row._id] === 'approving'
                                ? 'Approving...'
                                : portalApprovalStatus[row._id] === 'approved'
                                  ? 'Approved'
                                  : portalApprovalStatus[row._id] === 'failed'
                                    ? 'Retry Approve'
                                    : 'Approve'}
                            </button>
                            <button
                              onClick={() => updatePortalPendingRow(row._id, {
                                _valid: isValidBuyerEmail(row.email),
                                _error: isValidBuyerEmail(row.email) ? '' : 'Valid email is required for approval.'
                              })}
                              className="btn btn-ghost text-xs px-3 py-1"
                            >
                              Recheck
                            </button>
                            <button onClick={() => updatePortalPendingRow(row._id, { status: 'Hot' })} className="btn btn-ghost text-xs px-3 py-1">Mark Hot</button>
                            <button onClick={() => { void removePortalPendingRow(row._id) }} className="btn btn-ghost text-xs px-3 py-1">Remove</button>
                          </div>
                        </div>
                        {row._error && (
                          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {row._error}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <div className="text-sm font-semibold mb-3">Core Information</div>
                            <div className="grid grid-cols-1 gap-3 text-xs">
                              <label>
                                <div className="text-[#8B92A3] mb-1">Buyer Name</div>
                                <input className="input" value={row.name || ''} onChange={e => updatePortalPendingRow(row._id, { name: e.target.value })} />
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Email</div>
                                <input className="input" value={row.email || ''} onChange={e => updatePortalPendingRow(row._id, { email: e.target.value, _valid: !!e.target.value })} />
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Company / Entity</div>
                                <input className="input" value={row.company || ''} onChange={e => updatePortalPendingRow(row._id, { company: e.target.value })} />
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Phone</div>
                                <input className="input" value={row.phone || ''} onChange={e => updatePortalPendingRow(row._id, { phone: e.target.value })} />
                              </label>
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-semibold mb-3">Buy Box & Criteria</div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <label>
                                <div className="text-[#8B92A3] mb-1">Budget Min</div>
                                <input className="input" value={row.budgetMin || ''} onChange={e => updatePortalPendingRow(row._id, { budgetMin: normalizeBuyerBudgetMin(e.target.value) })} />
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Budget Max</div>
                                <input className="input" value={row.budgetMax || ''} onChange={e => updatePortalPendingRow(row._id, { budgetMax: Number(e.target.value) || 0 })} />
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Buyer Type</div>
                                <select className="input" value={row.type || row.buyerType || 'Cash Buyer'} onChange={e => updatePortalPendingRow(row._id, { type: e.target.value, buyerType: e.target.value })}>
                                  {['Cash Buyer','Creative Buyer','JV Partner','Wholesaler','Agent/Broker','Lender','Other'].map(x => <option key={x}>{x}</option>)}
                                </select>
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Status</div>
                                <select className="input" value={row.status || 'Submitted / Pending Review'} onChange={e => updatePortalPendingRow(row._id, { status: e.target.value, verificationStatus: e.target.value })}>
                                  {['Submitted / Pending Review','Active','Verified Buyer','VIP Buyer','Hot','Needs More Info','Do Not Blast'].map(x => <option key={x}>{x}</option>)}
                                </select>
                              </label>
                            </div>

                            <div className="mt-3 text-xs">
                              <div className="text-[#8B92A3] mb-1">Markets</div>
                              <input className="input" value={rowMarkets.join(', ')} onChange={e => updatePortalPendingRow(row._id, { markets: e.target.value.split(',').map(x => x.trim()).filter(Boolean), targetMarkets: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
                            </div>

                            <div className="mt-3 text-xs">
                              <div className="text-[#8B92A3] mb-1">Asset Types</div>
                              <input className="input" value={rowAssets.join(', ')} onChange={e => updatePortalPendingRow(row._id, { assetTypes: e.target.value.split(',').map(x => x.trim()).filter(Boolean), assetFocus: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
                            </div>

                            <div className="mt-3 text-xs">
                              <div className="text-[#8B92A3] mb-1">Exit Strategy</div>
                              <StrategyChipSelector
                                value={getSelectedBuyerStrategies(row)}
                                otherValue={row.otherStrategy || row.other_strategy || ''}
                                onChange={(next) => updatePortalPendingRow(row._id, buildBuyerStrategyUpdate({
                                  ...row,
                                  strategies: next,
                                  strategy: next.join(', '),
                                  exitStrategy: next.join(', '),
                                  investmentStrategy: next.join(', '),
                                }))}
                                onOtherChange={(next) => updatePortalPendingRow(row._id, { otherStrategy: next, other_strategy: next })}
                                compact
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-[#252A38] bg-[#0B0F17] p-3">
                            <div className="text-sm font-semibold mb-3 text-[#22C55E]">Review Full Submission</div>

                            <div className="space-y-3">
                              {portalGroupedFields.map(section => (
                                <div key={section.title}>
                                  <div className="text-xs font-semibold text-[#C5CAD6] mb-2">{section.title}</div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {section.fields.map(([label, value]) => (
                                      <div key={`${section.title}-${label}`} className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2">
                                        <div className="text-[#8B92A3] mb-1">{label}</div>
                                        <div className="text-white break-words">{portalDisplay(value)}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                              <label>
                                <div className="text-[#8B92A3] mb-1">Beds</div>
                                <select className="input" value={getRequirementValue(row, 'bedRequirement')} onChange={e => updatePortalPendingRow(row._id, { bedRequirement: e.target.value })}>
                                  {BED_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Baths</div>
                                <select className="input" value={getRequirementValue(row, 'bathRequirement')} onChange={e => updatePortalPendingRow(row._id, { bathRequirement: e.target.value })}>
                                  {BATH_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                              </label>
                              <label>
                                <div className="text-[#8B92A3] mb-1">Units</div>
                                <select className="input" value={getRequirementValue(row, 'unitRequirement')} onChange={e => updatePortalPendingRow(row._id, { unitRequirement: e.target.value })}>
                                  {UNIT_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                              </label>
                            </div>

                            <label className="block mt-3 text-xs">
                              <div className="text-[#8B92A3] mb-1">Additional Notes / Buy Box</div>
                              <textarea
                                className="input h-24"
                                value={row.notes || rawPortalBuyer.notes || rawPortalBuyer.buyBox || ''}
                                onChange={e => {
                                  const nextNotes = e.target.value
                                  const parsed = parsePropertyRequirements(nextNotes)
                                  updatePortalPendingRow(row._id, {
                                    notes: nextNotes,
                                    bedRequirement: row.bedRequirement && row.bedRequirement !== 'Any' ? row.bedRequirement : parsed.bedRequirement,
                                    bathRequirement: row.bathRequirement && row.bathRequirement !== 'Any' ? row.bathRequirement : parsed.bathRequirement,
                                    unitRequirement: row.unitRequirement && row.unitRequirement !== 'Any' ? row.unitRequirement : parsed.unitRequirement,
                                  })
                                }}
                              />
                            </label>
                          </div>

                          <div className="rounded-xl border border-[#252A38] bg-[#0B0F17] p-3">
                            <div className="text-sm font-semibold mb-3 text-[#22C55E]">Buyer Verification / Proof Files</div>
                            <BuyerDocumentManager
                              files={portalProofFiles}
                              uploadedBy={user?.email || user?.name || 'Admin Reviewer'}
                              contextId={row.buyerPortalSubmissionId || row._id}
                              compact
                              onChange={(nextDocs) => updatePortalPendingRow(row._id, {
                                proofFiles: nextDocs,
                                uploadedFiles: nextDocs,
                                buyerPortalSubmission: {
                                  ...(row.buyerPortalSubmission || {}),
                                  proofFiles: nextDocs,
                                  uploadedFiles: nextDocs,
                                },
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex gap-2 mt-5 pt-4 border-t border-[#252A38]">
                  <button
                    onClick={approvePortalSelected}
                    disabled={Object.values(portalApprovalStatus).includes('approving')}
                    className="btn btn-green flex-1 disabled:opacity-60"
                  >
                    {Object.values(portalApprovalStatus).includes('approving') ? 'Approving...' : 'Approve All Valid'}
                  </button>
                  <button onClick={closeBuyerReview} className="btn btn-ghost flex-1">Close, Keep Pending</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* IMPORT MODAL - Profile-style review screen before any store write. */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
          <div className="card w-full max-w-5xl max-h-[92vh] overflow-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-xl">Import Buyers - Review & Approve</div>
                <div className="text-xs text-[#8B92A3] mt-1">
                  Review each buyer exactly like the Global Buyer Database profile before saving.
                </div>
              </div>
              <button onClick={() => { setShowImport(false); void refreshBuyerPortalQueueCount() }}><X /></button>
            </div>

            {pendingImport.length === 0 && !importResult && (
              <div className="border border-dashed border-[#252A38] rounded-xl p-8 text-center">
                <Upload className="mx-auto mb-3" />
                <div className="mb-2">Drop or click to upload CSV/TXT</div>
                <div className="text-xs text-[#8B92A3] mb-4">Multiple uploads allowed. Review, edit, remove, merge dups, then approve.</div>
                <input
                  type="file"
                  accept=".csv,.txt"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.currentTarget.files || []) as File[]
                    files.forEach(file => handleFile(file))
                    e.currentTarget.value = ''
                  }}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="btn btn-primary cursor-pointer">Choose Files</label>
                <div className="text-[10px] text-[#8B92A3] mt-3">Columns auto-mapped: Email/Name/Markets/Property_Types/Budget/Finance_Type etc.</div>
              </div>
            )}

            {pendingImport.length > 0 && (
              <>
                <div className="sticky top-0 z-10 bg-[#0F131D] border border-[#252A38] rounded-xl p-3 mb-4 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{pendingImport.length} buyer{pendingImport.length === 1 ? '' : 's'} ready for review</div>
                      <div className="text-[10px] text-[#8B92A3]">Conservative parser: email is required, missing criteria stays blank, and no buyers are saved until approval.</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button onClick={() => { void clearPendingImportRows() }} className="btn btn-ghost px-3 py-1">Clear All</button>
                      <button onClick={cleanAllPendingBuyerNames} className="btn btn-ghost px-3 py-1 text-[#22C55E]">Auto-Fix Names</button>
                      <button onClick={skipInvalid} className="btn btn-ghost px-3 py-1">Skip Dups &amp; Invalid</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-3 text-xs">
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Rows</div><div className="font-semibold">{importSummary.total}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Valid Email</div><div className="font-semibold">{importSummary.validEmails}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Duplicates</div><div className="font-semibold">{importSummary.duplicates}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Missing Name</div><div className="font-semibold">{importSummary.missingNames}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Missing Company</div><div className="font-semibold">{importSummary.missingCompany}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Missing Markets</div><div className="font-semibold">{importSummary.missingMarkets}</div></div>
                    <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><div className="text-[#8B92A3]">Budget Unknown</div><div className="font-semibold">{importSummary.missingBudget}</div></div>
                  </div>

                  {importApprovalSummary && (
                    <div className="mt-3 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-2 text-xs text-[#B7F7C8]">
                      {importApprovalSummary}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <input
                      className="input"
                      value={importReviewSearch}
                      onChange={e => setImportReviewSearch(e.target.value)}
                      placeholder="Search imported buyers by name, email, company, market, or notes"
                    />
                    <select className="input md:w-56" value={importReviewFilter} onChange={e => setImportReviewFilter(e.target.value as any)}>
                      <option value="all">All rows</option>
                      <option value="valid">Valid email</option>
                      <option value="invalid">Invalid email</option>
                      <option value="duplicate">Duplicates</option>
                      <option value="missingCriteria">Missing criteria</option>
                      <option value="hot">Hot buyers</option>
                    </select>
                  </div>
                  <div className="text-[10px] text-[#8B92A3] mt-2">
                    Showing {importReviewRows.length} of {pendingImport.length}. Missing phone, company, budget, or criteria will not block approval when the email is valid.
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-[#252A38] pb-4">
                  <div>
                    <div className="text-sm font-medium">Review Details</div>
                    <div className="text-[10px] text-[#8B92A3]">Parsed, inferred, and missing fields are labeled before approval.</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => setCollapsedImportRows(Object.fromEntries(importReviewRows.map((row: any) => [row._id, true])))} className="btn btn-ghost px-3 py-1">Collapse Visible</button>
                    <button onClick={() => setCollapsedImportRows({})} className="btn btn-ghost px-3 py-1">Expand All</button>
                  </div>
                </div>

                <div className="space-y-5 max-h-[62vh] overflow-auto pr-1">
                  {importReviewRows.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#252A38] p-8 text-center text-sm text-[#8B92A3]">
                      No imported buyers match this review filter.
                    </div>
                  )}

                  {importReviewRows.map((row, idx) => {
                    const marketOptions = ['Any','Nationwide','AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
                    const assetOptions = ['SFH','Multifamily','Small Multifamily','MHP','Mobile Home Park','RV Park','Hotel','Retail','Office','Industrial','Storage','Land','Mixed Use','Mixed-Use','Commercial','Development','Build-to-Rent','Any']
                    const rowMarkets = Array.isArray(row.markets) ? row.markets : []
                    const rowAssets = Array.isArray(row.assetTypes) ? row.assetTypes : []
                    const rowStrategies = getSelectedBuyerStrategies(row)
                    const isCollapsed = Boolean(collapsedImportRows[row._id])
                    const rowApprovalStatus = importApprovalStatus[row._id]
                    const confidence = row.parserConfidence || {}
                    const missingCriteria = importRowMissingCriteria(row)

                    return (
                      <div key={row._id} className={`rounded-2xl border p-5 bg-[#111623] ${row._valid === false ? 'border-red-500/50' : row._dup ? 'border-amber-500/50' : 'border-[#252A38]'}`}>
                        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                          <div>
                            <div className="text-lg font-semibold">{row.name || 'Unknown Buyer'}</div>
                            <div className="text-[#3B82F6] text-sm">{row.email || 'Email Missing'}</div>
                            <div className="text-xs mt-1 flex flex-wrap gap-2">
                              <span className="text-[#22C55E]">Review #{idx + 1}</span>
                              {row._dup && <span className="text-amber-400">Possible Duplicate</span>}
                              {row._valid === false && <span className="text-red-400">Marked Invalid</span>}
                              {row.status && <span className="text-amber-400">Status: {row.status}</span>}
                              {rowApprovalStatus && <span className={rowApprovalStatus === 'failed' ? 'text-red-300' : rowApprovalStatus === 'approved' ? 'text-[#22C55E]' : 'text-amber-300'}>{rowApprovalStatus === 'approving' ? 'Approving...' : rowApprovalStatus === 'approved' ? 'Approved' : 'Failed'}</span>}
                              {missingCriteria && <span className="text-amber-300">Missing criteria allowed</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                              {['name', 'company', 'markets', 'budget', 'assetTypes', 'strategy', 'buyerType'].map(key => (
                                <span key={key} className={`px-2 py-0.5 rounded-full border ${confidence[key] === 'Parsed' ? 'border-[#22C55E]/40 text-[#22C55E]' : confidence[key] === 'Inferred' ? 'border-amber-400/40 text-amber-300' : 'border-[#475569] text-[#8B92A3]'}`}>
                                  {key}: {confidence[key] || 'Missing'}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            <button onClick={() => setCollapsedImportRows(prev => ({ ...prev, [row._id]: !prev[row._id] }))} className="btn btn-ghost px-3 py-1">
                              {isCollapsed ? 'Expand' : 'Collapse'}
                            </button>
                            <button onClick={() => updatePendingRow(row._id, { _valid: !(row._valid === false) })} className="btn btn-ghost px-3 py-1">
                              {row._valid === false ? 'Mark Valid' : 'Valid'}
                            </button>
                            <button onClick={() => toggleMergePending(row._id)} className="btn btn-ghost px-3 py-1 text-amber-400">
                              {row._merge ? 'Unmerge Dup' : 'Merge Dup'}
                            </button>
                            <button onClick={() => updatePendingRow(row._id, {status: row.status === 'Hot' ? 'Active' : 'Hot'})} className="btn btn-ghost px-3 py-1">
                              {row.status === 'Hot' ? 'Unmark Hot' : 'Mark Hot'}
                            </button>
                            <button onClick={() => { void removePendingRow(row._id) }} className="btn btn-ghost px-3 py-1 text-red-400">Remove</button>
                          </div>
                        </div>

                        {isCollapsed ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><span className="text-[#8B92A3]">Markets: </span>{rowMarkets.join(', ') || 'Unknown'}</div>
                            <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><span className="text-[#8B92A3]">Assets: </span>{rowAssets.join(', ') || 'Unknown'}</div>
                            <div className="rounded-lg border border-[#252A38] bg-[#070A0F] p-2"><span className="text-[#8B92A3]">Exit Strategy: </span>{rowStrategies.join(', ') || 'Not Provided'}</div>
                          </div>
                        ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                          <div>
                            <div className="font-semibold mb-2 text-base">Core Information</div>
                            <div className="grid grid-cols-1 gap-2">
                              <div>
                                <div className="text-xs text-[#8B92A3]">Buyer Name</div>
                                <input
                                  className="input"
                                  value={row.name ?? ''}
                                  onChange={e => updatePendingRow(row._id, { name: autoCapBuyerName(e.target.value), buyerName: autoCapBuyerName(e.target.value) })}
                                  placeholder="Buyer Name"
                                  autoComplete="off"
                                />
                                
                              </div>
                              <div>
                                <div className="text-xs text-[#8B92A3]">Email</div>
                                <input className="input" value={row.email || ''} onChange={e => updatePendingRow(row._id, { email: e.target.value })} placeholder="Email" />
                              </div>
                              <div>
                                <div className="text-xs text-[#8B92A3]">Company / Entity</div>
                                <input className="input" value={row.company || ''} onChange={e => updatePendingRow(row._id, { company: e.target.value })} placeholder="Not Provided" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="text-xs text-[#8B92A3]">Phone</div>
                                  <input className="input" value={row.phone || ''} onChange={e => updatePendingRow(row._id, { phone: e.target.value })} placeholder="Not Provided" />
                                </div>
                                <div>
                                  <div className="text-xs text-[#8B92A3]">Mobile</div>
                                  <input className="input" value={row.mobile || ''} onChange={e => updatePendingRow(row._id, { mobile: e.target.value })} />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="text-xs text-[#8B92A3]">Buyer Type</div>
                                  <select className="input" value={row.type || ''} onChange={e => updatePendingRow(row._id, { type: e.target.value })}>
                                            <option value="">Select buyer type</option>
                                            <option value="Cash Buyer">Cash Buyer</option>
                                            <option value="Creative Buyer">Creative Buyer</option>
                                            <option value="Seller Finance Buyer">Seller Finance Buyer</option>
                                            <option value="Owner Finance Buyer">Owner Finance Buyer</option>
                                            <option value="Subject-To Buyer">Subject-To Buyer</option>
                                            <option value="Notes Buyer">Notes Buyer</option>
                                            <option value="Fix & Flip Buyer">Fix & Flip Buyer</option>
                                            <option value="Buy & Hold Buyer">Buy & Hold Buyer</option>
                                            <option value="BRRRR Buyer">BRRRR Buyer</option>
                                            <option value="Multifamily Buyer">Multifamily Buyer</option>
                                            <option value="Commercial Buyer">Commercial Buyer</option>
                                            <option value="Land Buyer">Land Buyer</option>
                                            <option value="Developer">Developer</option>
                                            <option value="Builder">Builder</option>
                                            <option value="Fund / Institutional Buyer">Fund / Institutional Buyer</option>
                                            <option value="Broker / Realtor">Broker / Realtor</option>
                                            <option value="Wholesaler">Wholesaler</option>
                                            <option value="JV Partner">JV Partner</option>
                                            <option value="Lender">Lender</option>
                                            <option value="Other">Other</option>
                                          </select>
                                </div>
                                <div>
                                  <div className="text-xs text-[#8B92A3]">Status</div>
                                  <select className="select min-w-[220px]" value={row.status || 'Active'} onChange={e => updatePendingRow(row._id, { status: e.target.value })}>
                                    <option>Active</option><option>Hot</option><option>New</option><option>Inactive</option>
                                  </select>
                                </div>
                              </div>
                              {safeLower(row.type || '').includes('creative') && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Down Payment Max</div>
                                    <input className="input" value={row.downPaymentMax || ''} onChange={e => updatePendingRow(row._id, { downPaymentMax: e.target.value })} onBlur={e => updatePendingRow(row._id, { downPaymentMax: formatDownPaymentField(e.target.value) })} placeholder="Only if provided" />
                                  </div>
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Monthly Payment Max</div>
                                    <input className="input" value={row.monthlyPaymentMax || ''} onChange={e => updatePendingRow(row._id, { monthlyPaymentMax: e.target.value })} onBlur={e => updatePendingRow(row._id, { monthlyPaymentMax: formatMonthlyPaymentField(e.target.value) })} placeholder="Only if provided" />
                                  </div>
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Interest Rate Max</div>
                                    <select className="input" value={row.interestRateMax || ''} onChange={e => updatePendingRow(row._id, { interestRateMax: e.target.value })}>
                                      <option value="">Select rate</option>
                                      <option value="0%">0%</option><option value="3%">3%</option><option value="5%">5%</option><option value="6%">6%</option><option value="7%">7%</option><option value="8%">8%</option><option value="10%">10%</option><option value="Other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Cap Rate Target</div>
                                    <select className="input" value={row.capRateTarget || ''} onChange={e => updatePendingRow(row._id, { capRateTarget: e.target.value })}>
                                      <option value="">Select cap</option>
                                      <option value="5% cap">5% cap</option><option value="6% cap">6% cap</option><option value="7% cap">7% cap</option><option value="8% cap">8% cap</option><option value="9% cap">9% cap</option><option value="10% cap">10% cap</option><option value="Other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Balloon Term</div>
                                    <select className="input" value={row.balloonTerm || ''} onChange={e => updatePendingRow(row._id, { balloonTerm: e.target.value })}>
                                      <option value="">Select balloon</option>
                                      <option value="No balloon">No balloon</option><option value="3 years">3 years</option><option value="5 years">5 years</option><option value="7 years">7 years</option><option value="10 years">10 years</option><option value="Other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <div className="text-xs text-[#8B92A3]">Creative Structure</div>
                                    <input className="input" value={row.creativeStructure || ''} onChange={e => updatePendingRow(row._id, { creativeStructure: e.target.value })} placeholder="Seller Finance, Subject-To" />
                                  </div>
                                </div>
                              )}

                              <div>
                                
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400">Down Payment Max</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.downPaymentMax || row.downPayment || ''}
                                  onChange={e => updatePendingRow(row._id, { downPaymentMax: e.target.value, downPayment: e.target.value })}
                                  placeholder="Only if provided"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-400">Monthly Payment Max</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.monthlyPaymentMax || row.monthlyPayment || ''}
                                  onChange={e => updatePendingRow(row._id, { monthlyPaymentMax: e.target.value, monthlyPayment: e.target.value })}
                                  placeholder="Only if provided"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-400">Interest Rate Max</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.interestRateMax || row.interestRate || ''}
                                  onChange={e => updatePendingRow(row._id, { interestRateMax: e.target.value, interestRate: e.target.value })}
                                  placeholder="Only if provided"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-400">Cap Rate Target</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.capRateTarget || row.capRate || ''}
                                  onChange={e => updatePendingRow(row._id, { capRateTarget: e.target.value, capRate: e.target.value })}
                                  placeholder="Only if provided"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-400">Balloon Term</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.balloonTerm || ''}
                                  onChange={e => updatePendingRow(row._id, { balloonTerm: e.target.value })}
                                  placeholder="Only if provided"
                                />
                              </div>

                              <div>
                                <label className="text-xs text-gray-400">Creative Structure</label>
                                <input
                                  className="w-full mt-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white"
                                  value={row.creativeStructure || ''}
                                  onChange={e => updatePendingRow(row._id, { creativeStructure: e.target.value })}
                                  placeholder="Only if explicitly provided"
                                />
                              </div>
                            </div>

<div className="text-xs text-[#8B92A3]">Notes / Buy Box Summary</div>
                                <textarea className="input h-24" value={row.notes || ''} onChange={e => {
                                  const nextNotes = e.target.value
                                  const parsed = parsePropertyRequirements(nextNotes)
                                  updatePendingRow(row._id, {
                                    notes: nextNotes,
                                    bedRequirement: row.bedRequirement && row.bedRequirement !== 'Any' ? row.bedRequirement : parsed.bedRequirement,
                                    bathRequirement: row.bathRequirement && row.bathRequirement !== 'Any' ? row.bathRequirement : parsed.bathRequirement,
                                    unitRequirement: row.unitRequirement && row.unitRequirement !== 'Any' ? row.unitRequirement : parsed.unitRequirement,
                                  })
                                }} />
                              </div>

                              {(() => {
                                const proofFiles = Array.isArray((row as any).proofFiles)
                                  ? (row as any).proofFiles
                                  : Array.isArray((row as any).uploadedFiles)
                                    ? (row as any).uploadedFiles
                                    : Array.isArray((row as any).files)
                                      ? (row as any).files
                                      : []

                                return (
                                  <div className="rounded-lg border border-[#252A38] bg-[#0B0F17] p-3">
                                    <div className="text-xs font-semibold text-[#22C55E] mb-2">Buyer Verification / Proof Files</div>
                                    <BuyerDocumentManager
                                      files={proofFiles}
                                      uploadedBy={user?.email || user?.name || 'Admin Reviewer'}
                                      contextId={row._id}
                                      compact
                                      onChange={(nextDocs) => updatePendingRow(row._id, {
                                        proofFiles: nextDocs,
                                        uploadedFiles: nextDocs,
                                      })}
                                    />
                                  </div>
                                )
                              })()}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold mb-2 text-base">Buy Box &amp; Criteria</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-[#8B92A3]">Budget Min</div>
                                <input className="input" type="number" value={row.budgetMin || ''} onChange={e => updatePendingRow(row._id, { budgetMin: parseInt(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <div className="text-xs text-[#8B92A3]">Budget Max</div>
                                <input className="input" type="number" value={row.budgetMax || ''} onChange={e => updatePendingRow(row._id, { budgetMax: parseInt(e.target.value) || 0 })} />
                              </div>
                            </div>

                            <div className="mt-2 text-center text-sm font-medium text-[#22C55E]">
                              {formatBudget(row.budgetMin, row.budgetMax)}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!row.creativeFinance} onChange={e => updatePendingRow(row._id, { creativeFinance: e.target.checked })} /> Creative Finance
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!row.sellerFinance} onChange={e => updatePendingRow(row._id, { sellerFinance: e.target.checked })} /> Seller Finance
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!row.cashBuyer} onChange={e => updatePendingRow(row._id, { cashBuyer: e.target.checked })} /> Cash Buyer
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={rowMarkets.includes('Nationwide')} onChange={e => {
                                  const next = e.target.checked ? [...new Set([...rowMarkets, 'Nationwide'])] : rowMarkets.filter((x:string) => x !== 'Nationwide')
                                  updatePendingRow(row._id, { markets: next })
                                }} /> Nationwide
                              </label>
                            </div>

                            <div data-testid="buyer-property-requirements-review" className="mt-4 rounded-xl border border-[#252A38] bg-[#0B0F17] p-3">
                              <div className="font-semibold mb-2 text-base">Bed / Bath / Unit Requirements</div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-xs text-[#8B92A3] mb-1">Beds</div>
                                  <select
                                    className="input"
                                    value={getRequirementValue(row, 'bedRequirement')}
                                    onChange={e => updatePendingRow(row._id, { bedRequirement: e.target.value })}
                                  >
                                    {BED_REQUIREMENT_OPTIONS.map(option => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <div className="text-xs text-[#8B92A3] mb-1">Baths</div>
                                  <select
                                    className="input"
                                    value={getRequirementValue(row, 'bathRequirement')}
                                    onChange={e => updatePendingRow(row._id, { bathRequirement: e.target.value })}
                                  >
                                    {BATH_REQUIREMENT_OPTIONS.map(option => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <div className="text-xs text-[#8B92A3] mb-1">Units</div>
                                  <select
                                    className="input"
                                    value={getRequirementValue(row, 'unitRequirement')}
                                    onChange={e => updatePendingRow(row._id, { unitRequirement: e.target.value })}
                                  >
                                    {UNIT_REQUIREMENT_OPTIONS.map(option => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="text-[10px] text-[#8B92A3] mt-2">
                                Leave as Any when unknown. Only selected values count as buyer requirements.
                              </div>
                            </div>
                          </div>

                          
                          <div className="lg:col-span-2">
                            <div className="font-semibold mb-1.5 text-base">Target States</div>
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              {marketOptions.map(st => {
                                const active = rowMarkets.includes(st)
                                return (
                                  <button key={st} type="button" onClick={() => {
                                    const next = active ? rowMarkets.filter((x:string) => x !== st) : [...rowMarkets, st]
                                    updatePendingRow(row._id, { markets: next })
                                  }} className={`px-2 py-0.5 rounded border ${active ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#171B26] border-[#252A38] hover:border-[#3B82F6]'}`}>
                                    {st}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="lg:col-span-2">
                            <div className="font-semibold mb-1.5 text-base">Asset Focus</div>
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              {assetOptions.map(t => {
                                const active = rowAssets.includes(t)
                                return (
                                  <button key={t} type="button" onClick={() => {
                                    const next = active ? rowAssets.filter((x:string) => x !== t) : [...rowAssets, t]
                                    updatePendingRow(row._id, { assetTypes: next })
                                  }} className={`px-2 py-0.5 rounded border ${active ? 'bg-[#22C55E] text-black border-[#22C55E]' : 'bg-[#171B26] border-[#252A38] hover:border-[#3B82F6]'}`}>
                                    {t}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="lg:col-span-2">
                            <div className="font-semibold mb-1.5 text-base">Exit Strategy</div>
                            <StrategyChipSelector
                              value={rowStrategies}
                              otherValue={row.otherStrategy || row.other_strategy || ''}
                              onChange={(next) => updatePendingRow(row._id, buildBuyerStrategyUpdate({
                                ...row,
                                strategies: next,
                                strategy: next.join(', '),
                                exitStrategy: next.join(', '),
                                investmentStrategy: next.join(', '),
                              }))}
                              onOtherChange={(next) => updatePendingRow(row._id, { otherStrategy: next, other_strategy: next })}
                              compact
                            />
                          </div>
                        </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="sticky bottom-0 bg-[#0F131D] flex gap-2 mt-5 pt-4 border-t border-[#252A38]">
                  <button onClick={() => { void approveVisibleImportRows() }} disabled={Object.values(importApprovalStatus).includes('approving')} className="btn btn-green flex-1 disabled:opacity-60">
                    {Object.values(importApprovalStatus).includes('approving') ? 'Approving...' : 'Approve Visible'}
                  </button>
                  <button onClick={approveAllValid} disabled={Object.values(importApprovalStatus).includes('approving')} className="btn btn-green flex-1 disabled:opacity-60">Approve All Valid</button>
                  <button onClick={() => { setShowImport(false); void refreshBuyerPortalQueueCount() }} className="btn btn-ghost flex-1">Cancel &amp; Close (no import)</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}



