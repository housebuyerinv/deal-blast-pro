# Milestone 1B continuation — evidence, not activation approval

## New billing implementation and exact-source packet

Candidate `557b935a57f6baef5a5dbc06976cb795d086609d` adds actual server-side S2
owner/operation/deadline enforcement and a bounded, durably journaled billing-runner
interface. **98/98 selected checks PASS**, including61 new checks; TypeScript,
scoped lint, server bundle and build PASS. The migration hash is unchanged.
See [implementation and boundaries](../../BUYERMATCH_BILLING_RUNNER.md),
`billing-runner-verification.json` and `billing-runner-source-packet.json`.

The application integration uses actual Checkout code, signed-webhook handler
and disposable migration SQL with all HTTP intercepted. Provider orchestration
adapters are mocked; private adapters/watchdog and hosted execution remain unverified.
Activation excludes Portal creation. Portal lifetime/containment must be resolved
before lifecycle activation; paused Checkout alone cannot close existing sessions.
No provider writes, migration, deployment, push or payment occurred. This billing
packet does not require buyer keys or migration, and does not clear buyer acceptance,
legal, recovery or Production gates. Older source packets are historical evidence.

## Final existing-S2 test-scope review

Source tracing confirms the subscriber billing paths do not use buyer identity,
response or worker secrets. Pro TEST activation and remaining lifecycle are
conditionally feasible on existing S2 without a new Supabase expense or buyer
migration. This is NOT hosted verification or authority to write/activate anything.
Normal buyer account/POF/history acceptance remains blocked by compatible identity
setup and its uninstalled migration; direct RPC fixtures are not a substitute.

See [scope decision](../../BUYERMATCH_EXISTING_S2_TEST_SCOPE_DECISION.md) and
`existing-s2-test-scope-decision.json`. A separately reviewed billing-only operator
packet must retain exact source/config/ownership and independent cleanup. Do not
weaken or run the generic three-secret recovery packet. No new fixture, request,
write, key, deployment or processing change; no completed tests rerun, hosted PASS
or milestone claimed. Preserve the223 original identities and all prior evidence.

## Original-key / minimum capacity decision

Eight targeted local config paths checked without reading values: seven absent;
main `.env.local` has three unexpected write-capable principals and remains
content-blocked. Previously rejected file untouched, no vault connector/CLI
available, ambient secret-name presence false. Trusted original copy NOT VERIFIED,
not proven lost. No keys retrieved/generated/installed or permissions changed.

Current published minimum for isolated paid Supabase capacity is a separate Pro
organization with one Micro project: baseline$25/month within included usage,
not a hard ceiling/account-specific quote. Upfront plan fees, taxes/usage and
compute/add-on Spend Cap exclusions require a separate budget decision; no
existing organization upgrade or paid action proposed/executed. Current$0 scope
is unchanged. See [concise decision](../../BUYERMATCH_KEY_RECOVERY_CAPACITY_DECISION.md)
and `key-recovery-capacity-decision.json`. No tests rerun or milestone crossed;
old223 compatibility remains separate. Production/MoneyMap/S2/QA unchanged.

## Inactive QA read-only review

Ownership is confirmed (owner organization, signed-in Owner role). QA remains
paused; provider notice gives an October19,2027 resume deadline and says retained
data/backups/Storage remain available. No archive was opened/exported or restored.
Existing `stripe-webhook` v1 metadata was found. Its consumers and database/Auth/
Storage contents/retention classification remain UNKNOWN; QA is not disposable.

No development branches were returned; no managed GitHub/Vercel connections were
listed. No QA reference was found in inspected application source/local history
beyond the prior feasibility checkpoint, which does not exclude external/manual
dependencies. No project or credential was modified, no database/endpoint probe
or Production/MoneyMap project-data access occurred, and tests were not rerun.

Deleting paused QA would free no active slot; resuming still needs active capacity.
See [review](../../BUYERMATCH_QA_PROJECT_READONLY_REVIEW.md),
`qa-project-readonly-review.json` and `qa-paused-retention.png`. Retain QA unchanged.
Original223 identity compatibility remains unresolved. No new milestone.

