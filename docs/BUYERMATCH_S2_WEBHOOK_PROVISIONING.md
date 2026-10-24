# S2 webhook provisioning gate

Local candidate only. No deployment, credential change, endpoint creation or hosted
test is authorized by this document. Production and MoneyMap are outside scope.

## Processing protection

The actual Stripe handler returns HTTP 503 for staging POSTs unless all are true:

- `BM_ENVIRONMENT=staging`
- `BM_STAGING_PROJECT_REF=qxhhlprentrufobpcgna`
- `SUPABASE_URL=https://qxhhlprentrufobpcgna.supabase.co`
- `BM_S2_STRIPE_WEBHOOK_ENABLED=true` (exact, explicit opt-in)

Missing/false enablement blocks before body consumption, Stripe/signing/service-key
reads, signature processing, Stripe lookups or database calls. The gate covers the
whole handler, including legacy CRM/credit-pack fallback. Request headers cannot
enable it. The exact staging URL still activates the guard if the environment
label is missing or accidentally says Production. A real Production URL with a
Production environment label retains existing behavior, even if a staging-ref
variable is also present. Non-POST method rejection remains 405.

This is a **receiver-processing block**, not a claim that Stripe cannot send an
HTTP request. HTTP 503 may create failed-delivery records and automatic retries.
Already-running requests are not canceled by changing a setting. During a switch,
keep signup/Checkout off, account activity quiescent and inspect in-flight requests.
Re-deploying this source to staging and proving the guard is the next approval gate.
The current deployed v9 does not have this protection.

## Shortest safe sequence (separate execution approvals)

1. Review/commit the candidate; approve deployment of **only** the guarded Stripe
   Edge bundle to Supabase staging. No Vercel Preview deployment or migration yet.
   Set `BM_S2_STRIPE_WEBHOOK_ENABLED=false`, preserve signup/Checkout/live gates.
   Verify returned deployed source/version/hash and staging bindings. A separately
   approved minimal synthetic HTTP check must demonstrate 503/no processing; local
   tests do not prove deployed runtime configuration.
2. Choose explicitly between the original no-outbound-delivery requirement and
   receiver-only containment. Supported Stripe create APIs currently offer no
   disabled-at-creation field. The official versioning guide says create then
   disable, which does NOT meet the original requirement. No create/disable race,
   empty event-list assumption, bogus URL or unverified Dashboard draft is allowed.
   If no outbound request is permitted, obtain Stripe provider confirmation first.
   If the owner separately authorizes receiver-protected provisioning, maintain the
   verified 503 gate before creating the S2 endpoint; any delivery stays a failed
   HTTP request and cannot process. Disable it via supported Stripe controls before
   further account activity. This alternative is NOT preauthorized here.
3. After the selected gate passes, use only account `acct_1UTRcRL6efr9LhPI`,
   account-only snapshot events, exact staging URL ending `/functions/v1/stripe-webhook`,
   reviewed event allowlist and API version. No Connect/org scopes or forwarding.
   Create/inspect secret-bearing details only in an owner private browser outside
   agent observation, or an explicitly reviewed private API transport which cannot
   log request/response bodies. The connector's raw creation response is unsuitable.
4. While the processing gate remains false and endpoint disabled: owner privately
   installs its own signing secret as staging `STRIPE_WEBHOOK_SECRET` FIRST, with
   no old/shared fallback. Then install `BM-S2-Staging-Webhook` as staging
   `STRIPE_SECRET_KEY`. This intentionally rejects old shared-account staging
   signatures; do not alter shared DBP/MoneyMap endpoints or replay old events.
   Supabase secrets are project-wide and take effect without redeployment. Existing
   consumer evidence: only deployed `stripe-webhook` reads these names, but it
   includes legacy billing paths. Those paths must not drive broader key grants.
5. In the same consolidated private session install the existing
   `BM-S2-Preview-Checkout-Portal` key as Secret `BM_STRIPE_TEST_SECRET_KEY` in Vercel
   project `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl`, Preview ONLY. Never use the standard
   secret key, public/VITE variables, chat, screenshots/accessibility output,
   plaintext local files, shell history or command arguments. Agent cannot retrieve
   keys from transcripts or silently search the owner's credential store.
6. Confirm permissions from a values-redacted view: Preview key needs Checkout
   Sessions read/write, Prices read, Subscriptions read, Customer Portal read/write;
   verify only documented transitive requirements. Webhook BuyerMatch graph needs
   Subscriptions/Invoices read. No All:Write. Record target/name/type/scope and
   private digest-match attestation, not credentials. Store metadata alone is not
   runtime proof. Keep both keys and signing secret separate.
7. Approve guarded staging catalog mapping of only Starter/Pro price IDs, preserving
   allowances and historical entitlements/receipts. Review staging tier migration,
   agreements and exact protected Preview source/runtime provenance before separate
   deployment approval. Verify the portal is explicitly selected, two-price-only,
   quantity adjustment disabled; current plan-change policy creates prorations and
   preserves billing anchor. No claim of immediate invoice collection.
8. Only after separate hosted-test approval: verify new-signature acceptance and
   old-signature rejection, enable processing and endpoint delivery in a controlled
   window, then authorize synthetic signup/Checkout. Test both tiers, CRM add-on,
   confirmation, reconciliation, duplicate/out-of-order events, payment negatives,
   cancellation/tier changes, portal ownership, agreements and entitlements.
   Review pending Stripe retries before enabling; no blind event replay. Restore
   signup/Checkout pause and `BM_S2_STRIPE_WEBHOOK_ENABLED=false` afterward; disable
   S2 delivery as authorized. Preserve sanitized evidence and owned fixtures.

On failure: stop, restore the S2 processing gate to false, retain signing-secret
isolation, and verify the deployed pause. Do not roll back to the unguarded handler,
restore old shared-secret acceptance or modify live DBP containment.

## Focused local evidence

`node --test tests/stripe-s2-webhook-gate.test.mjs`: 16 synthetic handler tests.
These bundle and invoke the real handler with mocked outbound fetch; they do not
call Stripe or Supabase, create users, or verify hosted runtime. They cover default
closed values, malformed/unreadable bodies, forged headers, valid-signature pause
bypass, binding mismatches, 405, enabled signature checks and reconciliation,
re-pause, and unchanged Production-path signature rejection. No completed broader
matching/registration suite is repeated.
