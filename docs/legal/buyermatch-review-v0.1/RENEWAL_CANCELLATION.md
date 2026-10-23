# Proposed BuyerMatch Renewal, Plan Change and Cancellation Policy
Version: buyermatch-review-v0.1-renewal | Prepared: 2026-10-23
**DRAFT — NOT APPROVED — NOT FOR PUBLICATION OR ACCEPTANCE**

Seller/contact/effective date: [OWNER VERIFY]. Resolve all decisions with appropriate
review before publishing. TEST portal behavior below is engineering evidence, not
an approved customer policy.

## Recurring subscription
[PROPOSED DEFAULT — OWNER APPROVAL REQUIRED] Starter USD59/month and Pro USD119/month
renew automatically each monthly billing period until canceled through the
BuyerMatch billing-management route or the approved support process.
[OWNER/COUNSEL DECISION: exact charge/renewal notices, tax presentation, applicable
territories, currency conversion and legally required cancellation mechanisms.]

## Cancellation
[PROPOSED DEFAULT — OWNER APPROVAL REQUIRED] Cancellation stops the next renewal;
software access continues through the paid period and ends when the subscription
terminates. This matches the current S2 TEST portal's at_period_end configuration,
but requires hosted end-of-period cessation proof and live-policy approval.
[OWNER DECISION: cancellation cutoff, confirmation notice, effective timezone,
alternative support route, withdrawal of a scheduled cancellation and response SLA.]
Cancellation alone does not authorize a refund or erase retained records. Ended
subscriptions currently require support review before restart; do not promise a
one-click restart that the application has not verified.

## Plan changes
[PROPOSED DEFAULT — OWNER APPROVAL REQUIRED] Approved Starter/Pro changes apply to
the existing subscription with quantity fixed at one, billing anchor unchanged and
Stripe create_prorations behavior. Actual charge timing, credit application and
payment confirmation must be disclosed before the customer commits.
Current S2 configuration has no scheduled-change conditions. Do not publish a
promise of next-period downgrade or immediate cash refund of a credit balance.
[OWNER DECISION: immediate versus scheduled changes, collection of proration invoices,
credits, grace, failed-upgrade behavior, consumed allowances and reset boundaries.]
The hosted upgrade/downgrade/proration tests remain pending.

## Payment failure and support
[OWNER DECISION: retry schedule, grace period, notices, access restriction,
reactivation and unresolved billing support.] Recovered subscriptions should use
current authoritative status; a delayed failure event must not incorrectly revoke
recovered paid access. State-based rules must match the approved policy.
[OWNER VERIFY: independent BuyerMatch billing entry point and support contact.]
No policy choice in this draft enables Checkout, sends email or changes Stripe.
