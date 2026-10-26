import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, CheckCircle, AlertCircle, FileText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { uploadBuyerProofBatch, type BuyerProofFileMeta } from '../../lib/buyerProofStorage'
import { createBuyerPortalSubmission } from '../../lib/buyerPortalSubmissionStorage'
import { buyerIntakeFeedback } from '../../lib/buyerIntakeFeedback'
import { useAppStore } from '../../store/useAppStore'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'
const BUYER_TYPES = [
  'Cash Buyer',
  'Creative Buyer',
  'Seller Finance',
  'Subto',
  'Hedge Fund',
  'Institutional',
  'Private Equity',
  'JV Partner',
  'Broker',
  'Agent',
  'Wholesaler',
  'Hotel Buyer',
  'Land Buyer',
  'MHP Buyer',
  'Other',
]

const STATES = [
  'Nationwide',
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'Other',
]

const ASSET_TYPES = [
  'SFH',
  'Multifamily',
  'Small Multifamily',
  'Apartment',
  'Land',
  'Hotel',
  'Retail',
  'Office',
  'Industrial',
  'Storage',
  'Mixed Use',
  'Mobile Home Park',
  'RV Park',
  'Build To Rent',
  'Commercial',
  'Development',
  'Other',
]

const EXIT_STRATEGIES = [
  'Fix & Flip',
  'BRRRR',
  'Buy & Hold',
  'Section 8',
  'Development',
  'Wholesale',
  'Creative Finance',
  'Seller Finance',
  'Subto',
  'JV',
  'Other',
]

const PROOF_TYPES = [
  'Proof of Funds',
  'Lender Letter',
  'Bank Statement',
  'Buyer Bio',
  'Real Estate Portfolio',
  'Recent Closing Statement',
  'Entity / LLC Docs',
  'Acquisition Criteria Sheet',
  'Website / Company Profile',
  'Other',
]

type ProofFileRow = BuyerProofFileMeta

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  company: '',
  website: '',
  buyerTypeOther: '',
  marketsOther: '',
  assetTypeOther: '',
  exitStrategyOther: '',
  priceMin: '',
  priceMax: '',
  unitsMin: '',
  unitsMax: '',
    downPaymentMax: '',
    monthlyPaymentMax: '',
    interestRateMax: '',
    balloonTerm: '',
    capRateTarget: '',
    creativeStructure: '',
  cities: '',
  notes: '',
    bedRequirement: 'Any',
    bathRequirement: 'Any',
    unitRequirement: 'Any',
  consent: false,
  dealConsent: false,
}

