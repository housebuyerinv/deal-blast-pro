# Credit, Email, and Hot Zones Foundation

## Property Intelligence credits

The immutable ledger is the source of truth. Included grants expire at their billing-period end; purchased grants have no expiry. Reservations debit included credits before purchased credits. A failed provider request appends a release entry. No existing ledger row is edited or deleted.

Included monthly policy: Free 0, Starter 20, Pro 50, Agency 150, Enterprise configurable per contract in the server-side workspace plan assignment. Enterprise allowances are never accepted from the browser and have no global guaranteed default.

Verified paid activation and renewal invoices grant each billing-cycle allowance exactly once. A paid mid-cycle upgrade grants only the positive difference between the new allowance and included grants already issued for that cycle. A downgrade does not claw back an already-issued allowance; the lower allowance begins with the next verified paid billing cycle. Cancellation never removes purchased credits.

Default pack catalog:

- `credits_10`: 10 credits / $8
- `credits_25`: 25 credits / $15
- `credits_100`: 100 credits / $49
- `credits_250`: 250 credits / $99

Override the catalog with server-only `PROPERTY_INTELLIGENCE_CREDIT_PACKS_JSON`. Stripe Price IDs are server-only through `STRIPE_PRICE_CREDITS_10`, `STRIPE_PRICE_CREDITS_25`, `STRIPE_PRICE_CREDITS_100`, and `STRIPE_PRICE_CREDITS_250`, or the server JSON configuration. The webhook resolves exactly one paid Stripe line item back to this server-side catalog; browser quantities and credit amounts are ignored. A checkout redirect never grants credits. Only a verified Stripe webhook can fulfill a purchase, and replay is idempotent.

RentCast provider capacity is fail-closed. `RENTCAST_CAPACITY_PAUSED` must be explicitly set to `false` before live provider requests are allowed. While paused, durable cached results and Geoapify autocomplete remain available, but no credit is reserved, consumed, or retried and Owner Admin cannot bypass the pause.

## Email operations

Messages are inserted into `email_outbox` before a provider call. Retryable failures use exponential backoff. Resend webhook events append delivery evidence for sent, delivered, failed, bounced, complained, and suppressed states. Provider acceptance is not recipient delivery.

Required Edge Function secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOTIFY_FROM_EMAIL`, `EMAIL_OUTBOX_CRON_SECRET`, and the existing Supabase service variables. `EMAIL_TEST_RECIPIENT_ALLOWLIST` is optional; Production tests are otherwise limited to a verified Owner Admin email.

## Verified closings and Hot Zones

Only rows in `verified_closings` count. Sold status, closing dates, Property Intelligence requests, sample data, demos, failed deals, canceled deals, and duplicates do not create Hot Zone activity.

Hot Zones requires Pro or higher. Pro receives workspace trends, Agency receives workspace plus shared/team aggregates, Enterprise receives advanced/custom access, and Owner Admin receives full access with safe Preview simulation. Free and Starter receive no aggregate data from the server.

Threshold configuration:

- `HOT_ZONES_WORKSPACE_MIN_CLOSINGS` defaults to 3.
- `HOT_ZONES_SHARED_MIN_CLOSINGS` defaults to 5.
- `HOT_ZONES_SHARED_MIN_WORKSPACES` defaults to 3.

Shared results expose only ranked city/state/ZIP aggregates and counts. They do not return workspace IDs, addresses, buyers, sellers, or fees. Aggregation reads stored closing records and never calls a paid property-data provider.

## Manual activation checklist

1. Review and apply the additive Supabase migration.
2. Deploy `stripe-webhook`, `notify-submission`, `email-outbox-worker`, and `resend-webhook`.
3. Create Stripe one-time Prices only after approval, then configure their server-side IDs.
4. Add `charge.refunded` and `charge.dispute.created` to the Stripe webhook event selection.
5. Verify the Resend sending domain and publish its SPF and DKIM DNS records.
6. Register the signed Resend webhook and configure `RESEND_WEBHOOK_SECRET`.
7. Schedule `email-outbox-worker` with its bearer secret.
8. Configure Vercel server variables for pack definitions and Hot Zone thresholds. Keep `RENTCAST_CAPACITY_PAUSED` enabled until provider capacity resets. Never use `VITE_` for secrets.
