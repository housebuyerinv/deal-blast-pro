# API Usage and Cost Controls

## Property Intelligence

- `PROPERTY_INTELLIGENCE_ENABLED` is the server-side kill switch.
- `PROPERTY_INTELLIGENCE_PROVIDER` must be `rentcast`; `RENTCAST_API_KEY` remains server-only.
- Results use durable workspace cache plus short-lived server cache. Default durable TTL is 14 days.
- User and workspace request limits bound bursts. Forced refresh must be explicit.
- Owner Admin lookup credits are bypassed for internal testing, but provider calls still cost money; use cached addresses when possible.
- Safe logs contain category, status, timing, and counts only. Never log request authorization, keys, or raw provider payloads.

## Geoapify

`GEOAPIFY_API_KEY` is server-only. Autocomplete starts after meaningful input and is debounced; no polling is used. Attribution must remain visible. Keep restrictions compatible with Vercel server requests.

## Supabase and egress

Select named columns, scope all customer reads with RLS, reuse in-flight reads, refresh on login/focus/domain events, and avoid full-table polling. Inventory is authoritative in `inventory_deals`; local state is a UI cache.

## Operating thresholds

Set provider budget alerts in vendor dashboards. Investigate sudden increases in calls per authenticated user, workspace, or normalized address. Disable the provider before an unexpected-cost investigation; manual calculators must remain usable.
