# BuyerMatch Resend staging verification — October 11, 2026

## Current result: STAGING RESEND VERIFIED

The same Resend team passed actual staging delivery and Production callback isolation.
A separate paid team is not required for this tested configuration. This is staging
certification, not authorization to send to real buyers or enable Production billing.

- Application SHA: `cd8399890b493b1362cc66c5d3d95293dcbb2592`.
- Verified Preview: https://deal-blast-h6rj4cj71-housebuyerinv.vercel.app
  (`dpl_AqowvJbrZ25YfqVkQBM52V4PqfGd`, READY).
- Authorized replacement key `DBP BuyerMatch staging QA restricted`: Sending access,
  restricted to `housebuyerinvestments.com`; installed as sensitive `RESEND_API_KEY`
  only for Preview branch `codex/buyermatch-network`. The earlier lost key was not revoked.
- Preview remains `BM_DELIVERY_MODE=resend-test`; sender is
  `DBP BuyerMatch Staging <buyermatch-staging@housebuyerinvestments.com>`.
  The application hardcodes the sole QA recipient, `delivered@resend.dev`.
- Existing staging webhook enabled; its actual signing secret is installed as
  `BM_RESEND_WEBHOOK_SECRET` only in `qxhhlprentrufobpcgna`. Private local credential
  and access files remain ignored and untracked; no values are in this report.
- **3 actual sends, 3 provider acceptances, 3 persisted provider IDs, 3 delivered
  callbacks**, confirmed in both Resend history and staging SQL. All six sent/delivered
  webhook events succeeded. Three concurrent worker retries sent zero additional emails;
  immutable receipt IDs, attempts and allowances remained unchanged.
- Actual provider replay: original and replay both returned HTTP 200/recorded, with
  exactly one stored event. **9/9** dispatch/receipt/retry checks passed on the final run.
- **19/19** callback checks passed: real delivered receipts, actual replay deduplication,
  invalid-signature rejection, unknown-event zero mutation, concurrent signed bounce and
  complaint simulations, suppression of only the correlated buyer, unchanged unrelated
  buyer, non-synthetic rejection before a provider call, Production rejection of both
  synthetic transports. Bounce/complaint events were signed simulations against actual
  test receipts, not provider-generated bounces or complaints; no alternate recipients used.
- **82/82 authenticated read-only Preview assertions** passed, including regular/other/admin
  authorization, foreign deal denial, private buyer table denial, hosted GET plans,
  staging frontend identity, and actual server-secret scans in API responses and bundle.
- Fresh full automated suite **235/235**; TypeScript/Vite build passed; lint **0 errors /
  94 existing warnings**. Existing bundle-size warning remains. Staging checksums **67/67**,
  read-only. Earlier 236 migration rehearsal and 43 signed fixture assertions remain the
  prior baseline; no migration SQL changed or was applied in this pass.

### Production isolation and promotion gate

Production is still `d9e5be5f916fd3c46fd3755eae1e85bf2ba19751`, deployment
`dpl_6F3xwcf6f8dobZFLcKFTGHZfPkbq`, alias https://deal-blast-pro.vercel.app.
Read-only inspection found the legacy `resend-webhook` already hardened (version 15).
This run did not deploy it. Its six callbacks for this QA wave succeeded; the inspected
delivered acknowledgement was `{"ok":true,"ignored":true}`. Production before/after
counts: BuyerMatch outbox/responses/checkouts/billing events **0/0/0/0**; legacy
`email_delivery_events` **48/48**. No Production configuration, schema, deployment or
customer data changes were made. Delivery config and success fees remain false;
Vercel delivery is disabled, live delivery/checkout false, live-billing/verification flags
unset and fail closed. Production lacks the live billing table and scoped callback RPC.

Exact remaining approval gates:

1. Approve a controlled Production code/schema promotion with all sending, checkout,
   billing and success-fee gates still OFF. Recheck backup/recovery, live prerequisites
   and canonical hashes at execution time; preserve legitimate legacy migration history.
2. Eight BuyerMatch migrations remain absent in Production, in this order:
   `20261006010617_buyermatch_live_billing_boundary.sql`,
   `20261006010804_buyermatch_conversation_safety.sql`,
   `20261006013219_buyermatch_portal_sync_atomic.sql`,
   `20261006013640_buyermatch_software_distribution.sql`,
   `20261006030201_buyermatch_usage_accounting.sql`,
   `20261006043844_buyermatch_commercial_limits.sql`,
   `20261006164348_buyermatch_subscription_plan_changes.sql`,
   `20261006184631_buyermatch_callback_isolation.sql`.
   Coordinate the scoped callback migration with its matching BuyerMatch Edge handler;
   the old unscoped RPC deliberately becomes a no-op. Keep unrelated legacy RLS separate.
3. Deploy the approved application/Edge versions and complete Production smoke tests
   before certifying the promoted release. This run performed no promotion.
4. Separately authorize live Resend credentials/sender/recipient-consent scope and
   Production callback signing configuration, then controlled live-delivery verification.
   Staging-only key approval does not authorize live delivery.
5. Separately approve/configure live Stripe catalog and webhook credentials and verify
   paid signed entitlement activation. Prior 48-assertion Stripe sandbox certification
   remains staging only. Success fees require their own future approval.

QA fixture corrections: expired historical jobs were reconciled through the existing
claim RPC without resetting retry clocks. The first fresh fixture omitted frozen
property data and failed before contacting Resend; it was canceled/suppressed and
replaced with a correct synthetic fixture. An allowance assertion initially compared
before fixture creation with after creation; its baseline now starts after setup.
No application fix or weaker safety check was needed. Production was unchanged.

## Historical callback-hardening report — October 6, 2026

The following records the earlier baseline and blockers, superseded by the current
verification and remaining gates above.

