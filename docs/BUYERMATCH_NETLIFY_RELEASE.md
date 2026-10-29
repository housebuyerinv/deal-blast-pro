# BuyerMatch Netlify private release candidate

Baseline: `46ec035e0c53c07723f54a424d39ad1b8522fa85`. Local derivative, not a change
to the approved Vercel application or a public release approval. Team slug:
`marcel-g-ovf4dew` (HBI). Verified account: Free, 300/300 credits, one concurrent
build, no payment method. No repository connection or deployment performed.

## Implemented deployment boundary

`netlify.toml` routes all requests to one modern Node 22 function. The local
builder bundles the actual shared BuyerMatch, buyer-account, account-status and
read-only registration handlers, dependencies and frontend assets into that
function. The publish directory contains only an unavailable notice. There are
no publicly served application assets outside the private gate, no scheduled
functions, background jobs, edge functions, build plugins or remote downloads.
This deliberately uses function compute even for assets: Free credit exhaustion
may suspend the site. Do not interpret 300 credits as a traffic/SLA guarantee.

The gateway requires independent provider context for account/site/deploy identity,
an unpublished deploy-preview/branch-deploy, exact immutable origin and an active
window of at most 30 minutes. The slug alone is not ownership evidence: before
deployment read back the real team ID from the authenticated HBI account and pin
it with the new site ID/name. Missing/mismatched context fails closed. Published
deployments, aliases, custom domains and other origins are intentionally denied.

The default `/.netlify/functions/buyermatch` path cannot be used as an alternate
API dispatcher. `/api/platform/` aliases preserve the existing shared handler
semantics; unknown API, suffix, worker and Portal routes fail closed, not SPA.
Authenticated page routes use the original React/Supabase session behavior.

## Environment contract (names only; no secret entry authorized here)

| Scope | Required configuration |
| --- | --- |
| Public build | `BM_NETLIFY_SUPABASE_REF`: exact independently owned synthetic project ref; `VITE_SUPABASE_ANON_KEY`: its `sb_publishable_` key. The builder derives `VITE_SUPABASE_URL` and loads no dotenv file. These two public bindings are pinned in the function; runtime mismatch denies all requests. |
| Function ownership | `BM_HOSTING_PROFILE=netlify-private-v1`, `BM_ENVIRONMENT=staging`, `BM_NETLIFY_TEAM_SLUG=marcel-g-ovf4dew`, exact `BM_NETLIFY_ACCOUNT_ID`, `BM_NETLIFY_SITE_ID`, `BM_NETLIFY_SITE_NAME`. Values must match provider readback. |
| Function backend | `BM_NETLIFY_SUPABASE_REF`, equal `BM_STAGING_PROJECT_REF`, equal `SUPABASE_URL` and `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`), the same public `VITE_SUPABASE_ANON_KEY`, fresh synthetic-project `SUPABASE_SERVICE_ROLE_KEY`. No original S2 credentials. |
| Private synthetic secrets | `BUYERMATCH_IDENTITY_KEY`: independent 64-hex synthetic key; `BM_RESPONSE_SECRET`: independent >=32-character value; `BM_NETLIFY_ACCESS_SECRET`: independent high-entropy >=48-character private gate secret. Owner installs privately using provider controls. Never put these in source, build defines, chat, command arguments or logs. |
| Time | `BM_NETLIFY_WINDOW_START`, `BM_NETLIFY_WINDOW_END`: explicit UTC ISO times, <=30 minutes apart. All requests refuse outside this interval, independently of the primary acceptance process. |
| Mandatory disabled state | `DBP_REGISTRATION_PAUSED=true`, `BM_CHECKOUT_ENABLED=false`, `BM_LIVE_BILLING_ENABLED=false`, `BM_DELIVERY_MODE=disabled`, `BM_LIVE_DELIVERY_ENABLED=false`, `BM_RESPONSE_ENABLED=false`. |
| Runtime origin | Leave `BM_APP_ORIGIN` and `PUBLIC_APP_URL` unset: the entry binds them once from validated provider context (deploy ID + pinned site name), never request headers. If explicitly supplied, both must match that immutable origin. This is process-local binding, not a provider configuration mutation. |

Do not install any Stripe, Resend, Rentcast, Geoapify, OpenAI, worker, S2 campaign,
isolated billing campaign or Production configuration. Such bindings reject the
profile. Do not set `VERCEL`, `VERCEL_ENV` or `BM_LOCAL_SYNTHETIC`. Do not emulate
Vercel metadata. Set `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` using the provider's runtime
control if needed (not a build-only TOML variable). Runtime/build variable scopes
must be verified before uploading. None of these settings were installed here.

Fresh backend ownership and schema, private Storage/RLS, disabled public Auth
signup, exact immutable Auth redirect allowlist and confirmed synthetic fixtures
must be independently verified before a hosted attempt. Existing Supabase free
capacity remains exhausted; this implementation does not create capacity or
authorize reusing S2/Production/MoneyMap. The three known existing project refs
are explicitly rejected. Do not create another organization/account to evade
provider quotas. No migrations or backend setup occurred.

## Security behavior and verification limits

- Gate entry: HTTP Basic username `buyermatch`, owner-entered gate secret over
  HTTPS. This is separate from the user's normal Supabase login. A host-only,
  Secure/HttpOnly/SameSite=Strict HMAC cookie is bound to site, immutable deploy
  origin and window expiry. No credential logs, query tokens or plaintext files.
