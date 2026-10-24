# BuyerMatch feature completion and consolidated prelaunch gates

Current direction: PR #2 review **6377236755**, October 23, 2026 (owner timezone).
Feature work is local/S2 synthetic and non-delivering. External readiness no longer stops
local implementation. PR stays draft; public release remains **NO-GO**.

**Security containment update:** the direct-table Production exposure on
`public.buyer_portal_submissions` was contained and independently metadata-verified
at 2026-10-24 02:00:02 UTC after owner approval and separate AI review. All public
client table/column rights were revoked; server access was preserved. Public buyer
intake and browser review are temporarily unavailable as approved. No buyer rows
were read or changed; historical exploitation remains unassessed. The broader
feature migration below is still not deployed. See
[execution and recovery details](BUYER_INTAKE_EMERGENCY_CONTAINMENT.md).

## Implemented MVP inventory

| Area | Current code | Evidence / limits |
| --- | --- | --- |
| Public discovery | BuyerMatch branding, Powered by DBP, independent Starter $59 / Pro $119, public navigation, buyer participation link | Existing pricing/discovery regressions pass; no pricing change |
| Subscriber signup/login | Signed product/tier intent; confirmed completion; direct BuyerMatch routing; CRM Free registration; existing CRM access retained | Existing registration/security results retained; affected routing checks pass; owner identity setup is deferred |
| Subscriber onboarding | Exact approved agreement versions/hashes, signature evidence, plans/allowances, payment-return and cancellation feedback | Current local consent checks pass; QA terms are not legal approval |
| Buyer portal | `/buyermatch/buyers`, independent of visitor CRM billing; criteria intake, optional private proof follow-up, pending review receipt | Actual component SSR and receipt-client tests pass; no paid subscriber account is required to submit criteria |
| Intake privacy/retries | New validated create-only RPC; stable submission keys; receipt-only public output; restricted owner review; no anonymous row read/update | Real local PGlite roles/RLS exercise reproduces legacy bootstrap exposure and verifies closure plus preservation of existing rows |
| Buyer consent | Separate optional invitation opt-in; server-recorded version/time; approval cannot invent consent; legacy unrecorded consent cannot activate network membership | Real API denial before sync and focused positive/negative consent checks pass |
| Proof files | Extension and MIME checks, size/count bounds, signed-in owner-scoped proof metadata, prevalidation of a batch, retention of partial successes | Local file and batch tests pass; private Storage integration is a final hosted gate |
| Matching/eligibility | Existing private matching engine and financial/jurisdiction/privacy rules retained | No engine/model change; previous completed results retained rather than repeated |
| Distribution/response | Existing reviewed eligibility, quotas, private exposure, provider reconciliation, scoped response, messages and unsubscribe; BuyerMatch response branding | Core rules unchanged; current API ownership/privacy regression subset passes; live delivery remains disabled |
| Independent billing | Existing Checkout, signed subscription reconciliation, authoritative entitlements, independent portal and tier changes | Hosted Starter/signed replay evidence retained; portal now additionally requires exact completed subscription Checkout and owner/product metadata; Pro/lifecycle signed hosted cases deferred |
| Admin operations | Existing private imports/review/duplicate handling/configuration/usage; new consent-bound source checks and explicit warning if CRM approval did not activate network | Ordinary account cannot invoke admin sync; CRM save is not falsely presented as successful BuyerMatch activation |
| Account/deal navigation | Workspace component remounts on owner or route change; responsive workspace navigation wraps | Scope-key regression passes; existing request-level account checks remain intact |

This inventory describes the implemented MVP: buyer participation consists of
criteria/proof intake, review, and invitation-scoped responses/conversations.
It is not a claim that every possible future buyer-account feature, business
workflow, or external provider behavior is complete or independently certified.

## Changes and security findings in this batch

1. Replaced public `.insert().select()` intake with `bm_submit_buyer_intake`.
   New pending migration: `20261024000845_buyermatch_private_buyer_intake.sql`.
   It preserves existing rows, grants only the bounded public receipt RPC, and
   intersects old permissive review policies with restrictive owner policies.
   Direct anon table access is revoked. Normal authenticated workspace Admins
   cannot read/update intake. No other schema is changed.
