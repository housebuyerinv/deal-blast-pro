# Billing containment and watchdog — local verification

Candidate: `c00d59f048282343af5d81afe9655556aa285e75`.
Prior candidate/evidence remains preserved. No push or hosted/provider change.

## Executed results

**130/130 selected checks PASS**, including30 new checks this batch:
104 affected runner/window/journal/application and detached-watchdog checks,
19 containment checks,7 updated exact-source packet checks.
Scoped lint PASS after correcting two missing test URL imports; scoped server
TypeScript and server bundle PASS. The previous frontend/build evidence is
retained; unchanged frontend suites/build were not repeated.

- A real detached Node process continued after its launcher exited. It attempted
  each of five synthetic cleanup operations once, including after a timeout or
  failed durable-journal acknowledgement. It closed on deadline, explicit request
  and unknown stop state. Denied approval/wrong authority caused zero mutations.
- Launcher-probe permission errors remain UNKNOWN; only actual ESRCH proves exit.
  Independent process execution was real. Provider effects in these child tests
  were synthetic fixtures, not authenticated cloud operations.
- A real local HTTP server exercised endpoint-disable and owned Checkout-expire
  request/response/readback handling. Initial restricted-sandbox fetch failed with
  EACCES and zero server requests. The approved local-only rerun passed. No real
  credentials, internet provider calls or external event delivery occurred.
- Receipt/authority/TEST-mode/owner/run/timestamp checks reject unrelated resources.
  Issuance/in-flight uncertainty cannot pass. Cleanup never cancels subscriptions,
  refunds payments, expires historical sessions or opens any processing gate.
- S2 Checkout now records the public run ID in session/subscription metadata, so
  cleanup can distinguish newly owned sessions from the old unpaid Checkout.
  Non-S2 metadata behavior remains unchanged. Actual local SQL/signed-webhook
  integration reverified the metadata and Pro50/25/50 behavior.

## Portal result

Activation permits Checkout only. Portal closure can pass only with the exact
source/run/owner, attested checkout-only runtime, complete issuance journal and
zero issued Portal sessions. Proof must cover every reachable S2 runtime,
demonstrate legacy Portal entry points deny access, and verify the provider Portal
login page is disabled. No such current hosted coverage proof was obtained here.
An empty list or attestation of only the new Preview without those proofs fails.
The HOSTED lifecycle profile now refuses activation before adapter calls.

No supported immediate Portal-session revocation mechanism has been verified.
Stripe's documented Portal session API lists creation, not expiration:
https://docs.stripe.com/api/customer_portal/sessions . Browser closure, redirection,
elapsed application window, paused Checkout or a socket timeout is not proof of
revocation. Lifecycle remains BLOCKED until a separately reviewed supported
containment strategy exists. No speculative provider setting changes were made.

Checkout expiration is supported for OPEN sessions only; adapter reads back an
expired/completed owned session before confirming closure:
https://docs.stripe.com/api/checkout/sessions/expire . Endpoint cleanup sends only
`disabled=true`, then independently reads the exact endpoint back:
https://docs.stripe.com/api/webhook_endpoints/update .

## What remains unverified

The new containment adapter has no credential/default transport/CLI. Its private
ports still require authenticated verification: approval and exact account/project
authority; restricted TEST transport; complete issuance/in-flight reconciliation;
attested no-Portal policy; Supabase pause and actual503 readback; scoped routing,
owned deployment removal and preservation readbacks. The module does not supply
or read credentials. Never reuse the historical source-pinned canary provider by
changing its source identity merely to make it run.

The new watchdog's `monitoringOnly` receipt is not proof of provider cleanup
authority. Its `cleanupCallsVerified` receipt is not a global closure PASS:
independent deployed-state/preservation readback remains mandatory in the runner.
No new S2 runtime permissions, normal Pro login or actual watchdog provider
authority was verified during this local-only task.

The updated billing-only packet is proposal data, `executionReady=false`; it omits
buyer migrations and identity secrets. Its directories/run ID are examples, not
an issued window. Next: separately authorize exact-source publication/protected
Preview and authenticated, payment-free preflight/cleanup proof; only after those
pass may a separately approved bounded Pro activation proceed. Portal lifecycle
must remain outside that activation approval.

Compatible original buyer keys, hosted buyer acceptance, approved legal documents,
independent encrypted recovery and Production/public activation remain mandatory.
Production/MoneyMap,223 original identities,9 provenance payloads,8 nonstandard
hashes and S2 pauses were untouched. No newly verified overall milestone.

