# BuyerMatch Resend callback hardening — October 6, 2026

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
