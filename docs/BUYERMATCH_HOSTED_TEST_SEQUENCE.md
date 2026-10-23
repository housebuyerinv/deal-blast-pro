# Bounded hosted sequence — prepared, NOT authorized to execute

Review 6369788952. No activation/deployment/credential reset is part of this work.
Keep the existing Starter purchase/replay evidence unchanged; use the existing
confirmed Pro fixture when private normal login becomes available. No signup retry,
rate-limit bypass, new token bridge or shared test account.

## Fixture and ordering contract

| Stage | Exact owned fixture / order | Accept / stop condition |
| --- | --- | --- |
| H1 | Existing Pro 368f5f93-acf7-4cc3-9805-a4c0817506c3; one USD119 TEST Checkout after owner login | Completed owner/session, signed activation 50/25/50, CRM unchanged. Stop on permission/identity/rate limit; do not create another fixture |
| H2 | Same newly verified Pro's owned Stripe customer; normal billing UI | Payment-method flow and only approved price/quantity restrictions; no foreign/CRM customer portal. Do not log session URLs |
| H3 | Same owned Pro subscription, explicit approved downgrade then upgrade | Record actual proration/invoice/billing anchor, consumed usage and effective allowances. No second subscription, resets or invented next-period promise |
| H4 | Same fixture only after H3 acceptance | Schedule cancellation, inspect paid-through access; prove actual cessation only on legitimate terminal state. A non-clock subscription cannot be assumed fast-forwardable. Waiting or a separately approved eligible clock fixture may be required; do not create accounts to evade signup limits |
| H5 | Explicitly selected owned fixture and provider-supported failure method | Pending/abandoned return grants nothing; approved failure/recovery outcomes and no duplicate subscription. Do not force-expire historical evidence or change payment state without scope |
| H6 | Existing applicable Stripe-signed events for those fixtures | Delayed failure/current invoice ordering and replay; no forged signatures. Existing Starter paid replay already PASS, not another required test. Stop if a safe supported signed scenario is unavailable |
| H7 | Separately approved disposable transaction on S2, owned synthetic IDs | Pending/null/blank session and ownership denials leave no entitlement/ledger writes; roll back fixtures. No direct live-mode payment/config enablement |
| H8 | Existing Starter and Pro users through normal auth | Foreign resources denied, unchanged roles/CRM, private buyer/response data scoped. No admin/service token as a customer session |
| H9 | Approved local/S2 synthetic deal + synthetic buyer records only | Analysis/usage -> MOCK non-delivering distribution -> scoped response/consent, exact quotas and unchanged unrelated rows. Never real recipients |

Each stage is a separate closed window with its own results; approval of one is
not approval of the next. No H1-H9 hosted mutation is currently authorized.

## Preflight, journals and closure

Before any future window: verify exact reviewed application/receiver SHA, READY
Preview target/project/team, callback/stable-alias routing and all-deployment
protection; staging qxhhlprentrufobpcgna and sandbox acct_1UTRcRL6efr9LhPI only;
owned profile/Checkout/subscription/session; expected owners/ACLs/RLS; current
invoice and failed/pending event inventory. Snapshot sanitized record/security
fingerprints, current subscription economics and ledger rows. No secret dumps.

Keep registration, live billing, live delivery and real emails disabled. Activate
only separately approved TEST gates through private provider interfaces. No
production domain move. An independent bounded watchdog/operator must be ready to
close processing if the test controller is interrupted. No timer's elapsed time
proves provider success or cancels an already accepted provider request.

`scripts/buyermatch-s2-safety.mjs` is the tested local cleanup orchestration:
`restoreS2Pauses` attempts endpoint disable AND receiver pause despite either
operation failing, then reads back all required protections. Unknown/read failure,
unsafe state or closure error throws a generic sanitized failure. Wrong scope
invokes no adapter. `withApprovedS2Window` restores on ordinary success, test failure
and preflight failure. It contains NO credentials, activation, default/live adapters
or CLI entrypoint and has not been executed against providers. It is not a process
supervisor and cannot guarantee cleanup after forced termination or a hung adapter.
Future execution must bind reviewed private adapters and retain an independent
deadline-based closure path; missing adapters/watchdog are a STOP, not a reason to
retrieve/export keys or assume this module is a hosted-ready launcher.

Mandatory closure: endpoint disabled, receiver=false fingerprint plus actual paused
503, registration/Checkout/live billing/delivery still off, protection/stable alias
unchanged, no unexpected pending events; compare actual owner/entitlement/ledger and
unrelated rows. Unknown is not PASS. Never roll back to weaker SQL guards or
vulnerable registration. Preserve diagnostics; clean only authorized owned fixtures.
No automatic retry after a security failure; no broader lifecycle stage on partial
success. If closure cannot be verified, prioritize containment and owner escalation.

## This local delta

19 new focused checks PASS (selected by test name; completed suites not rerun):
3 actual signed-handler/PGlite rollback/session/owner checks, 1 public-conversation
allowlist/redaction check, 2 composed mock-distribution/owner-consent checks and
13 cleanup/scope/error checks. No application defect reproduced; no hosted success
inferred. An initial generic-word privacy assertion was corrected to check actual
fixture buyer IDs/emails rather than the explanatory word “private.”

The mock workflow does not prove a hosted matching/distribution/response round trip,
and cleanup dummy adapters do not prove provider permission or process-death recovery.