## Parallel synthetic environment feasibility

Actual owner metadata and Supabase create form confirm two active Free projects
(Production and original S2), with new project creation blocked by the owner's
two-project limit. Inactive QA is not established disposable or eligible to
resume within existing capacity. Another organization does not add a free slot;
branching incurs charges. No creation/resume/pause, data write, key generation,
provider setting change or deployment was attempted.

New isolated hosted acceptance is technically possible but currently BLOCKED at
$0 while preserving both active environments. New Vercel project count has
headroom, but commercial-plan eligibility/usage and an additional isolated Stripe
sandbox remain unverified. Existing receiver/operator ref pins require a reviewed
new-environment profile before deployment; unchanged code is not configuration-only
ready. No application tests were rerun for this read-only feasibility assessment.

See [bounded assessment](../../BUYERMATCH_PARALLEL_SYNTHETIC_FEASIBILITY.md),
`parallel-synthetic-feasibility.json` and the actual quota screenshot. No new
completion milestone. Original223-key compatibility remains a separate blocker.

## Preservation-first identity assessment

Fresh read-only S2 aggregates confirm 223 marked-synthetic identity ciphertexts,
9 encrypted provenance payloads, and 215 expected-format HMACs plus 8 length-36
nonstandard hashes (8 linked exposures). Shape is not decryption proof; strict
compatibility remains BLOCKED. Supabase's actual S2 Free backup page states that
project backups are not included. Independent originals remain UNSURE.

**3/3 new local fixed-dummy crypto checks PASS**, scoped lint PASS. A different key
cannot decrypt old payloads or reproduce identity HMACs; preserved bytes remain
recoverable if the correct original is later obtained. No real key generated.
No provider/data/permission change, raw ciphertext/identity export, migration,
deployment or Production/MoneyMap access. Historical tests were not repeated.

See [assessment](../../BUYERMATCH_S2_IDENTITY_PRESERVATION_ASSESSMENT.md) and
`identity-preservation-assessment.json`. In-place replacement is NO-GO. A parallel
isolated synthetic cohort is only a conditional preservation path requiring
resource/custody/routing verification and separate execution approval, not recovery
of legacy plaintext. No new completion threshold is established.

## Authorized private Vercel inquiry — actual result

Inquiry submitted and response received through the authenticated Hobby-account
Vercel Help chat. Vercel Agent's **automated** answer says opaque Secret copying
is unsupported. This is not human confirmation. The offered human case was
blocked by an actual paid-account gate under **CI/CD → Environments**, despite
the assistant claiming it would be free. No case submitted; no pending human
reply, paid plan/trial, public post, secret disclosure/transfer/replacement,
configuration edit, migration or deployment. Original custody remains UNSURE.
See `vercel-support-inquiry.json` and `vercel-support-free-case-gate.png`.

All tests/source packets below are retained, not rerun for this documentation-only
checkpoint. The application remains pinned to `de9009e`; Production/MoneyMap and
processing settings were not accessed/changed. No completion threshold crossed.

## Exact-source preparation after `de9009e`

- Fresh GitHub connector metadata: PR #2 OPEN/DRAFT, integration branch remote
  `531beb77c11a0b8275a321b69e0ce21200650339`. Actual local Git ancestry confirms
  candidate `de9009e165cb15709497e538118d1ceda013cdb5` is six commits ahead with
  99 changed files. Remote and candidate both contain the integration-branch
  automatic-deployment guard; this does not independently prove all external CI
  or connected-project settings. No push performed.
- New offline `scripts/testing/s2-current-source-packet.mjs` reads committed Git
  objects, never credential files/provider APIs. It produces exact command argv
  for push/archive, isolated S2 CLI linkage, single SQL application/history and
  paused protected Preview. **6/6 focused checks PASS**, scoped lint PASS.
  No frontend/server implementation changed; previous build/typechecks retained.
