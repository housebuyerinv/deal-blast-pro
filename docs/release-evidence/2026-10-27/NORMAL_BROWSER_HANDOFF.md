# Normal-browser handoff — locally prepared; NOT executed

**Latest local implementation:** the supported application-native control is now
implemented on `/app/s2-attestation`; see `S2_NATIVE_SESSION_CONTROL.md`. It is not
deployed. The unsupported evaluation proposal below remains disabled. A new source
review and bounded deployment authorization are required before owner sign-in.

## Compatibility correction (supersedes the proposed evaluation below)

The available IAB Playwright evaluate API uses a **read-only DOM scope**, not the
page's application JavaScript realm. Actual credential-free loopback checks found:

- DOM heading read: PASS.
- `typeof globalThis`: `undefined`; `typeof fetch`: `undefined`.
- Evaluating the proposed `globalThis.__dealBlastSupabaseClient` lookup failed
  before reaching the dummy client. The previous Node VM test did not reproduce
  this isolation and was insufficient evidence of browser compatibility.
- A normal browser button successfully invoked the fixture's own dummy client
  inside application code and rendered `SYNTHETIC UI COMPATIBILITY PASS - NOT
  AUTHENTICATION`. This proves UI interoperability, not real session verification.

`prepareBrowserVerification()` now always rejects this unsupported adapter. Do not
use the old expression, alternate globals, DevTools, cookies, storage, CDP, token
bridges or user console commands to work around the boundary. The pure verifier
remains preparation code for a future reviewed application-native control. It now
rejects clock rollback and bounds provider waiting to at most ten seconds without
retry; a late request result is not accepted.

The safest supported alternative is a small reviewed S2-only application-native
read-only verification control: normal password login stays unchanged, the owner
explicitly confirms login, application code calls its existing SDK's getUser(),
and only a sanitized status is rendered for DOM observation. Origin, source,
identity, timeout and account-change gates must remain enforced. This control is
NOT implemented/deployed by the compatibility fixture, and requires a separately
reviewed source candidate before any bounded deployment authorization. Existing
fallback pages and a dashboard alone do not provide this new evidence.

Ten focused local tests and scoped lint passed. The real browser fixture bound
only owner-side 127.0.0.1, imported no app configuration/real SDK and used CSP
`connect-src 'none'`. The sandbox-side listener was unreachable to IAB; moving the
same fixture to owner-side loopback allowed the local compatibility check. The
unreachable error-page tab also could not be bound because its generated data URL
was rejected by browser URL policy; no warning/policy bypass was attempted.

No hosted endpoint, authentication session, credential, deployment or provider
setting was touched. No owner action is required now. Do not request login until
the reviewed native verification control and its authorized execution path exist.
Both outstanding hosted tests remain NOT TESTED. No new milestone.

The following ordered proposal is retained as history; its step 4 is unsupported
and must not be executed with the current browser tool.

Existing Pro fixture: `dbp-s2-pro-1792721835370@example.com`.
Existing fallback login (last verified in the preceding provider run):
`https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app/admin-login`.
No new Preview is necessary to prepare this handoff. Do not move the alias.

## Ordered handoff

1. Before requesting authentication, identify the owner's normal browser tab and
   confirm its visible origin and Sign In form. Confirm the browser tool supports
   same-tab JavaScript evaluation with sanitized return values. Do not substitute
   a separate agent browser, CLI password login, exported session or desktop prompt.
   If this capability is unavailable, stop BEFORE asking the owner to sign in.
2. Obtain authorization for the normal login/session verification. This preparation
   request authorizes neither a new login session nor provider calls. Independently
   revalidate the existing fallback/project/source binding before that execution.
3. Owner opens the exact existing login URL in that visible tab, signs in once as
   the existing Pro fixture using their private password, and explicitly replies
   "signed in on the existing S2 fallback." No reset/signup, developer-console
   command, token, screenshot, HAR, cookie or password transfer is required.
4. After that explicit reply, use the prepared same-tab verification expression
   within two minutes. It uses the existing application's SDK singleton
   `globalThis.__dealBlastSupabaseClient` defined in `src/lib/supabase.ts` and calls
   `auth.getUser()` without a custom JWT. It does not call getSession(), read
   browser storage/cookies, export tokens, construct a client or log raw results.
   The SDK may perform its normal session maintenance; this is why future execution
   requires login/session-verification authorization and is not performed now.
5. Require exact existing S2 origin/backend, confirmed Pro UID/email and authenticated
   non-anonymous user. Return only status and fixtureVerified. Reject missing client,
   stale confirmation, owner mismatch, provider error, unavailable browser access
   or any unverified result. Do not print caught exceptions or raw API bodies.
6. A verified Auth result proves authentication only. It does NOT authorize or
   execute route-denial tests, Portal sessions, Checkout or billing operations.
   A future Preview has separate source/runtime/cleanup gates and still requires
   fresh explicitly bounded authorization. Sessions are origin-scoped: fallback
   authentication must never be presented as authentication to a new Preview.

## Trust and evidence boundaries

The reviewed browser adapter must use the selected same-page application singleton,
not an owner-supplied receipt or arbitrary getUser stub. Unit fixtures are only
local tests. Source/origin binding and actual browser-tool access remain execution
prerequisites; a dashboard, user-editable store or sign-in metadata alone is not
independent session verification. Missing evidence remains UNVERIFIED.

The verifier is an operator preparation module, not a deployed UI or application
source change. No existing app, credential or hosted configuration was modified.
Seven local checks cover success, missing confirmation, expiry, wrong origin/backend,
wrong identity, missing client and sanitized failures. Actual browser authentication
and both outstanding authenticated hosted tests remain NOT TESTED.

Supabase documents that getUser() makes an Auth-server request and uses the current
session when no JWT is passed:
https://supabase.com/docs/reference/javascript/auth-getuser

No owner action now. On separately authorized execution, the only private action
is normal sign-in at the exact URL above and the explicit completion reply. Do not
ask the owner to run a command or expose credentials. No new completion milestone.
Production and MoneyMap unchanged; public release NO-GO.
