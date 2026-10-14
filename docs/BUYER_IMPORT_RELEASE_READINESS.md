# Buyer import release readiness — 2026-10-14

Decision: **GO for a controlled Preview release candidate; NO-GO for an immediate full Production CSV import.** Deployment still requires owner confirmation. No deployment, real buyer upload, Production query, or Production mutation was performed in this verification run.

## Verification

- Full automated suite: 263 passed, 0 failed (includes BuyerMatch suites).
- TypeScript and production build: passed (`npm run build` runs `tsc -b` first).
- Lint: 0 errors, 93 warnings. Build retains the large JavaScript chunk warning.
- Local browser acceptance previously passed: eight synthetic profiles saved; duplicate re-import identified eight duplicates; one reviewed merge left eight profiles and zero duplicate groups. Mobile single-scroll layout, keyboard scrolling, and selections across 50-profile pages/filters passed. No repeat of those completed sequences in this final release-review pass.
- Persistence tests run the actual import handler against disposable PGlite PostgreSQL with synthetic accounts. They cover blank protection, explicit updates, suppression, workspace isolation, duplicate conflicts, simultaneous different updates, simultaneous first inserts, and separate mandates.
- Final fixes additionally cover sparse reviewed edits retaining import protection, email changes retaining the same profile's phone, and missing buyer types remaining blank after API hydration.
- Local cached profile edits now use the API's persisted result rather than reapplying blank inputs or rejected eligibility changes.

## Consolidated CSV (read-only parser audit)

| Measure | Result |
| --- | ---: |
| Rows / valid emails / unique normalized emails | 3,049 / 3,049 / 3,049 |
| Duplicate emails in this file | 0 |
| Re-import duplicate flags against the same parsed profiles | 3,049 |
| Source mandates / retained mandates | 3,054 / 3,054 |
| Profiles with multiple explicit mandates | 2 |
| Do-not-email records | 1,511 |
| Phone-identity conflict profiles | 22 |
| Original source fields preserved exactly | All |
| Companies populated / genuinely absent | 14 / 3,035 |
| Phones populated / genuinely absent | 84 / 2,965 |
| Profiles with structured markets | 1,501 |
| Profiles with extracted purchase budgets | 97 |

Preservation is not a claim that every free-text condition can be structured reliably. Ambiguous criteria remain available for review; ARV, all-in limits and purchase prices are separate. Every newly parsed profile starts inactive, unverified and ineligible for outreach. The private BuyerMatch network is not automatically populated or activated by this importer.

## Phone investigation

Five shared-number groups contain 4, 4, 10, 2 and 2 profiles. Each has distinct names and emails, no populated company fields, and an identical ten-digit phone string within the group. None is resolved by country-code normalization, formatting differences, or an obvious repeated-digit placeholder. The file cannot establish whether these are shared business numbers, aliases, or source mistakes. **Do not merge by phone alone.** Preserve the records and review identity evidence independently.

CSV record numbers (header is row 1):

- Group 1: 17, 501, 558, 2699.
- Group 2: 58, 1068, 1090, 2031.
- Group 3: 788, 914, 973, 1025, 1078, 1101, 1232, 1899, 2157, 2238.
- Group 4: 885, 1245.
- Group 5: 1011, 1129.

These 22 profiles are blocked for identity review rather than automatically merged. Email uniqueness proves distinct identifiers, not necessarily distinct people. No existing Production buyer inventory was accessed, so overlap with that inventory remains to be checked through the approved review workflow.

## Import/edit separation and safeguards

- Import requests fill missing fields, preserve nonempty existing facts, retain original source records and union mandates. Stable workspace/email IDs prevent concurrent importer inserts from creating two profiles; conditional updates retry against the latest stored row rather than lose concurrent fields or suppression.
- Explicit `reviewed-update` requires an existing ID in the authenticated workspace. Nonblank reviewed replacements are allowed; blanks cannot erase saved facts. Conflicting email ownership is rejected. Existing imported records retain import protections even if an edit omits `importVersion`.
- Suppression/denied consent cannot be lifted by re-import or sparse edit. Unverified/inactive imported contacts fail the imported matching eligibility checks. Import approval initiates no invitations, payments, or private-network enrollment.
- BuyerMatch server distribution, billing, token/privacy code, migrations and environment configuration were not changed. All BuyerMatch tests remain part of the full suite.
- Local harness and fixtures are separate test-only files, bound to localhost with self-only network policy. No production bypass was added. Real CSV contents and environment secrets are not part of these changes.

## Remaining release risks and gates

1. Hosted Supabase/PostgREST behavior, existing RLS/triggers, plan capacity enforcement, and deployed function timeouts still need a synthetic Preview smoke test; PGlite does not certify those hosted controls.
2. New inserts are batched; existing-profile merges use conditional updates per profile. Do not approve a thousands-record re-import before checking hosted duration. A failed batch may have saved earlier rows; the API reports this and instructs refresh before retry. This is not an all-or-nothing transaction for the entire file.
3. Uniqueness protections cover this importer. They are not a new database-wide uniqueness constraint across every legacy writer. Pre-existing ambiguous email duplicates fail closed for review.
4. Resolve the 22 shared-phone identities and review ambiguous mandates before the full list. Do not infer consent or verification from source claims.

## Controlled release and rollback

1. After explicit approval, commit the reviewed files and deploy that exact candidate to Preview; repeat only hosted synthetic import/edit/re-import checks, including blank fields, suppression, concurrent updates, account isolation and capacity.
2. Record the current Production deployment ID/SHA and verify a known-good rollback target before any approved promotion. This change has no schema migration or environment change.
3. After a successful Preview and separate deployment approval, promote the exact candidate. With separate data-import approval, test 5–10 real profiles and inspect full persisted criteria/mandates before considering the remainder.
4. If regression appears, stop imports and outreach involving the new batch, capture affected IDs, and restore the previous deployment. Deployment rollback does not undo buyer data. Restore reviewed before-images of updated records only with explicit approval; do not blindly delete buyers or discard the working tree.

Evidence: ignored `test-artifacts/buyer-import-full-tests.txt`, `buyer-import-build.txt`, `buyer-import-lint.txt`, `buyer-import-csv-audit.json`, and prior local browser screenshots. Working-tree changes remain uncommitted and preserved.
