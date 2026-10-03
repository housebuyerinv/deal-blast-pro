> October 3, 2026 reconciliation update: **PRODUCTION MIGRATION PLAN VERIFIED**. All 13 legacy sources recovered; the unchanged eleven-migration BuyerMatch chain passes a disposable Production-schema rehearsal. No bridge required. The outbox migration is now applied only in staging (42/42 checksums). Production remains unchanged and application release remains separately gated. See [the full rehearsal report](BUYERMATCH_MIGRATION_REHEARSAL.md). This supersedes earlier unreconciled/pending-staging statements below.

# BuyerMatch Production readiness audit

Status: **BLOCKED — Production schema and configuration are not ready/verified.**

This continues verified application commit `00444a8fbe3b67e39af655b58a4b4f3fd1186074`. No Production data, configuration, migration, function or deployment has been changed. No live provider request was made.

## Read-only Production findings

Production project `aigvnbxiydbzzqbetlhl` now reports **ACTIVE_HEALTHY**. The read-only comparison completed successfully as an inspection and found a release-blocking baseline difference. No Production writes, migration or deployment occurred.

Production history contains **42 migrations**: 29 identities shared with the staging baseline and **13 newer legacy DBP migrations absent from this branch**. All **10 baseline BuyerMatch migrations are missing**, as is the pending eleventh Production-outbox migration. The two staging-only sources must never be applied to Production. Exact migration identities and pending source hashes are recorded in [BUYERMATCH_PRODUCTION_SCHEMA_AUDIT.json](BUYERMATCH_PRODUCTION_SCHEMA_AUDIT.json); the 41-source manifest now labels each source's observed Production status.

Production has **no bm_* tables, functions, indexes, constraints, triggers or types** and no `buyermatch-private` bucket. Thus the required exposure/deal/buyer/owner relationships, response/outbox tables, immutable capability environment/actions, token/capability uniqueness, expiry/revocation, receipt/lease fields, response locking and terminal-state functions are all absent. Auth and Storage prerequisites exist. Existing Storage policies are restricted to other named buckets. The audit captured identities and a column fingerprint for 33 legacy public tables without reading customer records.

The Production migration ledger stores version, name and SQL statement arrays, but no canonical source-file checksums. Newline-joined stored statements differ from original source formatting and cannot certify source-file equality. **29 identity matches are not 29 checksum matches.** No historical source checksum mismatch is established; exact equality remains unverified. Staging's independently verified 41 canonical source checksums are a different claim.

The pending outbox migration is additive relative to the expected BuyerMatch schema: disabled configuration, nullable lease UUID and private RPCs, with no destructive data operations. **It is not independently applicable to current Production**, because its prerequisite tables/functions do not exist. Installing all eleven BuyerMatch sources would be a broader initial installation. Before that installation, reconcile the thirteen newer legacy migrations with this branch and review the complete ordered plan. Never replay the 29 shared legacy migrations or staging bootstrap scripts. This baseline gap prevents certifying compatibility with the currently deployed app.

Full-chain migration risks: `20260930140000` drops an earlier analysis RPC overload; `20261001090000` installs a success-fees-disabled check; `20261002190115` adds a volatile UUID default and uniqueness that can rewrite/scan populated tokens. These objects are absent in Production today, so there is no existing BuyerMatch data to rewrite, but that does not substitute for reconciling the deployed application baseline. DDL still takes locks. The pending migration remains unapplied in both hosted projects.

## Vercel configuration

The Vercel connector's advertised `projectId` field failed validation for missing `idOrName`; the working alternative is the authenticated CLI linked by `.vercel/project.json` to project `prj_cZr8idNgoGky6Lg75OfDjrhSDkNp`, team `team_2ejXKYjjGXIFsIQTUMEqZ8Cf`.

`vercel env ls production` confirms Production-scoped names for existing DBP `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL` and existing CRM Stripe variables. No BuyerMatch-specific `BM_*`, `BUYERMATCH_IDENTITY_KEY` or Resend variable was listed. Existing CRM Stripe values are not proof that BuyerMatch billing is enabled. Values, secret equality across environments and deployed database credentials remain unverified. Automatic approval review rejected downloading all Production environment values because it would retrieve service-role/provider secrets; that action was not executed or bypassed. The metadata-only audit already establishes missing BuyerMatch configuration.

Required receiver configuration remains documented in the handoff. Future live outreach additionally needs `BM_LIVE_DELIVERY_ENABLED=true`, `BM_DELIVERY_MODE=resend`, `RESEND_API_KEY`, `BM_RESEND_FROM`, independent `BM_RESPONSE_SECRET`, `BUYERMATCH_IDENTITY_KEY`, `BM_WORKER_SECRET`, and an exact HTTPS `BM_APP_ORIGIN` matching `PUBLIC_APP_URL`. Production project/receiver checks must pass and `BM_CHECKOUT_ENABLED=false` remains required. The database's `bm_production_delivery_config.enabled` also defaults false. None of these enablements was installed. Do not enable them until schema, provider identity/domain and actual provider verification are complete.

## Issuance and delivery architecture

