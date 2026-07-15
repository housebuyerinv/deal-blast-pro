import React, { useMemo, useState } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { uploadBuyerProofFile, type BuyerProofFileMeta } from '../../lib/buyerProofStorage'
import { createBuyerPortalSubmission } from '../../lib/buyerPortalSubmissionStorage'
import { useAppStore } from '../../store/useAppStore'
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
const FILE_UPLOAD_WARNING = 'Submission received, but file upload could not be completed. Please email files separately.'

export default function BuyerPortal() {
  const trial = useAppStore(s => s.trial)
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : 'Trial Active')
  const paidAccessActive = billingStatus === 'Paid Active' || billingStatus === 'Comped'
  const billingAccessBlocked = billingStatus === 'Past Due' || billingStatus === 'Cancelled' || billingStatus === 'Payment Pending'
  const publicSignupBlocked = billingAccessBlocked || (!paidAccessActive && (trial.plan || 'Free Demo') === 'Free Demo' && (!trial.isActive || (trial.daysLeft || 0) <= 0))
  const publicSignupBlockedMessage = billingAccessBlocked
    ? billingStatus === 'Payment Pending'
      ? 'Buyer signup is paused while payment is pending. Please wait for admin confirmation or contact admin if payment has already been completed.'
      : billingStatus === 'Past Due'
        ? 'Buyer signup is paused because billing is past due. Please complete payment or contact admin to restore access.'
        : 'Buyer signup is paused because the plan is cancelled. Contact admin to reactivate billing, or use Free Demo if available.'
    : 'Buyer signup is paused because the Free Demo has expired. Please upgrade or contact admin to complete billing in Settings & Trial.'
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
    if (!form.email.trim()) nextErrors.push('Email is required.')
    if (!form.phone.trim()) nextErrors.push('Phone is required.')
    if (!form.company.trim()) nextErrors.push('Company / entity is required.')
    if (buyerTypes.length === 0) nextErrors.push('Select at least one buyer type.')
    if (buyerTypes.includes('Other') && !form.buyerTypeOther.trim()) nextErrors.push('Describe the Other buyer type.')
    if (markets.length === 0) nextErrors.push('Select at least one target market/state.')
    if (markets.includes('Other') && !form.marketsOther.trim()) nextErrors.push('Describe the Other target market.')
    if (assetTypes.length === 0) nextErrors.push('Select at least one asset type.')
    if (assetTypes.includes('Other') && !form.assetTypeOther.trim()) nextErrors.push('Describe the Other asset type.')
    if (proofFiles.length === 0 && !fileUploadWarning) nextErrors.push('Upload at least one proof document.')
    if (!form.consent) nextErrors.push('Consent confirmation is required.')

    setErrors(nextErrors)
    return nextErrors.length === 0
  }

  const handleProofUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    if (currentProofType === 'Other' && !currentOtherLabel.trim()) {
      toast.error('Describe the Other document type before uploading.')
      return
    }

    try {
      const rows: ProofFileRow[] = await Promise.all(Array.from(fileList).map(file =>
        uploadBuyerProofFile(
          file,
          currentProofType,
          currentProofType === 'Other' ? currentOtherLabel.trim() : ''
        )
      ))

      setProofFiles(prev => [...prev, ...rows])
      setFileUploadWarning('')
      toast.success(`${rows.length} proof file${rows.length === 1 ? '' : 's'} attached`)
    } catch (error) {
      console.error('Proof file upload failed:', error)
      setFileUploadWarning(FILE_UPLOAD_WARNING)
      toast.error(FILE_UPLOAD_WARNING)
    }
  }

  const removeProofFile = (id: string) => {
    setProofFiles(prev => prev.filter(f => f.id !== id))
  }

  const submitBuyer = async (e: React.FormEvent) => {
    e.preventDefault()

    if (publicSignupBlocked) {
      toast.error(publicSignupBlockedMessage)
      return
    }

    if (!validate()) {
      toast.error('Please complete the required buyer verification fields.')
      return
    }

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
      await createBuyerPortalSubmission(buyerSubmission)
      setSubmissionWarning(fileUploadWarning)
      toast.success(fileUploadWarning ? `Buyer verification submitted for review. ${fileUploadWarning}` : 'Buyer verification submitted for review.')
      setSubmitted(true)
    } catch (error) {
      console.error('Buyer portal submission failed:', error)
      toast.error('Could not submit buyer profile. Check Supabase table policies and try again.')
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#070A12] text-white">
        <PublicNav />
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="card p-8 text-center">
            <CheckCircle className="mx-auto mb-4 text-[#22C55E]" size={48} />
            <h1 className="text-3xl font-bold mb-3">Buyer profile received</h1>
            <p className="text-[#C5CAD6] mb-6">
              Thanks — your buyer profile and proof documents were submitted. Our team will review your verification details and match you with off-market opportunities that fit your buy box.
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
          <h1 className="text-4xl font-bold mb-3">Get Added to Our Verified Buyer Network</h1>
          <p className="text-[#C5CAD6] max-w-3xl">
            Submit your buying criteria and proof documents so we can confirm your purchasing ability and match you with off-market opportunities.
          </p>
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6">
            <div className="flex items-center gap-2 text-red-300 font-semibold mb-2">
              <AlertCircle size={18} />
              Please fix these items
            </div>
            <ul className="text-sm text-red-200 list-disc pl-5 space-y-1">
              {errors.map(err => <li key={err}>{err}</li>)}
            </ul>
          </div>
        )}

        {publicSignupBlocked && (
          <div className="card p-4 mb-5 bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
            {publicSignupBlockedMessage}
          </div>
        )}

        <form onSubmit={submitBuyer} className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buyer Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#8B92A3]">Full Name *</label>
                <input className="input" value={form.name} onChange={e => updateForm('name', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Email *</label>
                <input className="input" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Phone *</label>
                <input className="input" value={form.phone} onChange={e => updateForm('phone', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Company / Entity *</label>
                <input className="input" value={form.company} onChange={e => updateForm('company', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-[#8B92A3]">Website / LinkedIn / Company Profile</label>
                <input className="input" value={form.website} onChange={e => updateForm('website', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buyer Type *</h2>
            <div className="flex flex-wrap gap-2">
              {BUYER_TYPES.map(type => (
                <Chip key={type} label={type} active={buyerTypes.includes(type)} onClick={() => setBuyerTypes(prev => toggleValue(prev, type))} />
              ))}
            </div>
            {buyerTypes.includes('Other') && (
              <div className="mt-3">
                <label className="text-xs text-[#8B92A3]">Describe Other Buyer Type *</label>
                <input className="input" value={form.buyerTypeOther} onChange={e => updateForm('buyerTypeOther', e.target.value)} />
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Buying Criteria</h2>

            <div className="mb-5">
              <div className="font-semibold mb-2">Target States / Markets *</div>
              <div className="flex flex-wrap gap-2">
                {STATES.map(state => (
                  <Chip key={state} label={state} active={markets.includes(state)} onClick={() => setMarkets(prev => toggleValue(prev, state))} />
                ))}
              </div>
              {markets.includes('Other') && (
                <div className="mt-3">
                  <label className="text-xs text-[#8B92A3]">Describe Other Target Market *</label>
                  <input className="input" value={form.marketsOther} onChange={e => updateForm('marketsOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="text-xs text-[#8B92A3]">Target Cities / Counties</label>
              <textarea className="input h-20" value={form.cities} onChange={e => updateForm('cities', e.target.value)} placeholder="Example: Memphis, Birmingham, Pittsburgh, Charlotte..." />
            </div>

            <div className="mb-5">
              <div className="font-semibold mb-2">Asset Types *</div>
              <div className="flex flex-wrap gap-2">
                {ASSET_TYPES.map(type => (
                  <Chip key={type} label={type} active={assetTypes.includes(type)} onClick={() => setAssetTypes(prev => toggleValue(prev, type))} />
                ))}
              </div>
              {assetTypes.includes('Other') && (
                <div className="mt-3">
                  <label className="text-xs text-[#8B92A3]">Describe Other Asset Type *</label>
                  <input className="input" value={form.assetTypeOther} onChange={e => updateForm('assetTypeOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="font-semibold mb-2">Exit Strategy *</div>
              <div className="flex flex-wrap gap-2">
                {EXIT_STRATEGIES.map(type => (
                  <Chip key={type} label={type} active={exitStrategies.includes(type)} onClick={() => setExitStrategies(prev => toggleValue(prev, type))} />
                ))}
              </div>
              {exitStrategies.includes('Other') && (
                <div className="mt-3">
                  <label className="text-xs text-[#8B92A3]">Describe Other Exit Strategy *</label>
                  <input className="input" value={form.exitStrategyOther} onChange={e => updateForm('exitStrategyOther', e.target.value)} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-[#8B92A3]">Min Price *</label>
                <input className="input" type="number" value={form.priceMin} onChange={e => updateForm('priceMin', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Max Price *</label>
                <input className="input" type="number" value={form.priceMax} onChange={e => updateForm('priceMax', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Min Units</label>
                <input className="input" type="number" value={form.unitsMin} onChange={e => updateForm('unitsMin', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#8B92A3]">Max Units</label>
                <input className="input" type="number" value={form.unitsMax} onChange={e => updateForm('unitsMax', e.target.value)} />
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
                <label className="text-xs text-[#8B92A3]">Beds</label>
                <select
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
                <label className="text-xs text-[#8B92A3]">Baths</label>
                <select
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
                <label className="text-xs text-[#8B92A3]">Units</label>
                <select
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
                <label className="text-xs text-[#8B92A3]">Down Payment Max</label>
                <input className="input w-full" value={form.downPaymentMax || ''} onChange={e => updateForm('downPaymentMax', e.target.value)} placeholder="$10K" />
              </div>

              <div>
                <label className="text-xs text-[#8B92A3]">Monthly Payment Max</label>
                <input className="input w-full" value={form.monthlyPaymentMax || ''} onChange={e => updateForm('monthlyPaymentMax', e.target.value)} placeholder="$1,000/mo" />
              </div>

              <div>
                <label className="text-xs text-[#8B92A3]">Interest Rate Max</label>
                <input className="input w-full" value={form.interestRateMax || ''} onChange={e => updateForm('interestRateMax', e.target.value)} placeholder="7%" />
              </div>

              <div>
                <label className="text-xs text-[#8B92A3]">Balloon Term</label>
                <input className="input w-full" value={form.balloonTerm || ''} onChange={e => updateForm('balloonTerm', e.target.value)} placeholder="5 years" />
              </div>

              <div>
                <label className="text-xs text-[#8B92A3]">Cap Rate Target</label>
                <input className="input w-full" value={form.capRateTarget || ''} onChange={e => updateForm('capRateTarget', e.target.value)} placeholder="8% cap" />
              </div>

              <div>
                <label className="text-xs text-[#8B92A3]">Creative Structure</label>
                <input className="input w-full" value={form.creativeStructure || ''} onChange={e => updateForm('creativeStructure', e.target.value)} placeholder="Seller Finance, Subto, Wrap, RTO" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-2">Verification Documents *</h2>
            <p className="text-sm text-[#8B92A3] mb-4">
              Upload at least one proof document. Select what the file is before attaching it.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs text-[#8B92A3]">Document Type *</label>
                <select className="select" value={currentProofType} onChange={e => setCurrentProofType(e.target.value)}>
                  {PROOF_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>

              {currentProofType === 'Other' && (
                <div>
                  <label className="text-xs text-[#8B92A3]">Describe Document *</label>
                  <input className="input" value={currentOtherLabel} onChange={e => setCurrentOtherLabel(e.target.value)} />
                </div>
              )}

              <div className={currentProofType === 'Other' ? '' : 'md:col-span-2'}>
                <label className="text-xs text-[#8B92A3]">Attach File *</label>
                <input
                  className="input"
                  type="file"
                  multiple
                  onChange={e => {
                    void handleProofUpload(e.target.files)
                    e.currentTarget.value = ''
                  }}
                />
              </div>
            </div>

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
                      <div className="flex items-start gap-2">
                        <FileText size={16} className="text-[#3B82F6] mt-0.5" />
                        <div>
                          <div className="text-sm">{file.fileName}</div>
                          <div className="text-xs text-[#8B92A3]">
                            {file.proofType === 'Other' ? file.otherLabel : file.proofType}
                          </div>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeProofFile(file.id)} className="text-xs text-red-400 hover:text-red-300">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Additional Notes</h2>
            <textarea
              className="input h-28"
              value={form.notes}
              onChange={e => updateForm('notes', e.target.value)}
              placeholder="Tell us anything else about your buying criteria, funding source, preferred deal structure, or recent closings."
            />

            <label className="flex items-start gap-3 mt-5 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.consent}
                onChange={e => updateForm('consent', e.target.checked)}
              />
              <span className="text-[#C5CAD6]">
                I confirm the information submitted is accurate, and I understand Deal Blast Pro may review my proof documents before adding me to the verified buyer network.
              </span>
            </label>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button type="submit" disabled={publicSignupBlocked} className="btn btn-primary flex-1 py-3 disabled:opacity-60 disabled:cursor-not-allowed">
              {publicSignupBlocked ? 'Buyer Signup Paused' : 'Submit Buyer Verification'}
            </button>
          </div>
        </form>

        <footer className="border-t border-[#252A38] mt-10 py-7 text-center text-xs text-[#8B92A3]">
          House Buyer Investments - Deal Blast Pro<br />
          Verified Buyer Portal
        </footer>
      </div>
    </div>
  )
}
