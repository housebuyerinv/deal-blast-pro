# Workspace and account replacement acceptance

## October 5 final browser acceptance follow-up

On candidate `6fa92da`, supported synthetic A-to-B-to-A replacement converged in both tabs. Both tabs retained B after refresh; A's unsaved Settings draft was unmounted, B's profile/workspace stayed unchanged, and an A deal deep link under B displayed "Deal not found". Both persisted workspace names remained correct. These observations do not certify a forced stale-save callback or a populated inventory delay: the browser routing harness has no request-hold option and the staging `inventory_deals` table is absent. Existing targeted race tests remain required.

A real public response navigation defect was reproduced: after refresh removed the capability from memory, reopening the original invitation in the same document changed only its fragment, but the component read the fragment only on mount. The fix consumes `hashchange`, clears the previous invitation's draft/status, removes the visible fragment, and fences completion of an older submission. It does not change token authorization, accepted-outbox enforcement, response idempotency, provider gates or database schema. Two actual-component regression tests cover reopening and stale completion. Local full suite: 187/187; build passes; lint: 0 errors, 94 existing warnings. Exact replacement Preview verification remains required before acceptance; Production remains untouched.

Starting candidate: a6f23faa486ec3a6db22c6539100e422ec53502d. Production remains unchanged; no migration, provider, checkout or fee changes.

## Findings

The Settings label symptom is a separate, inherited Production UI bug: profileToUserNames returns the truthy fallback My Workspace for null business_name/company, and Settings preferred it over the valid same-account workspace label loaded by account-status. Production SHA 029939b has identical Settings/accountProfile/workspaceName code. Old Preview reproduction: regular-user header changed from SYNTHETIC Regular User Workspace to My Workspace, while local workspace instance, owner ID and scope stayed unchanged. All three synthetic database workspace names and owner IDs remained intact; profile business fields were null. Settings load uses SELECT only. Production persistence excludes the user object, so the label was an in-memory profile update, not a database workspace rename.

A distinct account replacement bug existed in useAppStore.login: preserveWorkspace=true bypassed same-user detection, and display/business names fell back to the previous user even for a new account. The fix only preserves workspace when email and provided stable user ID match; a different identity clears actual workspace slices and cannot reuse the previous label. Existing same-account recovery remains supported.

Settings now resolves raw profile names and current same-account names before falling back. Profile loads and save results must still match the current store account. Profile save binds expectedUserId to the authenticated user before any write. A blank business name does not rename a workspace; an explicit valid edit retains existing owner-filtered save behavior.

## Regression coverage

Seven tests cover fallback ordering, actual production login transition and cleanWorkspaceState (not duplicated transition logic), stable-ID/email replacement, same-account retention, same-looking display names, clearing deal/buyer/response/document/admin-related state, Settings stale-result wiring, real save rejection before any DB write, and read-only load/blank-name save behavior. Existing routing, API, replay, migration and parity tests remain.

## Release gate

The exact a83318e browser check caught onboarding being reset on a fresh second tab: RequireAuth applied the authenticated plan before login cleared account-scoped settings. The follow-up moves server plan/onboarding synchronization after the identity transition. An eighth regression test executes that actual RequireAuth success block together with production login for both fresh-session recovery and account replacement. Full local suite: 170 passing; build passes. Hosted acceptance must use the follow-up commit, not a83318e.

The 6296de4 browser check then exposed intermediate cross-tab snapshots overwriting restored onboarding after refresh. Production-mode storage synchronization now retains the current authenticated billing/onboarding state. A further actual-code race test proved a late inventory request could populate a replacement account; hydrateInventory now rejects results after a scope change. Ten workspace tests and 172 full tests pass locally. These follow-up changes still require exact-commit hosted acceptance.

Exact-commit hosted/browser checks remain to be recorded in the final acceptance report. Authenticated live Production parity is still an explicit manual blocker. Do not deploy Production from this document.

## October 5 async account-state review

Resumed from 550544eddc469699a932fb064c046da81d49ed5b. The prior browser command was stopped by an automatic-review usage-limit failure, not an application failure. The named browser session has since expired and opens blank. No new browser login was attempted. Authenticated browser account replacement, delayed-request UI verification and positive response interaction remain manual gates until a permitted synthetic session exists. Prior partial browser results are not certification of this follow-up commit.

| Path | Boundary and result |
| --- | --- |
| Inventory/global deal state | `hydrateInventory` compares stable user ID plus normalized email scope before committing; same-account re-auth remains valid. Delayed A result cannot populate B. |
| Buyer list/cache and write callbacks | Existing hydration generation fencing now also covers scope resolution. Store insert/update/delete continuations check the initiating scope. Buyer page global writes check the captured owner ID. Browser edit overrides and lists use owner-specific keys; legacy unscoped caches remain stored but are no longer consumed. |
| Workspace/profile/cloud restore | Profile loads recheck authenticated identity before returning. Cloud restore rechecks before writing local state; cloud upload refuses a snapshot owned by another account. Settings binds saves to expected user ID, rejects stale results before workspace rename, and keeps its current-store checks. A write already completed before the switch remains scoped to the initiating owner; it is not rolled back. |
| Onboarding | Loads revalidate auth; reconciliation checks current store owner and effect cancellation. Saves require the initiating owner ID. Earlier server-plan ordering and cross-tab reset fixes remain intact. |
| Billing | Pending-plan refresh revalidates auth and current store ID; its effect now depends on that ID and aborts when it changes. Protected-route account-status also rechecks the session before applying identity/plan. |
| BuyerMatch matches/exposures/admin | Requests bind to the initiating store user and authenticated session, and recheck both after the response. Private component state is unmounted while ProtectedRoute verifies a replacement account. No admin-role, RLS, public response-token or accepted-outbox rule changed. |
| Uploads/documents | BuyerMatch upload grants remain owner/deal scoped; replacement removes the old component and its local upload state. Subsequent API continuations use the guarded request helper. Inventory drawer document edits are synchronous; account replacement clears global document/deal slices. |
| Dashboard/admin/settings local results | Dashboard activity uses effect cancellation. Route-local counts, settings/admin results and upload results cannot populate a new component after ProtectedRoute unmounts it. Global inventory and buyer data use the fences above. |

Local verification: 185/185 full tests, including 23/23 workspace race tests, the 21 Production-mode fixture assertions and 188 migration rehearsal assertions. Race tests execute actual source functions/bundles and defer results until identity replacement; they cover profile, onboarding, billing, cloud restore, inventory, buyer callbacks, BuyerMatch admin responses and owner-scoped caches. Same-account positive cases remain. Build/type/lint and exact-commit hosted results are recorded in the run report.

The “My Workspace” label was a separate fallback-precedence bug, not evidence of a database rename. Before/after synthetic workspaces retained their persisted IDs, owners and names. The earlier successful Settings test intentionally changed only A's display name to `Regular User QA`; no workspace name edit was requested. The stale draft `Stale A draft must not save` disappeared on account replacement. Fresh-commit authenticated browser confirmation remains required.

Production stays unchanged. Do not enable delivery, Resend, checkout or success fees and do not deploy Production as part of this verification.

The final identity guard also checks the latest local authenticated session after `getUser` completes, because the `getUser` network response can itself be stale. A regression test returns User A from that delayed HTTP check while the current session is User B and requires rejection.
