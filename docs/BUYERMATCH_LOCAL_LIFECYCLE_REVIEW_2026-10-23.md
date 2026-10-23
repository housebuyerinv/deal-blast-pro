# BuyerMatch local lifecycle review — October 23, 2026

> Historical red-regression checkpoint at the base source below. The two defects
> now have a [local correction and 72-check green verification](BUYERMATCH_BILLING_FIX_REVIEW.md).
> No hosted migration/deployment or Production approval is implied. The original
> audit findings and executed red results are preserved below for provenance.

Scope: PR #2 review instruction 6356478807. Base source
`01f4f014728ff15d8cbf23acf963930deb76b5ae`. Hosted Pro testing and credential
transfer work are parked. No application, migration, provider configuration,
customer record or deployed function was changed by this review.

## Executed evidence

New command: `node --test tests/buyermatch/lifecycle-reconciliation.test.js`.
**13 new checks executed: 11 PASS, 2 FAIL; none skipped or TODO.** The two failing
regressions are intentionally retained as failing tests pending correction review.
Existing 95 focused implementation checks, 17 harness tests, three dummy-browser
checks and four local adapter checks were not repeated or counted again.

The new suite compiles the actual signed Stripe webhook and runs its billing RPCs
against the actual reviewed migration chain in an in-memory PGlite database. Every
HTTP request is intercepted; unexpected paths fail. All credentials, identities,
events and provider snapshots are synthetic. This is neither a Stripe TEST purchase,
hosted PostgreSQL concurrency proof, real network-isolation recovery test nor proof
that a provider grants a restricted-key permission.

| New local case | Actual outcome |
| --- | --- |
| Paid Pro Checkout with exact 50/25/50 catalog limits | PASS |
| Same signed event delivered twice, one immutable billing ledger entry | PASS |
| Strictly older failure following a newer applied recovery | PASS |
| Past-due failure then newer paid recovery | PASS |
| Same owned subscription Pro → Starter → Pro allowance recalculation | PASS |
| Cancel at period end retains access; terminal cancellation stops it | PASS |
| Foreign-owner mapping rejected without ledger/entitlement mutation | PASS |
| Conflicting subscription rejected without replacing existing entitlement | PASS |
| Unsigned event denied before provider/database operations | PASS |
| Browser roles cannot read private buyers/ledger/entitlements or execute billing | PASS |
| CRM sentinel unchanged; no CRM, notification or delivery endpoint calls | PASS |
| Equal-second delayed failure after paid recovery | FAIL: active became inactive |
| Initial activation while original Checkout is pending | FAIL: returned 200 and activated |

The historical **hosted Starter $59 paid/active PASS** remains separate evidence:
PR checkpoint 6355628795, subscription `sub_1UTXhrL6efr9LhPIcFXtI3Ha`, correct
20/10/25 allowances, Free CRM, signed Endive reconciliation. No new hosted payment
occurred in this review. Pro catalog PASS is not Pro payment PASS.

## Confirmed correction candidates — not implemented

1. **Equal-second event ordering:** `handleBuyerMatchBilling` fetches the current
   subscription but still forces inactive for `invoice.payment_failed`. The SQL
   ledger ignores strictly older timestamps (`previous > incoming`), but permits
   equal timestamps. A delayed failure and a recovery with equal event seconds
   can therefore revoke currently recovered access. Fix the reconciliation policy
   using current subscription/latest-invoice evidence and explicit failure-event
   identity/period semantics; cover both equal-second delivery orders. Do not
   blindly discard all equal-second events or weaken signature/ownership checks.
2. **Initial completed-Checkout prerequisite:** the corrected billing wrapper puts
   `state='completed'` and non-null session requirements inside the alternative
   tier-change branch. The original-price branch can still activate a pending
   Checkout. The new signed local subscription-created case proves this in the
   test RPC. Code inspection shows the same branch placement in the live wrapper;
   no live-mode provider or Production behavior was exercised. Require the owned
   completed Checkout/session prerequisite for initial activation as well as tier
   changes, retaining advisory locks and service-only execution. Prepare a NEW
   corrective migration after review; do not rewrite an already-applied migration.

These are launch blockers. The pending-Checkout finding is not proof that an
unpaid real customer received access: the local provider fixture was active, and
the live handler has additional invoice checks. It does establish a missing
database precondition that the release requirements say must be preserved.

No correction was silently deployed, no event timestamp policy was changed and no
database privilege was relaxed. Scope for the next review is these two defects
and their regression tests, not a billing redesign.

## Remaining hosted authenticated checks

Local PASS does not close any of these hosted gates:

1. Pro: normal confirmed-owner login, one $119 TEST payment, paid invoice, quantity
   one, 50 analyses / 25 distributions / 50 buyers; CRM Free unchanged.
2. Owned Starter/Pro portal entry and payment-method update: restricted-key calls,
   returned origin, correct customer inventory, only the two approved products.
