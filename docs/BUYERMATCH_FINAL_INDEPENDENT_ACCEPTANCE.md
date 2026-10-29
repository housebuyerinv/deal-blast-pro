# BUYERMATCH — FINAL INDEPENDENT ACCEPTANCE PREPARATION

**All currently independent work complete; consolidated hosted acceptance prepared.
Execution remains blocked by the dependencies below. Production remains NO-GO.**

Application baseline: `07466bf8f06254d2dd5f128df7c499c7ee9e9e1c`.
Corrected acceptance/security candidate: `f47bd4d78d8efae425658cba638b15651e1d44f4`.
Neither this candidate nor its new migrations has been pushed, deployed or applied.
PR #2 remains draft. Existing containment, pauses, fallbacks, buyer data and MoneyMap
were not changed. Unrelated working-tree edits were preserved.

## Executed independent work

- Added a permission-only migration for four legacy SECURITY DEFINER functions:
  email-log insertion and the older reserve/finalize/release property-credit RPCs.
  The captured schema grants browser execution; their bodies accept caller-supplied
  subjects without an equivalent caller boundary. This is **historical schema
  evidence**, not a new assertion about current Production permissions or exploitation.
- Source tracing confirms current credit callers use the server admin client.
  Removed the notification logger's anonymous fallback; missing service credentials
  now fail logging closed instead of depending on an unsafe browser-callable RPC.
  Existing server behavior, function bodies and owners are retained by the SQL.
