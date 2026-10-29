# BuyerMatch local release candidate — October 26, 2026

Latest local build-completion continuation:
[`BUYERMATCH_APPLICATION_BUILD_COMPLETION_20261027.md`](BUYERMATCH_APPLICATION_BUILD_COMPLETION_20261027.md).
It supersedes older source/migration pins below, adds real subscriber activity and
owner operations, and corrects inherited grants in the unexecuted buyer-account
draft. Hosted and Production gates remain pending; historical evidence below is retained.

Follow-up continuation from `ddf1928f09f9e831376aec07ad6a56f17cbd3f26`:
the unexecuted draft migration now invalidates stale portal revisions after legacy
administrator changes, closing a reproduced lost-update defect. Its fingerprint
has therefore changed; the old `ui-evidence/buyer-self-service/` pins are historical.
Use current `release-evidence/2026-10-26/` evidence for the corrected draft.
The receiver pause probe also now uses an empty unsigned POST: GET receives 405
before the deployed pause gate and cannot establish its state. No event is sent.

Implementation checkpoint, not Production approval. Feature scope is complete for
the requested buyer self-service and existing subscriber MVP. No push, deployment,
hosted migration, payment, email, delivery or provider change was performed.

## Completed journeys

| Area | Implemented behavior |
| --- | --- |
| Public product | Dedicated overview, features, workflow, pricing and buyer guide; PR #2 comment 6424360093 headline, feature cards, subscriber/buyer onboarding and FAQ integrated |
| Commercial separation | Starter $59/month = 20 analyses / 10 distributions / up to 25 buyers; Pro $119 = 50 / 25 / up to 50. No CRM price, discount, trial, credit pack or subscription changed |
| Buyer account | `/buyermatch/buyers/account`: normal confirmed password authentication; new pending profile creation or explicit legacy linkage; no new Auth provider, role, workspace or paid subscription assignment |
| Legacy ownership | Durable one-user/one-buyer binding requires confirmed Auth plus valid, delivered, identity-matched private invitation. Receipt/email alone never links, merges or overwrites a legacy record |
| New profile | Creates only a new pending profile using server-encrypted confirmed identity; rejects any preexisting identity hash; registration pause is checked and defaults closed |
| Profile and criteria | Private name/company/phone updates; identity hash and canonical encrypted email cannot be changed by the form. Existing criteria validation reused. Revision conflicts and operation replay are atomic. Changes require review; prior opt-outs persist |
| Consent | Versioned explicit accuracy/storage authorization; invitation consent optional. Separate withdrawal requires no new agreement; pending deliveries suppressed. Technical QA consent is not legal approval |
| POF | Private 2 MiB PDF/PNG/JPEG replacement, content signature and expiry checks, rate-limited reservation before upload, no upsert, retained predecessors, immutable review decision; no automatic funds verification or eligibility activation |
| Owner review | Existing network admin screen contains a private paginated proof queue, scoped 60-second attachment links and accept/reject controls. Confirmed active platform-owner checks include independent banned-account denial |
| Personal dashboard | Delivered invitations only; paginated deal states, interests/declines, offers and response/conversation history. Cross-buyer filters and existing contact redaction preserved; no expired invitation reactivation |

The public intake form remains available as a separate guest submission journey.
Its receipt does not become an account credential. Initial legacy POF submissions
remain in the existing reviewed intake contract; new account uploads are separately
versioned private evidence, not a claim to backfill or duplicate old attachments.

## Evidence and limitations

- New database, service/HTTP and component checks plus the four directly affected
  existing regression files are recorded in `ui-evidence/buyer-self-service/focused-tests.txt`.
- SQL ran in a disposable PGlite PostgreSQL engine using the actual foundation and
  draft migration, not regex-only assertions. Competing-claim tests are explicitly
  single-connection serialization; true multi-connection races remain hosted acceptance.
- Frontend TypeScript, scoped API TypeScript, scoped lint, real server bundle and
  credential-free Vite production build were checked. The synthetic build is NOT
  an approved hosted release artifact. Existing shared-bundle warnings remain.
- Actual local browser inspected desktop/mobile layout, form labels, profile-save
  feedback and history controls using the real presentation with synthetic adapters.
  Screenshots are marked synthetic; they do not prove hosted Auth or Storage.
- Separate AI review identified and verified fixes for history contact redaction,
  offset-preserving pagination, uncertain-save messaging and banned owner reads.
  Later create-only/profile additions received focused negative tests and source
  review by the implementation agent; final independent review of the complete
  delta remains part of normal prelaunch review, not claimed as completed.
- The four existing legal drafts still match their manifest hashes and remain
  unapproved/unpublished. See the new owner/counsel decision addendum.

