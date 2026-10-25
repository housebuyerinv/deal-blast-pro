# BuyerMatch consolidated release-validation evidence

## Current checkpoint — October 25, 2026 owner timezone

Direction: PR #2 reviews 6391606558 / 6391619478. Feature scope remains frozen.
Production/public release NO-GO; draft PR retained. Source implementation candidate
5fab059 remains distinct from operator changes and the exact reviewed canary
202b3d3965aa2fd4bb9e16dab06f207b157b8acd. One paused canary was created; no payment occurred.

| Gate | Status / actual evidence | Remaining acceptance |
| --- | --- | --- |
| Owner access | VERIFIED HOSTED: six authorized records and normal password browser login, checkpoint 6391341559 | No repeat email, signup, key or provisioning |
| Cleanup engineering | VERIFIED LOCAL: prior38 checks retained, four new explicit-context routing checks and lint pass; separate review PASS for b8c0b69/c0fdbf0 and exact fresh-run wrapper hashes. VERIFIED HOSTED: detached deadline cleanup completed with no manual removal | Do not repeat the completed cleanup rehearsal |
| Reviewed source | VERIFIED LOCAL: 509 exported Git blobs match exact 202b source byte-for-byte after disabling Windows archive newline conversion | This is not a deployed artifact |
| Canary preflight | VERIFIED HOSTED: detached worker after launcher exit performed exact-context endpoint disabled=true update, receiver=false and fresh safe readback | No new credentials/login/permission changes were needed |
| Stripe endpoint | VERIFIED HOSTED read-only connector: exact S2 account, TEST mode, expected staging receiver, status disabled | No event replay, update, purchase or secret read performed |
| Build/runtime attestation + removal | Exact202b Preview dpl_DUUyLNdAtKPN1UhGR1Yvgx5MC25B reached READY, aliases[]. Anonymous GETs redirected to Vercel Authentication; browser GET without app bearer denied attestation. GET agreement discovery returned required=true and both exact QA IDs/hashes. Automatic deletion and separate authenticated exact-ID404 PASS; generated hostname is RETIRED | All17 owner BUILD/RUNTIME attestation NOT RUN: private normal login was not completed in the15-minute window |
| Buyer UI | VERIFIED LOCAL prior desktop evidence retained; nine new actual-browser scenarios pass:390px wrapping/keyboard/error focus and private-response missing link, fragment clearing, busy controls, stale-result isolation, current completion and opt-out messaging | Fixed390px iframe is not mobile hardware; subscriber/admin and complete hosted backend round trip remain NOT RUN |
| Billing | VERIFIED HOSTED historical Starter59 activation and corrected v21 signed replay retained | Pro119 50/25/50, portal, plan changes, cancellation, failure/recovery and adverse ordering remain NOT RUN/BLOCKED on controlled-window gates |
| Intake security | VERIFIED HOSTED historical28 assertions/7cleanup/rollback retained; current Production metadata reconfirms zero unsafe table/column grants, RLS and server access | S2 platform-owner deployed review/browser acceptance; no repeat completed DB matrix |
| Legal | VERIFIED LOCAL all4 draft hashes match manifest; approved=false, publicationAllowed=false | Owner/counsel decisions, final exact versions/hashes/effective date; QA fixtures cannot substitute |
| Recovery | BLOCKED ON HARDWARE, not failed: owner confirms no spare Linux computer or external/USB storage in comment6399297749; no restore attempted | Keep$0 non-destructive plan ready; no owner hardware action now; resume only when suitable existing resources and separate setup/export approvals are available |
| Production migration/cutover | VERIFIED HOSTED metadata only: PostgreSQL17.6,67 migration entries, later four source migrations absent by version/name | See exact forward manifest below; backup, reviewed definitions/diff, separate migration/deployment/activation approval |

Current provider-state readback: S2 project Git-unlinked/protected; stable fallback
unchanged; registration/Checkout/live billing/live delivery disabled; Supabase
receiver false; live DBP alias still containment dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE.
The legacy preflight script returned FAIL because it assumes flat whoami output
and omitted explicit API account context. Its stripePaused=false is NOT proof of
an enabled endpoint. Current CLI
whoami uses authorized_accounts:[{id,name,modes}], validated without printing names
or credentials. Actual endpoint operations pass with --stripe-context selecting
the exact S2 account; --project-name only selects CLI configuration. Default CLI
profile and all runtime keys were left untouched.

