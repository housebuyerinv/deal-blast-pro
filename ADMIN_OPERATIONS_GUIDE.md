# Admin Operations Guide

## Daily checks

Review new deal and buyer submissions, failed notifications, Property Intelligence safe error categories, billing exceptions, and recent conversions. Confirm inventory counts against converted submissions. Never diagnose by copying secrets or raw provider responses.

## Owner Preview

Owner Preview is a local UI simulation. Select a plan to verify its navigation, limits, calculators, and upgrade messaging. Exit Preview to restore Owner Admin access. Preview must not write plan assignments, contact Stripe, consume lookup credits, or change the owner account.

Test lifecycle states separately: Trial, Past Due, Canceling, Canceled, and Suspended. Destructive billing controls remain simulated in Preview.

## Submission recovery

The conversion RPC is idempotent by original submission ID. Retry the same submission; do not create a manual replacement or delete the source. If a converted submission has no inventory row, apply the approved durable-inventory migration/backfill and record row counts before and after.

## Incident response

1. Disable the affected provider or feature with its server environment switch.
2. Redeploy a Preview and reproduce with safe diagnostics.
3. Record timestamp, route, HTTP status, safe category, deployment SHA, and request/support code if present.
4. Roll back the application deployment when safe; prefer a forward-only database repair migration.
5. Notify affected users without including private deal, buyer, payment, or provider data.

Never reset Supabase, edit migration history, expose keys, cancel real subscriptions, or send a test blast to real recipients.