- A gate cookie never authenticates a buyer/subscriber/admin. Actual handlers
  still validate the Supabase bearer session, account status, ownership,
  entitlements, network-admin role and confirmed buyer identity. No Free-to-paid
  entitlement mapping or subscription allowances were changed.
- Same-origin checks, ambiguous-query rejection, strict routing, actual streamed
  body byte limits, no-store API/assets, CSP, frame denial, referrer policy,
  nosniff and sanitized server errors apply. Existing private Storage signed URL
  checks, MIME/size/ownership and database analysis/hourly/message quotas remain
  unchanged; existing application acceptance evidence applies to those paths.
- Bounded warm-instance IP-hash request and failed-gate throttles are locally
  tested. They are **not** distributed WAF/DDoS protection; database quota guards
  remain the distributed authority for existing metered actions. Hosted provider
  routing, context authenticity, runtime availability and protection equivalence
  have not been verified. Never equate local checks with hosted acceptance.
- Checkout, Portal, lifecycle, webhook receiving, buyer response, public signup,
  worker dispatch, reminders and distributions cannot dispatch through this
  gateway. Both billing and delivery flags must remain disabled. The existing
  Supabase Stripe webhook signature/idempotency implementation is unchanged;
  no new Netlify webhook receiver is armed, and no raw body is transformed or
  forwarded to Stripe/Supabase webhooks. The transport preserves raw API bytes
  but this is not hosted webhook verification. Do not configure a destination.
- No billing resource can be created by this profile, so no Stripe cleanup
  watchdog is armed. The existing Vercel-only campaign operator is not a Netlify
  billing operator. Adapting and authorizing it is a separate prerequisite before
  any future hosted billing campaign; never substitute the expiry gate for
  subscription cancellation/readback or claim that cancellation was verified.

## Local build and package checks

`npm run test:netlify` runs only the new gateway/handler checks. `npx tsc -b`
checks the application. Scoped lint covers the new adapter and Auth import.
After an offline build, `npm run test:netlify:package` verifies the function hash,
isolated publish folder and refusal of the verification-only bundle. A separate
normal-bundle test exercises the real executable entry and actual session handler
using synthetic provider responses, not the verification-only short circuit.
Local tests run on the available Node 24 runtime; esbuild targets Node 22. The
actual provider's Node 22 runtime remains a hosted acceptance requirement.

`node scripts/build-buyermatch-netlify.mjs --verify-local` builds the frontend
and self-contained Node 22-target function without dotenv, provider calls or
real credentials. This artifact deliberately returns 503 at entry: its synthetic
public bindings are not deployment approval. Outputs are ignored under
`.netlify/buyermatch/`: `functions/buyermatch.mjs`, `publish/index.html`, and a
SHA-256/size manifest. Never upload the verification artifact.

After the exact site/backend/public bindings are separately approved,
`npm run build:netlify` produces the bound package using the same code. It does
not log secret values, install an SDK, invoke a provider CLI, upload or deploy.
The builder accepts only publishable public keys, not service-role credentials.
Normal packaging requires committed executable source and records HEAD in its
manifest. Unrelated preserved working notes are outside that source check.

## First hosted action and rollback — NOT AUTHORIZED

1. Owner authorizes one empty, unlinked HBI Free site and an eligible independent
   synthetic backend/fixtures at $0, or identifies already entitled safe capacity.
   Read back account/site IDs and settings. No paid plan, trial, card, Git linkage,
   domain purchase, original backend, original key or original buyer data.
2. Owner privately installs the pinned synthetic variables/secrets, confirms
   backend configuration/redirect rules and approves the exact committed source,
   deployable artifact digest, <=30-minute scope and cleanup. Inspect the actual
   provider deploy API/CLI flow: it must create an **unpublished** branch/preview
   deployment. Stop if it can only publish Production, demands payment, lacks
   required context/protection or exposes application assets outside the gateway.
3. Upload only the generated function, unavailable publish folder and reviewed
   Netlify configuration. No repository connection. Verify immutable URL, bundle
   source/digest, unpublished status and configured Node runtime through provider
   readback before private login. Never set `--prod` or publish/alias the preview.
4. Verify unauthenticated static/API/direct-function denial, wrong origin and
   method/path variants, private gate/session separation, Auth callback, isolated
   project, owner/non-owner boundaries and disabled billing/distribution. No
   payment, signup, delivery, original buyer access or unrelated CRM operations.
   Stop on unexpected resources, Auth redirects, security differences or charges.
5. Independently verify expiry denies requests after the absolute window, even
   if the primary test process has stopped. Under that future cleanup authority,
   remove only the newly owned preview/site (or disable its private profile),
   then read back unreachability and absence of routes/resources. Never modify
   historical Vercel deployments/aliases. No database deletion is implicit.
6. If any hosted verification fails, stop immediately; do not publish. Expiry
   remains the independent application containment; independently verify it.
   With no public cutover there is no Production DNS/alias rollback. Restoring
   an older preview requires a new valid window and explicit approval, not an
   automatic fallback to a weaker or expired artifact.

Public launch still requires legitimate original-key compatibility/recovery and
independent restore validation if preserved buyer data is to be used, final
owner/counsel legal approval, hosted acceptance and explicit public cutover.
No original encrypted records, keys, Production or MoneyMap were changed.

Provider references (implementation contract, not proof of hosted execution):
[Functions API](https://docs.netlify.com/build/functions/api/),
[environment metadata](https://docs.netlify.com/build/configure-builds/environment-variables/),
[current Free credit limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