- Actual local SQL tests verify browser invocation denial, unchanged server behavior,
  idempotent permission application and full rollback on missing signatures or
  inherited unsafe authority. The existing BuyerMatch service-only boundaries,
  public validated intake capability and authenticated owner-review predicate remain.
  The migration follows [Supabase function-permission guidance](https://supabase.com/docs/guides/database/functions#function-privileges).
- Added an offline exact-source S2 migration planner. It requires the recorded
  private-intake migration, rejects ambiguous history/source drift, preserves the
  correct four-source order and never authorizes execution from an artifact alone.
- Added the consolidated buyer/subscriber/admin/billing/security/cleanup case
  registry and evidence classifier. Historical/local PASS never becomes current
  hosted verification. A receipt label is not independently authenticated evidence.
- Added a recovery-coverage validator for DB, Auth, roles, Storage metadata AND bytes,
  identities, provenance and configuration. It rereads hashes/sizes and rejects missing
  coverage, corrupt bytes, path traversal, drive paths and case-colliding entries.
- Performed an actual disposable **synthetic logical restore**: Auth links, private
  bytes/checksums, opaque fixture ciphertext/provenance and role denial survived.
  This does not prove native Linux isolation, age encryption, actual Auth/Storage
  service recovery, original-key compatibility or independent custody.
- Verified all four legal draft hashes; approval and publication flags remain false.
  Existing terms/privacy/renewal/refund drafts, buyer/POF addendum and licensing/JV
  decision packet already cover the required review topics; no new legal defaults
  or agreement publication were introduced.

## Key compatibility — blocked, not assumed lost

The three original labels remain `BUYERMATCH_IDENTITY_KEY`, `BM_RESPONSE_SECRET`
and `BM_WORKER_SECRET`. No trusted accessible original source has been established.
This process has none configured, which does not prove absence from provider stores
or an owner-controlled offline copy. Prior supported provider recovery limitations
and owner availability UNSURE remain the relevant evidence; no investigation was
restarted and no rejected credential file or private vault was opened.

The 223 encrypted identities and nine provenance payloads remain preserved. Without
a trusted compatible identity key, decryptability cannot be independently proven.
No replacement, re-encryption, secret installation or buyer-record modification occurred.

## Exact S2 migration sequence — authorization and fresh metadata required

Use the hashes from committed blobs in
`release-evidence/2026-10-27/FINAL_INDEPENDENT_PREPARATION.json`; no blanket `db push`.

1. Revalidate S2 project `qxhhlprentrufobpcgna`, current history, definitions/owners/
   effective grants/defaults, dependencies and unchanged cohort fingerprints.
2. Apply `20261026175709_buyermatch_authenticated_buyer_self_service.sql` once.
3. Apply `20261028025423_buyermatch_deal_activity.sql` once.
4. Apply `20261028025900_buyermatch_explicit_criteria_version.sql` once.
5. Apply `20261028031838_buyermatch_service_function_permissions.sql` once.
6. Verify recorded hashes, intended permissions, browser denial and preserved data.

**Do not replay `20261024000845_buyermatch_private_buyer_intake.sql`: it is already
recorded in S2.** Do not replay bootstrap/default grants, older weaker tier wrappers
or fabricate historical applied entries. The offline planner uses dated October 26
metadata; it is not fresh hosted authorization or a current schema readback.

Each migration is transactional. A failure rolls back its active transaction only;
already committed earlier steps remain. Stop and preserve evidence. After a commit,
retain additive guards/audit records, pause processing and restore only the approved
application routing/fallback. Never drop proof/audit tables, restore broad grants or
retry a non-idempotent migration blindly. Production forward-history reconciliation
remains a separate release operation; the unrelated forward manifest was not edited.

## Final local validation

- One consolidated run: **912 cases, 895 initial PASS, 17 failures preserved**.
  The failures were noncanonical Windows short-name temporary fixture directories.
  Runtime path protections were retained; fixtures now use canonical temporary roots.
- Affected rerun: 55/56 PASS; the remaining failure was a busy test-directory cleanup.
  Added bounded retries only for that verified disposable fixture directory. Final
  operator rerun: **7/7 PASS**. Every initially failed case subsequently passed.
  These overlapping runs must not be summed or described as one 912/912 run.
- Nine new grouped regression cases include actual SQL roles/rollback, real logger
  behavior, migration planning, recovery coverage and synthetic logical restoration.
- Current migration rehearsal: **28 migrations / 333 assertions / 31 private tables**;
  unrelated legacy definitions, records and permissions remain preserved, except
  the four explicitly verified server-only ACL corrections and approved intake changes.
- Frontend TypeScript passed. Application, four server/API bundles and the changed
  notification Edge bundle passed. Builds used `envDir:false`/synthetic public config;
  no credential files were loaded. Existing large-chunk/import warnings remain.
- Full lint: **0 errors, 92 existing warnings**. Affected-file lint: 0 errors.
- **No current hosted acceptance, payment or encrypted restore is claimed.**

## One consolidated owner-dependent decision sequence

| Priority / dependency | Minimum owner action | Environment, cost, limit and success evidence |
| --- | --- | --- |
| 1. Compatible original secrets and normal Pro login | Confirm availability only of a trusted original copy and ability to log in privately. Never send values. If still unavailable, a separate preservation-safe recovery decision is required; this packet does not propose blind replacement or another credential workaround. | S2 only; $0. Compatibility must be proven privately against the preserved cohort before installation. Pro login must be normal, confirmed and independently verified without tokens/cookies in output. |
| 2. One conditional hosted acceptance authorization | Review exact candidate `f47bd4d`, four SQL hashes and scope below; authorize publication, S2-only migration batch, corrected S2 notification function and one protected Preview only when prerequisites pass. | $0 additional cost; one Preview, maximum 30 minutes; no alias move. All processing begins paused; only explicitly approved TEST stages may temporarily open their bounded gates. Independent watchdog and cleanup are mandatory. |
| 3. Legal and operational decisions | Review existing four drafts and buyer/POF/JV addendum with counsel: seller/jurisdictions, renewal/cancel/refund/proration/grace, retention/deletion/hold, consent/disclosure and licensed/managed-service scope. | No publication or acceptance on the owner's behalf. Final exact texts, versions, hashes and approval identities required before release. |
| 4. Recovery resources/custody | Identify suitable already-owned Linux hardware, encrypted working storage and separate owner-controlled key custody when available. No purchase/boot/format/key creation is authorized here. | Current $0 budget; hardware blocked. Age/LUKS binding, native isolation, complete DB/Auth/roles/Storage bytes and independent-key isolated restore must actually pass. |
| 5. Production | Separately authorize reviewed cutover only after all mandatory evidence passes. | No authority granted by this packet. Keep direct containment/history truthful, preserve fallback and verify deployment-scoped disabled overrides before any public activation. |

### Recommended bounded hosted sequence

One approval may cover this ordered campaign, with stage gates and explicit exclusions;
it is not approval to execute it now. Resume supported existing harnesses rather than
new password-transfer helpers. Preserve all 17 paused settings at initial attestation.

1. Fresh identity/provider/protection/permissions readbacks, owner-only attestation,
   normal Pro authentication and legacy Checkout/Portal/credit-pack/trial denial.
   Stop if any prerequisite fails; no payments/sessions during this stage.
2. After separately approved SQL/deployment, owned synthetic buyer/profile/criteria/
   POF/history, cross-account/document denial, owner administration, subscriber
   deal/analysis/quota/distribution-preparation/response/closing cases from the registry.
   No existing buyer binding or ciphertext changes; fixture writes must be run-owned.
3. Only if explicitly included in the approval: one Pro $119 **TEST** activation,
   50/25/50 boundaries and bounded TEST change/cancel/renewal/failure/replay cases.
   Preserve historical Starter success; repeat only corrected behavior. Cap fixtures
   at two run-owned users/customers, one new subscription, eight lifecycle mutations
   and twelve signed event deliveries; stop on unexpected objects or state.
4. Portal lifecycle remains blocked until issued-session containment is independently
   proven. Disabling entry routes/webhooks does not establish expiration of an issued
   Stripe Portal session. No Portal session may be created before this gate passes.
5. Public signup remains paused. Its denial is testable; positive current signup/new
   profile creation is not authorized by merely deploying the candidate. Existing
   unchanged registration evidence may be retained. A positive acceptance window needs
   an explicitly reviewed registration scope; do not bypass the pause with fixture code.
6. Before stage transitions/final deadline, restore all processing pauses; independently
   read Stripe disabled and receiver paused; remove only the exact temporary deployment;
   verify independent absence, fallback/prior deployments, no extra subscription objects
   and unchanged original buyer/provenance/account fingerprints. Mark missing cleanup
   evidence UNKNOWN/FAIL, never successful manual substitute. No automatic hosted retries.

No actual buyer campaign or email is included. Distribution acceptance may reserve
synthetic fixture records, but actual email delivery requires an explicitly named,
owner-controlled capture target, provider isolation and recipient-limited approval.
No live charges, paid infrastructure, Production/MoneyMap changes, secret replacement,
public activation, legal publication or merge is included in the proposed S2 campaign.

## Recovery execution remains a separate gate

Use the existing `R2_STAGING_RECOVERY_RUNBOOK.md` for acquisition/isolation/key custody
and `scripts/testing/recovery-coverage.mjs` only after authorized decryption inside
verified encrypted storage. Its reader must reject symlinks/reparse points and prove
canonical containment. Manifests containing identifiers stay encrypted; public results
are counts/booleans only. Actual Auth/Storage APIs, extension compatibility, sequences,
permissions, wrong-key/corruption rejection and independent custody remain unverified.

There is no defensible new launch percentage. The independent technical preparation
is finished; the remaining work requires trusted custody, private authentication,
explicit hosted authority, human legal decisions or independent recovery resources.
