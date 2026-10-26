# BuyerMatch Milestone 1B release checklist

Current engineering direction: **release validation; MVP feature scope frozen**,
PR review6405583960. Code-complete is not public-release approval.
See [implemented feature inventory, local evidence and the consolidated prelaunch
checklist](BUYERMATCH_FEATURE_COMPLETION.md). External owner/provider/legal/recovery
gates below remain release requirements and do not stop authorized release
validation and defect fixes. The
private buyer-intake migration is applied and recorded in S2 only. Production
restoration remains unapplied and requires separate authorization.

Current review: October25,2026, PR#2 direction6405583960.
**PR DRAFT; Production/public launch NO-GO.** This checklist replaces stale
infrastructure prerequisites and rollback instructions from initial PR creation.

## Current evidence and provenance

Application source is frozen at b99830596080eef2b24472e71bdcb061c855bf57;
later integration-branch commits record reviewed operators/evidence, not a new app
candidate. Exact b998305 reached READY in protected paused S2 as
dpl_9N41ZRqvCoSMHimYkrK5gRuPZM7y; owner17/overview/plans passed, network-admin503
failed, and automatic fallback restoration passed. Remaining browser/hosted billing
acceptance was not run. Historical hosted billing source remains
6a98cff667a452563a336b8ba175762029038ef5; source publication is not hosted proof.
Base: codex/buyermatch-network at 501cb6a4566211f6828633f862163420fed9c016.
Milestone 1A and registration repair are integrated here; this branch must NOT be
released as the separate security-only hotfix.

- Independent BuyerMatch signup/product-tier intent, confirmed routing, CRM Free
  provisioning, owned Checkout/portal, consent and authoritative entitlements are
  implemented. Existing CRM access is separate. Buyer privacy/matching rules retained.
- Starter USD59/month: 20 analyses, 10 distributions, 25 maximum buyers.
  Pro USD119/month: 50/25/50. Quantity fixed at 1; managed services separately arranged.
- 95 initial focused checks/build/typechecks and 17 login-harness/3 dummy-browser
  checks are historical passes; 72 billing-correction checks also passed.
  These are different evidence sets, not an additive percentage or hosted matrix.
- Hosted original Starter payment/activation PASS; corrected receiver v21 one
  signed paid-invoice replay/read/idempotency PASS. Pro/lifecycle/privacy workflow
  hosted gates remain pending. Do not repeat completed tests without relevant change.
- New completed-Checkout guard SOURCE migration
  20261023153356_buyermatch_completed_checkout_guards.sql is already applied to
  S2 as remote migration 20261023155333. Do not blindly db-push it again.
- Historical corrected billing Preview (preserved evidence):
  https://dbp-registration-s2-6qwn9shv2-housebuyerinv.vercel.app
  / dpl_Cp9qXVBXtSGozPRKQ7p3atTCF7Hi.
- Stable callback alias remains paused recovery deployment
  dpl_nr5RVunmUGdryPUtWkRkVdsA96pT. Future cutover requires exact-source/protection
  verification, not a silent alias reassignment.
- Dedicated Vercel project prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl; Git unlinked,
  all-deployment Authentication, no new bypass. Integration Git builds disabled by
  vercel.json before push. Production branch/project remain separate.
- Staging Supabase qxhhlprentrufobpcgna; dedicated Stripe TEST sandbox
  acct_1UTRcRL6efr9LhPI. Approved catalog, restricted keys and portal installed.
  Sensitive provider values remain private; local env redaction is expected.
- Registration, Checkout, live billing and delivery remain paused/non-delivering;
  receiver=false, Stripe endpoint disabled. No new test or activation authorized now.
- Production containment remains dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE. MoneyMap untouched.

See [exact hosted/local matrix and Pro access plan](BUYERMATCH_REMAINING_RELEASE_GATES.md),
[legal decisions](BUYERMATCH_LEGAL_REVIEW_PACKET.md), and
[staging recovery rehearsal runbook](R2_STAGING_RECOVERY_RUNBOOK.md).
New review 6369788952 adds 19 targeted local delta checks (all PASS), a
[bounded test sequence and cleanup-helper limits](BUYERMATCH_HOSTED_TEST_SEQUENCE.md),
and [four versioned review-only legal drafts](legal/buyermatch-review-v0.1/README.md).
No application/hosted outcome or legal approval is implied by these additions.
Historical evidence is retained in BUYERMATCH_BILLING_FIX_REVIEW.md and the dated
BUYERMATCH_LOCAL_LIFECYCLE_REVIEW_2026-10-23.md; their statuses describe those dates,
not pending work already completed in later PR checkpoints.

## Release order and blocking acceptance gates

1. Owner-controlled normal access to existing Pro fixture; no new credential bridge,
   signup, magic-link substitution or rate-limit changes. Current capture hook is
   signup-only, so Forgot Password is not assumed to work. H1 approval must be bounded.
2. Pro TEST activation; separately bounded portal/tier/proration/cancel/failure and
   signed ordering/Checkout-negative tests. Account/CRM/privacy and advertised
   mock distribution/response/consent tests must pass. Restore pauses each stage.
3. Verified native Linux resource, encryption/isolation, synthetic then complete
   staging recovery, independent key custody; separately approve Production
   acquisition and isolated full restore. No Windows recovery development.
4. Approve exact BuyerMatch legal versions, commercial policies and consent
   publication; QA-only agreements never become real terms by changing a flag.
5. Separate minimal security-only registration release remains
   1d513f6f75b0a8ec19647da3d82105490508f092 (prior checkpoint), including paused-login
   read-only status correction. Reverify exact remote/source before any release;
   no security-only deployment from the full BuyerMatch integration branch.
6. Separately approve Production migration/paused canary, existing-customer smoke
   tests and controlled cutover. Public registration/live payments require explicit
   approval after security/recovery/legal/hosted gates. No automatic reopening.

## Rollback and record protections

Preserve registration containment or a verified paused repaired release; NEVER
revert to vulnerable open signup. Retain stronger completed-Checkout SQL guards on
application rollback. Before any future DB-definition rollback, capture exact
current definitions/owners/ACLs/search_path and review dependencies. Prior wrappers
contain the reproduced pending-Checkout gap; any separately reviewed restoration
must keep billing paused until the stronger guard is restored. Do not use initial
migration definitions as a blanket rollback. No records, RLS or grants are to be
deleted or weakened to make a release pass.

Existing starter evidence, security-only candidate and recovery forensic artifacts
remain preserved. No Production, customer, billing or MoneyMap mutation is authorized
by this checklist. Current scope is local code verification and publication to
the draft PR only; hosted execution and release require their explicit gates.