2. The checked-in legacy bootstrap exposed anonymous review reads/updates in a
   disposable local reproduction. A subsequent targeted Production metadata check
   confirmed effective SELECT/UPDATE privileges and unrestricted policies for both
   public API roles. RLS is enabled but these policies do not restrict those actions.
   No record-level read, public API test, exploitation finding or policy change
   was performed. This is a confirmed live authorization defect, not merely a
   future launch improvement.
3. Captured accuracy and invitation consent separately. Server activation reads
   saved consent for the exact source identity, not an admin-supplied assertion.
   Existing suppressed network buyers remain suppressed under the existing RPC.
4. Protected billing management from open/expired/mismatched Checkout sessions.
5. Fixed partial proof-upload metadata loss, misleading upload copy, and raw
   provider errors in public intake. Reused existing components rather than
   replacing the product or changing matching/allowance rules.

## Actual local verification

- **89/89 affected checks PASS**: API 17, intake database 15, rendered buyer UI /
  receipt client / scope changes 7, saved consent 11, subscriber billing 21,
  proof files/batches 11, discovery 3, registration routing 4.
- Frontend TypeScript / Vite application build PASS; existing dynamic-import and
  large-chunk warnings remain. Scoped API typecheck PASS.
- Scoped TS/TSX lint: zero errors; 18 pre-existing warnings in the inspected
  legacy files. Eight changed/new JavaScript modules/tests: zero errors/warnings.
- React review: stable hooks; account/deal state boundary; explicit input labels
  and unchecked separate opt-in; no arbitrary HTML rendering or new secret/client
  entitlement authority. Responsive layout classes retained and nav wraps.
- Actual interactive browser QA **UNVERIFIED in this batch**: the synthetic-only
  server started, but the in-app browser could not reach either loopback hostname.
  The owned fixture server was stopped. No network/security setting was changed
  to work around this. SSR rendering is not mobile/browser interaction proof.
- No hosted matching/security suites repeated. No real provider credentials were
  used by these local tests. No hosted registration, payment, email, database write
  or deployment occurred. The separate Production metadata inspection read only
  privileges and policies for this one table, never buyer records.

The changed local paths pass their checks. The later, separately authorized
Production permissions-only containment is recorded above; the local feature
test results do not themselves establish it. This report does not certify
whole-application correctness or claim 100% feature/release completion.

## Migration / operational compatibility

### Post-containment forward migration (draft only)

`20261024000845_buyermatch_private_buyer_intake.sql` reconciles both the legacy
baseline and actual untracked emergency deny. It is now APPLIED IN S2 ONLY,
source `55edad97751579abe2f8ea10d79ddd4e4e802701`, SHA-256
`FEC2E79A02CA93E1CB3A360A03BFB1EB1E9AE627C5380FDC45B7316655F8A811`.
Production restoration remains unapplied/unauthorized. The S2 schema compatibility
fix adds nullable imported_at where older staging had only updated_at, and rejects
incompatible review-column types or required insert fields without defaults.

- Repeatable column/index creation verifies the expected UUID key and unique
  index, rather than silently accepting an incompatible existing definition.
  Function replacement and owned-policy recreation are repeatable. Existing
  records, keys and receipts survive a replay.
- Revoke client table AND independent column rights first. Anonymous DML remains
  permanently denied by RLS as defense in depth. Authenticated direct INSERT and
  DELETE are denied; review is constrained to the confirmed, unbanned, Active
  platform Admin owner. Review grants allow only SELECT and UPDATE of status,
  imported_at, approved_at, approved_by and created_buyer_id. Submitted identity,
  proof and consent JSON, receipt keys and creation fields cannot be rewritten.
- Receipt RPC is deliberately callable by anon/authenticated; it validates and
  creates pending/unverified data and returns only id/recorded. The owner-check
  helper is authenticated-only. PUBLIC EXECUTE is revoked; both SECURITY DEFINER
  functions have a fixed empty search_path and qualified private table lookups.
  No client/user-metadata role claim authorizes review.
- Final effective privilege assertions reject inherited table/column access.
  Only after all replacement protections exist is the temporary emergency deny
  removed, within the SAME transaction. Injected failure before that step rolls
  back to the denied baseline. Permanent denies also block accidental ordinary
  DML regrants, but **RLS cannot protect TRUNCATE/MAINTAIN**: never replay old grants.

