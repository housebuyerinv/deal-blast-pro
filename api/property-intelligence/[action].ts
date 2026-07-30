import { canUsePropertyIntelligence, getAuthenticatedAccount } from '../_accountAuth.js'
import {
  buildGeoapifyAutocompleteUrl,
  categorizeGeoapifyStatus,
  isGeoapifyAutocompletePayload,
  parseGeoapifyAutocompletePayload,
  readGeoapifyConfig,
} from '../_geoapify.js'

const RENTCAST_BASE_URL = 'https://api.rentcast.io/v1'
const CUSTOMER_SOURCE = 'Property Intelligence'
const UNAVAILABLE_MESSAGE = 'Property Intelligence is temporarily unavailable. Manual property analysis remains available.'
const COMPLETE_ADDRESS_MESSAGE = 'Select a complete address from the suggestions before loading Property Intelligence.'
const PRO_REQUIRED_MESSAGE = 'Property Intelligence is available on the Pro plan. Manual property analysis remains available on every plan.'
const PROVIDER_NOT_CONFIGURED_MESSAGE = 'Property Intelligence provider is not configured yet. Manual property analysis remains available.'
const PROVIDER_UNAVAILABLE_MESSAGE = 'The property-data provider is temporarily unavailable.'
const RATE_LIMIT_MESSAGE = 'Property Intelligence is receiving too many requests. Please wait a moment and try again.'
const TIMEOUT_MESSAGE = 'Property Intelligence timed out. Please try again.'
const HEALTH_CHECK_ADDRESS = '494 N McNeil St, Memphis, TN 38112'
const PROVIDER_TIMEOUT_MS = 12000
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const USER_RATE_LIMIT = 30
const WORKSPACE_RATE_LIMIT = 90
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000
const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000

const PLAN_RANK: Record<string, number> = {
  free: 0,
  'free demo': 0,
  starter: 1,
  pro: 2,
  agency: 3,
  enterprise: 4,
  'owner admin': 5,
}

