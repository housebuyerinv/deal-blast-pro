# One approval request: protected, paused current-MVP S2 Preview

**PENDING OWNER APPROVAL. No deployment or alias write has been performed.**
Prepared under PR #2 comment6399370070. This request covers staging only and does
not extend the completed202b canary authorization or authorize a public release.

## Exact requested scope

| Item | Pinned value |
| --- | --- |
| Application source | `5fab059a531f20c1b94c581c1b9e0c95a205a66f` |
| Project/team | `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl` / `team_2ejXKYjjGXIFsIQTUMEqZ8Cf` (`housebuyerinv`) |
| Deployment environment | Preview only; exact-source export outside Git; supported dry inspection first |
| Only movable alias | `dbp-registration-s2-preview-housebuyerinv.vercel.app` |
| Current target and pinned rollback | `dpl_nr5RVunmUGdryPUtWkRkVdsA96pT` |
| Verified fallback generated origin | `https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app` |
| Proposed target | One NEW, READY, protected Preview of the exact source above; ID/hostname do not exist yet and must be independently verified/recorded before assignment |
| Supabase / Stripe | `qxhhlprentrufobpcgna` / TEST-only `acct_1UTRcRL6efr9LhPI` |
| Maximum read-only acceptance window |30 minutes after verified alias assignment; no extension |
| Added spend |$0; existing free quota only; stop on insufficient quota, upgrade, payment or possible additional charge |

Current routing/pauses were inspected read-only at2026-10-25T15:19:02.606Z.
Fallback is READY Preview in the correct project/team. Registration, Checkout,
live billing and delivery are disabled; TEST endpoint disabled, receiver=false,
protection enabled, staging URLs correct. Production alias remains containment
`dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE`. Recheck immediately before execution.

All17 exact public overrides in [the machine-readable request](BUYERMATCH_S2_PAUSED_PREVIEW_REQUEST.json)
must be applied in BOTH build and runtime scopes. Existing project defaults and
credentials are not changed to force a comparison. Attestation opt-in/source/run
metadata are separate, non-secret execution metadata. No unrestricted Stripe key,
Production credential, bypass secret or new integration is permitted.

## Gated execution included in this request

1. Prepare the minimum staging-only routing/rollback binding. Run focused synthetic
   tests for wrong source/project/team/target/alias, unexpected current route,
   timeout/failure and interrupted-controller handling; independently review exact
   code/fingerprints. No provider writes while this request is unapproved.
2. After approval, verify exact source, Git-unlinked project, free quota, protection,
   private credential provenance, all pauses and the pinned fallback. Verify actual
   same-state rollback authority on this alias while it still points to the fallback,
   without enabling anything. Record unchanged routing afterward. If authority or
   independent deadline restoration cannot be proved, STOP before creating/moving.
3. Create one paused protected Preview using exact source and supported Preview
   syntax. Never use `--prod`, promote, or Production-only `--skip-domain`.
   Inspect actual project/team, source/run, Preview target and READY status before
   assigning anything. No automatic Git or custom-domain routing is introduced.
4. Re-read the stable alias: it must still point to the exact pinned fallback.
   Assign ONLY this alias to the newly recorded verified deployment. No other alias,
   domain, callback, database, provider secret or previous deployment may change.
5. Through normal stable-origin authentication, verify owner-only all17 build/runtime
   settings, source/run/deployment identity, exact QA agreements, expected staging
   bindings and unauthenticated denial. Reuse the existing owner session only if the
   server validates it; otherwise private normal password entry is the only owner
   interaction. No session/token bridge, credential reset or new account.
6. Perform read-only current-MVP navigation/forms, desktop/narrow-layout/keyboard,
   subscriber-vs-CRM routing and owner review visibility checks. Use only existing
   authorized synthetic records/sessions. Do not submit, approve/import, accept new
   agreements, create fixtures, initiate Checkout/Portal billing actions or send
   responses. Stop any route that would write application data. Ordinary supported
   Auth login/refresh bookkeeping is distinct from application/customer writes.
7. Close the window with fresh routing/protection/pause readbacks. Preserve existing
   owner sessions and all seven prior deployments. If every check passes within the
   deadline, retain the new deployment protected/paused on the S2 alias for the next
   separately gated stage. No signup, billing or delivery activation follows.

## Rollback and incomplete-window policy

On any failed/unknown assertion, interrupted controller, unavailable owner login,
or30-minute deadline before all checks pass: the independently verified controller
must restore ONLY the S2 alias to the pinned fallback and re-read its exact target,
project, protection and paused state. Re-read immediately before writing: rollback
is permitted only while the alias still points to this run's exact new deployment
(or is already at the fallback). Never force over an unexpected third target.
No atomic compare-and-swap guarantee is claimed; serialize the sole operator and
treat concurrent/unexpected routing as an escalation, not permission to overwrite.

Supported operator rollback mechanism (not an owner command, and NOT executed):
`vercel alias set dpl_nr5RVunmUGdryPUtWkRkVdsA96pT dbp-registration-s2-preview-housebuyerinv.vercel.app --scope housebuyerinv`.
Use the pinned CLI/private provider session; never put credentials in arguments.
Independent readback is mandatory; command exit alone is insufficient.

The new candidate may remain protected/paused and unaliased to retain diagnostics
after rollback; it is not automatically deleted. Any later deletion must verify
its exact owned ID/source/project/team and lack of aliases. Never remove an existing
deployment or the fallback. The original automatic-deletion rehearsal is already
PASS and will not be repeated or relabelled as alias-rollback proof. The old canary
adapter explicitly prohibits alias writes and is NOT a ready rollback executor.

If restoration itself fails, attempt no broader routing/force operation. Keep both
S2 processing gates closed, retain protection and exact failure evidence, and report
the alias's observed state or UNKNOWN. No Production fallback or credential change.

## Excluded and remaining release gates

No registration POST, fixture/application DB write, migration, email, buyer message,
distribution, purchase, subscription mutation, Stripe event replay, legal publication,
Production operation, MoneyMap change or PR merge. The stable callback stays
`https://dbp-registration-s2-preview-housebuyerinv.vercel.app/auth/callback`;
existing QA capture and notification isolation remain unchanged.

Pro/lifecycle testing still needs its exact authorized window and legitimate test
subscriber access. Legal drafts need owner/counsel decisions and final approval.
Independent recovery remains BLOCKED ON HARDWARE, not failed; no purchase or export.
Four-migration forward preparation and direct-containment accounting remain intact;
no Production execution is authorized. PR remains DRAFT; Production NO-GO.

**Decision requested:** approve only this gated paused S2 deployment, same-state
rollback-authority proof, dedicated stable-alias move and time-bounded read-only
acceptance scope, including fallback restoration on failure/incomplete deadline.
