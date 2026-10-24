# S2 owner confirmation relay — one-message execution authorized

Scope: one owner-approved signup confirmation to `housebuyerinv@gmail.com`,
using `s2.housebuyerinvestments.com`. No deployment, public registration unpause,
paid subscription, owner role assignment, or changes to an existing subscriber.

## Current provider state and approved key specification

- Separate owner-controlled Resend account, inspected in the authenticated browser.
  Free, 0/3,000 monthly and 0/100 daily used at inspection; pay-as-you-go off.
- `s2.housebuyerinvestments.com` is Verified; domain ID
  `0c6e05ac-02c7-4864-ba06-7a171f3e610c`. DNS and 14 preserved original records
  are frozen evidence in PR checkpoint 6388818651; do not repeat that work.
- Zero webhook destinations in the isolated account. The existing connector
  still accesses the shared account and must not be used to create this S2 key.
- Actual key-creation UI supports **Sending access** and exact domain selection
  `s2.housebuyerinvestments.com`. Those settings were inspected, then cancelled.
  No API key exists yet in that account; no key was created or exposed.
- Proposed key name: `BM-S2-Owner-Verification-Isolated`; Sending access only,
  restricted to the exact domain above. No Full access, All domains, SMTP setup,
  application runtime installation or shared/Production key reuse is needed.

Sending-only credentials do not provide general administrative introspection.
Do not add Full access merely to list webhooks or inspect keys. Verify scope in
the correct authenticated provider account before the owner privately creates
and retains the key; a `re_` prefix alone does not prove account/domain provenance.
Keep browser observation stopped while a newly created key or private login link
is visible. The owner closes that secret view before metadata inspection resumes.

### Historical shared-account blocker (preserved evidence)

- Resend domain `housebuyerinvestments.com`: verified, sending enabled; open and
  click tracking disabled. MoneyMap uses a different verified domain.
- Quota at inspection: 0/100 daily and 3/3000 monthly emails. This is a current
  quota observation, not a guarantee about future free capacity.
- Three enabled email-event webhook destinations: one S2 receiver and two DBP
  Production receivers. Domain/key separation does not establish webhook isolation.
- Resend's documented webhook creation schema exposes endpoint and event types;
  no sender-domain filter was found in that documentation. Absence from this
  schema is not a claim that every provider product lacks the capability.

**Current authorization:** PR #2 comment `6389716524` explicitly permits one
domain-restricted key, reviewed relay activation, at most one absent unconfirmed
S2 owner identity, and one genuine confirmation email. Both entrypoints are now
activated for that exact scope. Fresh provider preflight and owner-private key
creation/entry remain mandatory before a real run. The old shared-account key
remains unused. Do not modify shared webhooks.

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
The sender is fixed to `s2-verification@s2.housebuyerinvestments.com`; recipient
remains only `housebuyerinv@gmail.com`, not the new Resend account's login address.
The real transport permits only the exact staging inventory read, staging signup
link generation, UUID user readback and one fixed-recipient Resend send. It denies
Production origins, Auth updates/deletes, other recipients, CC/BCC, alternate
senders, recovery/magic-link generation and unrelated routes. Tests exercise that
same transport policy with dummy requests.

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

Updated isolated-sender preparation: **33 Node checks and 7 PowerShell 5 checks
PASS**, using dummy credentials only. Includes changed sender/domain prompt,
exact launcher/core pin, restricted real-request policy and actual blocked child
execution even with forged environment authorization flags. These supersede the
affected historical 31-check subset; no hosted or application suite was repeated.

PowerShell initially failed under the restricted sandbox; the synthetic tests
passed outside that restriction without elevation, execution-policy changes or
security bypass. One dummy pipe test initially had incorrect quoting; that fixture
was corrected and the actual dummy pipe then passed.

## Approved execution and private owner step

Approval `6389716524` covers only: one new domain-restricted Sending-access key in the verified S2
account; reviewed activation of the blocked local entrypoints; one NEW unconfirmed
Supabase Auth identity for the fixed owner if none exists; and one signup-confirmation
email to that owner through the isolated sender. Freshly verify provider scope,
quota, zero webhooks, staging Auth binding and protected callback before execution.
No other messages, recipient, auto-confirmation, account repair or retry are allowed.

One consolidated private owner session is necessary: personally create/save the
key without agent browser observation, close the secret display, then enter that
key and the new S2 password twice into the masked, hash-verified local launcher.
Private data travels through stdin, not argv/environment/files. The owner then
opens the confirmation email privately in an authorized protected browser; never
paste links/codes/passwords in chat. The activated helper/core fingerprints must
match the published checkpoint before the real run. No environment flag widens
the fixed recipient, provider origin or operation allowlist.