- `exact-source-staging-packet.json` pins the source tree and corrected migration
  hash, records all 17 build/runtime settings and mandatory gates. Commands are
  DATA ONLY, not executed or authorized. Preparation directories are proposals,
  not created. Fresh readiness evidence, trusted-secret compatibility, explicit
  source/migration/deployment/alias approval and detached watchdog source repinning
  are required before execution. Existing `b998305` operators remain preserved;
  do NOT run them against this newer candidate or weaken their source assertions.
- Provider documentation reconfirmed write-only Secret values and no documented
  opaque cross-project recovery procedure. Private owner-entry instructions and
  the conditional provider inquiry are in
  [the existing recovery decision](../../BUYERMATCH_S2_TRUSTED_KEY_RECOVERY_DECISION.md). No support
  inquiry was sent, no values accessed, and no original/target bindings changed.
- Three missing-secret inventories and prior S2 catalog/RLS/pause evidence below
  are retained dated metadata, not newly executed hosted acceptance. Hosted buyer,
  Pro/lifecycle, independent recovery and legal gates remain open. No new overall
  percentage or milestone is claimed. Production/MoneyMap were not accessed.

## Latest continuation from `573e2866abcb91ee2e18cfbeba9a7bc84784a3fa`

Fresh **names-only** provider checks (no values or digests displayed/saved):

| Required Vercel server name | Dedicated S2 Preview | Staging Supabase secret inventory |
| --- | --- | --- |
| `BUYERMATCH_IDENTITY_KEY` | Absent | Absent |
| `BM_RESPONSE_SECRET` | Absent | Absent |
| `BM_WORKER_SECRET` | Absent | Absent |

The three names are consumed by Vercel server modules, not the current Edge
Functions. Installing them in Supabase alone would NOT fix Preview. Preview's
Checkout-key binding and Supabase's Stripe API/signing-secret bindings are present;
this proves name presence, not values, runtime permissions or key compatibility.
See `supabase-secret-name-readback.json` and `vercel-preview-bindings-current.json`.
Original material remains UNSURE, not confirmed lost. The rejected credential file
was not inspected, and no secret was retrieved/copied/generated/installed.

**4/4 additional local acceptance checks PASS**, selected by test name so completed
suites were not rerun: expired/revoked invitation history does not reauthorize a
claim; history uses the frozen invitation property rather than later deal edits;
expired POF approval is denied while rejection preserves file/buyer evidence; and
paid renewal advances the same subscription period once, with idempotent replay,
unchanged CRM records and retained historical usage. These are actual local SQL /
signed-handler fixture checks, NOT Stripe/provider or hosted buyer acceptance.
No application defect was reproduced. App/SQL/operator implementation is unchanged
from `573e286`; previous 109-test, 46-test, TypeScript/build/bundle evidence is retained,
not added together or represented as a new full-suite execution.

### Coverage review and disposition

| Requirement | Existing or added evidence | Current disposition |
| --- | --- | --- |
| Confirmed buyer authentication/profile and account-state denial | `buyer-account.test.js`, `buyer-account-ui.test.js` | LOCAL PASS retained; hosted NOT TESTED |
| Admin/buyer revision conflicts and migration retry | `buyer-account-migration-readiness.test.js` | LOCAL PASS retained; real concurrent hosted test NOT TESTED |
| Ownership, private POF/expiry, immutable audit, personal history | `buyer-account-database.test.js` plus three new checks | LOCAL PASS; current hosted NOT TESTED |
| Starter/Pro boundaries, cancellation/failure, signature/replay, CRM separation | `lifecycle-reconciliation.test.js`, `billing.test.js`, `subscriber-database.test.js` | LOCAL PASS retained; new renewal check LOCAL PASS; Pro/lifecycle hosted NOT TESTED |
| Starter activation and corrected signed invoice replay | Prior provider/database checkpoints | HISTORICAL HOSTED PASS; not claimed for new buyer features |
| Stripe catalog/portal/destination and receiver pause | Readbacks below | Retained HOSTED configuration PASS; no new payment/event/probe |
| Secret binding inventory | Two fresh provider name inventories | CURRENT HOSTED metadata verified; required Preview configuration BLOCKED |
| Push, corrected S2 migration and protected Preview | Exact candidate/source hash and existing rollback plan | AWAITING AUTHORIZATION; none executed |
| Backup restoration and legal publication | Existing resource-gated R2 plan / unapproved review pack | BLOCKED / UNVERIFIED and AWAITING APPROVAL |

