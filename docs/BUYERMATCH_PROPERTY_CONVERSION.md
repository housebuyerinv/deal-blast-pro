# BuyerMatch property conversion intelligence

Implements PR #2 requirement comment 6507973996. Local-only migration and feature;
no hosted migration, deployment, billing, distribution or buyer-data access.

## Operator journey

Open `/app/buyermatch/conversion` from BuyerMatch navigation or CRM Analytics.
The existing protected app shell and BuyerMatch API enforce the signed-in owner,
active account and existing paid entitlement/network-owner rules. No Free account
receives a paid entitlement. CRM inventory, pipeline and billing are not replaced.

Load a report, optionally filtering market, deal source, JV partner, received-date
cohort, current outcome and conversion window (1–1095 days). Dates select intake
cohorts, not receipt dates. Existing BuyerMatch submissions, immutable analyses,
delivered recipients, buyer responses, offers, workflow review and closing records
are reused. No sample outcomes, email-based closing progression or retrospective
fee receipts are generated. An existing closing's verified date is usable evidence;
its fee-due amount plus paid flag is not a known receipt amount.

Record identity evidence for each original transaction: exact unit (use `whole`
only for the entire parcel), parcel if known, contract, ownership interest and
transaction references, source, JV partner and market. An optional CRM deal UUID
is an owner-recorded provenance link, not an automatic import or claim that a
local CRM record was independently verified. Each change retains the previous
identity/source and property snapshot. A property edit invalidates its old review.

Same addresses generate review candidates; they never auto-merge transactions.
Merging requires explicit pair confirmation, matching property/unit/contract/
interest/transaction identities and current property snapshots. Different units,
contracts, interests, owners, stale identities and merge chains are rejected.
Original submissions and events are never deleted. Unmerge appends another review
record. Editing a merged property/identity requires unmerging first. Reviewed
physical identities may contain multiple distinct transactions, shown separately.
Unreviewed identities are counted provisionally, not asserted to be unique real
properties. Parcel identifiers are scoped by city/state/ZIP and unit.

Use dated evidence to record written offers/amounts/status, interest, EMD pending/
confirmed/failed (with title/escrow/bank source), closing schedules, actual closes
and sale amounts, lost/stalled/withdrawn/canceled/reopened outcomes, documented
reason codes and projected/invoiced/received/refunded fees. A scheduled closing is
a future date attached to a current recorded event, never an occurred closing.
Amounts are USD integer cents; no FX assumptions. Confirmation means operator
attestation against an opaque evidence reference, not automatic bank/Stripe
reconciliation. Recording facts does not send buyers anything or move money.

Evidence references must not contain buyer contacts, document URLs, tokens or
bank details. Actual buyer identifiers are never returned by the snapshot: stable
owner-scoped pseudonyms permit recipient de-duplication across merged submissions.
Existing offers lacking explicit written-document evidence are displayed as
unconfirmed signals rather than counted as verified written offers.

Use a `void` event referencing the displayed event UUID and documented correction
reason to correct a fact. The old record remains visible. Identity changes append
a new identity instead. New financial/offer evidence references are unique per
owner/kind, including across deals; use a separately identifiable correction
reference after voiding an erroneous entry. Same operation key and payload replay
returns the same record; changed payload conflicts. The UI retains the key after
an uncertain outcome and advises refresh before retrying.

## Metric definitions

- Funnel counts physical property identities with independently recorded stages.
  Missing intermediate stages are never inferred. Conditional conversion uses
  properties with both adjacent stages divided by properties with the prior
  stage. Cohort conversion uses all received property identities. Zero denominator
  is insufficient data, not 0% confidence or a fabricated rate.
- Delivered-recipient engagement is responding delivered buyer/transaction pairs
  divided by distinct delivered buyer/transaction pairs inside the observation
  window. Provider acceptance/reservation alone does not count as distribution.
- Eligible match coverage uses recorded eligible-match counts/version from the
  existing saved analysis, not a fresh contact/eligibility promise. Unknown counts
  remain unknown. Interested buyers are historical recorded signals in-window.
- Stage timing averages only actually dated, nonnegative transaction pairs and
  shows sample counts. Immature cohorts show their observed/mature counts.
- Current outcomes, known closed volume and lifetime recorded cohort fees include
  later facts. Corrections apply even after the conversion window; an old window
  cannot revive a known-invalid receipt. Historical funnel reach and currently
  reopened transactions remain distinct. Unknown closing volumes are displayed.
- Projected, invoiced, received and refunded totals are separate. Latest projection
  is a forecast; actual receipt totals never include projections/invoices or an
  inferred legacy amount. Arithmetic fails closed outside safe integer precision.
- Recommendations cite missing evidence, zero recorded matches, no recorded
  responses after five delivered recipients/seven observed days, missing EMD or
  explicit failure reasons. They do not assert causation or send outreach.

## Implementation and verification boundary

Migration `20261029204937_buyermatch_property_conversion_intelligence.sql` adds
append-only `bm_conversion_events` and `bm_conversion_merge_reviews`, a merged-
property edit guard, service-only invoker RPCs and owner/operation/receipt indexes.
RLS is enabled; anon/authenticated have neither table access nor RPC execution.
The API supplies owner identity from the authenticated session, never request data.
No existing records are backfilled. Existing mutable workflow status remains
operational authority; the conversion ledger is evidence/analytics, not another
delivery or billing pipeline. Original buyer identities/ciphertext are not read.

API actions: GET `conversion-report`; POST `conversion-record`,
`conversion-review`. Both Netlify profiles admit these through their unchanged
private/production safeguards; handler authorization still applies. All billing,
registration, Portal and distribution containment remains unchanged.

Focused tests apply the real migration to ephemeral local PostgreSQL (PGlite),
test SQL grants/RLS/invoker/search paths, replay/uniqueness/immutability, cross-owner
denial, safe merge/unmerge, and private buyer masking. Actual API handlers execute
through synthetic Auth/provider transport into that SQL database; UI interaction
tests exercise filters, rendering and confirmed evidence submission. These are
local results, not hosted acceptance or independent financial verification.

Reports fail explicitly above 5,000 owner transactions or an 8MB snapshot; no
partial totals are silently presented. Duplicate review is bounded to 200 candidate
pairs with an explicit narrowing notice. Larger-scale export/pagination is not
implemented. This operational bound is the remaining scale limitation, not a
reason to alter quotas, hosting or protected resources.

Hosted use requires separately authorized additive migration and acceptance on an
eligible independent backend. Original-key recovery, legal approval and public
activation remain separate release gates. Spending remains $0; PR #2 stays Draft.
