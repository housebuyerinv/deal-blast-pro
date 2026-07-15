import { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Deal, PropertyType } from '../../lib/types'
import { PROPERTY_TYPES, SUBMITTER_ROLES, ASSET_STRATEGIES, OCCUPANCY_OPTIONS, CONDITION_OPTIONS } from '../../lib/constants'
import { generateId } from '../../lib/utils'
import { toast } from 'sonner'

interface WizardProps {
  onComplete?: (deal: Deal) => void
  initialDeal?: Partial<Deal>
  isPortal?: boolean
  submissionSource?: string  // "Public Portal" | "Internal Intake"
}

export default function DealIntakeWizard({ onComplete, initialDeal, isPortal, submissionSource = 'Internal Intake' }: WizardProps) {
  const addDeal = useAppStore(s => s.addDeal)
  const useTrial = useAppStore(s => s.useTrialAction)
  const settings = useAppStore(s => s.settings)

  // Memoize initial data (do not recreate inline every render)
  const initialFormData = useMemo(() => ({
    submitter: { name: '', company: '', email: '', phone: '', role: 'Wholesaler', isOwner: true, consent: false, ...initialDeal?.submitter },
    property: { address: '', city: '', state: 'PA', zip: '', county: '', type: 'SFH' as PropertyType, strategy: 'Flip', beds: 3, baths: 2, units: 1, sqft: 1600, lotSize: 0.2, yearBuilt: 1975, occupancy: 'Vacant', description: '', ...initialDeal?.property },
    pricing: { sellerFinance: false, askingPrice: 165000, ...initialDeal?.pricing },
    debt: { isFreeClear: true, ...initialDeal?.debt },
    condition: { walkthroughAvailable: true, ...initialDeal?.condition },
    docs: initialDeal?.docs || []
  }), [initialDeal])  // stable unless initialDeal identity changes meaningfully

  const [step, setStep] = useState(1)
  const [form, setForm] = useState<any>(initialFormData)

  // Ref guard: load draft ONLY ONCE on mount (or when "draft id" concept changes). Never on every render/form change.
  const draftLoadedRef = useRef(false)

  const [errors, setErrors] = useState<string[]>([])
  const [missingChecklist, setMissingChecklist] = useState<any[]>([])
  const [draftSaved, setDraftSaved] = useState(false)

  // Draft load: ONLY ONCE on mount using ref guard. Never re-runs on form keystrokes or re-renders.
  useEffect(() => {
    if (draftLoadedRef.current) return
    draftLoadedRef.current = true

    const draftKey = 'dealblastpro-wizard-draft'
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved && !initialDeal) {
        const parsed = JSON.parse(saved)
        setForm((prev: any) => ({ ...prev, ...parsed }))
      }
    } catch {}
  }, [])  // empty deps: mount only. initialDeal check inside for safety.

  // Autosave: only saves (never loads or replaces formData). Does not depend on causing reset.
  // Validation and other logic must not overwrite formData.
  useEffect(() => {
    const draftKey = 'dealblastpro-wizard-draft'

    const saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(form))
        setDraftSaved(true)
        setTimeout(() => setDraftSaved(false), 1200)
      } catch {}
    }, 800)

    return () => clearTimeout(saveTimer)
  }, [form])  // save when form changes, but no load/replace here

  const update = (section: string, key: string, value: any) => {
    setForm((prev: any) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value }
    }))
    setErrors([])
    setMissingChecklist([])
  }

  const goToStep = (s: number) => {
    setStep(s)
    setErrors([])
    setMissingChecklist([])
  }

  // Production-grade required fields resolver (uses Settings + dynamic rules)
  const getRequiredFields = (): string[] => {
    const type = form.property.type as PropertyType
    const base = settings.requiredFieldsByType?.[type] || ['address', 'city', 'state', 'zip', 'askingPrice']
    const extra: string[] = []

    // Always require core location
    if (!base.includes('address')) extra.push('property.address')
    if (!base.includes('city')) extra.push('property.city')
    if (!base.includes('state')) extra.push('property.state')
    if (!base.includes('zip')) extra.push('property.zip')

    // Debt enforcement when not free & clear
    if (!form.debt.isFreeClear) {
      extra.push('debt.mortgageBalance', 'debt.titleCompany')
    }

    // Strategy-based (deeper validation)
    const strategy = form.property.strategy
    if (strategy === 'Seller Finance' || form.pricing.sellerFinance) {
      extra.push('pricing.downPayment', 'pricing.monthlyPayment', 'pricing.interestRate', 'pricing.balloonTerm', 'pricing.amortization')
    }
    if (strategy === 'Subject-To') {
      extra.push('debt.mortgageBalance', 'debt.arrears', 'pricing.monthlyPayment', 'pricing.interestRate')
    }
    if (strategy === 'Value-Add' && form.property.type === 'Multifamily') {
      extra.push('property.units', 'pricing.noi')
    }
    if (strategy === 'Turnkey') {
      extra.push('pricing.currentRent')
    }
    if (strategy === 'Development' || form.property.type === 'Land') {
      extra.push('property.lotSize')
    }

    return [...new Set([...base, ...extra])]
  }

  const validateStep = (s: number): boolean => {
    const e: string[] = []
    const required = getRequiredFields()

    if (s === 1) {
      if (!form.submitter.name) e.push('Submitter name required')
      if (!form.submitter.email) e.push('Email required')
      if (!form.submitter.phone) e.push('Phone required')
      if (!form.submitter.consent) e.push('Consent checkbox required')
    }
    if (s === 2) {
      if (required.includes('address') && !form.property.address) e.push('Street address required')
      if (required.includes('city') && !form.property.city) e.push('City required')
      if (required.includes('state') && !form.property.state) e.push('State required')
      if (required.includes('zip') && !form.property.zip) e.push('ZIP required')
    }
    if (s === 3) {
      if (required.includes('askingPrice') && !form.pricing.askingPrice) e.push('Asking price required')
    }
    if (s === 4) {
      if (!form.debt.isFreeClear) {
        if (!form.debt.mortgageBalance) e.push('Mortgage balance required (Free & Clear = No)')
        if (!form.debt.titleCompany) e.push('Title company required (Free & Clear = No)')
      }
    }
    setErrors(e)
    return e.length === 0
  }

  const next = () => {
    if (validateStep(step)) {
      setStep(Math.min(6, step + 1))
    }
  }

  const back = () => setStep(Math.max(1, step - 1))

  const buildMissingChecklist = () => {
    const missing: any[] = []
    const required = getRequiredFields()
    const type = form.property.type as PropertyType
    const requiredDocs = settings.requiredDocsByType?.[type] || ['Photos', 'PSA/Contract']

    // Step 1
    if (!form.submitter.name) missing.push({ step: 1, label: 'Submitter Name', field: 'submitter.name' })
    if (!form.submitter.email) missing.push({ step: 1, label: 'Email', field: 'submitter.email' })
    if (!form.submitter.phone) missing.push({ step: 1, label: 'Phone', field: 'submitter.phone' })
    if (!form.submitter.consent) missing.push({ step: 1, label: 'Consent Checkbox', field: 'submitter.consent' })

    // Step 2 - location
    if (required.includes('address') && !form.property.address) missing.push({ step: 2, label: 'Street Address', field: 'property.address' })
    if (required.includes('city') && !form.property.city) missing.push({ step: 2, label: 'City', field: 'property.city' })
    if (required.includes('state') && !form.property.state) missing.push({ step: 2, label: 'State', field: 'property.state' })
    if (required.includes('zip') && !form.property.zip) missing.push({ step: 2, label: 'ZIP Code', field: 'property.zip' })

    // Step 3 pricing
    if (required.includes('askingPrice') && !form.pricing.askingPrice) missing.push({ step: 3, label: 'Asking Price', field: 'pricing.askingPrice' })

    // Step 4 - Debt & Title (critical Free & Clear enforcement)
    if (!form.debt.isFreeClear) {
      if (!form.debt.mortgageBalance) missing.push({ step: 4, label: 'Mortgage Balance (required when Free & Clear = No)', field: 'debt.mortgageBalance' })
      if (!form.debt.titleCompany) missing.push({ step: 4, label: 'Title Company', field: 'debt.titleCompany' })
    }

    // Step 6 - Required Documents from Settings matrix
    const uploadedCats = new Set((form.docs || []).map((d: any) => d.category))
    const missingDocs = requiredDocs.filter((cat: string) => !uploadedCats.has(cat))
    if (missingDocs.length > 0) {
      missing.push({ 
        step: 6, 
        label: `Missing required docs for ${type}: ${missingDocs.join(', ')}`, 
        field: 'docs' 
      })
    }

    // Final consent
    if (!form.submitter.consent) {
      missing.push({ step: 6, label: 'Final Consent Checkbox', field: 'submitter.consent' })
    }

    return missing
  }

  const handleSubmit = () => {
    const missing = buildMissingChecklist()
    if (missing.length > 0) {
      setMissingChecklist(missing)
      setStep(6) // Force user to the docs/consent step
      toast.error('Cannot submit — please complete all required fields and documents')
      return
    }

    const canSubmit = useTrial('dealsSubmitted')
    if (!canSubmit) {
      toast.error('Trial limit reached. Upgrade in Settings to continue.')
      return
    }

    const newDeal = addDeal({
      status: isPortal ? 'Submitted' : 'Draft',
      submitter: form.submitter,
      property: form.property,
      pricing: form.pricing,
      debt: form.debt,
      condition: form.condition,
      docs: form.docs,
      source: submissionSource
    })

    // Clear draft on successful submit
    try { localStorage.removeItem('dealblastpro-wizard-draft') } catch {}

    toast.success('Deal submitted successfully!', { description: `${newDeal.property.address} is now in the queue.` })
    onComplete?.(newDeal)
  }

  const currentMissing = buildMissingChecklist()
  const canSubmitFinal = currentMissing.length === 0

  const jumpToField = (field: string, targetStep: number) => {
    setStep(targetStep)
    setMissingChecklist([])
    // Simple focus helper
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${field}"]`) as HTMLElement
      el?.focus?.()
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper */}
      <div className="stepper mb-6 px-1">
        {[1,2,3,4,5,6].map(s => (
          <button key={s} onClick={() => goToStep(s)} className={`step ${step === s ? 'step-active' : s < step ? 'step-complete' : 'step-incomplete'}`}>
            {s < step ? 'âœ“' : s} {['Contact','Property','Pricing','Debt & Title','Condition','Docs'][s-1]}
          </button>
        ))}
      </div>

      {/* Autosave indicator */}
      <div className="flex justify-end -mt-4 mb-3 text-[10px] text-[#8B92A3]">
        {draftSaved ? 'Draft saved âœ“' : 'Changes auto-saved to browser'}
      </div>

      {errors.length > 0 && <div className="mb-3 text-sm bg-red-500/10 border border-red-500/30 text-red-400 p-2 rounded">{errors.join(' • ')}</div>}

      {/* Missing checklist - clickable */}
      {missingChecklist.length > 0 && (
        <div className="mb-4 p-3 bg-[#3B82F6]/10 border border-[#3B82F6]/40 rounded text-sm">
          <div className="font-semibold mb-1 text-[#60A5FA]">Missing Requirements — Click to jump:</div>
          {missingChecklist.map((m, idx) => (
            <button key={idx} onClick={() => jumpToField(m.field, m.step)} className="block text-left w-full hover:underline py-0.5 text-[#93C5FD]">
              Step {m.step}: {m.label}
            </button>
          ))}
        </div>
      )}

      {/* STEP CONTENT */}
      {step === 1 && (
        <div className="card p-6 space-y-4">
          <div className="font-semibold text-lg mb-1">Step 1 — Submitter / Contact Info</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="wizard-field"><div className="wizard-label required">Full Name</div><input data-field="submitter.name" className="input" value={form.submitter.name} onChange={e => update('submitter','name', e.target.value)} /></div>
            <div className="wizard-field"><div className="wizard-label">Company</div><input className="input" value={form.submitter.company} onChange={e => update('submitter','company', e.target.value)} /></div>
            <div className="wizard-field"><div className="wizard-label required">Email</div><input className="input" type="email" value={form.submitter.email} onChange={e => update('submitter','email', e.target.value)} /></div>
            <div className="wizard-field"><div className="wizard-label required">Phone</div><input className="input" value={form.submitter.phone} onChange={e => update('submitter','phone', e.target.value)} /></div>
          </div>
          <div>
            <div className="wizard-label">Role</div>
            <select className="select" value={form.submitter.role} onChange={e => update('submitter','role', e.target.value)}>
              {SUBMITTER_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div className="wizard-label mb-1.5">What is your relationship to this deal?</div>
            <select className="select" value={form.submitter.relationship || (form.submitter.isOwner ? 'I am the property owner' : '')} onChange={e => {
              const val = e.target.value
              update('submitter', 'relationship', val)
              const isOwnerOrContract = val === 'I am the property owner' || val === 'I have the property under contract'
              update('submitter', 'isOwner', isOwnerOrContract)
            }}>
              <option value="">Select...</option>
              <option>I am the property owner</option>
              <option>I have the property under contract</option>
              <option>I am direct to the seller</option>
              <option>I am a JV partner</option>
              <option>I am a bird dog / deal finder</option>
              <option>I am a licensed agent</option>
              <option>I am submitting on behalf of someone else</option>
              <option>Other</option>
            </select>
          </div>
          {form.submitter.relationship && !['I am the property owner', 'I have the property under contract'].includes(form.submitter.relationship) && (
            <div className="space-y-3 border border-[#252A38] p-3 rounded">
              <div><div className="wizard-label text-xs">Do you have permission to market this deal?</div>
                <select className="select text-sm" value={form.submitter.hasPermission || ''} onChange={e => update('submitter','hasPermission', e.target.value)}>
                  <option value="">Select...</option><option>Yes</option><option>No</option>
                </select>
              </div>
              <div><div className="wizard-label text-xs">JV / referral structure or how you control the deal</div><textarea className="input h-16" value={form.submitter.jvStructure || ''} onChange={e => update('submitter','jvStructure', e.target.value)} /></div>
              <div><div className="wizard-label text-xs">Who controls the deal?</div><input className="input" value={form.submitter.dealController || ''} onChange={e => update('submitter','dealController', e.target.value)} /></div>
              <label className="flex gap-2 text-xs"><input type="checkbox" checked={!!form.submitter.canProvideProof} onChange={e => update('submitter','canProvideProof', e.target.checked)} /> Can provide proof of control or authorization</label>
            </div>
          )}
          <label className="flex gap-2 items-start pt-2 text-sm"><input type="checkbox" checked={form.submitter.consent} onChange={e => update('submitter','consent', e.target.checked)} className="mt-1" /> <span className="required">I confirm the information is accurate and I have authority to submit this deal.</span></label>
        </div>
      )}

      {step === 2 && (
        <div className="card p-6 space-y-5">
          <div className="font-semibold">Step 2 — Property Info</div>
          <div className="wizard-field"><div className="wizard-label required">Street Address</div>
            <input 
              data-field="property.address" 
              className={`input ${currentMissing.some(m => m.field === 'property.address') ? 'border-red-500' : ''}`} 
              value={form.property.address} 
              onChange={e => update('property','address', e.target.value)} 
            />
          </div>
          
          {/* Critical: Properly centered State in 3-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="wizard-field md:col-span-1">
              <div className="wizard-label required">City</div>
              <input className="input" value={form.property.city} onChange={e => update('property','city', e.target.value)} />
            </div>
            <div className="wizard-field">
              <div className="wizard-label required">State</div>
              <input className="input text-center" maxLength={2} value={form.property.state} onChange={e => update('property','state', e.target.value.toUpperCase())} />
            </div>
            <div className="wizard-field">
              <div className="wizard-label required">ZIP</div>
              <input className="input" value={form.property.zip} onChange={e => update('property','zip', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="wizard-label">County</div><input className="input" value={form.property.county} onChange={e => update('property','county', e.target.value)} /></div>
            <div>
              <div className="wizard-label required">Property Type</div>
              <select className="select" value={form.property.type} onChange={e => update('property','type', e.target.value)}>
                {PROPERTY_TYPES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="wizard-label">Asset Strategy</div>
            <select className="select" value={form.property.strategy} onChange={e => update('property','strategy', e.target.value)}>
              {ASSET_STRATEGIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {['beds','baths','units','sqft','lotSize','yearBuilt'].map(f => (
              <div key={f}><div className="wizard-label text-xs">{f.toUpperCase()}</div><input type="text" className="input" value={form.property[f] ?? ''} onChange={e => update('property', f, e.target.value)} /></div>
            ))}
          </div>
          <div>
            <div className="wizard-label">Occupancy</div>
            <select className="select" value={form.property.occupancy} onChange={e => update('property','occupancy', e.target.value)}>
              {OCCUPANCY_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div><div className="wizard-label">Public Description</div><textarea className="input h-20" value={form.property.description} onChange={e => update('property','description', e.target.value)} /></div>
        </div>
      )}

      {step === 3 && (
        <div className="card p-6 space-y-4">
          <div className="font-semibold">Step 3 — Pricing &amp; Financials</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['askingPrice','contractPrice','assignmentFee','arv','rehab','currentRent','marketRent','noi','capRate'].map(f => {
              const labelMap: Record<string, string> = {
                askingPrice: 'Asking Price',
                contractPrice: 'Contract Price',
                assignmentFee: 'Assignment Fee',
                arv: 'ARV',
                rehab: 'Estimated Rehab',
                currentRent: 'Current Rent',
                marketRent: 'Market Rent',
                noi: 'NOI',
                capRate: 'Cap Rate'
              }
              return (
                <div key={f}>
                  <div className="wizard-label text-xs">{labelMap[f] || f}</div>
                  <input type="text" className="input currency-input" value={form.pricing[f] ?? ''} onChange={e => update('pricing', f, e.target.value)} placeholder="0" />
                </div>
              )
            })}
          </div>
          <div className="pt-2">
            <label className="flex gap-2"><input type="checkbox" checked={form.pricing.sellerFinance} onChange={e => update('pricing','sellerFinance', e.target.checked)} /> Seller Finance Available</label>
          </div>
          {form.pricing.sellerFinance && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-[#252A38]">
              {['downPayment','monthlyPayment','interestRate','balloonTerm','amortization'].map(f => {
                const labelMap: Record<string, string> = {
                  downPayment: 'Down Payment',
                  monthlyPayment: 'Monthly Payment',
                  interestRate: 'Interest Rate',
                  balloonTerm: 'Balloon Term',
                  amortization: 'Amortization'
                }
                return (
                  <div key={f}><div className="text-xs text-[#8B92A3]">{labelMap[f] || f}</div><input className="input" type="text" value={form.pricing[f] ?? ''} onChange={e => update('pricing', f, e.target.value)} /></div>
                )
              })}
              <label className="flex items-center gap-2 text-xs mt-5"><input type="checkbox" checked={!!form.pricing.pitiIncluded} onChange={e => update('pricing','pitiIncluded', e.target.checked)} /> PITI included</label>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="card p-6">
          <div className="font-semibold mb-4">Step 4 — Debt &amp; Title Encumbrances</div>
          <div className="mb-3">Is the property free and clear?</div>
          <div className="flex gap-6 mb-4">
            <label><input type="radio" checked={form.debt.isFreeClear} onChange={() => update('debt','isFreeClear', true)} /> Yes — Free &amp; Clear</label>
            <label><input type="radio" checked={!form.debt.isFreeClear} onChange={() => update('debt','isFreeClear', false)} /> No</label>
          </div>

          {!form.debt.isFreeClear && (
            <div className="space-y-4 bg-[#0A0C12] p-4 rounded-lg border border-red-500/30">
              <div className="text-[#EF4444] text-xs font-semibold">ALL FIELDS BELOW ARE NOW REQUIRED</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['mortgageBalance','monthlyPayment','interestRate','arrears','taxesOwed','helocBalance','otherDebt'].map(f => {
                  const hasErr = currentMissing.some(m => m.field === `debt.${f}`)
                  return (
                    <div key={f}>
                      <div className="text-xs required">{f}</div>
                      <input 
                        className={`input ${hasErr ? 'border-red-500' : ''}`} 
                        type="text" 
                        value={form.debt[f] ?? ''} 
                        onChange={e => update('debt', f, e.target.value)} 
                      />
                    </div>
                  )
                })}
              </div>
              <div><div className="text-xs required">Liens / Other Encumbrances</div><input className="input" value={form.debt.liens || ''} onChange={e => update('debt','liens', e.target.value)} /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><div className="text-xs">Title Company</div><input className={`input ${currentMissing.some(m => m.field === 'debt.titleCompany') ? 'border-red-500' : ''}`} value={form.debt.titleCompany || ''} onChange={e => update('debt','titleCompany', e.target.value)} /></div>
                <div><div className="text-xs">Title Contact</div><input className="input" value={form.debt.titleContact || ''} onChange={e => update('debt','titleContact', e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {['probate','foreclosure','codeViolations','eviction'].map(f => (
                  <label key={f} className="flex gap-2"><input type="checkbox" checked={!!form.debt[f]} onChange={e => update('debt', f, e.target.checked)} /> {f.replace(/([A-Z])/g,' $1')}</label>
                ))}
              </div>
              <div><div className="text-xs">Ownership / Other Issues</div><textarea className="input" value={form.debt.ownershipIssues || ''} onChange={e => update('debt','ownershipIssues', e.target.value)} /></div>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="card p-6 space-y-4">
          <div className="font-semibold">Step 5 — Condition, Access &amp; Occupancy</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['roof','hvac','plumbing','electrical','foundation'].map(k => (
              <div key={k}><div className="text-xs text-[#8B92A3]">{k.toUpperCase()}</div>
                <select className="select" value={form.condition[k] || ''} onChange={e => update('condition', k, e.target.value)}>
                  <option value="">—</option>{CONDITION_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div><div className="text-xs">Major Repairs Needed</div><textarea className="input h-16" value={form.condition.majorRepairs || ''} onChange={e => update('condition','majorRepairs', e.target.value)} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><div className="text-xs">Tenant / Lease Details</div><input className="input" value={form.condition.tenantDetails || ''} onChange={e => update('condition','tenantDetails', e.target.value)} /></div>
            <div><div className="text-xs">Lockbox / Access Code</div><input className="input" value={form.condition.lockbox || ''} onChange={e => update('condition','lockbox', e.target.value)} /></div>
          </div>
          <div className="flex gap-6 text-sm">
            <label><input type="checkbox" checked={!!form.condition.section8} onChange={e => update('condition','section8', e.target.checked)} /> Section 8</label>
            <label><input type="checkbox" checked={form.condition.walkthroughAvailable} onChange={e => update('condition','walkthroughAvailable', e.target.checked)} /> Walkthrough Available</label>
            <label><input type="checkbox" checked={!!form.condition.photosVideosAvailable} onChange={e => update('condition','photosVideosAvailable', e.target.checked)} /> Photos/Videos Ready</label>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="card p-6">
          <div className="font-semibold mb-3">Step 6 — Documents &amp; Final Consent</div>
          <div className="text-sm text-[#8B92A3] mb-3">Upload supporting files. Categories in <span className="text-red-400">red</span> are required for this property type per Admin Settings.</div>

          {/* Required Docs Checklist from Settings */}
          {(() => {
            const type = form.property.type as PropertyType
            const reqDocs = settings.requiredDocsByType?.[type] || ['Photos', 'PSA/Contract']
            const uploadedCats = new Set((form.docs || []).map((d: any) => d.category))
            return (
              <div className="mb-4 text-xs">
                <div className="text-[#8B92A3] mb-1">Required for {type}:</div>
                <div className="flex flex-wrap gap-2">
                  {reqDocs.map((cat: string) => {
                    const done = uploadedCats.has(cat)
                    return <span key={cat} className={`px-2 py-0.5 rounded ${done ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-red-500/20 text-red-400'}`}>{cat} {done ? 'âœ“' : ''}</span>
                  })}
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
            {['Photos','OM','Rent Roll','T12','Comps','PSA/Contract','Title Docs','Mortgage Payoff','Seller Finance Terms','Other'].map(cat => (
              <label key={cat} className="border border-[#252A38] rounded p-3 text-xs cursor-pointer hover:bg-[#171B26]">
                {cat}
                <input type="file" className="hidden" multiple onChange={e => {
                  const files = Array.from(e.target.files || [])
                  files.forEach(file => {
                    const url = URL.createObjectURL(file)
                    setForm((prev: any) => ({ ...prev, docs: [...prev.docs, { id: generateId('doc'), category: cat, name: file.name, url, uploadedAt: new Date().toISOString() }] }))
                  })
                }} />
              </label>
            ))}
          </div>

          {form.docs.length > 0 && (
            <div className="text-xs mb-3">Uploaded: {form.docs.map((d: any) => d.name).join(', ')}</div>
          )}

          <label className="flex gap-2 text-sm mt-4">
            <input type="checkbox" checked={form.submitter.consent} onChange={e => update('submitter','consent', e.target.checked)} />
            <span className="required">I have read and agree to the submission terms. All information is true and I have the legal right to market this opportunity.</span>
          </label>
        </div>
      )}

      {/* Always show missing requirements in final step */}
      {step === 6 && currentMissing.length > 0 && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/40 rounded text-sm">
          <div className="font-semibold text-red-400 mb-1">Blocked — Missing Requirements (click to fix):</div>
          {currentMissing.map((m, idx) => (
            <button key={idx} onClick={() => jumpToField(m.field, m.step)} className="block text-left w-full hover:underline py-0.5 text-red-300">
              Step {m.step}: {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer controls */}
      <div className="flex justify-between mt-5 items-center">
        <button onClick={back} disabled={step === 1} className="btn btn-ghost disabled:opacity-40">Back</button>
        
        {step < 6 ? (
          <button onClick={next} className="btn btn-primary">Continue to Step {step + 1}</button>
        ) : (
          <button 
            onClick={handleSubmit} 
            disabled={!canSubmitFinal}
            className={`btn px-8 ${canSubmitFinal ? 'btn-green' : 'bg-zinc-700 cursor-not-allowed text-zinc-400'}`}
          >
            {canSubmitFinal ? 'SUBMIT DEAL TO QUEUE' : 'COMPLETE REQUIRED FIELDS & DOCS'}
          </button>
        )}
      </div>
    </div>
  )
}


