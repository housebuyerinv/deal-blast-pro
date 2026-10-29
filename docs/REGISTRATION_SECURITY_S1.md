# Registration security S1 — local candidate, 2026-10-19

## Isolation and release boundary

Branch: `codex/registration-security-hotfix`. Base: `501cb6a4566211f6828633f862163420fed9c016`.
The separate worktree excludes BuyerMatch 1A commit `3adffee` and all unrelated workspace changes.
No Preview or Production deployment, remote migration, customer mutation, email, or distribution was performed.

## Corrected lifecycle

The public start action calls ordinary Supabase signup, preserving provider rate limits, CAPTCHA policy and confirmation settings. It never looks up accounts by email using admin access and never writes application records. Duplicate responses are neutral and do not return account IDs. Invalid role, unknown plan and explicit non-CRM product requests are rejected. Free/Starter/Pro selections retain their existing CRM meanings and pricing; this is not BuyerMatch onboarding.

An HMAC-signed, email-bound intent in Auth metadata preserves the selected CRM plan and accepted platform-document hashes for seven days. Metadata itself is not trusted: the completion handler verifies its signature, validity and email binding. No password or credential is included. The signature is domain-separated using the existing server service-role secret; rotating that secret invalidates outstanding intents. Expired, tampered, legacy unsigned or historically incomplete registrations fail closed and may require support; they are never silently repaired.

Completion requires a bearer token verified through Auth `getUser`, a confirmed email and a non-anonymous identity. A request email, user ID, role or billing value cannot override that identity or the signed intent. Email confirmation without authentication is insufficient. Existing customers return read-only and remain able to log in. Register handles immediate sessions; confirmation callback and login both complete provisioning before account-status/cloud loading. Password recovery and email-change callback handling retain their existing branches.

One service-role-only RPC performs create-only provisioning under a per-identity transaction lock. Auth identity/email confirmation is checked again in the database. Existing coherent accounts are unchanged; existing partial state is not overwritten. Unique constraints backstop races. Profile, workspace, pending/free CRM assignment, required agreement acceptances and registration event commit together or all roll back. BuyerMatch entitlements and existing billing records are not updated. Notification occurs only after a newly committed account; notification failure cannot turn successful provisioning into a reported registration failure. Notification retry/delivery guarantees are outside S1.

The additive migration is `20261019233315_registration_create_only_provisioning.sql`, generated locally with the Supabase CLI. It creates only this RPC, pins its search path, and revokes public/anon/authenticated execution. It has not been applied remotely. SECURITY DEFINER is restricted to this deliberate server provisioning boundary; existing RLS policies are unchanged.

## Focused validation

- 26 tests pass: 15 actual-handler tests with mocked Auth/data transport and 11 signed-intent/database tests.
- SQL runs in disposable PGlite against the existing registration table migration plus minimal dependency fixtures. The existing agreement RPC is stubbed for transaction-failure testing; its full implementation is not reverified here.
- Sixteen queued same-identity calls create one set of rows; subsequent retries make no changes. PGlite serializes requests. This is not proof of real concurrent PostgreSQL sessions; verify that in Preview.
- Failure injected at the final event insert rolls back profile, workspace, billing and agreement writes; retry succeeds after removal of the injected failure.
- Unconfirmed identity, forged signature, wrong email binding, missing/invalid session, privilege/product overrides, stale agreements, partial historic state and unauthorized RPC grants are covered. Existing synthetic admin role, paid CRM plan, workspace and BuyerMatch entitlement snapshots remain unchanged.
- API TypeScript passes; application TypeScript and Vite build pass. Scoped lint: zero errors, four pre-existing warnings (three empty catches and one BOM/irregular-whitespace warning). Existing bundle-size and mixed-import build warnings remain.
- No real signup, password attempt, customer email or external notification was used in testing.

## Read-only Production evidence

Prior Vercel inspection confirmed Production deployment `dpl_2Kd21sc63yJtssxQ7iiPNRNXenhg` at the base SHA containing the vulnerable handler.
Read-only SQL inspection found 15 registration-event records, three containing `Existing Auth user reused` plus profile/workspace upsert and plan-assignment diagnostics. Their recorded updates were July 12, August 16 and August 23 (America/New_York); the latest is August 24 02:18:50 UTC. One event was updated more than five minutes after its creation. These are uses of the vulnerable path, not proof of malicious intent or a before/after record of changed values.
The registration table reuses one event per account and does not preserve an immutable history, request source, prior workspace name, prior role or prior billing assignment. A scoped query of relevant Auth audit actions over the last seven days returned no rows. Retention/coverage may be incomplete. No exploitation has been established; this limited review cannot establish its absence or reconstruct historical ownership changes.

## Preview approval requirements

GO for isolated Preview security verification; NO-GO for Production until it passes.

1. Use a disposable Supabase project/branch with matching prerequisite schema and synthetic accounts only. Apply only this additive migration after prerequisite verification. Confirm no trigger provisions application records independently during Auth signup.
2. Bind Preview frontend/server exclusively to that database and its keys. Set `PUBLIC_APP_URL` to the exact Preview origin, configure its Auth redirect allowlist and use an isolated confirmation-email sink. Do not inherit Production database credentials, webhook secrets or delivery providers. Use approved mock/sink notification handling.
3. Exercise browser signup, confirmation in a fresh browser context, session completion, refresh/login, immediate-session behavior if applicable, expired/stale intent handling, and provider rate/CAPTCHA responses. Confirm callback URLs stay on Preview.
4. Use separate real PostgreSQL connections for simultaneous completion attempts. Verify one profile/workspace/billing/event set, immutable existing customer snapshots, and cross-account denials.
5. Inject a test-only database failure in the disposable environment and verify all-or-none behavior, including actual agreement RPC behavior. Remove the fixture afterward. Exercise ordinary CRM registration/pricing and existing customer login without purchasing or changing plans.
6. Recheck function grants/search path, run isolated database security advisors, inspect runtime logs, and produce exact-commit evidence. Obtain separate Production migration/application hotfix approval. Never roll back to the vulnerable handler as an ordinary rollback.

## Optional temporary containment

The candidate implements `DBP_REGISTRATION_PAUSED=true` for new registration starts only; login and authenticated completion are preserved. It is not enabled anywhere, and setting it on the currently deployed old handler would have no effect. If the hotfix is delayed, separately approve a platform restriction of POST `/api/register-account` on the current deployment, after confirming its exact route and method scope. Keep normal authentication and existing customer access available. No Production restriction was changed during S1.

Stop here. Do not resume BuyerMatch 1B or deploy without approval.
