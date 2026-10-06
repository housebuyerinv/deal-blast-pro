> Current commercial decision: [BUYERMATCH_COMMERCIAL_LIMITS.md](BUYERMATCH_COMMERCIAL_LIMITS.md) supersedes the historical unapproved/shared-allowance proposals below. Starter is 20 analyses / 10 distributions / 25 buyers; Pro is 50 / 25 / 50. Purchasing remains inactive; Production is unchanged.

# BuyerMatch activation audit — October 5, 2026

Candidate `29fc996aba51a5edf7463f74b07a14fefc09a718`, branch `codex/buyermatch-network`, clean before this documentation-only audit. Verified Preview: https://deal-blast-7ly6sowrn-housebuyerinv.vercel.app, deployment `dpl_77ZPPQsBTRGd4h4tG53qEvhNBfRS`, READY / Preview. No application, schema, plan or environment configuration was changed. No Production promotion, provider send or payment was attempted.

## Allowance decision

**OWNER DECISION REQUIRED: Starter and Pro monthly allowances**

No approved commercial allowance numbers were found in the catalog, handoff or live staging plan rows. Fixture allowances are QA data, not commercial approval.

The two tiers have identical unit semantics; price/version and the approved integer `bm_plans.allowance` distinguish them:

- One saved analysis evaluates one saved deal against the active private network, including three price-sensitivity scenarios. Matching is deterministic application computation, not a paid AI call. An analysis returning zero matches still consumes one unit. Individual matched buyers do not consume separate analysis units.
- A new analysis operation key consumes another unit, even for the same deal. A retry with the original owner/key returns the existing result without another row or quota charge. Failed/rolled-back analysis commits consume nothing. Maximum ten committed analyses per owner per rolling hour remains separate from monthly quota.
- One software distribution unit reserves one distribution request for one approved deal and creates its eligible, consented buyer exposures/outbox rows. It is **not one email or one buyer match**. One request can fan out to many buyers. Reservation consumes quota before successful delivery; provider failure does not automatically refund it. A zero-recipient transaction rolls back. Same-key retries and delivery retries do not consume another request.
- An allowance of **N** gives independent ceilings of **N analyses AND N software distribution requests**, not a shared pool of N combined actions. Both use the same `buyermatch` entitlement's allowance number. Separate arbitrary analysis/distribution limits cannot be configured with the current single field.
- Software distribution no longer needs a separate Network entitlement. Legacy/unmarked and Managed Dispo deals still require `network` entitlement and approved fee agreements/policy. Their distribution counter is separate from software in SQL.
- Counters are owner-scoped, not multiplied per workspace. Billing events update `period_start`/`period_end`; this is the subscription billing period, not calendar-month rollover. Usage rows are retained, not reset/deleted. Runtime SQL counts from period start while requiring the current period to be active; the plans read also bounds by period end. There is no rollover of unused units.
- A fresh analysis must follow the last deal update/review and be less than 24 hours old. An early analysis followed by contract/title review generally means **two analyses per distributed deal**; preparing/reviewing first can use one. Reanalysis and other exploratory deals reduce effective distribution capacity.

### Proposal for approval only

| Tier | Price | Proposed allowance field | Resulting independent ceilings | Typical capacity with two analyses per distributed deal |
|---|---:|---:|---|---:|
| Starter | $59/month | 20 | 20 analyses + up to 20 software distribution reservations | 10 deals |
| Pro | $119/month | 50 | 50 analyses + up to 50 software distribution reservations | 25 deals |

These are provisional commercial recommendations, **not established profitable limits and not activated**. At full analysis utilization, gross subscription revenue per analysis is $2.95 / $2.38; at two analyses per distributed deal it is $5.90 / $4.76 before payment, infrastructure, support and delivery costs. Pro offers 2.5× capacity for about 2× price. Neither plan promises a number of buyer matches or guaranteed delivered invitations.

Actual unit economics cannot be certified from the available evidence: there have been zero Production distributions, recipient fanout and support costs are unmeasured, and the provider contract is not authorized. If average fanout is B, worst-case reservation utilization produces up to 20B / 50B invitation attempts before retries. At an illustrative (not measured) B=100, that is 2,000 / 5,000 invitations; analysis capacity currently fails closed above 10,000 active buyers, which is not a commercially safe per-request email cap. Evaluate margin as subscription revenue minus payment costs, fixed/account overhead, analysis compute and N×B×delivery unit cost. Approve the numbers only with this fanout exposure understood; do not advertise unlimited buyer delivery.

