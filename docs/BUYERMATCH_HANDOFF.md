# BuyerMatch staging handoff

Branch: `codex/buyermatch-network`. Engineering is in the working tree. **No production migrations, live charges, real buyer sends, or success fees have been enabled. No hosted preview exists for this implementation yet.**

## Implemented

- Existing DBP React/Vite shell, Supabase login and server-side owner-admin authorization. User routes `/app/buyermatch`, `/app/buyermatch/plans`, `/app/buyermatch/deals/:id`; admin route `/app/buyermatch/admin`.
- Server-only matching, anonymous cohort results, price sensitivity, independent product allowances, atomic usage and retry keys. Private buyer identities are encrypted at rest and excluded from regular-user responses, including offer terms and event evidence.
- CSV mapping/normalization/import history; exact-email skip; normalized phone and company/principal duplicate candidates; evidence-backed admin distinct/merge decisions. Activation requires resolving candidates. Merges retain aliases, opt-outs and audit records. Buyers already exposed cannot be merged automatically because their attribution needs manual reconciliation.
- Approved recurring Stripe **test** price catalog and hosted subscription checkout. Price IDs/amounts come from Stripe, never from the browser. Checkout reservations and provider idempotency keys survive retries. Existing sessions are rechecked against Stripe before reuse; expired sessions reconcile. Separate plan buttons have separate operation keys. An existing Stripe-linked entitlement must be managed in Stripe, even when inactive, to prevent accidental duplicate subscriptions. Signed billing events require a server checkout mapping and update only BuyerMatch/Network entitlements. Live events/keys are refused for these products. Existing CRM webhook routing remains separate.
- Private PSA/settlement uploads, versioned agreement signatures, contract review, title/EOC updates, immutable exposure and allowance reservation, internal reminder queue.
- Delivery worker at `/api/buyermatch-worker` and admin “Run synthetic delivery batch” control. Modes: `mock` or `resend-test`. Both require staging and synthetic buyers. Resend mode hardcodes `delivered@resend.dev`; there is no real-recipient configuration path. Retries use a stable exposure key and response token. After 23 hours an ambiguous attempt requires reconciliation rather than another send.
- Signed Resend delivery callback via `buyermatch-delivery`; delivery and provider acceptance are separate. Event replay is deduplicated; bounce/complaint/opt-out suppress future sends. Opens/clicks never create buyer interest.
- Buyer capability response page `/buyer-response#<token>` for interest, offers, pass and unsubscribe. Stable signed tokens are stored only as hashes, expire, and bind to one accepted exposure. Private identity is never sent to this page. Response replay does not duplicate offers.
- Buyer selection, title opened, scheduled closing, user signature, title acknowledgement, reported closing, verified settlement and payment remain separate states. Database constraint prevents enabling success fees. Deal edits and contract reviews lock the same database row as closing/distribution; stale evidence and concurrent terminal-state changes cannot reopen a deal.

## Exact setup steps

Use an isolated **new empty** Supabase project; do not clone buyer data or use the production project `aigvnbxiydbzzqbetlhl`. Values below belong in a protected local environment/secret manager and the specified dashboards. **Do not paste secrets into chat, Git, screenshots or browser code.**

