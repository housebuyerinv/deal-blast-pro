# BuyerMatch source reconciliation and synchronization plan — October 28, 2026

**Prepared only. No push, branch rewrite, merge, deployment or provider write.**
Current release decision: [controlled release gates](BUYERMATCH_RELEASE_DECISION.md).

## Exact unpublished application/acceptance history

GitHub PR #2 and `git ls-remote` independently agree on head
`c4f19fea2060355565e7c0dad4141456b66d3817` and base
`501cb6a4566211f6828633f862163420fed9c016`. Local implementation tip is
`d7c0a785765ca62c5292c5bab1a6523088c4660a`. Remote head is its ancestor;
the eight unpublished commits, oldest first, are:

| Commit | Completed work |
| --- | --- |
| `6994cbd490151be8ac590650759a42c691681b7c` | c4 hosted authentication blocker and independently verified cleanup receipts |
| `07466bf8f06254d2dd5f128df7c499c7ee9e9e1c` | Real subscriber activity, owner operations, matching/criteria and related protections |
| `06d3fadf1ee0ecf88b4cac6869da4fe2932f9340` | Application build-completion evidence |
| `f47bd4d78d8efae425658cba638b15651e1d44f4` | Consolidated acceptance preparation and service-only RPC grants |
| `a8e641d2d153120b12bb8ea92d1cc1ca72a59f7e` | Exact-source hosted gates/recovery coverage and migration preparation |
| `783a578d9d280b673399096d105dcfc8618f0dca` | Guarded isolated local profile, schema loader and acceptance environment |
| `d7de9db4cab30f2e48e1d2e231b60f315d82993d` | Licensed official Docker/WSL installation checkpoint |
| `d7c0a785765ca62c5292c5bab1a6523088c4660a` | Actual local full-stack acceptance, loopback/private-file isolation and evidence |

Net delta: **74 files, 2,975 insertions, 48 deletions**. Exact paths are in
[the audit manifest](release-evidence/2026-10-28/POST_ACCEPTANCE_GIT_AUDIT.json).
This documentation consolidation is one additional unpublished commit; resolve
its exact SHA from local HEAD before owner publication approval. It changes no
accepted application behavior. PR comments are published; these commits are not.

## Preservation and audit

- Git object connectivity passed; all13 selected implementation/acceptance
  checkpoints are ancestors, including buyer self-service `ddf1928`, billing
  separation `7c33727`, entry-point coverage `c00d59f`, PR head and all8 commits.
- Local network tip `3adffee` and reconciliation tip `a83318e` are also ancestors.
  No completed BuyerMatch work from either branch is missing. Separate registration
  containment/security-release branches remain preserved separately; do not merge
  or publish them as part of this BuyerMatch update.
- Scanned the entire802-file candidate tree and every blob introduced in the
  eight unpublished commits:793 distinct blobs considered. No credential-pattern
  matches in unpublished content. Four matches already published are explicit
  dummy token test literals (three) and a synthetic no-credentials HTML fixture
  (one); none is a recovered/provider secret.
- No tracked local DB/dump/archive/log/private-key/runtime-artifact paths or files
  over5MiB. Committed screenshots/JSON are intentional acceptance evidence, not
  runtime exports. The c4 login screenshot was visually reviewed: synthetic S2
  account identifier and empty password field, no token/password. Its account
  locator was already in published source; filename `private` is not a credential.
  Both newer screenshots show synthetic application state only.
- Runtime credentials, private logs/configuration, databases/volumes, `.temp`,
  `node_modules`, build output and generated attestation remain outside Git.
  Ignore checks passed for all three local credential files, CLI temp and generated
  server attestation. Their contents were not opened during this consolidation.
- Pattern scans cannot prove absence of every possible secret. Do not archive or
  upload the working directory as a substitute for publishing reviewed Git objects.

## Existing working-tree items excluded from synchronization

Leave the pre-existing modified forward manifest and these eight untracked items
unchanged and unstaged. They are not in the completed candidate:

- `docs/BUYERMATCH_FORWARD_RELEASE_MANIFEST.json` (modified historical draft)
- `docs/BUYERMATCH_RELEASE_DECISION_20261025.md`
- `docs/BUYERMATCH_RELEASE_METADATA_REVIEW_20261025.json`
- `docs/REGISTRATION_FIRST_PUSH_ISOLATION_REVIEW.md`
- `docs/release-evidence/2026-10-27/PRIVATE_HANDOFF_VISIBILITY.md`
- `docs/ui-evidence/buyermatch-buyer-mobile.png`
- `scripts/testing/hp-svm-enable-once.ps1`
- `scripts/testing/hp-svm-readonly.ps1`
- `scripts/testing/owner-s2-handoff-readiness.ps1`

Their relevant dated constraints are summarized in the current decision; they are
not silently promoted to current provider evidence. No broad `git add .`, cleanup,
reset, squash, cherry-pick or rebase is needed.

## Proposed source-only synchronization — separate approval required

1. Review the eight-commit net delta plus this documentation-only commit. Preserve
   the existing PR base and full history. The live PR remains DRAFT / NO-GO.
2. Immediately before an approved push, re-read the two remote tips. Stop on drift;
   do not automatically merge/rebase. Confirm the approved local HEAD and a clean
   index; unrelated working-tree files may remain untracked/unstaged.
3. Confirm the publication side-effect boundary for this exact branch. Both PR
   head and candidate retain `git.deploymentEnabled` false for
   `codex/buyermatch-1b-integration`; no tracked `.github` workflows or local pre-push
   hook were found. This is source evidence, not proof about every external
   GitHub App/webhook/team. Do not infer protection for the separate security branch.
   Do not push experimentally to discover whether a deployment starts.
4. Obtain owner authorization for the exact final tip and source-only PR update.
   Then use only a normal fast-forward push to
   `refs/heads/codex/buyermatch-1b-integration`. No force, alternate remote, base
   update, automatic merge or deployment command.
5. Verify GitHub's head equals the approved SHA; verify DRAFT status, reviewed file
   delta and no unexpected automation effect. Update PR description to current
   implementation/local evidence and unresolved gates, retaining historical facts.
   Publication is not hosted acceptance or release approval; do not rerun passing
   local tests solely because the Git objects became published.

Before publishing any later new implementation, rescan its new blobs and review
only affected evidence. No source or credential recovery branch is rewritten by
this plan, and no independent backup/recovery capability is claimed by Git history.
