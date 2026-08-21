import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../../lib/constants'
import { useAppStore } from '../../store/useAppStore'
import { DEFAULT_BILLING_INTERVAL, buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency } from '../../lib/billingLinks'
import LaunchPromoCode from '../../components/LaunchPromoCode'
import { supabase } from '../../lib/supabaseClient'
import { PRO_TRIAL_INCLUDED_CREDIT_DISCLOSURE, PRO_TRIAL_PROMOTION } from '../../lib/promotionConfig'
import {
  PAID_PRICING_PLAN_ORDER,
  PLAN_PRICING,
  getPriceDisplay,
} from '../../lib/planPricing'

type Plan = 'Starter' | 'Pro' | 'Agency' | 'Enterprise'

const plans = PAID_PRICING_PLAN_ORDER.map(name => PLAN_PRICING[name])

export default function Upgrade() {
  const { user, trial, settings, activateManualPlan } = useAppStore()
  const navigate = useNavigate()
  const [billing, setBilling] = useState<BillingFrequency>(DEFAULT_BILLING_INTERVAL)
  const [selected, setSelected] = useState<Plan>('Pro')
  const [step, setStep] = useState<'select' | 'payment' | 'contact' | 'setup'>('select')
  const [trialLoading, setTrialLoading] = useState(false)
  const [trialError, setTrialError] = useState('')

  const current = trial.plan === 'Free Demo' ? 'Free' : trial.plan || (trial.isPaid ? 'Pro' : 'Free')
  const isPaid = current !== 'Free'
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
  const currentPlanLabel = isPaid ? current : 'Free'
  const selectedPlanDetails = plans.find(pp => pp.name === selected)

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

  const startProTrial = async () => {
    setTrialLoading(true); setTrialError('')
    try {
      const { data } = await supabase.auth.getSession()
      const response = await fetch('/api/property-intelligence/pro-trial-checkout', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: '{}' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Pro trial checkout is unavailable.')
      window.location.assign(payload.url)
    } catch (error: any) { setTrialError(error?.message || 'Pro trial checkout is unavailable.') }
    finally { setTrialLoading(false) }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Upgrade Plan</div>
        <div className="text-[#8B92A3]">Current: <span className="text-white font-medium">{currentPlanLabel}</span> - Plan prices match Settings & Trial.</div>
      </div>

      {step === 'select' && (
        <>
          <div className="flex flex-col items-start gap-2 mb-4">
            <div className="inline-flex rounded border border-[#252A38] p-0.5">
              <button onClick={() => setBilling('monthly')} className={`px-3 py-1 text-sm rounded ${billing === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
              <button onClick={() => setBilling('annual')} className={`px-3 py-1 text-sm rounded ${billing === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
            </div>
            <div className="text-xs text-[#64748B]">Annual plans save 2 months compared to monthly billing.</div>
            <LaunchPromoCode billing={billing} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {plans.map(p => {
              const priceDisplay = getPriceDisplay(p.name, billing)
              return (
                <div
                  key={p.name}
                  onClick={() => setSelected(p.name as Plan)}
                  className={`card p-4 min-h-[230px] overflow-hidden cursor-pointer transition border ${selected === p.name ? 'border-[#22C55E] ring-1 ring-[#22C55E]/40' : 'border-[#252A38]'} ${p.badge ? 'ring-1 ring-[#22C55E]/30' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-lg">{p.name}</div>
                    {p.badge && <span className="text-[10px] px-1.5 py-0.5 bg-[#22C55E] text-black rounded">Most Popular</span>}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{priceDisplay.price}</div>
                  <div className="mt-1 text-xs text-[#8B92A3]">{priceDisplay.noteLines.map(line => <div key={line}>{line}</div>)}</div>
                  <div className="text-xs text-[#8B92A3] mt-1 min-h-[2.2em] break-words">{p.description}</div>
                  {!p.activeRelease && <div className="mt-1 text-amber-400 text-xs">{agencyEnterpriseEnabled ? 'Available by approval' : 'Coming Soon / Contact Support'}</div>}
                  {current === p.name && <div className="mt-1 text-emerald-400 text-xs">Current plan</div>}
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            {selected === 'Pro' && billing === 'monthly' && PRO_TRIAL_PROMOTION.enabled ? <button onClick={() => void startProTrial()} disabled={trialLoading} className="btn btn-green px-6">
              {trialLoading ? 'Opening Secure Checkout…' : 'Start 14-Day Trial'}
            </button> : <button onClick={goPayment} className="btn btn-green px-6">
              {(selected === 'Agency' || selected === 'Enterprise') && !agencyEnterpriseEnabled
                ? 'Contact Support'
                : paymentSetupReady
                  ? 'Continue to Payment'
                  : 'Payment Setup Required'}
            </button>}
            <button onClick={() => navigate(-1)} className="btn btn-ghost">Cancel</button>
            <button onClick={() => navigate('/app/settings')} className="text-sm text-[#8B92A3] underline ml-auto">Back to Settings</button>
          </div>
          {selected === 'Pro' && billing === 'monthly' && <div className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200"><div className="font-medium">Try Pro free for 14 days</div><div className="mt-1">Then get 20% off your first paid month with {PRO_TRIAL_PROMOTION.code}.</div><div className="mt-2 text-xs text-[#C5CAD6]">{PRO_TRIAL_INCLUDED_CREDIT_DISCLOSURE} Purchased credits remain usable.</div></div>}
          {trialError && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{trialError}</div>}
          <div className="mt-3 text-xs text-[#64748B]">Stripe checkout opens securely in a new tab. Existing records remain safe.</div>
        </>
      )}

      {step === 'payment' && (
        <div className="card p-6 max-w-md">
          <div className="text-xl font-semibold mb-2">Payment Pending - {selected}</div>
          <div className="text-sm text-[#8B92A3] mb-4">Complete payment through Stripe. Deal Blast Pro does not collect card, bank, routing, CVV, API key, OAuth token, or provider login credentials here.</div>
          <div className="text-sm mb-4">
            Plan: {selected} - {selectedPlanDetails ? getPriceDisplay(selectedPlanDetails.name, billing).noteLines.join(', ') : billing}
          </div>
          <div className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 p-3 text-sm mb-4">
            Your plan remains blocked while payment is pending. After Stripe confirms successful payment, Deal Blast Pro can activate paid access automatically.
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')} className="btn btn-green">Complete Payment</button>
            <button
              onClick={() => {
                activateManualPlan({
                  plan: 'Free',
                  billingStatus: 'Free Active',
                  billingFrequency: 'monthly',
                  paymentProvider: 'Stripe',
                  billingPeriodStart: '',
                  billingPeriodEnd: '',
                  billingAdminNote: 'User chose Free after pending Stripe checkout.',
                })
                navigate('/app/dashboard')
              }}
              className="btn btn-ghost"
            >
              Choose Free
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
            Payment setup is not active yet. Free is available now. Paid plans require support to finish billing setup first.
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
