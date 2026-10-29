# S2 attestation — local review 6374236577

This is a new candidate, not a deployment or H1 purchase approval. No provider settings,
credentials, migrations, billing, registration or delivery gates changed. The independent
same-state Stripe/Supabase closure proof is retained; real disposable-deployment removal
and deployed attestation remain unverified.

## Evidence path

`npm run build` first executes `scripts/build-buyermatch-s2-attestation.mjs`. With the
diagnostic explicitly enabled, it validates the 17 canonical non-secret settings using
the same reviewed policy as release preparation, observes the BUILD process environment,
and writes `server/generated/s2-build-attestation.json`. It never captures arbitrary env.
Disabled builds write only `{enabled:false}`. Invalid enabled builds invalidate the old
snapshot, fail, and emit a constant error without raw values. Interrupted/truncated files
cannot pass runtime validation.

The generated JSON is Git-ignored, outside `public`/`dist`, and explicitly included only
with the existing `api/platform/*.ts` function. No additional function slot is created.
At runtime `GET /api/platform/s2-attestation` reads that file and independently observes
the effective function process environment. Both settings maps must contain exactly the
17 expected values. Artifact/schema/hash, source/run/project/deployment/hostname identity,
and age (maximum one hour, at most 60 seconds future clock skew) must match. A snapshot
cannot be reused by another deployment/run, or recomputed from runtime as build evidence.

The checksum detects inconsistent artifact contents; it is not a digital signature or
independent provider proof. Vercel deployment/project IDs and generated hostname are
provider system variables. The release source pin/run ID are supplied by the approved
deployment preparation, not invented by the endpoint. When provider Git metadata is
absent for unlinked CLI deployments, the response explicitly requires comparison with
the independent provider deployment record and reviewed SHA. Even a successful response
does not prove Stripe authority, receiver pause, deployment-protection policy, grants/RLS
or external non-delivery: these remain separate provider readbacks.

## Access and non-mutation

The endpoint is absent (404) unless explicitly opted in on the fixed S2 project,
Preview, staging ref and exact backend URLs. Production/development/wrong backend
scope is rejected before creating a database/Auth client. GET only; no arbitrary query,
body selector or user-supplied owner/environment parameter. Responses are private/no-store,
vary on Authorization, and have no CORS grant.

Access requires `auth.getUser` server verification of a normal bearer session, confirmed
email matching the existing server-owned platform-owner policy, and an active Admin
profile and active owned workspace. Workspace Admin alone and editable user_metadata
cannot grant access. Only Auth verification and SELECTs occur; no profile/workspace repair,
signup, RPC, agreement acceptance, payment or notification operation is reachable.
Raw errors, tokens, user/profile data and arbitrary configuration are never returned/logged.

`/app/s2-attestation` is an unlinked, S2-only private operator view inside the existing
protected app router. It uses ordinary same-origin app authentication internally, not
a token-copy bridge. No credential fields, session serialization, raw response dump or
console output. It renders only status and validated public source/deployment/checksum
identifiers. Account switches/aborts deny stale results. Server owner checks are authoritative.
Hosted verification will need a normal platform-owner session; no session was collected or
provisioned in this local batch. The Pro fixture's Admin/workspace status alone is insufficient.

## Deterministic next deployment preparation

Use `s2AttestationDeploymentArgs(exportDirectory, runUuid, reviewedNewSha)` only after
separate approval. It emits all17 values in BOTH build/runtime scopes, plus these three
non-secret control/provenance fields in both scopes:

- `BM_S2_ATTESTATION_ENABLED=true`
- `BM_S2_ATTESTATION_SOURCE_SHA=<reviewed new SHA>`
- `BM_S2_ATTESTATION_RUN_ID=<fresh run UUID>`

Vercel must supply `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_DEPLOYMENT_ID` and `VERCEL_URL`
at both build/runtime; missing identity fails closed. Do not substitute expected values
for missing observations. Existing sensitive keys remain provider-managed, never argv.
The original six-a98cff pin remains the default for old evidence; new release verification
and cleanup require explicit `approvedSource: reviewedNewSha`. No implicit HEAD or arbitrary
receipt source is trusted. The existing exact project/team/run/prior-inventory safeguards
remain mandatory. Diagnostic controls can be disabled without changing owner entitlements.

## Local verification and remaining review