Known reporting limitation found in this audit: the plans endpoint shows analysis usage for `buyermatch` and all distribution requests for `network`. It does not separately show software distribution remaining, and a mixed-service owner's Network display can overcount software requests relative to SQL enforcement. This is a launch-facing reporting discrepancy, not an authorization bypass. No UI/quota redesign was made in this activation-only pass. Resolve or explicitly accept the disclosure limitation before selling these allowances.

## Actual state and provider readiness

Staging `buyermatch-starter-v1` / `buyermatch-pro-v1`: allowance **0 / 0**, approved **false / false**, Stripe price IDs **null / null**. Source catalog prices are **5900 / 11900 USD cents monthly**. Production has neither new catalog row yet.

Staging DB live billing: `enabled=false`, `verified=false`. Hosted Preview plans report `checkoutEnabled=false`, `checkoutMode=disabled`, empty purchasable catalog; test delivery enabled and distribution available. Local protected staging configuration is `BM_ENVIRONMENT=staging`, `BM_DELIVERY_MODE=mock`, `BM_CHECKOUT_ENABLED=false`. Staging DB distribution/provider/permissions/agreements flags are true **for synthetic QA only**; success fees false. Prior exact-commit hosted receipts were mock receipts. Vercel marks branch variables sensitive and does not return their plaintext through this connector; this audit uses hosted effective behavior, the protected local configuration and the prior mock receipt checks rather than claiming unreadable values were decrypted.

**BLOCKED: isolated Stripe sandbox credentials are not available.**

No usable test key is present in the protected local staging environment; the sensitive Preview key cannot be retrieved as a usable credential. No live Stripe connector/resource was used as a substitute. Local tests cover test-key/environment rejection, approved price and owner/product mapping, durable checkout idempotency, existing Stripe-linked subscription conflicts (including inactive subscriptions), signed event verification, event replay, conservative past-due/deletion revocation and separate CRM billing. Creating/retrieving a Checkout URL or returning to the app grants no entitlement. Cancellation at period end retains access until the current paid period ends; canceled/deleted/inactive subscription state revokes it. Hosted payment, invoice, cancellation, expired-session and provider-webhook lifecycle certification still requires the isolated sandbox. Live activation additionally requires an actually paid live invoice and explicit server AND DB gates.

**BLOCKED: Resend authorization/credentials are not available.**

No usable staging Resend key or callback secret exists in the protected local configuration; required authorization remains pending. Mock is valid only in staging. The `resend-test` adapter requires synthetic buyers, validates the Preview response origin and hardcodes `delivered@resend.dev`; no caller-supplied recipient is used. Production cannot use mock/fixture transport. Provider acceptance is recorded only after a successful provider receipt. Stable exposure idempotency keys, outbox claims and ambiguous-attempt reconciliation protect retries. Svix validates raw callback signatures; duplicate callback IDs are deduplicated; bounce/complaint/suppression and unsubscribe suppress future sends. The invitation contains only its deal/address/asking price and capability, not the buyer database or other buyers; token capabilities are intentionally recipient-private. Local mocked provider tests are not proof of real callback connectivity.

## Production configuration matrix

Read-only Vercel inspection confirms current Production values below. `BM_LIVE_BILLING_ENABLED` and `BM_BILLING_VERIFIED` are **absent**, which fails closed; they are not secretly enabled. No environment values were changed.

| Setting | Current Production / before promotion | After approved core code/schema promotion, before send | Before any live buyer delivery |
|---|---|---|---|
| `BM_CHECKOUT_ENABLED` | false | false | false until separate billing approval |
| `BM_LIVE_BILLING_ENABLED` | unset → off | explicitly false recommended | off until separate billing approval |
| `BM_BILLING_VERIFIED` | unset → off | explicitly false recommended | off until separate billing approval |
| `BM_DELIVERY_MODE` | disabled | disabled | resend, only after provider certification and owner approval |
| `BM_LIVE_DELIVERY_ENABLED` | false | false | true only with approved real-recipient scope |
| `BM_RESPONSE_ENABLED` | true | true | true; accepted-outbox/token checks remain mandatory |
| `BM_ENVIRONMENT` | production | production | production |
| `BM_PRODUCTION_PROJECT_REF` | aigvnbxiydbzzqbetlhl | same, URLs must match | same |
| DB `distribution_enabled` | false | false | true only after all distribution gates pass |
| DB `provider_verified` | false | false | true only after actual acceptance/callback tests |
| DB `permissions_verified` | false | false | true only after recipient consent/permission approval |
| DB `agreements_verified` | false | false | true only after legal/current-document approval |
| `bm_production_delivery_config.enabled` | false | false | true after separate owner delivery approval |
| `bm_live_billing_config` | table absent | migration creates false/false | remains false/false until separate billing approval |
| DB `success_fees_enabled` | false | false | false; separate future authorization, constraint remains |
| Mock / synthetic / fixture transport | unavailable | unavailable | unavailable |

