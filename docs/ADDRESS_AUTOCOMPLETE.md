# Address autocomplete

Property Intelligence address suggestions use Google Places API (New) through the server-side
`/api/property-intelligence/autocomplete` and `/api/property-intelligence/autocomplete-details`
actions. RentCast remains the licensed Property Intelligence provider after the user explicitly
loads a verified address.

Configure this Vercel environment variable for Preview and Production:

- `GOOGLE_PLACES_API_KEY` — a server-side Google Maps Platform key with Places API (New) enabled.

Restrict the key to the Places API and the Vercel deployment environment. Do not prefix it with
`VITE_`; the key must never be included in browser bundles.

If the variable is absent or the provider fails, the UI keeps complete manual address entry
available and does not trigger a Property Intelligence lookup automatically.
