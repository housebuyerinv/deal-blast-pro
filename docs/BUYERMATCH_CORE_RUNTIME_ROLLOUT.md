# Core runtime rollout: integrations disabled

Status: **BLOCKED — PRODUCTION RUNTIME**. Core configuration is prepared; Production application deployment is withheld because this branch would remove newer deployed DBP functionality. Resend is not the only release blocker.

## Deployment baseline gate

Current Production: commit `029939becdc330f4d3d4c5296895dcb62eb1d6ca`, branch `codex/public-features-showcase`, deployment `dpl_5pC9BVLpJiEfEi6AK5nQgfZz3Q7t`, domain https://deal-blast-pro.vercel.app. Compared with starting BuyerMatch commit `cb85607a1581132b966702676cc15160f0df0d07`, the API/src diff spans 76 files and removes 26 existing files. It affects App routing, account authorization helpers and workspace persistence as well as newer features. A verified additive database migration does not establish application compatibility.

Removed deployed files include `api/email-operations.ts`, `api/_emailOperations.ts`, `api/property-intelligence/pro-trial-checkout.ts`, `src/components/admin/AdminCreditOperations.tsx`, `src/components/admin/AdminCustomerLifecycle.tsx`, `src/lib/appPersistence.ts`, `src/lib/inventoryStorage.ts`, `src/lib/ownerPreviewSession.ts`, `src/pages/app/HotZones.tsx`, `src/pages/app/WhatsNew.tsx`, `src/pages/public/Features.tsx`, `src/pages/public/ResetPassword.tsx`, and `src/pages/public/VerifyEmail.tsx`. See `git diff --name-status 029939becdc330f4d3d4c5296895dcb62eb1d6ca HEAD -- api src` for the complete list.

Required release work: integrate the deployed application baseline into the BuyerMatch branch while preserving both sets of changes, resolve App/store/auth integration deliberately, then run legacy app and BuyerMatch regressions against a new exact-commit Preview. Do not deploy this branch as-is or assume schema compatibility fixes missing application features. The unrelated legacy `deal_submissions` RLS review remains separate.

## Production configuration inventory

Scope below is Vercel **Production**, unless marked otherwise. Values of secrets were neither retrieved nor printed. Existing CRM credentials were not overwritten. New encryption/HMAC secrets were generated independently with cryptographic randomness and passed to the CLI through stdin, stored as sensitive server variables, and never written to an environment file or Git. Metadata verification confirmed the listed names after creation.

