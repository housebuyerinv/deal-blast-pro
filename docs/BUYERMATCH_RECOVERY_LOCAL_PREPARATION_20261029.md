# Recovery verification preparation — local completion checkpoint

October 29, 2026. $0 only. **Actual preserved-cohort readback: NOT_RUN. Original-key compatibility: NOT_VERIFIED. Independent encrypted recovery: NOT_VERIFIED.** No original key, rejected custody file, hosted identity or provenance payload was accessed, exported, changed or replaced.

## Completed local tools

- Existing `scripts/testing/s2-secret-recovery-core.mjs` performs strict AES-256-GCM authentication/decryption and normalized-email HMAC equality in an explicitly authorized private custody workflow. It remains unchanged and blocked on legitimate custody/execution authority. Correct key length or environment-name presence never proves original-key compatibility, and this tool must not be used to install secrets under the current directive.
- Existing `scripts/testing/recovery-coverage.mjs` validates complete coverage categories and exact file checksums supplied by a private reader. Its result explicitly does not prove archive encryption, key custody, OS isolation or full restore. Existing synthetic logical-restore tests are retained, not repeated.
- New `scripts/testing/recovery-envelope-audit.mjs` fills the **key-free envelope/integrity inventory** gap. It has no filesystem, environment, network, provider, key or decryption access. A future separately authorized private invoker supplies the selected encrypted fields; no CLI or credential adapter was introduced.

The key-free audit requires each selected row's exact ID, synthetic flag, identity hash, identity ciphertext and nullable source ciphertext. It validates canonical base64, three-part AES-GCM envelope shape, 12-byte IV, 16-byte tag, nonempty bounded opaque body, expected 223 identities/nine provenance payloads and duplicate/field/type constraints. Its aggregate fingerprint preserves exact encodings/hash strings and is independent of row order. Readback comparison refuses missing/extra records, malformed payloads, hash normalization, changed flags or changed ciphertext.

The eight historically reported nonstandard hashes are **not repaired, normalized, ignored or accepted as canonical HMACs**. If present, the audit reports only an aggregate count and `ORIGINAL_HASH_COMPATIBILITY_REVIEW_REQUIRED`. Even canonical envelope/hash shapes yield `KEY_COMPATIBILITY_NOT_TESTED`, never a recovery PASS. A syntactically valid ciphertext can still fail GCM authentication; preservation of ciphertext does not establish decryptability. The audit fingerprint covers only its explicit selected fields, not the whole database, Auth, Storage, schema or backup.

Output contains bounded status/counts and an aggregate ciphertext-preservation fingerprint, no per-row IDs, identity hashes, ciphertext, keys or plaintext. Invalid input errors contain fixed generic codes. Caller must still establish authorized private input acquisition/custody, canonical encrypted storage, stable reads and no logs/spills. The library does not manufacture those assurances or license any original-cohort read.

## New focused verification actually executed

`node --test tests/buyermatch/recovery-envelope-audit.test.mjs`: **8/8 passed** using 223 freshly generated in-memory synthetic envelopes, nine synthetic source payloads and eight deliberately nonstandard synthetic hashes. Tests include canonical format, mutation-free input handling, non-disclosing reports/errors even after unexpected private-reader failures, reorder-stable fingerprints, authenticated-format limitations, payload/hash/flag drift, record-count changes, duplicate/missing/invalid fields, bad base64 pad bits, malformed/oversize IV/tag/body, and empty provenance. Disposable synthetic keys are generated in memory and cleared; no original secrets are loaded.

Scoped ESLint (`npx --no-install eslint --no-ignore scripts/testing/recovery-envelope-audit.mjs tests/buyermatch/recovery-envelope-audit.test.mjs`) covers the new library/test, explicitly including the normally ignored preparation script. No completed application/billing/full-stack suite is repeated. No success for the real preserved cohort or independent restore is claimed.

## Exact remaining blockers and owner handoff

| Requirement | Why local preparation cannot complete it | Minimum future external action |
| --- | --- | --- |
| Original key/capability compatibility | No trusted, accessible original identity/response/worker secret custody has been established; old rejected sources remain blocked | Owner identifies availability/provenance through an approved private custody mechanism; never sends values in chat/GitHub. A separately approved private invoker may run full-cohort GCM/HMAC and original response/worker provenance checks, with aggregate-only results. No replacement keys. |
| Nonstandard hash reconciliation | Historical eight nonstandard values cannot be authenticated or explained from format alone; no protected rows were inspected here | Authorized private read-only cohort reconciliation establishes original semantics/provenance for all 223 identities/nine payloads. Preserve anomalous values and bytes; do not update them merely to make a tool pass. |
| Independent encrypted recovery | Synthetic logical tests do not establish separate hardware, encrypted working storage, independent offline key custody or real full backup/restore | Owner identifies already-owned suitable $0 resources and explicitly approves any protected acquisition/restore scope. No spending, formatting, export, key movement or hosted changes inferred. |

## Preservation-first verification order, not execution authority

1. Independently verify private custody, exact input scope, stable read-only acquisition and encrypted storage/spill controls before any original data enters a verifier. No rejected files, browser credentials, runtime export or recursive secret search.
2. Keep immutable original encrypted evidence and its existing non-sensitive preservation record. Future authorized before/after envelope audit must include the whole selected cohort, without filtering nonstandard hashes. Never interpret structure/integrity status as successful decryption.
3. With independently trusted original keys, privately verify GCM tags, plaintext structure and original HMAC behavior; no plaintext/key logging. Response/worker key originality requires independent provenance, not a worker invocation. Any mismatch stops; no data repair or key regeneration.
4. Under separately approved native recovery scope, verify consistent DB/Auth/roles/RLS/configuration coverage plus Storage metadata and bytes, encrypted archive integrity, independent key challenge, complete isolated restore and permissions/integrity readback. See `R2_NATIVE_LINUX_RECOVERY_PLAN.md` and `R2_STAGING_RECOVERY_RUNBOOK.md`.
5. Rollback means retain originals and encrypted evidence, stop the verifier, preserve sanitized failure status, and leave original environments unchanged. There is no automatic overwrite, hosted migration, key installation or destructive cleanup path in the new library.

Recovery preparation tooling is locally complete for this scope. Original-data recovery and launch remain blocked; unrelated local application work may continue. No owner action is requested now unless they choose to unblock the protected recovery lane.
