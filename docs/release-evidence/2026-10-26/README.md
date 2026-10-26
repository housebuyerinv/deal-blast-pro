# Milestone 1B continuation — evidence, not activation approval

Baseline: local `ddf1928f09f9e831376aec07ad6a56f17cbd3f26`.
Fresh GitHub readback: PR #2 remains open/DRAFT at remote
`531beb77c11a0b8275a321b69e0ce21200650339`; local application work is not published.
No push, deployment, hosted DDL, payment, customer email or delivery occurred.
Production/MoneyMap were not accessed or changed by this continuation.

## Completed technical work

1. **Reproduced and fixed lost updates.** Legacy administrator/import changes did
   not advance new buyer-account revisions. An actual local PostgreSQL test first
   failed with “Missing expected rejection.” The corrected unexecuted migration
   invalidates stale browser revisions when buyer state changes, except activity-only
   touches. Portal writes still advance exactly once and retain immutable evidence.
2. **Fixed pause verification.** Actual deployed GET returns405 before the guard;
   it proves no pause state. The helper now issues exactly one empty unsigned POST,
   with no Stripe event, Auth token or signature. The actual S2 guard returned503
   and its exact paused response. Wrong status/body/redirect/transport stays UNKNOWN.
3. **Rehearsed migration against complete schema history.** All24 historical
   BuyerMatch SQL sources loaded into an isolated PGlite fixture before the new
   draft. Existing records/billing guards preserved; service-only privileges and
   RLS, legacy admin-sync, stale writes, exact revision advancement, failed
   reapplication and interrupted-install rollback/retry verified. No historical
   matching/billing test bodies were imported or repeated.
4. **Prepared acceptance.** B1–B8 buyer onboarding/profile/POF/history/privacy and
   closure cases now extend the existing H1–H9 TEST billing sequence. Existing
   authentication/cleanup mechanisms are reused; no credential bridge was built.

**46/46 targeted tests PASS**, including16 added tests. Frontend/API TypeScript,
scoped changed-file lint and current server bundle PASS. The earlier109-check
application evidence and frontend build are retained; unchanged UI/build suites
were not rerun. Local SQL tests use an embedded PostgreSQL engine, not actual hosted
multi-connection concurrency or a PostgreSQL17 recovery rehearsal.

## Fresh hosted evidence — read-only except an empty guard probe

| Artifact | Actual result |
| --- | --- |
| `supabase-migration-readiness.json` | S2 PostgreSQL17.11; required tables/Auth fields/audit function present; new five tables and proof bucket absent; intake migration already recorded; live billing enabled=false/verified=false |
| `security-metadata.json` | Nine existing private tables have RLS and no anon/authenticated table or column access; current receiver deployment metadata reports version35. Historical v21 replay is not relabeled as a fresh version35 payment test |
| `stripe-catalog-portal.json` | Active recurring monthly licensed USD prices5900/11900 in the exact TEST account; portal payment updates and period-end cancellation enabled |
| `stripe-portal-expanded.json` | Under runtime Dahlia version, exactly approved Starter/Pro product/price pairs; adjustable quantity=false, only price changes, anchor unchanged, create_prorations. Portal is default only inside S2; server explicitly chooses its ID |
| `stripe-destination-inventory.json` | Complete classic/v2 listings contain the same single disabled TEST destination; classic URL is staging only; v2 events_from is @self. No destination modification or event generation |
| `receiver-pause-probe.json` | One empty unsigned POST: exact503 paused guard. It is not a signed Stripe event or billing test |
| `vercel-preview-bindings.json` | Names only, no values/decryption: Checkout key present; three required crypto/worker bindings absent. Portal-ID binding absent in inherited env; reviewed deployment overrides may supply this non-secret ID |

Named CLI profile/account and pinned binaries were verified; default Stripe profile
was not changed. Initial restricted-sandbox network access was UNKNOWN; the same
read-only operations succeeded through approved owner-context access. No login,
key retrieval/replacement/rotation, environment write or provider change occurred.

Table/column metadata is not API/RLS penetration testing. CLI administrative reads
are not proof of installed restricted-runtime key rights. Existing Starter TEST
activation and signed invoice replay remain historical hosted positives; Pro,
plan changes, renewal, failure and new buyer self-service have NOT passed hosted
acceptance. No new event was generated or replayed.

## Exact migration execution boundary

Use the corrected fingerprint in `followup-fingerprints.json`, not the baseline
draft's historical hash. Independent review and explicit S2 application approval
are still required. Apply **only** this canonical reviewed SQL through Supabase's
single-migration mechanism; record its actual provider-assigned migration version.
Do not use a broad `db push`: S2 historical versions differ from source filenames.
Do not replay private intake or the weaker billing predecessor.

The transaction uses5s lock/30s statement limits. A failed installation rolls back
and permits retry; a successful unrecorded reapplication deliberately fails rather
than silently accepting object drift. Migration history prevents ordinary replay.
Unexpected partial objects require investigation, not deletion or permission repair.
Old watchdog/preparer pins must be regenerated/reviewed for this changed helper;
do not execute an old packet merely because its earlier rehearsal passed.

## Remaining gates and exact next actions

1. Authorize a supported private recovery/validation of the **existing** trusted S2
   keys, then install only approved staging bindings. Custody remains UNSURE, not
   confirmed lost. Rejected seed remains blocked; do not generate incompatible keys.
2. Review/publish the corrected local source only after push authorization; approve
   its exact draft migration and protected Preview deployment/alias plan. Reattest
   current source/configuration and independent closure before any test window.
3. Run prepared B1–B8/H1–H9 within existing approved TEST scope once prerequisites
   pass, using normal private synthetic logins. Restore pauses, preserve Starter
   evidence, verify current restricted-key operations and record real outcomes.
4. Obtain final owner/counsel agreement decisions/publication approval. Review
   existing four draft hashes and addendum; no Production agreement is approved.
5. Establish verified owner-controlled Linux/encrypted storage and independent key
   custody; separately authorize acquisition and prove full DB/roles/Auth/Storage
   byte restoration. Existing R2 plan is unexecuted and hardware-blocked; encryption
   artifacts alone are not recovery proof. Do not resume custom Windows work.
6. Only then review/authorize Production migration, contained cutover, smoke tests,
   rollback and public activation. Existing stored enabled Production billing/
   delivery defaults must never substitute for deployment-level disabled guards.

No higher overall completion threshold is asserted. The mandatory gates have
unequal risk and no agreed weights; a draft, plan or local test is not hosted PASS.
Public release remains NO-GO. No owner credential or key should be sent in chat.