let lastHealthCheck: { at: number; result: any } | null = null
const rateBuckets = new Map<string, { windowStart: number; count: number }>()
const providerCache = new Map<string, { expiresAt: number; value: any }>()

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
  const geoapify = readGeoapifyConfig()
  return {
    enabled: enabledRaw === 'true',
    provider,
    apiKey,
    apiKeyPresent: apiKey.length > 0,
    apiKeyLength: apiKey.length,
    geoapifyApiKey: geoapify.apiKey,
    autocompleteConfigured: geoapify.configured,
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

function providerConfigDiagnostics(config: ReturnType<typeof readRuntimeConfig>) {
  const missing = []
  if (!config.enabled) missing.push('PROPERTY_INTELLIGENCE_ENABLED')
  if (config.provider !== 'rentcast') missing.push('PROPERTY_INTELLIGENCE_PROVIDER')
  if (!config.apiKeyPresent) missing.push('RENTCAST_API_KEY')
  return {
    category: 'provider_not_configured',
    missing,
    config: publicConfig(config),
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

function providerHttpStatus(category: string, fallback = 500) {
  if (category === 'address_incomplete') return 400
  if (category === 'no_property_found') return 404
  if (category === 'credits_exhausted') return 402
  if (category === 'provider_rate_limit' || category === 'usage_rate_limit') return 429
  if (category === 'provider_not_configured') return 503
  if (category === 'autocomplete_authentication_failed' || category === 'provider_network_failure') return 503
  if (category === 'provider_timeout') return 504
  if (category === 'invalid_api_key' || category === 'inactive_subscription' || category === 'provider_billing_issue') return 503
  if (category === 'provider_http_error' || category === 'provider_schema_error') return 503
  return fallback
}

function customerCode(category: string) {
  if (category === 'address_incomplete') return 'address_incomplete'
  if (category === 'no_property_found') return 'no_property_found'
  if (category === 'provider_rate_limit' || category === 'usage_rate_limit') return 'rate_limited'
  if (category === 'credits_exhausted') return 'credits_exhausted'
  if (category === 'usage_tracking_unavailable') return 'usage_tracking_unavailable'
  if (category === 'provider_not_configured') return 'provider_not_configured'
  if (category === 'autocomplete_authentication_failed') return 'autocomplete_authentication_failed'
  if (category === 'provider_network_failure') return 'provider_network_failure'
  if (category === 'provider_timeout') return 'provider_timeout'
  return 'provider_unavailable'
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

function normalizeCacheAddress(address: string) {
  return clean(address).replace(/\s+/g, ' ').toLowerCase()
}

function getWorkspaceId(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>) {
  return clean(account.workspace?.id || account.plan?.workspace_id)
}

function planLookupLimit(planName: string, ownerAdmin: boolean) {
  if (ownerAdmin) return 100
  const normalized = clean(planName).toLowerCase()
  if (normalized === 'enterprise') return 1000
  if (normalized === 'agency') return 100
  if (normalized === 'pro') return 25
  return 0
}

function nextMonthlyResetDate() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
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

function logAutocompleteDiagnostic(providerStatusCode: number, providerErrorCategory: string, keyConfigured: boolean, requestAction: string) {
  console.warn('[Property Intelligence Autocomplete]', JSON.stringify({
    providerStatusCode,
    providerErrorCategory,
    keyConfigured,
    requestAction,
  }))
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

function rateLimitBucket(key: string, limit: number) {
  const now = Date.now()
  const current = rateBuckets.get(key)
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 })
    return
  }
  current.count += 1
  if (current.count > limit) {
    throw Object.assign(new Error(RATE_LIMIT_MESSAGE), {
      status: 429,
      category: 'usage_rate_limit',
    })
  }
}

function checkUsageLimit(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>, action: string) {
  const workspaceId = clean(account.workspace?.id || account.plan?.workspace_id || account.user.id || 'unknown')
  rateLimitBucket(`user:${account.user.id}:${action}`, USER_RATE_LIMIT)
  rateLimitBucket(`workspace:${workspaceId}`, WORKSPACE_RATE_LIMIT)
}

function readCache<T>(key: string): T | null {
  const current = providerCache.get(key)
  if (!current) return null
  if (Date.now() > current.expiresAt) {
    providerCache.delete(key)
    return null
  }
  return current.value as T
}

function writeCache(key: string, value: any, ttlMs = CACHE_TTL_MS) {
  providerCache.set(key, { expiresAt: Date.now() + ttlMs, value })
}

async function readDurableLookupCache(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>, normalizedAddress: string) {
  const workspaceId = getWorkspaceId(account)
  if (!workspaceId) return null
  const { data, error } = await account.adminClient
    .from('property_intelligence_cache')
    .select('payload,provider_request_count,original_lookup_at,expires_at')
    .eq('workspace_id', workspaceId)
    .eq('normalized_address', normalizedAddress)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error || !data?.payload) return null
  return {
    ...data.payload,
    cache: {
      status: 'hit',
      originalLookupAt: data.original_lookup_at,
      expiresAt: data.expires_at,
      creditUsed: false,
      message: 'Cached result. No lookup credit used.',
    },
    usage: {
      ...(data.payload as any).usage,
      providerRequestCount: 0,
      cachedProviderRequestCount: data.provider_request_count || 0,
      creditUsed: false,
    },
  }
}

async function writeDurableLookupCache(
  account: Awaited<ReturnType<typeof getAuthenticatedAccount>>,
  normalizedAddress: string,
  payload: any,
  providerRequestCount: number
) {
  const workspaceId = getWorkspaceId(account)
  if (!workspaceId) return
  await account.adminClient
    .from('property_intelligence_cache')
    .upsert({
      workspace_id: workspaceId,
      normalized_address: normalizedAddress,
      payload,
      provider_request_count: providerRequestCount,
      original_lookup_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,normalized_address' })
}

async function reserveLookupCredit(
  account: Awaited<ReturnType<typeof getAuthenticatedAccount>>,
  operationId: string,
  normalizedAddress: string
) {
  const workspaceId = getWorkspaceId(account)
  if (!workspaceId) {
    throw Object.assign(new Error('Workspace could not be verified.'), { status: 403, category: 'workspace_required' })
  }
  if (account.isOwnerAdmin) {
    return {
      ok: true,
      operationId: '',
      creditSource: 'owner_internal',
      creditUsed: false,
      ownerBypass: true,
      includedLimit: null,
      includedUsed: 0,
      includedRemaining: null,
      purchasedRemaining: null,
      resetDate: null,
    }
  }
  const { data, error } = await account.adminClient.rpc('reserve_property_intelligence_credit', {
    p_workspace_id: workspaceId,
    p_user_id: account.user.id,
    p_operation_id: operationId,
    p_plan_name: account.isOwnerAdmin ? 'Owner Admin' : account.planName,
    p_normalized_address: normalizedAddress,
  })
  if (error) {
    throw Object.assign(new Error('Property Intelligence usage could not be verified.'), { status: 503, category: 'usage_tracking_unavailable', payload: error })
  }
  if (!data?.ok) {
    throw Object.assign(new Error('You have used all Property Intelligence lookups for this billing period.'), {
      status: 402,
      category: 'credits_exhausted',
      payload: data,
    })
  }
  return data
}

async function finalizeLookupCredit(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>, operationUuid: string, summary: any, providerRequestCount: number) {
  if (!operationUuid) return
  await account.adminClient.rpc('finalize_property_intelligence_credit', {
    p_operation_uuid: operationUuid,
    p_result_summary: summary,
    p_provider_request_count: providerRequestCount,
  })
}

async function releaseLookupCredit(account: Awaited<ReturnType<typeof getAuthenticatedAccount>>, operationUuid: string, failureCode: string) {
  if (!operationUuid) return
  await account.adminClient.rpc('release_property_intelligence_credit', {
    p_operation_uuid: operationUuid,
    p_failure_code: failureCode,
  })
}

async function rentcast(endpoint: string, params: Record<string, any>, config: ReturnType<typeof readRuntimeConfig>) {
  const url = new URL(`${RENTCAST_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Api-Key': config.apiKey,
      },
      signal: controller.signal,
    })
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError'
    const category = timedOut ? 'provider_timeout' : 'provider_http_error'
    logDiagnostic(category, {
      endpoint,
      responseMs: Date.now() - started,
      requestAddress: params.address,
    })
    throw Object.assign(new Error(timedOut ? TIMEOUT_MESSAGE : PROVIDER_UNAVAILABLE_MESSAGE), {
      status: timedOut ? 504 : 503,
      category,
      endpoint,
    })
  } finally {
    clearTimeout(timeout)
  }
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

async function geoapifyAutocomplete(input: string, limit: number, config: ReturnType<typeof readRuntimeConfig>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const url = buildGeoapifyAutocompleteUrl(input, limit, config.geoapifyApiKey)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw Object.assign(new Error('Address suggestions are temporarily unavailable.'), {
        status: response.status,
        category: categorizeGeoapifyStatus(response.status),
        providerStatus: response.status,
      })
    }
    if (!isGeoapifyAutocompletePayload(payload)) {
      throw Object.assign(new Error('Address suggestions returned an unsupported response.'), {
        status: 503,
        category: 'provider_schema_error',
        providerStatus: response.status,
      })
    }
    return parseGeoapifyAutocompletePayload(payload, limit)
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Address suggestions timed out.'), { status: 504, category: 'provider_timeout' })
    }
    if (!error?.category) {
      throw Object.assign(new Error('Address suggestions could not reach the provider.'), {
        status: 503,
        category: 'provider_network_failure',
      })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function getPropertyRecord(address: string, config: ReturnType<typeof readRuntimeConfig>) {
  const cacheKey = `property:${normalizeCacheAddress(address)}`
  const cached = readCache<any>(cacheKey)
  if (cached) return { ...cached, cacheHit: true }
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
  const value = { row, ...result, cacheHit: false }
  writeCache(cacheKey, value)
  return value
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
  if (error?.category === 'credits_exhausted') return 'You have used all Property Intelligence lookups for this billing period.'
  if (error?.category === 'usage_tracking_unavailable') return 'Property Intelligence usage tracking is temporarily unavailable.'
  if (error?.category === 'no_property_found') return 'Property data is unavailable for this address.'
  if (error?.category === 'provider_not_configured') return PROVIDER_NOT_CONFIGURED_MESSAGE
  if (error?.category === 'autocomplete_authentication_failed') return 'Address suggestions are not authorized. Enter a complete property address manually.'
  if (error?.category === 'provider_network_failure') return 'Address suggestions cannot reach the provider right now. Enter a complete property address manually.'
  if (error?.category === 'provider_timeout') return TIMEOUT_MESSAGE
  if (error?.category === 'provider_rate_limit' || error?.category === 'usage_rate_limit') return RATE_LIMIT_MESSAGE
  return PROVIDER_UNAVAILABLE_MESSAGE
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
    const statusCode = health.connected ? 200 : providerHttpStatus(health.category, 503)
    const error = health.connected
      ? undefined
      : health.category === 'provider_not_configured'
        ? PROVIDER_NOT_CONFIGURED_MESSAGE
        : customerError({ category: health.category })
    return send(res, statusCode, {
      configured: config.configured,
      available: health.connected,
      propertyDataConnected: health.connected,
      status: health.connected
        ? 'Property Data Connected'
        : health.category === 'provider_not_configured'
          ? 'Provider Not Configured'
          : health.category === 'provider_timeout'
            ? 'Provider Timeout'
            : 'Provider Unavailable',
      code: health.connected ? 'ok' : customerCode(health.category),
      label: CUSTOMER_SOURCE,
      error,
      diagnostics: internal ? health : undefined,
    })
  }

  if (!config.configured) {
    logDiagnostic('provider_not_configured', { config: publicConfig(config) })
    return send(res, 503, {
      error: PROVIDER_NOT_CONFIGURED_MESSAGE,
      code: 'provider_not_configured',
      status: 'Provider Not Configured',
      configured: false,
      propertyDataConnected: false,
      diagnostics: internal ? providerConfigDiagnostics(config) : undefined,
    })
  }

  try {
    checkUsageLimit(account, action)

    if (action === 'balance') {
      const workspaceId = getWorkspaceId(account)
      if (!workspaceId) throw Object.assign(new Error('Workspace could not be verified.'), { status: 403, category: 'workspace_required' })
      const limit = planLookupLimit(account.isOwnerAdmin ? 'Owner Admin' : account.planName, account.isOwnerAdmin)
      const { data } = await account.adminClient
        .from('property_intelligence_balances')
        .select('billing_period_start,included_limit,included_used,purchased_available,purchased_used,updated_at')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      return send(res, 200, {
        planName: account.isOwnerAdmin ? 'Owner Admin' : account.planName,
        includedLimit: data?.included_limit ?? limit,
        includedUsed: data?.included_used ?? 0,
        includedRemaining: Math.max(0, (data?.included_limit ?? limit) - (data?.included_used ?? 0)),
        purchasedAvailable: data?.purchased_available ?? 0,
        purchasedUsed: data?.purchased_used ?? 0,
        purchasedRemaining: Math.max(0, (data?.purchased_available ?? 0) - (data?.purchased_used ?? 0)),
        resetDate: nextMonthlyResetDate(),
        addonCheckoutEnabled: false,
      })
    }

    if (action === 'autocomplete') {
      const query = clean(req.query.query)
      if (query.length < 5) {
        return send(res, 200, {
          results: [],
          autocompleteConfigured: true,
          minimumCharacters: 5,
        })
      }
      if (!config.autocompleteConfigured) {
        logAutocompleteDiagnostic(0, 'provider_not_configured', false, action)
        return send(res, 503, {
          error: 'Address suggestions are not configured. Enter a complete property address manually.',
          code: 'autocomplete_not_configured',
          autocompleteConfigured: false,
          diagnostics: internal ? { category: 'provider_not_configured', missing: ['GEOAPIFY_API_KEY'] } : undefined,
        })
      }
      const limit = Math.min(8, Math.max(1, Number(req.query.limit) || 8))
      const cacheKey = `autocomplete:${query.toLowerCase()}:${limit}`
      const cached = readCache<any[]>(cacheKey)
      if (cached) {
        return send(res, 200, {
          results: cached,
          autocompleteConfigured: true,
          cache: 'hit',
        })
      }
      const suggestions = await geoapifyAutocomplete(query, limit, config)
      writeCache(cacheKey, suggestions, AUTOCOMPLETE_CACHE_TTL_MS)
      return send(res, 200, {
        results: suggestions,
        autocompleteConfigured: true,
        cache: 'miss',
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

    if (action === 'lookup') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })

      const normalizedAddress = normalizeCacheAddress(lookup.fullAddress)
      const forceRefresh = req.query.refresh === 'true'
      if (!forceRefresh) {
        const cached = await readDurableLookupCache(account, normalizedAddress)
        if (cached) return send(res, 200, cached)
      }

      const operationId = clean(req.query.operationId) || `${account.user.id}:${normalizedAddress}:${Date.now()}`
      let reservation: any = null
      let providerRequestCount = 0

      try {
        reservation = await reserveLookupCredit(account, operationId, normalizedAddress)

        const propertyResult = await getPropertyRecord(lookup.fullAddress, config)
        providerRequestCount += propertyResult.cacheHit ? 0 : 1

        const valueCacheKey = `value:${normalizedAddress}`
        const cachedValue = readCache<any>(valueCacheKey)
        let valuePayload: any
        if (cachedValue) {
          valuePayload = cachedValue
        } else {
          const valueResult = await rentcast('/avm/value', { address: lookup.fullAddress }, config)
          providerRequestCount += 1
          const value = valueResult.payload
          valuePayload = {
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
            comps: (value.comparables || []).map(normalizeComp),
            normalizedAddressSent: lookup.fullAddress,
          }
          writeCache(valueCacheKey, valuePayload)
        }

        const rentCacheKey = `rent:${normalizedAddress}`
        const cachedRent = readCache<any>(rentCacheKey)
        let rentPayload: any
        if (cachedRent) {
          rentPayload = cachedRent
        } else {
          const rentResult = await rentcast('/avm/rent/long-term', { address: lookup.fullAddress }, config)
          providerRequestCount += 1
          const rent = rentResult.payload
          rentPayload = {
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
          }
          writeCache(rentCacheKey, rentPayload)
        }

        let marketPayload: any = { market: null }
        if (lookup.zipCode) {
          const marketCacheKey = `market:${lookup.zipCode}`
          const cachedMarket = readCache<any>(marketCacheKey)
          if (cachedMarket) {
            marketPayload = cachedMarket
          } else {
            const marketResult = await rentcast('/markets', { zipCode: lookup.zipCode }, config)
            providerRequestCount += 1
            const market = marketResult.payload
            marketPayload = {
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
            }
            writeCache(marketCacheKey, marketPayload)
          }
        }

        const summary = {
          property: normalizeProperty(propertyResult.row),
          owner: normalizeOwner(propertyResult.row, canAccessOwnerDetails(account.isOwnerAdmin ? 'Owner Admin' : account.planName)),
          valuation: valuePayload.valuation,
          rent: rentPayload.rent,
          comps: valuePayload.comps || [],
          history: normalizeHistory(propertyResult.row),
          market: marketPayload.market,
          normalizedAddressSent: lookup.fullAddress,
          cache: {
            status: forceRefresh ? 'refresh' : 'miss',
            creditUsed: !account.isOwnerAdmin,
            originalLookupAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
          },
          usage: {
            creditUsed: !account.isOwnerAdmin,
            creditSource: reservation.creditSource,
            providerRequestCount,
            includedLimit: reservation.includedLimit,
            includedUsed: reservation.includedUsed,
            purchasedRemaining: reservation.purchasedRemaining,
            resetDate: reservation.resetDate,
          },
        }

        await writeDurableLookupCache(account, normalizedAddress, summary, providerRequestCount)
        await finalizeLookupCredit(account, clean(reservation.operationId), {
          normalizedAddress,
          providerRequestCount,
          hasProperty: Boolean(summary.property),
          hasValuation: Boolean(summary.valuation),
          hasRent: Boolean(summary.rent),
          hasMarket: Boolean(summary.market),
        }, providerRequestCount)
        return send(res, 200, summary)
      } catch (error: any) {
        await releaseLookupCredit(account, clean(reservation?.operationId), error?.category || 'provider_unavailable')
        throw error
      }
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
      const cacheKey = `value:${normalizeCacheAddress(lookup.fullAddress)}`
      const cached = readCache<any>(cacheKey)
      if (cached) return send(res, 200, cached)
      const result = await rentcast('/avm/value', { address: lookup.fullAddress }, config)
      const value = result.payload
      const payload = {
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
      }
      writeCache(cacheKey, payload)
      return send(res, 200, payload)
    }

    if (action === 'rent') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      const cacheKey = `rent:${normalizeCacheAddress(lookup.fullAddress)}`
      const cached = readCache<any>(cacheKey)
      if (cached) return send(res, 200, cached)
      const result = await rentcast('/avm/rent/long-term', { address: lookup.fullAddress }, config)
      const rent = result.payload
      const payload = {
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
      }
      writeCache(cacheKey, payload)
      return send(res, 200, payload)
    }

    if (action === 'comps') {
      const lookup = normalizeLookupAddress(req.query)
      if (!lookup.completeEnough) throw Object.assign(new Error(COMPLETE_ADDRESS_MESSAGE), { status: 400, category: 'address_incomplete' })
      const cacheKey = `comps:${normalizeCacheAddress(lookup.fullAddress)}`
      const cached = readCache<any>(cacheKey)
      if (cached) return send(res, 200, cached)
      const result = await rentcast('/avm/value', { address: lookup.fullAddress }, config)
      const payload = { comps: (result.payload.comparables || []).map(normalizeComp), normalizedAddressSent: lookup.fullAddress }
      writeCache(cacheKey, payload)
      return send(res, 200, payload)
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
    const publicStatus = providerHttpStatus(category, status)
    if (action === 'autocomplete') {
      const providerStatusCode = Number(error?.providerStatus ?? (category === 'provider_network_failure' || category === 'provider_timeout' ? 0 : status))
      logAutocompleteDiagnostic(providerStatusCode, category, config.autocompleteConfigured, action)
    } else {
      logDiagnostic(category, {
        endpoint: error?.endpoint || action,
        httpStatus: status,
        safeResponse: safeProviderSummary(error?.payload || { message: error?.message }),
        requestAddress: req.query.address || req.query.propertyId,
      })
    }
    return send(res, publicStatus, {
      error: customerError({ ...error, category }),
      code: customerCode(category),
      diagnostics: internal ? {
        category,
        httpStatus: status,
        safeResponse: safeProviderSummary(error?.payload || { message: error?.message }),
        config: publicConfig(config),
      } : undefined,
    })
  }
}