1. Create a project at [Supabase New Project](https://supabase.com/dashboard/new), named `dbp-buyermatch-staging`. Save its project reference as `BM_STAGING_PROJECT_REF`. In the project dashboard, **Connect** gives the PostgreSQL connection string; save it as `BM_STAGING_DATABASE_URL`. Use `db.<STAGING_REF>.supabase.co` or the session pooler host with username `postgres.<STAGING_REF>`. Keep TLS verification enabled; if required, download the database CA certificate and set `BM_DATABASE_CA_FILE` to its local path. The script rejects production, a mismatched host/ref, and any existing non-staging app schema.

2. Open [Supabase Dashboard](https://supabase.com/dashboard) → staging project → **Settings → API Keys** (`https://supabase.com/dashboard/project/<STAGING_REF>/settings/api`). Set `SUPABASE_URL=https://<STAGING_REF>.supabase.co`, `VITE_SUPABASE_URL` to the same value, `VITE_SUPABASE_ANON_KEY` to the public anon key, and `SUPABASE_SERVICE_ROLE_KEY` to the **server-only** service-role key. Create an ignored `.env.buyermatch-staging` file using `.env.buyermatch-staging.example` as the names reference. Do not copy the existing production `.env.local`. Set `BM_ENVIRONMENT=staging` and `BM_STAGING_CONFIRM=I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION`.

3. In that protected local file configure:
   - `BUYERMATCH_IDENTITY_KEY`: random 32-byte key, base64 encoded; preserve it across redeployments.
   - `BM_RESPONSE_SECRET` and `BM_WORKER_SECRET`: independent cryptographically random secrets of at least 32 characters. Keep the response secret stable across retries.
   - `BM_TEST_USER_EMAIL=user@example.invalid`, `BM_TEST_OTHER_EMAIL=other@example.invalid`, `BM_TEST_ADMIN_EMAIL=admin@example.invalid`.
   - `BM_TEST_USER_PASSWORD`, `BM_TEST_OTHER_PASSWORD`, `BM_TEST_ADMIN_PASSWORD`: separate random passwords, each 16+ characters.
   - `DEALBLAST_OWNER_ADMIN_EMAILS=admin@example.invalid`. Neither regular account belongs in this list. The existing hardcoded DBP owner email is preserved by the existing authorization helper; the seed does not create that account.

4. From this repository, with Node 22+ and dependencies installed, run:

   ```powershell
   npm ci
   node --env-file=.env.buyermatch-staging scripts/setup-buyermatch-staging.mjs
   node --env-file=.env.buyermatch-staging scripts/seed-buyermatch-staging.mjs
   ```

   The setup applies `supabase/staging/000_baseline_prerequisites.sql`, **all** historical DBP migrations in filename order (including nine BuyerMatch migrations), then `999_staging_access.sql`. The prelude reconstructs two missing legacy table contracts from repository usage; this is a fresh QA baseline, not a production schema export. Supabase supplies Auth/Storage itself. A project marker, per-file checksums and transaction ledger make retries reproducible; changed applied migrations fail closed. Do not combine this runner with `supabase db push` or production migration commands. An incompatible/partially modified existing schema requires a new empty staging project.

   The seed creates three confirmed Auth users without sending email, their DBP profiles/workspaces, separate allowances, one synthetic deal per user, six synthetic unverified buyers, and clearly labeled **QA-only** documents. All three own workspaces with the existing `Admin` workspace role; only the server allowlisted account administers the private network. QA documents are not counsel approval or fee authorization. Fixture consent/config enables only guarded test delivery; fees stay false. Rerunning preserves usage, reviewed buyer state and existing fixture passwords. To change a password, use **Authentication → Users** in staging. Non-fixture accounts are never reused.

5. Open [Vercel Dashboard](https://vercel.com/dashboard), select the existing **deal-blast-pro** project (project ID `prj_cZr8idNgoGky6Lg75OfDjrhSDkNp`, team ID `team_2ejXKYjjGXIFsIQTUMEqZ8Cf`). In **Settings → Environment Variables**, scope the following to **Preview / branch `codex/buyermatch-network` only**:

   | Browser variables                             | Server-only variables                                                                                                                                                                                                                                                                 |
   | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BUYERMATCH_IDENTITY_KEY`, `DEALBLAST_OWNER_ADMIN_EMAILS`, `BM_ENVIRONMENT`, `BM_STAGING_PROJECT_REF`, `BM_APP_ORIGIN`, `BM_RESPONSE_SECRET`, `BM_WORKER_SECRET`, `BM_DELIVERY_MODE`, `BM_CHECKOUT_ENABLED`, `BM_STRIPE_TEST_SECRET_KEY` |

   Start with `BM_DELIVERY_MODE=mock`, `BM_CHECKOUT_ENABLED=false`, `DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS=false`. Do not add test passwords or the database URL to Vercel. Override any inherited production Supabase/Stripe/provider values for this branch. New variables require redeploying. [Vercel environment guidance](https://vercel.com/docs/environment-variables/manage-across-environments).

6. Connect/authenticate the existing Vercel project for deployment, then deploy this branch as **Preview**. The agent can do this once the staging values and Vercel access are available. CLI fallback from this branch is `npx vercel deploy` (never `--prod`). Verify the deployment target is Preview in the dashboard. Use its stable branch preview hostname for `BM_APP_ORIGIN=https://<BRANCH-PREVIEW>.vercel.app`, then redeploy. The code refuses the production hostname. In staging Supabase **Authentication → URL Configuration** (`https://supabase.com/dashboard/project/<STAGING_REF>/auth/url-configuration`), set the Site URL to that preview origin and add `<PREVIEW_ORIGIN>/auth/callback`. Do not apply the repository's production Auth URL config to staging. Add Vercel Preview protection bypass secret as **local-only** `VERCEL_AUTOMATION_BYPASS_SECRET` if automated requests require it; interactive testers can use Vercel authentication.

7. Create/select an isolated sandbox in [Stripe Dashboard](https://dashboard.stripe.com/) (sandbox selector), then **Product catalog**. Create two explicitly labeled synthetic QA fixed-amount USD recurring prices, one BuyerMatch and one Network, with amounts you choose for testing; no provisional live price is published. Copy the sandbox key from [Stripe Test API Keys](https://dashboard.stripe.com/test/apikeys) into **Vercel Preview** `BM_STRIPE_TEST_SECRET_KEY` and **staging Supabase Edge secrets** `STRIPE_SECRET_KEY`; both must be `sk_test_` or `rk_test_` from the same sandbox. Restricted keys need price read and Checkout Session write/subscription read access. In preview, log in as the admin fixture, expand **Plans, agreements & fee policies**, create approved versioned plans with `product`, `allowance`, `label`, and their `price_...` IDs. No plan price is hardcoded in source. If testing paid Network distribution, also create a **disabled** TN fee-policy version for that plan, referring to the QA fee document; the seeded policy only matches `staging-only-v2`.

8. In [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks), add the staging endpoint `https://<STAGING_REF>.supabase.co/functions/v1/stripe-webhook`. Subscribe to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, and `charge.refunded`. Set its signing secret as `STRIPE_WEBHOOK_SECRET` in staging **Edge Functions → Secrets** (`https://supabase.com/dashboard/project/<STAGING_REF>/functions/secrets`). Also set `BM_ENVIRONMENT=staging` and `BM_STAGING_PROJECT_REF`. Supabase supplies its own `SUPABASE_URL`/service-role key inside Edge Functions. Deploy only the named functions, to the explicit staging ref:

   ```powershell
   npx supabase login
   npx supabase functions deploy stripe-webhook --project-ref <STAGING_REF> --no-verify-jwt
   npx supabase functions deploy buyermatch-delivery --project-ref <STAGING_REF> --no-verify-jwt
   ```

   `--no-verify-jwt` lets the providers reach these endpoints; the handlers require Stripe/Svix signatures on the raw request body before applying changes. Do not deploy all functions, link production, or push Auth configuration. Use the secret dashboard, or an ignored Edge-only env file with `supabase secrets set --env-file <FILE> --project-ref <STAGING_REF>`. [Supabase secrets](https://supabase.com/docs/guides/functions/secrets). Finally set `BM_CHECKOUT_ENABLED=true` in Vercel Preview and redeploy.

9. For actual provider verification, create a staging key at [Resend API Keys](https://resend.com/api-keys); add `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` to Vercel Preview only. At [Resend Webhooks](https://resend.com/webhooks), add `https://<STAGING_REF>.supabase.co/functions/v1/buyermatch-delivery`, subscribing to sent/delivered/delivery-delayed/bounced/complained/suppressed/opened/clicked events. Save its Svix signing secret as `BM_RESEND_WEBHOOK_SECRET` in staging Supabase Edge secrets. Set `BM_DELIVERY_MODE=resend-test` and redeploy Preview. The sender may use `Deal Blast Pro <onboarding@resend.dev>` for the test recipient, or a verified staging sender. The recipient is always `delivered@resend.dev`. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

10. Run real staging verification using the protected local file (now including `BM_APP_ORIGIN`):

    ```powershell
    node --env-file=.env.buyermatch-staging scripts/verify-buyermatch-staging.mjs
    ```

    It signs in all three fixtures, uses real API/Storage requests, creates a fresh synthetic deal, checks privacy/denials, consumes one analysis and one network allowance, uploads PDFs, signs QA agreements, retries distribution, dispatches a synthetic batch, posts/replays an offer, extends EOC and verifies closing. It saves a non-secret report and synthetic PDF under ignored `test-artifacts/`. It requires the seeded synthetic network and default synthetic entitlement/policy; run before changing its Network entitlement to a paid QA plan, or configure that plan's disabled policy first. Hourly query/period quotas still apply. It does not automate payment-card entry or claim browser verification.

## Browser/provider acceptance checklist

After the HTTP runner passes, verify at the actual Preview URL:

1. Regular user sign-in: save/edit/analyze, price scenarios, allowance change and safe network response in browser traffic. Other user cannot open the deal, retrieve upload URLs, download private PDFs, or call admin actions. Direct anon/authenticated network table access denies.
2. Admin sign-in: CSV mapping, duplicate-email skip, phone/company candidates, evidence-backed distinct decision and merge. Review a PSA via a temporary private link. Imported records are inactive/unverified and never gain `synthetic=true` from CSV. Only seeded synthetic recipients can pass the test worker guard.
3. Plans: open Stripe **test** Checkout, use Stripe's test payment details, and return to the app. The return URL itself grants nothing; signed webhook delivery must update allowance. Replay signed events; test payment failure, cancellation, expiration and refund. Confirm CRM assignment/credits did not change. Completing the same purchase must not double-create a subscription. After a canceled/expired checkout, refresh before starting a new one; ambiguous sessions older than 23 hours require sandbox reconciliation.
4. Upload PSA and settlement PDFs, confirm type/size restrictions in actual Supabase Storage and cross-owner/public denial. Accept each QA agreement. Before admin approval distribution denies; after approval it queues exactly once.
5. Run the synthetic batch, confirm one provider message per exposure, then replay/run again. Resend acceptance and signed delivery timestamps must be distinct. For a retry failure, temporarily remove the **staging** Resend key, dispatch, restore it and retry within 23 hours; verify one message. Inspect `reconciliation_required` instead of forcing a retry beyond that window. No live dispatch mode exists.
6. Select an accepted exposure and use **Open selected synthetic buyer response**. Submit interest, an offer, replay, pass and unsubscribe. Verify generic public timeline/offer amount and private admin evidence; opt-out suppresses future jobs. Use a disposable seeded buyer for opt-out tests; rerunning seed intentionally does not erase opt-outs. Invalid/expired/revoked links deny. Email opens alone never count as interest.
7. Extend EOC, repeat contract review and verify the 14/7/3/0/-3 reminder schedule resets. Inspect buyer selection → closing authorization → title acknowledgement → scheduled closing → user report (pending) → verified settlement (closed). Fees and payment remain disabled/unpaid, and terminal deals cannot regress.

The worker is explicitly invoked through the admin screen or `POST /api/buyermatch-worker` using `Authorization: Bearer <BM_WORKER_SECRET>` from secure server configuration. No production cron, external reminders or automatic real sends are installed. A staging scheduler may invoke this same endpoint after the preview is configured; do not put its secret in a URL. Batches process up to 20 jobs. Ambiguous expired idempotency windows require inspecting provider receipts; never clear `first_attempt_at` just to force another send.

## Current verification and blockers

58 local tests passed after the authorization/privacy/checkout review. Production build passed. Full repository lint has no errors (103 existing warnings); targeted BuyerMatch lint is clean. Local browser checks passed for missing-token handling, offer-field rendering and editing, token removal from the URL, and unavailable-service handling. These are local UI checks, not authenticated hosted verification.

Local coverage includes the full fresh migration chain, actual seed twice, authenticated API ownership/admin guards with fixture Auth, private table privileges, matching/privacy/unknown criteria, quotas/concurrency, agreements, outbox leases/retries, signed Stripe/Svix handlers, buyer response idempotency/opt-outs, duplicate audit/merge, EOC recalculation and closing state separation. These tests use local PostgreSQL (PGlite), fixture Auth/Storage and mocked provider transport; they do **not** prove hosted Auth, Storage or provider connectivity.

Pending external resources: staging project/secure keys, three seeded test accounts, Vercel authenticated deployment access and branch environment, Stripe sandbox prices/signing configuration, and (for delivery callbacks) Resend test integration. Until those exist, **Preview URL: unavailable** and authenticated browser/hosted integration verification is blocked. The runner and checklist above are ready to execute once connected.

Before production: real legal/jurisdiction review, any lawful real-send design, identity-key rotation, larger-network capacity, and payment/tax launch review remain separate. This branch intentionally contains no live sender switch or success-fee enablement path. The baseline is a fresh staging contract, not a certification that all unrelated legacy CRM features have been regression-tested.
