# BuyerMatch offline release handoff — no execution

Owner spending authority is **$0**. No hosted operation, push, merge, migration, deployment, public signup, Stripe campaign or distribution is authorized. This packet completes the locally executable source reconciliation; it is not a replacement authorization packet or a request to buy infrastructure.

## Concrete artifact

`scripts/testing/buyermatch-source-envelope.mjs` constructs `release-evidence/2026-10-29/APPLICATION_SOURCE_ENVELOPE.json` exclusively from committed Git blobs at application `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc`. It does not read dotenv, private runtime files, the modified historical forward manifest or provider settings. It makes no network requests, executes no SQL and emits no executable provider commands.

The envelope contains 354 allowlisted source-file paths, exact Git blob IDs/byte lengths/SHA-256 values, application tree, and a deterministic inventory digest. It confirms the app source paths are unchanged in the isolated derivative `f88503f78c105ccc3d39d4d2b7ed8263f128e85b`; the derivative is identified separately rather than relabelled as the approved app. Hashes use committed bytes, so Windows newline conversions do not redefine the release bytes. The CLI creates the evidence file exclusively; it refuses to silently overwrite a previous packet.

## Actual compiled artifact

The retained older `dist` directory had no reliable exact-68c5 provenance, so this lane performed **one justified offline build**, not another application acceptance run. `scripts/testing/buyermatch-offline-artifact.mjs` extracts an allowlisted exact-Git68 archive into a new ignored cache directory and starts a clean child environment. No dotenv files or inherited provider keys are loaded; frontend public bindings are deliberately invalid build-only placeholders. Build attestation is explicitly disabled. The approved frontend Vite configuration and five Node22-targeted bundles (four BuyerMatch HTTP handlers plus the shared platform handler) built successfully. Existing chunk/import warnings remain nonfatal.

`release-evidence/2026-10-29/APPLICATION_OFFLINE_BUILD.json` records exact source/tree/archive/output hashes and the ignored relative output directory. Fourteen compiled output files are retained, with inventory digest `3a08100dd189e91bbc26399166e858ee08ea82688293da8bb2a971b3a013e809`. This is a real compiled **verification artifact**, not a source-only manifest. Its unbound synthetic configuration must not be deployed; a future approved target requires its own exact public bindings/attestation/configuration and resulting artifact verification. No current hosted runtime or release authorization is implied. Binary output and extracted source remain ignored rather than committed.

This replaces an exact-current-source **handoff gap**, not the old historical source-packet implementation. `s2-current-source-packet.mjs` remains unchanged and tied to its old review pins. Do not execute its historical commands for the current source. The existing dirty `BUYERMATCH_FORWARD_RELEASE_MANIFEST.json` is preserved, not incorporated as current execution authority.

## Runtime compatibility and activation

Production-path state: **IMPLEMENTED_GUARDED_NOT_HOSTED_VERIFIED_UNBOUND**.

The staging helper deliberately rejects Production environment/database/origin; that is an isolation guard, not a universal application gate. `billing-config.js` has an independently guarded Production billing path; `response-config.js` validates Production responses; `production-delivery.js` validates real delivery. The HTTP distribution route selects the Production path when appropriate. The dedicated S2 billing-window guard returns outside S2, retaining Production's separate policy. No guard was relaxed or new activation flag invented.

The envelope verifies presence of the existing independent gates by static committed-source inspection and records prospective Production paused overrides, with delivery mode **disabled**, not the staging-only mock mode. These checks are not runtime acceptance. The template is unbound and cannot attest real provider values, live billing capability, redirects, legal versions or deployment readiness. Stored provider flags are not effective immutable runtime evidence. Future target-specific execution must verify exact Auth URL/redirect allowlist, frontend/server database match, project/origin, approved key custody, service-only privileges, signing destination, and deployment-level OFF overrides before any routing. No original secret values belong in this packet.

## Migration, monitoring and rollback

The current later-source inventory includes exact hashes for buyer self-service `20261026175709`, deal activity `20261028025423`, criteria version `20261028025900`, and server-function permissions `20261028031838`. They are inventory, not an automatic Production order or proof of current hosted history. Existing S2 private-intake SQL must not be replayed. Retain the historical weaker tier-change source but do not replay it when reviewing final completed-Checkout guards. Never fabricate migration-history entries or use blanket `db push`.

Before any separately approved release, reconcile real ledger/prerequisites/function dependencies/schema, retain complete recovery and custody evidence, and authorize only exact reviewed SQL bytes. Existing local migration/RLS/rollback evidence remains valid for its tested synthetic baseline; it does not prove Production equivalence. Every new migration would need its own affected rehearsal.

Existing application error projection and sanitized logging remain the monitoring implementation. The handoff needs deployment-specific owner access to runtime errors and release evidence before execution; no paid monitoring integration is needed or enabled by this packet. Preserve only non-sensitive identifiers/statuses in published evidence. A provider log response is not permission to expose raw request payloads or credentials.

Rollback keeps registration/Checkout/delivery/response pauses, restores only an approved containment route, and retains additive guards/audit/proof tables. Do not restore vulnerable signup, weaker SQL, broad browser grants or obsolete encryption material. The original aliases, fallback, S2 records, Production and MoneyMap stay untouched now.

## Evidence and genuine external blockers

Retain existing real local full-stack PASS, migration-role/rollback evidence, successful TypeScript/lint evidence and 14 isolated billing/operator checks. No application acceptance suite was repeated. The one exact-source build above closes the missing retained-artifact provenance gap. The new source-envelope checks verify committed hashes, all four later sources, static independent Production gate presence, fixed source selection and non-execution/activation boundaries; artifact-boundary checks verify credential/environment stripping and output confinement. Scoped lint uses `--no-ignore` so the new tooling actually receives rules.

Remaining requirements are external execution/approval, not a demonstrated core-code omission: original-key custody/compatibility and independently verified encrypted recovery; legal approvals; hosted billing/provider acceptance; fresh target bindings/schema/redirect verification; explicit migration/deployment/cutover/public-activation authority. No current authority allows those hosted actions. No immediate owner technical relay or new resource decision is requested.

**Public release remains NO-GO.**
