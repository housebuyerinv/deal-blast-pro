# BuyerMatch isolated billing derivative

Local implementation only. Public release remains NO-GO. This is explicitly **not** approved application `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc` or the original S2 operator. Builds reuse the Git blobs at that application commit and operator `ce3bc2f25402e918289ee857441f2175fdf64a1c` through an identified overlay. Existing files are not changed.

## Executable scope

`profile.mjs` validates exact fresh resource bindings and rejects original S2/Production identities, projects and accounts. `build.mjs` emits bounded API, signed receiver, independent operator, provenance manifest and optional Vercel Build Output/SPA artifacts. The frontend's Checkout idempotency key is bound to the campaign. Portal, distribution, registration and unrelated API paths are absent or denied. Existing Pro calculations and billing SQL are reused.

`schema.mjs` only generates transactional, empty-database-only SQL. `fixtures.mjs` generates independent synthetic Auth/Free CRM fixtures and explicitly non-production legal documents. The local Auth fixture validates signed, scoped, expiring JWTs; it does not claim hosted Supabase Auth verification. A future new-project confirmed Auth user must be established through supported private administration before applying `fixtureSql`; no original account is reused and no password is embedded in SQL.

`native.mjs` implements direct scoped Stripe/Supabase/Vercel reads and approved cleanup operations. No connector or browser credential extraction. No provisioning happens on import or build. Hosted transport injection is forbidden. The implemented hosting adapter is Vercel; `hosting: node` deliberately fails native hosted preflight and does not represent a completed second provider adapter.

`operator.mjs` starts a detached Node watchdog which reopens private credentials, approval and fsynced evidence. Read-only preflight/attestation and durable baseline must precede the window. A fresh worker health receipt is required before arming. It closes the DB lease and disables/readbacks the endpoint, reconciles a single Checkout, expires an open owned session, and uses the original strict cancellation helper with a durable one-shot claim. It verifies cancellation, removes only owned Previews/alias, and checks zero buyer/provenance counts and unchanged synthetic CRM digest. Unknown cancellation outcomes cannot automatically be retried. Mutation approval is reread, exact-source-bound and time-limited. The watchdog begins cleanup one minute before expiry; provider timeout, drift or incomplete cleanup is a failed campaign, never an acceptance result.

## Local verification

From this worktree:

```powershell
node --test tests/buyermatch/isolated-billing-integration.test.mjs
npx --no-install tsc -p isolated-billing/tsconfig.json
npx --no-install eslint isolated-billing tests/buyermatch/isolated-billing-integration.test.mjs tests/fixtures/isolated-primary.mjs
```

The integration test builds real API/receiver/operator and frontend artifacts, runs approved application logic against fresh PGlite billing SQL, and drives provider wire protocols with synthetic fixtures. Its detached-process fixture uses a loopback HTTP server; restricted Windows sandboxes may need approved loopback access. No hosted provider calls or real payment objects are made by that test. Dummy credentials and generated artifacts are under ignored `node_modules/.cache`, never release evidence or source.

## Future owner-approved binding and execution

Do not run a hosted campaign under the local-development authorization. First resolve capacity, authorize exact new resource IDs and private credential installation, then separately approve the final derivative/operator SHA and campaign.

1. Inventory existing resources read-only. Supply a strict profile accepted by `validateProfile`, listing the actual pre-existing projects/databases/accounts/owners in `baseline`. Select a **new**, commercially eligible, protected hosting project with no Git linkage or protection bypasses, fresh synthetic Supabase project, fresh Stripe sandbox account, new owner UUID, new $119 monthly price, disabled isolated receiver endpoint, exact origin and <=30-minute window. No fields default to S2.
2. Keep profile, credentials and approval in a new owner-only private evidence directory outside Git. Use the established private custody procedure for **new** credentials only. Hosted mode verifies Windows ACLs; credentials are never command arguments, console output or committed files. Required credential object fields: `profileDigest`, `account`, `database`, `stripeKey` (TEST only), `serviceKey`, `signingSecret`, `hostingToken`, `oidcToken`, `ownerAccessToken`. All values must belong to the new resources. Secrets must not be pasted into chat.
3. Set `source` to the clean committed derivative HEAD. Local build API: `await buildIsolated(profile, output, {frontendKey: newPublicPublishableKey})`. Use an output directory inside the worktree under ignored cache. CLI `node isolated-billing/build.mjs PROFILE OUTPUT` produces server artifacts without a frontend. `derivative.json` records exact reused blobs. No build command deploys or migrates anything. Review generated fresh-only SQL and fixture SQL before separately authorized application.
4. Install explicit runtime bindings from `fixtureEnvironment(profile)` (a public binding template despite its name), with the new private TEST/service/signing secrets installed privately. API validates new hosting scope; receiver validates `BM_ISOLATED_RECEIVER_PROJECT`. Leave Checkout/receiver disabled until the campaign is armed. Set Checkout/receiver runtime enable flags only within the separately authorized deployment plan; DB lease remains the independent issuance gate. No original env export is allowed.
5. Private approval JSON must contain `approved: true`, exact `source`, `profileDigest`, `account`, `runId`, `cancelCampaignCreatedTestSubscription: true`, and `activateCampaign: true`. These are owner authorization records, not permission for this implementation to run now.
6. Before the window, import the built operator and call `startWatchdog(profileFile, directory, credentialFile, approvalFile)`. The owner-controlled primary process keeps its heartbeat alive. The worker itself performs fresh native preflight and writes `watchdog-ready.json`/health. Then create `makeExecution(...)` with the same private files and call `arm()` only after successful gates. Do not call `prepare()` a second time: the watchdog owns the immutable baseline. Use normal private new-owner login and the one campaign-bound Checkout. At most two owned protected Previews, one quantity-one $119 TEST Checkout, one customer/subscription, twelve signed deliveries, $0 real spending.
7. On failure stop issuance; leave independent cleanup running. Never rerun unknown cancellation. Require `cleanup-result.json` with `verified: true` plus actual provider readback and preserved synthetic fingerprints. An error receipt, missing receipt, or local `hostedCancellationVerified: false` is not hosted success. Retain sanitized evidence and remove temporary private credentials through the owner-controlled custody process.

The isolated campaign would prove the derivative's hosted TEST billing integration and synthetic CRM isolation. It would not certify original-S2 key compatibility, the preserved 223 identities/nine payloads, original hosted routing, Production billing, legal approval or launch readiness.
