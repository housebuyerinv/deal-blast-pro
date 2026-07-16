# Billing Notification Responsibilities

Internal implementation note. Do not surface this copy in customer-facing settings.

Stripe sends standard billing-provider messages when configured in Stripe Billing, including receipts, card failure messages, payment authentication, invoice availability, expiring-card notices, and renewal reminders.

Deal Blast Pro sends product-specific account notices, including access restrictions, past-due timeline notices, scheduled downgrades, completed downgrades, access restoration, and workspace deactivation notices.

Customer-facing settings should describe optional billing preferences without exposing webhook routing, provider responsibility, or internal event names.

Community usernames will be introduced when Deal Blast Pro Community profiles launch.
