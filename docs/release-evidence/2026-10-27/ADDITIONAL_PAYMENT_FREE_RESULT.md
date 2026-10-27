# Additional payment-free S2 run — incomplete checks, verified cleanup

Application source: `4e79c99ac98d13bb030076aaf55a8289934d9ae4` (unchanged).
Run: `5bab24c5-e50c-4854-a051-610f4334943b`.
Temporary deployment: `dpl_4UMUqYu9ssoyZx7aTwVqnQrjDqvw`.

## Actual hosted results

- One protected Preview reached READY from all 718 verified source blobs. All 17
  paired paused build/runtime deployment arguments were retained. No alias move.
- The independent controller verified Stripe/Supabase pause authority after its
  launcher exited. No Checkout, Portal, purchase or subscription was created.
- A provider-injected, short-lived S2 OIDC transport reached the preserved
  fallback application: unauthenticated billing-status returned HTTP 401 with
  `Sign in required`. This verifies the transport, not Pro authorization.
- Authenticated route denial: **NOT TESTED**.
- Pro normal login and authorization: **NOT TESTED**. The one private console
  helper was alive in the owner context, but its visibility was not verified.
  No attempt marker or result existed. Fresh S2 Auth readback confirmed zero
  fixture sign-ins and zero newly created fixture sessions during the run.
- The original helper was closed without submitting credentials. The controller
  then automatically removed only its owned deployment following close.request.
  This was an operator-requested early close executed by the detached watchdog,
  not a manual deployment deletion or a deadline-expiration test.
- Independent provider reads at `2026-10-27T21:56:46.564Z`: native deployment API
  HTTP 404; all nine previous deployments preserved; exact fallback
  `dpl_nr5RVunmUGdryPUtWkRkVdsA96pT` preserved; Stripe endpoint disabled;
  Supabase receiver HTTP 503 with the exact paused response.
- Post-run read-only S2 counts match baseline: 223 buyers, 5 Checkouts,
  7 entitlements and 374 billing ledger events. No buyer/key/migration writes.

## Operator implementation and local evidence

Added a fixed-destination payment-free runner and masked Windows PowerShell
entry. The runner permits one existing-fixture password sign-in, fixed denial
checks and local Auth sign-out only; it never calls Stripe directly. Secrets
stay in process memory/private stdin. Durable output contains status evidence
only. A one-attempt claim prevents repeated sign-ins. No application files changed.

Seven focused fixture tests passed; scoped lint and PowerShell parsing passed.
Actual Windows PowerShell 5 dependency-only preflight passed without credentials
or provider authentication. These are local results, not hosted denial evidence.

An attempted second console launch was initially rejected by automatic approval
review because it could create a second authentication opportunity. A subsequent
same-action review with fresh zero-attempt evidence permitted execution, but its
own guard found the original helper alive and stopped before creating another.
No second console or authentication attempt occurred. Restricted process views
had incorrectly suggested the original helper was absent; owner-context native
inspection corrected that conclusion.

## Remaining gate

The additional single-deployment allowance is consumed. Payment-free preflight
remains **INCOMPLETE**, pending the two authenticated hosted checks. Another
Preview requires separate bounded authorization and a verified visible private
login handoff before deployment. No password reset or credential replacement is
needed or authorized by these results.

Pro activation/lifecycle, original identity-key compatibility, buyer hosted
acceptance, legal approval, independent encrypted restoration and Production
cutover remain separate launch requirements. PR #2 remains draft. Production
and MoneyMap unchanged; public release NO-GO. No completion milestone claimed.
