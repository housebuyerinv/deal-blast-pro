export type CreditPack = { key: string; credits: number; amountCents: number; stripePriceId: string }

const DEFAULTS = [
  { key: 'credits_10', credits: 10, amountCents: 800 },
  { key: 'credits_25', credits: 25, amountCents: 1500 },
  { key: 'credits_100', credits: 100, amountCents: 4900 },
  { key: 'credits_250', credits: 250, amountCents: 9900 },
]

export function readCreditPacks(env: Record<string, string | undefined> = process.env): CreditPack[] {
  let configured: any[] = []
  try { configured = JSON.parse(String(env.PROPERTY_INTELLIGENCE_CREDIT_PACKS_JSON || '[]')) } catch { configured = [] }
  return DEFAULTS.map(fallback => {
    const override = configured.find(item => String(item?.key) === fallback.key) || {}
    const envKey = `STRIPE_PRICE_${fallback.key.toUpperCase()}`
    return {
      key: fallback.key,
      credits: Math.max(1, Number(override.credits) || fallback.credits),
      amountCents: Math.max(1, Number(override.amountCents) || fallback.amountCents),
      stripePriceId: String(override.stripePriceId || env[envKey] || '').trim(),
    }
  })
}

export function publicCreditPacks(env?: Record<string, string | undefined>) {
  return readCreditPacks(env).map(({ stripePriceId: _secretMapping, ...pack }) => ({ ...pack, checkoutReady: Boolean(_secretMapping) }))
}
