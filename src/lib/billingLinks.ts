import type { TrialState } from './types'
import { getLaunchAnnualPromotionCodeForCheckout } from './planPricing'

export type BillingFrequency = 'monthly' | 'annual'
export type PaidPlan = Exclude<TrialState['plan'], 'Free' | 'Free Demo'>

export const billingLinkFields: Record<PaidPlan, Record<BillingFrequency, string>> = {
  Starter: {
    monthly: 'starterMonthlyPaymentLink',
    annual: 'starterAnnualPaymentLink',
  },
  Pro: {
    monthly: 'proMonthlyPaymentLink',
    annual: 'proAnnualPaymentLink',
  },
  Agency: {
    monthly: 'agencyMonthlyPaymentLink',
    annual: 'agencyAnnualPaymentLink',
  },
  Enterprise: {
    monthly: 'enterpriseMonthlyPaymentLink',
    annual: 'enterpriseAnnualPaymentLink',
  },
}

export const billingLinkLabels: Record<PaidPlan, Record<BillingFrequency, string>> = {
  Starter: {
    monthly: 'Starter Monthly',
    annual: 'Starter Annual',
  },
  Pro: {
    monthly: 'Pro Monthly',
    annual: 'Pro Annual',
  },
  Agency: {
    monthly: 'Agency Monthly',
    annual: 'Agency Annual',
  },
  Enterprise: {
    monthly: 'Enterprise Monthly',
    annual: 'Enterprise Annual',
  },
}

export const launchPaymentLinkDefaults = {
  starterMonthlyPaymentLink: 'https://buy.stripe.com/3cI28sckN2w12scfDY4gg00',
  starterAnnualPaymentLink: 'https://buy.stripe.com/5kQ7sMesV1rXc2M0J44gg02',
  proMonthlyPaymentLink: 'https://buy.stripe.com/4gMfZigB36Mh8QAezU4gg01',
  proAnnualPaymentLink: 'https://buy.stripe.com/3cIeVeesV4E9eaUdvQ4gg03',
  agencyMonthlyPaymentLink: '',
  agencyAnnualPaymentLink: '',
  enterpriseMonthlyPaymentLink: '',
  enterpriseAnnualPaymentLink: '',
} as const

export function getBillingSetupWithLaunchDefaults<T extends Record<string, any> | undefined>(setup: T) {
  const merged: Record<string, any> = {
    ...(setup || {}),
  }

  Object.entries(launchPaymentLinkDefaults).forEach(([field, value]) => {
    if (!String(merged[field] || '').trim() && value) {
      merged[field] = value
    }
  })

  if (!String(merged.provider || '').trim()) merged.provider = 'Stripe'
  if (!String(merged.billingMode || '').trim() || merged.billingMode === 'Manual billing') merged.billingMode = 'Stripe Checkout Links'
  if (!String(merged.setupStatus || '').trim() || merged.setupStatus === 'Not Started' || merged.setupStatus === 'Ready for Manual Billing') {
    merged.setupStatus = 'Ready for Payment Collection'
  }

  return merged as NonNullable<T> & Record<string, any>
}

export function isValidPaymentUrl(value: string) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function getPlanPaymentLink(setup: any, plan: PaidPlan, frequency: BillingFrequency) {
  const field = billingLinkFields[plan][frequency]
  const specificLink = String(setup?.[field] || '').trim()
  if (specificLink) return specificLink

  return String(setup?.paymentLink || '').trim()
}

export function buildStripeCheckoutUrl(
  paymentLink: string,
  context: {
    userId?: string
    email?: string
    plan: PaidPlan
    billingFrequency: BillingFrequency
  }
) {
  const cleanLink = String(paymentLink || '').trim()
  if (!isValidPaymentUrl(cleanLink)) return cleanLink

  try {
    const url = new URL(cleanLink)
    const userId = String(context.userId || '').trim()
    const email = String(context.email || '').trim()

    if (email) url.searchParams.set('prefilled_email', email)
    if (userId) url.searchParams.set('client_reference_id', userId)

    // Stripe Payment Links may ignore custom query params, but these are safe
    // non-secret hints for webhook/customer-email fallback matching.
    if (userId) url.searchParams.set('dealBlastUserId', userId)
    url.searchParams.set('selectedPlan', context.plan)
    url.searchParams.set('billingFrequency', context.billingFrequency)
    const promoCode = getLaunchAnnualPromotionCodeForCheckout(context.plan, context.billingFrequency)
    if (promoCode) url.searchParams.set('prefilled_promo_code', promoCode)

    return url.toString()
  } catch {
    return cleanLink
  }
}
