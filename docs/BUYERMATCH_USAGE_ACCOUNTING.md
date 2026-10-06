# BuyerMatch accounting and fanout

This change corrects accounting only. Starter and Pro remain allowance 0, unapproved, with no price IDs. No Production migration, promotion, checkout, Resend activation or success fee is authorized.

## Sources and units

| Quantity | Authoritative write/source |
|---|---|
| Analysis unit | `bm_commit_analysis` inserts one immutable `bm_analyses` row per owner/operation key after property, active entitlement, quota and hourly checks; rollback/retry adds no unit. New reanalysis keys consume new units. |
| Distribution unit | `bm_queue_distribution` / its existing Production wrapper inserts one immutable `bm_distribution_requests` row per owner/key and unique deal, atomically with eligible exposures/outbox jobs. Failed transactions consume nothing. |
| Service attribution | New requests snapshot service type and entitlement period using a BEFORE INSERT trigger. Existing requests are classified by matching immutable exposure `frozen_terms`, never by a mutable deal property. Missing or conflicting evidence is `unknown`, reported explicitly and counted conservatively against both distribution ceilings. |
| Billing period | New request snapshot records the authorized entitlement's start/end. Usage is selected by owner and event timestamp within the requested/current entitlement window. Legacy snapshots remain null; prior billing boundaries cannot be invented. Current-period attribution is derived from timestamps, not history rewriting. |
| Buyer exposure | One immutable `bm_exposures` row per eligible buyer for the request, with frozen terms. One request can fan out to many exposures. Fanout does not multiply subscription units. |
| Outbox / accepted invitation | `bm_outbox` is unique per exposure; claiming a lease increments `attempts`. `accepted_at` records provider acceptance (mock receipts only in QA). `delivered_at` requires delivery callback evidence; accepted is not delivered. |
| Retry | `sum(greatest(attempts-1,0))` measures repeated acquired leases. It is not proof that each lease made an HTTP send. Rejected/deduplicated API attempts were historically not recorded: report null/unavailable, never zero or a fabricated count. |
| Buyer activity | Scoped response RPC writes `bm_responses`; offers also write immutable `bm_offers`. Buyer chat writes `bm_messages` with `sender_kind=buyer`. Callback events live in `bm_provider_events`; opt-out/suppression lives on the buyer record. |

`bm_distribution_usage` is a private derived view. `bm_account_usage` provides independently bounded analysis, software distribution and Managed Dispo usage. Both Software ceilings use the existing `buyermatch` allowance; Managed Dispo uses `network`. Software requires no Network subscription. Reads/refresh never consume allowance. Inactive/expired entitlements have zero available balance while retaining recorded usage.

The customer plans handler always binds `p_owner` to the authenticated user and ignores supplied account/workspace IDs. It returns only quota aggregates, no buyer identities, admin metrics or hypothetical plan data. The three usage cards clearly separate the products; absent/inactive access says “Not activated.” Legacy entitlement fields remain compatible, with the Network counter corrected to exclude software.

`admin-usage` is protected by the existing server owner-admin allowlist. It exposes aggregate fanout, attempts, acceptance/delivery, responses and per-account current-period simulations; no private buyer identities. Starter 20/20 and Pro 50/50 simulations clamp remaining to zero and never persist a plan/entitlement. Metrics use lifetime history unless marked current-period; account IDs are admin-only.

## Migration and security

`20261006030201_buyermatch_usage_accounting.sql` is additive and staged only. It adds three nullable reservation attribution columns, a snapshot trigger, private view and service-only RPCs; it replaces the existing distribution function solely to count from immutable service attribution and the same period boundaries as reporting. It does not update old requests/exposures or commercial plans, and preserves all delivery/agreement/consent/contract/terminal-state gates. Existing immutable request trigger remains intact. Public/anon/authenticated grants are revoked on the view and RPCs; server owner/admin checks remain mandatory. Unknown classifications must be reconciled from evidence before commercial launch, not guessed.

Apply after the four completion migrations listed in `BUYERMATCH_ACTIVATION_GATE.md`, in a separately owner-approved Production release. Do not apply to Production in this task. The staged source checksum is `3fd92f3a4bd384dac491c43f7232d17248c51b12d5339d9c41007b1364a26f35`.

## Economics limitations

Initial staging snapshot after migration (before the new hosted run): 2 software reservations / 10 software exposures; average, median, minimum and maximum software fanout all **5**. There were 21 Managed Dispo reservations, zero unclassified reservations and zero recorded retry leases. These are synthetic fixtures, not a representative sample of real buyers. All accepted receipts are mock; no actual provider cost is inferred.

At fanout 5, full candidate utilization produces 100 / 250 invitation exposures for Starter / Pro. There is **no per-distribution buyer-invitation cap**. A real cohort of 100 would instead yield 2,000 / 5,000 exposures; that is arithmetic, not a forecast. Analysis fails closed above 10,000 active buyers, but that technical ceiling is not an economically protective send limit. The owner must approve the fanout risk separately from counting correctness.

Provider delivery cost unavailable until Resend sandbox/provider verification.

## Verification

Local full suite: 200 tests; database suite includes multi-recipient same-key concurrency, mixed-service isolation, immutable attribution despite deal edits, rollback after zero eligible recipients, inactive and terminal/cross-owner denial and private grants. API tests bind usage to the authenticated owner and deny regular-user metrics; simulations do not mutate input. Existing analysis retry/new-operation/concurrency tests remain.

Disposable Production-equivalent replay: 229 assertions / 17 BuyerMatch migrations. Clean-baseline replay is also covered by the full suite. Staging ledger: 64 canonical checksums. TypeScript/build pass; lint has 0 errors and 94 existing warnings. PGlite is single-session; the expanded hosted runner sends four overlapping analysis requests and four overlapping software distribution requests and checks actual quota and fanout through the real database.

Exact Preview, final hosted totals and post-test metric snapshot are recorded in the release report. Safety gates and plan rows must be confirmed again at the end; no commercial allowances are approved by this document.
