# Inactive QA: ownership, dependencies and retention

Read-only review after `1731a43`, for project `bwlreupczckklrxdsdcj` only.
No resume, deletion, repurposing, configuration, endpoint probe, database query,
download, key access, data change or deployment. Production/MoneyMap project data
was not inspected. Existing unrelated local edits remain preserved.

## Confirmed ownership and state

The Management API identifies **Deal Blast Pro QA**, created August21,2026, in
owner organization `urpdjybbquuaoevpvpcj`, region us-east-1, Postgres17 metadata,
status INACTIVE. The actual dashboard says **paused**. Organization Team shows
the signed-in `housebuyerinv` account as **Owner**, one member, Free plan.
This establishes control, not permission to discard the project or its contents.

## Dependencies found and remaining unknowns

- A deployed **`stripe-webhook` v1** exists, with ACTIVE function metadata dated
  August 21. It is a previously provisioned project; database contents remain
  unknown. ACTIVE is function metadata,
  not evidence of execution while paused. `verify_jwt=false` is not by itself a
  vulnerability finding; Stripe signature handling was not inspected or invoked.
- Management API returned no development branches. Organization integrations list
  no connected GitHub repository and offer Vercel integration installation. This
  does not rule out manual deployments, URLs, secret-store bindings or external
  callers; none were modified or credential-inspected.
- The exact QA ref/name was not found in inspected application/config source.
  Searching local Git history across24 available refs found only the preceding
  feasibility document. Root-source inspection excluded dotenv/credential files,
  dependencies and artifacts. This is not a complete inventory of other repos,
  uncached remote history, provider env values or external Stripe destinations.
- Database/Auth/Storage counts, queued jobs, DB webhooks, retention obligations,
  and whether any real/customer data exists remain **UNKNOWN**. No paused database
  connection or receiver request was attempted. Zero activity/paused status is
  not proof of empty storage or absence of dependencies.

## Retention requirements

The actual provider notice says its data, backups and Storage objects remain
safe, with dashboard resume available **until October19,2027**, followed by data
download availability. Export controls exist; no backup was opened/downloaded and
no archive checksum or restoration was verified. Treat this as the provider's
current notice, not independently tested recoverability or indefinite retention.

The owner has not established this project's data classification, legal/security
holds, retention policy or disposal permission. Preserve all of it unchanged.
The displayed resume date is NOT a deletion deadline or permission to delete.
Supabase's current [pause guidance](https://supabase.com/docs/guides/platform/upgrading#time-limits)
describes a one-year resume window; the observed project-specific date above is
the applicable evidence. Do not substitute the older90-day changelog estimate.

## Capacity decision

**QA is not currently a safe reusable synthetic environment.** Even a later finding
that it is disposable would not solve the active-project quota: paused projects
already do not count. Deleting QA would release **zero active Free slots**.
Resuming it would require additional active capacity while Production and old S2
remain active. No pause/delete/upgrade/transfer is proposed to manufacture room.

Before any future repurpose decision, separately establish encrypted preservation
and content/dependency classification, including the existing Stripe receiver's
consumers, then obtain an exact owner approval and resolve active-capacity cost.
Do not resume just to get row counts under this read-only authorization. Where
inspection requires backup acquisition or running infrastructure, that is a new
operation with its own custody/resource/approval gates.

Current action: **retain QA paused, do not repurpose or delete**. The separate
synthetic-backend capacity blocker remains. No application tests were rerun for
this metadata-only assessment. Compatibility with the223 original S2 identities
remains unresolved; no new completion milestone. Public release remains NO-GO.

Evidence: [sanitized readbacks](release-evidence/2026-10-26/qa-project-readonly-review.json)
and [provider retention notice](release-evidence/2026-10-26/qa-paused-retention.png).