An orchestration error added Production-only --skip-domain to Preview arguments.
The CLI rejected it before creation; exact-run inventory remained7/no matching run.
Supported --dry reproduced the error. The independently reviewed correction uses
the unchanged reviewed helper's Preview arguments, no alias/promote command,
fresh exact509-file export outside Git, empty project-domains metadata and strict
existing alias/protection checks. Corrected --dry exits0. Original failure evidence
is preserved; no Production-labelled fallback or security bypass was used.

Actual browser fixture uses loopback, synthetic records, mocked provider imports,
connect-src 'none' and rejects non-GET HTTP. No live intake or delivery occurred.
An initial sandbox-loopback timeout was resolved by running the approved synthetic
server in the host context; no firewall or security settings changed.

Recovery discovery limitation: CIM access denied in this process. DriveInfo is
actual filesystem capacity evidence, not proof of Linux availability, encryption,
device ownership, backup capacity or restore readiness. No WSL/Windows recovery
debugging, formatting, mounting, key generation or export was performed.

### Minimal coordinated actions

1. Stripe routing blocker is resolved. Do not reconnect, rotate keys or change
   permissions. Preserve exact S2 CLI context and named profile.
2. The existing conditional approval covers the paused payment-free202b rehearsal.
   That one deployment is now automatically deleted. Do not reuse its retired URL,
   copy sessions/tokens, extend deadlines or create another canary without scope
   authorization. Owner-authenticated attestation remains the unfinished part.
3. Once rehearsal passes, reconcile the existing H1 and lifecycle authorizations
   with exact source/fixtures/window before any enabling. Bundle any genuinely
   missing permissions, current-MVP deployment/alias and supported failure/time
   scenarios; no new TEST purchase is claimed authorized by this checkpoint alone.
4. In parallel owner/counsel can resolve the existing four legal drafts and identify
   already-owned Linux hardware/media. No technical owner commands, paid resources,
   export, device formatting or legal acceptance are requested now.
5. After hosted/security/legal/recovery acceptance, request one exact Production
   release package approval; do not deploy the full integration as security-only.

### Next concrete S2 action proposed for approval (not executed)

Deploy the existing code-complete application source
`5fab059a531f20c1b94c581c1b9e0c95a205a66f` as a protected, paused Preview in the
same dedicated S2 project/team. It is already published as an ancestor of the
integration branch; current api/src/server/supabase directories have no delta from
it. Its build hook, attestation implementation and operator UI are unchanged from
the reviewed202b implementation. No new MVP functionality is proposed.

After exact source/READY/Preview/protection/staging-binding and all paused deployment
argument checks pass, move ONLY the dedicated S2 stable alias to that new verified
deployment. Its actual ID must be recorded before assignment; never invent an ID.
Keep dpl_nr5RVunmUGdryPUtWkRkVdsA96pT and the other seven prior deployments intact.
This can reuse the owner's normal stable-origin session, subject to actual server
verification, instead of requiring another disposable-origin password handoff.
Then run owner-only attestation and read-only current-MVP browser/navigation checks.
If those fail, restore ONLY that S2 alias to its recorded fallback and keep all gates
paused. No Production domain or routing change; no new bypass secret.

Requested scope excludes purchases, subscription changes, registration POSTs,
fixture/database writes, email, delivery, migrations and legal publication. All17
paused values remain mandatory in both scopes. Supabase callback origin stays the
already allowlisted stable S2 origin; no callback/email setting changes are needed.
This is a different application SHA and a stable S2 alias move, so it is not silently
treated as the already-completed one-canary authorization. Hosted TEST billing
windows and eventual Production release remain separately gated.

Owner/counsel business-policy decisions remain unanswered. The owner has now
confirmed no Linux/external/USB resources are available; recovery is BLOCKED ON
HARDWARE, not failed, and does not stop other authorized work. Existing legal
drafts remain unpublished/unapproved. There is no new
key, account, email-provider, Windows command or purchase request.

### Forward-only cutover preparation — NOT authorization

[Exact canonical SQL fingerprints and ledger mappings](BUYERMATCH_FORWARD_RELEASE_MANIFEST.json)
record the four later source files. Production already has the foundation/workflow
chain under provider-generated migration timestamps; do NOT replay the old11-file
bootstrap or blindly db-push every locally unmatched filename. S2-only capture-hook
and stable-callback DDL are deliberately excluded from Production.

Release sequence: (1) verified encrypted recovery and exact remote source; (2) fresh
catalog/function/ACL/source-hash checks; (3) registration create-only additive SQL
with bounded locks, then separately approved security-only paused release and login
smokes; (4) approved BuyerMatch owned-plan and completed-Checkout SQL in order;
(5) private-intake forward reconciliation, after fresh buyer-table schema/policy
review, plus exact secure replacement application; (6) paused protected canary,
auth/CRM/read-only billing/intake/security smokes; (7) separately approved public
activation only after all acceptance gates. Staging success is not Production proof.