### Exact administrative/authorization gap

1. The owner/provider must restore the existing trusted originals **privately** into
   the dedicated S2 Vercel Preview names above, with identity-key compatibility
   validated against existing staging records before use. This requires explicit
   authorization of the private provisioning/validation operation; current scope
   permits inventory only. No replacements or Production/MoneyMap changes.
2. If no trusted original copy is privately available, the next narrow approval is
   a private, free Vercel capability inquiry about a supported opaque transfer of
   the original staging-branch Secret bindings. Prior metadata identifies those
   provider-held bindings, but does NOT prove transfer support or value equivalence.
   Inquiry permission is not transfer permission. Do not use runtime export,
   rejected files, logs or chat to obtain the values.
3. Separately approve the exact local source push, corrected single S2 migration
   (current hash in `followup-fingerprints.json`) and protected Preview deployment /
   alias/rollback window. No broad `db push`, new billing window or public release
   is implied. Once prerequisites pass, proceed within the existing approved TEST
   scope; request normal private synthetic login only if genuinely necessary.

There is no new verified overall 80/85/90/95/100 threshold. Hosted buyer/Pro lifecycle,
legal, recovery and controlled Production release remain open. All previously
verified containment is retained; no processing setting was changed this round.

---

Baseline: local `ddf1928f09f9e831376aec07ad6a56f17cbd3f26`.
Fresh GitHub readback: PR #2 remains open/DRAFT at remote
`531beb77c11a0b8275a321b69e0ce21200650339`; local application work is not published.
No push, deployment, hosted DDL, payment, customer email or delivery occurred.
Production/MoneyMap were not accessed or changed by this continuation.

## Completed technical work

1. **Reproduced and fixed lost updates.** Legacy administrator/import changes did
   not advance new buyer-account revisions. An actual local PostgreSQL test first
   failed with “Missing expected rejection.” The corrected unexecuted migration
   invalidates stale browser revisions when buyer state changes, except activity-only
   touches. Portal writes still advance exactly once and retain immutable evidence.
2. **Fixed pause verification.** Actual deployed GET returns405 before the guard;
   it proves no pause state. The helper now issues exactly one empty unsigned POST,
   with no Stripe event, Auth token or signature. The actual S2 guard returned503
   and its exact paused response. Wrong status/body/redirect/transport stays UNKNOWN.
3. **Rehearsed migration against complete schema history.** All24 historical
   BuyerMatch SQL sources loaded into an isolated PGlite fixture before the new
   draft. Existing records/billing guards preserved; service-only privileges and
   RLS, legacy admin-sync, stale writes, exact revision advancement, failed
   reapplication and interrupted-install rollback/retry verified. No historical
   matching/billing test bodies were imported or repeated.
4. **Prepared acceptance.** B1–B8 buyer onboarding/profile/POF/history/privacy and
   closure cases now extend the existing H1–H9 TEST billing sequence. Existing
   authentication/cleanup mechanisms are reused; no credential bridge was built.

**46/46 targeted tests PASS**, including16 added tests. Frontend/API TypeScript,
scoped changed-file lint and current server bundle PASS. The earlier109-check
application evidence and frontend build are retained; unchanged UI/build suites
were not rerun. Local SQL tests use an embedded PostgreSQL engine, not actual hosted
multi-connection concurrency or a PostgreSQL17 recovery rehearsal.

## Fresh hosted evidence — read-only except an empty guard probe