function money(value: string) {
  const n = Number(value || 0)
  if (!n) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value]
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-xs transition ${
        active
          ? 'bg-[#22C55E] text-black border-[#22C55E]'
          : 'bg-[#111623] text-[#C5CAD6] border-[#252A38] hover:border-[#3B82F6]'
      }`}
    >
      {label}
    </button>
  )
}

const BED_REQUIREMENT_OPTIONS = ['Any', 'Studio', '1+', '2+', '3+', '4+', '5+']
const BATH_REQUIREMENT_OPTIONS = ['Any', '1+', '1.5+', '2+', '2.5+', '3+', '4+']
const UNIT_REQUIREMENT_OPTIONS = ['Any', '1+', '2+', '3+', '4+', '5+', '10+', '20+', '50+', '100+']
const FILE_UPLOAD_WARNING = 'Proof upload did not complete. Supporting documents still need secure follow-up.'

export default function BuyerPortal({ product = 'crm' }: { product?: 'crm' | 'buyermatch' }) {
  const formId = useId()
  const fieldId = (name: string) => `${formId}-${name}`
  const feedbackRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const independent = product === 'buyermatch'
  const submitting = useRef(false)
  const uploading = useRef(false)
  const submissionKey = useRef(crypto.randomUUID())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const trial = useAppStore(s => s.trial)
  const plan = trial.plan === 'Free Demo' ? 'Free' : trial.plan || 'Free'
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : plan === 'Free' ? 'Free Active' : 'Trial Active')
  const billingAccessBlocked = billingStatus === 'Past Due' || billingStatus === 'Cancelled' || billingStatus === 'Payment Pending'
  const publicSignupBlocked = !independent && billingAccessBlocked
  const publicSignupBlockedMessage = billingAccessBlocked
    ? billingStatus === 'Payment Pending'
      ? 'Buyer signup is paused while payment is pending. Please wait for admin confirmation or contact admin if payment has already been completed.'
      : billingStatus === 'Past Due'
        ? 'Buyer signup is paused because billing is past due. Please complete payment or contact admin to restore access.'
        : 'Buyer signup is paused because the plan is cancelled. Contact admin to reactivate billing.'
    : ''
const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [buyerTypes, setBuyerTypes] = useState<string[]>([])
  const [markets, setMarkets] = useState<string[]>([])
  const [assetTypes, setAssetTypes] = useState<string[]>([])
  const [exitStrategies, setExitStrategies] = useState<string[]>([])
  const [currentProofType, setCurrentProofType] = useState('Proof of Funds')
  const [currentOtherLabel, setCurrentOtherLabel] = useState('')
  const [proofFiles, setProofFiles] = useState<ProofFileRow[]>([])
  const [fileUploadWarning, setFileUploadWarning] = useState('')
  const [submissionWarning, setSubmissionWarning] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submissionError, setSubmissionError] = useState('')

  useEffect(() => {
    if (errors.length || submissionError) feedbackRef.current?.focus()
  }, [errors, submissionError])
  useEffect(() => {
    if (submitted) successRef.current?.focus()
  }, [submitted])

  const proofSummary = useMemo(() => {
    if (!proofFiles.length) return 'No proof uploaded yet'
    return proofFiles.map(f => `${f.proofType === 'Other' ? f.otherLabel || 'Other' : f.proofType}: ${f.fileName}`).join(', ')
  }, [proofFiles])

  const updateForm = (key: keyof typeof emptyForm, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const validate = () => {
    const nextErrors: string[] = []

    if (!form.name.trim()) nextErrors.push('Buyer name is required.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.push('A valid email is required.')
    if (!form.phone.trim()) nextErrors.push('Phone is required.')
    if (!form.company.trim()) nextErrors.push('Company / entity is required.')
    if (buyerTypes.length === 0) nextErrors.push('Select at least one buyer type.')
    if (buyerTypes.includes('Other') && !form.buyerTypeOther.trim()) nextErrors.push('Describe the Other buyer type.')
    if (markets.length === 0) nextErrors.push('Select at least one target market/state.')
    if (markets.includes('Other') && !form.marketsOther.trim()) nextErrors.push('Describe the Other target market.')
    if (assetTypes.length === 0) nextErrors.push('Select at least one asset type.')
    if (assetTypes.includes('Other') && !form.assetTypeOther.trim()) nextErrors.push('Describe the Other asset type.')
    if (exitStrategies.includes('Other') && !form.exitStrategyOther.trim()) nextErrors.push('Describe the Other exit strategy.')
    if (form.website.trim() && !/^https?:\/\/[^\s]+$/.test(form.website.trim())) nextErrors.push('Use a full http or https link for your website or profile.')
    if (!independent && proofFiles.length === 0 && !fileUploadWarning) nextErrors.push('Upload at least one proof document.')
    if (Number(form.priceMin) < 0 || Number(form.priceMax) < 0 || (form.priceMin && form.priceMax && Number(form.priceMin) > Number(form.priceMax))) nextErrors.push('Enter a valid minimum and maximum budget.')
    if ([form.unitsMin, form.unitsMax].some(value => value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0)) || (form.unitsMin && form.unitsMax && Number(form.unitsMin) > Number(form.unitsMax))) nextErrors.push('Enter a valid whole-number minimum and maximum unit count.')
    if (!form.consent) nextErrors.push('Consent confirmation is required.')

    setErrors(nextErrors)
    return nextErrors.length === 0
  }

  const handleProofUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    if (submitting.current || uploading.current) return
    if (proofFiles.length + fileList.length > 10) { toast.error('Attach no more than 10 proof documents.'); return }

    if (currentProofType === 'Other' && !currentOtherLabel.trim()) {
      toast.error('Describe the Other document type before uploading.')
      return
    }

    uploading.current = true
    setIsUploading(true)
    try {
      const result = await uploadBuyerProofBatch(Array.from(fileList), currentProofType, currentProofType === 'Other' ? currentOtherLabel.trim() : '')
      const rows = result.uploaded.filter(row => !independent || row.storageProvider === 'supabase')
      setProofFiles(prev => [...prev, ...rows])
      if (result.failedCount || rows.length !== result.uploaded.length) {
        setFileUploadWarning(FILE_UPLOAD_WARNING)
        toast.error(`${rows.length} proof files attached. ${FILE_UPLOAD_WARNING}`)
      } else {
        setFileUploadWarning('')
        toast.success(`${rows.length} proof file${rows.length === 1 ? '' : 's'} attached`)
      }
    } catch {
      setFileUploadWarning(FILE_UPLOAD_WARNING)
      toast.error(FILE_UPLOAD_WARNING)
    } finally {
      uploading.current = false
      setIsUploading(false)
    }
  }

  const removeProofFile = (id: string) => {
    if (submitting.current || uploading.current) return
    setProofFiles(prev => prev.filter(f => f.id !== id))
  }

  const submitBuyer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || uploading.current) return
    setSubmissionError('')

    if (publicSignupBlocked) {
      toast.error(publicSignupBlockedMessage)
      return
    }

    if (!validate()) {
      toast.error('Please complete the required buyer verification fields.')
      return
    }
    submitting.current = true
    setIsSubmitting(true)

    const cleanBuyerTypes = buyerTypes.map(t => t === 'Other' ? `Other: ${form.buyerTypeOther.trim()}` : t)
    const cleanMarkets = markets.map(t => t === 'Other' ? `Other: ${form.marketsOther.trim()}` : t)
    const cleanAssetTypes = assetTypes.map(t => t === 'Other' ? `Other: ${form.assetTypeOther.trim()}` : t)
    const cleanExitStrategies = exitStrategies.map(t => t === 'Other' ? `Other: ${form.exitStrategyOther.trim()}` : t)
    const submittedAt = new Date().toISOString()
    const priceRange = [money(form.priceMin), money(form.priceMax)].filter(Boolean).join(' - ') || 'Not Provided'
    const portalForm = {
      ...form,
      buyerTypes,
      markets,
      assetTypes,
      exitStrategies,
      cleanBuyerTypes,
      cleanMarkets,
      cleanAssetTypes,
      cleanExitStrategies,
      priceRange,
      proofSummary,
      fileUploadWarning,
    }

    const buyerSubmission = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      company: form.company.trim(),
      website: form.website.trim(),
      type: cleanBuyerTypes.join(', '),
      status: 'Submitted / Pending Review',
      submissionStatus: 'Pending Review',
      markets: cleanMarkets,
      assetTypes: cleanAssetTypes,
      exitStrategies: cleanExitStrategies,
      budgetMin: Number(form.priceMin) || 0,
      budgetMax: Number(form.priceMax) || 0,
      priceRange,
      fundingStatus: proofFiles.length ? 'Proof submitted' : 'Proof upload needs follow-up',
      strategy: cleanExitStrategies.join(', '),
      downPaymentMax: form.downPaymentMax,
      monthlyPaymentMax: form.monthlyPaymentMax,
      interestRateMax: form.interestRateMax,
      balloonTerm: form.balloonTerm,
      capRateTarget: form.capRateTarget,
      creativeStructure: form.creativeStructure,
      bedRequirement: form.bedRequirement,
      bathRequirement: form.bathRequirement,
      unitRequirement: form.unitRequirement,
      cities: form.cities,
      portalForm,
      tags: [
        'Buyer Portal',
        'Pending Review',
        proofFiles.some(f => f.proofType === 'Proof of Funds') ? 'POF Uploaded' : '',
        proofFiles.some(f => f.proofType === 'Buyer Bio') ? 'Bio Uploaded' : '',
        proofFiles.some(f => f.proofType === 'Real Estate Portfolio') ? 'Portfolio Uploaded' : '',
      ].filter(Boolean),
      notes: [
        form.notes ? `Buyer Notes: ${form.notes}` : '',
        form.website ? `Website / LinkedIn: ${form.website}` : '',
        form.cities ? `Target Cities: ${form.cities}` : '',
        cleanExitStrategies.length ? `Exit Strategies: ${cleanExitStrategies.join(', ')}` : '',
        form.unitsMin || form.unitsMax ? `Units: ${form.unitsMin || 'Any'} - ${form.unitsMax || 'Any'}` : '',
        form.downPaymentMax ? `Down Payment Max: ${form.downPaymentMax}` : '',
        form.monthlyPaymentMax ? `Monthly Payment Max: ${form.monthlyPaymentMax}` : '',
        form.interestRateMax ? `Interest Rate Max: ${form.interestRateMax}` : '',
        form.balloonTerm ? `Balloon Term: ${form.balloonTerm}` : '',
        form.capRateTarget ? `Cap Rate Target: ${form.capRateTarget}` : '',
        form.creativeStructure ? `Creative Structure: ${form.creativeStructure}` : '',
        proofFiles.length ? `Verification Docs: ${proofSummary}` : '',
        fileUploadWarning ? `File Upload Warning: ${fileUploadWarning}` : '',
        `Portal Submitted: ${new Date().toLocaleString()}`,
      ].filter(Boolean).join('\n\n'),
      buyerPortalSubmission: true,
      verificationStatus: 'Submitted / Pending Review',
      proofFiles,
      uploadedFiles: proofFiles,
      adminWarnings: fileUploadWarning ? [fileUploadWarning] : [],
      blastEligible: false,
      submittedAt,
    } as any

    try {
      await createBuyerPortalSubmission(buyerSubmission, { operationKey: submissionKey.current, notify: !independent })
      setSubmissionWarning(fileUploadWarning)
      toast.success(fileUploadWarning ? `Buyer verification submitted for review. ${fileUploadWarning}` : 'Buyer verification submitted for review.')
      setSubmitted(true)
    } catch (error) {
      const message = buyerIntakeFeedback(error)
      setSubmissionError(message)
      toast.error(message)
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#070A12] text-white">
        <PublicNav />
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="card p-8 text-center">
            <CheckCircle className="mx-auto mb-4 text-[#22C55E]" size={48} />
            <h1 ref={successRef} tabIndex={-1} className="text-3xl font-bold mb-3">Buyer profile received</h1>
            <p className="text-[#C5CAD6] mb-6">
              Your buying criteria were submitted for review. {proofFiles.length ? 'Attached proof documents are also pending review.' : 'No proof documents were attached; they can be supplied through secure follow-up.'} Submission does not automatically verify you or guarantee an invitation.
            </p>
            {submissionWarning && (
              <div className="mb-5 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                {submissionWarning}
              </div>
            )}
            <div className="rounded-xl border border-[#252A38] bg-[#0B1020] p-4 text-left text-sm">
              <div className="font-semibold mb-2">Submission status</div>
              <div className="text-[#22C55E]">Submitted / Pending Review</div>
              <div className="text-xs text-[#8B92A3] mt-2">
                Only verified buyers are eligible for private deal blasts and deal-room access.
              </div>
            </div>
          </div>

          <footer className="border-t border-[#252A38] mt-10 py-7 text-center text-xs text-[#8B92A3]">
            House Buyer Investments - Deal Blast Pro<br />
            Verified Buyer Portal
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1 text-xs text-[#22C55E] mb-4">
            <ShieldCheck size={14} />
            Verified Buyer Intake
          </div>
          <h1 className="text-4xl font-bold mb-3">{independent ? 'Join the BuyerMatch buyer network' : 'Join Our Private Buyer Network'}</h1>
          {independent && <ol aria-label="Buyer profile steps" className="bm-workflow mt-6"><li><span>01</span><div><strong>Your profile</strong><p>Contact details and buy box.</p></div></li><li><span>02</span><div><strong>Private proof</strong><p>Provide supporting documents.</p></div></li><li><span>03</span><div><strong>Consent & review</strong><p>Choose invitation consent.</p></div></li><li><span>04</span><div><strong>Matched invitations</strong><p>Respond via secure deal links.</p></div></li></ol>}
          {independent && <div className="mb-4 space-y-2"><p>Powered by Deal Blast Pro. Submit buying criteria without purchasing a CRM or BuyerMatch subscriber plan.</p><p>Your submission stays private and requires review. It does not automatically verify you, activate distribution, or guarantee an invitation.</p><Link className="underline" to="/buyermatch">Looking for deal-matching software? Compare BuyerMatch plans</Link></div>}
          <p className="text-[#C5CAD6] max-w-3xl">
            Submit your buying criteria and proof documents so we can confirm your purchasing ability and match you with off-market opportunities.
          </p>
        </div>

        {(errors.length > 0 || submissionError) && (
          <div ref={feedbackRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6">
            <div className="flex items-center gap-2 text-red-300 font-semibold mb-2">
              <AlertCircle size={18} />
              {submissionError ? 'Submission not confirmed' : 'Please fix these items'}
            </div>
            {errors.length > 0 && <ul className="text-sm text-red-200 list-disc pl-5 space-y-1">
              {errors.map(err => <li key={err}>{err}</li>)}
            </ul>}
            {submissionError && <p className="text-sm text-red-200">{submissionError}</p>}
          </div>
        )}

        {publicSignupBlocked && (
          <div className="card p-4 mb-5 bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
            {publicSignupBlockedMessage}
          </div>
        )}

        <form onSubmit={submitBuyer} noValidate aria-busy={isSubmitting || isUploading} className="space-y-6">
          <fieldset disabled={isSubmitting || isUploading} className="space-y-6 min-w-0">
            <legend className="sr-only">Buyer criteria and consent</legend>
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buyer Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={fieldId('name')} className="text-xs text-[#8B92A3]">Full Name *</label>
                <input id={fieldId('name')} required autoComplete="name" className="input" value={form.name} onChange={e => updateForm('name', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('email')} className="text-xs text-[#8B92A3]">Email *</label>
                <input id={fieldId('email')} required autoComplete="email" className="input" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('phone')} className="text-xs text-[#8B92A3]">Phone *</label>
                <input id={fieldId('phone')} required autoComplete="tel" type="tel" className="input" value={form.phone} onChange={e => updateForm('phone', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('company')} className="text-xs text-[#8B92A3]">Company / Entity *</label>
                <input id={fieldId('company')} required autoComplete="organization" className="input" value={form.company} onChange={e => updateForm('company', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={fieldId('website')} className="text-xs text-[#8B92A3]">Website / LinkedIn / Company Profile</label>
                <input id={fieldId('website')} autoComplete="url" className="input" value={form.website} onChange={e => updateForm('website', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buyer Type *</h2>
            <div role="group" aria-label="Buyer types" className="flex flex-wrap gap-2">
              {BUYER_TYPES.map(type => (
                <Chip key={type} label={type} active={buyerTypes.includes(type)} onClick={() => setBuyerTypes(prev => toggleValue(prev, type))} />
              ))}
            </div>
            {buyerTypes.includes('Other') && (
              <div className="mt-3">
                <label htmlFor={fieldId('buyerTypeOther')} className="text-xs text-[#8B92A3]">Describe Other Buyer Type *</label>
                <input id={fieldId('buyerTypeOther')} required className="input" value={form.buyerTypeOther} onChange={e => updateForm('buyerTypeOther', e.target.value)} />
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buying Criteria</h2>

            <div className="mb-5">
              <div className="font-semibold mb-2">Target States / Markets *</div>
              <div role="group" aria-label="Target markets" className="flex flex-wrap gap-2">
                {STATES.map(state => (
                  <Chip key={state} label={state} active={markets.includes(state)} onClick={() => setMarkets(prev => toggleValue(prev, state))} />
                ))}
              </div>
              {markets.includes('Other') && (
                <div className="mt-3">
                  <label htmlFor={fieldId('marketsOther')} className="text-xs text-[#8B92A3]">Describe Other Target Market *</label>
                  <input id={fieldId('marketsOther')} required className="input" value={form.marketsOther} onChange={e => updateForm('marketsOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor={fieldId('cities')} className="text-xs text-[#8B92A3]">Target Cities / Counties</label>
              <textarea id={fieldId('cities')} className="input h-20" value={form.cities} onChange={e => updateForm('cities', e.target.value)} placeholder="Example: Memphis, Birmingham, Pittsburgh, Charlotte..." />
            </div>

            <div className="mb-5">
              <div className="font-semibold mb-2">Asset Types *</div>
              <div role="group" aria-label="Asset types" className="flex flex-wrap gap-2">
                {ASSET_TYPES.map(type => (
                  <Chip key={type} label={type} active={assetTypes.includes(type)} onClick={() => setAssetTypes(prev => toggleValue(prev, type))} />
                ))}
              </div>
              {assetTypes.includes('Other') && (
                <div className="mt-3">
                  <label htmlFor={fieldId('assetTypeOther')} className="text-xs text-[#8B92A3]">Describe Other Asset Type *</label>
                  <input id={fieldId('assetTypeOther')} required className="input" value={form.assetTypeOther} onChange={e => updateForm('assetTypeOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="font-semibold mb-2">Exit Strategy (optional)</div>
              <div role="group" aria-label="Exit strategies" className="flex flex-wrap gap-2">
                {EXIT_STRATEGIES.map(type => (
                  <Chip key={type} label={type} active={exitStrategies.includes(type)} onClick={() => setExitStrategies(prev => toggleValue(prev, type))} />
                ))}
              </div>
              {exitStrategies.includes('Other') && (
                <div className="mt-3">
                  <label htmlFor={fieldId('exitStrategyOther')} className="text-xs text-[#8B92A3]">Describe Other Exit Strategy *</label>
                  <input id={fieldId('exitStrategyOther')} required className="input" value={form.exitStrategyOther} onChange={e => updateForm('exitStrategyOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label htmlFor={fieldId('priceMin')} className="text-xs text-[#8B92A3]">Min Price (optional)</label>
                <input id={fieldId('priceMin')} className="input" type="number" min="0" value={form.priceMin} onChange={e => updateForm('priceMin', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('priceMax')} className="text-xs text-[#8B92A3]">Max Price (optional)</label>
                <input id={fieldId('priceMax')} className="input" type="number" min="0" value={form.priceMax} onChange={e => updateForm('priceMax', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('unitsMin')} className="text-xs text-[#8B92A3]">Min Units</label>
                <input id={fieldId('unitsMin')} className="input" type="number" min="0" step="1" value={form.unitsMin} onChange={e => updateForm('unitsMin', e.target.value)} />
              </div>
              <div>
                <label htmlFor={fieldId('unitsMax')} className="text-xs text-[#8B92A3]">Max Units</label>
                <input id={fieldId('unitsMax')} className="input" type="number" min="0" step="1" value={form.unitsMax} onChange={e => updateForm('unitsMax', e.target.value)} />
              </div>
            </div>

            {(form.priceMin || form.priceMax) && (
              <div className="text-[#22C55E] text-sm mt-3">
                Budget: {money(form.priceMin) || 'Any'} - {money(form.priceMax) || 'Any'}
              </div>
            )}
          </div>

          <div className="card p-6">
          <div data-testid="buyer-portal-bbu-requirements" className="mt-4 rounded-xl border border-[#252A38] bg-[#0B0F17] p-4">
            <div className="font-semibold mb-2">Bed / Bath / Unit Requirements</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor={fieldId('bedRequirement')} className="text-xs text-[#8B92A3]">Beds</label>
                <select
                  id={fieldId('bedRequirement')}
                  className="input w-full mt-1"
                  value={form.bedRequirement || 'Any'}
                  onChange={e => setForm({ ...form, bedRequirement: e.target.value })}
                >
                  {BED_REQUIREMENT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={fieldId('bathRequirement')} className="text-xs text-[#8B92A3]">Baths</label>
                <select
                  id={fieldId('bathRequirement')}
                  className="input w-full mt-1"
                  value={form.bathRequirement || 'Any'}
                  onChange={e => setForm({ ...form, bathRequirement: e.target.value })}
                >
                  {BATH_REQUIREMENT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={fieldId('unitRequirement')} className="text-xs text-[#8B92A3]">Units</label>
                <select
                  id={fieldId('unitRequirement')}
                  className="input w-full mt-1"
                  value={form.unitRequirement || 'Any'}
                  onChange={e => setForm({ ...form, unitRequirement: e.target.value })}
                >
                  {UNIT_REQUIREMENT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-[10px] text-[#8B92A3] mt-2">
              Leave as Any if there is no specific preference. Only selected values count as buyer requirements.
            </div>
          </div>

            <h2 className="text-xl font-semibold mb-4">Creative Finance Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor={fieldId('downPaymentMax')} className="text-xs text-[#8B92A3]">Down Payment Max</label>
                <input id={fieldId('downPaymentMax')} className="input w-full" value={form.downPaymentMax || ''} onChange={e => updateForm('downPaymentMax', e.target.value)} placeholder="$10K" />
              </div>

              <div>
                <label htmlFor={fieldId('monthlyPaymentMax')} className="text-xs text-[#8B92A3]">Monthly Payment Max</label>
                <input id={fieldId('monthlyPaymentMax')} className="input w-full" value={form.monthlyPaymentMax || ''} onChange={e => updateForm('monthlyPaymentMax', e.target.value)} placeholder="$1,000/mo" />
              </div>

              <div>
                <label htmlFor={fieldId('interestRateMax')} className="text-xs text-[#8B92A3]">Interest Rate Max</label>
                <input id={fieldId('interestRateMax')} className="input w-full" value={form.interestRateMax || ''} onChange={e => updateForm('interestRateMax', e.target.value)} placeholder="7%" />
              </div>

              <div>
                <label htmlFor={fieldId('balloonTerm')} className="text-xs text-[#8B92A3]">Balloon Term</label>
                <input id={fieldId('balloonTerm')} className="input w-full" value={form.balloonTerm || ''} onChange={e => updateForm('balloonTerm', e.target.value)} placeholder="5 years" />
              </div>

              <div>
                <label htmlFor={fieldId('capRateTarget')} className="text-xs text-[#8B92A3]">Cap Rate Target</label>
                <input id={fieldId('capRateTarget')} className="input w-full" value={form.capRateTarget || ''} onChange={e => updateForm('capRateTarget', e.target.value)} placeholder="8% cap" />
              </div>

              <div>
                <label htmlFor={fieldId('creativeStructure')} className="text-xs text-[#8B92A3]">Creative Structure</label>
                <input id={fieldId('creativeStructure')} className="input w-full" value={form.creativeStructure || ''} onChange={e => updateForm('creativeStructure', e.target.value)} placeholder="Seller Finance, Subto, Wrap, RTO" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-2">Verification Documents{independent ? ' (optional)' : ' *'}</h2>
            <p className="text-sm text-[#8B92A3] mb-4">
              {independent ? 'Proof can be supplied through a secure signed-in upload or during review. Do not paste financial records into the notes.' : 'Upload at least one proof document. Select what the file is before attaching it.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label htmlFor={fieldId('proofType')} className="text-xs text-[#8B92A3]">Document Type</label>
                <select id={fieldId('proofType')} className="select" value={currentProofType} onChange={e => setCurrentProofType(e.target.value)}>
                  {PROOF_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>

              {currentProofType === 'Other' && (
                <div>
                  <label htmlFor={fieldId('proofOther')} className="text-xs text-[#8B92A3]">Describe Document *</label>
                  <input id={fieldId('proofOther')} className="input" value={currentOtherLabel} onChange={e => setCurrentOtherLabel(e.target.value)} />
                </div>
              )}

              <div className={currentProofType === 'Other' ? '' : 'md:col-span-2'}>
                <label htmlFor={fieldId('proofFile')} className="text-xs text-[#8B92A3]">Attach File{independent ? ' (optional)' : ' *'}</label>
                <input
                  id={fieldId('proofFile')}
                  aria-describedby={fieldId('proofFeedback')}
                  className="input"
                  type="file"
                  multiple
                  disabled={isSubmitting || isUploading}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.csv"
                  onChange={e => {
                    void handleProofUpload(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </div>
            </div>

            <p id={fieldId('proofFeedback')} role="status" className="text-sm text-[#C5CAD6] mb-3">
              {isUploading ? 'Uploading proof…' : fileUploadWarning || `${proofFiles.length} proof files attached.`}
            </p>
            <div className="rounded-xl border border-[#252A38] bg-[#0B1020] p-4">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <Upload size={18} />
                Attached Proof Files
              </div>

              {proofFiles.length === 0 ? (
                <div className="text-sm text-[#8B92A3]">No files attached yet.</div>
              ) : (
                <div className="space-y-2">
                  {proofFiles.map(file => (
                    <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#111623] border border-[#252A38] px-3 py-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <FileText size={16} className="text-[#3B82F6] mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm break-all">{file.fileName}</div>
                          <div className="text-xs text-[#8B92A3]">
                            {file.proofType === 'Other' ? file.otherLabel : file.proofType}
                          </div>
                        </div>
                      </div>
                      <button type="button" aria-label={`Remove ${file.fileName}`} disabled={isSubmitting || isUploading} onClick={() => removeProofFile(file.id)} className="text-xs text-red-400 hover:text-red-300">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4"><label htmlFor={fieldId('notes')}>Additional Notes</label></h2>
            <textarea
              id={fieldId('notes')}
              className="input h-28"
              value={form.notes}
              onChange={e => updateForm('notes', e.target.value)}
              placeholder="Tell us anything else about your buying criteria, funding source, preferred deal structure, or recent closings."
            />

            <label className="flex items-start gap-3 mt-5 text-sm">
              <input
                type="checkbox"
                required
                className="mt-1"
                checked={form.consent}
                onChange={e => updateForm('consent', e.target.checked)}
              />
              <span className="text-[#C5CAD6]">
                I confirm the information submitted is accurate. Verification badges require review of supporting evidence; joining the private network does not automatically verify me.
              </span>
            </label>
            <label className="flex items-start gap-3 mt-4 text-sm"><input type="checkbox" checked={form.dealConsent} onChange={e => updateForm('dealConsent', e.target.checked)} /><span>I also consent to receive relevant private deal invitations. This is optional; I can unsubscribe from an invitation. My criteria submission alone does not authorize distribution.</span></label>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button type="submit" disabled={publicSignupBlocked || isSubmitting || isUploading} className="btn btn-primary flex-1 py-3 disabled:opacity-60 disabled:cursor-not-allowed">
              {publicSignupBlocked ? 'Buyer Signup Paused' : isUploading ? 'Uploading proof…' : isSubmitting ? 'Submitting…' : 'Submit Buyer Verification'}
            </button>
          </div>
          </fieldset>
        </form>

      </div>
      <PublicFooter />
    </div>
  )
}