Intake correction was direct SQL with no history entry. The private-intake source
already reconciles that contained baseline atomically; never replay bootstrap grants
or fabricate an applied containment migration. Before execution, approve exact
canonical bytes and truthful new ledger entries. Preserve ownership, service-only
RPCs, locks, completed Checkout, subscription owner checks, RLS and unrelated data.
Current SQL is prepared, not re-applied/rehearsed against fresh Production here.

Failure plan: stop activation, retain registration503/billing/delivery pauses and
intake least-privilege containment; roll application routing only to a verified
compatible paused release. Retain stronger additive SQL guards. Never restore the
vulnerable registration handler with signup open, broad buyer grants, or earlier
premature-entitlement functions. A database restore is separately approved recovery,
not an automatic down migration. Preserve exact deployment IDs, definitions/grants,
ledger/source hashes and sanitized before/after evidence.

## Archived October23 planning baseline (not current authorization/status)

Prepared under PR #2 review 6369522557. This is planning and evidence consolidation,
not permission to activate providers. PR stays DRAFT; Production/public launch NO-GO.

## Evidence baseline — do not rerun for progress

Application/security candidate: 6a98cff667a452563a336b8ba175762029038ef5.
Corrected S2 receiver: version 21.
Protected candidate Preview: dpl_Cp9qXVBXtSGozPRKQ7p3atTCF7Hi.
Stable callback alias still serves paused dpl_nr5RVunmUGdryPUtWkRkVdsA96pT.
No new source deployment or alias movement is authorized by this review.

| Evidence | Verified outcome | Limit |
| --- | --- | --- |
| Original integration | 95 focused local tests, typechecks/build and desktop/mobile review passed | Historical candidate; not hosted lifecycle proof |
| Login-handoff correction | 17 local checks and 3 actual dummy-browser checks passed | No new credential transfer authorized |
| Billing correction | 72 focused local checks passed; authoritative invoice and global completed-Checkout guards | PGlite/mocked HTTP; no hosted adversarial failure ordering |
| Staging database | Remote migration 20261023155333, sourced from local 20261023153356_buyermatch_completed_checkout_guards.sql | Timestamp mapping must be retained; avoid duplicate db-push |
| Starter original purchase | Hosted TEST USD59, active 20 analyses / 10 distributions / 25 fanout | Original purchase source; no second purchase needed |
| Corrected receiver | One signed invoice.paid replay returned 200; current subscription/invoice reads succeeded using installed key | Existing paid Starter only |
| Replay preservation | Same event remains one ledger row; 31 record fingerprints and 30 table-security snapshots unchanged | No claim of all possible hostile-account outcomes |
| Registration security | Prior isolated hosted confirmation, transactional/concurrency evidence retained | Do not rerun unchanged Track B/registration matrix |
| Recovery and legal | Planning only / approvals incomplete | Not a successful full restore or legal sign-off |

