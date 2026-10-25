# One decision: protected S2 routing-fix acceptance window

**PENDING APPROVAL. No deployment, alias or provider setting changed in this batch.**
Prepared under PR #2 instruction6400728839. The prior one-deployment approval is
consumed. Approving a source review or this preparation does not authorize execution.

## Finding and corrected application

Exact proposed application: **`b99830596080eef2b24472e71bdcb061c855bf57`**.
This includes the minimal route fix442b467 and the operator-page correctionb998305,
in addition to the reviewed e046be5 bounded reason codes. It is **not** a
classification-only deployment.

The installed pinned Vercel58.9.0 pure route generator produces both:

```
^/api/platform/([^/]+)$ -> /api/platform/[endpoint].ts?endpoint=$1
^/api/platform/([^/]+)$ -> /api/platform/[endpoint]?endpoint=$1
```

Its actual function text was extracted by TypeScript AST and executed locally
without running the CLI or using a provider/credential. The generated selector
caused the original actual dispatcher/protected-handler regression to fail400
instead of200. The corrected dispatcher normalizes **only** the exact attestation
path plus raw `?endpoint=s2-attestation`, restores the original URL in `finally`,
and leaves every other query/handler untouched. Authentication, confirmed owner,
Active Admin/workspace, GET-only and body/framing checks are unchanged. Arbitrary,
duplicate, encoded and mismatched selectors still fail.

**Confirmed:** a local vendor-routing/strict-query incompatibility and its minimal
fix. **Not captured:** the original hosted request's effective URL/framing. Its
sole historical400 cause remains UNKNOWN. If another condition fires, fixed
owner-only codes identify it without exposing raw values or weakening the guard.

The exact operator page now excludes CRM tour/promotion components. Dismissing the
CRM tour normally persists an account preference; no such write is authorized or
needed for this read-only operator check. CRM pages retain their existing behavior;
BuyerMatch pages already use their separate layout. Three actual React SSR tests
prove modal mounts, not all browser effects or hosted behavior.

## Proposed protected target and boundaries

| Setting | Exact value |
| --- | --- |
| Project / team | `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl` / `team_2ejXKYjjGXIFsIQTUMEqZ8Cf` |
| Environment | Preview only; never `--prod`, promotion or Production-only `--skip-domain` |
| Only movable alias | `dbp-registration-s2-preview-housebuyerinv.vercel.app` |
| Immutable current/fallback target | `dpl_nr5RVunmUGdryPUtWkRkVdsA96pT` |
| Fallback generated origin | `https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app` |
| New target | One NEW READY protected deployment of exact b998305; ID/hostname unknown until provider verification |
| Supabase | `qxhhlprentrufobpcgna` only |
| Stripe | `acct_1UTRcRL6efr9LhPI`, TEST only; no event/purchase/portal action |
| Time | Maximum30 minutes, starting before the alias assignment; no extension |
| Added spend | $0; require existing Hobby/free quota; stop on quota/payment/upgrade requirement |

The [machine-readable request](BUYERMATCH_S2_ROUTING_FIX_REQUEST.json) contains all17
exact settings in BOTH build and runtime, the complete8-deployment preservation
list and12 operator SHA256 pins. No settings/credentials are changed to force a
comparison. The prior failed5fab deployment remains protected/unaliased evidence.

## Execution only after separate approval

1. Independently verify the actual human approval names this immutable packet
   commit and b998305 source. The launcher's acknowledgement/comment arguments are
   audit inputs, **not** proof or a source of authorization. Missing acknowledgement
   or the consumed approval exits before workspace/provider operations.
2. Verify clean checkout, packet ancestry, exact12 fingerprints, source export/Git
   blob equality, all17 overrides, unchanged8-deployment inventory, scoped provider
   authority, protection, staging bindings, free plan, all pauses and live
   containment. Sensitive variables stay non-exported. Compare the public key with
   its pinned provider fingerprint and require unchanged Preview-only binding
   metadata tied to prior hosted evidence; do not claim fresh hidden-secret content
   or permission verification. Any drift stops before deployment.
3. Start the independently reviewed detached controller. Require launcher exit,
   same-state fallback authority/readback and safe-state verification before one
   deployment. Existing deletion proof is retained; do not repeat it.
