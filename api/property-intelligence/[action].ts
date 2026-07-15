import { canUsePropertyIntelligence, getAuthenticatedAccount } from '../_accountAuth.js'

const RENTCAST_BASE_URL = 'https://api.rentcast.io/v1'
const CUSTOMER_SOURCE = 'Property Intelligence'
const UNAVAILABLE_MESSAGE = 'Property Intelligence is temporarily unavailable. Manual property analysis remains available.'
const COMPLETE_ADDRESS_MESSAGE = 'Select a complete address from the suggestions before loading Property Intelligence.'
const PRO_REQUIRED_MESSAGE = 'Property Intelligence is available on the Pro plan. Manual property analysis remains available on every plan.'
const HEALTH_CHECK_ADDRESS = '494 N McNeil St, Memphis, TN 38112'

const PLAN_RANK: Record<string, number> = {
  'free demo': 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
  'owner admin': 5,
}

let lastHealthCheck: { at: number; result: any } | null = null

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function clean(value: any) {
  return String(value || '').trim()
}

function readRuntimeConfig() {
  const enabledRaw = clean(process.env.PROPERTY_INTELLIGENCE_ENABLED).toLowerCase()
  const provider = clean(process.env.PROPERTY_INTELLIGENCE_PROVIDER).toLowerCase()
  const apiKey = clean(process.env.RENTCAST_API_KEY)
  return {
    enabled: enabledRaw === 'true',
    provider,
    apiKey,
    apiKeyPresent: apiKey.length > 0,
    apiKeyLength: apiKey.length,
    configured: enabledRaw === 'true' && provider === 'rentcast' && apiKey.length > 0,
  }
}

function internalEnabled(req: any) {
  return req.query.internal === 'true' || req.headers['x-dealblast-internal'] === 'true'
}

function publicConfig(config: ReturnType<typeof readRuntimeConfig>) {
  return {
    enabled: config.enabled,
    provider: config.provider || 'not_configured',
    apiKeyPresent: config.apiKeyPresent,
    apiKeyLength: config.apiKeyLength,
  }
}

function logDiagnostic(category: string, details: Record<string, any>) {
  console.warn('[Property Intelligence]', JSON.stringify({
    category,
    ...details,
    at: new Date().toISOString(),
  }))
}

function categorizeProviderError(status: number, payload: any, timeout = false) {
  const message = clean(payload?.message || payload?.error || payload?.detail)
  if (timeout) return 'provider_timeout'
  if (status === 400) return /address|parameter|invalid/i.test(message) ? 'address_incomplete' : 'provider_http_error'
  if (status === 401 || status === 403) {
    if (/billing|payment/i.test(message)) return 'provider_billing_issue'
    if (/subscription|inactive|plan/i.test(message)) return 'inactive_subscription'
    return 'invalid_api_key'
  }
  if (status === 404) return 'no_property_found'
  if (status === 429) return 'provider_rate_limit'
  if (status >= 500) return 'provider_http_error'
  return 'provider_schema_error'
}

function safeProviderSummary(payload: any) {
  if (!payload || typeof payload !== 'object') return { type: typeof payload }
  return {
    message: clean(payload.message || payload.error || payload.detail).slice(0, 240),
    keys: Object.keys(payload).slice(0, 12),
  }
}

function parseAddressParts(input: any) {
  const raw = clean(input)
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  const street = clean(parts[0])
  const city = clean(parts[1])
  const stateZip = clean(parts[2])
  const stateZipMatch = stateZip.match(/\b([A-Z]{2})\b(?:\s+(\d{5})(?:-\d{4})?)?/i)
  return {
    street,
    city,
    state: stateZipMatch?.[1]?.toUpperCase() || '',
    zipCode: stateZipMatch?.[2] || '',
  }
}

