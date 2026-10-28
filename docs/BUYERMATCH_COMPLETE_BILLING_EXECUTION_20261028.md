# Consolidated independent billing execution — 2026-10-28

Approved application: `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc`.
Parent authorized operator: `bb60f1f346fe7d0407388df69746e4b59c468a4c`.
This checkpoint changes the operator only. No application, dependency, migration,
encryption-key or hosted configuration change is part of this implementation.

## Executable path

`s2-billing-launch.mjs` starts `s2-billing-execution.mjs` as a detached process,
which verifies launcher exit and every pinned executable dependency. Hosted mode
rejects injected fixture providers. Synthetic mode requires all fixture providers
and cannot silently fall through to a native cloud connection. The shared owner-
custodied coordination root is fixed; all runs use the same exclusive resource lock.

The non-probe native Stripe transport is constructed with all three actual readers:

- `readCheckoutReceipt`: fresh, read-only S2 SQL selects only the exact owner's
  campaign Checkout identifiers. A separate Stripe inventory must agree on every
  session, owner, run, product, tier, timestamp and mapping. It rejects unresolved
  null mappings, orphaned sessions, extra objects and incomplete inventories.
  Every successful observation is persisted as a new fsynced, scope-bound record.
- `readCheckoutPolicy`: independently observes issuance pauses, reconciles the
  same two real inventories, then checks pauses again. It does not infer completed
  issuance from a launcher's success flag. Historical pending Checkouts for this
  owner are separately read back; an open or unknown prior session prevents arming.
- `verifyPreservation`: runs fresh SQL through the existing Supabase CLI profile
  and Management API, compares the result with a newly captured durable baseline,
  and re-reads pre-existing Stripe subscription sentinels. Baselines bind the exact
  source/run/account/owner/plan digest and a recent pre-window observation. Current
  query timestamps must be fresh. No buyer plaintext, ciphertext, Auth credentials
  or Checkout capability URLs are returned. No identity key is accessed.

Preservation covers all fields of the223 buyer rows (including all9 provenance
payloads), the8 nonstandard hashes, exposures, response tokens, outbox, duplicate
reviews, account profiles, other entitlements and pre-existing Stripe subscription
sentinels. Expected campaign-owned BuyerMatch entitlement changes are excluded;
this is not a claim that all possible S2 tables or encrypted recovery were tested.

Native provider execution uses existing private CLI custody. Supabase queries are
limited to the three exact reader statements, in read-only transactions with a
statement timeout and rollback. Public pinned executables are staged into owner-
only custody; credential files are never copied or read by the operator. Vercel
reads verify exact S2 project/team ownership, protection, pauses, original fallback
and complete deployment inventory. Current project defaults are not substituted
for an immutable Preview's full17-setting runtime attestation.

## Arming, limits and teardown

`prepare` must finish all provider/preservation/containment checks before `arm`
can claim the shared lease and persist the subscription baseline. A durable ready
receipt precedes foreground action permission. The foreground must maintain a
fresh heartbeat and reserve one create-only intent for each Preview, Checkout or
signed event. Limits are2,1 and12 respectively. Duplicate keys and unknown outcomes
consume their slot; a foreign lease, closing marker or expired window denies work.
The launcher caps the whole run at30 minutes, with preflight inside that bound.

On close request, lost/stale heartbeat or deadline, the independent worker:

1. Attempts exact TEST endpoint disable and S2 receiver pause independently.
2. Restores the original S2 alias only if its current target is the exact owned
   temporary Preview. It rejects unrelated routing. It removes at most two fresh,
   run/source/project/team-bound Previews, independently observes404 and preserves
   every baseline deployment. No pre-existing Preview is removed.
3. Reconciles and expires only an owned open Checkout, with separate readback.
4. Cancels only its durably proven new TEST subscription through the original
   ownership validator, then performs independent provider readback. Pre-existing
   subscriptions, shared CRM customers, unrelated invoices and unknown ownership
   are rejected. A durable exclusive intent prevents another automatic DELETE
   after an unknown outcome, including after interruption.
5. Verifies Portal exclusion, fresh original-data/CRM preservation and final
   provider state. Journal failure does not suppress other cleanup attempts, but
   prevents success/lease release. Resource and completion receipts are distinct;
   lock release and evidence failures cannot be reported as a completed cleanup.

There is no Portal creator in the runtime. Coverage validation uses immutable
source comparison and read-only attestation/status GETs only. An early diagnostic
denial-probe approach was removed after automatic review rejected a follow-up POST
to a Portal-creation route. No approval expansion or indirect retry was used.

The owner entrypoint provides `verify-runtime`, exact-SHA `start`, `beat`, `reserve`
and `close`. `verify-runtime` constructs the full non-probe dependency graph but
cannot mutate hosted state. `start` requires a clean, committed, exact approved
operator SHA; it still refuses to arm if any environmental gate is unverified.
Normal private browser authentication and the approved application's acceptance
assertions are not replaced by token extraction or synthetic readiness flags.

## Verification and honest execution decision

26 distinct new checks passed:13 complete detached runtime scenarios with actual
disk leases/journals, SQL-backed PGlite fixtures and CLI subprocesses;13 source,
resource-ownership and mode-isolation checks. Scenarios cover launcher exit,
interruption, deadline, open Checkout, unknown cancellation, failed readback,
shared/pre-existing billing, foreign Preview, preservation drift, evidence failure,
prior open Checkout and all action limits. Scoped lint passed. Previously completed
BuyerMatch application and cleanup suites were not repeated.

Actual hosted provider reads verified the full non-probe startup through fresh
Checkout reconciliation, receipt and preservation readback:223 buyers,9 provenance
payloads,8 nonstandard hashes; the existing TEST account and Pro price, pre-existing
subscription sentinels, S2 Management API query access, project/team/protection,
receiver pause, original fallback and deployment inventory. No hosted mutation or
actual subscription cancellation is claimed as verified by these reads.

**Campaign readiness is NOT verified.** Fresh coverage found nine preserved S2
deployments whose source provenance is older than, or missing from, the reviewed
Portal/window guard set. Four have known older SHAs (including the fallback); five
lack source metadata. Their required unconditional legacy-Portal denial and bounded
runtime exclusion cannot be asserted from protection or current project defaults.
The worker stops at `PORTAL_CONTAINMENT` before arming or granting a resource slot.
The bounded nine-entry coverage receipt is retained privately; no old deployment
was modified or deleted. This is a real existing-environment containment gate,
not another unconnected reader or missing blanket campaign authorization.

Any remedy must preserve the original encrypted data and the pre-existing-resource
boundary. This checkpoint does not authorize retiring/replacing old Previews or
weakening their protection. Revised-source approval will still be required before
any future hosted mutation, but no new approval is requested while this gate is
unresolved. No TEST Checkout/subscription/customer/Preview or signed event was
created. No Production or MoneyMap operation occurred. Public release remains NO-GO.
