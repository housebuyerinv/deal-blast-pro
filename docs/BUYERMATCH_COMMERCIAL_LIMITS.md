# BuyerMatch approved commercial limits — October 6, 2026

The allowance decision is settled. Canonical source: `supabase/functions/_shared/buyermatchPlans.json`. Purchasing remains inactive; this is not Stripe or Resend activation.

| Plan | Monthly price | Analyses / billing period | Software distributions / billing period | Buyers / distribution | Invitation ceiling / period |
|---|---:|---:|---:|---:|---:|
| Starter | $59 | 20 | 10 | 25 | 250 |
| Pro | $119 | 50 | 25 | 50 | 1,250 |

Ceilings are not expected usage, guaranteed matches, delivered emails or cost forecasts. Managed Dispo remains a separate Network entitlement and counter. One software reservation consumes one unit regardless of fanout. Analyses and distributions are independent counters; exhausting distributions does not prevent a remaining analysis. Existing hourly analysis throttling remains.

## Enforcement and audit

Additive `20261006043844_buyermatch_commercial_limits.sql` adds private plan distribution/fanout limits and immutable reservation plan/cap snapshots. Analysis allowance continues to be copied from the approved billing catalog by the existing verified billing transaction. Distribution selects limits by the effective entitlement's plan version, ignores browser overrides, and fails closed for a missing plan or zero/unconfigured limits. It does not require purchase approval on each distribution: approval gates purchasing, while an already-active entitlement authorizes use.

The owner advisory lock, deal row lock, quota check, strongest eligible selection, request, exposures and outbox writes remain one transaction. Rank is existing match score descending, confidence descending, then buyer UUID ascending. Suppressed, unconsented and ineligible buyers are excluded before applying the cap. Existing uniqueness and append-only protections are unchanged. Same-key retries return the original request even after a plan changes; upgrades/downgrades affect future requests only. Failed/zero-recipient transactions roll back entirely.

Request service, plan version, allowed fanout, operation key, timestamp and billing period are frozen. Actual exposure count remains derivable from immutable exposures through the private usage view. Historical uncapped requests are retained without invented plan/cap snapshots. No private identity or eligible cohort count is added to customer responses. Customer invitation totals describe their generated invitations; existing matching cohort suppression remains unchanged.

The SQL catalog snapshot is checked against canonical JSON in database tests. Changes to commercial limits require a reviewed migration, not a frontend override. Views and RPCs remain inaccessible to public/anon/authenticated; the authenticated server binds owner and checks admin access before returning private aggregate economics.

## Staging and release boundary

Installed only on staging `qxhhlprentrufobpcgna`: 65/65 canonical checksums. Migration checksum: `5d3ac2b66d4ef6f8f765ad7dd0b5d090120f3086454b572426a6a74e454af46a`.

Both commercial plans remain `approved=false` with null Stripe price IDs. No paid customer entitlement was granted. Existing synthetic QA accounts retain their explicit, nonpurchasable `staging-only-v2` plan (50 analyses / 50 distributions / 50 fanout), isolated from the commercial catalog. The commercial verification runner temporarily uses Starter/Pro on a marked synthetic account, then restores its prior plan, suppresses new synthetic buyers and withdraws test deals while retaining immutable evidence. It never dispatches.

Production is not changed by this release. A later approved release must apply the pending completion migrations in order before promoting the application. Do not promote this Preview alone against the older Production schema.

## Verification

- Full local suite: 205 tests. New commercial boundaries: Starter selects top 25 of 100, Pro selects top 50; one unit consumed; eight concurrent same-key calls/retries preserve the same set; the 11th/26th distribution and 21st/51st analysis fail; remaining analysis works after distribution exhaustion; upgrades/downgrades preserve old exposure sets; absent/expired/inactive/unknown plans and cross-owner access fail; browser cap and plan overrides do not enter RPC arguments.
- Clean baseline replay and Production-equivalent schema rehearsal pass. Rehearsal: 230 assertions / 18 BuyerMatch migrations / 26 private tables / 30 private definer functions. PGlite is single-session; real concurrent HTTP tests are separately required.
- Frontend and API TypeScript/build pass. Lint: 0 errors / 94 existing warnings. Existing Vite bundle-size/mixed-import warnings remain.
- Hosted full and commercial concurrency runners: execution results are recorded in the final release report, not inferred from local results. Commands: `node --env-file=.env.buyermatch-staging --env-file=.env.buyermatch-preview-access scripts/verify-buyermatch-staging.mjs` and the same prefix with `scripts/verify-buyermatch-commercial.mjs`.

## Remaining activation gates

1. Isolated Stripe sandbox credentials, test prices and signed checkout/payment/failure/cancellation webhook verification. Checkout/live billing remain disabled. No live price IDs may be substituted.
2. Authorized Resend test-sink delivery and callback verification. Mock receipts are not provider verification. Live delivery remains disabled.
3. A separately approved Production migration/application release and smoke test. Production promotion is not authorized by this commercial-limit pass. Success fees remain disabled and require their own legal/provider rollout.

Provider delivery cost unavailable until Resend sandbox/provider verification.