Latest hosted proof: [PR checkpoint 6369494763](https://github.com/housebuyerinv/deal-blast-pro/pull/2#issuecomment-6369494763).
Migration/deployment proof: [6369133698](https://github.com/housebuyerinv/deal-blast-pro/pull/2#issuecomment-6369133698).

## Exact outstanding hosted matrix

All rows below are PENDING unless explicitly marked otherwise. Local fixtures are
evidence of implementation, never substitutes for these provider/browser outcomes.
Each future stage must independently re-pause before the next stage.

| ID | Remaining scenario | Existing local evidence | Minimum hosted evidence / prerequisite |
| --- | --- | --- | --- |
| H1 | Independent Pro new purchase | Pro 50/25/50 mapping | Existing confirmed Pro fixture's normal private login; exactly one USD119 TEST purchase, completed owned Checkout, signed event, allowance 50/25/50 and CRM preserved |
| H2 | Portal/payment-method management | Owner/customer/session/mode and incomplete-inventory denials | Authenticated owned portal session; only approved plans, quantity 1, own customer/payment methods, protected return; no session URL in logs |
| H3 | Upgrade and downgrade | Same-owned-subscription price mapping; locks and conflicts | Authenticated approved tier changes; actual invoice/proration/billing anchor and effective usage limits agree with owner-approved policy |
| H4 | Cancellation | Period-end access then terminal cessation | Portal schedules cancellation without new charge; access through paid period then terminal denial; bounded synthetic time-control only if separately approved |
| H5 | Abandoned/retry/failed payment | No return-URL activation; current unpaid and unknown invoice checks | Existing owned unpaid fixture reviewed before any retry; approved failure/recovery sequence, current authoritative invoice, no extra subscription or CRM mutation |
| H6 | Reconciliation negatives | Equal-second both orders, stale/current failures, unknown invoice, idempotence | Provider-supported signed scenarios without forged signatures or unsafe retroactive mutation; completed Starter duplicate/read test already PASSED and need not repeat |
| H7 | Completed-Checkout guard negatives | TEST/LIVE pending/null/blank-session denials, exact S2 definition readback | Separately approved staging transaction/owned-fixture negative verification; no unpaid/pending access, no partial ledger writes; not a live-mode payment |
| H8 | Account/CRM/privacy isolation | Foreign owner/subscription/customer rejection; private tables/service-only RPC checks | Two authenticated owned synthetic workspaces; foreign resource access denied; CRM add-on retains plan/roles; no buyer PII returned through public response or cross-workspace routes |
| H9 | Core advertised workflow/consent | Existing matching/usage and current version/hash consent checks | Approved synthetic deal -> analysis -> mock/non-delivering distribution -> controlled response; correct tier limits and scoped acceptance; no real buyer delivery |

H1-H5/H8-H9 require legitimate authenticated fixture access; their mutation portions
need separate bounded approval. H6-H7 can partly be planned without browser login,
but live provider events, fixtures and staging SQL writes are NOT authorized now.
No elapsed-time guess, rate-limit increase, new signup or test-clock manipulation.

## Pro access: supported owner procedure, currently blocked

Existing disposable fixture: user 368f5f93-acf7-4cc3-9805-a4c0817506c3;
dbp-s2-pro-1792721835370@example.com. Verify those identifiers through owner-only
staging access immediately before any future action. Do not reset another identity.

1. Prefer owner normal sign-in with a password already in their custody, using the
   authorized protected browser and the reviewed product-specific login. Owner
   performs secret entry privately, without agent screenshots/AX reads of fields.
   The current corrected candidate's login is
   https://dbp-registration-s2-6qwn9shv2-housebuyerinv.vercel.app/admin-login?product=buyermatch&tier=pro
   (verify READY/source/protection before use). The stable alias's older paused
   application is not assumed to contain that candidate's login correction.
2. If forgotten, Supabase supports server-side auth.admin.updateUserById for a
   password update. Use only an already trusted owner-controlled private privileged
   client; owner performs entry/submission. The agent must not receive the password
   or standard/service key. That private interface is NOT verified available here.
   The Dashboard's recovery/magic-link controls are not represented as Admin reset.
3. Do NOT invoke the current Forgot Password flow as a workaround: source sends a
   recovery callback with type=recovery, while read-only staging hook inspection
   confirms exact stable callback AND action_type='signup' only. No recovery email
   was sent. Expanding that capture hook would be a separate scoped design/approval,
   not an implicit part of this plan.
4. After owner normal login, verify only account identity and destination with all
   secret fields cleared. Never serialize sessions, localStorage or tokens. No
   custom bridges, clipboard transfer, magic-link login substitution or admin token
   used as an app session. Supported API existence is not private workflow readiness.
5. Keep registration/Checkout paused during access establishment. A separate hosted
   test approval must identify the exact tested Preview/stable-alias cutover and
   capture/callback safeguards before payment. Current stable alias still uses the
   older paused recovery deployment. No automatic alias movement in this task.

[Supabase Admin password API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
documents the supported capability; it does not solve owner-secret entry.

## Minimum future authorization and dependency order

- Owner confirms a working private normal-login session for the one existing Pro
  fixture; if no trusted private reset client exists, keep H1 blocked, not a new
  credential-transfer investigation.
- Approve one exact-SHA protected callback/alias cutover if needed, then one H1
  TEST window in S2 only; registration stays paused, temporarily enable only needed
  Checkout/receiver/endpoint gates, inventory pending events, stop on failures, restore
  gates/alias fallback and preserve evidence. No implicit H2-H9 authorization.
- Approve separate bounded lifecycle/security windows identifying affected owned
  fixtures, intended state changes, payment-failure simulation and cleanup policy.
- Identify existing Linux resources and approve the disposable recovery rehearsal
  scope described in R2_STAGING_RECOVERY_RUNBOOK.md. No Production export.
- Owner/counsel decide and approve BUYERMATCH_LEGAL_REVIEW_PACKET.md; do not publish
  or accept terms under this planning instruction.
- Full recovery plus separate SECURITY-ONLY registration release approval precede
  public signup/payment approval. Preserve containment and recovery evidence.

The 80% figure is an owner planning estimate, not an audited completion metric.