No manual Copy/Share feature was added. The existing authenticated distribution route verifies the current user owns the deal, then selects the Production queue RPC only under explicit Production configuration. Caller-supplied owner, workspace or buyer fields do not redirect the operation. The queue reuses the existing transactional entitlement, contract, consent, analysis, agreement and policy checks; it rejects synthetic recipients atomically. The immutable exposure is the server-selected match and owner binding.

The private issuer validates owner/deal/exposure, the authorized distribution request, buyer eligibility, terminal state and capability revocation/environment before claiming work. It mints one Production-scoped capability per exposure using the existing response contract. There is no caller-controlled response scope: the existing four allowed actions are stored by the database. A revoked/expired or staging capability is never silently overwritten. Private identity is decrypted only inside the server delivery worker and is not returned by the user API.

Lifecycle:

1. Authorized distribution creates pending outbox intent and returns `queued`, `sent:false`.
2. Worker acquires a bounded lease and records an attempt; capability creation does **not** set acceptance.
3. Configured Production provider sends with stable `bm-production-<exposure>` idempotency key. Only a successful provider response with a message ID permits completion.
4. Receipt persistence sets `accepted_at`/accepted state, separately from webhook-confirmed delivery. The receiver's accepted-outbox requirement remains unchanged.
5. Failure or ambiguous receipt persistence returns pending with a retry code; retries retain the capability and provider key. Stale worker leases cannot complete a newer claim. Beyond the existing 23-hour retry window, reconciliation is required instead of blindly re-sending.
6. Revocation prevents new issuance/response; opt-out or eligibility loss suppresses unaccepted work. An in-flight provider request cannot be unsent; acceptance records actual provider receipt, while the response still checks revocation/terminal state.

The provider module separates issuance/lease persistence from transport. Runtime API/worker callers construct the real adapter internally; request bodies cannot inject transport or a fixture database. Test transport injection exists only in local test calls/bundles. Production cannot instantiate the staging synthetic provider. The existing signed Svix callback now has an explicit disabled-by-default Production configuration branch; signature validation precedes writes, unknown receipts request reconciliation, and callback fields exclude private recipient data. Edge functions have not been deployed by this run.

## Providers and monetization

Resend code supports provider receipt validation, stable idempotency, signed callbacks and ambiguous-delivery reconciliation. Actual account authorization, API key, verified sending domain/address and webhook setup remain unverified. The exact blocked action is logging into the private Resend account through GitHub to configure/inspect those resources; the earlier approval rejection was not bypassed. No live send is claimed. A permitted provider test must establish actual acceptance, delivery, callback and retry behavior before enablement.

BuyerMatch checkout and success fees remain disabled. Existing CRM Stripe integration is separate. Deal saving/owned views can operate without Stripe if the schema exists; matching and distribution still require explicit active entitlements and allowances. Disabling checkout does not create free paid entitlements. Production checkout continues failing the staging-only checkout guard; no live billing adapter or fee enablement was introduced.

## Verification and remaining gates

78 local automated tests pass, including unchanged response races plus new issuer authorization, scope/environment rejection, concurrent claim serialization, no acceptance before receipt, stale lease denial, provider failure/retry/success, acknowledgement privacy and Production signed callback checks. PGlite uses one connection: these local concurrent-shaped claims are not claimed as real multi-session Production concurrency verification. The existing hosted response concurrency suite remains required on the candidate Preview. The 21 fixture Production-mode HTTP assertions remain part of the passing suite; they do not connect to Production.

TypeScript/build passed. Full lint and final candidate staging results are reported with the run. Existing warnings include repository lint warnings and Vite chunk/import warnings. The new migration is local only and is not included in the 41 already-applied staging checksums; setup verification must explicitly distinguish this pending source rather than pretend 42 have been installed.

Before Production can be considered ready:

1. Reconcile the 13 additional Production legacy migrations listed in the audit with this branch and the deployed application. The database is restored and the read-only comparison is complete.
2. Review missing migrations and populated-table risks; apply only the reviewed deployment plan.
3. Configure and verify required Production categories securely in Vercel; do not paste secrets into chat.
4. Finish provider authorization and controlled provider verification, then explicitly enable the approved sender/database boundary.
5. Verify the exact candidate, real database locking/concurrency, and safe enabled Production workflows before any Production deployment/smoke claim.

The remaining blockers are **not solely Resend authorization**: the missing complete BuyerMatch schema, unreconciled newer legacy baseline, unavailable historical source checksums and missing/unverified Production configuration remain independent blockers.

## Restored-project verification refresh

Local verification passed again: **78/78 tests**, including **21/21 fixture Production-mode assertions** (a nested assertion count, not 21 additional test cases). TypeScript/build passed. Lint: **0 errors, 103 existing warnings**. No application or security code changed during this audit; previously passed browser/two-tab results remain prior evidence rather than newly executed browser results. Fresh exact-commit Preview and hosted assertion results are reported with the final run. Production smoke tests are blocked and were not run.

Staging migration verification: the installed **41/41** source checksums match the committed baseline. The standard full setup `--verify-only` correctly **fails** with `Missing staging migration: supabase/migrations/20261003001913_buyermatch_production_outbox.sql`; the current source set contains 42 entries. This is an explicitly pending migration, not a checksum mismatch. No verifier was weakened and no hosted migration was applied.