Configure and verify stable server-only identity/response secrets, exact Production URLs/origin and authorization independently; never put them in frontend variables. For later delivery, `RESEND_API_KEY`, `BM_RESEND_FROM` and Edge `BM_RESEND_WEBHOOK_SECRET` must be securely configured with matching project/environment, verified sender and provider authorization. Test-only values belong in isolated staging, never Production. Enabling delivery does not authorize enabling billing.

## Exact later Production migration sequence

Live inspection confirms the eleven original BuyerMatch migrations and `buyermatch_messages` are installed. `bm_messages` exists. The four completion migrations below are absent; the new billing table and owner-message/conversation/draft/portal RPCs are absent. Existing response/distribution RPCs are SECURITY DEFINER with fixed `search_path=public` and no anon/authenticated EXECUTE grant. Do not reapply the messages prerequisite.

| Order | Canonical source | SHA-256 (LF-normalized source) |
|---|---|---|
| 1 | `20261006010617_buyermatch_live_billing_boundary.sql` | `09315c9f55628ec5b0fcaad3eb8ec8288f5533cffac8084ef825698ddeeca150` |
| 2 | `20261006010804_buyermatch_conversation_safety.sql` | `fe422d8d8b88c870ec781d78c9bdce39880b0d0cf50245fede2e155d6e5877f1` |
| 3 | `20261006013219_buyermatch_portal_sync_atomic.sql` | `14db83fea4794c61f3d15cf89dde2404c77d458d956663bbd0bef10ee15e5c39` |
| 4 | `20261006013640_buyermatch_software_distribution.sql` | `f8f26d6703d74a1b2d3132ad6bf5a9243042e113625c6124d85db8302043ba89` |

These sources match staging's verified ledger. Historical Production source checksums are not retroactively asserted from migration identities. No reset, history rewrite, DROP, TRUNCATE or deployment-time customer DELETE/backfill is present. New tables/RPCs stay private; existing RPC replacement changes semantics deliberately. Transactions use 5-second lock and 30-second statement timeouts. Brief catalog/function locks and runtime owner/row locks remain; rehearsal does not prove live contention timing.

Later approved execution: recheck live prerequisites and hashes, obtain a recoverable backup under the existing operating procedure, keep all send/billing gates off, apply these four sources in order to the explicit Production project, verify grants/RLS/functions/default-off configuration, then deploy the approved application SHA and perform synthetic-safe smoke tests. If a migration fails, its transaction rolls back; stop and diagnose without reset or falsifying history. If application smoke fails, keep gates off, restore the previous app deployment if compatible and deliver a reviewed forward-fix migration. Do not remove new tables or rewrite applied files as an automatic rollback. Unrelated legacy `deal_submissions` RLS stays out of this release.

## Verification and release decision

Rerun in this pass: **198/198 automated tests**, **219 disposable Production-equivalent rehearsal assertions** across 16 BuyerMatch migrations, **63/63 staging source checksums**, **26/26 read-only exact-Preview hosted routing/auth/config checks**. Full 184/184 authenticated mutation/browser acceptance is the prior verified baseline, not falsely counted as rerun here. No runtime code changed, so build/lint were not repeated; prior TypeScript/build pass and 0 lint errors / 94 warnings remain applicable. PGlite is single-session and does not certify live provider/network behavior.

Production final read-only counts remain outbox/responses/checkouts/billing events **0/0/0/0**; all delivery DB gates and success fees remain off. No Production writes occurred.

**Not ready for commercial Production promotion.** Owner-approved allowances, the allowance-display discrepancy, isolated Stripe lifecycle certification, Resend authorization/callback verification and explicit release approval remain open. The already deployed core runtime is separate from this candidate's commercial activation.

Owner steps: approve or revise the proposed 20/50 limits with the counting rules above; connect only an isolated [Stripe sandbox](https://dashboard.stripe.com/test/dashboard) using `BM_STRIPE_TEST_SECRET_KEY` in branch-scoped [Preview environment settings](https://vercel.com/housebuyerinv/deal-blast-pro/settings/environment-variables), and `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in [staging Edge secrets](https://supabase.com/dashboard/project/qxhhlprentrufobpcgna/functions/secrets); authorize a staging [Resend key](https://resend.com/api-keys) and [callback](https://resend.com/webhooks), with `RESEND_API_KEY`/`NOTIFY_FROM_EMAIL` in Preview and `BM_RESEND_WEBHOOK_SECRET` in staging Edge secrets. Keep secrets out of chat. After credentials and approved plan mappings exist, test the complete lifecycle before considering any live activation.