Migration-history reconciliation is forward-only: the historical correction was
direct CLI SQL and has no version to repair/mark as applied. Preserve its source
commit/hash and checkpoint. Do not fabricate a historical entry, execute bootstrap
again, bulk-push the directory, or reapply legacy public grants. For release,
inventory actual remote versions and definition hashes, use an explicit reviewed
allowlist/ordering for the release candidate, and apply the forward migration
through supported migration tooling so THAT migration receives its real history
entry. Its inline source reference documents the untracked containment baseline.
Do not execute this migration merely as bookkeeping: it restores functionality
and therefore requires separate scoped release authorization. S2 must first
rehearse containment -> restoration -> replay and failure recovery with synthetic
records, followed by actual protected client owner/customer/anonymous checks.

Actual local post-containment checks: **23/23 database checks and 9/9 receipt/UI
checks passed**, frontend typecheck passed, scoped TS lint zero errors with one
existing warning. These replace the relevant historical subset; the full 89-test
batch, hosted billing and matching tests were not rerun. Local PGlite tests do not
prove hosted multiconnection lock timing or browser/Storage integration.

Live Production outage handling: public intake and browser review remain unavailable today.
The draft client now explains missing/denied intake/review without private provider
details, automatic notification, direct-table fallback or a false success claim.
Those UI changes are NOT deployed. Operators must not retry through public grants
or infer data loss from an unavailable queue. Keep records/evidence; restoration
and any public outage notice are separately authorized release activities.

### Actual S2 verification checkpoint

- Separate AI reviewer approved the corrected exact bytes after independently
  reproducing the missing-imported_at failure and rollback. This is not a human
  external audit. Relevant local database checks: 24/24 PASS.
- Snapshotted S2 schema/grants/policies/dependencies/history before application.
  Verified protected, Git-unlinked S2 project and configured staging-only URLs,
  registration/Checkout/live billing/delivery pauses. Stripe TEST endpoint stayed
  disabled; receiver returned paused HTTP 503 before and after testing.
- Migration MCP still failed with expired requestState without applying changes.
  Supported owner CLI executed only the hash-pinned SQL in an isolated S2 workdir.
  After independent postconditions and hosted behavior passed, supported CLI
  `migration repair 20261024000845 --status applied --linked` recorded that exact
  already-executed migration. All prior S2 history entries remain unchanged.
  This is transparent history reconciliation, not a claim the failed MCP applied
  anything. Production's historical containment still has NO history entry.
  Freeze this now-applied source; future SQL corrections require a new migration.
- 28 hosted assertions PASS: four actual concurrent anonymous calls return one
  receipt/row; conflicting retries cannot overwrite data; pending/unverified and
  optional invitation consent preserved; actual anon and ordinary Admin denial;
  forged user metadata cannot confer owner authority; private proof upload,
  checksum download, anonymous download denial, cross-identity upload/receipt
  rejection, and server-normalized proof identity. No tokens/passwords were logged.
- Hosted PostgreSQL transaction rollback PASS: receipt creation followed by an
  injected division-by-zero left zero owned rows. This tests real transaction
  rollback, not an injected failure inside the receipt function itself.
- Seven runner cleanup/safety checks PASS. Independent read verified zero owned
  Auth users, profiles, receipts and proof objects remaining. No pre-existing buyer rows
  were inspected/changed. No confirmation email or notification API was invoked.
- Metadata confirms no anon table rights, no dangerous authenticated table rights
  including TRUNCATE/MAINTAIN, exactly five review UPDATE columns, no evidence
  update right, no PUBLIC function EXECUTE, preserved service access and unchanged
  unrelated relations/policies (excluding the intended new receipt index).
- NOT RUN: qualified-owner positive hosted access, because the staging owner Auth
  identity is absent. Do not fabricate an identity/token or restart Resend setup.
  NOT RUN: new hosted application UI, because this source was not deployed.
  Local synthetic browser fixture attempt timed out on loopback; the owned server
  was stopped without retry. Prior nine rendered receipt/UI checks are retained,
  not misrepresented as browser proof. No aliases/deployments or Production access.

