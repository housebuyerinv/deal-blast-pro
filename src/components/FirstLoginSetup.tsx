import { useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_SETTINGS } from '../lib/constants'
import { useAppStore } from '../store/useAppStore'
import type { TrialState } from '../lib/types'
import { buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency, type PaidPlan } from '../lib/billingLinks'

type PlanName = TrialState['plan']

const plans: { name: PlanName; monthly: string; annual: string; annualNote: string; promoAnnual?: string; promoLabel?: string; promoAnnualNote?: string; desc: string; activeRelease: boolean; popular?: boolean }[] = [
  { name: 'Free Demo', monthly: '$0', annual: '$0', annualNote: 'free demo', desc: 'Start immediately with the public submission flow and demo limits.', activeRelease: true },
  { name: 'Starter', monthly: '$47/mo', annual: '$40/mo', annualNote: '$470 billed annually', desc: 'For solo operators collecting deals and buyer interest.', activeRelease: true },
  { name: 'Pro', monthly: '$97/mo', annual: '$81/mo', annualNote: '$970 billed annually', promoAnnual: '$73/mo', promoLabel: 'with LAUNCH10', promoAnnualNote: '$873 first annual payment', desc: 'For one active operator who needs buyer matching, match scoring, deal blast exports, and regular buyer outreach.', activeRelease: true, popular: true },
  { name: 'Agency', monthly: '$197/mo', annual: '$165/mo', annualNote: '$1,970 billed annually', promoAnnual: '$148/mo', promoLabel: 'with LAUNCH10', promoAnnualNote: '$1,773 first annual payment', desc: 'For heavier dispo workflows and future team/VA workflows.', activeRelease: false },
  { name: 'Enterprise', monthly: '$297/mo or Custom', annual: 'Custom annual pricing', annualNote: 'contact support', desc: 'For custom onboarding, integrations, production support, and higher-volume needs.', activeRelease: false },
]

