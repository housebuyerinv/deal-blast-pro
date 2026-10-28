# Native denial-test mechanism — implemented locally, not executed hosted

The dedicated S2 session-verification page now includes a separately gated denial
control. No calls occur on mount or after authentication alone. The operator must
provide the reviewed public source/deployment/run/deadline and explicitly confirm
the bounded authorization and independent watchdog/run-claim prerequisites.

The application privately uses its existing SDK session; no password prompt,
token export, browser evaluation workaround, Stripe URL or credential file access.
Fresh confirmed Pro identity, source/project/deployment/run binding, all 17 exact
paused runtime settings and empty activation bindings precede the negative POSTs.
Paused runtime is rechecked before each POST and after the sequence. Build-time
attestation, provider ownership, protection and watchdog authority remain separate
independent prerequisites; the new runtime boolean does not prove those facts.

Fixed checks only: anonymous application 401; Pro denied owner attestation and
Stripe-readiness 403; legacy Portal, credit-pack and Pro-trial 503 with exact guard
codes; BuyerMatch Checkout and Portal closed-window denials. Checkout's earlier
409 agreement prerequisite is recorded distinctly and accepted only on that route.
No agreement acceptance is attempted. A timeout/unknown response is never denial.

One click/attempt per mounted control; expiry/clock rollback, Auth changes, unmount,
redirects, malformed/oversized bodies, unexpected status or pause drift stop the
sequence. Unexpected success is retained as failure, with no automatic cancellation,
expiration or retry. Response bodies and headers never enter output. Only fixed
operation/status/verified rows and validated public run bindings/timestamps render.
Normal browser authentication remains signed in; this mechanism does not sign out,
refresh explicitly, create sessions or activate subscriptions.

Evidence in the page is volatile. During future authorized execution the operator
must capture the allowlisted DOM receipt/progress into the independent local run
journal before automatic cleanup. Missing evidence remains UNKNOWN. Do not claim
the UI itself supplies durable disk storage or independent cleanup verification.

Local verification: 94 focused checks passed across native transport, UI, existing
window/entrypoint containment, authentication/routing, autosave and attestation UI.
These use synthetic Auth/HTTP fixtures and existing local real-handler checks, not
hosted Stripe/Supabase operations. TypeScript, scoped lint and focused API bundles
passed; Vite bundle passed with env-file loading disabled and existing warnings.

Both browser-native mechanisms are ready for final source review. The previous
independent authentication-only review does not approve this new transport. A new
exact-source publication/deployment packet and explicit bounded authorization are
required before any push, protected Preview, owner sign-in or hosted execution.
No deployment, hosted migration, settings/keys, buyer data or Production/MoneyMap
changes. Both authenticated hosted tests remain NOT TESTED; release NO-GO.