Sanitized evidence remains in ignored `artifacts/buyermatch-1b/intake-s2-hosted.json`
and the S2 snapshot/permission/cleanup journals. Repeatable authorized harnesses:
`scripts/testing/buyer-intake-s2.mjs` (`--preflight` for no fixture creation) and
`scripts/testing/buyer-intake-browser-fixture.mjs` (local mocks, external network
blocked). Full owner/browser verification is still a prerequisite to recommending
Production restoration; no public-release approval is implied.

The new intake client **fails closed** until its pending RPC migration is installed.
There is no fallback that restores public table reads or updates. Both the existing
DBP intake and the new BuyerMatch intake use the protected receipt contract.
Review-console access uses the currently fixed platform-owner email, confirmed
Auth identity and Active Admin profile. Before applying, verify every legitimate
existing reviewer/owner override against that policy; do not silently lock out an
approved alternate owner or broaden it to all workspace Admins.

Older submissions do not have invitation opt-in evidence. Their existing records
are retained, but future network activation needs recorded consent; do not backfill
consent from an accuracy checkbox. Private proof uploads require normal sign-in
and an owner-scoped storage path. Anonymous criteria intake can proceed without
pretending proof has been uploaded or the buyer verified.

Rollback must preserve restricted review policies and receipt/data protections.
If ingress must stop, revoke the new intake RPC's public-role execution while
retaining rows/evidence; deploy corrected compatible code. Do not restore broad
anonymous SELECT/UPDATE to make an older frontend work. Do not drop receipts,
proof data, consent, keys or existing billing protections.

## One coordinated prelaunch verification phase

0. **Immediate security exception COMPLETE:** narrowly scoped Production
   containment applied and metadata-verified. Preserve the recorded outage and
   evidence; never restore public reads/updates as an automatic rollback. Safe
   intake/review restoration remains a separately reviewed release gate. Do not
   apply the full feature migration merely to make the old frontend work.
1. **Source/schema/security review:** corrected intake migration independently
   reviewed, applied and recorded in S2; receipt/privacy/concurrency/rollback
   checks above passed. Still verify qualified-owner and actual protected-browser
   behavior, then review the final release allowlist and Production prerequisites. Check
   actual grants/RLS, intended reviewers, receipt retries, proof ownership, buyer
   opt-out, existing CRM and subscriber preservation. No Production restoration is authorized.
2. **Protected release configuration:** finish legitimate owner verification and
   normal private login, Resend event-consumer isolation, build/runtime attestation,
   exact-source protection, callback routing and detached cleanup/removal. Existing
   owner Resend key stays UNUSED. Do not alter shared Production webhooks.
3. **Hosted billing H1–H7:** one explicitly approved Pro $119 TEST activation with
   50/25/50; then bounded portal/tier/proration/cancellation/unpaid/recovery and
   signed duplicate/out-of-order/Checkout-negative checks. Historical Starter and
   replay successes are retained, not assumed to certify every newer source.
4. **Hosted isolation/workflow H8–H9 + UX:** existing CRM add-on separation, private
   buyer data across workspaces, consent, complete mock/non-delivering deal → match
   → distribution → response/opt-out flow, counters, actual desktop/mobile and
   accessible error/retry behavior. Preserve all processing pauses outside windows.
5. **Legal/commercial decisions:** owner/counsel approval of exact legal drafts and
   new buyer consent wording, identity/contact, renewal/refund/cancellation,
   proration, retention and compensation/tax disclosures. Ended subscriptions still
   use the existing support-review restart policy, not an unreviewed duplicate
   subscription shortcut. Do not relabel staging fixtures as approved terms.
6. **Recovery:** actual free native Linux resources, encrypted working storage,
   independent owner-held recovery-key copy, complete DB/Auth/roles/grants/Storage
   object-byte backup scope and isolated restore evidence. No Windows recovery
   development, real-key provisioning or Production export in this code phase.
7. **Controlled release:** preserve the separate minimal registration-security
   branch and containment rollback evidence; never label this full integration a
   security-only hotfix. Separately authorize migration/paused canary, smoke tests,
   cutover and finally public signup/live payments only after mandatory gates pass.

No percentage is used as a release criterion. Production containment, MoneyMap,
existing subscriptions and hosted TEST processing safeguards remain unchanged.
