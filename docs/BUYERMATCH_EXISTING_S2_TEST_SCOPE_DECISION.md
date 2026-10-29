# Existing S2: what can proceed without the original identity key?

Read-only review from `9cbdbe31`; application `de9009e`. No hosted request, fixture,
database write, migration, deployment, event, payment, key or processing change.

**Decision: do not buy another Supabase environment solely to unblock billing.**
A bounded billing-only acceptance lane can use existing S2 without installing or
changing any of the three missing buyer secrets. This is source-confirmed test
eligibility, not execution authorization or new hosted PASS evidence. Full buyer
self-service acceptance remains blocked.

| Remaining check | Identity key needed? | Existing S2 disposition |
| --- | --- | --- |
| Protected owner attestation, plans/access/document reads | No | Eligible for scoped read-only verification after exact READY source/config and private normal login are verified; retain prior positives rather than rerun by default |
| Pro TEST Checkout and signed subscription activation | No | Conditionally feasible with existing restricted Stripe credentials, confirmed Pro fixture, agreements and installed billing guards. Requires Checkout/ledger/entitlement writes and bounded processing approval |
| Portal, tier changes, cancellation, failed payment/recovery, renewal/replay | No | Same billing-only lane, per-stage pause restoration. These change Stripe and/or S2 records; even a duplicate replay can update ledger bookkeeping, so not read-only |
| Report Pro50/25/50 plan entitlements | No | Verify authoritative activation and reported limits. Does not prove actual distribution consumption or buyer fanout |
| Buyer create/claim/profile, normal dashboard load | Yes | Create/claim uses keyed email hash; profile/dashboard decrypt identity and verify hash. Cannot substitute fake ciphertext or skip binding |
| Criteria, POF, conflict/history and owner review end-to-end | Full journey depends on compatible buyer identity and new account migration | New migration not installed. Some individual RPC/actions do not decrypt, but cannot claim normal hosted journey without legitimate account setup/load |
| Full invitation/mock distribution/private response journey | Response/worker secrets and appropriate owned fixtures; identity decryption for relevant admin/delivery operations | Blocked as an integrated journey. Receiving an existing valid capability does not necessarily read the signing secret, but a fresh signed invitation chain remains unverified |

## Exact source findings

- `checkout.js`, `catalog.js`, `portal.js`, `billing-config.js` and `onboarding.js`
  do not reference the identity/response/worker secrets or buyer crypto helpers.
  The signed `buyermatchBilling.ts` reconciliation path uses Stripe subscription/
  invoice/price reads and service-only billing RPCs, not buyer identity decryption.
- The HTTP `plans`, `access`, `onboarding`, `checkout` and `billing-portal` actions
  enter those independent paths. Importing the shared crypto helper does not call
  its key function; crypto access occurs in separate buyer/admin operations.
- The actual Plans UI's reload returns after plans/onboarding and does not call
  `admin-list`. Use the direct subscriber Plans route, not network administration.
  Auth identities/workspace ownership are separate from `bm_buyers` encryption.
- Existing billing migrations/guards are recorded in retained S2 metadata. Billing
  does not require the uninstalled buyer-self-service migration. No new migration
  is proposed merely to run Pro billing tests.

## Future billing-only execution boundary

Use existing S2 project/ref and Stripe sandbox only, with the already-confirmed
owned Pro fixture and its legitimate private normal login. No new Auth signup,
password reset, buyer fixtures or original-key installation. Read current invoice/
Checkout state first; do not alter the historical unpaid Checkout or Starter
subscription. Retain completed tests; only remaining scenarios are candidates.

Whitelist only owned synthetic subscriber billing changes: agreement acceptance
if genuinely required, completed Checkout reservation/session mapping, TEST
subscription/portal lifecycle, entitlement/reconciliation ledger and ordinary audit
effects. No `bm_buyers` ciphertext/hash/source/criteria writes, new buyer binding,
POF, exposures/outbox, imports/merges, worker/response calls or distributions.
Fingerprint the223 original buyer rows/dependencies before and after any future
authorized window without exporting row contents; changes/unknowns mean STOP.

Important pause boundary: `BM_CHECKOUT_ENABLED` gates Checkout creation, **not**
`subscriberPortal` in staging. Portal payment/cancel/change flows can create Stripe
sessions independently of that flag. This is not by itself an authorization flaw
for an owned existing subscriber, but it means Checkout pause is not proof that
all portal actions are disabled. A future billing-only runner must explicitly
bound portal actions/session lifetime and independently verify closure behavior;
do not claim endpoint/receiver pauses revoke an already-created Stripe session
or undo an accepted provider operation. No portal session was opened here.

Registration/live billing/delivery remain disabled. Enable only approved TEST
Checkout and signed webhook gates for one bounded stage, with independent detached
closure for BOTH Stripe endpoint and receiver and exact temporary-deployment
cleanup. Verify paused503 and all safeguards afterward, including on failure.

The current generic recovery/staging packet requires three-secret compatibility
and pins older operators: **do not run it or remove assertions ad hoc**. A reviewed,
tested billing-only operator/approval packet must explicitly support the exact
candidate while retaining all relevant ownership,17-setting attestation, origin,
restricted-key, completed-Checkout and cleanup checks. Verify whether an existing
protected READY deployment is suitable; if not, obtain separate exact-source
Preview/alias authorization. Do not assume the fallback contains current code.

**Current authorization remains review-only: no tests/windows opened.** Next
engineering step is that bounded billing-only packet, followed by explicit approval
of its exact hosted operations. Original-key recovery, buyer acceptance, legal,
independent recovery and Production release stay separate. A synthetic fixture
or direct SQL check cannot validate the223 identities. No milestone; NO-GO.
