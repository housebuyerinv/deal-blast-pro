# Provider transport implementation — 2026-10-27

Pinned code: `f5e59d9aa64c308f2add2a3c8dea593226984978`.
No push, deployment, provider request/write, payment or migration was performed.
Public documentation was consulted; network tests used synthetic loopback only.

## Completed local engineering

- Actual bounded HTTP transport for normal Pro authentication, Checkout creation,
  owned Checkout mapping/expiration, entitlement/subscription/invoice reads and
  signed-event ledger reconciliation readbacks. Exact S2 destinations, account
  context, restricted TEST credential slots, aborts, response limits, idempotency
  and durable allowlisted journals are enforced. Capability URLs go only to an
  explicit private browser sink, never return values or journals. No fabricated
  Stripe events or automatic retries are provided.
- Named-profile Stripe operator adapter verifies executable hash, canonical path,
  custody receipt, approval, TEST ownership and exact endpoint. Only `whoami`,
  endpoint retrieve and `disabled=true` are permitted. Ambient key/context/Node/TLS
  overrides are not inherited. Standard/admin key values are never extracted or
  installed in application runtime. Actual tests used a synthetic CLI child, not
  the authenticated Stripe profile. Custody/authority facts in those tests were
  synthetic; they are not Windows-owner or provider verification.
- Composed transport routes webhook operator actions to that profile while owned
  Checkout operations remain in the restricted runtime transport.
- Read-only preflight aggregates exact account, immutable protected Preview/source,
  17 build/runtime settings, quota, SQL protections, normal login, agreements,
  preservation, lease and independent watchdog readback proofs. Missing/unknown
  facts return UNVERIFIED. A successful preflight never authorizes payment.
- Confirmed defect: the legacy CRM Portal API bypassed S2's bounded BuyerMatch
  route. The dedicated S2 runtime now rejects it with503 before Auth/database/
  provider access. Non-S2 normal authentication behavior is preserved locally.
- Confirmed concurrency gap: different run UUIDs could claim concurrently.
  A shared S2 filesystem lock now excludes them. Only verified, durably recorded
  independent closure releases the owned lock; run claims/evidence remain. An
  unknown, foreign or partial lock is preserved. All processes must use the same
  independently custody-verified canonical coordination directory; per-run or
  differently virtualized roots are not a valid global lease.
- Closed a verification gap: `GET /api/buyermatch?action=billing-status` now
  projects validated non-secret window settings only to the confirmed Pro fixture
  through normal Auth/profile/workspace checks. The transport reads it directly
  before Checkout. Deployment protection is independently verified, never claimed
  by that endpoint. Arbitrary values in diagnostic settings fail without reflection.

## Executed verification

**150/150 selected checks PASS**, including49 new checks this batch:142 affected
unit/application/SQL tests,1 actual loopback transport test,7 exact-source packet
checks. The previous independent watchdog/containment evidence is preserved and
was not relabeled as current hosted proof. Scoped lint, server/API TypeScript and
both server bundles PASS. No frontend change required another frontend build.

One test initially assumed pin verification finished within100ms under parallel
load. It now aborts after the real child starts; the parallel suite passes. Missing
URLSearchParams imports and a test getter lint error were corrected, not suppressed.

The authenticated-user check uses Supabase's server-validated user endpoint rather
than trusting a cached session: https://supabase.com/docs/reference/javascript/auth-getuser .
The public changelog Markdown fetch failed due the browsing tool's content-type
handling; no unverified new Supabase feature/schema behavior was introduced.
Checkout cleanup uses supported expiration of open sessions only:
https://docs.stripe.com/api/checkout/sessions/expire .

## Remaining genuine dependencies

No private credential/session was accessed in this task. At execution, private
headers must come from approved provider-managed runtime/normal browser sessions;
never rejected files, transcripts, command arguments or returned diagnostics.
Actual restricted-key rights and normal Pro/owner login remain to be verified.
The existing Stripe CLI profile is usable by the operator implementation without
key extraction, but its actual current access and real executable custody must
still pass the freshly authorized owner-context preflight.

Private `verifyApproval`, `verifyAuthority`, provider metadata/SQL/preservation and
watchdog proof readers must supply real authenticated facts, not fixture booleans.
The executable preflight consumes these facts. Its local PASS is not a provider
authority certificate. Supabase pause, Vercel routing/removal and their deployed
readbacks must pass independently for this source; historical canary authority
does not authorize substituting this candidate into old source-pinned launchers.

Portal configuration can be read, but creation/lifecycle stays blocked. Missing
provider-login settings remain UNKNOWN. New Preview denial does not establish
denial on every older reachable S2 deployment. That coverage and no-issuance proof
require hosted/provider verification. Previously issued Portal sessions are not
revoked by Checkout pause, browser closure, redirects or application deadlines.

## Exact minimum next authorization

Authorize publication of this exact source to the existing integration branch
only after fresh automatic-build suppression/remote checks; one $0 protected,
fully paused S2 Preview; normal private Pro/owner access; and a payment-free
preflight/independent cleanup rehearsal. Permit only same-state disabling of the
dedicated TEST endpoint/receiver and removal of the newly owned temporary Preview.
Use the immutable verified hostname for attestation; no alias move, migration,
purchase, webhook event generation, registration unpause or Portal session is
needed for this phase. Preserve all existing deployments and records. If safe
legacy entry-point coverage cannot be proven, stop before billing activation and
report the precise additional S2-only containment needed.

Only after actual preflight/cleanup proof should a separate, one-purchase Pro
activation authorization open a bounded window. Keep Portal lifecycle out of it.
Original buyer-key compatibility/223 identities/9 provenance payloads/8 unusual
hashes, hosted buyer acceptance, legal approval, independent encrypted restoration
and Production cutover remain separate mandatory gates. Production remains NO-GO.

