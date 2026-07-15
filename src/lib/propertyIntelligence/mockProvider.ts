import type {
  AddressSearchResult,
  ComparableRecord,
  CompFilters,
  MarketLocation,
  MarketSummary,
  NormalizedAddress,
  OwnerRecord,
  PropertyDataProvider,
  PropertyHistoryRecord,
  PropertyRecord,
  PropertyListing,
  PropertyValuation,
  RentValuation,
} from './types'

const sampleAddress: NormalizedAddress = {
  line1: '123 Sample Main St',
  city: 'Pittsburgh',
  state: 'PA',
  postalCode: '15222',
  county: 'Allegheny',
}

const updatedAt = '2026-07-11T00:00:00.000Z'

export const MOCK_PROPERTY_INTELLIGENCE_SAMPLE = {
  property: {
    propertyId: 'mock-property-123-main',
    address: sampleAddress,
    county: 'Allegheny',
    parcelId: 'SAMPLE-001-234',
    propertyType: 'Single Family',
    beds: 3,
    baths: 2,
    livingAreaSqft: 1450,
    buildingAreaSqft: 1450,
    lotSizeSqft: 5200,
    yearBuilt: 1952,
    units: 1,
    stories: 2,
    roofType: 'Asphalt shingle',
    foundation: 'Basement',
    heating: 'Forced air',
    cooling: 'Central',
    taxAssessment: 138000,
    taxAmount: 3210,
    estimatedValue: 224000,
    lastSaleDate: '2023-08-14',
    lastSaleAmount: 178000,
    estimatedMortgageBalance: 142000,
    estimatedEquity: 82000,
    source: 'Mock Property Intelligence Provider',
    lastUpdated: updatedAt,
    sampleData: true,
  } satisfies PropertyRecord,
  owner: {
    propertyId: 'mock-property-123-main',
    ownerName: 'Sample Owner LLC',
    ownershipEntity: 'LLC',
    mailingAddress: 'PO Box 100, Pittsburgh, PA 15222',
    ownerOccupied: false,
    absenteeOwner: true,
    yearsOwned: 3,
    portfolioPropertyCount: 4,
    ownershipTransferDate: '2023-08-14',
    source: 'Mock Property Intelligence Provider',
    lastUpdated: updatedAt,
    sampleData: true,
  } satisfies OwnerRecord,
  comps: [
    {
      id: 'mock-comp-1',
      propertyId: 'mock-property-123-main',
      address: { ...sampleAddress, line1: '119 Sample Main St' },
      salePrice: 235000,
      saleDate: '2026-03-18',
      livingAreaSqft: 1500,
      propertyType: 'Single Family',
      beds: 3,
      baths: 2,
      distanceMiles: 0.2,
      source: 'Mock Property Intelligence Provider',
      lastUpdated: updatedAt,
      sampleData: true,
    },
    {
      id: 'mock-comp-2',
      propertyId: 'mock-property-123-main',
      address: { ...sampleAddress, line1: '210 Sample Ave' },
      salePrice: 219000,
      saleDate: '2026-04-04',
      livingAreaSqft: 1390,
      propertyType: 'Single Family',
      beds: 3,
      baths: 1.5,
      distanceMiles: 0.5,
      source: 'Mock Property Intelligence Provider',
      lastUpdated: updatedAt,
      sampleData: true,
    },
  ] satisfies ComparableRecord[],
  history: [
    {
      propertyId: 'mock-property-123-main',
      eventType: 'Sale',
      recordDate: '2023-08-14',
      summary: 'Sample sale record. Verify with an authorized source before customer use.',
      amount: 178000,
      source: 'Mock Property Intelligence Provider',
      confidence: 'Medium',
      lastUpdated: updatedAt,
      sampleData: true,
    },
    {
      propertyId: 'mock-property-123-main',
      eventType: 'Tax',
      recordDate: '2026-01-01',
      summary: 'Sample tax assessment. This is not real public-record data.',
      amount: 138000,
      source: 'Mock Property Intelligence Provider',
      confidence: 'Low',
      lastUpdated: updatedAt,
      sampleData: true,
    },
  ] satisfies PropertyHistoryRecord[],
  market: {
    location: { city: 'Pittsburgh', state: 'PA', postalCode: '15222' },
    geographicLevel: 'ZIP',
    reportingPeriod: 'Sample 90-day period',
    medianSalePrice: 229000,
    medianPricePerSqft: 158,
    averageDaysOnMarket: 24,
    recentSaleVolume: 18,
    activeInventory: 11,
    monthsOfSupply: 1.8,
    priceTrend: 'Sample stable trend',
    rentEstimateRange: '$1,650 - $1,950',
    vacancyIndicators: 'Sample moderate',
    source: 'Mock Property Intelligence Provider',
    lastUpdated: updatedAt,
    sampleData: true,
  } satisfies MarketSummary,
  saleEstimate: {
    propertyId: 'mock-property-123-main',
    address: sampleAddress,
    value: 224000,
    valueLow: 210000,
    valueHigh: 238000,
    confidence: 0.72,
    comparableCount: 2,
    source: 'Mock Property Intelligence Provider',
    lastUpdated: updatedAt,
    sampleData: true,
  } satisfies PropertyValuation,
  rentEstimate: {
    propertyId: 'mock-property-123-main',
    address: sampleAddress,
    rent: 1800,
    rentLow: 1650,
    rentHigh: 1950,
    confidence: 0.7,
    comparableCount: 2,
    source: 'Mock Property Intelligence Provider',
    lastUpdated: updatedAt,
    sampleData: true,
  } satisfies RentValuation,
  listings: [
    {
      id: 'mock-listing-1',
      address: { ...sampleAddress, line1: '141 Sample Main St' },
      listingType: 'Sale',
      status: 'Active',
      price: 229000,
      propertyType: 'Single Family',
      beds: 3,
      baths: 2,
      livingAreaSqft: 1480,
      listedDate: '2026-07-01',
      source: 'Mock Property Intelligence Provider',
      lastUpdated: updatedAt,
      sampleData: true,
    },
  ] satisfies PropertyListing[],
}

export class MockPropertyDataProvider implements PropertyDataProvider {
  providerName = 'Mock Property Intelligence Provider'

  async searchAddress(query: string): Promise<AddressSearchResult[]> {
    if (!query.trim()) return []
    return [{ id: 'mock-property-123-main', address: sampleAddress, providerName: this.providerName, confidence: 0.92 }]
  }

  async getProperty(): Promise<PropertyRecord> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.property
  }

  async getOwner(): Promise<OwnerRecord> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.owner
  }

  async getComps(_propertyId: string, _filters: CompFilters): Promise<ComparableRecord[]> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.comps
  }

  async getHistory(): Promise<PropertyHistoryRecord[]> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.history
  }

  async getMarket(_location: MarketLocation): Promise<MarketSummary> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.market
  }

  async getSaleEstimate(): Promise<PropertyValuation> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.saleEstimate
  }

  async getRentEstimate(): Promise<RentValuation> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.rentEstimate
  }

  async getListings(): Promise<PropertyListing[]> {
    return MOCK_PROPERTY_INTELLIGENCE_SAMPLE.listings
  }
}
