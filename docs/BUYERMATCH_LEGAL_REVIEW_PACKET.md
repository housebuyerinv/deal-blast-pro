# BuyerMatch commercial/legal review packet — decisions required

Planning only under PR #2 review 6369522557. No draft contract is published or
accepted by this packet. Owner/appropriate counsel must determine applicable law,
markets and approved language. QA approval flags are not legal approval.

## Existing artifacts and verified product behavior

Public src/pages/public/Terms.tsx, Privacy.tsx, RefundPolicy.tsx and AcceptableUse.tsx
contain generic Deal Blast Pro text. The Refund page states a general nonrefund
policy with legal exceptions and renewal cancellation, but does not establish
approval of BuyerMatch's specific independent subscription policy.
S2's two versioned agreement documents remain staging-fixture-v2 / SYNTHETIC QA ONLY.

BuyerMatch software: Starter USD59 monthly (20 analyses/10 distributions/25 fanout);
Pro USD119 monthly (50/25/50), fixed quantity 1. Independent CRM entitlement; no
automatic paid CRM plan. Managed disposition services are separately arranged.
No guaranteed match, response, funding, closing or outcome is implied.

Read-only dedicated TEST portal check, October 23:
bpc_1UTRxYL6efr9LhPIA0rP1HOJ active, TEST, is_default=true within S2 sandbox;
payment-method updates enabled; cancellation at_period_end with proration none;
price updates enabled, create_prorations, billing_cycle_anchor unchanged,
no schedule_at_period_end conditions; terms/privacy URLs null. No settings changed.
Fixed quantities/two-plan restrictions have historical verified evidence; no new
claim about expanded provider product-policy fields absent from this read response.
TEST configuration is not live commercial approval.

## Owner/counsel decisions before publishing

| Decision / artifact | Exact question to resolve | Implementation acceptance |
| --- | --- | --- |
| Product terms/order disclosure | Legal seller, business audience/territories, support contact, independent CRM vs software vs managed service scope? | Same named product/seller/price/period across landing, checkout, portal and terms |
| Renewal and cancellation | Automatic monthly renewal, notice requirements, cancellation method/cutoff, paid-through access and resubscription/support policy? | Visible pre-purchase disclosure; functioning cancellation; confirmed effective date |
| Refunds and failed payments | Refund exceptions, partial periods, duplicate charge process, grace period/retries, suspension vs restored access, disputes? | Published policy matches actual webhook state and support process |
| Upgrade/downgrade/proration | Immediate or next-period change, credits/invoices, billing anchor, usage already consumed and over-limit behavior? | Explicit owner decision aligned with actual portal/invoice and H3 results; no assumed scheduled downgrade |
| Allowances | Monthly period/reset, rollover/expiry, failed analyses/distributions, extra usage, buyer fanout, timezone? | UI and server quota behavior agree with approved claims; no invented overages |
| Privacy/data processing | Controller/processors, fields, source and rights to buyer data, purpose/retention/deletion, exports, access/security, subprocessors and cross-border handling? | No public buyer contacts; private responses/tokens scoped; explain retention versus deactivation |
| Contact/distribution consent | Lawful authority to upload/contact recipients, channel consent, suppression/opt-out, deal-specific authority and evidence? | Existing privacy/distribution controls retained; no delivery enabled by agreement approval |
| Managed services | What requires a separate service engagement, fees/compensation and jurisdiction/brokerage review? | No software fee represented as managed disposition or promised outcome |
| Tax/currency/invoicing | Selling jurisdictions, tax registrations and price-inclusive/exclusive presentation? | Explicit tax review; no automatic_tax activation or provider change in this task |
| Security/incidents | Accurate security claims and appropriate incident/support contact/process? | No unsupported assurance or statement that historical exploitation is ruled out |

The current TEST portal applies immediate price updates with create_prorations;
do not promise next-period downgrades. Stripe documents that its scheduled portal
downgrade feature has product constraints; validate compatibility with the actual
Starter/Pro product structure before selecting that policy. See
[Stripe portal configuration](https://docs.stripe.com/customer-management/configure-portal).

## Versioned consent publication acceptance

Owner/reviewer approves final exact text, effective date, versions and SHA-256 hashes
for platform/software terms, privacy and the linked refund/cancellation policy.
Record reviewer identity/date and where these appear at signup, Checkout and portal.
Reconcile public text with approved bm_documents content; test stale/tampered hashes
and missing acceptance fail closed. Acceptance must bind authenticated owner,
specific document version/hash, purpose and relevant deal where applicable, with
existing timestamp/audit evidence and retention policy. Do not treat Stripe payment,
generic site usage or QA acceptance as a substitute for required application consent.

Publishing documents, changing approval flags/catalog/portal links and recording real
acceptance require their own reviewed release action. No staging document mutation,
new legal default, live portal change or compliance certification is made here.