function normalizeLookupAddress(query: any) {
  const parsed = parseAddressParts(query.address || query.propertyId || '')
  const street = clean(query.street || query.line1 || parsed.street)
  const city = clean(query.city || parsed.city)
  const state = clean(query.state || parsed.state).toUpperCase()
  const zipCode = clean(query.zipCode || query.postalCode || query.zip || parsed.zipCode)
  const completeEnough = Boolean(street && city && state)
  return {
    street,
    city,
    state,
    zipCode,
    completeEnough,
    partial: completeEnough && !zipCode,
    fullAddress: [street, city, [state, zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  }
}

function normalizeAddress(record: any) {
  const fullAddress = clean(record?.formattedAddress || record?.address)
  const line1 = clean(record?.addressLine1 || record?.streetAddress || record?.line1 || fullAddress.split(',')[0])
  return {
    line1,
    city: clean(record?.city),
    state: clean(record?.state),
    postalCode: clean(record?.zipCode || record?.postalCode),
    county: clean(record?.county),
    latitude: record?.latitude || record?.lat,
    longitude: record?.longitude || record?.lng,
  }
}

function pickFirstRecord(payload: any) {
  const rows = Array.isArray(payload) ? payload : payload?.data || payload?.properties || []
  return Array.isArray(rows) ? rows[0] : null
}

function normalizeProperty(record: any) {
  if (!record) return null
  return {
    propertyId: clean(record.id || record.propertyId || record.formattedAddress || record.address),
    address: normalizeAddress(record),
    county: record.county,
    parcelId: record.assessorID || record.parcelId,
    propertyType: record.propertyType,
    beds: record.bedrooms,
    baths: record.bathrooms,
    livingAreaSqft: record.squareFootage,
    buildingAreaSqft: record.buildingArea,
    lotSizeSqft: record.lotSize,
    yearBuilt: record.yearBuilt,
    units: record.units,
    stories: record.stories,
    taxAssessment: record.assessor?.assessedValue,
    taxAmount: record.taxAssessments?.[0]?.taxAmount,
    marketValue: record.assessor?.marketValue || record.assessedValue,
    lastSaleDate: record.lastSaleDate,
    lastSaleAmount: record.lastSalePrice,
    latitude: record.latitude,
    longitude: record.longitude,
    zoning: record.zoning,
    subdivision: record.subdivision,
    constructionType: record.constructionType,
    exteriorType: record.exteriorType,
    roofType: record.roofType,
    foundation: record.foundation,
    garage: record.garage,
    basement: record.basement,
    heating: record.heating,
    cooling: record.cooling,
    pool: record.pool,
    source: CUSTOMER_SOURCE,
    lastUpdated: new Date().toISOString(),
  }
}

function normalizeOwner(record: any, includeSensitive: boolean) {
  if (!record) return null
  const owner = {
    propertyId: clean(record.id || record.propertyId || record.formattedAddress),
    ownershipEntity: record.owner?.type,
    ownerOccupied: record.ownerOccupied,
    absenteeOwner: record.absenteeOwner,
    yearsOwned: record.owner?.yearsOwned,
    ownershipTransferDate: record.lastSaleDate,
    mailingState: record.owner?.mailingAddress?.state,
    source: CUSTOMER_SOURCE,
    lastUpdated: new Date().toISOString(),
    locked: !includeSensitive,
    lockReason: includeSensitive ? undefined : 'Owner details require Pro or higher.',
  }
  if (!includeSensitive) return owner
  return {
    ...owner,
    ownerName: record.owner?.names?.join(', ') || record.ownerName,
    mailingAddress: record.owner?.mailingAddress?.formattedAddress || record.owner?.mailingAddress,
  }
}

function normalizeComp(record: any) {
  const salePrice = Number(record.price || record.salePrice || record.lastSalePrice || 0)
  const sqft = Number(record.squareFootage || record.livingAreaSqft || 0)
  return {
    id: clean(record.id || record.propertyId || record.formattedAddress || Math.random()),
    propertyId: clean(record.id || record.propertyId || record.formattedAddress),
    address: normalizeAddress(record),
    salePrice,
    saleDate: record.saleDate || record.lastSaleDate || '',
    livingAreaSqft: sqft,
    propertyType: record.propertyType,
    beds: record.bedrooms,
    baths: record.bathrooms,
    distanceMiles: record.distance,
    pricePerSqft: salePrice > 0 && sqft > 0 ? salePrice / sqft : undefined,
    similarityScore: record.correlation || record.similarity || record.confidence,
    source: CUSTOMER_SOURCE,
    lastUpdated: new Date().toISOString(),
  }
}

function normalizeListing(record: any, listingType: 'Sale' | 'Rental') {
  return {
    id: clean(record.id || record.listingId || record.formattedAddress || Math.random()),
    address: normalizeAddress(record),
    listingType,
    status: record.status,
    price: record.price,
    rent: record.rent,
    propertyType: record.propertyType,
    beds: record.bedrooms,
    baths: record.bathrooms,
    livingAreaSqft: record.squareFootage,
    listedDate: record.listedDate,
    source: CUSTOMER_SOURCE,
    lastUpdated: new Date().toISOString(),
  }
}

function normalizeHistory(record: any) {
  const rows = []
  if (record?.lastSaleDate || record?.lastSalePrice) {
    rows.push({
      propertyId: clean(record.id || record.propertyId || record.formattedAddress),
      eventType: 'Sale',
      recordDate: record.lastSaleDate || '',
      summary: 'Last recorded sale',
      amount: record.lastSalePrice,
      source: CUSTOMER_SOURCE,
      lastUpdated: new Date().toISOString(),
    })
  }
  const tax = Array.isArray(record?.taxAssessments) ? record.taxAssessments[0] : null
  if (tax?.taxAmount || tax?.year) {
    rows.push({
      propertyId: clean(record.id || record.propertyId || record.formattedAddress),
      eventType: 'Tax',
      recordDate: String(tax.year || ''),
      summary: 'Tax assessment record',
      amount: tax.taxAmount,
      source: CUSTOMER_SOURCE,
      lastUpdated: new Date().toISOString(),
    })
  }
  return rows
}

function canAccessOwnerDetails(plan: string) {
  return (PLAN_RANK[clean(plan).toLowerCase()] ?? 0) >= PLAN_RANK.pro
}

async function rentcast(endpoint: string, params: Record<string, any>, config: ReturnType<typeof readRuntimeConfig>) {
  const url = new URL(`${RENTCAST_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  const started = Date.now()
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': config.apiKey,
    },
  })
  const responseText = await response.text()
  let payload: any = responseText
  try { payload = responseText ? JSON.parse(responseText) : null } catch {}

  if (!response.ok) {
    const category = categorizeProviderError(response.status, payload)
    logDiagnostic(category, {
      endpoint,
      httpStatus: response.status,
      responseMs: Date.now() - started,
      safeResponse: safeProviderSummary(payload),
      requestAddress: params.address,
    })
    throw Object.assign(new Error(clean(payload?.message || payload?.error) || `Provider request failed with ${response.status}`), {
      status: response.status,
      category,
      payload,
      endpoint,
    })
  }

  return { payload, httpStatus: response.status, responseMs: Date.now() - started, endpoint: url.pathname, url: url.toString() }
}

async function getPropertyRecord(address: string, config: ReturnType<typeof readRuntimeConfig>) {
  const result = await rentcast('/properties', { address, limit: 1 }, config)
  const row = pickFirstRecord(result.payload)
  if (!row) {
    logDiagnostic('no_property_found', { endpoint: '/properties', httpStatus: result.httpStatus, requestAddress: address })
    throw Object.assign(new Error('No matching property record.'), {
      status: 404,
      category: 'no_property_found',
      endpoint: '/properties',
    })
  }
  return { row, ...result }
}

async function providerHealth(config: ReturnType<typeof readRuntimeConfig>, force = false) {
  if (!force && lastHealthCheck && Date.now() - lastHealthCheck.at < 5 * 60 * 1000) return lastHealthCheck.result
  if (!config.configured) {
    return {
      connected: false,
      category: 'provider_not_configured',
      config: publicConfig(config),
    }
  }
  try {
    const result = await getPropertyRecord(HEALTH_CHECK_ADDRESS, config)
    const health = {
      connected: true,
      category: 'ok',
      httpStatus: result.httpStatus,
      responseMs: result.responseMs,
      propertyRecordReturned: true,
      subscriptionActive: true,
      config: publicConfig(config),
    }
    lastHealthCheck = { at: Date.now(), result: health }
    return health
  } catch (error: any) {
    const health = {
      connected: false,
      category: error?.category || 'provider_http_error',
      httpStatus: error?.status || 500,
      propertyRecordReturned: false,
      subscriptionActive: false,
      config: publicConfig(config),
    }
    lastHealthCheck = { at: Date.now(), result: health }
    return health
  }
}

function customerError(error: any) {
  if (error?.category === 'address_incomplete') return COMPLETE_ADDRESS_MESSAGE
  if (error?.category === 'no_property_found') return 'Property data is unavailable for this address.'
  return UNAVAILABLE_MESSAGE
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return send(res, 405, { error: 'Method not allowed' })
  }

  const action = clean(req.query.action)
  const config = readRuntimeConfig()
  const internal = internalEnabled(req)
  let account: Awaited<ReturnType<typeof getAuthenticatedAccount>>

  try {
    account = await getAuthenticatedAccount(req)
  } catch (error: any) {
    return send(res, Number(error?.status || 401), {
      error: error?.message || 'Sign in is required.',
      code: error?.code || 'auth_required',
    })
  }

  if (account.deactivated) {
    return send(res, 403, {
      error: 'This account has been deactivated.',
      code: 'account_deactivated',
      status: 'Account Deactivated',
    })
  }

  if (!canUsePropertyIntelligence(account)) {
    return send(res, 403, {
      error: PRO_REQUIRED_MESSAGE,
      code: 'pro_required',
      status: 'Pro Required',
      propertyDataConnected: false,
      diagnostics: internal ? {
        planName: account.planName,
        billingStatus: account.billingStatus,
        ownerAdmin: account.isOwnerAdmin,
      } : undefined,
    })
  }

  if (action === 'status') {
    const health = await providerHealth(config, req.query.force === 'true')
    return send(res, health.connected ? 200 : 503, {
      configured: config.configured,
      propertyDataConnected: health.connected,
      status: !config.configured ? 'Temporarily Unavailable' : health.connected ? 'Property Data Connected' : 'Connection Error',
      label: CUSTOMER_SOURCE,
      error: health.connected ? undefined : UNAVAILABLE_MESSAGE,
      diagnostics: internal ? health : undefined,
    })
  }

  if (!config.configured) {
    logDiagnostic('provider_not_configured', { config: publicConfig(config) })
    return send(res, 503, {
      error: UNAVAILABLE_MESSAGE,
      configured: false,
      diagnostics: internal ? { category: 'provider_not_configured', config: publicConfig(config) } : undefined,
    })
  }

  try {
    if (action === 'autocomplete') {
      return send(res, 501, {
        error: 'Address autocomplete is not configured. Enter a complete property address manually.',
        autocompleteConfigured: false,
        diagnostics: internal ? { category: 'provider_not_configured', missing: 'autocomplete_provider' } : undefined,
      })
    }

    if (action === 'search') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) {
        throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      }
      const result = await getPropertyRecord(lookup.fullAddress, config)
      const address = normalizeAddress(result.row)
      return send(res, 200, {
        results: [{
          id: clean(result.row.id || result.row.formattedAddress || lookup.fullAddress),
          address,
          confidence: 0.95,
          label: [address.line1, address.city, address.state, address.postalCode].filter(Boolean).join(', '),
          source: CUSTOMER_SOURCE,
        }],
        normalizedAddressSent: lookup.fullAddress,
        partialAddressRequest: lookup.partial,
      })
    }

    if (action === 'property' || action === 'owner' || action === 'history') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) {
        throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      }
      if (lookup.partial) {
        logDiagnostic('address_incomplete', {
          safeResponse: { message: 'ZIP missing; attempting street/city/state lookup.' },
          requestAddress: lookup.fullAddress,
        })
      }
      const result = await getPropertyRecord(lookup.fullAddress, config)
      if (action === 'owner') return send(res, 200, { owner: normalizeOwner(result.row, canAccessOwnerDetails(account.isOwnerAdmin ? 'Owner Admin' : account.planName)), normalizedAddressSent: lookup.fullAddress })
      if (action === 'history') return send(res, 200, { history: normalizeHistory(result.row), normalizedAddressSent: lookup.fullAddress })
      return send(res, 200, { property: normalizeProperty(result.row), normalizedAddressSent: lookup.fullAddress })
    }

    if (action === 'value') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      const result = await rentcast('/avm/value', { address: lookup.fullAddress }, config)
      const value = result.payload
      return send(res, 200, {
        valuation: {
          address: normalizeAddress(value),
          value: value.price || value.value,
          valueLow: value.priceRangeLow || value.valueLow,
          valueHigh: value.priceRangeHigh || value.valueHigh,
          confidence: value.confidenceScore || value.confidence,
          comparableCount: Array.isArray(value.comparables) ? value.comparables.length : undefined,
          source: CUSTOMER_SOURCE,
          lastUpdated: new Date().toISOString(),
        },
        normalizedAddressSent: lookup.fullAddress,
      })
    }

    if (action === 'rent') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      const result = await rentcast('/avm/rent/long-term', { address: lookup.fullAddress }, config)
      const rent = result.payload
      return send(res, 200, {
        rent: {
          address: normalizeAddress(rent),
          rent: rent.rent || rent.price,
          rentLow: rent.rentRangeLow || rent.priceRangeLow,
          rentHigh: rent.rentRangeHigh || rent.priceRangeHigh,
          confidence: rent.confidenceScore || rent.confidence,
          comparableCount: Array.isArray(rent.comparables) ? rent.comparables.length : undefined,
          source: CUSTOMER_SOURCE,
          lastUpdated: new Date().toISOString(),
        },
        normalizedAddressSent: lookup.fullAddress,
      })
    }

    if (action === 'comps') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      const result = await rentcast('/avm/value', { address: lookup.fullAddress }, config)
      return send(res, 200, { comps: (result.payload.comparables || []).map(normalizeComp), normalizedAddressSent: lookup.fullAddress })
    }

    if (action === 'listings') {
      const endpoint = req.query.listingType === 'Rental' ? '/listings/rental/long-term' : '/listings/sale'
      const result = await rentcast(endpoint, {
        city: req.query.city,
        state: req.query.state,
        zipCode: req.query.postalCode || req.query.zipCode,
        propertyType: req.query.propertyType,
        limit: req.query.limit || 25,
      }, config)
      const rows = Array.isArray(result.payload) ? result.payload : result.payload?.data || []
      return send(res, 200, { listings: rows.map((row: any) => normalizeListing(row, endpoint.includes('rental') ? 'Rental' : 'Sale')) })
    }

    if (action === 'market') {
      const zipCode = clean(req.query.postalCode || req.query.zipCode)
      if (!zipCode) throw Object.assign(new Error('Market lookup requires ZIP code.'), { status: 400, category: 'address_incomplete' })
      const result = await rentcast('/markets', { zipCode }, config)
      const market = result.payload
      return send(res, 200, {
        market: {
          location: { city: market.city, state: market.state, postalCode: market.zipCode },
          geographicLevel: 'ZIP',
          reportingPeriod: market.lastUpdatedDate || new Date().toISOString().slice(0, 10),
          medianSalePrice: market.saleData?.medianPrice,
          medianPricePerSqft: market.saleData?.medianPricePerSquareFoot,
          averageDaysOnMarket: market.saleData?.averageDaysOnMarket,
          activeInventory: market.saleData?.activeListings,
          medianRent: market.rentalData?.medianRent,
          averageRent: market.rentalData?.averageRent,
          activeRentalListings: market.rentalData?.activeListings,
          rentEstimateRange: market.rentalData?.medianRent ? `$${Number(market.rentalData.medianRent).toLocaleString()}` : undefined,
          source: CUSTOMER_SOURCE,
          lastUpdated: new Date().toISOString(),
        },
      })
    }

    return send(res, 404, { error: 'Unknown Property Intelligence action' })
  } catch (error: any) {
    const status = Number(error?.status || 500)
    const category = error?.category || categorizeProviderError(status, error?.payload)
    logDiagnostic(category, {
      endpoint: error?.endpoint || action,
      httpStatus: status,
      safeResponse: safeProviderSummary(error?.payload || { message: error?.message }),
      requestAddress: req.query.address || req.query.propertyId,
    })
    return send(res, status >= 400 && status < 600 ? status : 500, {
      error: customerError({ ...error, category }),
      diagnostics: internal ? {
        category,
        httpStatus: status,
        safeResponse: safeProviderSummary(error?.payload || { message: error?.message }),
        config: publicConfig(config),
      } : undefined,
    })
  }
}
