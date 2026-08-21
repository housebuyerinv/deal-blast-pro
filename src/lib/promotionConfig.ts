export const PRO_TRIAL_PROMOTION = {
  key: 'pro-trial-launch20-v1',
  version: 1,
  enabled: true,
  code: 'LAUNCH20',
  targetPlan: 'Pro',
  billingInterval: 'monthly',
  trialDays: 14,
  percentOff: 20,
  duration: 'once',
  expiresOn: '2026-12-31',
  firstTimeTransactionOnly: true,
  maximumRedemptions: null,
  minimumAmount: null,
  headline: 'Try Pro Free for 14 Days',
  firstPaidMonthDiscountDescription: '20% off your first paid month with LAUNCH20',
  loginModalEnabled: true,
  pricingPromotionEnabled: true,
} as const

export const PRO_TRIAL_INCLUDED_CREDIT_DISCLOSURE =
  'Included Property Intelligence credits activate with a paid subscription and are not included during the free trial.'
