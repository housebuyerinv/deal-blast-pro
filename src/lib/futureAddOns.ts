export type FutureBuyerCapacityAddOn = {
  id: string
  label: string
  buyerCapacity: number
  status: 'coming_soon' | 'disabled'
}

export const BUYER_CAPACITY_ADD_ONS: FutureBuyerCapacityAddOn[] = [
  { id: 'buyer-capacity-250', label: '+250 buyers', buyerCapacity: 250, status: 'coming_soon' },
  { id: 'buyer-capacity-500', label: '+500 buyers', buyerCapacity: 500, status: 'coming_soon' },
  { id: 'buyer-capacity-1000', label: '+1,000 buyers', buyerCapacity: 1000, status: 'coming_soon' },
]

export const BUYER_CAPACITY_ADD_ONS_ENABLED = false

export function getEffectiveBuyerLimit(baseBuyerLimit: number | null, purchasedBuyerCapacity = 0) {
  if (baseBuyerLimit === null) return null
  return baseBuyerLimit + Math.max(0, Number(purchasedBuyerCapacity) || 0)
}
