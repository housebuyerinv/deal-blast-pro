# Plan Entitlement Matrix

This document mirrors `src/lib/planEntitlements.ts` and `src/lib/pricingPlans.ts`; those files are authoritative in code.

| Plan | Monthly | Annual | Buyer capacity | Active deals | Positioning |
|---|---:|---:|---:|---:|---|
| Free | $0 | $0 | 25 | 3 | Core inventory, buyers, and calculators |
| Starter | $47 | $470 | 250 | 25 | Submission, blast, follow-up, and pipeline workflows |
| Pro | $97 | $970 | 1,000 | 999 | Property Intelligence, resources, and analytics |
| Agency | $197 | $1,970 | 2,000 | Expanded team/agency access; release-gated where marked |
| Enterprise | Custom | Custom | 5,000 | Unlimited | Custom onboarding and integrations |

Owner Admin is not a sellable plan. It has operational access and can preview customer plans without changing billing. Past Due, Canceling, Canceled, and Suspended are lifecycle states, not plans; access follows `src/lib/accountLifecycle.ts`.

Any pricing or capacity change must update the two authoritative code modules, public Pricing, onboarding, upgrade/billing surfaces, tests, and this matrix in one review.
