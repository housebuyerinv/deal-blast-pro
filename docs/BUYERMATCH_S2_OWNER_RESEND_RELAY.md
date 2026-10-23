# S2 owner confirmation relay — blocked on provider event routing

Scope: one owner-approved signup confirmation to `housebuyerinv@gmail.com`,
using `housebuyerinvestments.com`. No deployment, public registration unpause,
paid subscription, owner role assignment, or changes to an existing subscriber.

## Independently observed provider state

- Resend domain `housebuyerinvestments.com`: verified, sending enabled; open and
  click tracking disabled. MoneyMap uses a different verified domain.
- Quota at inspection: 0/100 daily and 3/3000 monthly emails. This is a current
  quota observation, not a guarantee about future free capacity.
- Three enabled email-event webhook destinations: one S2 receiver and two DBP
  Production receivers. Domain/key separation does not establish webhook isolation.
- Resend's documented webhook creation schema exposes endpoint and event types;
  no sender-domain filter was found in that documentation. Absence from this
  schema is not a claim that every provider product lacks the capability.

**Do not run the owner helper or enter credentials yet.** Both executable entry
points stop before private input or provider operations. The earlier request to
prepare a private key is superseded by this routing gate; any already-created
dedicated key should remain unused and private. Do not modify shared webhooks.

## Implemented local draft

`scripts/testing/s2-owner-confirmation.mjs` uses the documented Supabase Admin
signup-link generation API, intended for custom mail providers. This would create
one unconfirmed account, validate the exact identity and staging verification
origin/callback, read back its unconfirmed state, and send the link only to the
approved owner via Resend. It never consumes the link, generates a magic-link
login, auto-confirms, assigns roles/workspaces, or changes the existing email hook.

The existing capture-only hook can remain byte-for-byte unchanged. No SMTP or
Supabase hook switch is needed for this relay design. Confirmation, private normal
login, and later authorized profile/workspace provisioning remain separate gates.

`scripts/owner-confirm-buyermatch-s2.ps1` prepares masked SecureString input and
an stdin pipe to a pinned Node executable/implementation. No secrets are placed in
argv, environment, source, output or files. Managed plaintext necessarily exists
temporarily in the local TLS request process; SecureString disposal does not prove
erasure of every managed-memory copy. No real secret was entered or transmitted.

The draft fails on a pre-existing owner, incomplete Auth inventory, incorrect
service-role project, changed tools, malformed/altered links, unexpected confirmed
identity, wrong recipient or provider error. There is no automatic retry. Failed
generation/send is reported as possibly leaving an unconfirmed account; no account
is automatically deleted or overwritten. Resend acceptance is not delivery,
confirmation, owner authorization, or successful login.

## Focused verification

31 Node tests passed using mocked provider responses plus actual child-process
negative tests. Seven PowerShell 5 dummy checks passed, including an actual local
stdin pipe. No network send, real user creation, real password, or real owner
handoff is covered by these tests. Scoped JavaScript lint: zero errors/warnings.

PowerShell initially failed under the restricted sandbox; the synthetic tests
passed outside that restriction without elevation, execution-policy changes or
security bypass. One dummy pipe test initially had incorrect quoting; that fixture
was corrected and the actual dummy pipe then passed.

## Next gate and rollback

Establish verified provider-side event isolation, or independently verify the
actual deployed receivers' no-write handling of this exact unrelated message and
obtain approval for any Production-directed event traffic required. Do not infer
either result from local source tests. Do not send as a diagnostic experiment.

After routing clearance, review the gated entry points before enabling them;
privately obtain a sending-only domain-scoped S2 key and complete one owner session.
Do not reuse MoneyMap or Production keys. The current helpers are deliberately
not a runnable owner handoff. No new provider resources or keys were created.

If a later approved relay partially creates an identity, preserve its exact ID and
receipt, review its current state, and disable/revoke only that new identity using
supported Auth administration if needed. Deletion requires dependency review and
must never select rows by an email pattern. Preserve existing users and evidence.
This batch has no remote mutations to roll back.

References: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[Resend send](https://resend.com/docs/api-reference/emails/send-email),
[restricted keys](https://resend.com/docs/api-reference/api-keys/create-api-key),
[webhook configuration](https://resend.com/docs/api-reference/webhooks/create-webhook).