4. Deploy the exact source from a fresh non-Git export with supported Preview args,
   all17 build/runtime overrides and fixed source/run metadata. Require READY,
   correct project/team/Preview identity, protected anonymous denial and exact QA
   agreement discovery before moving ONLY the S2 alias. No callback/DNS changes.
5. Use the existing normal stable-origin owner session. If it has expired, one
   private normal password entry is the only permitted handoff; no bridge, reset,
   new account, email or credential retrieval. Execute attestation once. Compare
   its actual17 BUILD/RUNTIME settings, source, deployment, run and build checksum
   against independent provider records.400/401/403/503, unknown evidence or a
   mismatch fails the window; do not retry the request automatically.
6. Only after attestation passes, perform the bounded read-only checks below.
   No app/customer writes, submission/upload, agreement acceptance or billing action.
7. Freshly verify all safeguards and routing. Retain the new paused protected
   target only if every scoped check passes within the deadline. Otherwise trigger
   independent rollback and verify it independently.

Approved operator command forms, **not executed**:

```
node scripts/testing/s2-mvp-preparer.mjs --execute-after-owner-approval APPROVAL_COMMENT_ID PACKET_COMMIT_SHA
node scripts/testing/s2-mvp-deploy.mjs VERIFIED_RUN_DIRECTORY VERIFIED_PLAN_SHA256
```

The immutable packet manifest pins the preparer itself. All executable/operator
files are tracked for review; the original ignored scripts and evidence remain
preserved. Packet and application commits are deliberately separate to avoid a
self-referential source SHA or substituting newer application code.

## Precisely bounded acceptance

- Owner-only17-setting attestation and unauthenticated denial; exact staging QA
  document IDs, versions and content hashes.
- Existing owner's read-only BuyerMatch overview/plans and network-admin view.
  This is **not** paid Starter/Pro subscriber verification.
- Public BuyerMatch landing/intake form labels, keyboard navigation and narrow
  viewport. No submit, proof upload, consent acceptance or private response.
- Routing/protection/pauses remain unchanged except the expressly approved S2
  alias movement; restore the normal browser viewport afterward.

This window does **not** close the remaining CRM submission-review/import browser
flow, paid subscriber/lifecycle, distribution, legal or recovery gates. In
particular, do not dismiss a CRM tour that would persist a preference during a
read-only window, or label network-admin visibility as CRM intake approval proof.

## Independent rollback and stop conditions

The prior actual failure-triggered rollback and separate readback passed. The
same controller retains its routing/deadline behavior; this packet updates only
the exact source pin and unambiguous acceptance labels. On failed/unknown
assertion, interruption or incomplete30-minute deadline, independently restore
the S2 alias to the immutable fallback and re-read it, while keeping endpoint and
receiver paused. Never overwrite an unexpected third-party alias target or force
an uncertain operation. No deletion of any prior deployment; the new failed
candidate may remain protected/paused/unaliased for diagnostics. If restoration
cannot be proved, report UNKNOWN and stop broader operations.

No Production/MoneyMap change, migration, app/customer write, registration,
purchase, webhook event, email, delivery, live billing, bypass secret, credential
rotation, legal publication or PR merge is included. Production remains NO-GO.

## Verification and remaining release work

-24 focused actual handler/dispatcher tests PASS, including red-before/green-after
  vendor-selector regression;3 actual shell SSR tests PASS.
-15 routing/controller and11 preparation checks PASS; actual no-approval and
  consumed-approval invocations performed no workspace/provider operations.
- API typecheck, actual server bundle, frontend typecheck/build and scoped lint
  PASS. Separate independent AI source and operator/manifest reviews PASS for
  preparation/publication only; this does not grant execution authority.
- Prior hosted Starter, signed receiver replay, intake database tests and automatic
  deletion/rollback evidence are retained, with no repeated hosted tests.

Legal owner/counsel approval remains outstanding. Recovery is BLOCKED ON HARDWARE;
no equipment purchase, format, key generation or Production export. Forward
security-only/integration migration separation and direct-containment accounting
remain required before separately approved Production actions.

**One decision requested:** approve this single exact-b998305 paused protected
Preview, dedicated S2 alias move, maximum30-minute scoped acceptance and automatic
fallback restoration. No new owner account/email/key setup is requested.
