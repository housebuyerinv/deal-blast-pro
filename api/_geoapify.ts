const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'

function clean(value: unknown) {
  return String(value || '').trim()
}

export function readGeoapifyConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = clean(env.GEOAPIFY_API_KEY)
  return {
    apiKey,
    configured: apiKey.length > 0,
  }
}

export function buildGeoapifyAutocompleteUrl(query: string, limit: number, apiKey: string) {
  const url = new URL(GEOAPIFY_AUTOCOMPLETE_URL)
  url.searchParams.set('text', clean(query))
  url.searchParams.set('filter', 'countrycode:us')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', String(Math.min(8, Math.max(1, limit))))
  url.searchParams.set('apiKey', apiKey)
  return url
}

function resultRecords(payload: any) {
  if (Array.isArray(payload?.results)) return payload.results
  if (!Array.isArray(payload?.features)) return []
  return payload.features.map((feature: any) => {
    const properties = feature?.properties || {}
    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : []
    return {
      ...properties,
      lon: properties.lon ?? coordinates[0],
      lat: properties.lat ?? coordinates[1],
    }
  })
}

export function isGeoapifyAutocompletePayload(payload: any) {
  return Array.isArray(payload?.results) || (payload?.type === 'FeatureCollection' && Array.isArray(payload?.features))
}

export function parseGeoapifyAutocompletePayload(payload: any, limit = 8) {
  return resultRecords(payload)
    .map((result: any) => {
      const address = {
        line1: clean(result?.address_line1 || [result?.housenumber, result?.street].filter(Boolean).join(' ')),
        city: clean(result?.city || result?.town || result?.village || result?.county),
        state: clean(result?.state_code || result?.state),
        postalCode: clean(result?.postcode),
        county: clean(result?.county),
        latitude: result?.lat,
        longitude: result?.lon,
      }
      const label = clean(result?.formatted) || [address.line1, address.city, address.state, address.postalCode].filter(Boolean).join(', ')
      return {
        id: clean(result?.place_id || label),
        address,
        label,
        confidence: Number(result?.rank?.confidence || result?.rank?.confidence_city_level || 0.85),
        source: 'Geoapify',
      }
    })
    .filter((suggestion: any) => suggestion.id && suggestion.label && suggestion.address.line1 && suggestion.address.city && suggestion.address.state)
    .slice(0, Math.min(8, Math.max(1, limit)))
}

export function categorizeGeoapifyStatus(status: number) {
  if (status === 401 || status === 403) return 'autocomplete_authentication_failed'
  if (status === 429) return 'provider_rate_limit'
  if (status >= 500) return 'provider_http_error'
  return 'provider_http_error'
}
