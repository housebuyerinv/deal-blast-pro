# R2 staging recovery rehearsal — gated native-Linux runbook

Planning only, October 23, under PR #2 review 6369522557.
No command in this document has been executed as a restore. No export, new keys,
installation, boot, formatting or provider resource creation occurred.
Custom Windows/VeraCrypt/AppContainer development remains stopped.

## Current resource gate: BLOCKED ON HARDWARE (not failed)

Owner update, PR #2 comment6399297749: no spare Linux machine or external/USB
storage currently available. Do not ask for boot, installation, formatting,
erasure or purchase. Do not move keys or live exports to the everyday Windows
machine as a substitute. The existing$0 plan remains non-executed; other authorized
BuyerMatch work can proceed independently. Minimum future capabilities are listed
in R2_NATIVE_LINUX_RECOVERY_PLAN.md; no new resource is assumed available.

No already-owned native Linux host or suitable separate encrypted media is verified.
Read-only Windows command discovery finds age and ssh, but that is not Linux resource
proof; wsl --list --verbose reports WSL is not installed. Do not install it or restart
Windows isolation work. Owner identification of existing Linux hardware/media is the
minimum resource dependency. No cloud VM/project, paid upgrade, storage purchase or
quota overage; budget remains USD0.

Before any rehearsal, an operator must record host/device identity, ownership,
Linux release, CPU/RAM, free bytes, supported LUKS2 stack, PostgreSQL17/Supabase
extension versions and signed package/image fingerprints. Do not select devices
by enumeration order. Existing data/evidence must remain untouched.
Capacity gate: measured database + Storage object bytes + encrypted archive +
restored database/index/WAL/temp working set + explicit safety headroom. No fixed
2GiB assumption. Unknown sizes or quota/egress costs mean STOP.

## Separate phases and authorization

A. Independently inspect already-owned Linux host/media read-only. No formatting.
B. Separately approve encryption/isolated local disposable fixture setup; owner
   enters secrets privately. Prove synthetic recovery before staging acquisition.
C. Separately approve acquisition of staging qxhhlprentrufobpcgna ONLY after B and
   budget/access/coverage checks. Staging contains Auth/capture tokens and private
   fixture data; it still requires encryption. No new staging accounts or writes.
D. Restore into disposable local infrastructure, never the staging source or any
   hosted project. No Production credentials, DNS aliases, SMTP, Stripe or webhooks.
E. Only a subsequent explicit authorization can permit Production acquisition.
   Staging success alone does not establish complete Production recovery.

Current approval permits preparing this plan, not running B-E. No existing resource
has passed A. There is no owner installation command to run now.

## Coverage manifest and independent verification

| Area | Required acquisition | Restore acceptance |
| --- | --- | --- |
| Provenance/consistency | source ref, exact DB version/extensions, acquisition times/snapshot identity, files/checksums | allowlisted source only; source writes paused by separate approval or reconciled consistent cut; no unexplained count/hash gap |
| Database | schemas/data/sequences/functions/triggers/constraints/indexes, large objects and migration history | critical counts and canonical fingerprints, sequence values, constraints/indexes valid |
| Roles/security | roles/memberships/ownership/grants/default privileges/RLS/policies/search_path | actual allowed and denied role operations, no broadened service execution; owner mapping reviewed |
| Auth | auth.users, identities, required MFA/registration/consent data and custom triggers/policies | counts/relationships plus synthetic local Auth login/session behavior; no real email or OAuth calls |
| Storage metadata | bucket settings, object inventory/owners/policies and custom storage schema objects | exact inventory, private access policy and ownership preserved |
| Storage bytes | each object downloaded separately with bucket/key/size/SHA-256; missing/version-changed objects explicit | independently re-read full bytes, checksums/counts/total size match; local Storage API access denial/allowance |
| Runtime/dependencies | schema/service versions, signed source manifests, platform config with no secret values in report | compatible local services, no source/live endpoint dependency |
| Separately held secrets | owner inventory of Vault/root keys, Auth signing/provider configuration, platform credentials | explicitly RECOVERABLE or MISSING; no assumption SQL dumps contain these |

Supabase database backups omit Storage object bytes; a database-only result fails
coverage. pg_dump does not capture cluster-global roles; use reviewed provider-aware
roles acquisition, not an unqualified pg_dumpall against a managed service.
Supabase-managed auth/storage customizations need explicit coverage, not only public.
Custom database-role passwords may be absent; distinguish an approved isolated test
password reset from recovery of original credentials. Do not reset source passwords.

## Encryption and key custody

