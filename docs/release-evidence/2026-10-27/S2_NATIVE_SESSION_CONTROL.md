# S2 native session verification control — LOCAL ONLY

Implemented inside the existing `/app/s2-attestation` operator page. Existing
owner-only configuration and Stripe controls keep their server authorization.
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
- Existing app-shell suppression of onboarding/trial prompts on this route remains.
  Normal SDK session maintenance is unchanged; no sign-in, refresh or sign-out
  operation is explicitly added by this control.

Verification: 27/27 focused tests (15 new control/helper checks plus 12 affected
attestation UI regressions); TypeScript project check and scoped lint passed.
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
watchdog and cleanup remain separately enforced execution gates.