3. Upgrade/downgrade: provider-confirmed price and proration, same subscription,
   recalculated usage/allowances, actual signed webhook reconciliation.
4. Cancellation: provider period-end date, access until that date and cessation
   afterward; no immediate duplicate subscription or unintended CRM cancellation.
5. Failed/abandoned Checkout and payment recovery: no premature access, safe retry,
   failed-payment state and eventual current paid state. Do not force-expire the
   retained historical unpaid Checkout.
6. Deliberate signed duplicate/out-of-order delivery against the deployed corrected
   receiver, actual provider retry inventory and exactly-once DB effects. Event
   injection/replay is outside the present paused/read-only authorization.
7. Two authenticated synthetic workspaces: foreign deal/Checkout/portal identifiers
   denied; an existing CRM subscriber adds BuyerMatch with CRM records unchanged;
   buyer identities, private analyses, evidence and files stay inaccessible.
8. Advertised deal → analysis → eligible synthetic distribution → buyer response
   flow, current deal-specific consent and scoped callback. No real buyers/emails.

Provider-only status reads and static/local reviews need no customer login, but do
not substitute for these flows. Stages B/C remain gated on preceding hosted stage
success and independently restored pauses. Corrected code needs focused validation
and review before a new protected Preview is proposed.

## Owner-only access option — procedure, not new tooling

The current confirmed synthetic Pro fixture is
`368f5f93-acf7-4cc3-9805-a4c0817506c3` in staging `qxhhlprentrufobpcgna`.
The supported Admin password update API was verified in PR checkpoint 6356332865;
the current Dashboard view exposes recovery email/magic link, not direct password
entry. Do not pretend those email actions are a private direct reset control.

If the owner later chooses to unblock hosted testing, use an already-supported
owner-controlled private server/Admin session to set a password for ONLY that
fixture, with exact project/user checks, no external reset email and no key in a
browser. The owner then signs in normally in the authorized protected S2 browser,
keeping the password private. Agent observes only the authenticated destination
after credential fields are cleared and verifies account identity. No admin token
becomes the application session. The actual private operator interface must be
available and verified first; this document is not a working launcher or a request
to paste a password. No additional custom credential bridge is proposed.

## Recovery and backup readiness

The native-Linux replacement remains PLAN ONLY. No suitable already-owned Linux
machine or separate encrypted media has been independently established. Historical
Windows inventory is not a current Linux resource verification. There was no new
Windows debugging, mount, installation, device formatting or Production export.

Required before release: owner-identified existing $0 hardware/media and capacity;
verified encrypted working storage and spill controls; network-isolated PG17 with
Supabase extensions; synthetic restore; independent offline recovery-key copy and
restore challenge; an approved consistent database/Auth/roles/grants/RLS manifest
plus Storage object bytes/checksums; then separately authorized encrypted Production
acquisition and isolated full restore. Vault/provider/signing secrets and external
platform settings require separate dependency/custody inventory. Existing Windows
artifacts/forensic evidence remain preserved. Retain backup seven days after secure
cutover; review at 30 days if delayed; retain unresolved-incident evidence.

See `R2_NATIVE_LINUX_RECOVERY_PLAN.md`. No paid resource or new owner command is
proposed here. Production recoverability remains UNVERIFIED / NO-GO.

## Legal and consent readiness

Read-only S2 SQL independently confirms both current approved/hash-matching
platform_terms and privacy documents are **staging-fixture-v2 / SYNTHETIC QA ONLY**.
Their approval flags exercise consent software; they are not approved legal terms.
The public Terms/Privacy/Refund/AUP pages are generic DBP text dated July 15, 2026;
their existence does not prove approval of an independent BuyerMatch consent pack.

Before paid launch, the owner/appropriate reviewer must approve the exact versioned
BuyerMatch software terms/privacy/refund/cancellation and renewal disclosures,
independent billing/proration and allowance behavior, buyer privacy/contact-consent
handling, managed-disposition separation, and applicable tax/jurisdiction decisions.
Reconcile public text with the actual Checkout/portal behavior and archive the
approved version/hash/acceptance evidence. No new legal language was invented,
published or accepted during this review. This is an artifact/approval gap review,
not a legal compliance opinion.

## Security-only release and containment

Separate security-only workspace remains clean at
`1d513f6f75b0a8ec19647da3d82105490508f092`; no BuyerMatch billing integration was
added to it. Its Production release still requires the recovery gate, separately
approved additive registration migration, protected paused canary, existing-user
checks and explicit cutover authorization. Never roll back to vulnerable open signup.

All hosted processing pauses must remain active. PR #2 stays DRAFT. The two local
billing defects, unexecuted hosted flows, recovery and legal approvals keep the
public/Production release **NO-GO**. Portals, AI agents, redesigns and new matching
models remain outside this milestone.
