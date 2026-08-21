import type { TrialState } from './types'

export type PricingPlanName = Exclude<TrialState['plan'], 'Free Demo'>

export type PlanPricing = {
  name: PricingPlanName
  monthlyCents: number | null
  annualCents: number | null
  monthlyLabel: string
  description: string
  cta: string
  to: string
  releaseStatus?: string
  highlight?: boolean
  badge?: string
  activeRelease: boolean
}

export const PLAN_PRICING: Record<PricingPlanName, PlanPricing> = {
  Free: {
    name: 'Free',
    monthlyCents: 0,
    annualCents: 0,
    monthlyLabel: '$0/mo',
    description: 'For limited public submission access and exploring Deal Blast Pro.',
    cta: 'Start Free',
    to: '/register?plan=free',
    activeRelease: true,
  },
  Starter: {
    name: 'Starter',
    monthlyCents: 4700,
    annualCents: 47000,
    monthlyLabel: '$47/mo',
    description: 'For solo wholesalers and investors who need organized deal and buyer management.',
    cta: 'Get Starter',
    to: '/register?plan=starter',
    activeRelease: true,
  },
  Pro: {
    name: 'Pro',
    monthlyCents: 9700,
    annualCents: 97000,
    monthlyLabel: '$97/mo',
    description: 'For active operators who need buyer matching, deal blasts, advanced calculators, Property Intelligence, and stronger follow-up tools.',
    cta: 'Start 14-Day Trial',
    to: '/register?plan=pro&trial=14',
    highlight: true,
    badge: 'Most Popular',
    activeRelease: true,
  },
  Agency: {
    name: 'Agency',
    monthlyCents: 19700,
    annualCents: 197000,
    monthlyLabel: '$197/mo',
    description: 'For teams managing higher deal volume, shared buyer activity, and multiple users.',
    cta: 'Contact Admin',
    to: '/contact',
    releaseStatus: 'Coming Soon / Contact Admin',
    activeRelease: false,
  },
  Enterprise: {
    name: 'Enterprise',
    monthlyCents: null,
    annualCents: null,
    monthlyLabel: 'Custom pricing',
    description: 'For custom onboarding, higher-volume workflows, integrations, and tailored support.',
    cta: 'Contact Sales',
    to: '/contact',
    releaseStatus: 'Coming Soon / Contact Sales',
    activeRelease: false,
  },
}

export const PRICING_PLAN_ORDER: PricingPlanName[] = ['Free', 'Starter', 'Pro', 'Agency', 'Enterprise']
export const PAID_PRICING_PLAN_ORDER: Exclude<PricingPlanName, 'Free'>[] = ['Starter', 'Pro', 'Agency', 'Enterprise']

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function dollars(cents: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100)
}

export function getMonthlyPriceLabel(planName: PricingPlanName) {
  return PLAN_PRICING[planName].monthlyLabel
}

export function getAnnualMonthlyEquivalentLabel(planName: PricingPlanName) {
  const plan = PLAN_PRICING[planName]
  if (plan.name === 'Free') return '$0/mo'
  if (plan.annualCents === null) return 'Custom pricing'
  return `${currency.format(plan.annualCents / 1200)}/mo`
}

export function getAnnualBillingLabel(planName: PricingPlanName) {
  const plan = PLAN_PRICING[planName]
  if (plan.name === 'Free') return 'No annual billing'
  if (plan.annualCents === null) return 'Contact Sales'
  return `${dollars(plan.annualCents)} billed annually`
}

export function getAnnualSavingsLabel(planName: PricingPlanName) {
  const plan = PLAN_PRICING[planName]
  if (plan.monthlyCents === null || plan.annualCents === null || plan.name === 'Free') return ''
  const savings = plan.monthlyCents * 12 - plan.annualCents
  return savings > 0 ? `Save ${dollars(savings)} per year` : ''
}

export function getPriceDisplay(planName: PricingPlanName, billing: 'monthly' | 'annual') {
  if (billing === 'monthly') {
    return {
      price: getMonthlyPriceLabel(planName),
      noteLines: planName === 'Enterprise' ? ['Contact Sales'] : ['monthly plan'],
    }
  }

  const savings = getAnnualSavingsLabel(planName)
  return {
    price: getAnnualMonthlyEquivalentLabel(planName),
    noteLines: [getAnnualBillingLabel(planName), savings].filter(Boolean),
  }
}

export const LAUNCH_ANNUAL_PROMOTION_COPY =
  'Launch offer: Save an additional 10% on your first annual payment for Pro and higher annual plans through January 1, 2027.'

export const LAUNCH_ANNUAL_PROMOTION_FALLBACK_COPY =
  'Launch pricing will be applied to eligible early-access annual accounts. Available for eligible Pro annual purchases. Contact us about higher-volume annual plans.'

export const LAUNCH_ANNUAL_PROMOTION = {
  enabled: true,
  code: 'LAUNCH10',
  discountLabel: '10%',
  expiresAt: '2027-01-02T04:59:59.999Z',
  eligiblePlans: ['Pro', 'Agency', 'Enterprise'] as PricingPlanName[],
  firstPaymentOnly: true,
} as const

export function isLaunchAnnualPromotionActive(now = new Date()) {
  return LAUNCH_ANNUAL_PROMOTION.enabled && now.getTime() <= new Date(LAUNCH_ANNUAL_PROMOTION.expiresAt).getTime()
}

export function canShowLaunchAnnualPromotion(planName: PricingPlanName, billing: 'monthly' | 'annual', now = new Date()) {
  if (billing !== 'annual') return false
  if (!isLaunchAnnualPromotionActive(now)) return false
  if (!LAUNCH_ANNUAL_PROMOTION.eligiblePlans.includes(planName)) return false
  if (planName === 'Enterprise' && PLAN_PRICING.Enterprise.annualCents === null) return false
  return true
}

export function getLaunchAnnualPromotionCodeForCheckout(planName: PricingPlanName, billing: 'monthly' | 'annual', now = new Date()) {
  return canShowLaunchAnnualPromotion(planName, billing, now) ? LAUNCH_ANNUAL_PROMOTION.code : ''
}
