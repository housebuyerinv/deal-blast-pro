import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildGeoapifyAutocompleteUrl,
  isGeoapifyAutocompletePayload,
  parseGeoapifyAutocompletePayload,
  readGeoapifyConfig,
} from '../api/_geoapify.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/geoapify-autocomplete.json', import.meta.url), 'utf8'))
const suggestions = parseGeoapifyAutocompletePayload(fixture)

assert.equal(suggestions.length, 1)
assert.equal(suggestions[0].label, '1113 Murtha Way, Latrobe, PA 15650, United States of America')
assert.deepEqual(suggestions[0].address, {
  line1: '1113 Murtha Way',
  city: 'Latrobe',
  state: 'PA',
  postalCode: '15650',
  county: 'Westmoreland County',
  latitude: 40.297536,
  longitude: -79.36259,
})

assert.deepEqual(parseGeoapifyAutocompletePayload({ type: 'FeatureCollection', features: [] }), [])
assert.deepEqual(parseGeoapifyAutocompletePayload({ results: [] }), [])
assert.equal(isGeoapifyAutocompletePayload({ results: [] }), true)
assert.equal(isGeoapifyAutocompletePayload({ type: 'FeatureCollection', features: [] }), true)
assert.equal(isGeoapifyAutocompletePayload({ error: 'unexpected' }), false)

const featureSuggestions = parseGeoapifyAutocompletePayload({
  type: 'FeatureCollection',
  features: [{
    properties: {
      address_line1: '1600 Pennsylvania Avenue Northwest',
      city: 'Washington',
      state_code: 'DC',
      postcode: '20500',
      formatted: '1600 Pennsylvania Avenue Northwest, Washington, DC 20500, United States',
      place_id: 'feature-place-id',
    },
    geometry: { coordinates: [-77.03655, 38.89768] },
  }],
})
assert.equal(featureSuggestions[0].address.longitude, -77.03655)
assert.equal(featureSuggestions[0].address.latitude, 38.89768)

const missingConfig = readGeoapifyConfig({})
assert.equal(missingConfig.configured, false)
assert.equal(missingConfig.apiKey, '')

const configured = readGeoapifyConfig({ GEOAPIFY_API_KEY: 'test-only-placeholder' })
assert.equal(configured.configured, true)

const url = buildGeoapifyAutocompleteUrl('1113 murtha', 8, 'test-only-placeholder')
assert.equal(url.origin + url.pathname, 'https://api.geoapify.com/v1/geocode/autocomplete')
assert.equal(url.searchParams.get('text'), '1113 murtha')
assert.equal(url.searchParams.get('filter'), 'countrycode:us')
assert.equal(url.searchParams.get('format'), 'json')
assert.equal(url.searchParams.get('limit'), '8')
assert.equal(url.searchParams.get('apiKey'), 'test-only-placeholder')

console.log('Geoapify autocomplete parser and configuration tests passed.')
