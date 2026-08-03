# Public Release Checklist

Release only from a reviewed commit on a non-`main` branch. Production promotion requires every P0 item below to pass on the exact Preview deployment.

## P0 gate

- [ ] `npm test`, TypeScript, targeted lint, and `npm run build` pass.
- [ ] Preview commit SHA matches the reviewed Git commit.
- [ ] Required Supabase migrations are applied in order; no reset or history rewrite.
- [ ] New account, login, logout, password reset, and deactivated-account denial pass.
- [ ] Owner Preview enforces the selected plan routes and never changes billing.
- [ ] Public deal submission loads for the workspace reviewer and conversion creates exactly one durable inventory deal.
- [ ] Inventory survives refresh and appears in a second authenticated browser/device.
- [ ] Buyer import, duplicate prevention, suppression, matching explanations, and capacity limits pass.
- [ ] Blast consent and suppression gates pass using simulation only; no live blast is sent.
- [ ] Geoapify autocomplete, normalized selection, manual fallback, and attribution pass without exposing a key.
- [ ] Property Intelligence manual load, cache behavior, safe errors, and kill switch pass without logging provider payloads or keys.
- [ ] Free, Starter, Pro, Agency, and Enterprise pricing/limits agree across public and app surfaces.
- [ ] Trial, Past Due, Canceling, Canceled, and Suspended access states are verified.
- [ ] Stripe controls use test/simulated behavior during QA; webhook signatures and idempotency are verified.
- [ ] Terms, Privacy, Refund Policy, Acceptable Use, Security, and Contact pages are reviewed by the business owner/counsel.
- [ ] Mobile navigation, keyboard operation, focus visibility, labels, and core contrast pass.
- [ ] Vercel Runtime Logs show no unexplained errors and secrets are absent from browser responses.
- [ ] Rollback commit and database rollback/forward-fix owner are recorded.

## Promotion

Record Preview URL, deployment ID, commit SHA, migration list, tester, date, and any accepted exceptions. Stop and obtain owner approval before promoting Production.
