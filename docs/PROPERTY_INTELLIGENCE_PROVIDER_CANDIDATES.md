# Property Intelligence Provider Candidates

Property Intelligence is provider-neutral. No production provider is connected until commercial SaaS display, caching, export, owner-data, and resale rights are reviewed and approved.

## Shortlist

| Provider | Potential Coverage | Useful Fields | Notes Before Integration |
| --- | --- | --- | --- |
| ATTOM | National property, ownership, assessor/tax, deeds, mortgage, sales, AVM, comparable sales, neighborhood and market datasets | Property characteristics, tax/assessment, owner, recorder deeds, mortgage loan, sales price, AVM, comps | Strong candidate for broad property intelligence. Requires commercial license review for customer-facing SaaS display, caching, export, and owner/mortgage restrictions. |
| RentCast | US property records, owner details, value/rent AVM, sales/rental comps, listings, market trends | Property records, owner details, valuation estimates, sales and rental comps, active listings, zip/city market trends | Public API page lists transparent API plans and broad licensing language. Terms still need legal/product review for Deal Blast Pro use, caching, resale, and customer display. |
| County assessor / recorder portals | Jurisdiction-specific public record coverage | Parcel, owner of record, assessment, tax, sale/transfer, deed/mortgage records where available | Must review each county for access method, rate limits, redistribution, caching, and commercial use. Coverage and schemas vary heavily. |
| Municipal / state open-data portals | Local facts, permits, code, tax, parcel, market-adjacent datasets where published | Permits, parcel boundaries, tax records, open listings/transactions in some jurisdictions | Use only documented open-data APIs or downloadable datasets with compatible terms. Label geographic level and source clearly. |
| Authorized MLS / brokerage integrations | Listing and comparable sales where contractually authorized | Active listings, closed sales, DOM, broker/listing details | Requires explicit MLS/brokerage agreement. Do not scrape or rely on private endpoints. |

## Source Links Reviewed

- ATTOM Developer Platform: https://api.developer.attomdata.com/
- RentCast API: https://www.rentcast.io/api

## Integration Gate

Before enabling any provider in production, verify:

- Commercial SaaS use
- Customer-facing display rights
- Caching/storage rights and required retention limits
- Export rights
- Attribution requirements
- Rate limits and overage costs
- Owner-data and mortgage-data restrictions
- Skip-trace restrictions
- Required notices, disclaimers, and confidence labels
- Server-side key handling and usage logging

## Current Status

Production provider connected: No.

Current implementation includes only a development-safe mock provider that displays clearly labeled sample data for UI development, plan previews, and automated tests.