Activation validation retained 33 Node dummy checks and 7 actual PowerShell 5
dummy checks, plus scoped lint. The real-entry negative test now verifies ambient
service credentials fail before provider access rather than asserting the former
authorization lock. Neither successful dummy tests nor activated source proves
an actual owner-profile credential handoff or email delivery.

Fresh read-only preflight verified the dedicated protected READY paused fallback,
zero bypass secrets, the unchanged live containment alias, receiver-pause digest,
complete authenticated Auth inventory with the owner absent, email enabled and
auto-confirm disabled. Encrypted Vercel metadata was inconclusive; the reviewed
empty-cwd environment child independently confirmed registration/Checkout/live
billing/delivery pause values and staging URLs. Other inherited defaults are not
changed: later deployments still require the reviewed explicit configuration.
The exact stable callback is allowlisted in the staging dashboard. The enabled
capture hook retains fingerprint `aa56710451277e5c8d2be79193ea554b`, the stable
callback, and no HTTP delivery code. No SMTP/hook/permission setting was changed.

The isolated Resend account was freshly observed Free, 0/100 daily, 0/3000 monthly,
pay-as-you-go off, zero webhooks, exact domain Verified and no existing key.
The approved form is prepared for owner-private final creation; no key value is
captured by the agent. Actual key creation, send acceptance, delivery and confirmed
Auth state remain pending the private handoff. Do not repeat the relay after a
failure, unclear result or closed terminal; read back state first.

**Email confirmation alone is not application-owner readiness.** This helper
does not create a DBP signed registration intent, record agreement acceptance,
assign an Admin profile or create a workspace. `completeRegistration()` attempts
POST completion for a new identity; registration pause still blocks that POST.
After genuine confirmation, existing approved staging-owner provisioning must
follow its verified-identity/intent/agreement rules, then independently verify
normal login, Active Admin profile and owned workspace before attestation.
Do not disable the pause, fabricate consent/intent, or call this email step proof
of owner-positive application access. Profile/workspace mutation is not part of
this preparation or the proposed one-message relay scope.

## Failure and rollback

### Lost-key replacement and real-launch correction

Owner approval `6390259149` covers only revoking the exact unused isolated key
`31dd3c1c-c268-4f1b-9153-76039c5400ed` and creating one identical-scope replacement.
Do not create that replacement until the private credential prompt is ready.
No DNS work, key guessing, transcript/clipboard retrieval, second email, or
additional identity is authorized. Preserve the original one-message safeguards.

Actual `Start-Process` launch failed at the public core hash operation with
`CommandNotFoundException`, HRESULT `80131501`; it did not establish a hash
mismatch or reach private entry. Direct invocation passed. Windows PowerShell
launched from PowerShell 7 inherited an incompatible module path. Using only
`$PSHOME/Modules` inside the Windows PowerShell helper process resolves the
failure through the exact same launch route: exit 0, exact core hash match.
The previous module path is restored in `finally`; no persisted environment,
execution policy, ACL, tool hash, provider scope or other OS setting is changed.

The helper now supports `-PreflightOnly`, exiting before private input/provider
requests, and writes fixed sanitized stage checkpoints under ignored artifacts.
No keys/passwords/links/raw exceptions/child output enter those checkpoints.
Only public implementation hashes and preflight-only exception type/HRESULT/ID
may be recorded. Mail acceptance remains distinct from delivery/confirmation.
Five focused preflight checks cover PS5 parsing, real read-only execution,
wrong-pin rejection, checkpoint policy and an actual child with a deliberately
invalid inherited module path. Seven existing private-entry dummy checks pass.
Historical diagnostics remain preserved. A started process is not called a
ready private prompt without live stage/owner confirmation.

If a later approved relay partially creates an identity, preserve its exact ID and
receipt, review its current state, and disable/revoke only that new identity using
supported Auth administration if needed. Deletion requires dependency review and
must never select rows by an email pattern. Preserve existing users and evidence.
This batch has no remote mutations to roll back.
Provider 429, timeout or uncertain send stops with a sanitized partial-state
receipt; no automatic retries or rate-limit changes. The message cannot be unsent.
Preserve the exact newly created identity for read-only review; cleanup must be
separately authorized and dependency-scoped. Never delete an existing owner or
reuse a possibly consumed confirmation link. Revoke only the newly owned S2 key
when authorized; do not rotate/revoke shared, Production or MoneyMap credentials.

References: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[Resend send](https://resend.com/docs/api-reference/emails/send-email),
[restricted keys](https://resend.com/docs/api-reference/api-keys/create-api-key),
[webhook configuration](https://resend.com/docs/api-reference/webhooks/create-webhook).
