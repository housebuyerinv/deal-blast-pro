# Workspace and account replacement acceptance

Starting candidate: a6f23faa486ec3a6db22c6539100e422ec53502d. Production remains unchanged; no migration, provider, checkout or fee changes.

## Findings

The Settings label symptom is a separate, inherited Production UI bug: profileToUserNames returns the truthy fallback My Workspace for null business_name/company, and Settings preferred it over the valid same-account workspace label loaded by account-status. Production SHA 029939b has identical Settings/accountProfile/workspaceName code. Old Preview reproduction: regular-user header changed from SYNTHETIC Regular User Workspace to My Workspace, while local workspace instance, owner ID and scope stayed unchanged. All three synthetic database workspace names and owner IDs remained intact; profile business fields were null. Settings load uses SELECT only. Production persistence excludes the user object, so the label was an in-memory profile update, not a database workspace rename.

A distinct account replacement bug existed in useAppStore.login: preserveWorkspace=true bypassed same-user detection, and display/business names fell back to the previous user even for a new account. The fix only preserves workspace when email and provided stable user ID match; a different identity clears actual workspace slices and cannot reuse the previous label. Existing same-account recovery remains supported.

Settings now resolves raw profile names and current same-account names before falling back. Profile loads and save results must still match the current store account. Profile save binds expectedUserId to the authenticated user before any write. A blank business name does not rename a workspace; an explicit valid edit retains existing owner-filtered save behavior.

## Regression coverage

Seven tests cover fallback ordering, actual production login transition and cleanWorkspaceState (not duplicated transition logic), stable-ID/email replacement, same-account retention, same-looking display names, clearing deal/buyer/response/document/admin-related state, Settings stale-result wiring, real save rejection before any DB write, and read-only load/blank-name save behavior. Existing routing, API, replay, migration and parity tests remain.

## Release gate

Exact-commit hosted/browser checks remain to be recorded in the final acceptance report. Authenticated live Production parity is still an explicit manual blocker. Do not deploy Production from this document.
