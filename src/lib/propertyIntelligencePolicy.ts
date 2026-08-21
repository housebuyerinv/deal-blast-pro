export type PropertyIntelligencePlan = 'Free' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'

export const PROPERTY_INTELLIGENCE_INCLUDED_CREDITS: Record<PropertyIntelligencePlan, number | null> = {
  Free: 0,
  Starter: 20,
  Pro: 50,
  Agency: 150,
  Enterprise: null,
}

export const PROPERTY_INTELLIGENCE_CREDIT_PACKS = [
  { key: 'credits_10', credits: 10, amountCents: 800 },
  { key: 'credits_25', credits: 25, amountCents: 1500 },
  { key: 'credits_100', credits: 100, amountCents: 4900 },
  { key: 'credits_250', credits: 250, amountCents: 9900 },
] as const

export const PROPERTY_INTELLIGENCE_PLAN_COMPARISON_LABELS = [
  '0 included credits',
  '20 lookups per month',
  '50 lookups/month with paid Pro',
  '150 lookups per month',
  'Contract-specific',
] as const

export function normalizePropertyIntelligencePlan(plan: unknown): PropertyIntelligencePlan {
  const normalized = String(plan || '').trim().toLowerCase()
  if (normalized === 'starter') return 'Starter'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'agency') return 'Agency'
  if (normalized === 'enterprise') return 'Enterprise'
  return 'Free'
}

export function getIncludedPropertyIntelligenceCredits(plan: unknown, enterpriseCredits?: number | null) {
  const normalized = normalizePropertyIntelligencePlan(plan)
  if (normalized === 'Enterprise') return Math.max(0, Number(enterpriseCredits) || 0)
  return PROPERTY_INTELLIGENCE_INCLUDED_CREDITS[normalized] || 0
}

export function getPropertyIntelligenceTierPoint(plan: unknown) {
  const normalized = normalizePropertyIntelligencePlan(plan)
  if (normalized === 'Free') return 'No included Property Intelligence credits'
  if (normalized === 'Enterprise') return 'Contract-specific Property Intelligence credits'
  if (normalized === 'Pro') return '50 Property Intelligence lookups/month with paid Pro'
  return `${getIncludedPropertyIntelligenceCredits(normalized)} Property Intelligence lookups monthly`
}
