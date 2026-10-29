# BuyerMatch isolated synthetic acceptance

**October 28 update:** WSL2 and Docker Engine are operational after the owner restart.
The real isolated Supabase stack and all 76 schema sources ran successfully.
Real Auth/email confirmation, Storage, buyer workflows, matching, security and
browser acceptance passed. See the
[executed full-stack results](../../docs/release-evidence/2026-10-28/LOCAL_FULL_STACK_ACCEPTANCE.md).
That evidence supersedes the earlier runtime limitation and conditional hosted
alternative below. No hosted or Stripe operations were performed.

This is a new local namespace, not S2 and not a copy of S2. Existing S2 remains
under preservation hold: 223 identities, nine provenance payloads, original keys,
records, settings and all fallbacks are untouched. No original data was imported.

## Earlier in-memory checkpoint — $0, no hosted dependencies

From the integration worktree:

```powershell
node scripts/run-isolated-buyermatch-acceptance.mjs
```

The runner creates a clean child environment with no inherited provider credentials
and loads no dotenv files. The fixture installs all 76 current repository schema
sources into a disposable in-memory PGlite database, then creates six synthetic
actors, four Free CRM workspaces, 52 synthetic buyers, two provenance fixtures,
Starter/Pro entitlement fixtures, three deals, a delivered invitation, private
response capability and a synthetic one-page PDF clearly marked NOT PROOF OF FUNDS.
Fixture keys are generated only in memory, never returned, printed or installed;
their buffers are cleared when the disposable database closes. These are not
replacement S2 credentials. Fixtures are reconstructed from code, not backups.

**10/10 grouped local checks passed**: real matching/privacy and hourly analysis
enforcement; buyer criteria/revision handling; private proof reservation/commit and
foreign-path rejection; response replay/history; subscriber ownership/activity;
ordinary-admin denial and owner-only immutable proof review; actual billing SQL for
both tiers and duplicate reconciliation; cross-key-domain decryption/HMAC rejection.
The owner-policy SQL fixture uses the application's fixed allowlisted email inside
the disposable database only; it is not an authenticated real-owner session.

Four additional boundary/bootstrap/adapter tests passed, plus 54 directly affected
API/account/commerce checks (one client-boundary test overlaps). TypeScript, changed-file lint and four server/API
bundles passed. No comprehensive campaign was repeated.

These results exercise **actual application logic and migrated SQL**, not a demo.
Auth rows and Storage metadata are minimal local contracts, not running GoTrue/Storage
services. Proof bytes/checksums are real synthetic bytes, not an actual Storage HTTP
upload. Completed Checkout rows are synthetic SQL fixtures, not Stripe purchases.
No claim of browser/Auth/Storage/Stripe hosted E2E, OS network isolation, original
key compatibility or independent disaster recovery is made.

## Smallest full-stack architecture

- Official Supabase local stack: PostgreSQL17, Auth, private Storage, API and local
  SMTP capture. Dedicated project `buyermatch-local-synthetic`; API55321, DB55322,
  SMTP capture55324; actual application origin `http://127.0.0.1:5189`.
- Separate CLI-created `supabase/config.toml` in this directory. Never use the main
  repository config: its existing callback configuration targets Production.
  No project is linked; no original `.temp/project-ref`, secrets or environment
  files are copied. No external SMTP, OAuth, Stripe or Resend configuration.
- `scripts/testing/buyermatch-local-stack.config.mjs` serves the real application
  and fixed real API handlers on loopback. It does not stub Auth, inject sessions or
  replace authorization. It loads no dotenv and exposes only the local PUBLIC key
  to the browser. The `account-status` route preserves the normal login/callback
  flow. The API adapter retains headers and rejects ambiguous query input; other
  API routes, workers and arbitrary source paths are unavailable.
- `BM_LOCAL_SYNTHETIC=true` is usable only with NODE_ENV development/test, no Vercel
  environment, the exact local project/origins and disabled Checkout/live billing/
  delivery. Provider credentials are rejected. Mixed cloud/local configuration is
  rejected **before** the admin client is created. Normal Auth and ownership checks
  remain active; no tokens are injected and no browser security is bypassed.
- Application registration defaults paused. Positive local-only signup may use
  `BM_LOCAL_SIGNUP_ALLOWED=true` plus `DBP_REGISTRATION_PAUSED=false` only in the
  fully validated literal-loopback profile. This cannot open S2 or a hosted deployment.
- New schema loader `scripts/setup-local-buyermatch-acceptance.mjs` accepts no URL;
  its database host/port are fixed to127.0.0.1:55322. It requires private LOCAL database
  configuration, existing Supabase service roles and an empty public schema. It
  transactionally installs the actual source inventory and checksum ledger, refusing
  nonempty databases without DDL. It never resets or drops an existing project.
