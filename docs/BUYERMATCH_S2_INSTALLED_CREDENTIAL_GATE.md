# Installed S2 credentials: verification and next execution gate

Owner private-entry completion is recorded; no secrets were read or reused from
transcripts. No credential re-entry or rotation is requested for S2 testing.

## Independently verified configuration

- Stripe account `acct_1UTRcRL6efr9LhPI`, TEST only.
- Exactly one endpoint appears through both legacy and v2 inventories (same ID,
  not duplicate destinations): `we_1UTTc1L6efr9LhPICbZjgCHA`, disabled,
  `events_from=[@self]`, snapshot, exact staging Supabase webhook URL, approved
  11-event allowlist. No Production/MoneyMap/Connect/organization forwarding.
- Installed endpoint version is **2026-09-30.endive**, not the previously proposed
  **2026-08-26.dahlia**. Checkout SDK remains pinned to Dahlia; the Edge REST
  helper inherits the account default. No provider version was changed. Endive is
  a breaking release, so version equality/complete compatibility is NOT claimed.
  A representative locally signed Endive-shaped invoice with
  `parent.subscription_details.subscription` and current item-period fields passes
  independent BuyerMatch reconciliation; this is not a captured hosted payload.
  Validate actual invoice/subscription/refund shapes in the authorized hosted run.
- Supabase secret metadata records the new signing secret before the restricted
  API key (21:47:31Z then 21:49:01Z on 2026-10-22). Values shown by CLI listing are
  provider SHA256 fingerprints, not plaintext credentials. Metadata is not proof
  of key permission or exact account ownership in a running function.
- Dedicated Vercel `prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl` has
  `BM_STRIPE_TEST_SECRET_KEY` as sensitive/write-only, Preview ONLY, no branch
  override. Existing deployed Preview has not been rebuilt to receive it.
- `BM_STRIPE_PORTAL_CONFIGURATION_ID` is absent from Vercel configuration metadata.
  Install the non-secret value `bpc_1UTRxYL6efr9LhPIA0rP1HOJ` Preview-only during
  the next authorized configuration batch; do not recreate the portal.
- Some existing S2 configuration records cover Preview AND the isolated project's
  Production-labelled placeholder. Split records or use documented Preview-only
  overrides before alignment; never overwrite both targets. No such edit occurred.

## Prepared catalog update

`scripts/buyermatch-s2-catalog.sql` is DML only and has NOT been run remotely.
The executor must independently bind to staging `qxhhlprentrufobpcgna`; SQL alone
cannot attest a project ID. Only the two approved BuyerMatch versions may change:

| Version | Existing shared TEST price | New S2 price | Limits preserved |
|---|---|---|---|
| buyermatch-starter-v1 | price_1UNYGnLwKAFEsDh6JIB6CIk8 | price_1UTRdfL6efr9LhPIchNeE7u1 | 20/10/25 |
| buyermatch-pro-v1 | price_1UNYGxLwKAFEsDh6WlRlDegP | price_1UTRdrL6efr9LhPIpYKIYIyd | 50/25/50 |

Transaction locks both rows, checks approval/product/limits/exact previous price,
changes exactly two references and permits a no-op retry only when both already
match. Mixed/foreign/drifted states abort. Unapproved `staging-only-v2`, historical
checkouts, entitlements and receipts are untouched. Five local PGlite tests cover
success/retry, foreign price, partial mapping, allowance drift and approval drift.
They do not prove hosted concurrency or schema compatibility. Before execution,
record old values and verify exact schema/RLS/grants; rollback only these two price
references using exact new-ID predicates in one transaction, after re-pausing and
confirming whether any new S2 subscriptions/checkouts require reconciliation.
Never roll back credentials to shared-account keys or erase historical fixtures.

## Minimum next approval batch: paused configuration and Preview

1. Approve staging-only catalog DML and review/apply the existing same-subscription
   tier-change migration under a separate schema-change gate. No Production DDL.
2. Align ONLY S2 Preview non-secret configuration: portal ID, stable
   `BM_APP_ORIGIN=PUBLIC_APP_URL=https://dbp-registration-s2-preview-housebuyerinv.vercel.app`,
   versioned-agreement requirement after approved document verification, exact
   staging URL/ref. Preserve registration paused, Checkout=false, live billing and
   delivery=false, mock distribution and Supabase webhook-processing gate=false.
3. Approve exact reviewed integration SHA deployment to protected S2 Preview only;
   verify Preview classification, protection, staging bindings and source before
   moving only the S2 alias. Existing deployment cannot prove a newly saved Vercel
   secret's runtime behavior. No new public debug endpoint or bypass secret.
4. Prove secret-safe runtime account access through approved read-only provider
   operations using the installed restricted key, and inspect the key's real grants
   privately without key-bearing output. Preview needs Checkout Sessions read/write,
   Prices read, Subscriptions read, Customer Portal read/write plus only documented
   transitive permissions; webhook needs Subscription/Invoice reads for BuyerMatch.
   Connector access is NOT evidence that these particular runtime keys have those
   permissions. A 403 must identify the missing operation without exposing its key.
   Write permissions cannot be fully proven without later approved test writes.
   Opaque Supabase service-key provenance also remains an actual-runtime gate.

Keep disabled endpoint and processing/registration/Checkout gates throughout this
batch. Do not relax the gate merely to run a provenance check. Any additional
runtime instrumentation requires review; metadata alone is not an attestation.

## Separate hosted test window

Only after configuration/runtime gates and explicit test authorization: controlled
synthetic identities and capture-only email; enable S2 processing/endpoint delivery
and signup/Checkout only for that window. Test both tiers, existing CRM add-on,
confirmation, portal ownership, actual Endive billing shapes, payment negatives,
duplicate/delayed events, tier changes, cancellation, consent, entitlements and
allowances. Restore pauses afterward; inspect pending retries before enabling.
No live customer, Production, MoneyMap or payment access is authorized.

Current status: metadata/target verification PASS; actual installed-key permissions,
runtime provenance and hosted billing compatibility PENDING. PR stays DRAFT.
No percentage increase is claimed from installation metadata or local tests alone.
