import type {
  AddressSearchResult,
  ComparableRecord,
  CompFilters,
  ListingFilters,
  MarketLocation,
  MarketSummary,
  NormalizedAddress,
  OwnerRecord,
  PropertyDataProvider,
  PropertyHistoryRecord,
  PropertyListing,
  PropertyRecord,
  PropertyValuation,
  RentValuation,
} from '../types'

async function callPropertyIntelligence<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })

  const response = await fetch(`/api/property-intelligence/${action}?${search.toString()}`)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || 'Property Intelligence lookup failed')
  }

  return payload as T
}

function addressToParams(address: NormalizedAddress) {
  return {
    address: [address.line1, address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    city: address.city,
    state: address.state,
    zipCode: address.postalCode,
  }
}

export class RentCastPropertyDataProvider implements PropertyDataProvider {
  providerName = 'RentCast'

  async searchAddress(query: string): Promise<AddressSearchResult[]> {
    const payload = await callPropertyIntelligence<{ results: AddressSearchResult[] }>('search', { query })
    return payload.results || []
  }

  async getProperty(address: NormalizedAddress): Promise<PropertyRecord | null> {
    const payload = await callPropertyIntelligence<{ property: PropertyRecord | null }>('property', addressToParams(address))
    return payload.property || null
  }

  async getOwner(propertyId: string): Promise<OwnerRecord | null> {
    const payload = await callPropertyIntelligence<{ owner: OwnerRecord | null }>('owner', { propertyId })
    return payload.owner || null
  }

  async getComps(propertyId: string, filters: CompFilters = {}): Promise<ComparableRecord[]> {
    const payload = await callPropertyIntelligence<{ comps: ComparableRecord[] }>('comps', { propertyId, ...filters })
    return payload.comps || []
  }

  async getHistory(propertyId: string): Promise<PropertyHistoryRecord[]> {
    const payload = await callPropertyIntelligence<{ history: PropertyHistoryRecord[] }>('history', { propertyId })
    return payload.history || []
  }

  async getMarket(location: MarketLocation): Promise<MarketSummary | null> {
    const payload = await callPropertyIntelligence<{ market: MarketSummary | null }>('market', location)
    return payload.market || null
  }

  async getSaleEstimate(address: NormalizedAddress): Promise<PropertyValuation | null> {
    const payload = await callPropertyIntelligence<{ valuation: PropertyValuation | null }>('value', addressToParams(address))
    return payload.valuation || null
  }

  async getRentEstimate(address: NormalizedAddress): Promise<RentValuation | null> {
    const payload = await callPropertyIntelligence<{ rent: RentValuation | null }>('rent', addressToParams(address))
    return payload.rent || null
  }

  async getListings(filters: ListingFilters): Promise<PropertyListing[]> {
    const payload = await callPropertyIntelligence<{ listings: PropertyListing[] }>('listings', filters)
    return payload.listings || []
  }
}
