# S2 native session verification control — LOCAL ONLY

Latest addition: the missing application-native denial transport is now implemented
locally; see `S2_NATIVE_DENIAL_CONTROL.md`. It still needs final source review and
bounded hosted authorization. Earlier references below to its absence describe
the authentication-only review checkpoint, not the latest local implementation.

Implemented at dedicated `/s2/session-verification`, outside CRM plan routing
but behind the existing authenticated account/deactivation guard. The initial
placement under `/app/s2-attestation` was rejected by independent review because
Free CRM and BuyerMatch-only fixtures could not reach it. Existing owner-only
configuration and Stripe controls keep their server authorization.
The new Pro authentication control neither invokes them nor authorizes billing.

- Strict HTTPS S2 Preview hostname plus exact build/client Supabase URL checks.
- Existing normal sign-in only; no new login flow, password input or token bridge.
- Explicit checkbox confirmation, then a single verification attempt using the
  existing application's `auth.getUser()` with no JWT argument.
- Requires the exact confirmed, authenticated, non-anonymous Pro fixture; cached
  store identity is only an extra gate, never authoritative authentication.
- Ten-second timeout; generic failure; no automatic retry; synchronous click lock.
- Auth events/account changes/unmount invalidate in-flight results. Visible PASS
  expires after two minutes without another provider call.
- UI renders fixed statuses only. No raw user, provider errors, cookies, tokens,
  session serialization, logging, preference writes or database mutations.
- The dedicated route does not mount AppShell, its onboarding/trial prompts or CRM
  plan controls. It does not change CRM plan allowlists or promote the fixture.
- Global autosave is disabled on this exact S2 route. Pending timers and callbacks
  awaiting Auth are invalidated; deferred callbacks cannot upload after disabling.
  An upload already sent cannot be canceled retroactively. Use a fresh tab directly
  on the approved diagnostic route and review normal-login side effects before
  authorizing hosted execution; do not claim queue cancellation undoes earlier writes.
  Normal SDK session maintenance is unchanged; no sign-in, refresh or sign-out
  operation is explicitly added by this control.

Verification after review corrections: 37/37 affected checks (15 control/helper,
12 attestation UI, seven real-root routing and three autosave lifecycle/race tests).
TypeScript passed; scoped lint has zero errors and the existing initializeStore
dependency warning in App.tsx.
Vite production bundle passed with env-file loading disabled (`envDir: false`),
retaining existing chunk-size and static/dynamic-import warnings. This was not a
hosted S2 attestation build and does not verify a deployed source/runtime snapshot.
The tests use React and synthetic Auth dependencies, not a real hosted identity.

No push, deployment, authentication, hosted migration, configuration change or
billing operation occurred. No new completion threshold. Production/MoneyMap
unchanged; public release NO-GO. Both outstanding hosted checks remain NOT TESTED.

Next requires review and fresh bounded authorization for this NEW source (the
previously approved `4e79c99` does not contain the control). During future approved
execution, confirm the visible normal login tab first. Owner signs in privately as
the existing Pro fixture, explicitly reports success, then confirms the checkbox.
The application performs its read-only check and the browser tool reads only
`data-s2-session-status`. No console command or password transfer is required.
The control proves authentication only; environment attestation, route denials,
watchdog and cleanup remain separately enforced execution gates. In particular,
the exact authenticated legacy-route denial transport is still absent: this
source must not be proposed as sufficient to finish BOTH outstanding tests.