export default function FirstLoginSetup() {
  const { user, settings, updateSettings, activateManualPlan } = useAppStore()
  const onboarding = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }
  const billingSetup = getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || DEFAULT_SETTINGS.billingProviderSetup!)
  const agencyEnterpriseEnabled = Boolean(onboarding.agencyEnterpriseEnabled)
  const [selectedPlan, setSelectedPlan] = useState<PlanName>(onboarding.selectedPlan || 'Free Demo')
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>('monthly')
  const [message, setMessage] = useState('')
  const selectedPaymentLink = selectedPlan === 'Free Demo'
    ? ''
    : getPlanPaymentLink(billingSetup, selectedPlan as PaidPlan, billingFrequency)
  const paymentSetupReady =
    ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || '')) &&
    isValidPaymentUrl(selectedPaymentLink)
  const selectedPaidPlanReady = selectedPlan !== 'Free Demo' && paymentSetupReady
  const selectedPaidPlanNeedsSetup = selectedPlan === 'Starter' || selectedPlan === 'Pro'

  const continueButtonLabel = () => {
    if (selectedPlan === 'Free Demo') return 'Enter Free Demo'
    if (selectedPaidPlanReady) return 'Continue to Payment'
    if (selectedPaidPlanNeedsSetup) return 'Payment Setup Required'
    return 'Contact Support'
  }

  const completeSetup = (plan: PlanName, billingStatus: NonNullable<TrialState['billingStatus']>) => {
    activateManualPlan({
      plan,
      billingStatus,
      billingFrequency: plan === 'Free Demo' ? 'monthly' : billingFrequency,
      paymentProvider: 'Stripe',
      billingPeriodStart: '',
      billingPeriodEnd: '',
      billingAdminNote: plan === 'Free Demo'
        ? 'Selected Free Demo during first-login setup.'
        : 'Selected paid plan during first-login setup. Awaiting Stripe webhook confirmation.',
    })
    updateSettings({
      onboarding: {
        ...onboarding,
        planSelectionCompleted: true,
        selectedPlan: plan,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  const continueSetup = () => {
    const gatedPlan = (selectedPlan === 'Agency' || selectedPlan === 'Enterprise') && !agencyEnterpriseEnabled

    if (selectedPlan === 'Free Demo') {
      completeSetup('Free Demo', 'Trial Active')
      toast.success('Free Demo selected. Welcome to Deal Blast Pro.')
      return
    }

    if (gatedPlan) {
      setMessage(`${selectedPlan} is visible for planning, but it is currently Contact Support / Coming Soon for this release.`)
      return
    }

    if (!paymentSetupReady) {
      setMessage('Payment setup is not active yet. Free Demo is available now. Paid plans require support to finish billing setup first.')
      return
    }

    const checkoutUrl = buildStripeCheckoutUrl(selectedPaymentLink, {
      userId: user?.id,
      email: user?.email,
      plan: selectedPlan as PaidPlan,
      billingFrequency,
    })

    window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
    completeSetup(selectedPlan, 'Payment Pending')
    setMessage('Your payment will be reviewed and your plan will be activated after Stripe confirmation.')
    toast.success('Payment pending. Stripe confirmation is required to activate the selected plan.')
  }

  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-2">First Login Setup</div>
          <div className="text-3xl font-semibold">Choose Your Deal Blast Pro Plan</div>
          <div className="text-[#8B92A3] mt-2 max-w-3xl">
            Free Demo opens immediately. Paid plans open the saved Stripe payment link and remain Payment Pending until Stripe confirms payment.
          </div>
          <div className="mt-3 text-sm text-amber-300">
            Launch promo: Use code LAUNCH10 for 10% off your first annual payment on Pro annual and higher annual plans through 01/01/2027.
          </div>
          <div className="mt-4 inline-flex rounded border border-[#252A38] p-1">
            <button onClick={() => setBillingFrequency('monthly')} className={`px-4 py-1 text-sm rounded ${billingFrequency === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
            <button onClick={() => setBillingFrequency('annual')} className={`px-4 py-1 text-sm rounded ${billingFrequency === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
          </div>
          <div className="mt-2 text-xs text-[#8B92A3]">Annual plans save 2 months compared to monthly billing.</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {plans.map(plan => {
            const releaseActive = plan.activeRelease || agencyEnterpriseEnabled
            const selected = selectedPlan === plan.name
            const showAnnualPromo = billingFrequency === 'annual' && (plan.name === 'Pro' || (plan.name === 'Agency' && releaseActive)) && plan.promoAnnual
            return (
              <button
                key={plan.name}
                type="button"
                onClick={() => setSelectedPlan(plan.name)}
                className={`text-left rounded border p-4 bg-[#0F111A] transition min-h-[250px] overflow-hidden ${selected ? 'border-[#22C55E] ring-1 ring-[#22C55E]/40' : 'border-[#252A38] hover:border-[#3B82F6]/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-lg">{plan.name}</div>
                  {plan.popular && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22C55E] text-black">Popular</span>}
                </div>
                {showAnnualPromo ? (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-2xl font-semibold tabular-nums">{plan.promoAnnual}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-amber-300">{plan.promoLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-[#8B92A3] line-through">Regular {plan.annual}</div>
                    <div className="mt-1 text-xs text-amber-300">{plan.promoAnnualNote}</div>
                    <div className="mt-0.5 text-xs text-[#64748B] line-through">Regular {plan.annualNote}</div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 text-2xl font-semibold">{billingFrequency === 'monthly' ? plan.monthly : plan.annual}</div>
                    {billingFrequency === 'annual' && <div className="mt-1 text-xs text-[#8B92A3]">{plan.annualNote}</div>}
                  </>
                )}
                <div className="mt-2 text-sm text-[#8B92A3] min-h-[4.5rem] break-words">{plan.desc}</div>
                <div className={`mt-3 text-xs ${releaseActive ? 'text-[#22C55E]' : 'text-amber-300'}`}>
                  {releaseActive ? 'Available' : 'Coming Soon / Contact Support'}
                </div>
              </button>
            )
          })}
        </div>

        {message && (
          <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 p-3 text-sm">
            {message}
          </div>
        )}

        <div className="mt-6 flex flex-col md:flex-row md:items-center gap-3">
          <button onClick={continueSetup} className="btn btn-green px-6">
            {continueButtonLabel()}
          </button>
          <div className="text-xs text-[#64748B]">
            Deal Blast Pro does not collect payment credentials. Payment is completed through Stripe checkout when configured.
          </div>
        </div>
      </div>
    </div>
  )
}
