# BuyerMatch Milestone 1B: integration and release checklist

## Scope and provenance

Integration branch: `codex/buyermatch-1b-integration`, based on public discovery
`3adffee58258a01d13e34795c3c7ee4d4a652094`, merged with tested registration repair
`a722fca5eff8164cdf98b9e584636b1b1d0fbd3b` without conflicts (merge `6209952`).
PR base is the remote `codex/buyermatch-network` at Production core baseline
`501cb6a4566211f6828633f862163420fed9c016`. This is an integration review, not
permission to merge into the Vercel Production branch or release.

Production alias was independently inspected read-only and still resolves to
containment `dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE`.

## Implemented journey

- Public BuyerMatch Starter/Pro links and contextual desktop/mobile navigation
  enter explicit product/tier signup. Existing CRM users use product-specific login.
- HMAC-signed, identity-bound, expiring registration intent includes product/tier.
  BuyerMatch signup forces CRM `Free`; body-supplied paid CRM plans cannot change it.
  Existing version-1 CRM intents remain valid. Intent does not grant a subscription.
- Server-verified read-only registration status avoids provisioning on existing
  customer login, including when registration POSTs are paused. Missing accounts
  still require confirmed Auth identity and the tested atomic create-only RPC.
- Confirmation derives a fixed internal BuyerMatch destination from verified intent.
  Query parameters select navigation only, never access or arbitrary return URLs.
  Recovery/email-change paths remain separate. Stale local signup hints do not
  replace an existing customer's workspace.
- Current approved platform terms/privacy are displayed and acceptance is captured
  using existing version/hash/signature evidence. Checkout verifies consent server-side.
  Missing, changed or unavailable agreements fail closed. Deal-specific agreements
  remain required by existing distribution logic; no invented legal text is published.
- Existing idempotent Stripe checkout and signed webhook remain authoritative.
  Checkout returns/cancellation never activate access. Payment failure, pending
  verification and retry have explicit UI states and refresh.
- BuyerMatch billing resolves the verified owner's entitlement, original checkout,
  Stripe subscription and customer; it never reads CRM customer assignments.
  Shared/foreign customers, incomplete inventories and mode mismatches fail closed.
  Stripe deep links handle payment-method updates, cancellation and approved tier
  changes. The configured portal must expose only the approved software prices.
- New migration supports approved price changes only on the SAME owned subscription.
  It preserves original checkout ownership, service-only grants, live billing gates,
  independent entitlement records and cross-subscription conflict protection.
- Ended subscriptions intentionally require support review before restarting;
  existing duplicate-subscription protections are retained. Abandoned/expired
  checkout retries continue through the existing reconciliation path.
- Staging registration provisioning skips registration notification delivery.
  Auth confirmation capture still requires independently verified staging hooks.
- Starter $59/month: 20 analyses, 10 software distributions, 25 maximum buyers.
  Pro $119/month: 50 analyses, 25 software distributions, 50 maximum buyers.
  Matching, privacy, distribution rules and the catalog allowances are unchanged.

## Local verification

Focused tests cover registration product/tier binding, tampering, paused login,
existing customer preservation, server-owned portal mapping, negative billing,
consent and same-subscription tier changes. PGlite exercises the migration with
service-only grants; it is NOT hosted PostgreSQL or concurrent multi-connection proof.
Previously completed hosted registration security evidence is retained; no matching
matrix or Windows recovery investigation is repeated.

Actual local results: **95/95 focused tests PASS**, frontend TypeScript PASS,
scoped API/server typecheck PASS, scoped lint PASS (0 errors; three pre-existing
AuthCallback empty-catch warnings). Vite application build PASS with existing
mixed static/dynamic import and large-chunk warnings. Browser checks at desktop
and 390px mobile verify landing/pricing, product-specific Pro signup and existing-
customer sign-in links, with no horizontal overflow. Local UI used synthetic
credentials and did not submit registration or payment. Existing
AuthCallback empty-catch lint warnings and existing build chunk warnings are noted.
Browser review uses synthetic local configuration; it is not proof of hosted payment.

## Safe Preview and publication

- Existing DBP Git integration is enabled; its ignore command skips ONLY the old
  security branch. Do not rely on that command for this integration branch.
- This branch's root `vercel.json` sets
  `git.deploymentEnabled["codex/buyermatch-1b-integration"]=false` BEFORE first push.
  The connected DBP project's root directory is null and Production branch differs.
  Other branches are unaffected. No GitHub deployment workflow exists in this tree.