## Migration and rollback boundary

`20261026175709_buyermatch_authenticated_buyer_self_service.sql` is a NEW LOCAL
DRAFT. It adds private account/audit/proof/reservation/review tables, service-only
RPCs, a private bucket and a restrictive browser exclusion for that bucket.
It neither replaces nor authorizes execution of the prior four-source cutover.
The private-intake migration is already recorded in S2 and must not be replayed.

Before any later authorized application: independently verify actual prerequisites,
roles, Auth columns, Storage policies and reviewed SQL fingerprint; rehearse with
synthetic fixtures and existing schema. Apply separately to S2 first. Production
requires its own backup, reviewed migration manifest and explicit authorization.
Rollback keeps new private evidence and denial policies intact, restores the
approved application fallback, and disables access to the new endpoint rather
than dropping buyer data, deleting proofs or reopening direct table grants.

## One final acceptance sequence

1. **Source/security:** review this complete local delta and new migration; preserve
   separate registration-only branch and direct Production containment history.
   Publish only after separate push authorization and automatic-build safeguards.
2. **Protected S2:** recover trusted existing server-secret custody without using
   the rejected file or generating incompatible encryption keys. Authorize draft
   migration and exact protected Preview; attest deployed identity/configuration,
   preserve alias fallback and independent cleanup. Existing owner login, hosted
   17-setting attestation and automatic rollback evidence are retained.
3. **Functional/privacy:** hosted Auth-to-API-to-database/Storage buyer profile,
   criteria, immutable proof replacement/review, expiry, pagination, cross-account
   denial, actual concurrency and rollback; browser/keyboard/mobile plus subscriber
   deal → analysis → eligible match → consented distribution → private response.
   Use owned synthetic fixtures only; restore all pauses and clean only those fixtures.
4. **TEST billing:** exact approved S2 sandbox; Pro $119 activation/50-25-50,
   existing CRM separation, portal changes, upgrade/downgrade, cancellation,
   payment failure, renewal and out-of-order/duplicate reconciliation. Preserve
   Starter and signed replay positives; do not repeat without a relevant change.
5. **Legal/recovery:** owner/counsel decisions and separately approved exact agreement
   publication; independently controlled keys and full encrypted DB/Auth/roles/
   Storage backup with isolated restoration. Linux recovery is blocked on hardware,
   not marked failed; no Windows custom recovery work resumes.
6. **Production:** reconcile direct containment and migration history, review the
   final forward manifest, verify deployment-level flags (stored Production defaults
   include enabled billing/delivery), release while registration remains contained,
   run authorized smoke checks, verify rollback, then obtain separate public activation.

Production remains NO-GO. MoneyMap and Production/S2 controls were not changed.

## Current gate disposition

| Gate | State | Evidence / next dependency |
| --- | --- | --- |
| MVP / authenticated buyer self-service | Implemented locally; locally tested | `ddf1928` plus this narrow lost-update correction; completed UI/features preserved |
| New migration prerequisites | Hosted metadata verified; locally rehearsed | Actual S2 PostgreSQL17.11, expected dependencies, no new tables/bucket; local full24-source chain, privilege checks and rollback/retry pass. Application remains awaiting authorization |
| Existing S2 privacy perimeter | Hosted metadata verified | Nine inspected tables retain RLS and deny anon/authenticated table AND column privileges. This is not a hosted API/Storage acceptance test |
| Stripe configuration | Hosted metadata verified | Exact isolated TEST account, $59/$119 recurring prices, expanded portal product/quantity restrictions, disabled endpoint; receiver pause503 verified with empty unsigned probe |
| Starter and signed replay | Historical hosted independently verified | Retain actual paid Starter and corrected signed invoice replay/idempotency evidence; not repeated |
| Current buyer/Pro lifecycle | Prepared; blocked by activation prerequisites | Missing trusted server secrets and unapproved new migration/deployment; normal private fixture authentication also required. B1–B8/H1–H9 are not executed PASS |
| Legal | Prepared; awaiting owner/counsel approval | Four unchanged hash-verified drafts and review-only addendum; no agreement publication |
| Recovery | Blocked on resources; restoration unverified | No verified independent Linux/storage/key-custody acquisition/restore. R2 plan is not a backup; Windows debugging remains closed |
| Production cutover | Awaiting separate authorization; NO-GO | Preserve direct containment, source separation, complete backup, migrations and deployment-level disabled overrides before any activation |

No new overall 80/85/90/95/100 threshold is claimed. There is no agreed weighting
that turns these unequal gates into a defensible percentage; local feature completion
must not be presented as overall release completion.
