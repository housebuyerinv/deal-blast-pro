# Local synthetic browser login safety

This is a local test-harness correction, not a deployment or permission to resume
hosted payments. Application login, registration, billing and database code are unchanged.

## Replacement

`scripts/testing/buyermatch-browser-login.mjs` uses the existing `/admin-login`
form and `signInWithPassword`, not a token-bearing callback, redirect server,
injected storage or cookie bypass. The installed Supabase SDK owns session expiry
metadata; a mocked SDK test verifies `expires_in` and calculated `expires_at`.

Use only a separately approved fresh `dbp-s2-...@example.com` identity. The retired
exposed identity is explicitly rejected. Credentials must exist only in private
process memory; never pass them through argv, environment variables, files,
clipboard, logs or chat. Do not print variables or browser inventories.

The Cua adapter uses documented form locators. It checks password masking and the
exact login origin/path before entering credentials and before submitting. It reads
the current tab URL privately through `listTabs({browser, emit:false})`, selecting
only its own tab. DOM snapshot `documentURI` is not supported by the browser's
read-only DOM representation, so it is not used.

Do not capture AX, screenshots, console/network logs, page metadata or raw errors
during entry, submission or navigation. Wait for the known BuyerMatch heading and
verify the exact `/app/buyermatch/plans` route with no query, fragment or userinfo.
Only a successful `observationAllowed:true` result permits subsequent observations.
All failures return fixed stage/status fields, discard raw exceptions, close the
tab once and prohibit observations. No automatic login retry. If close fails,
stop without rebinding, inspecting or dumping that tab.

These controls apply to this harness and its documented caller. They do not
assert that arbitrary browser commands or unrelated telemetry cannot leak data.
Keep all caller output behind the gate; do not invoke legacy runners.

## Preserved legacy evidence

The two ignored old entrypoints, `synthetic-browser-handoff.mjs` and
`subscription-window.mjs`, were copied byte-for-byte into
`artifacts/buyermatch-1b/retired-token-bridges-20261022/` with a SHA256 manifest.
Both active entrypoints now fail immediately with a fixed retirement message.
No original evidence was deleted. The archived copies are forensic evidence,
not executable candidates.

## Verification and retry gate

- Focused suite: `node --test tests/buyermatch/browser-login-harness.test.js`.
- Actual local browser fixtures cover normal success, an unsafe dummy fragment,
  and ordinary rejected login. Dummy-only loopback fixtures do not contact Supabase,
  Stripe or the hosted application. They are not hosted login/payment evidence.
- Before any separately approved hosted window, use a fresh owned fixture,
  reverify S2 isolation, capture-only email, protected routing, pending delivery
  inventory, consent and the mandatory pause-restoration plan.
- Do not unban, reactivate, generate a session for, or copy tokens from the retired
  identity. Read-only containment verification is sufficient for this task.
- Keep the unpaid original Checkout/reservation as evidence. Reconcile using its
  provider-reported status and expiry; allow natural expiry when the supported
  connector cannot expire it. Do not force expiry through an unrestricted key,
  privileged workaround, callback, or database-only state change.

Registration/Checkout, endpoint delivery and receiver processing remain paused.
PR #2 stays draft. A new hosted window requires separate approval.
