import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { submitDealToSupabase } from '../../lib/dealSubmissionStorage'
import PublicNav from '../../components/layout/PublicNav'


export default function Portal() {
  const trial = useAppStore(s => s.trial)
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : 'Trial Active')
  const paidAccessActive = billingStatus === 'Paid Active' || billingStatus === 'Comped'
  const billingAccessBlocked = billingStatus === 'Past Due' || billingStatus === 'Cancelled' || billingStatus === 'Payment Pending'
  const publicSubmissionBlocked = billingAccessBlocked || (!paidAccessActive && (trial.plan || 'Free Demo') === 'Free Demo' && (!trial.isActive || (trial.daysLeft || 0) <= 0))
  const publicSubmissionBlockedMessage = billingAccessBlocked
    ? billingStatus === 'Payment Pending'
      ? 'Public deal submissions are paused while payment is pending. Please wait for admin confirmation or contact admin if payment has already been completed.'
      : billingStatus === 'Past Due'
        ? 'Public deal submissions are paused because billing is past due. Please complete payment or contact admin to restore access.'
        : 'Public deal submissions are paused because the plan is cancelled. Contact admin to reactivate billing, or use Free Demo if available.'
    : 'Public deal submissions are paused because the Free Demo has expired. Please upgrade or contact admin to complete billing in Settings & Trial.'

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'Wholesaler', company: '', bestContactTime: '',
    address: '', city: '', state: '', zip: '', county: '', assetType: 'SFH', occupancy: 'Vacant',
    yearBuilt: '', beds: '', baths: '', sqFt: '', units: '', lotSize: '',
    askingPrice: '', contractPrice: '', arv: '', rehab: '', rent: '', noi: '', capRate: '',
    structure: 'Cash', underContract: 'No', closeTimeline: '',
    mortgageBalance: '', downPayment: '', monthlyPayment: '', balloonDate: '', wholesaleFee: '',
    sellerFinanceTerms: '', notes: '', docs: [],
    freeAndClearStatus: '',
    debtTotalOwed: '', debtLoanBalance: '', debtMonthlyPayment: '', debtPaymentsCurrent: '',
    debtLiensJudgments: '', debtNotes: '', debtExplanation: '',
    directToSeller: 'Direct to Owner', proofOfControl: 'Not Yet',
    sellerMotivation: '', accessInstructions: '', lockboxInfo: '', titleLienIssues: '',
    permissionsConfirmed: false, consent: false
  })

  const [documents, setDocuments] = useState<Record<string, any[]>>({
    photos: [], psa: [], rentRoll: [], t12: [], om: [], comps: [], financials: [], other: []
  })

  const [honeypot, setHoneypot] = useState('')
  const [lastSubmit, setLastSubmit] = useState<number>(0)
  const [submitted, setSubmitted] = useState(false)
  const [submissionId, setSubmissionId] = useState('')
  const [submissionWarning, setSubmissionWarning] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const STEPS = ['Contact Info', 'Property Info', 'Deal Terms', 'Directness & Control', 'Documents', 'Review & Submit'] as const

  const ASSET_TYPES = ['SFH', 'Multifamily', 'MHP', 'Hotel', 'Retail', 'Storage', 'Land', 'Mixed-Use', 'Industrial', 'Office', 'Portfolio', 'Other']
  const STRUCTURES = ['Cash', 'Assignment', 'JV', 'Seller Finance', 'Subject-To', 'Hybrid', 'Other']
  const OCCUPANCIES = ['Vacant', 'Tenant Occupied', 'Owner Occupied', 'Unknown']
  const DIRECTS = ['Owner', 'Direct to Owner', '1 person from seller', '2+ people from seller', 'Not sure']
  const PROOFS = ['PSA/Contract', 'JV Agreement', 'Written Authorization', 'Not Yet']
  const CONTRACT_OPTS = ['Yes', 'No', 'Pending']
  const TIMELINES = ['0-30 days', '31-60 days', '61-90 days', '90+ days', 'Flexible / TBD']
  const FREE_CLEAR_OPTS = ['Yes, free and clear', 'No, there is debt owed', 'Not sure']
  const PAYMENTS_CURRENT_OPTS = ['Current', 'Behind', 'Not sure']

  const DOC_CATS = [
    { key: 'photos', label: 'Photos' },
    { key: 'psa', label: 'PSA / Contract' },
    { key: 'rentRoll', label: 'Rent Roll' },
    { key: 't12', label: 'T12' },
    { key: 'om', label: 'OM' },
    { key: 'comps', label: 'Comps' },
    { key: 'financials', label: 'Financials' },
    { key: 'other', label: 'Other documents' }
  ]

  const updateForm = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) {
      const next = { ...errors }
      delete next[key]
      setErrors(next)
    }
  }

  const addDocs = (cat: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    const added = Array.from(fileList).map((file, index) => ({
      id: `portal_doc_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`,
      category: cat,
      label: cat,
      name: file.name,
      fileName: file.name,
      size: Math.round(file.size / 1024),
      sizeKb: Math.round(file.size / 1024),
      fileSize: file.size,
      type: file.type || 'application/octet-stream',
      fileType: file.type || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      file,
    }))

    setDocuments(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), ...added],
    }))

    setForm((prev: any) => ({
      ...prev,
      docs: [...(Array.isArray(prev.docs) ? prev.docs : []), ...added],
    }))
  }

  const getRequiredDocKeys = (): string[] => {
    const assetType = String(form.assetType || '')

    if (assetType.includes('multi') || assetType.includes('mfh')) return ['photos', 'rentRoll', 't12', 'psa']
    if (assetType.includes('mhp') || assetType.includes('mobile')) return ['photos', 'rentRoll', 't12']
    if (assetType.includes('hotel')) return ['photos', 'om', 't12']
    if (assetType.includes('retail')) return ['photos', 'om', 'rentRoll']
    if (assetType.includes('storage')) return ['photos', 'rentRoll']
    if (assetType.includes('land')) return ['photos', 'comps']

    return ['photos', 'psa']
  }

  const getRequiredDocCategories = (): string[] => {
    return getRequiredDocKeys()
  }

  const getMissingRequiredDocKeys = (): string[] => {
    return getRequiredDocKeys().filter((key: string) => !((documents as any)[key] || []).length)
  }

  const getMissingRequiredDocs = () => {
    return getMissingRequiredDocKeys().map((key: string) => DOC_CATS.find(d => d.key === key)?.label || key)
  }

  const removeDoc = (cat: string, idx: number) => {
    let removed: any = null

    setDocuments(prev => {
      const current = prev[cat] || []
      removed = current[idx] || null
      return { ...prev, [cat]: current.filter((_, i) => i !== idx) }
    })

    setForm((prev: any) => ({
      ...prev,
      docs: (Array.isArray(prev.docs) ? prev.docs : []).filter((doc: any) => {
        if (!removed) return true
        if (doc.id && removed.id && doc.id === removed.id) return false
        if (doc.category === cat && doc.name === removed.name) return false
        return true
      }),
    }))
  }
  function validateStep(s: number): { valid: boolean; 

errors: Record<string, string>; firstKey?: string } {
    const e: Record<string, string> = {}
    let first: string | undefined
    const add = (k: string, m: string) => { if (!first) first = k; e[k] = m }
    const f = form

    if (s === 1) {
      if (!f.name || !f.name.trim()) add('name', 'Your name is required')
      if (!f.email?.trim() && !f.phone?.trim()) add('email', 'Email or phone is required, at least one')
      if (!f.role) add('role', 'Role is required')
    } else if (s === 2) {
      if (!f.address || !f.address.trim()) add('address', 'Property address is required')
      if (!f.city || !f.city.trim()) add('city', 'City is required')
      if (!f.state || !f.state.trim()) add('state', 'State is required')
      if (!f.assetType) add('assetType', 'Asset type is required')
      if (!f.occupancy) add('occupancy', 'Occupancy status is required')
    } else if (s === 3) {
      if (!f.askingPrice?.trim() && !f.contractPrice?.trim()) add('askingPrice', 'Asking price or contract price is required')
      if (!f.structure) add('structure', 'Deal structure is required')
      if (!f.underContract) add('underContract', 'Is it under contract? is required')
      if (!f.closeTimeline || !f.closeTimeline.trim()) add('closeTimeline', 'Desired close timeline is required')
      if (!f.freeAndClearStatus) add('freeAndClearStatus', 'Is the property free and clear? is required')
      if (f.freeAndClearStatus === 'No, there is debt owed') {
        if (!f.debtTotalOwed?.trim() && !f.debtNotes?.trim()) add('debtTotalOwed', 'Total amount owed or notes about debt/liens is required')
        if (!f.debtPaymentsCurrent) add('debtPaymentsCurrent', 'Are payments current? is required when debt exists')
      }
    } else if (s === 4) {
      if (!f.directToSeller) add('directToSeller', 'How direct are you to the seller? is required')
      if (!f.proofOfControl) add('proofOfControl', 'Proof of control available? is required')
      if (!f.permissionsConfirmed) add('permissionsConfirmed', 'Permission confirmation is required')
      if (!f.consent) add('consent', 'Consent is required')
    } else if (s === 5) {
      const missingDocs = getMissingRequiredDocs()
      if (missingDocs.length > 0) {
        add('docs', 'Required documents are missing from Step 5: ' + missingDocs.map((k: string) => DOC_CATS.find(c => c.key === k)?.label || k).join(', '))
      }
    } else if (s === 5) {
      const missingDocs = getMissingRequiredDocs()
      if (missingDocs.length > 0) add('docs', `Upload required document(s): ${missingDocs.join(', ')}`)
    }

    return { valid: Object.keys(e).length === 0, errors: e, firstKey: first }
  }

  const goToStep = (target: number) => {
    if (target < step) {
      setErrors({})
      setError('')
      setStep(target)
      return
    }

    if (target > step) {
      const firstInvalidStep = Array.from({ length: target - 1 }, (_, i) => i + 1).find(n => !validateStep(n).valid)

      if (firstInvalidStep) {
        const v = validateStep(firstInvalidStep)
        setErrors(v.errors)
        setError(firstInvalidStep === 5 ? 'Upload the required document(s) before reviewing/submitting.' : 'Complete the required fields (*) before advancing.')
        setStep(firstInvalidStep)
        if (v.firstKey && v.firstKey !== 'docs') {
          setTimeout(() => {
            const el = document.getElementById('field-' + v.firstKey!)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            ;(el as any)?.focus?.()
          }, 40)
        }
        return
      }
    }

    setErrors({})
    setError('')
    setStep(target)
  }

  const nextStep = () => {
    const v = validateStep(step)
    if (!v.valid) {
      setErrors(v.errors)
      setError('Please complete required fields marked with * before continuing.')
      if (v.firstKey) {
        setTimeout(() => {
          const el = document.getElementById('field-' + v.firstKey!)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ;(el as any)?.focus?.()
        }, 40)
      }
      return
    }

    setError('')
    setErrors({})
    if (step < 6) setStep(step + 1)
  }

  const prevStep = () => {
    setError('')
    setErrors({})
    if (step > 1) setStep(step - 1)
  }

  const collectAllMissing = (): string[] => {
    const keys = new Set<string>()
    for (let s = 1; s <= 5; s++) {
      const v = validateStep(s)
      Object.keys(v.errors).forEach(k => keys.add(k))
    }
    if (!form.consent) keys.add('consent')
    return Array.from(keys)
  }

  const handleFinalSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    if (isSubmitting) return
    setError('')
    setErrors({})

    if (publicSubmissionBlocked) {
      setError(publicSubmissionBlockedMessage)
      return
    }

    if (honeypot) {
      setError('Submission blocked.')
      return
    }

    const now = Date.now()
    if (lastSubmit && now - lastSubmit < 30000) {
      setError('Please wait a moment before submitting another deal.')
      return
    }

    setIsSubmitting(true)

    const missingDocs = getMissingRequiredDocs()
    const missingDocsBeforeSubmit = getMissingRequiredDocs()
    if (missingDocsBeforeSubmit.length > 0) {
      setError('Upload required documents before submitting: ' + missingDocsBeforeSubmit.map((k: string) => DOC_CATS.find(c => c.key === k)?.label || k).join(', '))
      setStep(5)
      setIsSubmitting(false)
      return
    }

    const missing = collectAllMissing()
    if (missing.length > 0) {
      const firstErrs: Record<string, string> = {}
      const v1 = validateStep(1); Object.assign(firstErrs, v1.errors)
      const v2 = validateStep(2); Object.assign(firstErrs, v2.errors)
      const v3 = validateStep(3); Object.assign(firstErrs, v3.errors)
      const v4 = validateStep(4); Object.assign(firstErrs, v4.errors)
      const v5 = validateStep(5); Object.assign(firstErrs, v5.errors)
      if (!form.consent) firstErrs.consent = 'Consent is required'
      setErrors(firstErrs)

      if (missingDocs.length > 0) {
        setError(`Upload required document(s): ${missingDocs.join(', ')}`)
        setStep(5)
      } else {
        setError('Please complete all required fields before submitting.')
        setStep(1)
      }
      setIsSubmitting(false)
      return
    }

    // DEAL_SUBMISSION_SUPABASE_WRITE
    const submitResult = await submitDealToSupabase({
      ...form,
      docs: Object.values(documents).flat(),
      submittedAt: new Date().toISOString(),
      source: 'public_deal_submission_portal',
      page: window.location.href,
    })

    if (!submitResult.ok) {
      console.error('Deal submission Supabase error:', submitResult.error)
      const message = (submitResult.error as any)?.message || String(submitResult.error || '')
      setError(message ? `Submission could not be saved: ${message}` : 'Submission could not be saved. Please try again or email HouseBuyerInv@gmail.com.')
      setIsSubmitting(false)
      return
    }

    const id = (submitResult as any)?.data?.id || ('SUB-' + Date.now().toString(36).toUpperCase().slice(0, 9))
    const warnings = Array.isArray((submitResult as any).warnings) ? (submitResult as any).warnings : []
    setSubmissionId(id)
    setLastSubmit(Date.now())
    setSubmissionWarning(warnings.find((warning: string) => warning.includes('file upload')) || '')
    setIsSubmitting(false)
    setSubmitted(true)
  }

  const resetForAnother = () => {
    setForm({
      name: '', email: '', phone: '', role: 'Wholesaler', company: '', bestContactTime: '',
      address: '', city: '', state: '', zip: '', county: '', assetType: 'SFH', occupancy: 'Vacant',
      yearBuilt: '', beds: '', baths: '', sqFt: '', units: '', lotSize: '',
      askingPrice: '', contractPrice: '', arv: '', rehab: '', rent: '', noi: '', capRate: '',
      structure: 'Cash', underContract: 'No', closeTimeline: '',
      mortgageBalance: '', downPayment: '', monthlyPayment: '', balloonDate: '', wholesaleFee: '',
      sellerFinanceTerms: '', notes: '', docs: [],
      freeAndClearStatus: '', debtTotalOwed: '', debtLoanBalance: '', debtMonthlyPayment: '', debtPaymentsCurrent: '',
      debtLiensJudgments: '', debtNotes: '', debtExplanation: '',
      directToSeller: 'Direct to Owner', proofOfControl: 'Not Yet',
      sellerMotivation: '', accessInstructions: '', lockboxInfo: '', titleLienIssues: '',
      permissionsConfirmed: false, consent: false
    })

    setDocuments({ photos: [], psa: [], rentRoll: [], t12: [], om: [], comps: [], financials: [], other: [] })
    setHoneypot('')
    setStep(1)
    setSubmitted(false)
    setSubmissionId('')
    setSubmissionWarning('')
    setIsSubmitting(false)
    setError('')
    setErrors({})
  }

  const missingForReview = step === 6 ? collectAllMissing() : []
  const canSubmit = !publicSubmissionBlocked && !isSubmitting && step === 6 && missingForReview.length === 0 && getMissingRequiredDocs().length === 0 && form.consent

  return (
    <div className="min-h-screen bg-[#0A0C12]">
      <PublicNav />

      <div className="max-w-3xl mx-auto px-5 pt-5 pb-12">
        <div className="text-center mb-4">
          <div className="text-sm text-[#8B92A3]">
            Secure intake for partners, wholesalers, agents, owners, and deal sources.
          </div>
        </div>

        <div className="text-center mb-6">
          <div className="inline px-3 py-0.5 bg-[#22C55E]/10 text-[#22C55E] rounded text-[10px] font-semibold tracking-widest mb-2">
            PUBLIC SUBMISSION PORTAL
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Submit a Deal</h1>
          <p className="text-[#8B92A3] mt-1.5 text-sm">
            Submit once. We review, organize, and match to qualified buyers. All submissions are private to our team.
          </p>
        </div>

        <div className="card p-3 mb-5 text-sm bg-[#12151F] border border-[#252A38]">
          <strong>Trusted by professional dispo teams.</strong> We only collect what is needed to review and match your opportunity.
        </div>

        {publicSubmissionBlocked && (
          <div className="card p-3 mb-5 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-200">
            {publicSubmissionBlockedMessage}
          </div>
        )}

        <div className="mb-4">
          <div className="flex flex-wrap gap-1 text-[10px]">
            {STEPS.map((label, idx) => {
              const n = idx + 1
              const active = n === step
              const past = n < step

              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToStep(n)}
                  className={`px-2.5 py-1 rounded transition ${active ? 'bg-[#22C55E] text-black font-medium' : past ? 'bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20' : 'bg-[#252A38] text-[#8B92A3] hover:bg-[#252A38]/80'}`}
                >
                  {n}. {label}
                </button>
              )
            })}
          </div>
          <div className="h-0.5 bg-[#252A38] mt-1.5 rounded" />
        </div>

        <div className="card p-5 md:p-6">
          {error && <div className="mb-3 text-sm text-red-400 bg-red-900/20 p-2 rounded">{error}</div>}

          <input type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" />

          {step === 1 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">1. Contact Info</div>
              <div className="text-xs text-[#8B92A3]">Required fields marked *. We need at least one way to reach you.</div>

              <div>
                <div className="text-sm mb-1">Your name <span className="text-red-400">*</span></div>
                <input id="field-name" className={`input ${errors.name ? 'border-red-500/70' : ''}`} value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Alex Rivera" />
                {errors.name && <div className="text-red-400 text-xs mt-0.5">{errors.name}</div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm mb-1">Email <span className="text-red-400">*</span> <span className="text-[#64748B] text-xs">(or phone required)</span></div>
                  <input id="field-email" type="email" className={`input ${errors.email ? 'border-red-500/70' : ''}`} value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="you@company.com" />
                </div>
                <div>
                  <div className="text-sm mb-1">Phone <span className="text-red-400">*</span></div>
                  <input id="field-phone" className={`input ${errors.email ? 'border-red-500/70' : ''}`} value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="(512) 555-0199" />
                </div>
              </div>
              {errors.email && <div className="text-red-400 text-xs -mt-1">{errors.email}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm mb-1">Role <span className="text-red-400">*</span></div>
                  <select className={`input ${errors.role ? 'border-red-500/70' : ''}`} value={form.role} onChange={e => updateForm('role', e.target.value)}>
                    {['Owner', 'Wholesaler', 'Agent', 'JV Partner', 'Dispo Operator', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {errors.role && <div className="text-red-400 text-xs mt-0.5">{errors.role}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">Company (optional)</div>
                  <input className="input" value={form.company} onChange={e => updateForm('company', e.target.value)} placeholder="Rivera Holdings LLC" />
                </div>
              </div>

              <div>
                <div className="text-sm mb-1">Best contact time (optional)</div>
                <input className="input" value={form.bestContactTime} onChange={e => updateForm('bestContactTime', e.target.value)} placeholder="M-F 9am-5pm CT" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">2. Property Info</div>

              <div>
                <div className="text-sm mb-1">Property address <span className="text-red-400">*</span></div>
                <input id="field-address" className={`input ${errors.address ? 'border-red-500/70' : ''}`} value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="123 Oak Street" />
                {errors.address && <div className="text-red-400 text-xs mt-0.5">{errors.address}</div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-sm mb-1">City <span className="text-red-400">*</span></div>
                  <input id="field-city" className={`input ${errors.city ? 'border-red-500/70' : ''}`} value={form.city} onChange={e => updateForm('city', e.target.value)} />
                  {errors.city && <div className="text-red-400 text-xs mt-0.5">{errors.city}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">State <span className="text-red-400">*</span></div>
                  <input id="field-state" className={`input ${errors.state ? 'border-red-500/70' : ''}`} value={form.state} onChange={e => updateForm('state', e.target.value)} maxLength={2} placeholder="TX" />
                  {errors.state && <div className="text-red-400 text-xs mt-0.5">{errors.state}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">ZIP (optional)</div>
                  <input className="input" value={form.zip} onChange={e => updateForm('zip', e.target.value)} />
                </div>
                <div>
                  <div className="text-sm mb-1">County (optional)</div>
                  <input className="input" value={form.county} onChange={e => updateForm('county', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-sm mb-1">Asset type <span className="text-red-400">*</span></div>
                  <select id="field-assetType" className={`input ${errors.assetType ? 'border-red-500/70' : ''}`} value={form.assetType} onChange={e => updateForm('assetType', e.target.value)}>
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors.assetType && <div className="text-red-400 text-xs mt-0.5">{errors.assetType}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">Occupancy status <span className="text-red-400">*</span></div>
                  <select id="field-occupancy" className={`input ${errors.occupancy ? 'border-red-500/70' : ''}`} value={form.occupancy} onChange={e => updateForm('occupancy', e.target.value)}>
                    {OCCUPANCIES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {errors.occupancy && <div className="text-red-400 text-xs mt-0.5">{errors.occupancy}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">Year built (optional)</div>
                  <input className="input" type="number" value={form.yearBuilt} onChange={e => updateForm('yearBuilt', e.target.value)} placeholder="1998" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-sm mb-1">Beds (opt)</div><input className="input" type="number" value={form.beds} onChange={e => updateForm('beds', e.target.value)} /></div>
                <div><div className="text-sm mb-1">Baths (opt)</div><input className="input" type="number" value={form.baths} onChange={e => updateForm('baths', e.target.value)} /></div>
                <div><div className="text-sm mb-1">Sq Ft (opt)</div><input className="input" type="number" value={form.sqFt} onChange={e => updateForm('sqFt', e.target.value)} /></div>
                <div><div className="text-sm mb-1">Units / doors (opt)</div><input className="input" type="number" value={form.units} onChange={e => updateForm('units', e.target.value)} /></div>
              </div>

              <div>
                <div className="text-sm mb-1">Lot size (optional)</div>
                <input className="input" value={form.lotSize} onChange={e => updateForm('lotSize', e.target.value)} placeholder="0.25 acres" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">3. Deal Terms</div>

              <div>
                <div className="text-sm mb-1">Asking price or Contract price <span className="text-red-400">*</span> (at least one)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[#8B92A3] mb-0.5">Asking price</div>
                    <input id="field-askingPrice" className={`input ${errors.askingPrice ? 'border-red-500/70' : ''}`} type="number" value={form.askingPrice} onChange={e => updateForm('askingPrice', e.target.value)} placeholder="275000" />
                  </div>
                  <div>
                    <div className="text-xs text-[#8B92A3] mb-0.5">Contract price, if under contract</div>
                    <input className={`input ${errors.askingPrice ? 'border-red-500/70' : ''}`} type="number" value={form.contractPrice} onChange={e => updateForm('contractPrice', e.target.value)} placeholder="265000" />
                  </div>
                </div>
                {errors.askingPrice && <div className="text-red-400 text-xs mt-0.5">{errors.askingPrice}</div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm mb-1">Deal structure <span className="text-red-400">*</span></div>
                  <select id="field-structure" className={`input ${errors.structure ? 'border-red-500/70' : ''}`} value={form.structure} onChange={e => updateForm('structure', e.target.value)}>
                    {STRUCTURES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.structure && <div className="text-red-400 text-xs mt-0.5">{errors.structure}</div>}
                </div>
                <div>
                  <div className="text-sm mb-1">Is it under contract? <span className="text-red-400">*</span></div>
                  <select id="field-underContract" className={`input ${errors.underContract ? 'border-red-500/70' : ''}`} value={form.underContract} onChange={e => updateForm('underContract', e.target.value)}>
                    {CONTRACT_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.underContract && <div className="text-red-400 text-xs mt-0.5">{errors.underContract}</div>}
                </div>
              </div>

              <div>
                <div className="text-sm mb-1">Desired close timeline <span className="text-red-400">*</span></div>
                <select id="field-closeTimeline" className={`input ${errors.closeTimeline ? 'border-red-500/70' : ''}`} value={form.closeTimeline} onChange={e => updateForm('closeTimeline', e.target.value)}>
                  <option value="">Select...</option>
                  {TIMELINES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.closeTimeline && <div className="text-red-400 text-xs mt-0.5">{errors.closeTimeline}</div>}
              </div>

              <div className="pt-2 mt-1 border-t border-[#252A38]">
                <div className="text-sm mb-1">Is the property free and clear? <span className="text-red-400">*</span></div>
                <select id="field-freeAndClearStatus" className={`input ${errors.freeAndClearStatus ? 'border-red-500/70' : ''}`} value={form.freeAndClearStatus} onChange={e => updateForm('freeAndClearStatus', e.target.value)}>
                  <option value="">Select...</option>
                  {FREE_CLEAR_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {errors.freeAndClearStatus && <div className="text-red-400 text-xs mt-0.5">{errors.freeAndClearStatus}</div>}
              </div>

              {form.freeAndClearStatus === 'No, there is debt owed' && (
                <div className="space-y-3 p-3 border border-amber-500/30 rounded bg-[#11151F]">
                  <div className="text-sm font-medium text-amber-400">Debt details, required when there is debt owed</div>

                  <div>
                    <div className="text-sm mb-1">Total amount owed <span className="text-red-400">*</span> (or provide notes below)</div>
                    <input id="field-debtTotalOwed" className={`input ${errors.debtTotalOwed ? 'border-red-500/70' : ''}`} type="number" value={form.debtTotalOwed} onChange={e => updateForm('debtTotalOwed', e.target.value)} placeholder="150000" />
                    {errors.debtTotalOwed && <div className="text-red-400 text-xs mt-0.5">{errors.debtTotalOwed}</div>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm mb-1">Loan/mortgage balance</div>
                      <input className="input" type="number" value={form.debtLoanBalance} onChange={e => updateForm('debtLoanBalance', e.target.value)} placeholder="120000" />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Monthly payment, if known</div>
                      <input className="input" type="number" value={form.debtMonthlyPayment} onChange={e => updateForm('debtMonthlyPayment', e.target.value)} placeholder="850" />
                    </div>
                  </div>

                  <div>
                    <div className="text-sm mb-1">Are payments current? <span className="text-red-400">*</span></div>
                    <select id="field-debtPaymentsCurrent" className={`input ${errors.debtPaymentsCurrent ? 'border-red-500/70' : ''}`} value={form.debtPaymentsCurrent} onChange={e => updateForm('debtPaymentsCurrent', e.target.value)}>
                      <option value="">Select...</option>
                      {PAYMENTS_CURRENT_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {errors.debtPaymentsCurrent && <div className="text-red-400 text-xs mt-0.5">{errors.debtPaymentsCurrent}</div>}
                  </div>

                  <div>
                    <div className="text-sm mb-1">Any liens, taxes, HELOCs, or judgments?</div>
                    <input className="input" value={form.debtLiensJudgments} onChange={e => updateForm('debtLiensJudgments', e.target.value)} placeholder="Property tax lien ~$4k, judgment..." />
                  </div>

                  <div>
                    <div className="text-sm mb-1">Notes about debt/liens <span className="text-red-400">*</span> (required if no total owed above)</div>
                    <textarea className="input h-16" value={form.debtNotes} onChange={e => updateForm('debtNotes', e.target.value)} placeholder="Details on outstanding debts, liens, payoff demands..." />
                  </div>
                </div>
              )}

              {form.freeAndClearStatus === 'Not sure' && (
                <div>
                  <div className="text-sm mb-1">Explain what you know about the debt, liens, or payoff. (optional)</div>
                  <textarea className="input h-16" value={form.debtExplanation} onChange={e => updateForm('debtExplanation', e.target.value)} placeholder="Heard there may be back taxes or a second mortgage, not confirmed..." />
                </div>
              )}

              <div className="text-xs text-[#8B92A3] pt-1">Optional pricing / finance details, improves matching</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-xs text-[#8B92A3] mb-0.5">ARV</div><input className="input" type="number" value={form.arv} onChange={e => updateForm('arv', e.target.value)} placeholder="340000" /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Rehab estimate</div><input className="input" type="number" value={form.rehab} onChange={e => updateForm('rehab', e.target.value)} placeholder="42000" /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Rent, monthly</div><input className="input" type="number" value={form.rent} onChange={e => updateForm('rent', e.target.value)} /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">NOI, annual</div><input className="input" type="number" value={form.noi} onChange={e => updateForm('noi', e.target.value)} /></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Cap rate</div><input className="input" value={form.capRate} onChange={e => updateForm('capRate', e.target.value)} placeholder="7.2%" /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Current mortgage bal</div><input className="input" type="number" value={form.mortgageBalance} onChange={e => updateForm('mortgageBalance', e.target.value)} /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Down payment needed</div><input className="input" type="number" value={form.downPayment} onChange={e => updateForm('downPayment', e.target.value)} /></div>
                <div><div className="text-xs text-[#8B92A3] mb-0.5">Wholesale / assignment fee</div><input className="input" type="number" value={form.wholesaleFee} onChange={e => updateForm('wholesaleFee', e.target.value)} /></div>
              </div>

              <div>
                <div className="text-xs text-[#8B92A3] mb-0.5">Seller finance terms, if applicable</div>
                <input className="input" value={form.sellerFinanceTerms} onChange={e => updateForm('sellerFinanceTerms', e.target.value)} placeholder="20% down, 6% interest, 5yr balloon" />
              </div>

              <div>
                <div className="text-xs text-[#8B92A3] mb-0.5">Notes / deal summary, optional</div>
                <textarea className="input h-20" value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder="Motivated seller, tenant in place until end of month..." />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">4. Directness &amp; Control</div>
              <div className="text-xs text-[#8B92A3]">These help us qualify the opportunity quickly.</div>

              <div>
                <div className="text-sm mb-1">How direct are you to the seller? <span className="text-red-400">*</span></div>
                <select id="field-directToSeller" className={`input ${errors.directToSeller ? 'border-red-500/70' : ''}`} value={form.directToSeller} onChange={e => updateForm('directToSeller', e.target.value)}>
                  {DIRECTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.directToSeller && <div className="text-red-400 text-xs mt-0.5">{errors.directToSeller}</div>}
              </div>

              <div>
                <div className="text-sm mb-1">Proof of control available? <span className="text-red-400">*</span></div>
                <select id="field-proofOfControl" className={`input ${errors.proofOfControl ? 'border-red-500/70' : ''}`} value={form.proofOfControl} onChange={e => updateForm('proofOfControl', e.target.value)}>
                  {PROOFS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {errors.proofOfControl && <div className="text-red-400 text-xs mt-0.5">{errors.proofOfControl}</div>}
              </div>

              <div className="pt-1 space-y-2.5 border-t border-[#252A38] mt-1">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.permissionsConfirmed} onChange={e => updateForm('permissionsConfirmed', e.target.checked)} className="mt-1" />
                  <span>I confirm I have permission to submit or market this deal. <span className="text-red-400">*</span></span>
                </label>
                {errors.permissionsConfirmed && <div className="text-red-400 text-xs -mt-1.5 ml-6">{errors.permissionsConfirmed}</div>}

                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.consent} onChange={e => updateForm('consent', e.target.checked)} className="mt-1" />
                  <span>I consent to having this deal reviewed and matched to buyers inside Deal Blast Pro. I understand submission is not a listing or guarantee of sale. <span className="text-red-400">*</span></span>
                </label>
                {errors.consent && <div className="text-red-400 text-xs -mt-1.5 ml-6">{errors.consent}</div>}
              </div>

              <div className="text-xs text-[#8B92A3] pt-1">Optional context</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-[#8B92A3] mb-0.5">Seller motivation, optional</div>
                  <input className="input" value={form.sellerMotivation} onChange={e => updateForm('sellerMotivation', e.target.value)} placeholder="Relocating, behind on payments..." />
                </div>
                <div>
                  <div className="text-xs text-[#8B92A3] mb-0.5">Access / showing instructions, optional</div>
                  <input className="input" value={form.accessInstructions} onChange={e => updateForm('accessInstructions', e.target.value)} placeholder="Call 24h ahead, lockbox on rear door" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-[#8B92A3] mb-0.5">Lockbox / showing info, optional</div>
                  <input className="input" value={form.lockboxInfo} onChange={e => updateForm('lockboxInfo', e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-[#8B92A3] mb-0.5">Known title / lien issues, optional</div>
                  <input className="input" value={form.titleLienIssues} onChange={e => updateForm('titleLienIssues', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">5. Documents</div>

              {errors.docs && <div className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-500/40 p-2 rounded">{errors.docs}</div>}

              <div className="text-xs text-[#8B92A3]">Required for {form.assetType}: {getRequiredDocCategories().join(', ')}</div>

              {DOC_CATS.map(({ key, label }) => {
                const isRec = getRequiredDocKeys().includes(key)
                const files = documents[key] || []

                return (
                  <div key={key} className="border border-[#252A38] rounded-lg p-3 bg-[#0A0C12]">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-sm font-medium">{label} {isRec && <span className="text-[10px] text-red-400">(required)</span>}</div>
                      <label className="btn btn-ghost text-xs cursor-pointer py-1 px-2.5">
                        + Add file(s)
                        <input type="file" multiple className="hidden" onChange={e => { addDocs(key, e.target.files); e.target.value = '' }} />
                      </label>
                    </div>

                    {files.length > 0 ? (
                      <div className="text-xs space-y-0.5 text-[#C5CAD6]">
                        {files.map((f, i) => (
                          <div key={i} className="flex justify-between items-center bg-[#12151F] px-2 py-0.5 rounded">
                            <span className="truncate">{f.name} <span className="text-[#64748B]">({f.size} KB)</span></span>
                            <button type="button" onClick={() => removeDoc(key, i)} className="text-red-400 hover:text-red-300 px-1">Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#64748B]">No files yet</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3.5">
              <div className="font-semibold text-base">6. Review &amp; Submit</div>

              {missingForReview.length > 0 && (
                <div className="p-2.5 rounded border border-red-500/60 bg-red-900/20 text-sm text-red-400">
                  Missing required: {missingForReview.map((k: string) => k.replace(/([A-Z])/g, ' $1').trim()).join(', ')}. Go back and complete the * fields.
                </div>
              )}

              <div className="space-y-3 text-sm">
                <div>
                  <div className="uppercase text-[10px] tracking-widest text-[#8B92A3] mb-0.5">Contact</div>
                  <div>{form.name || ''} " {form.role} " {form.email || form.phone || ''} {form.company ? `" ${form.company}` : ''}</div>
                </div>

                <div>
                  <div className="uppercase text-[10px] tracking-widest text-[#8B92A3] mb-0.5">Property</div>
                  <div>{form.address || ''}, {form.city || ''}, {form.state || ''} {form.zip} " {form.assetType} " {form.occupancy}</div>
                  {(form.beds || form.baths || form.sqFt) && <div className="text-xs text-[#8B92A3]">{[form.beds && `${form.beds}bd`, form.baths && `${form.baths}ba`, form.sqFt && `${form.sqFt} sqft`].filter(Boolean).join(' " ')}</div>}
                </div>

                <div>
                  <div className="uppercase text-[10px] tracking-widest text-[#8B92A3] mb-0.5">Deal Terms</div>
                  <div>
                    {form.askingPrice ? `Asking $${form.askingPrice}` : ''}
                    {form.contractPrice ? ` Contract $${form.contractPrice}` : ''} " {form.structure} " Under contract: {form.underContract} " Close: {form.closeTimeline || ''}
                  </div>
                  {form.arv && <div className="text-xs text-[#8B92A3]">ARV ${form.arv} " Rehab ${form.rehab || ''}</div>}
                  {form.freeAndClearStatus && <div className="text-xs text-[#8B92A3] mt-0.5">Free &amp; clear: {form.freeAndClearStatus}{form.debtTotalOwed ? ` (Owed ~$${form.debtTotalOwed})` : ''}</div>}
                </div>

                <div>
                  <div className="uppercase text-[10px] tracking-widest text-[#8B92A3] mb-0.5">Directness &amp; Control</div>
                  <div>{form.directToSeller} " Proof: {form.proofOfControl} " Permission confirmed: {form.permissionsConfirmed ? 'Yes' : 'No'} " Consent: {form.consent ? 'Yes' : 'No'}</div>
                </div>

                <div>
                  <div className="uppercase text-[10px] tracking-widest text-[#8B92A3] mb-0.5">Documents</div>
                  {Object.values(documents).some(a => a.length) ? (
                    <div className="text-xs text-[#C5CAD6]">
                      {Object.entries(documents).filter(([, a]) => a.length).map(([k, a]) => `${DOC_CATS.find(d => d.key === k)?.label || k}: ${a.length}`).join(' | ')}
                    </div>
                  ) : (
                    <div className="text-xs text-[#64748B]">None attached, recommended files speed up review</div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-[#252A38]">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={form.consent} onChange={e => updateForm('consent', e.target.checked)} className="mt-1" />
                  <span>I confirm the information above is accurate and I consent to review and buyer matching. <span className="text-red-400">*</span></span>
                </label>
              </div>

              <button type="button" disabled={!canSubmit} onClick={handleFinalSubmit} className="btn btn-green w-full py-3 text-base disabled:opacity-60">
                {isSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    Submitting Deal...
                  </span>
                ) : (
                  'Submit Deal for Review'
                )}
              </button>

              {!canSubmit && (
                <div className="text-center text-xs text-red-400">
                  {publicSubmissionBlocked ? 'Public submissions are paused until billing is completed.' : 'Complete all required fields and upload required documents to enable submit.'}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-[#252A38]">
            <button type="button" onClick={prevStep} disabled={step === 1} className="btn btn-ghost text-sm disabled:opacity-40">Previous</button>
            {step < 6 ? (
              <button type="button" onClick={nextStep} className="btn btn-green text-sm">Next</button>
            ) : null}
          </div>

          <div className="text-[10px] text-center text-[#64748B] mt-3">
            Your information is used only for review and matching. No public listing.
          </div>
        </div>

        {submitted && (
          <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" onClick={() => {}}>
            <div className="card max-w-md w-full p-8 text-center" onClick={e => e.stopPropagation()}>
              <div className="text-3xl font-semibold text-[#22C55E] mb-2">Deal Submitted Successfully</div>
              <div className="text-[#C5CAD6] mb-4">Thanks, we received your deal. Our team will review it shortly.</div>
              {submissionWarning && (
                <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {submissionWarning}
                </div>
              )}
              <div className="text-sm mb-6">Submission ID: <span className="font-mono text-[#E6E8EE]">{submissionId}</span></div>

              <div className="space-y-2">
                <button onClick={resetForAnother} className="btn btn-green w-full">Submit Another Deal</button>
              </div>

              <div className="mt-4 text-[10px] text-[#8B92A3]">
Estimated review: 24-48 hours. Check email for updates.              </div>
            </div>
          </div>
        )}

        <footer className="border-t border-[#252A38] mt-10 py-7 text-center text-xs text-[#8B92A3]">
          House Buyer Investments - Deal Blast Pro<br />
          Public Submission Portal
        </footer>
      </div>
    </div>
  )
}
