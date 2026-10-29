# S2 identity preservation: assessment only

Baseline `11c256a`; application remains `de9009e`. No real replacement key,
installation, data rewrite/export, migration, deployment or permission change.
Production/MoneyMap were not accessed. No rejected credential file was inspected.

## What depends on the original key

`server/buyermatch/security.js` uses the same 32-byte environment key for AES-256-GCM
encryption/decryption and email HMAC-SHA256. Ciphertext is IV/data/tag with no key
identifier/version or keyring. There is no implemented legacy/new-key selection.

| Stored field | Dependency and consequence |
| --- | --- |
| `bm_buyers.identity_ciphertext` | Name, email, phone and company from imports, portal sync and account profile updates. Needed for admin listing, duplicate detection, profile consistency and delivery |
| `bm_buyers.source_ciphertext` | Import row/mapping/notes/time, or portal source/reference/time. Import rows may contain additional identity data. Same encryption key |
| `bm_buyers.identity_hash` | Keyed digest of normalized email, not reversible encryption. Used for deduplication/sync and authenticated buyer linkage; a different key gives a different digest |

Criteria, consent evidence, statuses, UUID relationships and existing audit data
are not encrypted by this helper. That does not make them public or safe to
export. POF object bytes and Auth password/session storage use separate existing
controls; this key is not their decryption key. The new account/proof tables are
not installed in S2 yet.

`BM_RESPONSE_SECRET` signs invitation tokens; changing it is a separate historical
capability/replay decision, not an identity-data recovery. `BM_WORKER_SECRET` is
worker authentication, not data encryption. Do not test it by invoking the worker.

## Actual S2 evidence

Read-only aggregate/catalog queries returned **223** buyers, all marked synthetic,
with nonempty three-part identity ciphertext; **9** also have source ciphertext.
Format/markers do NOT establish genuine plaintext, confidentiality, successful
decryption or that one key encrypts every row. No identities, row ciphertext,
individual identity hashes or proof files were retrieved.

**215** identity hashes have the expected 64-hex format; **8** are length36 and
outside that format, with **8 linked exposures**. All223 have expected encoded
IV/tag lengths. The existing strict whole-cohort verifier would reject those 8;
do not silently exclude or rewrite them. Historical callback-test source uses
`randomUUID()` for an identity hash, which is a possible explanation, not proof
of these rows' provenance. No data corruption or compromise is inferred.

There are 297 exposures, 147 response-token rows, no duplicate-review rows or merged
links, and no intake submissions. Buyer IDs are foreign-key targets for exposures,
duplicate reviews and merged aliases. Reimporting identities under new hashes
would not preserve those relationships or prove ownership. Current admin listing
decrypts every returned buyer; setting old buyers inactive alone would not make
an in-place new key safe.

## Backup and recovery limits

The authenticated Supabase S2 backup page explicitly says **Free Plan does not
include project backups**. No upgrade/restore/download was selected. This rules
out an available scheduled backup through that page, not every possible copy.
Owner-held original-key backups remain **UNSURE**, not proven absent. Existing
encrypted forensic artifacts were left untouched; their contents were not
assumed to contain S2 data/keys. Independent full recovery remains unverified and
resource-blocked under the retained Linux plan.

Vercel's automated response says opaque copying is unsupported; no human case was
available at $0. Original provider bindings are historical metadata evidence only.
No currently verified authorized path supplies the originals. A database backup
of ciphertext alone cannot supply a separate Vercel application key or decrypt
the identities. Independently trusted original import files might permit a
separate reconstruction assessment, but none is verified and no search/import
was performed. Reconstruction is not original-key recovery or renewed consent.

## What replacement would and would not do

A new key **cannot decrypt** existing identity or source payloads, nor reproduce
their email HMACs. This is confirmed with 3 new tests of the actual application
crypto helpers using fixed public dummy bytes only; no real keys were generated.
Retaining ciphertext unchanged preserves the possibility of future original-key
recovery. Merely changing configuration does not erase ciphertext, but rollback
of readable access requires the correct original key. With no original, plaintext
recovery cannot be promised. Overwriting ciphertext/hashes or deleting source
records would remove recovery options and is prohibited.

## Conditional reversible path for a later approval

**Reject an in-place secret swap or blind re-encryption migration.** There is no
lossless re-encryption path without old-key decryption. Do not normalize the eight
nonstandard hashes to force verification or claim they are safe to discard.

Preferred fallback if originals remain unavailable: preserve the old S2 backend,
original provider bindings, ciphertext/hashes, relationships, audit and historical
billing evidence unchanged; prepare a **parallel, isolated clean synthetic cohort**
with separately approved new keys and fixtures. This can restore future test
capability while retaining opaque historical evidence. It does not recover old
identities or qualify as disaster recovery. Never mix old/new cohorts under the
current single-key runtime or reuse legacy IDs/consents to claim new ownership.

This is feasible architecturally but **not execution-ready**: free project/storage
capacity, authorized resources, secret custody, isolated Auth/Storage, separate
signed webhook/callback routing and rollback must be proven first. Existing S2
catalog/prices/portal and successful billing evidence must not be replaced or
replayed. A separate schema in the same database is not assumed isolated: the
application/RPCs use `public` and are not schema-parameterized. No schema rename,
permission relaxation or silent retargeting is proposed.

Before any mutation of the original environment, require separately authorized
encrypted preservation of its complete dependency graph and independent key
custody; no export is authorized here. A future parallel cutover would use an
exact protected Preview and bounded alias switch, with rollback to the unchanged
old Preview/backend. Rollback restores the previous contained state, **not**
readability that is already blocked by the missing original key.

Next decision: authorize bounded design/resource verification for this parallel
S2 option if no trusted originals can be supplied. Key generation, resource
creation, provider edits, migration, data export and cutover need their own exact
approval. **Current status: NO-GO for replacement or public release.**

Evidence: [sanitized aggregates](release-evidence/2026-10-26/identity-preservation-assessment.json).
