import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../../lib/constants'
import { useAppStore } from '../../store/useAppStore'
import { buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency } from '../../lib/billingLinks'

type Plan = 'Starter' | 'Pro' | 'Agency' | 'Enterprise'

const plans: { name: Plan; monthly: string; annual: string; annualNote: string; promoAnnual?: string; promoLabel?: string; promoAnnualNote?: string; desc: string; popular?: boolean; custom?: boolean }[] = [
  { name: 'Starter', monthly: '$47/mo', annual: '$40/mo', annualNote: '$470 billed annually', desc: 'For solo operators collecting deals and buyer interest.' },
  { name: 'Pro', monthly: '$97/mo', annual: '$81/mo', annualNote: '$970 billed annually', promoAnnual: '$73/mo', promoLabel: 'with LAUNCH10', promoAnnualNote: '$873 first annual payment', desc: 'For one active operator who needs buyer matching, match scoring, deal blast exports, and regular buyer outreach.', popular: true },
  { name: 'Agency', monthly: '$197/mo', annual: '$165/mo', annualNote: '$1,970 billed annually', promoAnnual: '$148/mo', promoLabel: 'with LAUNCH10', promoAnnualNote: '$1,773 first annual payment', desc: 'For heavier dispo workflows, saved buyer segments, stronger matching, follow-up systems, and future team/VA workflows.', custom: true },
  { name: 'Enterprise', monthly: '$297/mo or Custom', annual: 'Custom annual pricing', annualNote: 'contact admin', desc: 'For custom onboarding, integrations, production support, higher-volume needs, and custom team workflows.', custom: true },
]

