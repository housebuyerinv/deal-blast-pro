
﻿import React, { useState, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, Edit2, FileText, Users, CheckCircle, AlertTriangle, Save, Upload, Calculator, Target, Wrench, TrendingUp, Download } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '../../lib/utils'
import { downloadDealExport } from '../../lib/inventoryDownload'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

interface Props {
  dealId: string
  onClose: () => void
}

// EXPANDED SAFE DEAL TERMINAL DRAWER (stabilized + inline edit support)
// - ONLY local reads via selector + getState() inside handlers
// - Edit mode uses LOCAL form state only; writes ONLY on explicit Save buttons (no keystroke saves, no useEffect loops)
// - NO useEffect anywhere in this file
// - Read-only + full inline edit for existing deal (Edit Deal no longer creates new)
// - All listed fields editable in edit mode (property/pricing/creative/debt/condition/seller/notes/docs/closing)
// - Document upload supported inside edit mode
// - Update Missing Info stays in drawer + jumps to actionable section
// - Move to Closing updates status + toasts (visible in Inventory Closing filter)
// - Dedicated Closing section + explicit "Save Closing Info Only"
// - Full details across sections with "Not Provided" fallbacks
// - Closing view + lifecycle tabs added to Inventory Hub (no route breakage)
export default function DealTerminalDrawer({ dealId, onClose }: Props) {
  const deal = useAppStore(s => s.getDeal(dealId))
  const navigate = useNavigate()

  // Local read-only safe object only (never mutated, no normalization side effects)
  const safeDeal: any = deal || {}

  // === UPLOAD TRACE / DUAL SOURCE MERGE (for bug fix) ===
  // Some paths write to deal.docs (wizard on submit), others to store.documents[dealId] (Blast, drawer edit uploads).
  // Viewer + missing logic must read both so uploads never "disappear".
  const storeDocs = (useAppStore.getState().documents?.[dealId] || []) as any[]
  const dealDocs = (safeDeal.docs || []) as any[]
  const effectiveDocs = [
    ...dealDocs,
    ...storeDocs.filter((sd: any) => !dealDocs.some((dd: any) => dd.id === sd.id))
  ]

  // Temporary debug (point 6) — easy to remove later
  console.log('[DealDrawer Debug]', {
    dealId,
    dealDocsCount: dealDocs.length,
    storeDocsCount: storeDocs.length,
    effectiveDocsCount: effectiveDocs.length,
    photoCount: effectiveDocs.filter((d: any) => (d.category || '').includes('photo')).length,
    docCountByCat: effectiveDocs.reduce((acc: any, d: any) => { const c = d.category || 'Other'; acc[c] = (acc[c]||0)+1; return acc }, {})
  })

  // INLINE EDIT MODE (local-only state, writes ONLY on explicit Save buttons — no useEffect, no render writes)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)

  // Photo lightbox (simple modal for point 3)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<any[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [downloadPreparing, setDownloadPreparing] = useState(false)

  // Bulk selection for Documents & Photos Manager (point 3)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  // Quick Calculate in Drawer (compact ARV/Rehab/MAO only — local UI state, saves via notes marker)
  const [quickMode, setQuickMode] = useState<'none' | 'arv' | 'rehab' | 'mao'>('none')
  // Quick ARV (expanded per spec)
  const [qArvSqft, setQArvSqft] = useState(0)
  const [qArvBeds, setQArvBeds] = useState(0)
  const [qArvBaths, setQArvBaths] = useState(0)
  const [qArvPpsqft, setQArvPpsqft] = useState(0)
  const [qArvAdj, setQArvAdj] = useState(0)
  const [qArvNotes, setQArvNotes] = useState('')
  // Quick Rehab (preset + custom)
  const [qRehabPreset, setQRehabPreset] = useState<'Light' | 'Medium' | 'Heavy' | 'Custom'>('Medium')
  const [qRehabCustom, setQRehabCustom] = useState(0)
  const [qRehabNotes, setQRehabNotes] = useState('')
  // Quick MAO (improved)
  const [qMaoArv, setQMaoArv] = useState(0)
  const [qMaoRehab, setQMaoRehab] = useState(0)
  const [qMaoRule, setQMaoRule] = useState(70)
  const [qMaoFee, setQMaoFee] = useState(0)
  const [qMaoBuffer, setQMaoBuffer] = useState(0)
  const [qMaoNotes, setQMaoNotes] = useState('')

  // Ref to the drawer"™s internal scroll container (for Back to Top only)
  const drawerScrollRef = useRef<HTMLDivElement>(null)

  if (!deal) return null

  const formatVal = (v: any) => (v === undefined || v === null || v === '' ? 'Not Provided' : v)

  const formatNum = (v: any) => (v === undefined || v === null || v === 0 ? 'Not Provided' : formatCurrency(v))

  // === DEAL CALCULATOR SECTION HELPERS (local only, no schema change, reuses notes hack) ===
  const parseCalcResultsFromNotes = (notes: string | undefined | null) => {
    if (!notes) return [] as any[]
    const out: any[] = []
    const re = /===CALC:([^:]+):([^\n=]+)===\s*\n([\s\S]*?)(?=\n===CALC:|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(notes)) !== null) {
      try {
        const type = safeLower(m[1] || '')
        const date = m[2]
        const json = m[3].trim()
        const data = JSON.parse(json)
        out.push({ type, date, ...data })
      } catch { /* ignore bad blocks, never crash */ }
    }
    return out
  }

  const saveQuickResult = (type: 'arv' | 'rehab' | 'mao', payload: any) => {
    if (!dealId) { toast.error('No deal ID'); return }
    const { updateDeal, getDeal } = useAppStore.getState()
    const d = getDeal(dealId)
    if (!d) return
    const now = new Date().toISOString()
    const block = `\n===CALC:${type.toUpperCase()}:${now}===\n${JSON.stringify({ type, savedAt: now, ...payload })}\n`
    const nextNotes = (d.notes || '') + block
    updateDeal(dealId, { notes: nextNotes })
    toast.success(`Quick ${type.toUpperCase()} saved to deal`)
    // Close mini after save for cleanliness
    setQuickMode('none')
  }

  const openFullDealCalculator = () => {
    if (!dealId) return
    const { setCurrentDeal } = useAppStore.getState()
    setCurrentDeal(dealId)
    navigate(`/app/calculator?dealId=${encodeURIComponent(dealId)}`)
    onClose()
  }

  // Open quick mode and prefill from current deal (safe, optional fields). Passing 'none' closes.
  const openQuickWithPrefill = (mode: 'none' | 'arv' | 'rehab' | 'mao') => {
    if (mode === 'none') {
      setQuickMode('none')
      return
    }
    const p = safeDeal.property || {}
    const pr = safeDeal.pricing || {}
    if (mode === 'arv') {
      setQArvSqft(p.sqft || 0)
      setQArvBeds(p.beds || 0)
      setQArvBaths(p.baths || 0)
      setQArvPpsqft(0) // user enters avg from market knowledge or comps
      setQArvAdj(0)
      setQArvNotes('')
    } else if (mode === 'rehab') {
      setQRehabPreset('Medium')
      setQRehabCustom(pr.rehab || 0)
      setQRehabNotes('')
    } else if (mode === 'mao') {
      setQMaoArv(pr.arv || 0)
      setQMaoRehab(pr.rehab || 0)
      setQMaoRule(70)
      setQMaoFee(pr.assignmentFee || 0)
      setQMaoBuffer(0)
      setQMaoNotes('')
    }
    setQuickMode(mode)
  }

  // Compact quick calculators (ARV / Rehab / MAO only — guarded math, no full rental/creative)
  const quickArvEst = Math.max(0, Math.round((qArvSqft || 0) * (qArvPpsqft || 0) + (qArvAdj || 0)))
  const quickArvPpsqftUsed = qArvPpsqft || 0
  const quickRehabTotal = qRehabPreset === 'Custom' ? (qRehabCustom || 0) : Math.round((qRehabPreset === 'Light' ? 0.6 : qRehabPreset === 'Heavy' ? 1.6 : 1.0) * 8000) // simple base scaled; user can override with custom
  const quickMaoBase = Math.max(0, Math.round(((qMaoArv || 0) * (qMaoRule / 100)) - (qMaoRehab || 0) - (qMaoFee || 0) - (qMaoBuffer || 0)))
  const quickMaoSuggestedLow = Math.max(0, quickMaoBase - 15000)
  const quickMaoSuggestedHigh = Math.max(0, quickMaoBase - 5000)

  // Clean human labels for all internal keys (fixes raw camelCase everywhere in drawer)
  const cleanLabel = (key: string): string => {
    const map: Record<string, string> = {
      titleCompany: 'Title Company',
      titleContact: 'Title Contact',
      ownershipIssues: 'Ownership Issues',
      downPayment: 'Down Payment',
      monthlyPayment: 'Monthly Payment',
      interestRate: 'Interest Rate',
      balloonTerm: 'Balloon Term',
      amortization: 'Amortization',
      assignmentFee: 'Assignment Fee',
      askingPrice: 'Asking Price',
      contractPrice: 'Contract Price',
      currentRent: 'Current Rent',
      marketRent: 'Market Rent',
      capRate: 'Cap Rate',
      mortgageBalance: 'Mortgage Balance',
      arrears: 'Arrears',
      taxesOwed: 'Taxes Owed',
      helocBalance: 'HELOC Balance',
      otherDebt: 'Other Debt',
      liens: 'Liens',
      rehab: 'Estimated Rehab',
      arv: 'ARV',
      noi: 'NOI',
      sellerFinance: 'Seller Finance Available',
      isFreeClear: 'Free & Clear',
      walkthroughAvailable: 'Walkthrough Available',
      photosVideosAvailable: 'Photos/Videos Available',
      closingDate: 'Closing Date',
      escrowOfficer: 'Escrow Officer',
      buyerEntity: 'Buyer Entity',
      emdAmount: 'EMD Amount',
      emdDate: 'EMD Date',
      fundingStatus: 'Funding Status',
      commissionExpected: 'Commission Expected',
      commissionPaid: 'Commission Paid',
      closingNotes: 'Closing Notes',
      // add more as needed
    }
    if (map[key]) return map[key]
    // Fallback: nice title case
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
  }

  // Helper for missing styling
  const missingClass = (val: any) => (val === undefined || val === null || val === '' || val === 0 ? 'text-amber-400' : '')
  const missingBadge = (val: any) => (val === undefined || val === null || val === '' || val === 0 ? <span className="ml-1 text-[9px] px-1 py-0 rounded bg-red-500/20 text-red-400">Missing</span> : null)

  // Enter inline edit for the EXISTING deal only (snapshot current values)
  const enterEditMode = () => {
    if (!safeDeal) return
    // Deep-ish snapshot of editable sections (no store mutation)
    const snapshot = {
      property: { ...safeDeal.property },
      pricing: { ...safeDeal.pricing },
      debt: { ...safeDeal.debt },
      condition: { ...safeDeal.condition },
      submitter: { ...safeDeal.submitter },
      closing: safeDeal.closing ? { ...safeDeal.closing } : {},
      notes: safeDeal.notes || '',
      docs: [...(safeDeal.docs || [])]
    }
    setEditForm(snapshot)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditForm(null)
  }

  // Explicit SAVE only — called from buttons, never on keystroke
  const saveEdits = () => {
    if (!editForm) return
    const { updateDealProperty, updateDealPricing, updateDealDebt, updateDealCondition, updateSubmitter, updateDeal, logActivity } = useAppStore.getState()

    // Targeted writes (stable pattern)
    updateDealProperty(dealId, editForm.property || {})
    updateDealPricing(dealId, editForm.pricing || {})
    updateDealDebt(dealId, editForm.debt || {})
    updateDealCondition(dealId, editForm.condition || {})
    if (editForm.submitter) updateSubmitter(dealId, editForm.submitter)
    if (editForm.closing) {
      const { updateDealClosing } = useAppStore.getState()
      updateDealClosing(dealId, editForm.closing)
    }
    if (editForm.notes !== undefined) {
      updateDeal(dealId, { notes: editForm.notes })
    }

    logActivity(dealId, 'Edit', 'Deal details updated via drawer edit mode')
    toast.success('Changes saved')
    setIsEditing(false)
    setEditForm(null)
  }

  // Document upload inside edit mode (immediate via store, safe)
  const handleEditDocUpload = (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const files = Array.from(e.target.files || [])
    const { addDocument } = useAppStore.getState()
    files.forEach(file => {
      const url = URL.createObjectURL(file)
      addDocument(dealId, {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        category,
        name: file.name,
        url,
        size: file.size,
        uploadedAt: new Date().toISOString()
      })
    })
    e.target.value = ''
    if (editForm) {
      const newDocs = [...(editForm.docs || []), ...files.map((f, i) => ({
        id: `doc_${Date.now()}_${i}`, category, name: f.name, url: URL.createObjectURL(f), size: f.size, uploadedAt: new Date().toISOString()
      }))]
      setEditForm({ ...editForm, docs: newDocs })
    }
  }

  // === Full Photo/Document categories for classification (point 1) ===
  const PHOTO_CATEGORIES = [
    'Main Front Image', 'Front Exterior', 'Rear Exterior', 'Backyard', 'Street View',
    'Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3',
    'Bathroom 1', 'Bathroom 2', 'Basement', 'Attic', 'Garage', 'Roof',
    'HVAC', 'Water Heater', 'Electrical Panel', 'Plumbing', 'Foundation',
    'Damage / Repairs', 'Other Interior', 'Other Exterior'
  ]
  const DOCUMENT_CATEGORIES = [
    'Contract / PSA', 'OM', 'Rent Roll', 'T12', 'Comps', 'Title Docs',
    'Payoff / Debt Docs', 'Seller Finance Terms', 'Inspection Report', 'Other Document'
  ]

  // Manager actions - ONLY in explicit handlers via getState (stability)
  const removeDoc = (docId: string, name: string) => {
    if (!confirm(`Remove "${name}"? This cannot be undone.`)) return
    const { removeDocument, logActivity } = useAppStore.getState()
    removeDocument(dealId, docId)
    logActivity(dealId, 'Document Removed', name)
    toast.success('File removed')
  }

  const changeDocCategory = (docId: string, newCategory: string) => {
    // Update in the documents slice (the one used for many flows)
    const currentDocs = [...(useAppStore.getState().documents?.[dealId] || [])]
    const idx = currentDocs.findIndex(d => d.id === docId)
    if (idx === -1) return
    currentDocs[idx] = { ...currentDocs[idx], category: newCategory }

    // Apply the update via a safe re-set pattern using existing add/remove to avoid direct mutation issues
    const { removeDocument, addDocument, logActivity } = useAppStore.getState()
    const old = currentDocs[idx]
    removeDocument(dealId, docId)
    addDocument(dealId, {
      id: docId, // try to preserve id
      category: newCategory,
      name: old.name,
      url: old.url,
      size: old.size,
      uploadedAt: old.uploadedAt
    })
    logActivity(dealId, 'Category Changed', `${old.name} → ${newCategory}`)
    toast.success('Category updated')
  }

  const replaceDoc = (docId: string, oldName: string, oldCategory: string) => {
    // Trigger a hidden file input for this specific doc
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      const { removeDocument, addDocument, logActivity } = useAppStore.getState()
      const url = URL.createObjectURL(file)
      removeDocument(dealId, docId)
      addDocument(dealId, {
        category: oldCategory,
        name: file.name,
        url,
        size: file.size,
        uploadedAt: new Date().toISOString()
      })
      logActivity(dealId, 'Document Replaced', `${oldName} → ${file.name}`)
      toast.success('File replaced (same category)')
      setSelectedDocIds(prev => prev.filter(id => id !== docId))
    }
    input.click()
  }

  // Bulk actions (explicit handlers only)
  const selectAll = () => setSelectedDocIds(effectiveDocs.map((d: any) => d.id).filter(Boolean))
  const deselectAll = () => setSelectedDocIds([])
  const bulkDownload = () => {
    selectedDocIds.forEach(id => {
      const d = effectiveDocs.find((x: any) => x.id === id)
      if (d?.url) {
        const a = document.createElement('a')
        a.href = d.url
        a.download = d.name || 'file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    })
    toast.success(`Downloaded ${selectedDocIds.length} files`)
  }
  const bulkRemove = () => {
    if (!confirm(`Remove ${selectedDocIds.length} selected files?`)) return
    const { removeDocument, logActivity } = useAppStore.getState()
    selectedDocIds.forEach(id => {
      const d = effectiveDocs.find((x: any) => x.id === id)
      removeDocument(dealId, id)
      if (d) logActivity(dealId, 'Document Removed (bulk)', d.name)
    })
    toast.success(`Removed ${selectedDocIds.length} files`)
    setSelectedDocIds([])
  }
  const bulkChangeCategory = () => {
    const newCat = prompt('Enter new category for selected files:')
    if (!newCat) return
    selectedDocIds.forEach(id => changeDocCategory(id, newCat))
    toast.success(`Updated category for ${selectedDocIds.length} files`)
    setSelectedDocIds([])
  }

  // Safe handlers only (never called during render)
  const goToInventory = () => { navigate('/app/inventory'); onClose() }
  const editDeal = () => { enterEditMode() } // NOW opens inline edit for existing deal (no new deal, no route away)
  const viewDocuments = () => { window.scrollTo({ top: 800, behavior: 'smooth' }) }
  const buyerMatch = () => { navigate('/app/blast'); onClose() }
  const goToClosing = () => { window.scrollTo({ top: 1200, behavior: 'smooth' }) }
  const updateMissing = () => {
    // Stay in drawer. Scroll + visually highlight the missing checklist
    const el = document.getElementById('missing-info-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('ring-2', 'ring-red-500', 'bg-red-950/20')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-red-500', 'bg-red-950/20')
      }, 2200)
    }
    toast.error('Review highlighted missing fields below')
  }

  // Submission actions (used when opened from Submissions "Review Full Deal")
  const approveToInventory = () => {
    const { approveDeal } = useAppStore.getState()
    approveDeal(dealId)
    onClose()
  }
  const requestMoreInfo = () => {
    const { updateDeal, logActivity } = useAppStore.getState()
    updateDeal(dealId, { status: 'Needs Info' })
    logActivity(dealId, 'Approval Decision', 'Request More Info from drawer')
    onClose()
  }
  const rejectDeal = () => {
    const { updateDeal, logActivity } = useAppStore.getState()
    updateDeal(dealId, { status: 'Dead' })
    logActivity(dealId, 'Approval Decision', 'Rejected from drawer')
    onClose()
  }
  const saveAsDraft = () => {
    const { updateDeal, logActivity } = useAppStore.getState()
    updateDeal(dealId, { status: 'Draft' })
    logActivity(dealId, 'Drawer Action', 'Saved as Draft')
    onClose()
  }

  // Inventory specific actions (for Inventory Hub clicks)
  const buildBlast = () => { navigate('/app/blast'); onClose() }
  const viewBuyerMatches = () => { navigate('/app/blast'); onClose() }
  const markUnderContract = () => {
    const { updateDeal, logActivity } = useAppStore.getState()
    updateDeal(dealId, { status: 'Under Contract' })
    logActivity(dealId, 'Status', 'Marked Under Contract from drawer')
    toast.success('Marked Under Contract')
    // keep drawer open so user sees update in header
  }
  const moveToClosing = () => {
    const { updateDeal, logActivity } = useAppStore.getState()
    updateDeal(dealId, { status: 'Closing' })
    logActivity(dealId, 'Status', 'Moved to Closing')
    toast.success('Deal moved to Closing')
    // Status will reflect live in header via selector; deal now visible in Closing filter
  }

  const runDealDownload = async (format: 'pdf' | 'xlsx' | 'csv' | 'json') => {
    if (downloadPreparing) return
    setDownloadPreparing(true)
    try {
      await downloadDealExport(safeDeal, format)
      toast.success('Download ready')
      setDownloadMenuOpen(false)
    } catch (error) {
      console.warn('[Inventory Download] Deal download failed', error)
      toast.error("We couldn't prepare this download. Please try again.")
    } finally {
      setDownloadPreparing(false)
    }
  }

  // Use merged effective docs for all display + missing logic (fixes "uploads not appearing")
  const sourceLabel = safeDeal.source ? ` • ${safeDeal.source}` : ''

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/60" onClick={onClose}>
      <div
        ref={drawerScrollRef}
        className="w-full md:w-[960px] lg:w-[1040px] h-full bg-[#0A0C12] border-l border-[#252A38] overflow-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 border-b border-[#252A38] px-5 flex items-center justify-between shrink-0 bg-[#0A0C12] sticky top-0 z-10">
          <div>
            <div className="font-semibold text-lg">{safeDeal.property?.address || 'Deal Details'}</div>
            <div className="text-xs text-[#8B92A3] -mt-0.5">
              {safeDeal.property?.city}, {safeDeal.property?.state} • {safeDeal.status}{sourceLabel} • {formatCurrency(safeDeal.pricing?.askingPrice || safeDeal.pricing?.contractPrice)}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-2" aria-label="Close"><X size={18} /></button>
        </div>

        {/* VISIBLE ACTION BUTTONS - always shown. When editing: prominent Save/Cancel for the current deal */}
        <div className="border-b border-[#252A38] px-4 py-3 bg-[#12151F] flex flex-wrap gap-2 sticky top-14 z-10">
          {!isEditing ? (
            <>
              <button onClick={goToInventory} className="btn btn-ghost text-xs flex items-center gap-1"><ExternalLink size={14}/> Go to Inventory</button>
              <button onClick={editDeal} className="btn btn-ghost text-xs flex items-center gap-1"><Edit2 size={14}/> Edit Deal</button>
              <button onClick={viewDocuments} className="btn btn-ghost text-xs flex items-center gap-1"><FileText size={14}/> View Documents</button>
              <button onClick={() => setDownloadMenuOpen(open => !open)} className="btn btn-green text-xs flex items-center gap-1"><Download size={14}/> Download Deal</button>
              <button onClick={buyerMatch} className="btn btn-ghost text-xs flex items-center gap-1"><Users size={14}/> Buyer Match</button>
              <button onClick={goToClosing} className="btn btn-ghost text-xs flex items-center gap-1"><CheckCircle size={14}/> Closing</button>
              <button onClick={updateMissing} className="btn btn-ghost text-xs flex items-center gap-1 text-amber-400"><AlertTriangle size={14}/> Update Missing Info</button>

              {/* Context-aware submission / inventory actions (always visible) */}
              <button onClick={approveToInventory} className="btn btn-green text-xs ml-auto">Approve to Inventory</button>
              <button onClick={requestMoreInfo} className="btn btn-ghost text-xs">Request More Info</button>
              <button onClick={rejectDeal} className="btn btn-ghost text-xs text-red-400">Reject</button>
              <button onClick={saveAsDraft} className="btn btn-ghost text-xs">Save as Draft</button>

              {/* Inventory specific quick actions */}
              <button onClick={buildBlast} className="btn btn-ghost text-xs">Build Blast</button>
              <button onClick={viewBuyerMatches} className="btn btn-ghost text-xs">View Buyer Matches</button>
              <button onClick={markUnderContract} className="btn btn-ghost text-xs">Mark Under Contract</button>
              <button onClick={moveToClosing} className="btn btn-ghost text-xs">Move to Closing</button>
            </>
          ) : (
            <>
              <button onClick={saveEdits} className="btn btn-green text-xs flex items-center gap-1"><Save size={14}/> Save All Changes</button>
              <button onClick={cancelEdit} className="btn btn-ghost text-xs flex items-center gap-1"><X size={14}/> Cancel Edit</button>
              <span className="text-xs text-amber-400 px-2 py-1">Editing deal {dealId} — changes saved only on Save</span>
            </>
          )}
        </div>

        {downloadMenuOpen && !isEditing && (
          <div className="border-b border-[#252A38] px-4 py-3 bg-[#10141D] flex flex-wrap items-center gap-2 sticky top-[104px] z-10">
            <span className="text-xs font-semibold text-[#C5CAD6] mr-1">Download Deal</span>
            <button disabled={downloadPreparing} onClick={() => runDealDownload('pdf')} className="btn btn-green text-xs">PDF Report</button>
            <button disabled={downloadPreparing} onClick={() => runDealDownload('xlsx')} className="btn btn-ghost text-xs">Excel</button>
            <button disabled={downloadPreparing} onClick={() => runDealDownload('csv')} className="btn btn-ghost text-xs">CSV</button>
            <button disabled={downloadPreparing} onClick={() => runDealDownload('json')} className="btn btn-ghost text-xs">JSON</button>
            <button disabled={downloadPreparing} onClick={() => setDownloadMenuOpen(false)} className="btn btn-ghost text-xs ml-auto">Close</button>
            {downloadPreparing && <span className="text-xs text-[#8B92A3]">Preparing download...</span>}
          </div>
        )}

        {/* SECTIONS: read-only by default; full inline edit forms when isEditing (for existing deal only) */}
        <div className="flex-1 p-5 space-y-4 bg-[#0A0C12] text-sm">
          {!isEditing ? (
            <>
              {/* 1. Deal Summary */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">DEAL SUMMARY</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Status</span> {formatVal(safeDeal.status)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Source</span> {formatVal(safeDeal.source || 'Internal Intake')}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Created / Updated</span> {safeDeal.createdAt ? new Date(safeDeal.createdAt).toLocaleDateString() : 'Not Provided'} / {safeDeal.updatedAt ? new Date(safeDeal.updatedAt).toLocaleDateString() : 'Not Provided'}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Quality Score</span> {(() => { const q = useAppStore.getState().getDealQualityScore(dealId); return `${q.score} (${q.grade})` })()}</div>
                </div>
                {safeDeal.notes && <div className="mt-2 text-[#C5CAD6] whitespace-pre-line text-sm">{safeDeal.notes}</div>}
              </div>

              {/* 2. Property Info - clean readable grid */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">PROPERTY INFO</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Address</span> {formatVal(safeDeal.property?.address)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">City, State, Zip</span> {formatVal(safeDeal.property?.city)}, {formatVal(safeDeal.property?.state)} {formatVal(safeDeal.property?.zip)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">County</span> {formatVal(safeDeal.property?.county)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Type / Strategy</span> {formatVal(safeDeal.property?.type)} / {formatVal(safeDeal.property?.strategy)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Beds / Baths / Units</span> {formatVal(safeDeal.property?.beds)} / {formatVal(safeDeal.property?.baths)} / {formatVal(safeDeal.property?.units || 1)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Sqft / Year Built</span> {formatVal(safeDeal.property?.sqft)} / {formatVal(safeDeal.property?.yearBuilt)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Occupancy</span> {formatVal(safeDeal.property?.occupancy)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Description</span> {formatVal(safeDeal.property?.description)}</div>
                </div>
              </div>

              {/* 3. Pricing & Financials - clean rows, green money, no compressed bullets */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">PRICING & FINANCIALS</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Asking Price</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.askingPrice)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Contract Price</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.contractPrice)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Assignment Fee</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.assignmentFee)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">ARV</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.arv)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Estimated Rehab</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.rehab)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Current Rent</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.currentRent)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Market Rent</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.marketRent)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">NOI</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.noi)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Cap Rate</span> {formatVal(safeDeal.pricing?.capRate)}%</div>
                  <div><span className="text-[#8B92A3] block text-xs">Down Payment</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.downPayment)}</span></div>
                </div>
              </div>

              {/* 4. Seller Finance / Creative Terms */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">SELLER FINANCE / CREATIVE TERMS</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Seller Finance Available</span> {safeDeal.pricing?.sellerFinance ? 'Yes' : 'No'}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Monthly Payment</span> <span className="text-[#22C55E]">{formatNum(safeDeal.pricing?.monthlyPayment)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Interest Rate</span> {formatVal(safeDeal.pricing?.interestRate)}%</div>
                  <div><span className="text-[#8B92A3] block text-xs">Balloon Term (months)</span> {formatVal(safeDeal.pricing?.balloonTerm)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Amortization</span> {formatVal(safeDeal.pricing?.amortization)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">PITI Included</span> {safeDeal.pricing?.pitiIncluded ? 'Yes' : 'No / Not Provided'}</div>
                </div>
              </div>

              {/* NEW: Deal Calculator section (placed after Seller Finance / Creative Terms per spec) */}
              <div className="panel p-4 border border-[#252A38]">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2 flex items-center gap-2">
                  <Calculator size={14} /> DEAL CALCULATOR
                </div>

                {/* Saved results (from notes marker blocks — safe, never crashes) */}
                {(() => {
                  const results = parseCalcResultsFromNotes(safeDeal.notes)
                  if (!results.length) {
                    return <div className="text-[#8B92A3] text-sm mb-3">No calculator results saved yet.</div>
                  }
                  return (
                    <div className="space-y-2 mb-3">
                      {results.slice(0, 6).map((r: any, idx: number) => {
                        const d = r.savedAt || r.date || ''
                        const dt = d ? new Date(d).toLocaleString() : '—'
                        let keyLine = ''
                        const n = (v: any) => formatCurrency(v || 0)
                        if (r.type === 'arv') keyLine = `Est ARV: ${n(r.estARV)} • ${Number(r.avgPpsqft || 0).toFixed(2)}/sqft`
                        else if (r.type === 'rehab') keyLine = `Total Rehab: ${n(r.totalRehab || r.total)}`
                        else if (r.type === 'mao') keyLine = `MAO: ${n(r.mao)} • Range: ${n(r.suggestedLow || r.recommendedLow)}–${n(r.suggestedHigh || r.recommendedHigh)}`
                        else if (r.type === 'rental') keyLine = `CF: ${n(r.monthlyCF || r.annualCF)} • Cap: ${Number(r.capRate || 0).toFixed(1)}%`
                        else if (r.type === 'creative') keyLine = `Entry: ${n(r.entryCost)} • CF: ${n(r.monthlyCF)} • ${r.strength || ''}`
                        else keyLine = JSON.stringify(r).slice(0, 90)
                        const notePreview = r.notes ? ` • ${String(r.notes).slice(0, 40)}${r.notes.length > 40 ? '"¦' : ''}` : ''
                        return (
                          <div key={idx} className="bg-[#171B26] border border-[#252A38] rounded px-3 py-2 text-xs flex flex-col md:flex-row md:items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[#CBD5E1]">{(r.type || 'calc').toUpperCase()} <span className="text-[#8B92A3] font-normal">• {dt}</span></div>
                              <div className="text-[#22C55E] mt-0.5">{keyLine}{notePreview && <span className="text-[#8B92A3]">{notePreview}</span>}</div>
                            </div>
                            <button onClick={openFullDealCalculator} className="btn btn-ghost text-[10px] px-2 py-0.5 shrink-0">Open Calculator</button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={openFullDealCalculator}
                    disabled={!dealId}
                    className="btn btn-green text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Calculator size={14} /> Open Full Deal Calculator
                  </button>
                  <button
                    onClick={() => openQuickWithPrefill(quickMode === 'arv' ? 'none' : 'arv')}
                    disabled={!dealId}
                    className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <TrendingUp size={14} /> Quick ARV
                  </button>
                  <button
                    onClick={() => openQuickWithPrefill(quickMode === 'rehab' ? 'none' : 'rehab')}
                    disabled={!dealId}
                    className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Wrench size={14} /> Quick Rehab
                  </button>
                  <button
                    onClick={() => openQuickWithPrefill(quickMode === 'mao' ? 'none' : 'mao')}
                    disabled={!dealId}
                    className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Target size={14} /> Quick MAO
                  </button>
                </div>

                {/* Compact Quick Calculate forms (improved per spec: more useful inputs + visible outputs + presets) */}
                {quickMode !== 'none' && dealId && (
                  <div className="mt-3 p-3 bg-[#0F111A] border border-[#252A38] rounded text-xs">
                    {quickMode === 'arv' && (
                      <div>
                        <div className="font-medium mb-1.5 text-[#CBD5E1]">Quick ARV</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <div><div className="text-[#8B92A3] text-[10px]">Subject SqFt (prefilled)</div><input type="number" className="input py-1 text-sm w-full" value={qArvSqft || ''} onChange={e => setQArvSqft(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Beds</div><input type="number" className="input py-1 text-sm w-full" value={qArvBeds || ''} onChange={e => setQArvBeds(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Baths</div><input type="number" className="input py-1 text-sm w-full" value={qArvBaths || ''} onChange={e => setQArvBaths(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Avg $/SqFt</div><input type="number" className="input py-1 text-sm w-full" value={qArvPpsqft || ''} onChange={e => setQArvPpsqft(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Adj (+/- $)</div><input type="number" className="input py-1 text-sm w-full" value={qArvAdj || ''} onChange={e => setQArvAdj(parseFloat(e.target.value) || 0)} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Notes</div><input type="text" className="input py-1 text-sm w-full" value={qArvNotes} onChange={e => setQArvNotes(e.target.value)} placeholder="e.g. 3/2 SFH, good area" /></div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[#22C55E]">
                          <div><span className="text-[#8B92A3]">Est ARV:</span> <span className="font-semibold">{formatCurrency(quickArvEst)}</span></div>
                          <div><span className="text-[#8B92A3]">Avg $/SqFt used:</span> <span className="font-semibold">{quickArvPpsqftUsed.toFixed(2)}</span></div>
                        </div>
                        <button onClick={() => saveQuickResult('arv', { estARV: quickArvEst, subjectSqft: qArvSqft, beds: qArvBeds, baths: qArvBaths, avgPpsqft: qArvPpsqft, adjustment: qArvAdj, notes: qArvNotes })} className="btn btn-green text-xs mt-2 px-3 py-1">Save Quick ARV to Deal</button>
                      </div>
                    )}
                    {quickMode === 'rehab' && (
                      <div>
                        <div className="font-medium mb-1.5 text-[#CBD5E1]">Quick Rehab</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(['Light','Medium','Heavy','Custom'] as const).map(p => (
                            <button key={p} onClick={() => setQRehabPreset(p)} className={`btn btn-ghost text-[10px] px-2 py-0.5 ${qRehabPreset === p ? 'bg-[#22C55E] text-black' : ''}`}>{p}</button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[#8B92A3] text-[10px]">Preset est. (or enter custom)</div>
                            <input type="number" className="input py-1 text-sm w-full" value={qRehabCustom || ''} onChange={e => { setQRehabCustom(Math.max(0, parseFloat(e.target.value) || 0)); setQRehabPreset('Custom') }} placeholder="Custom amount" />
                          </div>
                          <div><div className="text-[#8B92A3] text-[10px]">Notes</div><input type="text" className="input py-1 text-sm w-full" value={qRehabNotes} onChange={e => setQRehabNotes(e.target.value)} /></div>
                        </div>
                        <div className="mt-2 text-[#22C55E]"><span className="text-[#8B92A3]">Estimated Rehab Total:</span> <span className="font-semibold">{formatCurrency(quickRehabTotal)}</span></div>
                        <button onClick={() => saveQuickResult('rehab', { totalRehab: quickRehabTotal, preset: qRehabPreset, custom: qRehabCustom, notes: qRehabNotes })} className="btn btn-green text-xs mt-2 px-3 py-1">Save Quick Rehab to Deal</button>
                      </div>
                    )}
                    {quickMode === 'mao' && (
                      <div>
                        <div className="font-medium mb-1.5 text-[#CBD5E1]">Quick MAO / Offer</div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <div><div className="text-[#8B92A3] text-[10px]">ARV</div><input type="number" className="input py-1 text-sm w-full" value={qMaoArv || ''} onChange={e => setQMaoArv(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Rehab</div><input type="number" className="input py-1 text-sm w-full" value={qMaoRehab || ''} onChange={e => setQMaoRehab(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Rule %</div><input type="number" className="input py-1 text-sm w-full" value={qMaoRule || ''} onChange={e => setQMaoRule(Math.max(50, Math.min(80, parseFloat(e.target.value) || 70)))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Assignment Fee</div><input type="number" className="input py-1 text-sm w-full" value={qMaoFee || ''} onChange={e => setQMaoFee(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                          <div><div className="text-[#8B92A3] text-[10px]">Buyer Buffer</div><input type="number" className="input py-1 text-sm w-full" value={qMaoBuffer || ''} onChange={e => setQMaoBuffer(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[#22C55E]">
                          <div><span className="text-[#8B92A3]">MAO:</span> <span className="font-semibold">{formatCurrency(quickMaoBase)}</span></div>
                          <div><span className="text-[#8B92A3]">Suggested Seller Range:</span> <span className="font-semibold">{formatCurrency(quickMaoSuggestedLow)} – {formatCurrency(quickMaoSuggestedHigh)}</span></div>
                        </div>
                        <button onClick={() => saveQuickResult('mao', { mao: quickMaoBase, arv: qMaoArv, rehab: qMaoRehab, rule: qMaoRule, fee: qMaoFee, buffer: qMaoBuffer, suggestedLow: quickMaoSuggestedLow, suggestedHigh: quickMaoSuggestedHigh, notes: qMaoNotes })} className="btn btn-green text-xs mt-2 px-3 py-1">Save Quick MAO to Deal</button>
                      </div>
                    )}
                    <div className="text-[10px] text-[#6B7280] mt-2">Saved results appear in this drawer under Deal Calculator. Use Full Calculator for advanced tools + full Save to Deal.</div>
                  </div>
                )}

                {!dealId && <div className="text-amber-400 text-xs mt-1">Deal ID missing — buttons disabled.</div>}
              </div>

              {/* 5. Debt & Title - with missing badges */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">DEBT & TITLE</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Free & Clear</span> {safeDeal.debt?.isFreeClear ? 'Yes' : 'No'} {missingBadge(safeDeal.debt?.isFreeClear === undefined)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Mortgage Balance</span> <span className={missingClass(safeDeal.debt?.mortgageBalance)}>{formatNum(safeDeal.debt?.mortgageBalance)}</span> {missingBadge(safeDeal.debt?.mortgageBalance)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Arrears / Taxes Owed</span> <span className={missingClass(safeDeal.debt?.arrears)}>{formatNum(safeDeal.debt?.arrears)}</span> / <span className={missingClass(safeDeal.debt?.taxesOwed)}>{formatNum(safeDeal.debt?.taxesOwed)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Title Company</span> <span className={missingClass(safeDeal.debt?.titleCompany)}>{formatVal(safeDeal.debt?.titleCompany)}</span> {missingBadge(safeDeal.debt?.titleCompany)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Title Contact</span> <span className={missingClass(safeDeal.debt?.titleContact)}>{formatVal(safeDeal.debt?.titleContact)}</span> {missingBadge(safeDeal.debt?.titleContact)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Liens / Ownership Issues</span> <span className={missingClass(safeDeal.debt?.liens || safeDeal.debt?.ownershipIssues)}>{formatVal(safeDeal.debt?.liens || safeDeal.debt?.ownershipIssues)}</span></div>
                  <div><span className="text-[#8B92A3] block text-xs">Probate / Foreclosure / Code Violations / Eviction</span> {safeDeal.debt?.probate || safeDeal.debt?.foreclosure || safeDeal.debt?.codeViolations || safeDeal.debt?.eviction ? 'Flagged' : 'None flagged'}</div>
                </div>
              </div>

              {/* 6. Occupancy & Access + 7. Condition / Repairs */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">OCCUPANCY, ACCESS & CONDITION / REPAIRS</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Occupancy Status</span> {formatVal(safeDeal.condition?.occupancyStatus || safeDeal.property?.occupancy)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Tenant / Lease Details</span> {formatVal(safeDeal.condition?.tenantDetails)} / {formatVal(safeDeal.condition?.leaseTerms)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Section 8</span> {safeDeal.condition?.section8 ? 'Yes' : 'No / Not Provided'}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Walkthrough Available</span> {safeDeal.condition?.walkthroughAvailable ? 'Yes' : 'No / Not Provided'} {missingBadge(safeDeal.condition?.walkthroughAvailable)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Lockbox / Photos-Videos</span> {formatVal(safeDeal.condition?.lockbox)} / {safeDeal.condition?.photosVideosAvailable ? 'Yes' : 'No'}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Roof / HVAC / Plumbing / Electrical</span> {formatVal(safeDeal.condition?.roof)} / {formatVal(safeDeal.condition?.hvac)} / {formatVal(safeDeal.condition?.plumbing)} / {formatVal(safeDeal.condition?.electrical)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Foundation / Major Repairs</span> {formatVal(safeDeal.condition?.foundation)} / {formatVal(safeDeal.condition?.majorRepairs)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Rehab Notes</span> {formatVal(safeDeal.condition?.rehabNotes)}</div>
                </div>
              </div>

              {/* 8. Seller / POC / Submitter */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">SELLER / POC / SUBMITTER</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Name</span> {formatVal(safeDeal.submitter?.name)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Company</span> {formatVal(safeDeal.submitter?.company)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Email / Phone</span> {formatVal(safeDeal.submitter?.email)} / {formatVal(safeDeal.submitter?.phone)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Role</span> {formatVal(safeDeal.submitter?.role)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Owner / Under Contract</span> {safeDeal.submitter?.isOwner ? 'Yes' : 'No'}</div>
                  <div><span className="text-[#8B92A3] block text-xs">JV Structure / Control</span> {formatVal(safeDeal.submitter?.jvStructure)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Consent on File</span> {safeDeal.submitter?.consent ? 'Yes' : 'No / Not Provided'} {missingBadge(safeDeal.submitter?.consent)}</div>
                </div>
              </div>

              {/* 10. Documents & Photos — Full Manager (points 1-4) */}
              <div id="docs-section" className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2 flex items-center justify-between">
                  <span>DOCUMENTS & PHOTOS MANAGER</span>
                  <span className="text-[#22C55E]">{effectiveDocs.length} files</span>
                </div>

                {/* Bulk toolbar (point 3) */}
                {effectiveDocs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px] border-b border-[#252A38] pb-2">
                    <button onClick={selectAll} className="btn btn-ghost px-1 py-0">Select All</button>
                    <button onClick={deselectAll} className="btn btn-ghost px-1 py-0">Deselect All</button>
                    <span className="text-[#8B92A3]">Selected: {selectedDocIds.length}</span>
                    {selectedDocIds.length > 0 && (
                      <>
                        <button onClick={bulkDownload} className="btn btn-ghost px-1 py-0">Bulk Download</button>
                        <button onClick={bulkRemove} className="btn btn-ghost px-1 py-0 text-red-400">Bulk Remove</button>
                        <button onClick={bulkChangeCategory} className="btn btn-ghost px-1 py-0">Bulk Change Category</button>
                      </>
                    )}
                  </div>
                )}

                {effectiveDocs.length === 0 ? (
                  <div className="text-amber-400">No documents uploaded.</div>
                ) : (
                  <div className="space-y-2">
                    {effectiveDocs.map((d: any, i: number) => {
                      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(d.name || '') || (d.url || '').startsWith('blob:')
                      const currentCat = d.category || 'Other'
                      const isPhoto = PHOTO_CATEGORIES.includes(currentCat) || safeLower(currentCat).includes('photo') || safeLower(currentCat).includes('exterior') || safeLower(currentCat).includes('interior') || safeLower(currentCat).includes('bedroom') || safeLower(currentCat).includes('bathroom')
                      const isSelected = selectedDocIds.includes(d.id)

                      return (
                        <div key={d.id || i} className={`flex flex-col md:flex-row md:items-center gap-2 bg-[#171B26] p-2 rounded text-xs ${isSelected ? 'ring-1 ring-[#22C55E]' : ''}`}>
                          {/* Thumbnail / Icon */}
                          {isImage ? (
                            <img src={d.url} alt={d.name} className="w-14 h-14 object-cover rounded border border-[#252A38] cursor-pointer" onClick={() => {
                              const imgs = effectiveDocs.filter((x: any) => /\.(png|jpe?g|gif|webp|svg)$/i.test(x.name || '') || (x.url || '').startsWith('blob:'))
                              const idx = imgs.findIndex((x: any) => x.id === d.id)
                              setLightboxPhotos(imgs)
                              setLightboxIndex(Math.max(0, idx))
                              setLightboxOpen(true)
                            }} />
                          ) : (
                            <div className="w-14 h-14 bg-[#252A38] rounded flex items-center justify-center text-[10px] text-[#8B92A3] flex-shrink-0">DOC</div>
                          )}

                          {/* Meta */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{d.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {/* Live Category (editable) */}
                              <select
                                className="select text-[10px] py-0 px-1"
                                value={currentCat}
                                onChange={(e) => changeDocCategory(d.id, e.target.value)}
                              >
                                {(isPhoto ? PHOTO_CATEGORIES : DOCUMENT_CATEGORIES).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                                <option value="Other">Other</option>
                              </select>
                              <span className="text-[#8B92A3]">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : ''}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {isImage && (
                              <button onClick={() => {
                                const imgs = effectiveDocs.filter((x: any) => /\.(png|jpe?g|gif|webp|svg)$/i.test(x.name || '') || (x.url || '').startsWith('blob:'))
                                const idx = imgs.findIndex((x: any) => x.id === d.id)
                                setLightboxPhotos(imgs)
                                setLightboxIndex(Math.max(0, idx))
                                setLightboxOpen(true)
                              }} className="btn btn-ghost px-1 py-0">View</button>
                            )}
                            <a href={d.url} download={d.name} className="btn btn-ghost px-1 py-0">Download</a>
                            <button onClick={() => replaceDoc(d.id, d.name, currentCat)} className="btn btn-ghost px-1 py-0">Replace</button>
                            <button onClick={() => removeDoc(d.id, d.name)} className="btn btn-ghost px-1 py-0 text-red-400">Remove</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="text-[10px] text-[#8B92A3] mt-2">Change category live. Replace keeps the chosen category. All changes via explicit actions.</div>
              </div>

              {/* 11. Activity + 13. Closing Info (full) */}
              <div className="panel p-4">
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mb-2">ACTIVITY & CLOSING INFO</div>
                <div className="text-sm mb-2">Recent notes: {safeDeal.notes || 'No activity notes recorded yet.'}</div>
                {/* Closing full details */}
                <div className="uppercase text-xs tracking-widest text-[#8B92A3] mt-3 mb-1">CLOSING DETAILS</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-[#8B92A3] block text-xs">Closing Date</span> {formatVal(safeDeal.closing?.closingDate)} {missingBadge(safeDeal.closing?.closingDate)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Title Company / Escrow Officer</span> {formatVal(safeDeal.closing?.titleCompany || safeDeal.debt?.titleCompany)} / {formatVal(safeDeal.closing?.escrowOfficer)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Buyer Entity</span> {formatVal(safeDeal.closing?.buyerEntity || safeDeal.submitter?.name)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">EMD Amount / Date</span> <span className="text-[#22C55E]">{formatNum(safeDeal.closing?.emdAmount)}</span> / {formatVal(safeDeal.closing?.emdDate)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Funding Status</span> {formatVal(safeDeal.closing?.fundingStatus)}</div>
                  <div><span className="text-[#8B92A3] block text-xs">Commission (Expected / Paid)</span> <span className="text-[#22C55E]">{formatNum(safeDeal.closing?.commissionExpected)}</span> / <span className="text-[#22C55E]">{formatNum(safeDeal.closing?.commissionPaid)}</span></div>
                  <div className="md:col-span-2"><span className="text-[#8B92A3] block text-xs">Closing Notes</span> {formatVal(safeDeal.closing?.closingNotes)}</div>
                </div>
              </div>

              {/* 12. Missing Info Checklist - fully actionable, highlighted on trigger */}
              <div id="missing-info-section" className="panel p-4 border border-[#252A38]">
                <div className="uppercase text-xs tracking-widest text-red-400 mb-2 font-semibold">MISSING INFO CHECKLIST — Click "Update Missing Info" to highlight this section</div>
                {(() => {
                  const attentionItems = useAppStore.getState().getDealAttentionItems(safeDeal)
                  // Convert to the nice {label, why} format the UI expects
                  const items = attentionItems.map(it => ({
                    label: it,
                    why: it.includes('Photo') ? 'Required for buyer matching and quality score' : 'Critical for pipeline / closing / matching',
                    key: safeLower(it).replace(/\s+/g, '-')
                  }))

                  const editField = (key: string) => { enterEditMode(); setTimeout(() => { const t = document.getElementById(`edit-${key}`) || document.getElementById('edit-pricing'); t?.scrollIntoView({behavior:'smooth'}) }, 60) }
                  const markNotNeeded = (label: string) => { 
                    useAppStore.getState().dismissDealAttention(dealId, [label])
                    toast.success(`Dismissed "${label}" for this session`)
                  }

                  return items.length ? (
                    <div className="space-y-1">
                      {items.map((it, i) => (
                        <div key={i} className="flex flex-col md:flex-row md:items-center justify-between text-xs bg-red-950/30 border border-red-500/30 px-2 py-1.5 rounded">
                          <div>
                            <span className="font-medium text-red-300">{it.label}</span>
                            <span className="text-[#8B92A3] ml-2">— {it.why}</span>
                          </div>
                          <div className="flex gap-1 mt-1 md:mt-0">
                            <button onClick={() => editField(it.key)} className="btn btn-ghost text-[10px] px-1.5 py-0 text-[#3B82F6]">Edit This Field</button>
                            <button onClick={() => markNotNeeded(it.label)} className="btn btn-ghost text-[10px] px-1.5 py-0">Mark Not Needed</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-[#22C55E] text-xs">No critical missing items flagged.</div>
                })()}
              </div>
            </>
          ) : (
            /* ========== INLINE EDIT MODE FOR EXISTING DEAL ONLY ========== */
            <div className="space-y-4">
              <div className="text-amber-400 text-sm font-medium">EDIT MODE — {safeDeal.property?.address} (ID: {dealId}) — Press Save All Changes to persist. No auto-save.</div>

              {/* Property Info edit */}
              <div id="edit-property" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Property Info</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['address','city','state','zip','county','type','strategy','beds','baths','units','sqft','yearBuilt','occupancy','description'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input className="input text-sm py-1 w-full" value={editForm?.property?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, property: {...p.property, [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing & Financials + Seller Finance edit */}
              <div id="edit-pricing" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Pricing & Financials + Seller Finance / Creative Terms</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['askingPrice','contractPrice','arv','rehab','noi','capRate','downPayment','monthlyPayment','interestRate','balloonTerm','amortization'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input className="input text-sm py-1 w-full" value={editForm?.pricing?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, pricing: {...p.pricing, [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
                <label className="text-sm flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={!!editForm?.pricing?.sellerFinance} onChange={e => setEditForm((p: any) => ({...p, pricing: {...p.pricing, sellerFinance: e.target.checked }}))} /> {cleanLabel('sellerFinance')}
                </label>
              </div>

              {/* Debt & Title edit */}
              <div id="edit-debt" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Debt & Title</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['mortgageBalance','monthlyPayment','interestRate','arrears','taxesOwed','liens','titleCompany','titleContact','ownershipIssues'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input className="input text-sm py-1 w-full" value={editForm?.debt?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, debt: {...p.debt, [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
                <label className="text-sm mt-2 block"><input type="checkbox" checked={!!editForm?.debt?.isFreeClear} onChange={e => setEditForm((p:any)=>({...p, debt:{...p.debt, isFreeClear: e.target.checked}}))} /> {cleanLabel('isFreeClear')}</label>
              </div>

              {/* Condition / Occupancy / Access edit */}
              <div id="edit-condition" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Condition / Repairs / Occupancy & Access</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['roof','hvac','plumbing','electrical','foundation','majorRepairs','rehabNotes','occupancyStatus','tenantDetails','leaseTerms','lockbox'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input className="input text-sm py-1 w-full" value={editForm?.condition?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, condition: {...p.condition, [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
                <label className="text-sm mt-2 block"><input type="checkbox" checked={!!editForm?.condition?.walkthroughAvailable} onChange={e => setEditForm((p:any)=>({...p, condition:{...p.condition, walkthroughAvailable:e.target.checked}}))} /> {cleanLabel('walkthroughAvailable')}</label>
              </div>

              {/* Seller / POC / Submitter edit */}
              <div id="edit-submitter" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Seller / POC / Submitter</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['name','company','email','phone','role','jvStructure'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input className="input text-sm py-1 w-full" value={editForm?.submitter?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, submitter: {...p.submitter, [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  <label><input type="checkbox" checked={!!editForm?.submitter?.isOwner} onChange={e => setEditForm((p:any)=>({...p, submitter:{...p.submitter, isOwner:e.target.checked}}))} /> {cleanLabel('isOwner')}</label>
                  <label><input type="checkbox" checked={!!editForm?.submitter?.consent} onChange={e => setEditForm((p:any)=>({...p, submitter:{...p.submitter, consent:e.target.checked}}))} /> Consent on File</label>
                </div>
              </div>

              {/* Notes edit */}
              <div className="panel p-4">
                <div className="font-semibold mb-2 text-base">Notes</div>
                <textarea className="input h-20 w-full" value={editForm?.notes || ''} onChange={e => setEditForm((p:any)=>({...p, notes: e.target.value}))} />
              </div>

              {/* Documents upload in edit mode */}
              <div id="edit-docs" className="panel p-4">
                <div className="font-semibold mb-2 text-base flex items-center gap-2">Documents / Photos / Files <Upload size={14}/></div>
                <div className="text-xs mb-1">Quick upload (choose category):</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {[...PHOTO_CATEGORIES.slice(0,6), ...DOCUMENT_CATEGORIES.slice(0,4)].map(cat => (
                    <label key={cat} className="btn btn-ghost text-[10px] cursor-pointer px-1.5 py-0.5">
                      + {cat}
                      <input type="file" multiple className="hidden" onChange={e => handleEditDocUpload(e, cat)} />
                    </label>
                  ))}
                </div>
                <div className="text-xs">{(editForm?.docs || []).length} file(s) attached. Uploads are immediate.</div>
              </div>

              {/* Closing fields edit + explicit Save Closing Info */}
              <div id="edit-closing" className="panel p-4">
                <div className="font-semibold mb-2 text-base">Closing Info (explicit save)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  {['closingDate','titleCompany','escrowOfficer','buyerEntity','emdAmount','emdDate','fundingStatus','commissionExpected','commissionPaid','closingNotes'].map(k => (
                    <div key={k} className="text-sm">
                      <div className="text-[#8B92A3] text-xs mb-0.5">{cleanLabel(k)}</div>
                      <input type={['closingDate','emdDate'].includes(k) ? 'date' : 'text'} className="input text-sm py-1 w-full" value={editForm?.closing?.[k] ?? ''} onChange={e => setEditForm((p: any) => ({...p, closing: {...(p.closing||{}), [k]: e.target.value }}))} />
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  if (!editForm?.closing) return
                  const { updateDealClosing, logActivity } = useAppStore.getState()
                  updateDealClosing(dealId, editForm.closing)
                  logActivity(dealId, 'Closing', 'Closing info saved from drawer')
                  toast.success('Closing info saved')
                }} className="btn btn-green text-xs mt-3">Save Closing Info Only</button>
              </div>

              {/* Bottom Save / Cancel for the whole edit session */}
              <div className="flex gap-2 pt-2">
                <button onClick={saveEdits} className="btn btn-green flex-1">Save All Changes</button>
                <button onClick={cancelEdit} className="btn btn-ghost flex-1">Cancel Edit (discard)</button>
              </div>
              <div className="text-[10px] text-[#8B92A3]">All fields above (Property, Pricing, Debt, Condition, Seller, Notes, Docs, Closing) are editable. Saves are explicit only — no live store writes on typing.</div>
            </div>
          )}
        </div>

        {/* Image Viewer Modal (point 3) - in-app, no raw blob navigation */}
        {lightboxOpen && lightboxPhotos.length > 0 && (
          <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxOpen(false)}>
            <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
              <div className="bg-[#0A0C12] rounded-xl overflow-hidden border border-[#252A38]">
                <div className="p-3 flex items-center justify-between border-b border-[#252A38]">
                  <div>
                    <div className="font-semibold">{lightboxPhotos[lightboxIndex]?.name}</div>
                    <div className="text-xs text-[#8B92A3]">{lightboxPhotos[lightboxIndex]?.category || 'Photo'}</div>
                  </div>
                  <div className="flex gap-2">
                    <a href={lightboxPhotos[lightboxIndex]?.url} download={lightboxPhotos[lightboxIndex]?.name} className="btn btn-ghost text-xs">Download</a>
                    <button onClick={() => setLightboxOpen(false)} className="btn btn-ghost text-xs">Close</button>
                  </div>
                </div>
                <div className="p-4 flex justify-center bg-black">
                  <img
                    src={lightboxPhotos[lightboxIndex]?.url}
                    alt={lightboxPhotos[lightboxIndex]?.name}
                    className="max-h-[72vh] max-w-full object-contain"
                  />
                </div>
                {lightboxPhotos.length > 1 && (
                  <div className="p-3 border-t border-[#252A38] flex items-center justify-between text-xs">
                    <button onClick={() => setLightboxIndex((lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length)} className="btn btn-ghost">← Previous</button>
                    <span className="text-[#8B92A3]">{lightboxIndex + 1} / {lightboxPhotos.length}</span>
                    <button onClick={() => setLightboxIndex((lightboxIndex + 1) % lightboxPhotos.length)} className="btn btn-ghost">Next →</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#252A38] p-4 flex gap-2 shrink-0 bg-[#0A0C12] sticky bottom-0 z-10">
          {!isEditing && (
            <button onClick={() => setDownloadMenuOpen(open => !open)} className="btn btn-green flex items-center gap-2"><Download size={16}/> Download Deal</button>
          )}
          <button onClick={onClose} className="btn btn-primary flex-1">Close Drawer</button>
          <button onClick={() => drawerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="btn btn-ghost">Back to Top</button>
        </div>
      </div>
    </div>
  )
}
