# Buyer-intake security-only containment candidate

Status: PREPARED, NOT APPLIED. Explicit Production approval and independent review required.

## Confirmed metadata and scope

Read-only metadata from Production `aigvnbxiydbzzqbetlhl` confirms:

- `public.buyer_portal_submissions`: ordinary table owned by postgres, RLS enabled.
- anon and authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
- service_role: the same table privileges, BYPASSRLS enabled. Client roles have neither superuser nor BYPASSRLS.
- SELECT and UPDATE permissive policies have unconditional true predicates for both client roles. INSERT allows status=pending_review.
- Eight columns: id, status, buyer_data, imported_at, created_at, approved_at, approved_by, created_buyer_id.
- Column-privilege metadata also reports client rights; the candidate removes independent column grants as well as table grants.
- No dependent views were reported by the scoped pg_depend check.

No buyer rows, public data requests or mutation attempts were used to establish this finding. Record presence, historical access and exploitation remain UNKNOWN. DELETE/TRUNCATE grants on this same table were also found during verification; TRUNCATE is not protected by row policies. This is a direct-table authorization containment, not a claim to have audited every privileged function or API.

## Proposed action and availability impact

Apply ONLY `scripts/security/contain-buyer-intake.sql`, under a separately approved security-only migration name. Do not apply the integration migration directory or `20261024000845_buyermatch_private_buyer_intake.sql`.

Afterward:

- PUBLIC, anon, authenticated have no direct table or column privileges.
- Remove only the three named legacy SELECT/UPDATE/INSERT policies above.
- Add restrictive `dbp_emergency_intake_deny`, FOR ALL TO anon,authenticated, USING false WITH CHECK false. Other policies remain intact; the restrictive deny prevents permissive-policy bypass for client DML if accidentally regranted. It cannot protect TRUNCATE; revoked privileges are essential.
- postgres/service_role privileges remain unchanged. No new function, role, column, identity, customer row or grant is created.

This intentionally pauses existing public buyer intake AND the direct browser review queue, including owner/admin browser access. Production's current intake uses INSERT ... RETURNING id; keeping INSERT alone does not preserve its contract. Retaining globally readable IDs is not an adequate private receipt design. No unverified owner-role exception is introduced. Existing server-side service-role submission lookup remains authorized, but end-to-end notification/review functionality is not asserted: no notification has been triggered. New feature intake RPC/owner review may restore functionality only after separate review and release approval.

Login, registration containment, matching, CRM billing and other tables are not modified. Existing CRM buyer records are separate. Queue-dependent widgets may display an error; communicate the temporary intake/review outage to the operator before activation. This is an availability tradeoff requiring explicit approval, not a transparent behavior-preserving fix.

## Verification and safeguards

`node --test tests/buyermatch/intake-containment.test.js`: **6/6 grouped local PostgreSQL/PGlite checks passed**. Actual synthetic SQL with roles/RLS, not string-only mocks:

1. anon SELECT/full and id-only, UPDATE, INSERT RETURNING, DELETE, TRUNCATE denied (42501).
2. authenticated same six operations denied; no partial intake record.
3. Service SELECT/UPDATE and unrelated-table client operations allowed; existing rows unchanged; second application idempotent.
4. Restrictive deny survives an extra permissive policy and deliberate synthetic regrant for DML.
5. Unexpected inherited SELECT causes transaction failure; rollback leaves original grants/policies intact.
6. Missing expected service BYPASSRLS causes preflight failure without partial changes.

These are local tests. Production execution and post-change metadata/denial verification remain NOT RUN. No previously completed feature/matching suite was repeated. No independent second reviewer has yet approved this candidate.

## Activation checkpoints (NOT authorized yet)

1. Independent reviewer inspects exact SQL/hash and accepts temporary intake/review downtime. Owner explicitly authorizes this table-only Production correction. Preserve current schema/grant/policy metadata as evidence; no buyer-data export.
2. Reconfirm project identity, table owner/columns, all grants/policies including PUBLIC/column/inherited access, service authority, dependencies and absence of unexpected drift. Use metadata only. Stop on unexpected exposure/dependencies; do not expand scope silently.
3. Use supported Supabase migration application for this standalone SQL only. The SQL has one transaction, five-second lock timeout, 30-second statement timeout, table lock and final effective-privilege assertions. If anything fails, rollback and report that the exposure remains; do not call a rolled-back attempt contained.
4. Verify only catalog metadata: no client table/column privileges, RLS and restrictive deny, removed unsafe named policies, unchanged server privileges. Do not inspect buyer rows or send notification requests. Any HTTP/client-denial check needs a reviewed non-mutating procedure; do not exercise DELETE/TRUNCATE against Production.
5. Record migration identity/time/hash and sanitized outcome on PR #2. Verify no application deployment/configuration or MoneyMap change was performed. Existing registration containment remains independently active.

## Safe recovery / rollback

Before commit, failure aborts all DDL; preserve the error and re-evaluate promptly because prior exposure persists. After commit, never automatically restore old grants/policies. If intake downtime is unacceptable, keep containment and prepare an explicitly approved authenticated review + create-only receipt solution, or use a separately approved operator/server workflow. Correct a failed containment with reviewed forward SQL; do not restore public SELECT/UPDATE/TRUNCATE. No customer row rollback is required because this candidate performs no row writes.

Security containment candidate: ready for independent review and explicit approval. Public release: NO-GO. Production remains unchanged and the reported permissions remain unmitigated until authorized execution succeeds.

Reference: [Supabase RLS/grant documentation](https://supabase.com/docs/guides/database/postgres/row-level-security). The changelog markdown fetch was attempted but unsupported by the browsing transport; no changing CLI syntax is relied on here.