- Dedicated isolated project: `dbp-registration-s2`,
  `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl`, team `housebuyerinv`.
  Git is unlinked; Deployment Protection covers all deployments.
- Read-only Preview environment check: staging Supabase `qxhhlprentrufobpcgna`,
  frontend/server URLs agree, registration paused=true, live billing/delivery=false,
  checkout=false. No Production database/Stripe/Clerk/Resend credentials identified.
- Current callback origin is `https://dbp-registration-s2-preview-housebuyerinv.vercel.app`.
  BM_APP_ORIGIN is deliberately invalid (`https://s2-callback-not-configured.invalid`).
  No Stripe sandbox key or BuyerMatch portal configuration is installed.
- A stricter local key-provenance check STOPPED before deployment because Vercel
  does not export sensitive server keys through `env run`. Their runtime identity
  was not independently re-established in this task. This is UNKNOWN, not evidence
  of a wrong key or a claim that isolation passed. No new deployment was created.
  Reuse prior sanitized S2 runtime provenance only after reconciling current env IDs/
  fingerprints through a supported, secret-safe verification mechanism.
- Do not unpause, perform hosted registrations or claim paid end-to-end success
  until the sandbox/portal/webhook configuration and protected callback are verified.
  Any new Preview must be exact committed source, target Preview, paused, staging-only,
  protected, with no existing alias reassigned and no automated Production promotion.

## Remaining launch blockers / release order

1. Supply an isolated Stripe sandbox credential and approved $59/$119 recurring
   sandbox prices, portal configuration and signed staging webhook. No live keys.
   Align BM_APP_ORIGIN and PUBLIC_APP_URL to the reviewed protected Preview;
   preserve the exact capture-only Supabase callback and email sink. Verify actual
   notification non-delivery. Do not create another protection-bypass credential.
2. Review/apply the new tier-change migration ONLY to staging. Predecessors are
   the existing commerce and live-billing migrations. Guard requires existing
   service-only RPC privileges; no grants/RLS changes or data updates are performed.
   For rollback, restore ONLY the two original `bm_apply_test_billing` and
   `bm_apply_live_billing` definitions from migrations
   `20261001090000_buyermatch_test_commerce_delivery.sql` and
   `20261006010617_buyermatch_live_billing_boundary.sql`. Preserve all records and
   current privileges; pause checkout before reverting a tier-change-capable app.
3. Run the integration delta in isolated protected Preview: both tiers, confirmed
   identity, existing CRM add-on, captured confirmation, checkout success/failure/
   cancel/retry, webhook duplicates/out-of-order, upgrade/downgrade, cancellation,
   payment recovery, account switching and unchanged CRM records. Verify allowances,
   buyer privacy, agreements and the actual advertised distribution/response flow.
   Restore registration pause after tests. Hosted outcomes remain UNVERIFIED until run.
4. Complete provider-aware encrypted backup/restore and independent key custody
   using the separate $0 native-Linux plan. No Production export is authorized here.
5. Prepare a separately reviewed SECURITY-ONLY candidate first. Code inspection
   found that unchanged `a722fca` invokes a registration completion POST on ordinary
   login, which the pause correctly rejects. This integration fixes that with a
   server-verified read-only provisioned-status check. Backport the minimal login-
   while-paused correction (without BuyerMatch discovery/onboarding) and verify its
   focused delta before a paused security canary; do not deploy `a722fca` unchanged
   assuming existing login remains available. No separate security candidate was
   created or released in this task. Then release the SECURITY-ONLY repair: reviewed additive
   registration migration, repaired application with explicit server pause, protected
   canary and existing-customer checks, then separate approval to reopen registration.
   Do not deploy this integration branch for the security-only release.
6. Before public paid launch: approve final legal/privacy/software and service
   separation language, current consent records, tax obligations and refund/cancel
   handling; verify live Stripe/catalog/webhook/provider configuration without
   enabling billing as a side effect. Then separate controlled 1A+1B release approval.

Rollback must preserve registration containment: keep the present containment release
or a verified paused repaired release. NEVER restore vulnerable open registration.
No Production migration, deployment, environment change, real charge, customer email,
buyer distribution or MoneyMap modification is part of this PR.

Status: GO for integration review; NO-GO for public paid launch or Production cutover.
