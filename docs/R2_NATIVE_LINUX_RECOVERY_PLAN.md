# R2 replacement recovery: $0 native Linux plan only

Current detailed acceptance and staged authorizations are in
[R2_STAGING_RECOVERY_RUNBOOK.md](R2_STAGING_RECOVERY_RUNBOOK.md).
October 23 read-only local discovery found no working WSL installation; that is
not evidence of a native Linux resource. No installation or Windows repair followed.

The Windows VeraCrypt/AppContainer investigation is CLOSED. Preserve all encrypted
artifacts, private keys, original fingerprints and forensic journals unchanged.
No more Windows probes, mounts, ACL changes or SDK development are proposed.

## Resource status

**BLOCKED ON HARDWARE — not failed or passed.** Owner update in PR #2 comment
6399297749 confirms no spare Linux computer or external/USB storage is available.
No owner boot/install/format/purchase action is requested. This blocks independent
recovery execution, not other authorized application or release-verification work.

Historical evidence recorded a Windows host,32GiB RAM and about8.2GiB free on C:.
October24 DriveInfo later observed33,673,379,840 free bytes on the only ready C:
NTFS volume; CIM inspection was denied. Neither snapshot establishes a suitable
independent encrypted Linux destination. Do not move recovery keys or sensitive
exports onto the everyday Windows host as a substitute. No hardware purchase,
cloud resource, installation, device boot or formatting is authorized. Budget is $0.

Preferred: an already-owned native Linux computer with owner-controlled encrypted
storage. Alternative: an already-owned live USB plus a SEPARATE suitable encrypted
external drive. A VM is not assumed available or isolated. Stop if existing resources
cannot hold the entire database, Storage bytes, encrypted archive and restore working
set with adequate free headroom; do not delete forensic evidence to make room.

## Minimum capabilities when existing resources become available

- Owner-controlled64-bit native Linux execution, supported PostgreSQL17 and the
  required Supabase extensions/local Auth/Storage services. A live USB is usable
  only with an independently approved host and suitable separate working storage.
- LUKS2 encrypted working storage, age authenticated archive encryption, physical
  network disconnection plus verifiable network namespaces/capability restrictions.
  No unencrypted swap, hibernation, core dumps or persistent temporary spill.
- Available disk bytes must cover the measured full DB and Storage object bytes,
  encrypted acquisition archive, restored indexes/WAL/temp working set and explicit
  safety headroom. Source sizes remain unmeasured here; do not invent a fixed
  minimum drive size or assume the old2GiB workspace is sufficient.
- CPU/RAM must actually support the pinned full synthetic PostgreSQL/Auth/Storage
  stack and restore working set. Verify this on the available hardware before
  acquisition; a DB-only restore is insufficient proof of Auth/Storage recovery.
- Separate owner-held offline storage for an independent recovery-key copy; the
  backup's only decryption key must not share its sole device/failure boundary.
  Prove custody using a synthetic decrypt/restore challenge, not a filename check.

No equipment purchase is proposed. Until those already-owned resources exist,
keep the coverage/consistency manifest and source hashes ready, preserve existing
evidence, and perform no acquisition, key generation, boot or destructive setup.

## One resource and safety gate before setup approval

Owner identifies existing hardware/media and who controls it. Read-only inventory
must establish exact devices, capacities, existing data, supported Linux version,
LUKS support, CPU/RAM, free space and PostgreSQL 17/Supabase extension compatibility.
Never select a disk by drive order or format/boot it without separate approval.
Use trusted signed distribution media/tools and pinned package provenance. Disable
automount of Windows/customer disks. Keep the Windows system drive untouched.

## Supported preparation and synthetic proof

1. After device approval, use supported LUKS2/dm-crypt encrypted working storage.
   Owner privately enters the passphrase; confirm mounted filesystem is the verified
   encrypted mapper and backing device. No plaintext working/temp/export directories.
2. age authenticated encryption for archives. Owner controls the private recovery key
   outside the repository, chat and logs. A second offline copy lives on separate
   owner-held encrypted removable media. Verify custody by restoring a SYNTHETIC age
   challenge from the independent copy; a verbal assertion is not recovery proof.
3. Restore in a disposable native network namespace with no interfaces/routes,
   plus physical network disconnection. Verify effective identity/capabilities and
   explicit network denial with positive controls. No extensions requiring egress.
4. Keep PGDATA, WAL, tablespaces, SQL, binaries' working directories, temp files,
   logs and diagnostic/core files on encrypted storage. Disable unencrypted swap,
   hibernation and core/crash output; do not assume /tmp or a live system's persistence
   is encrypted. Disable cron, pg_cron jobs, webhooks, subscriptions, notifications,
   Auth delivery and all external integrations before restoring synthetic fixtures.
5. Pin PostgreSQL 17 and required Supabase extensions/roles. Perform a complete
   synthetic schema/data/Auth/RLS/grant restore, encrypted Storage byte checksums,
   dismount/remount persistence and independent-key restore verification. Journal
   sanitized PASS/FAIL evidence, distinguish real OS checks from simulation.

## Production acquisition remains separately gated

Agree on one coverage manifest and consistency point: schemas, functions, triggers,
roles/grants/default privileges, ownership, RLS, Auth users/identities and required
registration/consent/billing metadata; Storage bucket metadata AND object bytes,
per-object checksums, object counts and consistency reconciliation. A schema dump or
Storage metadata table alone is insufficient. No service/email/billing integrations
may activate on restored content.

Inventory Vault/extension encryption dependencies, Auth signing/provider settings,
external platform settings and required secrets separately. Do not assume pg_dump
contains usable Vault keys or provider configuration. Owner approval is needed for
additional secret custody. Check current provider quotas/egress before export; STOP
on any potential additional cost. Stream export directly into authenticated age
ciphertext or verified encrypted storage; never spill plaintext to temporary host
storage. Verify encrypted archive integrity and perform full isolated restore with
record counts, constraints, permissions and Storage checksums before release approval.

Retention: seven days after verified secure cutover; review at 30 days if delayed.
Never delete evidence or recovery material required for an unresolved incident.

Minimum future owner involvement, only after resources become available: identify existing suitable hardware/media; approve
any device boot/format; privately control encryption secrets and independent offline
key copy; separately approve Production export. There is no owner command to run now.

Status: PLAN ONLY / BLOCKED ON HARDWARE / no failed recovery test claimed /
Production recovery NO-GO.
