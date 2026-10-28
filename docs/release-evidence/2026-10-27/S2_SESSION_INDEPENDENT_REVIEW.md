# Independent local source review

## Final transport review and correction

The separate read-only reviewer inspected exact commit
`5d830002c1fe2b84855656434b44e26121e13984`. It found one P2 defect: a completed
denial result could remain visibly PASS after the approved run deadline until
the separate Auth timer expired. No other blocking issue was found in the fixed
routes, bearer privacy, runtime17/source/deployment/run guards, bounded response
handling or stop/no-retry behavior.

The corrected working tree adds deadline-aware render invalidation, a deadline
timer, focus/visibility resume checks, rollback invalidation and missing-binding
rejection. Historical completedOutcome is retained separately from live status.
The reviewer re-inspected this correction and approved it for **separately
authorized bounded hosted verification**, with no further blocking finding.
That approval does not apply to the unchanged 5d83000 commit; use the new committed
source containing this correction. Review was by a separate agent, not a human
security certification; no credentials or hosted operations were used.

42 directly affected local UI/routing/attestation checks passed, including four
new expiry regressions; prior unaffected transport/window checks are retained.
TypeScript, scoped lint and a synthetic-S2-configured bundle were verified locally.
Neither this review nor local tests establish hosted success. Publication,
deployment, authentication/test execution and cleanup require fresh explicit
authorization. Both authenticated hosted tests remain NOT TESTED. No milestone.

## Earlier authentication-only review

Subsequent local implementation adds the denial mechanism described in
`S2_NATIVE_DENIAL_CONTROL.md`. This review remains limited to the authentication,
routing and autosave source it originally covered; it does not approve that new
transport or grant deployment authorization.

Reviewed initial commit: `d05a0011f272ca42efb7b8c4c6c2bb4608fbd6d8`.
Reviewer: separate read-only agent `/root/review_s2_session_control`; the author
did not treat its own review as independent. No hosted requests or credentials.

Initial disposition: REQUEST CHANGES. A P1 integration defect made the control
unreachable to the Free CRM Pro fixture/BuyerMatch-only subscriber because of
AppShell's existing plan gating. Corrected by a dedicated S2-only route outside
AppShell, retaining the existing authenticated/deactivation ProtectedRoute.
No CRM privileges, plan assignments or owner bypasses were granted.

The re-review found a P2 autosave race: timer cancellation alone did not invalidate
a callback already awaiting Auth. Generation/disabled guards now reject deferred
callbacks before upload. The new deferred-Auth regression test verifies zero uploads
after entering the disabled diagnostic route.

Final independent disposition: **authentication-only source approved after
corrections; no remaining blocking defect identified in the reviewed control,
routing or queued-autosave cancellation.** Reviewer inspected the corrected local
working tree before commit; this is source review, not human counsel/security
certification, deployed attestation or real-session acceptance.

Verification: 37 affected local checks pass, including ten new routing/autosave
checks. TypeScript and Vite bundle pass. Scoped lint: zero errors, one existing
initializeStore dependency warning; existing bundle warnings retained. No hosted
test was repeated or claimed complete.

## Do not request a two-test deployment yet

The exact authenticated legacy Checkout/Portal/credit-pack/Pro-trial denial
transport is still missing. This read-only authentication control cannot issue
those requests through the DOM-only browser tool. Prepare/review a narrowly
allowlisted application-native denial transport before requesting a deployment
intended to complete BOTH tests. An authentication-only deployment would leave
that requirement blocked and would need its own explicit bounded authorization.

Already-started uploads cannot be retroactively canceled. Future authorized
execution must use a fresh tab directly on the dedicated diagnostic and separately
verify normal-login side effects/processing safeguards. Queued-write cancellation
must not be reported as undoing a request already sent.

No push, deployment, login, hosted migration, provider setting, key replacement,
billing or Production/MoneyMap operation. Both authenticated hosted tests remain
NOT TESTED; public release NO-GO. No owner action needed for this local review.
