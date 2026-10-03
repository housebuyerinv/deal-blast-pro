# BuyerMatch Production readiness audit

Status: **BLOCKED — Production schema and configuration are not ready/verified.**

This continues application commit `2cf5a6e5669f2f4e730a04e04791ddaa83a08dd6`. No Production data, configuration, migration, function or deployment has been changed. No live provider request was made.

## Read-only Production findings

The connected Supabase project `aigvnbxiydbzzqbetlhl` is named `deal-blast-pro`, region `us-east-1`, database host `db.aigvnbxiydbzzqbetlhl.supabase.co`. Despite the reported restoration, two project-status reads during this run returned `INACTIVE`. The supported migration-list operation and a narrow information-schema query both failed with connection timeout. This is a database availability/connection failure, not evidence of a slow BuyerMatch query or missing tables. Restoration may still be pending or the connector may have stale status; its exact cause cannot be established from these results.

The current 41-source staging baseline consists of 29 legacy migrations, 10 BuyerMatch migrations and two staging-only bootstrap/access sources. The exact expected paths and canonical-LF SHA-256 checksums are in `BUYERMATCH_SCHEMA_BASELINE.json`. Production-applied versions/checksums, missing migrations, drift and constraint/index differences are **unknown**, not zero. The staging-only bootstrap/access sources must never be blindly applied to Production. No migration was applied while this comparison remains incomplete.

Required schema includes owner-bound deals; unique immutable `(deal_id,buyer_id)` exposures with buyer/deal foreign keys; one outbox per exposure and unique provider receipts; token hash primary key and unique exposure/capability UUID; immutable token environment/actions; expiry/revocation; response operation uniqueness; append-only offers/events; active entitlement/allowance and agreement checks; token/deal/buyer response locking; terminal deal state protection. Local migration tests verify these contracts, but do not establish live Production state.

Migration risks requiring live comparison: `20260930140000` replaces the analysis RPC signature and drops the older overload; existing callers must be checked. `20261001090000` adds the success-fees-disabled check and may reject incompatible existing configuration. `20261002190115` adds a volatile UUID default plus uniqueness to existing tokens, potentially rewriting/scanning a populated table under DDL locks. The new `20261003001913_buyermatch_production_outbox.sql` adds a disabled configuration table, nullable lease UUID and private RPCs; it contains no destructive data operations, but ALTER TABLE still needs a lock. Production row counts, lock impact and compatibility cannot be certified while inaccessible.

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

1. Restore/confirm the exact Supabase Production project at https://supabase.com/dashboard/project/aigvnbxiydbzzqbetlhl and complete read-only schema/ledger comparison.
2. Review missing migrations and populated-table risks; apply only the reviewed deployment plan.
3. Configure and verify required Production categories securely in Vercel; do not paste secrets into chat.
4. Finish provider authorization and controlled provider verification, then explicitly enable the approved sender/database boundary.
5. Verify the exact candidate, real database locking/concurrency, and safe enabled Production workflows before any Production deployment/smoke claim.

The remaining blockers are **not solely Resend authorization**: Production schema availability and missing/unverified configuration remain independent blockers.