## Result and release boundary

Callback isolation is verified locally and in staging. **The shared Resend team is
not safe to use yet:** Production still runs the old legacy callback. Owner approval
and a controlled deployment of the hardened Production callback are required before
any staging send from this team. No paid separate team is technically necessary
once that deployment is verified. No key, Resend webhook, email send, Production
configuration, Production migration, Production deployment or fee activation was
performed in this run.

## Changes

- `resend-webhook` is the existing legacy DBP receiver, not the BuyerMatch receiver.
  It now acknowledges an unknown provider receipt without writing an orphan event.
  Lookup errors remain retryable; known legacy deliveries and signature checks remain.
- `buyermatch-delivery` passes a server-selected environment to the new scoped RPC.
  Validly signed unknown events return HTTP 200/no-op. Database failures remain 503.
  Disabled Production delivery acknowledges valid signatures without database access.
- Additive migration `20261006184631_buyermatch_callback_isolation.sql` reuses the
  unique outbox provider-message index, immutable token environment and exposure chain.
  It requires accepted receipt, matching test/Production mode, capability environment,
  buyer, deal owner and immutable distribution operation. BuyerMatch's current scope
  is owner/deal; no invented workspace column or webhook-supplied identity is used.
- Receipt, exposure and accepted environment binding cannot be rebound. The previous
  unscoped RPC fails closed. Browser roles cannot execute the scoped RPC.
- Suppression resolves the buyer internally. Callback fields such as `to`, `from`,
  subject, owner, workspace and deal cannot select another identity.
- Event insertion and state mutation are one transaction; outbox row locking and the
  unique event key protect replay. Opens/clicks do not manufacture buyer interest.

## Verification

- Full automated suite: **235/235**.
- Targeted callback/database/legacy tests: **63/63**, included in the full total.
- Clean and reconstructed Production-equivalent migration rehearsal: **236 assertions**,
  20 BuyerMatch migrations. Offline PGlite; no Production customer records or writes.
- Installed staging source checksums: **67/67** (66 verified before the additive apply).
- Signed hosted staging callback tests: **43/43**. Both actual staging Edge handlers
  were exercised with generated fixture signing secrets. The known receipt was
  explicitly synthetic (`fixture-` prefix), not a claimed Resend acceptance.
- Unknown signed delivered/bounced/complained callbacks: **zero mutations**, including
  outbox, exposures, buyers, provider events, user-visible events, responses, closings,
  billing and legacy delivery tables in the staging snapshots.
- Staging → Production and inverse scope: **zero mutations** in real SQL plus signed
  Production-mode/staging-mode offline handlers. These are not live Production probes.
- Known Production-mode event: intended fixture record only; known staging event:
  actual staging synthetic record only. Concurrent same-event replay produced one event;
  a changed event kind with the same ID caused no repeated mutation.
- Invalid signatures rejected before database access; private buyer table access denied
  to the authenticated regular staging account.
- TypeScript/Vite build passed. Lint: **0 errors / 94 existing warnings**. Existing
  large-bundle warning remains. No lint suppressions or test-only runtime bypasses added.
- Authenticated Preview read-only suite: **42/42**, covering regular/other/admin
  authorization, foreign-deal denial, private buyer-table denial, permanent hosted
  GET plans regression, response route, staging frontend configuration and secret
  checks. No sends or purchases. Its first admin-list check caught an incorrectly
  encoded new synthetic callback fixture; the fixture and runner now use the
  existing staging identity encryption, and the complete suite passed on rerun.

The two generated staging signing secrets were removed after the hosted tests;
secret inventory confirmed zero remaining fixture callback secrets. Stripe secrets
were preserved. The temporary local secret file was deleted. The fixture report and
synthetic fixture IDs remain ignored under `test-artifacts/callback-*`.

## Caveats and exact remaining gates

1. **Approve Production callback hardening separately.** Do not mistake a Preview
   deployment for deployment of Supabase Edge Functions. The current Production legacy
   `resend-webhook` still writes unknown events. Preserve legitimate legacy email flows.
2. Before later BuyerMatch callback rollout, apply the scoped migration and deploy its
   matching handler together under the controlled release procedure. Migration-first
   temporarily makes old BuyerMatch handlers no-op; do not leave this split in a live
   delivery environment. No live BuyerMatch delivery is enabled now.
3. After approved Production hardening, verify signed unknown callbacks are true no-ops
   in Production and known legacy handling remains compatible. This run deliberately
   did not send signed callbacks to or mutate Production.
4. Only then create the authorized domain-limited staging key, install Preview-only
   `RESEND_API_KEY`, configure the staging Resend webhook, and securely install its
   actual `BM_RESEND_WEBHOOK_SECRET`. Keep recipients hardcoded to `delivered@resend.dev`.
5. Finish actual Resend acceptance, delivered callback and provider replay verification.
   Generated signatures and simulated receipts do not certify real Resend delivery.
6. Unknown callbacks arriving before the provider receipt is durably stored are now
   intentionally acknowledged/no-op. Do not claim such an early event was recorded;
   reconcile via provider receipt/event history or an explicit later replay. No speculative
   delivery record may be created from an unmatched callback.
7. PGlite concurrent promises verify replay semantics, not independent Postgres session
   lock timing. Hosted staging concurrent requests provide the real PostgreSQL check.
8. Real buyer delivery, Production billing and success fees remain separately disabled
   and require their own approval/verification. Do not buy a paid team automatically.

Historical provider attempt: commit `dff07c99ec1586ec14633cae963cc8d910741da5`, Preview
https://deal-blast-8m2q3a36r-housebuyerinv.vercel.app, failed HTTP 401; no real provider
acceptance occurred. Do not count its five pending receipts as successful sends.
