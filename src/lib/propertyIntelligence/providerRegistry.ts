import type { PropertyDataProvider } from './types'
import { MockPropertyDataProvider } from './mockProvider'
import { RentCastPropertyDataProvider } from './providers/rentcastProvider'

export type PropertyIntelligenceLookupType =
  | 'property_facts'
  | 'owner_data'
  | 'automated_comps'
  | 'property_history'
  | 'market_data'
  | 'bulk_property_enrichment'
  | 'skip_trace'

export interface PropertyLookupUsageEvent {
  workspaceId: string
  userId: string
  normalizedAddress: string
  provider: string
  lookupType: PropertyIntelligenceLookupType
  timestamp: string
  success: boolean
  cacheHit: boolean
  billableUnits: number
  providerRequestId?: string
  errorCategory?: string
}

let activeProvider: PropertyDataProvider | null = null

export function getPropertyDataProvider() {
  return activeProvider
}

export function registerPropertyDataProvider(provider: PropertyDataProvider | null) {
  activeProvider = provider
}

export function getPreviewPropertyDataProvider() {
  return new MockPropertyDataProvider()
}

export function createPropertyDataProvider(providerName?: string): PropertyDataProvider | null {
  if (String(providerName || '').toLowerCase() === 'rentcast') return new RentCastPropertyDataProvider()
  return null
}

export function isPropertyIntelligenceConfigured() {
  return Boolean(activeProvider)
}
