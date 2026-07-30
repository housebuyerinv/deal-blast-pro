# Address autocomplete

Property Intelligence address suggestions use the Geoapify Address Autocomplete API through the
server-side `/api/property-intelligence/autocomplete` action. Requests are restricted to United
States addresses, deduplicated in the browser, and cached briefly on the server. Selecting a
suggestion fills the normalized complete address but does not load Property Intelligence.

Configure this Vercel environment variable for Preview and Production:

- `GEOAPIFY_API_KEY` — a server-only Geoapify API key.

Do not prefix the variable with `VITE_`. The browser calls only the Deal Blast Pro API route, so
the key is not included in browser JavaScript, HTML, source maps, logs, or API responses.

The address-search interface displays the required `Powered by Geoapify` attribution near the
field and suggestions.

Geoapify provides address suggestions only. RentCast remains the licensed provider for full-address
Property Intelligence after the user explicitly chooses **Load Property Intelligence**.

If the variable is absent or the provider fails, the UI keeps complete manual address entry
available and does not trigger a Property Intelligence lookup automatically.