Use standard supported LUKS2/dm-crypt working storage on an owner-approved device,
plus age authenticated archive encryption. Owner privately controls passphrases
and recovery identity; no secrets in argv/env, scripts, chat, repo, shell history,
screenshots or journals. No key generation under this task.
Verify actual mount-to-mapper-to-device binding, encrypted at-rest properties and
restrictive identity/ACLs BEFORE sensitive acquisition. Keep every plaintext dump,
manifest with identifiers, PGDATA, WAL, tablespace, SQL, socket, TMPDIR, logs, crash
output and runtime cache on that encrypted filesystem. Unencrypted swap,
hibernation, core dumps or persistent live-media caches fail the gate.

Public age recipient/fingerprint can be recorded; private identity must live in
separate owner-controlled encrypted/offline storage, not beside its only archive.
Independent-copy challenge: remove access to the primary key, decrypt a synthetic
challenge with the separate offline copy, verify full checksum and fresh restore.
Do not claim custody from a copied filename or owner assertion alone.

Use supported streaming tools or encrypted working storage; no plaintext /tmp
export and no unencrypted credentials file. Check every pipeline exit status
(pipefail) and archive authentication before accepting success. Corrupt/truncated
or wrong-key archives must fail. Do not execute decrypted SQL until isolation and
archive integrity pass; restored triggers/functions are executable content.

## Actual isolation gate before restore

Use native Linux network namespaces with no external interface/default route,
physical network disconnection for the restore phase, no forwarded host sockets
or cloud metadata access, and least-privilege runtime capabilities.
Pre-stage verified public binaries/images without customer data. An operator may
configure the isolated namespace before dropping capabilities; database/Auth/Storage
processes must not be able to reconfigure egress. Keep local component communication
inside that namespace only. A network timeout/connection refusal alone is not proof.

Record actual namespace/route/interface/capability evidence; a controlled positive
network probe in a separate disposable control context and explicit access/network
denial in the restore namespace. Do not use a remote real customer endpoint.
No restore until both controls meet reviewed expected outcomes.

Start a fresh compatible PostgreSQL17 cluster with PGDATA/WAL/temp/logs entirely
encrypted, Unix socket inside encrypted storage and TCP disabled for DB-only work.
Inventory cron/pg_cron, pg_net/http triggers, foreign servers/wrappers, logical
subscriptions and background workers before loading data. External consumers must
remain absent/disabled; no outbound network exists even if a restored function tries.
Auth/Storage functional checks require separately pinned local services with synthetic
local signing settings, non-delivering mail and no Production service credentials.
Restoring auth rows in PostgreSQL alone is NOT proof the Auth service works.

## Rehearsal order / acceptance / cleanup

1. Disposable synthetic source with two owners, roles/grants/RLS, Auth identities,
   sequences/bytea/large objects, consent records and private Storage bytes. No hosted
   fixture creation under current no-new-account rule; future local setup approval
   defines this explicitly.
2. Encrypted acquisition + independent coverage manifest; capture tool versions and
   pipeline exits. Missing Auth, grants, object bytes or custody dependency = FAIL.
3. Isolation gate, fresh database/service bootstrap, inspect archive/pre-data ordering,
   restore roles/schema/data/post-data using ON_ERROR_STOP. Do not blanket-ignore
   restore errors, strip all ownership or disable RLS to get green results. Known
   Supabase bootstrap conflicts require an exact reviewed mapping and fresh retry.
4. Compare counts/bytes/checksums; execute actual denied cross-owner and allowed
   own-owner operations, Auth identity/sign-in and private Storage reads. Recreated
   secrets and source-secret limitations are recorded separately.
5. Stop services, unmount safely, remount once and recheck persistence; independent
   offline-key challenge; preserve sanitized evidence outside encrypted storage.
6. Only after synthetic proof and acquisition approval, repeat against a complete
   encrypted STAGING snapshot using isolated local resources. Source remains unchanged.
7. Clean only explicitly owned disposable fixtures after verification; retain evidence
   and encrypted archives. Never delete unknown files, old Windows artifacts or keys.

Retention: seven days after verified secure cutover; review at 30 days if delayed.
Unresolved security incidents/evidence override deletion schedules.
RPO/RTO and any source consistency pause duration require owner acceptance after
actual measurement; no current readiness estimate or success claim.

## Reviewed primary references

- [Supabase database backup coverage](https://supabase.com/docs/guides/platform/backups)
- [Provider-aware CLI restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [PostgreSQL17 global-role dump scope](https://www.postgresql.org/docs/17/app-pg-dumpall.html)
- [Official age implementation and verification guidance](https://github.com/FiloSottile/age)

Documentation review PASS; Linux resource, real encryption/isolation, complete
staging acquisition/restore and independent custody tests remain NOT RUN.
Production recovery remains NO-GO.
