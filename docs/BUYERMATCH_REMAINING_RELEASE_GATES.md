# BuyerMatch remaining release gates — October 23, 2026

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
