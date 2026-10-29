# Isolated BuyerMatch billing implementation checkpoint

Status: LOCAL VERIFIED; HOSTED CAMPAIGN NOT AUTHORIZED; PUBLIC RELEASE NO-GO.

Approved app base: `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc`.
Reused operator library base: `ce3bc2f25402e918289ee857441f2175fdf64a1c`.
Derivative identity: `buyermatch-isolated-billing-v1`; exact derivative SHA is the commit containing this checkpoint, not the approved app SHA. No push or merge.

## Completed local scope

New `isolated-billing/` profile, build overlay, bounded API, signed webhook gate, fresh-only schema/fixtures, direct private provider adapter, and detached watchdog. Original app/S2 operator files are unchanged. See the directory README for executable build/runtime procedures and private-custody requirements.

Focused integration: **14 passed, 0 failed**. Includes actual approved Checkout handler, signed webhook and real approved billing SQL in a fresh local PGlite database; Pro 50 analyses / 25 distributions / 50 buyers; unchanged synthetic CRM; malformed/foreign bindings and events; duplicate/replay/counter limits; ownership/pre-existing rejection; one-shot unknown-cancellation handling; cleanup after evidence-write failure; real separate non-probe Node process surviving primary exit and completing fixture readback/cleanup. Full frontend and API/receiver/operator artifacts built successfully. TypeScript and scoped lint passed. Existing Vite chunk-size/mixed-import warnings are nonfatal. No unrelated application acceptance suite repeated.

Windows restricted sandbox initially denied the detached fixture's loopback connection (EACCES). The same focused test passed with reviewed local loopback access. The derivative build excludes the old custody module's probe CLI; bundling must not execute that old entry point.

Provider responses in tests are synthetic wire fixtures, **not** evidence of real hosted cancellation or hosted Auth. Local cleanup explicitly reports `hostedCancellationVerified: false`. No hosted resources, credentials, identities, keys or buyer records were copied or changed. New private hosted custody and provider permission/readback remain execution prerequisites.

## Verified capacity and unresolved resource decision

- Existing Vercel team was read-only verified as Hobby/OWNER. [Hobby terms](https://vercel.com/docs/plans/hobby) restrict use to personal, non-commercial purposes. Eligible no-additional-cost commercial staging capacity is **not established**. This adapter supports Vercel; the profile's node option fails hosted preflight instead of pretending another provider is integrated.
- Read-only Supabase inventory showed two active and one inactive projects. No unused free-project entitlement was established; inactive projects are not authorized for reuse. [Supabase pricing](https://supabase.com/pricing) limits Free to two active projects and lists additional paid projects separately. A fresh independent project's eligible $0 capacity remains unverified.
- Connected Stripe account enumeration returned only the original S2 TEST account; the adapter rejects it. This does not prove that no other sandbox exists or can be created. [Stripe's supported sandbox procedure](https://docs.stripe.com/sandboxes/dashboard/manage) allows up to five, subject to role/visibility. An owner must establish separate sandbox capacity/role and authorize creation with **Copy live account disabled**. No sandbox or Stripe objects were created.

Therefore there is no verified $0 hosted resource set to approve yet. Owner decision required: identify commercially eligible existing hosting entitlement and independent database capacity within $0, or explicitly decide a separate cost ceiling/provider plan (no purchase requested or performed). Also establish availability/authority for one fresh Stripe sandbox. No cost is inferred from inactivity or connector absence.

## One future authorization package, once capacity is resolved

Bind exact new hosting project/team/origin, synthetic Supabase project/owner, Stripe sandbox/account/price/disabled endpoint and final derivative/operator SHA. Authorize fresh-only schema/fixtures, supported private Auth/credential installation, no more than two protected immutable Previews, and the original <=30-minute/$0-real-spend/one-$119-TEST-Checkout/one-customer-and-subscription/twelve-signed-delivery campaign. Include independent receiver pause, session expiry, only durably owned subscription cancellation/readback and owned Preview/alias cleanup. No live-copy, original resource reuse, Portal/lifecycle operations, delivery or public registration. This package is **not** an execution authorization in this checkpoint.

Even a successful future isolated hosted campaign cannot establish original-S2 encryption-key compatibility or independent recovery of the preserved 223 identities/nine provenance payloads. Original-key recovery, independent recovery validation, original hosted acceptance, legal/commercial approval and Production cutover remain separate owner-controlled release gates.
