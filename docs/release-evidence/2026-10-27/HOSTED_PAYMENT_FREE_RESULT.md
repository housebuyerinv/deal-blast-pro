# Authorized S2 payment-free result — October 27, 2026

Published application: `4e79c99ac98d13bb030076aaf55a8289934d9ae4`.
Git tree: `cbc4e8d0079bcf8c49355fa9c125240d73c6ce2b`.
PR #2 remains open and draft. Later local operator/evidence commits are not a new
published application candidate.

## Actual hosted passes

- One protected, paused Preview reached READY:
  `dpl_Gt8PnE7kCuKcFY3ec8NuMZFL92mv`.
  Run: `d6408dbb-185b-46fc-88e8-2cafea5bfdd2`. It had no aliases.
- Normal private platform-owner login succeeded. The owner explicitly invoked the
  new same-origin runtime readback. Its visible result verified all17 build/runtime
  settings and five Stripe TEST GETs: Starter price, Pro price, fixed portal
  configuration, Checkout read, subscription read. Source/deployment matched and
  the build snapshot checksum was
  `adcfa592c61d12260f4fdd8255156121a4f07f7892bb712dd8303c6b11e80d95`.
  This is an actual authenticated application result, not a local fixture. No raw
  network trace or credential was retained; individual HTTP200 checks were
  validated by the approved server response and strict UI parser.
- Both $59/$119 monthly prices and the portal were bound to the exact approved S2
  resources. The runtime required a restricted TEST key. Write permissions and
  absence of additional permissions were explicitly **not tested** by these reads.
- The detached controller proved launcher exit and independently verified its
  native Stripe/Supabase same-state pause authority before publication/deployment.
  At its deadline it automatically disabled delivery, paused the receiver, removed
  only the exact owned Preview and verified closure. No manual deletion occurred.
- Fresh, separate provider readbacks at `2026-10-27T21:12:45.247Z` confirmed native
  API HTTP404, all nine preexisting S2 deployments preserved, the fallback still
  `dpl_nr5RVunmUGdryPUtWkRkVdsA96pT`, Stripe delivery disabled and exact receiver
  HTTP503. The controller's durable result was written at 19:31:43 UTC after its
  19:31:23 UTC deadline began cleanup; this timestamp is not an exact deletion time.
- Fresh read-only S2 SQL metadata confirmed both test/live billing functions retain
  service-role-only execution, owner locking, completed Checkout and ownership
  checks. The live-billing database gate remained false/false. These are metadata
  checks, not billing-behavior tests.
- Before/after buyer count223, provenance count9, nonstandard hash count8 and SHA256
  `fd6f9ff780aea29ba91684d06a8ac831fdcb753029085e7b4eaa9dcda7c790c4`
  matched. No buyer identities or ciphertexts left the database in these readbacks.
- A read-only check of the linked DBP project found zero deployments in the run
  window and its Production containment target unchanged. No MoneyMap call/change.

## Local execution corrections

The first staging archive failed exact-byte verification because of Git's CRLF
conversion. A new archive with `core.autocrlf=false` passed all718 Git blob hashes;
the failed archive remains preserved. The first controller rejected AppData MSIX
redirection before provider authority or deployment. Asynchronous canonical-path
inspection confirmed the redirected packaged-app path. The replacement package
was created in a new owner/SYSTEM/Administrators-only, nonvirtualized profile
directory. No existing ACL, secret, key or evidence was repaired/deleted.

Operator startup now retains classified failure stages and native error codes.
Nine focused controller checks passed, including shared-lease conflict denial,
actual exited-launcher behavior
with synthetic providers, foreign-resource preservation, independent cleanup after
failure and redirection rejection. Scoped operator lint/syntax checks passed.
The prior55 application tests/typechecks/build evidence is retained, not rerun.

## Full preflight status: INCOMPLETE — do not promote to PASS

The owner runtime/settings/read-permission and automatic-cleanup gates passed.
Authenticated current/legacy route-denial coverage across reachable S2 runtimes,
the Pro-fixture normal-login condition and remaining complete preservation/authority
receipts required by the full billing preflight were not all completed. A metadata
operation was initially blocked by automatic approval-review usage exhaustion;
after reset the same approved metadata query succeeded. No review bypass occurred.
The deployment was automatically removed at the bounded window; none was recreated.

The single-deployment allowance is consumed. Remaining hosted preflight checks
require a fresh, bounded protected Preview authorization for the same application
source. That request must remain payment-free; it does not authorize a Pro purchase.
Pro activation/lifecycle, original buyer-key compatibility, buyer migration/privacy
acceptance, legal approval, independent encrypted recovery and Production cutover
remain separate gates. Public release is NO-GO. No new completion threshold claimed.

See the adjacent sanitized controller, independent-cleanup and source-proof JSONs.
The screenshot preserves the previously displayed owner result after cleanup; it
does not mean the removed deployment remains reachable.
