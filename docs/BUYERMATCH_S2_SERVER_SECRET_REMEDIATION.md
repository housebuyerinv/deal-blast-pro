# S2 server-secret gap: bounded next operation

**Preparation only. No secret read, key generation, installation or rotation is
authorized by the completed acceptance window.** No new account/email/DNS setup
is needed. Application source remains `b99830596080eef2b24472e71bdcb061c855bf57`.

## Confirmed findings

The corrected deployed application passed actual owner17-setting attestation
(HTTP200, one authenticated request). Overview/plans loaded with checkout
unavailable and Free CRM preserved. The network-admin view failed with generic503;
automatic fallback restoration and independent readback passed.

Non-secret Vercel Preview metadata shows these three bindings absent:

| Name | Required use | Current consequence |
| --- | --- | --- |
| `BUYERMATCH_IDENTITY_KEY` | 32-byte base64 AES-GCM/HMAC private buyer identity key | Admin listing cannot decrypt existing buyer fixtures |
| `BM_RESPONSE_SECRET` | Signed private buyer capabilities, minimum32-character secret | Later response workflow dependency; responses stay disabled |
| `BM_WORKER_SECRET` | Private worker authorization, minimum32-character secret | Later mock/worker dependency; no worker call authorized |

All223 existing buyer rows are **marked synthetic**, with three-part AES-GCM-shaped
ciphertext. Shape/flags are not proof of successful decryption or single-key
consistency. Service-role SELECT permissions on the five admin-list tables are
present. The actual crypto helper's missing-key error reproduced locally using
dummy ciphertext. No buyer identity/ciphertext or real key was retrieved by the
agent. A missing identity key is a confirmed blocker; the generic503 does not
independently establish that it is the only possible remaining error.

The prior [handoff](BUYERMATCH_HANDOFF.md) documents generated staging secrets in
the ignored root `.env.buyermatch-staging` and95 successful staging HTTP checks.
Metadata-only inspection found that file visible in both execution contexts,
last written on the original seed date. Its owner is `CodexSandboxOffline`, not
the normal Windows owner; content, custody and key correspondence remain
**UNVERIFIED**. Do not assume the document proves the file is correct, repair its
ACLs, source/evaluate it as code, or blindly copy values.

An optional Supabase secret-list diagnostic was rejected by automatic approval
review because it could retrieve secret values; it was NOT executed or bypassed.
Supabase identity-secret inventory remains uninspected. Diagnosis used Vercel
`decrypt=false` metadata, SQL aggregates and source/dummy evidence instead.

## Minimum authorization needed

Authorize a narrowly scoped private provenance check and, only if it passes,
Preview-only installation of the **existing three S2 secrets**. This requires
private access to the documented staging seed file, which also contains other
staging credentials/passwords. Only the three named values and the strictly
necessary staging URL/read credential may be used; no values may enter chat,
tool output, screenshots, logs, command arguments, source or GitHub.
Never upload/source the entire dotenv file or replace the currently verified
Supabase and restricted Stripe bindings with older entries from that file.

Before any private read/use, verify canonical source identity, restrictive access,
explicitly approved creator/custody, unchanged metadata and exact staging binding.
Do not repair unknown permissions or follow an unsafe fallback. Privately verify
the original identity key against existing marked-synthetic ciphertext and its
identity hash, emitting only success/counts. Validate the bounded existing cohort
before installing; a mismatch/unknown/mixed-key result must stop, never lead to a
new random key, ciphertext rewrite, fixture deletion or permission relaxation.

Use the existing authenticated owner-controlled Vercel CLI/API. Installed help
confirms `vercel api --input -` reads JSON from stdin. Any implementation must
first pass dummy redaction/argument/failure tests and independent review. Feed
secret request bodies through private process stdin, capture/discard raw provider
stdout/stderr in memory, and emit only fixed status and non-secret binding metadata.
Do not pass values via `--field`, `--token`, environment dumps or temporary files.

Require exact dedicated project/team, all pauses/protection intact, and no
existing conflicting binding. Create only `type=sensitive`, `target=[preview]`,
no branch override, no copying to the project's Production-labelled environment.
Never modify shared/Production/MoneyMap variables. Preserve the original seed file.
On partial failure, stop and record exact created binding IDs without exposing
values; do not blindly retry, delete, overwrite or rotate.

Then pin the exact new binding IDs/types/targets/update metadata in the guarded
S2 provenance manifest, preserving rejection of unrelated credentials. This is
necessary because the existing allowlist intentionally rejects unreviewed names.
Keep registration/checkout/billing/response/delivery/endpoint/receiver controls
disabled. Merely installing the secrets does not authorize their workflows.

## Subsequent hosted gate

A fresh Preview is required to receive new runtime bindings. The previous
one-deployment approval is consumed. A separately authorized, reviewed paused
Preview/read-only retest may reuse exact b998305 with the immutable fallback and
30-minute automatic rollback. No reason to repeat owner setup or completed
subscription/security suites. A combined future authorization may cover the
private validation, tightly scoped configuration/pin updates and one such
conditional retest, but no execution is implied by this proposal.

Paid Pro/lifecycle and full buyer workflows remain separately gated. Legal
owner/counsel approval and independent recovery remain mandatory; recovery is
BLOCKED ON HARDWARE. No Production export, migration, deployment or activation.
The encryption gap does not invalidate historical Starter/v21 results or require
stopping independent billing preparation. A Pro/lifecycle window still needs its
own bounded TEST authorization and legitimate subscriber login; this remediation
does not grant either and is not a reason to repeat passed tests.
