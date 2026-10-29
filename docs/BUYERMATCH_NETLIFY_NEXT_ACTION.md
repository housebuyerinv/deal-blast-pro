# BuyerMatch exact next Netlify action

## Backend result: blocked within currently authorized resources

Fresh read-only provider metadata confirms one connected Supabase organization,
House Buyer Investments (`urpdjybbquuaoevpvpcj`), Free/tier_free. Two projects are
ACTIVE_HEALTHY: original S2 and Production. QA `bwlreupczckklrxdsdcj` is INACTIVE;
it is neither an unused entitlement nor an authorized empty replacement. No data,
keys, Auth settings, project status or provider configuration was inspected or
changed. Supabase documents two active Free projects across organizations where
the user is Owner/Admin; paused projects do not consume a slot. Resuming QA does
not create a third free entitlement. No eligible independent slot is verified.

The Netlify account supplies commercially permitted Free hosting capacity, not a
Supabase-compatible Auth/Storage/Data API. Netlify Database is managed Postgres;
substituting it would require a separate Auth, Storage, policy/RPC and client
integration migration. It is not a verified drop-in backend, and automatic
migrations/branch data copying must not be enabled. Existing local Supabase is
usable for local tests, not an independently available hosted backend. No new
provider/account search, paid proposal, quota workaround or tunneling is needed.

Minimum owner action: identify an already entitled independent Supabase project
or obtain an authoritative provider allowance for one new isolated Free project.
Do not send keys. Do not pause, delete, reuse, upgrade or copy existing protected
projects. Until legitimate capacity exists, hosted acceptance is blocked; site
creation alone would not resolve it. No claim of exhaustive worldwide free-host
availability is made.

Sources: [Supabase Free quota](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Netlify Database scope](https://docs.netlify.com/build/data-and-storage/netlify-database/).

## Separate production adapter implemented, activation blocked intentionally

The default `netlify.toml` and `netlify-private-v1` stay private acceptance only.
`netlify.production.toml` and `netlify-production-v1` are explicitly selected,
separately compiled future-release artifacts. No environment flag can switch a
private artifact to public. The production adapter requires the pinned HBI
account/site, a currently published production provider context, exact HTTPS
`https://<pinned-site-name>.netlify.app` origin, independent backend bindings,
compiled source SHA, approved legal receipt digest and explicit owner cutover
state. Custom domains and old deployment URLs are denied. No live operation is
permitted: registration, billing, Portal, response issuance, providers, reminders,
workers and distribution stay disabled. The same API action allowlist, bearer
validation, ownership, Storage checks and paid-entitlement controls apply.

Additional future production environment names (never installed here):
`BM_HOSTING_PROFILE=netlify-production-v1`, `BM_ENVIRONMENT=production`,
`BM_NETLIFY_RELEASE_SOURCE` exact compiled commit,
`BM_NETLIFY_LEGAL_DIGEST` exact compiled approved manifest digest, and
`BM_NETLIFY_ACTIVATION_STATE=owner-approved-cutover`. Production origin variables
must explicitly equal the pinned site's default HTTPS origin; no staging ref or
Vercel variables. Other disabled flags, backend/key and provider ownership fields
are described in `BUYERMATCH_NETLIFY_RELEASE.md`. These are implementation
requirements, not permission to set them or publish a site.

Normal `npm run build:netlify:production` requires clean committed executable and
legal source. It validates the four exact legal files with canonical hashes,
per-document final versions, `approved=true`, `publicationAllowed=true`, named
approver/date, and no outstanding owner/counsel placeholders. Existing legal drafts
remain unapproved, unchanged and cannot pass this build. The production frontend
serves the bundled approved text for both direct visits and SPA navigation, never
generic DBP terms as a substitute. Before onboarding consent, runtime database
terms/privacy versions, hashes and content must match the bundled approved text;
existing per-user acceptance checks remain unchanged. Schema/content publication
requires a separate hosted authorization.

`node scripts/build-buyermatch-netlify.mjs --production-profile --verify-local`
builds a deliberately non-executable verification artifact without approvals or
real bindings. It does not publish draft legal text. Artifacts are isolated in
`.netlify/buyermatch-production/`. Locally exercised normal-bundle execution uses
synthetic approval/provider fixtures only, never owner/counsel approval or hosted
acceptance. Warm-instance abuse limits remain distinct from distributed WAF.

## Source synchronization (prepared, not authorized)

PR #2 remote readback: `46ec035e0c53c07723f54a424d39ad1b8522fa85`; Draft; base
`codex/buyermatch-network`. `1c14545dd95aad6995ad5d08486f86ce5d80c714` is preserved
as its fast-forward descendant; the final production-adapter commit follows it.
The exact final SHA and literal push command are posted in the PR checkpoint.
Do not infer push permission from this document.

Before an owner-approved push, recheck `git ls-remote` equals the stated remote,
`git merge-base --is-ancestor <remote> <approved-final-SHA>` succeeds, Vercel's
committed `git.deploymentEnabled.codex/buyermatch-1b-integration=false` still exists,
provider Git automation/bindings have not drifted and Netlify has no repository
connection. Stop on differences. Then one normal push of the owner-approved
literal SHA to `refs/heads/codex/buyermatch-1b-integration`, never force/rebase/
merge/base changes. Read back remote SHA, Draft/base, GitHub checks and Vercel
deployment inventory. Keep all unrelated working-tree items unstaged. No push,
Git connection, provider setting or deployment occurred in this task.

## One future protected hosted action (conditional; not yet executable)

Once backend capacity is verified and exact source synchronization separately
approved, request only:

- One unlinked Netlify Free site in HBI `marcel-g-ovf4dew`, no card/trial/add-on,
  Git connection, custom domain, paid capacity or public deployment.
- One legitimately entitled independent synthetic Supabase project, no original
  bindings/data/keys. Authorize schema and fixture setup only on its returned,
  independently checked exact project ID; stop if quota/plan/ownership differs.
- Private provider installation of only that project's credentials and separate
  synthetic keys/gate secret; never expose values to Codex or logs. Confirm Auth
  signup disabled, immutable redirect allowlist, private Storage/RLS and fixtures.
- One unpublished protected **private-profile** deployment of the exact approved
  source, one <=30-minute window, billing/providers/distribution/signup disabled.
  Read back ownership, source/digest, context and origin before browser/API tests.
  Stop if provider cannot create the necessary unpublished context, protection
  differs, unexpected resources appear, costs arise or outcomes are uncertain.
- Independently verify expiry; delete only campaign-owned Preview/site under
  explicit cleanup authority and read back unreachability. Synthetic backend
  deletion requires explicit ownership-checked cleanup authority; no implied
  deletion of an existing resource, legal publication or Production rollback.

This is one coherent hosted action, not approval to execute it while capacity is
unresolved. Production profile publication and public cutover are excluded.
Original encryption-key compatibility, independent encrypted restore, final legal
approval and hosted security acceptance remain separate release dependencies.
Spending $0; public release NO-GO.
