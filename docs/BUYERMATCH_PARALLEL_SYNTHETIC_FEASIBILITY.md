# Parallel synthetic acceptance environment — feasibility only

Assessment after `78a67fd`. No creation/resume/pause, key generation, provisioning,
database write/migration, deployment, payment/event, routing or billing change.
Only project/organization metadata, read-only dashboards, documentation and local
source were inspected. No Production/MoneyMap project data was opened.

**Result: architecturally feasible; not currently executable at $0 while keeping
both active Supabase projects intact.** This is not a new feature milestone.

## Verified resources and cost boundaries

| Resource | Actual evidence | Feasibility |
| --- | --- | --- |
| Supabase | Owner organization Free; Production and original S2 both ACTIVE_HEALTHY. Create form explicitly blocks owner at 2 active Free projects | No new free hosted backend slot. No pause/delete/upgrade authorized |
| Old QA project | `bwlreupczckklrxdsdcj`, INACTIVE | Not established empty/disposable. Resume is a mutation and would require active capacity; do not repurpose |
| Additional Supabase organization | Limit spans organizations where owner/admin | Not a quota workaround; no new organization/account requested |
| Supabase branch | Paid usage, not included Free; documented Micro starts $0.01344/hour plus applicable usage | Incompatible with current $0 budget. No quote/branch requested |
| Vercel | Actual owner dashboard: Hobby, 5 projects; documented cap 200. Connector returned only 1, so it is not a complete inventory | Project-count headroom only; build/runtime quota and Hobby eligibility for commercial development remain unverified. No project reserved |
| Stripe | Existing dedicated S2 TEST sandbox/catalog/portal evidence retained; docs support separate sandboxes and simulated payments without real funds | Prefer separate sandbox to leave original S2 billing unchanged; actual extra sandbox capacity, account-specific cost/authority not verified |
| Local full-stack alternative | No docker/podman command found in current Codex PATH. Owner previously reported no spare Linux/external storage | No verified substitute for hosted Auth/Storage/webhook acceptance. No install, Windows recovery restart or tunnel proposed |

The Supabase quota block is observed in the actual create form, not inferred only
from pricing. Existing plan usage shown on the organization overview (not a new
capacity reservation) was 0.42/5 GB egress, 67/500 MB database and 0.02/1 GB files. Free
storage headroom does not create another project slot. No paid quote was obtained;
no upgrade/trial, overage, new-account or billing action is recommended under $0.

## Minimum isolated design if resources are later approved

Use a new backend with its own Database/Auth/Storage/Edge Functions and a new
protected Vercel project/origin, never an extra schema in existing S2. Load only
reviewed schema migrations and newly authored fixtures. No cloning, plaintext
export, Auth migration, original IDs/hashes/ciphertext/consent/POF, or historical
Stripe customer/subscription/session reuse. Keep the old environment unchanged.

Prefer a new owner-controlled Stripe general sandbox with distinct restricted
runtime credentials, signing secret and initially disabled destination. Its
catalog would need separately approved NEW sandbox-local price/product IDs with
the same $59/$119 monthly economics, fixed quantity 1 and reviewed portal behavior.
Existing price IDs cannot be used across accounts. Do not recreate or alter the
original S2 products/prices/portal, receiver, keys or endpoint. If new sandbox
capacity is unavailable, do not silently reuse a shared test/live account or
enable original S2 delivery; a different isolation proposal requires review.

Use fresh independent identity/response/worker keys with private owner custody
only after explicit generation/installation approval. Never derive them from
old keys or treat this as restoration. Pin distinct project IDs, ref, environment
marker, callback origin, catalog, agreements and Stripe context in a new reviewed
packet. Default registration, Checkout, webhook processing, delivery and live
billing to disabled. A new Vercel project's initial Production-classified deploy
must be a separately approved inert credential-free initialization, before any
application Preview. Never reuse the old stable S2 alias or live DBP domains.

### Existing source is not configuration-only ready