| Artifact | Actual result |
| --- | --- |
| `supabase-migration-readiness.json` | S2 PostgreSQL17.11; required tables/Auth fields/audit function present; new five tables and proof bucket absent; intake migration already recorded; live billing enabled=false/verified=false |
| `security-metadata.json` | Nine existing private tables have RLS and no anon/authenticated table or column access; current receiver deployment metadata reports version35. Historical v21 replay is not relabeled as a fresh version35 payment test |
| `stripe-catalog-portal.json` | Active recurring monthly licensed USD prices5900/11900 in the exact TEST account; portal payment updates and period-end cancellation enabled |
| `stripe-portal-expanded.json` | Under runtime Dahlia version, exactly approved Starter/Pro product/price pairs; adjustable quantity=false, only price changes, anchor unchanged, create_prorations. Portal is default only inside S2; server explicitly chooses its ID |
| `stripe-destination-inventory.json` | Complete classic/v2 listings contain the same single disabled TEST destination; classic URL is staging only; v2 events_from is @self. No destination modification or event generation |
| `receiver-pause-probe.json` | One empty unsigned POST: exact503 paused guard. It is not a signed Stripe event or billing test |
| `vercel-preview-bindings.json` | Names only, no values/decryption: Checkout key present; three required crypto/worker bindings absent. Portal-ID binding absent in inherited env; reviewed deployment overrides may supply this non-secret ID |

Named CLI profile/account and pinned binaries were verified; default Stripe profile
was not changed. Initial restricted-sandbox network access was UNKNOWN; the same
read-only operations succeeded through approved owner-context access. No login,
key retrieval/replacement/rotation, environment write or provider change occurred.

Table/column metadata is not API/RLS penetration testing. CLI administrative reads
are not proof of installed restricted-runtime key rights. Existing Starter TEST
activation and signed invoice replay remain historical hosted positives; Pro,
plan changes, renewal, failure and new buyer self-service have NOT passed hosted
acceptance. No new event was generated or replayed.

## Exact migration execution boundary

Use the corrected fingerprint in `followup-fingerprints.json`, not the baseline
draft's historical hash. Independent review and explicit S2 application approval
are still required. Apply **only** this canonical reviewed SQL through Supabase's
single-migration mechanism; record its actual provider-assigned migration version.
Do not use a broad `db push`: S2 historical versions differ from source filenames.
Do not replay private intake or the weaker billing predecessor.

The transaction uses5s lock/30s statement limits. A failed installation rolls back
and permits retry; a successful unrecorded reapplication deliberately fails rather
than silently accepting object drift. Migration history prevents ordinary replay.
Unexpected partial objects require investigation, not deletion or permission repair.
Old watchdog/preparer pins must be regenerated/reviewed for this changed helper;
do not execute an old packet merely because its earlier rehearsal passed.

## Remaining gates and exact next actions

1. Authorize a supported private recovery/validation of the **existing** trusted S2
   keys, then install only approved staging bindings. Custody remains UNSURE, not
   confirmed lost. Rejected seed remains blocked; do not generate incompatible keys.
2. Review/publish the corrected local source only after push authorization; approve
   its exact draft migration and protected Preview deployment/alias plan. Reattest
   current source/configuration and independent closure before any test window.
3. Run prepared B1–B8/H1–H9 within existing approved TEST scope once prerequisites
   pass, using normal private synthetic logins. Restore pauses, preserve Starter
   evidence, verify current restricted-key operations and record real outcomes.
4. Obtain final owner/counsel agreement decisions/publication approval. Review
   existing four draft hashes and addendum; no Production agreement is approved.
5. Establish verified owner-controlled Linux/encrypted storage and independent key
   custody; separately authorize acquisition and prove full DB/roles/Auth/Storage
   byte restoration. Existing R2 plan is unexecuted and hardware-blocked; encryption
   artifacts alone are not recovery proof. Do not resume custom Windows work.
6. Only then review/authorize Production migration, contained cutover, smoke tests,
   rollback and public activation. Existing stored enabled Production billing/
   delivery defaults must never substitute for deployment-level disabled guards.

No higher overall completion threshold is asserted. The mandatory gates have
unequal risk and no agreed weights; a draft, plan or local test is not hosted PASS.
Public release remains NO-GO. No owner credential or key should be sent in chat.
