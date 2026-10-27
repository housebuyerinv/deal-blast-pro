# Billing-only implementation checkpoint

Latest local controls/source: `c00d59f048282343af5d81afe9655556aa285e75`.
See [2026-10-27 verification](release-evidence/2026-10-27/README.md) for130 passing
selected checks, actual detached-process/loopback evidence and the remaining
private-provider/Portal blockers. The implementation below records the prior
checkpoint; its old source/packet must not substitute for the newer proposal.

Application/runner candidate: `57976a5bb85cec906783173dfaa85b843ea801ca`.
This supersedes `de9009e` for proposals using the new server-side window.
No push, deployment, hosted write, payment or provider configuration changed.

## Local results

- Dedicated S2 Checkout AND Portal entrypoints now require the existing confirmed
  Pro owner, run ID, approved operations and a window of at most 30 minutes.
  Registration must remain paused and live billing/delivery disabled. Other
  environments retain existing billing policy. Deadline checks run before writes,
  session creation and returning an existing Checkout URL.
- The runner requires exact source/account/project, explicit approval, exclusive
  claim, all17 build/runtime settings, verified normal login/guards and an
  independent-watchdog receipt. Failed assertions stop further test steps.
- Five independent cleanup operations attempt both pauses, owned Checkout closure,
  Portal closure and routing/deployment cleanup. Timeouts signal abort; adapters
  must honor cancellation and reconcile in-flight operations. Unknown authority,
  incomplete cleanup, journal loss and preservation drift cannot produce PASS.
- The actual disk journal fsyncs sanitized records and creates non-overwriting run
  claims. Its directory requires independent ownership/ACL verification. Never
  delete a claim to retry a payment. Interrupted evidence is preserved.
- Actual Checkout code, migration SQL and the signed-webhook handler run together
  against disposable PGlite with every HTTP request intercepted. Verified pending
  Checkout denial, completed Pro50/25/50, invalid signatures, replay, delayed-failure
  reconciliation and unchanged CRM sentinel. No buyer identity secret is used.

**100/100 selected checks PASS**:93 billing/window/journal/application checks plus7
updated packet checks, including63 new checks. Scoped lint, frontend/server
TypeScript, server bundle and build PASS. Existing bundle-size/import warnings
remain. Embedded SQL is not hosted Stripe, multi-connection PostgreSQL or recovery.

## Use and safety boundary

Five non-secret server bindings are derived by `billingWindowBindings(plan)`:
`BM_S2_BILLING_OWNER_ID`, `BM_S2_BILLING_RUN_ID`, `BM_S2_BILLING_STARTED_AT`,
`BM_S2_BILLING_EXPIRES_AT`, `BM_S2_BILLING_OPERATIONS`. Missing values deny access.
Activation permits only Checkout; lifecycle permits payment/change/cancel. Existing
Auth, current agreements, price and ownership checks remain mandatory.

The offline billing-only source packet excludes migrations and buyer-key restoration.
Commands are data only, with example directories/run ID, `executionReady=false` and
`privateProviderAdaptersVerified=false`. Full buyer preparation retains all original
migration/key gates. No historical canary or old source may substitute for this pin.

Runner orchestration tests use mock provider adapters; the separate application test
uses real code/SQL with intercepted HTTP. Neither proves current provider permissions,
private adapters, normal Pro login or an independent hosted watchdog for this runner.
No provider adapters or activation CLI are included. The module has no activation
on import. Hosted execution must not be attempted until these facts are verified.

Stripe documents Portal links expiring after5 minutes unused, and used sessions
within1 hour of most recent activity: https://docs.stripe.com/customer-management .
No immediate session-revocation API was verified. Browser closure, redirect,
application deadline or paused Checkout is not Portal-session revocation.
Activation prohibits Portal creation. Lifecycle stays blocked until a supported,
reviewed session-containment/readback strategy exists; do not invent a revoke API,
silently extend the window or assume configuration changes revoke existing sessions.

## Next actions and remaining gates

Review/authorize exact-source publication and a protected paused billing-only Preview.
Verify private adapters/watchdog authority, installed restricted keys, existing Pro
login and outstanding Checkout reconciliation before separately authorizing one Pro
activation. No new account, identity key, buyer migration or paid organization is
required for this path. Original223 identities/9 provenance payloads/8 nonstandard
hashes and unrelated accounts require unchanged before/after fingerprints.

Buyer hosted acceptance still requires compatible trusted original keys and separate
S2 migration/deployment authorization. Owner/counsel legal approval, independently
verified encrypted DB/roles/Auth/Storage restore and Production cutover/public
activation remain mandatory. No new overall milestone is justified. Production
remains NO-GO; MoneyMap, original S2 records and safeguards were untouched.