| Name | Required for / safe initial state | Missing behavior | Production presence |
|---|---|---|---|
| `VERCEL_ENV` | Platform-provided environment binding | Production branches require exact production value | Platform-managed; not user-set |
| `BM_ENVIRONMENT` | Receiver/issuer environment; production | Receiver/issuer fail closed | Added |
| `BM_PRODUCTION_PROJECT_REF` | Receiver/issuer project binding; exact Production ref | Receiver/issuer fail closed | Added |
| `SUPABASE_URL` | Receiver project binding; exact Production URL | Receiver fails closed | Added |
| `VITE_SUPABASE_URL` | Browser/core DB connection; Production URL | Frontend/core cannot operate reliably | Existing; public deployed bundle confirms Production ref and no staging ref |
| `VITE_SUPABASE_ANON_KEY` | Public browser Auth client | Browser Auth unavailable | Existing; value not changed |
| `SUPABASE_SERVICE_ROLE_KEY` | Server DB/Auth/Storage operations | API unavailable | Existing sensitive variable; not retrieved |
| `BUYERMATCH_IDENTITY_KEY` | Required for private identity encryption/decryption; 32-byte base64 server secret | Import/decryption fail | Added sensitive; no reuse of staging secret |
| `BM_RESPONSE_SECRET` | Required HMAC issuance and semantic response keys; independent server secret >=32 characters | Issuance/response operation key fail | Added sensitive |
| `BM_RESPONSE_ENABLED` | Explicit receiver enablement; true for prepared core runtime | Production receiver rejects | Added; saved configuration is not proof of a deployed receiver |
| `BM_APP_ORIGIN` | Invitation origin when delivery is later enabled; canonical Production HTTPS origin | Issuer rejects | Added |
| `PUBLIC_APP_URL` | Existing app URL; live issuer requires exact equality with BM_APP_ORIGIN | Issuer rejects mismatch | Existing; stored-value equality not read/verified; sender remains off |
| `BM_DELIVERY_MODE` | Explicit delivery mode; disabled | Production receiver rejects unknown mode; issuer rejects | Added: disabled |
| `BM_LIVE_DELIVERY_ENABLED` | Optional live provider gate; false | Issuer/worker reject | Added: false |
| `BM_WORKER_SECRET` | Required only for worker execution; leave absent for core | Worker returns 401 | Absent intentionally |
| `DEALBLAST_OWNER_ADMIN_EMAILS` / `SUPER_ADMIN_EMAILS` | Optional existing server-side network-admin allowlist | Existing owner-email fallback remains; workspace role alone does not grant access | Not listed; not broadened |
| `RESEND_API_KEY` | Required only for permitted live/test provider transport | Real send fails; never marks accepted | Absent in Production metadata |
| `BM_RESEND_FROM` | Required live sender | Live issuer rejects | Absent |
| `BM_RESEND_WEBHOOK_SECRET` | Required signed delivery callback; Supabase Edge secret scope | Callback rejects invalid/missing signature | Not configured/verified for Production Edge function |
| `BM_CHECKOUT_ENABLED` | Explicit BuyerMatch purchase gate; false | Checkout unavailable | Added: false |
| `BM_STRIPE_TEST_SECRET_KEY` | Staging-only sandbox checkout; never Production | Test client rejects | Absent in Production |
| `STRIPE_SECRET_KEY` | Existing CRM integration, independently scoped Edge webhook credential | Existing billing handler unavailable if missing | Existing CRM variable; not reused or altered for BuyerMatch |
| `STRIPE_WEBHOOK_SECRET` | Signed Stripe Edge webhook; separate isolated sandbox required for BuyerMatch testing | Unsigned/invalid events rejected | Production Edge value not retrieved or changed |
| `BM_STAGING_PROJECT_REF` | Staging-only identity binding | Staging operations reject | Absent in Production |
| `NOTIFY_FROM_EMAIL` | Optional staging Resend test-sink sender | Test sender default used | Not added to Production |
| `BM_STAGING_CONFIRM`, `BM_STAGING_DATABASE_URL`, `BM_TEST_*` | Local setup/seed/test configuration only | Local setup refuses unsafe/missing configuration | Not added to Production |
| `BM_PREVIEW_SHARE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET` | Local protected-Preview verification only | Protected Preview runner needs authorized access | Not added to Production; local access file ignored/untracked |

No generic `BM_ENABLED`, `BM_SUCCESS_FEES_ENABLED`, `BM_SYNTHETIC_ENABLED` or fixture-transport switch exists in this implementation; do not create ineffective flags. Fixture DB/transport substitution is restricted to test bundles, not selected by HTTP parameters or runtime environment variables.

Database gates remain independent and false: `bm_configuration.distribution_enabled`, `provider_verified`, `permissions_verified`, `agreements_verified`, `success_fees_enabled`, and `bm_production_delivery_config.enabled`. Matching still requires explicit active product entitlements/allowances; disabled checkout does not grant free paid access. Saving an owned deal is separate from paid analysis/distribution.

## Code changes and fail-closed behavior

The plans API now returns server-computed delivery availability based on both environment validation and database approval flags. Missing/mismatched configuration advertises disabled delivery. Production never advertises synthetic delivery, even if staging flags are supplied. Existing mutation authorization/configuration guards remain unchanged.

