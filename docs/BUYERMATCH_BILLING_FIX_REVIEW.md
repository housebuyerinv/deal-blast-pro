# BuyerMatch billing correction — local verification only

Authorization: PR #2 comment 6368527401. Both regressions were reproduced red
before the correction. This checkpoint supersedes the unresolved-defect status in
the October 23 local lifecycle audit without deleting that historical evidence.

## Final behavior and exact scope

- `supabase/functions/_shared/buyermatchBilling.ts`: active BuyerMatch subscriptions
  now use the current subscription's latest invoice in both TEST and live paths.
  String invoice references are retrieved; expanded legacy and Endive references
  are accepted. Invoice ID, subscription binding, mode, status and paid amount are
  checked. Current active + paid evidence survives a delayed failure event; current
  unpaid/past-due state does not regain access from a stale paid event. Equal-second
  events are still recorded by ID; the SQL timestamp/idempotency logic is unchanged.
  Unknown or unavailable invoice evidence returns sanitized 503 without changing
  the existing entitlement, so provider retries/reconciliation remain necessary.
- `supabase/migrations/20261023153356_buyermatch_completed_checkout_guards.sql`:
  NEW function-definition-only migration. Both BuyerMatch billing wrappers require
  the original owner's completed Checkout and a non-null/nonblank stored session
  for initial activation AND tier changes. The session is the server-owned mapping
  established by the signed Checkout reconciliation path, not a client assertion.
  The existing RPC signatures, owner advisory locks, same-subscription checks,
  approved-plan mapping, fixed search_path and live enabled/verified gate remain.
  No table rows, RLS policies, grants or existing migration sources are changed.
  Prerequisites reject missing RPCs, browser/public execution and any unexpected
  non-owner/non-service_role EXECUTE grantee; unknown grants are not repaired.
- `tests/buyermatch/lifecycle-reconciliation.test.js`: actual signed handler plus
  real migration SQL in disposable in-memory PGlite; every HTTP call intercepted.
- `tests/buyermatch/billing.test.js`: existing fixture now supplies correct invoice
  identity/subscription/mode evidence; no test assertion was removed.
- `tests/buyermatch/subscriber-database.test.js`: loads the new migration and checks
  original-price/tier prerequisites, null/blank sessions, exact owners/ACLs/definer/
  search_path, real PostgreSQL role execution denial, rollback/roll-forward and
  refusal of widened browser/custom-role permissions.
- Release checklist and dated local lifecycle audit gain current-status links.

Network-product behavior, live refund/cancellation policy, staging trial handling,
pricing/allowances, matching and distribution rules are not redesigned. Active
BuyerMatch TEST fixtures now provide the same positive paid-invoice evidence as
the existing live boundary. There is no new CRM billing path.

## Final local checks

**72/72 focused checks PASS; zero skipped/TODO.** This final run covers:

```text
node --test tests/buyermatch/lifecycle-reconciliation.test.js tests/buyermatch/billing.test.js tests/buyermatch/subscriber-database.test.js tests/buyermatch/subscriber.test.js tests/buyermatch/live-billing-boundary.test.js tests/stripe-s2-webhook-gate.test.mjs tests/stripe-webhook-diagnostics.test.mjs
```

Scoped TypeScript checking of the changed billing module PASS. Scoped ESLint PASS.
Diff whitespace check PASS. No frontend code changed, so no full application build,
matching matrix, registration suite or completed browser harness suite was repeated.
All live-mode tests are local synthetic fixtures, not live Stripe operations.

The first broad run found a missing semicolon in the local rollback-definition
rehearsal, not the migration. That fixture was corrected, rechecked, and the final
72-check run above is green. Test totals count unique cases, not repeated runs.

Manual diff review confirms: no signature verifier/pause bypass, no raw provider
error exposure, no customer-supplied owner/session authority, no changed ledger
idempotency or blanket dropping of equal timestamps, no widened grants, and no
Production configuration. This is scoped implementation review, not independent
Production security approval or hosted PostgreSQL concurrency proof.

## Migration and rollback gates — not execution authorization

The new migration was created through `supabase migration new`. It has local 5s
lock and 30s statement timeouts, checks both existing RPC/grant prerequisites and
replaces only those definitions in one transaction. Existing migrations were not
rewritten. It has NOT been applied to staging or Production.

Before a separately approved staging application, retain exact prior
`pg_get_functiondef` definitions plus function owners/ACL/search_path and migration
identity. Append a statement terminator when composing captured definitions. Keep
registration/Checkout/delivery paused and the endpoint/receiver disabled. Verify
the migration's expected SHA and read back definitions/grants after application.

Prefer application rollback while retaining the stricter database guard. If a
definition rollback is required by a separately reviewed recovery procedure,
restore only the two exact prior definitions under their original owners, without
changing grants/RLS or records. The previous wrappers contain the reproduced
pending-Checkout gap: **billing must remain paused after that rollback** until the
correction is restored and verified. Do not automatically revert to weaker guards
or vulnerable public registration. The local round-trip test verifies all local
rows and function identity/privileges remain unchanged.

## Hosted and public release remain separately gated

1. Review/publish this green source candidate to the existing draft integration PR.
2. Separately approve staging-only migration and receiver/Preview deployment; verify
   exact source, signatures, callback, isolated credentials and restored pauses.
   No hosted write is part of this checkpoint. The invoice-read permission has
   previously been owner-confirmed, but the changed runtime path still needs a
   hosted restricted-key invoice read during an approved test window.
3. Pro hosted $119 purchase/50-25-50 remains blocked by synthetic fixture access.
   Credential-transfer investigation remains parked. Complete authenticated portal,
   upgrade/downgrade/proration, cancellation, failure/recovery, replay/order,
   cross-workspace/CRM add-on/privacy and advertised synthetic workflow gates.
4. Complete owner-controlled encrypted recovery, independent key custody, full
   DB/Auth/roles/grants/RLS plus Storage-byte coverage and isolated actual restore.
   Native Linux resources remain unverified; no Windows recovery work is resumed.
5. Replace QA-only staging agreement fixtures with separately reviewed, approved
   production BuyerMatch terms/privacy/refund/renewal/proration/consent versions.
   Existing QA acceptance is not legal approval.
6. Security-only registration repair stays separate; explicit Production migration,
   protected canary/cutover and public signup/payment approval are still required.

Historical hosted Starter PASS is preserved for its original candidate; this local
fix does not retroactively count as hosted verification of the changed receiver.
PR stays DRAFT; Production/public release remains NO-GO.