`assertStaging` checks frontend/server ref consistency and denies Production, but
the Edge receiver explicitly pins `qxhhlprentrufobpcgna`: simply deploying it with
a different ref will return 503. Owner provisioning, binding, pause-readback and
detached-watchdog helpers also pin old S2 resources. A minimal future reviewed
environment-profile patch and new operator pins are required; do not edit old
operators or weaken their checks to make a new environment appear verified.
This assessment makes no application/guard/schema change and authorizes no patch
deployment. A new reviewed commit would be needed before hosted execution.

## Bounded synthetic-data requirements

- A platform-owner fixture through approved private normal authentication; two
  separate confirmed buyer identities/workspaces for ownership denial; Starter
  and Pro subscriber fixtures plus a separately scoped existing-CRM scenario.
  Reuse those owned fixtures across cases to minimize signups; no rate bypass.
- Clearly synthetic contact details and tiny watermarked POF files, private
  bucket/review/audit evidence, expired/current versions, and synthetic properties,
  invitations, consent fixtures, responses and immutable history. No real buyer
  files, copied identities, old consents or legal-approval claims.
- Capture-only Auth confirmation with no external recipients, normal callback
  access in the protected browser, no token bridge/log output. Do not transplant
  old Auth users/passwords/sessions or claim setup fixtures prove signup lifecycle.
- Apply schema-only baseline plus corrected migrations in a reviewed order, with
  service-only functions, restrictive RLS/grants/Storage and completed-Checkout
  protections intact. Use actual PostgreSQL/Auth/Storage and Stripe-signed events;
  a local mock or static page is not hosted acceptance.
- Preserve Starter 20/10/25 and Pro 50/25/50 boundaries, quantity 1, ownership/CRM
  separation, invoice reconciliation, idempotency and historical evidence. TEST
  transactions/lifecycle/time travel need a newly scoped execution authorization;
  existing old-S2 approvals do not automatically cover new account/ref/customer IDs.

## Security closure and rollback

Before any future test window, prove independent cleanup authority restricted to
the NEW resources and ready even if the controller dies. Confirm distinct signed
webhook/callback destinations and that no original/Production/MoneyMap recipient
can receive new sandbox events. Enable only bounded TEST gates after approval.

On failure, close the NEW destination and receiver, restore all new registration/
Checkout/delivery pauses, and verify503 and protected routing. No original alias
was moved, so ordinary rollback is stop new testing and retain the old contained
environment. Never deploy a weakened fallback, rewrite old ciphertext, merge
identities, destroy the new forensic evidence, or delete a sandbox as cleanup.
Cleanup of newly owned fixtures or resource retirement requires separately
approved scope; test evidence/owned-ID manifest stays sanitized and retained.

## Decision and precise remaining dependency

No hosted resource or key action should be authorized from this assessment yet.
The next prerequisite is approved isolated backend capacity consistent with$0,
or a separate owner decision changing the resource/budget constraint. Do not
pause Production/S2 or delete QA to manufacture capacity. New organizations do
not evade the owner-level limit. Suitable independently controlled existing
infrastructure could be assessed if it becomes available; none is verified now.

A clean synthetic pass could verify the application and new Pro lifecycle, but
**cannot establish compatibility or restore the223 old identities**, their9
provenance payloads or8 nonstandard hashes. Original-key recovery/compatibility,
legal approval, independent complete encrypted restore and Production cutover
remain separate mandatory release gates. **Public release remains NO-GO.**

Evidence: [resource readbacks](release-evidence/2026-10-26/parallel-synthetic-feasibility.json)
and [actual quota gate](release-evidence/2026-10-26/synthetic-environment-free-quota-gate.png).

Sources: [Supabase billing/limits](https://supabase.com/docs/guides/platform/billing-on-supabase),
[branching charges](https://supabase.com/docs/guides/platform/manage-your-usage/branching),
[Vercel limits](https://vercel.com/docs/limits), [Hobby terms](https://vercel.com/legal/terms),
[Stripe isolation](https://docs.stripe.com/sandboxes).