Focused tests cover actual handler/router code with dummy Auth/DB adapters, build-time
artifact generation, runtime mismatches, stale/missing/unknown/tampered artifacts, credential
injection/non-reflection, false defaults, wrong scope, anonymous/non-owner/forged requests,
no writes/logs, normal owner-view request handling, account switching and new-SHA cleanup.
Existing release-engineering regressions are rerun because their source-pin logic changed.
Matching/paid hosted suites are not repeated. Local packaging/static-asset checks do not
replace verification of Vercel's actual function bundle in the approved canary.

Independent human PR review is still required; local self-review/tests are not represented
as an external security review. After approval: one paused protected disposable Preview,
normal owner attestation plus external provider/source checks, then independent automatic
exact-ID deletion and pause readbacks. No stable alias move, signup, event or purchase.
H1 and Production remain NO-GO until those hosted gates pass.

References: [Vercel file inclusion](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions),
[system deployment identity](https://vercel.com/docs/environment-variables/system-environment-variables),
[Supabase server-verified getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Exact reviewed-canary operational binding

The conditional canary remains exact `202b3d3965aa2fd4bb9e16dab06f207b157b8acd`;
newer operator-tool commits do not replace the deployed application source.
The attestation/cleanup/release boundaries are unchanged from that review.

`scripts/testing/s2-canary-provider.mjs` binds the existing cleanup engine to
pinned, already-authorized provider CLIs. No new credentials or token exports.
All API reads are scoped; deletion requires the exact new project/team/run/source,
Preview classification, no prior-inventory membership and no aliases. The supported
`vercel remove <exact ID> --safe --yes` operation is followed by an independent
authenticated, exact-path HTTP404. No alias mutation is permitted by this binding.

CLI 58.9.0 drops structured HTTP status on API errors even with `--include`.
The passive `s2-canary-http-observer.mjs` uses standard Node diagnostics channels
and private child IPC to retain only origin-checked method/path/numeric status.
It does not patch requests, read headers/bodies/credentials, modify the CLI or
print raw errors. Missing/conflicting observations, transport timeout, wrong
method/path, 401/403 and CLI outcome mismatch remain UNKNOWN. Actual read-only
200 and synthetic-404 controls were observed. An initial Windows preload path
error occurred before network observation; a proper file URL corrected it.
26 focused binding tests cover those boundaries; the unchanged hosted/65-test
suite is not repeated.

The launcher starts a detached worker and exits. The worker proves that exit,
checks independent provider authority/paused state, and writes readiness before
deployment is allowed. It discovers only the fresh run-tagged new deployment,
then closes on an explicit request or a 15-minute deadline using the existing
`closeS2Run`. A failed worker does not count as automatic success; operator
recovery remains separately labelled. Original evidence is never overwritten.
Deployment uses all 17 settings in both scopes. The previous orchestration's
`--skip-domain` flag is NOT supported for Preview and was rejected before creation;
it must not be reused or changed to a Production target. The corrected Preview
procedure uses a verified nongit source export, empty project-domain metadata,
unlinked Git, no alias/promote command and independent stable-alias checks;
the stable alias is never moved. Runtime/build attestation and actual automatic
deletion remain NOT RUN until their real canary evidence is collected.

October25 execution: exact202b Preview dpl_DUUyLNdAtKPN1UhGR1Yvgx5MC25B reached
READY, aliases[]; independent same-state containment passed. The generated origin
was protected. Owner login was not completed before the fixed deadline, so owner
runtime attestation remains NOT RUN. At13:56:27UTC the detached worker verified
automatic deletion; a separate authenticated read confirmed exact-ID404 and all
seven prior deployments, stable routing, pauses and Production containment intact.
The generated hostname is retired; do not attempt login there. No manual deletion
was performed. See the consolidated matrix and sanitized evidence JSON.

Independent AI peer review of operator commit `2ccd0d1` requested two corrections
before any rehearsal: mutable endpoint state must not suppress cleanup authority,
and discovery must propagate its remaining deadline through every provider read.
Both are corrected locally. Deployment preflight still requires paused state;
cleanup accepts an enabled endpoint only after exact TEST account/destination and
owner scope validation. Discovery expiry interrupts the current child and stops
the scan; the worker's bounded containment fallback remains independent.
37 focused binding checks pass, including enabled-endpoint cleanup with a failed
disable operation, between-item deadline expiry and actual in-flight abort.
This is local evidence, not proof of hosted cleanup. Re-review is required.
The follow-up review found the same coupling in project safety checks. Cleanup
authority now reads exact project/team identity independently; Git linkage, SSO
and bypass drift still fail strict deployment preflight and safety readback.
They cannot suppress pausing the independently identified S2 services.
