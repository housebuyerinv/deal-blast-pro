# Credit, Email, and Hot Zones Foundation

## Property Intelligence credits

The immutable ledger is the source of truth. Included grants expire at their billing-period end; purchased grants have no expiry. Reservations debit included credits before purchased credits. A failed provider request appends a release entry. No existing ledger row is edited or deleted.

Included monthly policy: Free 0, Starter 0, Pro 25, Agency 100, Enterprise configurable. `PROPERTY_INTELLIGENCE_ENTERPRISE_DEFAULT_CREDITS` is only a configurable sales default and is not a guaranteed entitlement.

Default pack catalog:

- `credits_10`: 10 credits / $8
- `credits_25`: 25 credits / $15
- `credits_100`: 100 credits / $49
- `credits_250`: 250 credits / $99

Override the catalog with server-only `PROPERTY_INTELLIGENCE_CREDIT_PACKS_JSON`. Stripe Price IDs are server-only through `STRIPE_PRICE_CREDITS_10`, `STRIPE_PRICE_CREDITS_25`, `STRIPE_PRICE_CREDITS_100`, and `STRIPE_PRICE_CREDITS_250`, or the server JSON configuration. A checkout redirect never grants credits. Only a verified Stripe webhook can fulfill a purchase.

## Email operations

Messages are inserted into `email_outbox` before a provider call. Retryable failures use exponential backoff. Resend webhook events append delivery evidence for sent, delivered, failed, bounced, complained, and suppressed states. Provider acceptance is not recipient delivery.

Required Edge Function secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOTIFY_FROM_EMAIL`, `EMAIL_OUTBOX_CRON_SECRET`, and the existing Supabase service variables. `EMAIL_TEST_RECIPIENT_ALLOWLIST` is optional; Production tests are otherwise limited to a verified Owner Admin email.

## Verified closings and Hot Zones

Only rows in `verified_closings` count. Sold status, closing dates, Property Intelligence requests, sample data, demos, failed deals, canceled deals, and duplicates do not create Hot Zone activity.

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
8. Configure Vercel server variables for pack definitions and Hot Zone thresholds. Never use `VITE_` for secrets.
