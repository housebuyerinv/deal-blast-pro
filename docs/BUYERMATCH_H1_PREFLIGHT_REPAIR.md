# H1 correction — review 6372293781

Scope: local engineering, read-only rehearsal and draft PR publication. No deployment,
alias move, payment, provider write, migration, signup or credential change.

## Failure and correction

The failed temporary deployment omitted the versioned-agreement override. Its managed
default was false; the retained corrected Preview's deployment-specific configuration
was not inherited by a new deployment. Vercel `--env` supplies runtime variables;
`--build-env` supplies build variables. Both scopes must be explicit. Neither READY,
source metadata, a successful command nor project `env run` proves deployed guard behavior.
See [runtime overrides](https://vercel.com/docs/cli/deploy#env) and
[build overrides](https://vercel.com/docs/cli/deploy#build-env).

`scripts/buyermatch-s2-release.mjs` contains the single strict Zod-validated manifest:
17 required non-secret settings, explicit initial Checkout=false, registration pause,
versioned agreements=true, staging database/origins/portal, non-live billing, mock delivery
and disabled response/catalog diagnostic switches. Unknown/missing/wrong values and
build/runtime conflicts fail before constructing argv. The deterministic argv builder
never invokes a CLI and never accepts secrets. Existing provider-stored sensitive
credentials are not copied into this manifest or command arguments.

Pinned application source remains `6a98cff667a452563a336b8ba175762029038ef5`.
Tooling commits do not authorize replacing or modifying the tested application export.
Before a future authorized deployment, reverify its Git blob inventory and absence of
unexpected local `.env`/project-link files, target/team, credential metadata and source.
Use the returned argv as an argument vector, not a quoted shell string. Do not append
hand-written overrides. This manifest deliberately cannot generate Checkout=true:
a later payment-window change needs separate reviewed authorization and validation.

The deployment verifier requires independent actual deployment-bound build/runtime
evidence, provider scope/protection, restricted TEST credential provenance, both exact
prices, fixed quantity1, closed processing gates, and protected GET discovery of the
exact two QA document IDs, versions, declared hashes AND computed content hashes.
Project defaults or source/deployment metadata cannot stand in for missing runtime evidence.
QA fixtures are not approved Production legal documents.

## Cleanup

The original PowerShell5 wrapper used `ErrorActionPreference=Stop` plus native
`2>$null`. An actual local PowerShell5 child reproduces a false failure on a successful
exit0 command writing ordinary progress to stderr. Historical raw command streams were
discarded, so that mechanism is reproduced, not asserted as conclusively proven for
the old run. Its missing independent removal readback was a confirmed additional defect.

`buyermatch-s2-process.mjs` invokes fingerprint-pinned Node/CLI entrypoints directly
without a shell. It retains stdout, stderr, exit status and timeout separately in
private memory. Durable diagnostics contain only status, lengths and hashes. Nonzero,
timeout, overflow, malformed JSON and substitution fail closed. It never interprets
CLI prose such as “not found” as an authenticated HTTP404. A timeout kills only the
owned direct child; it does not prove cancellation of an accepted provider request.

`buyermatch-s2-cleanup.mjs` is the shared operator/watchdog closure engine. A strict
run receipt and fresh provider authority are mandatory. Both Stripe endpoint disable
and receiver pause are attempted despite either failure/timeout, followed by independent
safety readback. Only a newly created, exact run-tagged deployment outside the prior
inventory can be removed. Prior paused candidates and live containment are protected.
An unrelated alias prevents deletion. A moved dedicated alias is restored only from
the exact run target to its verified paused fallback, using a conditional adapter.
Removal needs an independent, authenticated, exact-ID HTTP404. A command returning zero,
permission denial, unknown lookup, timeout or unscoped404 does not prove removal.

Same-process concurrent closes coalesce; independent operator/provider races must use
idempotent operations and fresh readbacks. A closure reporting a transport error stays
failed even if later found safely deleted. A subsequent idempotent close can pass while
the earlier failure journal remains intact. Sanitized stage journals record attempts,
outcomes and completion. Journal failure cannot suppress containment and cannot earn PASS.

## Verification and unresolved external gate

33 focused tests: strict configuration/agreements, actual native streams and PowerShell5
red reproduction/fixed green, substitution, command errors/malformed output/timeout,
partial cleanup, readback,404 semantics, ownership, aliases, races, retries, deadline,
journal failure and actual dummy watchdog child termination. No provider mutations.
Child termination deliberately leaves an incomplete journal; that is UNKNOWN, not PASS.

Read-only S2 rehearsal verified the retained protected Preview's exact QA documents and
content hashes. Managed defaults differ on eight manifest keys, including the agreement
flag; all must be explicitly supplied rather than silently inherited. Registration,
Checkout/live billing/delivery remain paused; Stripe endpoint disabled, receiver=false,
all-deployment Authentication, zero bypass entries; live containment unchanged.

**Automatic live cleanup remains BLOCKED/UNVERIFIED.** These modules do not install a
supervisor or manufacture private provider authority. They intentionally have no default
live adapters. A connector session available to this agent is not proof that an independent
watchdog can disable the Stripe endpoint after agent/process failure. Actual full deployment
runtime/build readback also remains unverified for any future new deployment.

## Minimal next approval proposal — no purchase

Authorize a bounded **cleanup-only S2 provider rehearsal**, with registration and Checkout
false throughout: bind reviewed private provider adapters, establish an independent
supervised runner plus operator fallback, deploy one exact-source paused disposable
Preview with the validated manifest, verify actual runtime/build evidence and exact QA
discovery, and let the watchdog close only this run (endpoint already disabled, receiver
already false, alias unchanged) and independently verify deletion. Preserve failure and
completion journals separately. No new bypass secret, signup, event or payment.

The failed ignored PowerShell artifact and its original result are forensic evidence,
not an executable fallback. Do not rerun or overwrite them. An operator uses the same
validated `closeS2Run` receipt/adapters and retains a separate result; manual success
cannot amend a failed automatic result into PASS.

If no secure autonomous Stripe adapter/supervisor is available, stop that rehearsal
before deployment and report that specific limitation; do not retrieve/copy a credential
or label manual cleanup “watchdog verified.” Only after this gate passes should a
separate H1 authorization cover one Pro TEST Checkout and signed activation50/25/50.
PR remains draft; Production/public launch NO-GO.
