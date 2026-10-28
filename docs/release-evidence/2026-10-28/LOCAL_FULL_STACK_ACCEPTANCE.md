# BuyerMatch real local full-stack acceptance — October 28, 2026

Result: PASS for the executed local Auth, Storage, buyer, matching, authorization
and browser acceptance below. This supersedes the installation/reboot checkpoint.
This is not hosted acceptance or a release authorization.

## Runtime and isolation

After the owner restarted Windows, `HypervisorPresent=true`, WSL 3.0.3.0 with
default WSL2, and Docker Engine 29.9.2 / Desktop 4.97.0 were verified operational.
No pre-existing containers were present. Supabase CLI 2.109.0 started the dedicated
`buyermatch-local-synthetic` project. Real PostgreSQL17, Auth, PostgREST, private
Storage, API gateway and local Mailpit ran in Docker. All 76 actual repository
schema sources installed successfully through the empty-database guard.

Final published bindings: **127.0.0.1 only** on API55321, DB55322 and Mailpit55324;
application5189 is likewise loopback-only. Auth/Storage/REST have no host-published
ports. Approximately 12.3 GiB remained free after image pulls and test data.

The CLI initially published on all interfaces despite the network's default
loopback option. Before accounts/documents were created, only the three dedicated
published containers were recreated with explicit HostIp127.0.0.1. Their named
volumes and configuration were retained. No global Docker/Windows setting changed.
The unused local Edge Runtime was disabled in this project's config.

Runtime credentials and random fixture passwords remain in ignored private
`test-artifacts` files. The launcher constructs a fresh child environment, loads no
dotenv files and admits only the exact local project/origins. Vite's filesystem
deny list now excludes the private artifact and acceptance directories as well as
dotenv/certificate/Git files. Actual HTTP requests confirmed these private files
cannot be downloaded. This fixes a local harness exposure risk; there are no
changes to application authentication, authorization or production configuration.

## Executed results

See [machine-readable results](LOCAL_FULL_STACK_RESULTS.json).

1. Normal application registration → real Auth signup → captured local confirmation
   email → confirmed password login → atomic Free CRM provisioning. Unconfirmed
   password login was rejected. Three fresh accounts completed the flow.
2. Buyer create-only profile, private editable profile and criteria updates,
   revision progression and stale-update rejection.
3. Real Storage proof upload, byte-exact signed download, operation replay,
   replacement retaining earlier evidence, cross-buyer signed-link denial and
   denial of direct authenticated browser Storage reads.
4. Synthetic Pro entitlement recognition, invalid-deal rejection, real deal
   creation and matching over PostgreSQL/PostgREST. The first private analysis
   contained one actual matching synthetic buyer; public output hid buyer identity.
   Same-key replay produced one stored analysis.
5. Locally seeded delivered-invitation fixture → real HTTP interested response,
   response replay, buyer message and private history. Other-buyer history stayed
   empty; invalid response capability failed. No delivery provider was contacted.
6. Real unauthenticated HTTP denial, unavailable legacy route, ordinary-admin proof
   queue denial and rejection of a deactivated account's existing token.
7. Expired upload rejection and expired-document status using an explicitly aged
   local evidence fixture. Append-only protection rejected an attempted UPDATE;
   no triggers were disabled and no OS clock changes were made.
8. Real password authentication of a **synthetic local policy-owner fixture**,
   private proof queue/download/approval and rejection of a conflicting decision.
   The fixture uses the application's fixed policy email only in local Auth;
   it is not the actual owner's hosted identity and no external email was sent.
9. Cross-owner deal denial with an otherwise active entitlement; ten actual
   analyses allowed and the next rejected by the real hourly SQL limit.
10. Browser: normal buyer login, editable-profile save and persistence after reload,
    delivered response/conversation history, private proof replacement, retained
    accepted/pending/expired evidence, and sign-out. Normal subscriber login showed
    Pro50/25 allowances and independent CRM status; browser-created a second deal;
    hourly-limit failure was visible and distribution stayed disabled. Final sign-out
    returned to the normal login screen. No injected browser sessions or demo mode.
11. Independent database readback verified the browser's53-byte synthetic proof,
    four retained proof records, exactly one browser-created deal, and the positive
    private matching result. Private local file HTTP denials passed.

The first browser date-fill attempt submitted an empty expiration and was safely
rejected before any proof reservation. Committing the date with native accessibility
input passed. This was an automation input issue, not a demonstrated product defect.
Temporary diagnostics were removed; no speculative application fix was committed.
All documents are synthetic upload fixtures explicitly marked NOT PROOF OF FUNDS;
their content is not financial verification or evidence of PDF rendering quality.

## Limits and retained state

Focused validation: all six changed local runtime/config JavaScript files passed
ESLint recommended rules with Node globals. The loopback helper's idempotent run
verified all three already-correct bindings. Private runtime material was excluded
from the committed evidence. No broad application build/test campaign was repeated.

No Stripe operation, payment, purchase, hosted deployment, real buyer distribution,
legal publication, S2, Production or MoneyMap change occurred. Entitlements and
delivered invitations are local SQL fixtures, not evidence of provider delivery or
actual paid activation. No unrelated test suite was repeated. These results do not
clear independent hosted/key-recovery/legal/release gates.

The dedicated stack, private fixture material and synthetic records are retained
locally for continued work. No database reset/drop or volume deletion occurred.
Browser sessions were signed out. Restarting through the CLI can recreate broad
bindings: run the scoped loopback helper and verify ports before further fixture use.

Run sequence for a **fresh dedicated stack only**: capture `supabase status --workdir
acceptance/local-synthetic --output json` privately in
`test-artifacts/local-stack-status-private.json`; run
`node scripts/testing/local-full-stack-runtime.mjs schema`, then `serve`; execute
`local-full-stack-acceptance.mjs`; perform the browser profile-save/upload/deal steps;
execute `local-full-stack-boundaries.mjs` after the browser profile save, then
`local-full-stack-final-check.mjs` after the browser upload and deal creation.
These scripts are a campaign with ordered fixtures, not a destructive reset/replay
command for this retained database. Never capture raw status credentials in evidence.
