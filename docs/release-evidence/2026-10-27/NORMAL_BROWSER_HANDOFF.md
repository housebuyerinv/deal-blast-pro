# Normal-browser handoff — locally prepared; NOT executed

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
