# Bounded hosted sequence — prepared, NOT authorized to execute

## October 26 continuation: candidate and activation boundary

The owner permits preparation and already-authorized TEST work once its safety
gates pass. The new buyer-account candidate is local, its migration is not applied,
and no push/deployment approval covers it. Do not treat a consumed one-deployment
window as new deployment authority or repeat earlier positive purchases/replays.
Current evidence is in `release-evidence/2026-10-26/`; all processing remains paused.

### New buyer-account hosted acceptance (prepared, not executed)

Use two explicitly owned, confirmed synthetic Auth identities through normal
protected-browser login, plus the existing verified owner only for review. Never
substitute a service/admin session for a buyer session or use the real owner as a
disposable buyer. Do not create replacement accounts to evade rate limits. Verify
trusted identity-key compatibility before opening any existing encrypted record.

| Case | Required exact behavior / evidence |
| --- | --- |
| B1 · onboarding | New synthetic identity creates only its own pending buyer row, binding and immutable event; no paid CRM assignment or unrelated changes. The create action must return 503 while registration is paused. Only a separately scoped S2 unpause permits its positive path |
| B2 · legacy linkage | Confirmed Auth plus its valid, delivered, identity-matched invitation links exactly one buyer. Wrong identity, receipt/email alone, expired/revoked/undelivered token and foreign IDs fail without writes. Do not disclose invitation/session tokens |
| B3 · profile and criteria | Own name/company/phone and validated criteria update; identity digest/canonical email preserved; exact consent version, immutable event and one revision advance. Legacy admin-sync invalidates the old revision; actual concurrent stale saves lose no data |
| B4 · POF replacement | Two benign synthetic PDF/image fixtures only; capture byte hashes, size/MIME, owner scope and expiry. Private original retained, replacement pending, no funds/eligibility activation. Anonymous/foreign download, mismatched MIME, invalid expiry, oversize, reservation replay/rate-limit and stale commit fail closed; quarantine orphan evidence without unsafe deletion |
| B5 · owner review | Ordinary buyer cannot list/review/sign another buyer's proof. Only the confirmed active owner may review; banned/deactivated identities fail. Review decisions remain immutable; approval does not activate buyer eligibility or undo opt-out |
| B6 · personal history | Only delivered invitations owned by the bound buyer. Verify interest/decline/offer/status, contact-redacted conversations and all pagination pages (including offset timestamps). No other buyer/workspace record, raw contact field or expired-link reactivation |
| B7 · consent/security | Separate withdrawal without accepting new terms; pending exposures suppressed, prior opt-out never undone by profile/criteria/proof edits. Verify browser table/column denial, service-only RPC execution and append-only evidence |
| B8 · closure | Restore registration, Checkout, receiver, Stripe delivery and all other TEST gates; verify exact alias fallback/protection, then clean only explicitly owned reversible fixtures. Preserve audit/evidence and immutable proof versions under an approved retention policy; do not force-delete them |

Before B1–B8, approve the exact migration/app source and bounded fixture scope,
confirm baseline hashes and complete cleanup/deadline readiness. No public/real
email, live payments or buyer distribution is part of these tests. Private owner
or buyer login, if genuinely needed, uses the normal UI only; no token bridge,
chat credential entry, auth reset workaround or repeated signup attempts.

### Restricted-key and callback contract

- Checkout/Portal key: Prices READ; Checkout Sessions READ/WRITE; Subscriptions
  READ (retrieve and owned-customer list); Billing Portal sessions WRITE and
  configuration READ. No direct customer-write permission is required by the
  current `customer_email` Checkout implementation.
- BuyerMatch webhook key: Subscriptions, Invoices and Prices READ, plus signature
  verification with its independent receiver secret. General CRM fallback code
  is not a reason to broaden this BuyerMatch-only key. Do not install a standard
  administrative key in application runtime.
- The owner confirmed these settings privately, and historical Starter Checkout
  plus v21 signed invoice reconciliation proved the applicable reads. Today's CLI
  administrative metadata access does NOT re-prove runtime restricted-key rights.
- Current endpoint emits Endive `2026-09-30.endive`; app SDK requests Dahlia
  `2026-08-26.dahlia`. Existing signed replay is retained evidence, not blanket
  proof of all lifecycle events. Verify Pro/current invoice cases in H1–H6.
- The portal restricts updates to the two approved prices, allows price changes
  only, disables adjustable quantities, keeps the billing anchor, and currently
  uses `create_prorations`; cancellation is period-end without proration. It is
  default only within the isolated sandbox. Server sessions explicitly select its
  configuration and protected S2 return origin. No provider setting was changed.
- Callback and deployment protection must be verified against the exact newly
  authorized READY deployment. Inherited absence of a non-secret portal-ID binding
  is not itself a failure when reviewed deployment overrides supply it. Missing
  compatible server secrets cannot be bypassed by an override or a replacement key.

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

Each stage is a separate closed window with its own results and restored pauses.
Proceed only within the owner's approved TEST scope once all prerequisites pass;
this is not a request for repeated approval of every already-covered test.
Testing permission does not authorize the missing candidate migration/deployment.
No H1-H9 hosted mutation was executed during this continuation.

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