- Use existing supported Supabase Admin provisioning and normal Auth login when
  the stack exists. New local fixture passwords/keys stay private to that environment;
  original S2 identities, passwords, signing keys and grants are never reused.

**Current limitation:** no docker/podman/nerdctl command or standard Docker/Podman
installation was found. No engine was installed, started or downloaded. The official
native runtime supports Linux/macOS, not this Windows host. Consequently the actual
local Supabase stack and schema loader were NOT executed. Loader orchestration and
rollback were tested with a local adapter; actual DDL was exercised in PGlite.
See [official local-stack requirements](https://supabase.com/docs/guides/local-development/cli/getting-started).

The next $0 choice is an already-owned container-capable host. Installing a runtime
may require owner OS authorization/license review; no installation is implied here.
Before startup inspect ports, actual loopback bindings and available resources. Do
not reuse or stop existing containers. Capture local status/credentials privately;
the CLI's raw status output can contain local keys and must not enter logs/chat.

## Reused real acceptance campaign

Use `scripts/testing/buyermatch-final-acceptance.mjs`, the exact-source migration
inventory and existing buyer/component/API/billing/containment scripts. Local profile
support is part of this new candidate and supersedes previous source approvals.

| Phase | Actual E2E evidence still required |
| --- | --- |
| Buyer | Normal signup/login and confirmation in local SMTP capture; own profile/criteria, real private Storage PDF upload/replacement/expiry, invitations, responses and complete personal history |
| Subscriber | Normal confirmed subscription recognition; deal creation → matching → quota/consent/contract review → permitted synthetic distribution → response/closing tracking |
| Administrator | Authenticated owner review, private proof download, buyer/deal management, operating records, immutable audit and closing verification |
| Security | Actual HTTP cross-account/document/legacy-route denial, no provider credentials/PII in client output, stale-session rejection, unchanged S2 preservation boundary |
| Billing | Actual Stripe TEST Checkout/signature/replay/lifecycle requires separately authorized hosted provider operations; local SQL is not that evidence |

Do not use existing S2 customers, Auth accounts or webhook configuration for this
lane. A separately approved distinct Stripe TEST sandbox/destination avoids routing
synthetic events to existing receivers. Until that authorization, Stripe objects,
purchases and Portal sessions remain prohibited and application provider keys stay
absent. Portal lifecycle also requires verified issued-session containment.

## Preservation and cleanup

The in-memory harness has no hosted client/connection; its fixture target guard
accepts only the exact literal loopback origin. The admin-client boundary test proves
remote/mixed configurations fail before client creation. Independent fixture keys
cannot decrypt or HMAC-match each other. This is structural/local evidence, **not**
a new authenticated denial test against original S2 or proof of original decryptability.
No S2 request, ciphertext sample, record, key or configuration was accessed for testing.

The executed harness closes its own in-memory databases and clears its fixture keys.
The official stack has not created containers/volumes and needs no cleanup. Future
cleanup must target only this project and its run-owned volumes/fixtures, preserve
all prior resources, retain sanitized evidence and never drop an existing S2/QA DB.

## Cost and one conditional hosted alternative

Executed work cost $0. The local stack needs existing compute/storage and a compatible
container engine; no hosted project is technically necessary for Auth/Storage/browser
acceptance. Stripe provider verification remains a separately authorized operation.

If a local host is unavailable and the owner selects hosted acceptance, the narrow
proposal is **one new isolated Supabase project in a separate owner-controlled
organization**, one protected Preview with no alias change, new synthetic-only keys
and accounts, and a distinct TEST billing destination. Never repurpose S2 or paused QA.
Published Supabase Pro baseline is $25/month including one Micro after compute
credits; taxes/overages/other providers are not included and it is not a hard cap.
Free capacity is not verified available; existing two-active-project findings remain.
Current [pricing](https://supabase.com/pricing) was checked October28. The $25 expense
remains on hold; no purchase, plan change or account quote was requested.

**Conditional authorization request, not execution authority:** approve only the
chosen new project and exact candidate after an owner-visible cost/quota check;
stop if unavailable within the approved budget. Permit schema/fixtures only in the
new project, private synthetic credential installation and one protected Preview
for at most30minutes with independent cleanup. No S2/Production/MoneyMap changes,
alias moves, real payments, buyer campaigns or public signup. Stripe creation/TEST
purchases need explicit capped scope in that same campaign approval; otherwise omit
them. Record before/after project identities, source hashes, actual test receipts,
unchanged original-resource metadata and independent Preview removal. Preserve the
new DB if retention is needed; never auto-delete it or use deletion as rollback.

No hosted authorization is being exercised. Preferred next action: identify an
already-owned compatible local host before authorizing additional monthly spending.
Original S2 key compatibility remains an independent release blocker. Public launch NO-GO.