export default function Upgrade() {
  const { user, trial, settings, activateManualPlan } = useAppStore()
  const navigate = useNavigate()
  const [billing, setBilling] = useState<BillingFrequency>('monthly')
  const [selected, setSelected] = useState<Plan>('Pro')
  const [step, setStep] = useState<'select' | 'payment' | 'contact' | 'setup'>('select')

  const current = trial.plan || (trial.isPaid ? 'Pro' : 'Free Demo')
  const isPaid = current !== 'Free Demo'
  const onboarding = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }
  const agencyEnterpriseEnabled = Boolean(onboarding.agencyEnterpriseEnabled)
  const billingSetup = getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || DEFAULT_SETTINGS.billingProviderSetup!)
  const paymentLink = getPlanPaymentLink(billingSetup, selected, billing)
  const checkoutUrl = buildStripeCheckoutUrl(paymentLink, {
    userId: user?.id,
    email: user?.email,
    plan: selected,
    billingFrequency: billing,
  })
  const paymentSetupReady =
    ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || '')) &&
    isValidPaymentUrl(paymentLink)
  const currentPlanLabel = isPaid ? current : 'Free Demo'
  const selectedPlanDetails = plans.find(pp => pp.name === selected)
  const selectedUsesAnnualPromo = billing === 'annual' && selectedPlanDetails && (selected === 'Pro' || (selected === 'Agency' && agencyEnterpriseEnabled)) && selectedPlanDetails.promoAnnual

  const goPayment = () => {
    if ((selected === 'Agency' || selected === 'Enterprise') && !agencyEnterpriseEnabled) {
      setStep('contact')
      return
    }

    if (!paymentSetupReady) {
      setStep('setup')
      return
    }

    window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
    activateManualPlan({
      plan: selected,
      billingStatus: 'Payment Pending',
      billingFrequency: billing,
      paymentProvider: 'Stripe',
      billingPeriodStart: '',
      billingPeriodEnd: '',
      billingAdminNote: 'Plan selected through Upgrade page. Awaiting Stripe webhook confirmation.',
    })
    setStep('payment')
  }

  const cancel = () => setStep('select')

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Upgrade Plan</div>
        <div className="text-[#8B92A3]">Current: <span className="text-white font-medium">{currentPlanLabel}</span> - Plan prices match Settings & Trial.</div>
      </div>

      {step === 'select' && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <div className="inline-flex rounded border border-[#252A38] p-0.5">
              <button onClick={() => setBilling('monthly')} className={`px-3 py-1 text-sm rounded ${billing === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
              <button onClick={() => setBilling('annual')} className={`px-3 py-1 text-sm rounded ${billing === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
            </div>
            <div className="text-xs text-[#64748B]">Annual plans save 2 months compared to monthly billing.</div>
          </div>

          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 p-3 text-sm">
            Launch promo: Use code LAUNCH10 for 10% off your first annual payment on Pro annual and higher annual plans through 01/01/2027.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {plans.map(p => {
              const showAnnualPromo = billing === 'annual' && (p.name === 'Pro' || (p.name === 'Agency' && agencyEnterpriseEnabled)) && p.promoAnnual
              return (
                <div
                  key={p.name}
                  onClick={() => setSelected(p.name)}
                  className={`card p-4 min-h-[230px] overflow-hidden cursor-pointer transition border ${selected === p.name ? 'border-[#22C55E] ring-1 ring-[#22C55E]/40' : 'border-[#252A38]'} ${p.popular ? 'ring-1 ring-[#22C55E]/30' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-lg">{p.name}</div>
                    {p.popular && <span className="text-[10px] px-1.5 py-0.5 bg-[#22C55E] text-black rounded">Most Popular</span>}
                  </div>
                  {showAnnualPromo ? (
                    <div className="mt-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-2xl font-semibold tabular-nums">{p.promoAnnual}</span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-300">{p.promoLabel}</span>
                      </div>
                      <div className="mt-1 text-xs text-[#8B92A3] line-through">Regular {p.annual}</div>
                      <div className="mt-1 text-xs text-amber-300">{p.promoAnnualNote}</div>
                      <div className="mt-0.5 text-xs text-[#64748B] line-through">Regular {p.annualNote}</div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 text-2xl font-semibold tabular-nums">{billing === 'monthly' ? p.monthly : p.annual}</div>
                      {billing === 'annual' && <div className="mt-1 text-xs text-[#8B92A3]">{p.annualNote}</div>}
                    </>
                  )}
                  <div className="text-xs text-[#8B92A3] mt-1 min-h-[2.2em] break-words">{p.desc}</div>
                  {p.custom && <div className="mt-1 text-amber-400 text-xs">{agencyEnterpriseEnabled ? 'Available by approval' : 'Coming Soon / Contact Support'}</div>}
                  {current === p.name && <div className="mt-1 text-emerald-400 text-xs">Current plan</div>}
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button onClick={goPayment} className="btn btn-green px-6">
              {(selected === 'Agency' || selected === 'Enterprise') && !agencyEnterpriseEnabled
                ? 'Contact Support'
                : paymentSetupReady
                  ? 'Continue to Payment'
                  : 'Payment Setup Required'}
            </button>
            <button onClick={() => navigate(-1)} className="btn btn-ghost">Cancel</button>
            <button onClick={() => navigate('/app/settings')} className="text-sm text-[#8B92A3] underline ml-auto">Back to Settings</button>
          </div>
          <div className="mt-3 text-xs text-[#64748B]">Stripe checkout opens securely in a new tab. Existing records remain safe.</div>
        </>
      )}

      {step === 'payment' && (
        <div className="card p-6 max-w-md">
          <div className="text-xl font-semibold mb-2">Payment Pending - {selected}</div>
          <div className="text-sm text-[#8B92A3] mb-4">Complete payment through Stripe. Deal Blast Pro does not collect card, bank, routing, CVV, API key, OAuth token, or provider login credentials here.</div>
          <div className="text-sm mb-4">
            Plan: {selected} - {selectedUsesAnnualPromo
              ? `${selectedPlanDetails?.promoAnnual}, ${selectedPlanDetails?.promoAnnualNote}`
              : `${selectedPlanDetails?.[billing]}${billing === 'annual' ? `, ${selectedPlanDetails?.annualNote}` : ''}`}
          </div>
          <div className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 p-3 text-sm mb-4">
            Your plan remains blocked while payment is pending. After Stripe confirms successful payment, Deal Blast Pro can activate paid access automatically.
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')} className="btn btn-green">Complete Payment</button>
            <button
              onClick={() => {
                activateManualPlan({
                  plan: 'Free Demo',
                  billingStatus: 'Trial Active',
                  billingFrequency: 'monthly',
                  paymentProvider: 'Stripe',
                  billingPeriodStart: '',
                  billingPeriodEnd: '',
                  billingAdminNote: 'User chose Free Demo after pending Stripe checkout.',
                })
                navigate('/app/dashboard')
              }}
              className="btn btn-ghost"
            >
              Choose Free Demo
            </button>
            <button onClick={() => navigate('/contact')} className="btn btn-ghost">Contact Support</button>
            <button onClick={cancel} className="btn btn-ghost">Back</button>
          </div>
          <div className="text-[10px] text-amber-400 mt-3">If payment confirmation does not complete, contact support.</div>
        </div>
      )}

      {step === 'setup' && (
        <div className="card p-6 max-w-md">
          <div className="text-xl font-semibold mb-2">Payment Setup Not Active</div>
          <div className="text-sm text-[#8B92A3] mb-4">
            Payment setup is not active yet. Free Demo is available now. Paid plans require support to finish billing setup first.
          </div>
          <div className="rounded border border-[#252A38] bg-[#0A0C12] p-3 text-sm text-[#C5CAD6] mb-4">
            <div>Status: <span className="text-amber-300">{billingSetup.setupStatus || 'Not Started'}</span></div>
            <div>Payment link: <span className="text-[#8B92A3]">{paymentLink ? 'Saved but not ready' : 'Missing'}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/app/settings')} className="btn btn-green flex-1">Open Settings & Trial</button>
            <button onClick={cancel} className="btn btn-ghost flex-1">Back</button>
          </div>
        </div>
      )}

      {step === 'contact' && (
        <div className="card p-6 max-w-md">
          <div className="text-xl font-semibold mb-2">{selected} - Contact Support</div>
          <div className="text-sm mb-4">Agency and Enterprise are visible for planning, but are Coming Soon / Contact Support unless enabled for your workspace.</div>
          <div className="flex gap-2 mb-3">
            <button onClick={() => navigate('/app/settings')} className="btn btn-green flex-1">Open Settings & Trial</button>
            <button onClick={cancel} className="btn btn-ghost flex-1">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
