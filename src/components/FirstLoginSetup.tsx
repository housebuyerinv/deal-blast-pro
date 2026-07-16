import { useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_SETTINGS } from '../lib/constants'
import { useAppStore } from '../store/useAppStore'
import type { TrialState } from '../lib/types'
import { buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency, type PaidPlan } from '../lib/billingLinks'
import {
  LAUNCH_ANNUAL_PROMOTION_COPY,
  PLAN_PRICING,
  PRICING_PLAN_ORDER,
  getPriceDisplay,
  type PricingPlanName,
} from '../lib/planPricing'

type PlanName = TrialState['plan']

const plans = PRICING_PLAN_ORDER.map(name => PLAN_PRICING[name])

export default function FirstLoginSetup() {
  const { user, settings, updateSettings, activateManualPlan } = useAppStore()
  const onboarding = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }
  const billingSetup = getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || DEFAULT_SETTINGS.billingProviderSetup!)
  const agencyEnterpriseEnabled = Boolean(onboarding.agencyEnterpriseEnabled)
  const [selectedPlan, setSelectedPlan] = useState<PlanName>((onboarding.selectedPlan === 'Free Demo' ? 'Free' : onboarding.selectedPlan) || 'Free')
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>('monthly')
  const [message, setMessage] = useState('')
  const selectedPaymentLink = selectedPlan === 'Free'
    ? ''
    : getPlanPaymentLink(billingSetup, selectedPlan as PaidPlan, billingFrequency)
  const paymentSetupReady =
    ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || '')) &&
    isValidPaymentUrl(selectedPaymentLink)
  const selectedPaidPlanReady = !['Free', 'Free Demo'].includes(selectedPlan) && paymentSetupReady
  const selectedPaidPlanNeedsSetup = selectedPlan === 'Starter' || selectedPlan === 'Pro'

  const continueButtonLabel = () => {
    if (selectedPlan === 'Free') return 'Enter Free'
    if (selectedPaidPlanReady) return 'Continue to Payment'
    if (selectedPaidPlanNeedsSetup) return 'Payment Setup Required'
    return 'Contact Support'
  }

  const completeSetup = (plan: PlanName, billingStatus: NonNullable<TrialState['billingStatus']>) => {
    activateManualPlan({
      plan,
      billingStatus,
      billingFrequency: plan === 'Free' ? 'monthly' : billingFrequency,
      paymentProvider: 'Stripe',
      billingPeriodStart: '',
      billingPeriodEnd: '',
      billingAdminNote: plan === 'Free'
        ? 'Selected Free during first-login setup.'
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

    if (selectedPlan === 'Free') {
      completeSetup('Free', 'Free Active')
      toast.success('Free plan selected. Welcome to Deal Blast Pro.')
      return
    }

    if (gatedPlan) {
      setMessage(`${selectedPlan} is visible for planning, but it is currently Contact Support / Coming Soon for this release.`)
      return
    }

    if (!paymentSetupReady) {
      setMessage('Payment setup is not active yet. Free is available now. Paid plans require support to finish billing setup first.')
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
            Free opens immediately. Paid plans open the saved Stripe payment link and remain Payment Pending until Stripe confirms payment.
          </div>
          <div className="mt-4 inline-flex rounded border border-[#252A38] p-1">
            <button onClick={() => setBillingFrequency('monthly')} className={`px-4 py-1 text-sm rounded ${billingFrequency === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
            <button onClick={() => setBillingFrequency('annual')} className={`px-4 py-1 text-sm rounded ${billingFrequency === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
          </div>
          <div className="mt-2 text-xs text-[#8B92A3]">Annual plans save 2 months compared to monthly billing.</div>
          <div className="mt-2 text-xs font-medium text-[#FBBF24]">{LAUNCH_ANNUAL_PROMOTION_COPY}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {plans.map(plan => {
            const releaseActive = plan.activeRelease || agencyEnterpriseEnabled
            const selected = selectedPlan === plan.name
            const priceDisplay = getPriceDisplay(plan.name, billingFrequency)
            return (
              <button
                key={plan.name}
                type="button"
                onClick={() => setSelectedPlan(plan.name as PricingPlanName)}
                className={`text-left rounded border p-4 bg-[#0F111A] transition min-h-[250px] overflow-hidden ${selected ? 'border-[#22C55E] ring-1 ring-[#22C55E]/40' : 'border-[#252A38] hover:border-[#3B82F6]/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-lg">{plan.name}</div>
                  {plan.badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22C55E] text-black">Popular</span>}
                </div>
                <div className="mt-2 text-2xl font-semibold">{priceDisplay.price}</div>
                <div className="mt-1 text-xs text-[#8B92A3]">
                  {priceDisplay.noteLines.map(line => <div key={line}>{line}</div>)}
                </div>
                <div className="mt-2 text-sm text-[#8B92A3] min-h-[4.5rem] break-words">{plan.description}</div>
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
