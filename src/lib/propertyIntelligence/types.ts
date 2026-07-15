export interface NormalizedAddress {
  line1: string
  city: string
  state: string
  postalCode?: string
  county?: string
  latitude?: number
  longitude?: number
}

export interface AddressSearchResult {
  id: string
  address: NormalizedAddress
  providerName: string
  confidence: number
}

export interface PropertyRecord {
  propertyId: string
  address: NormalizedAddress
  county?: string
  parcelId?: string
  propertyType?: string
  beds?: number
  baths?: number
  livingAreaSqft?: number
  buildingAreaSqft?: number
  lotSizeSqft?: number
  yearBuilt?: number
  units?: number
  stories?: number
  constructionType?: string
  exteriorType?: string
  roofType?: string
  foundation?: string
  garage?: string
  basement?: string
  heating?: string
  cooling?: string
  pool?: string
  zoning?: string
  taxAssessment?: number
  taxAmount?: number
  marketValue?: number
  estimatedValue?: number
  lastSaleDate?: string
  lastSaleAmount?: number
  estimatedMortgageBalance?: number
  estimatedEquity?: number
  latitude?: number
  longitude?: number
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface OwnerRecord {
  propertyId: string
  ownerName?: string
  ownershipEntity?: string
  mailingAddress?: string
  ownerOccupied?: boolean
  absenteeOwner?: boolean
  yearsOwned?: number
  mailingState?: string
  portfolioPropertyCount?: number
  ownershipTransferDate?: string
  locked?: boolean
  lockReason?: string
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface CompFilters {
  distanceMiles?: number
  saleDateAfter?: string
  propertyType?: string
  minBeds?: number
  minBaths?: number
  minSqft?: number
  maxSqft?: number
  minSalePrice?: number
  maxSalePrice?: number
}

export interface ComparableRecord {
  id: string
  propertyId: string
  address: NormalizedAddress
  salePrice: number
  saleDate: string
  livingAreaSqft: number
  propertyType?: string
  beds?: number
  baths?: number
  distanceMiles?: number
  pricePerSqft?: number
  similarityScore?: number
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface PropertyHistoryRecord {
  propertyId: string
  eventType: 'Sale' | 'Transfer' | 'Mortgage' | 'Tax' | 'Listing' | 'Permit' | 'Lien' | 'Foreclosure' | 'Ownership'
  recordDate: string
  summary: string
  amount?: number
  source: string
  confidence?: 'High' | 'Medium' | 'Low'
  lastUpdated: string
  sampleData?: boolean
}

export interface MarketLocation {
  city?: string
  state?: string
  postalCode?: string
  county?: string
}

export interface MarketSummary {
  location: MarketLocation
  geographicLevel: 'City' | 'ZIP' | 'County' | 'Neighborhood' | 'State'
  reportingPeriod: string
  medianSalePrice?: number
  medianPricePerSqft?: number
  averageDaysOnMarket?: number
  recentSaleVolume?: number
  activeInventory?: number
  monthsOfSupply?: number
  priceTrend?: string
  medianRent?: number
  averageRent?: number
  activeRentalListings?: number
  rentEstimateRange?: string
  vacancyIndicators?: string
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface PropertyValuation {
  propertyId?: string
  address: NormalizedAddress
  value?: number
  valueLow?: number
  valueHigh?: number
  confidence?: number
  comparableCount?: number
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface RentValuation {
  propertyId?: string
  address: NormalizedAddress
  rent?: number
  rentLow?: number
  rentHigh?: number
  confidence?: number
  comparableCount?: number
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface ListingFilters {
  city?: string
  state?: string
  postalCode?: string
  status?: 'Active' | 'Inactive' | 'Any'
  listingType?: 'Sale' | 'Rental'
  propertyType?: string
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  minBaths?: number
  limit?: number
}

export interface PropertyListing {
  id: string
  address: NormalizedAddress
  listingType: 'Sale' | 'Rental'
  status?: string
  price?: number
  rent?: number
  propertyType?: string
  beds?: number
  baths?: number
  livingAreaSqft?: number
  listedDate?: string
  source: string
  lastUpdated: string
  sampleData?: boolean
}

export interface PropertyDataProvider {
  providerName: string
  searchAddress(query: string): Promise<AddressSearchResult[]>
  getProperty(address: NormalizedAddress): Promise<PropertyRecord | null>
  getOwner(propertyId: string): Promise<OwnerRecord | null>
  getComps(propertyId: string, filters: CompFilters): Promise<ComparableRecord[]>
  getHistory(propertyId: string): Promise<PropertyHistoryRecord[]>
  getMarket(location: MarketLocation): Promise<MarketSummary | null>
  getSaleEstimate?(address: NormalizedAddress): Promise<PropertyValuation | null>
  getRentEstimate?(address: NormalizedAddress): Promise<RentValuation | null>
  getListings?(filters: ListingFilters): Promise<PropertyListing[]>
}