The UI disables the distribution request button when unavailable, hides synthetic dispatch/response-link controls outside authorized staging delivery, hides checkout actions when unavailable, and describes disabled states without claiming that a Production app is a test preview. Success fees remain disabled. These UI flags supplement server enforcement; they do not authorize requests.

Receiving remains environment-scoped, immutable exposure-bound, action-limited and expiry/revocation checked. Public responses return acknowledgement only and still require accepted outbox state. Queued/token-created/failed records cannot manufacture acceptance. Synthetic issuance and fixture transport remain unavailable in Production. This run does not claim hosted Production application verification from passing fixtures or metadata.

## Provider milestones remain separate

**Resend:** no callable Resend account connector is available in this session; prior private-account authorization rejection remains unresolved and was not bypassed. No key/sender/domain or Production callback has been verified. Implementation supports provider receipts, stable exposure idempotency and signed callback reconciliation, but actual provider acceptance/delivery/retry verification remains required. Required user action: authorize access to the intended private Resend account at https://resend.com/login; verify the sender domain at https://resend.com/domains; configure a restricted key and signed callback through secure provider/environment settings, never chat. Begin with the isolated staging test sink. Do not turn on the live flags until sender identity, callbacks and authorized sends pass.

**Stripe:** the account-list connector twice returned “Authentication for Stripe was requested and accepted. Retry this tool call now,” without enumerating accounts. No account context or sandbox was selected. Required user action for a later payment milestone: reconnect/authorize the Stripe connector and identify an isolated sandbox in https://dashboard.stripe.com/sandboxes. No account-specific operation was attempted.

BuyerMatch checkout currently supports only isolated staging test keys and approved fixed USD recurring Price IDs stored in `bm_plans.stripe_price_id`, independently for buyermatch/network product entitlements. It reserves a durable checkout identity, reuses provider idempotency, validates session ownership, rejects completed/expired duplicates and requires reconciliation beyond provider retention. Billing events require verified signatures, test mode, staging project binding and event deduplication. Existing CRM live keys/prices are not a BuyerMatch live-billing implementation. Production BuyerMatch billing intentionally fails closed. Independent sandbox lifecycle/webhook verification and a reviewed live-billing implementation are still needed before monetization.

Success fees are not merely hidden: the database constraint requires disabled configuration; state transitions require verified settlement, signed authorization, title acknowledgement and enabled policy/configuration. No success-fee collection path is enabled. No charge or real-recipient send occurred.

## Verification limits and remaining release gates

Production database schema installation is already verified (53 migrations, 24 private tables, 21 private SECURITY DEFINER RPCs). Prior hosted database checks verified disabled queue/issuer/worker behavior and invalid capability rejection in a rollback-only transaction. No positive hosted Production HTTP issuer/queue/response lifecycle or browser smoke test is claimed: the candidate application has not been deployed. Testing through a disabled gate does not prove the authorization behind it.

Local issuer/lease/callback/replay tests and the 188-assertion schema rehearsal remain evidence for implementation behavior, not a substitute for hosted authenticated acceptance. Keep the accepted-outbox requirement; do not seed fake Production delivery acceptance to obtain a passing smoke test.

The in-app browser failed to initialize with `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`; fresh browser/two-tab verification could not run. Existing passed browser results predate this UI change. Retry with a functioning browser harness before release.

Before deployment: preserve the deployed DBP application features, verify the exact integrated Preview including legacy auth/persistence, prepare safe regular/other/admin Production test accounts through the existing authorization model, then complete hosted API and browser checks under the prepared core configuration. Keep delivery/payment disabled. Production deployment remains `dpl_5pC9BVLpJiEfEi6AK5nQgfZz3Q7t`; new Vercel environment settings apply only to a future deployment.

Final test totals and exact Preview candidate are reported with this run. Production must not be labeled deployed-and-verified until that separate deployment and smoke test actually succeeds.
