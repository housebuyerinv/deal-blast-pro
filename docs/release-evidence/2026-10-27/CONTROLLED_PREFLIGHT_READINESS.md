# Controlled preflight: local corrections and exact approval scope

Original requested application pin `f5e59d9aa64c308f2add2a3c8dea593226984978`
and prior HEAD `cc877ec666832a02af1e50613a63214deef4c63a` are preserved.
New tested application/operator candidate:
`2fe5ee83389b6fd6981d93795eef92b57bc7c34f`.
It needs explicit approval; do not silently substitute it for the old pin.

## Actual engineering results

- Confirmed two legacy Checkout paths outside the bounded BuyerMatch route:
  CRM credit-pack and Pro-trial purchase. S2 now rejects both at the central action
  handler and both API wrappers before account/provider/configuration access.
  Read-only credit catalog and non-S2 authentication/CRM pricing behavior remain.
- Closed approval-purpose ambiguity: source/run/mode alone is insufficient.
  Preflight requires `payment-free-preflight`; activation requires
  `subscription-activation`. A read-only receipt cannot authorize Checkout even
  if runtime Checkout flags are accidentally enabled. Watchdog, containment and
  operator adapters preserve/check explicit scope rather than dropping it.
- Added a separate payment-free packet. It contains only exact-source push,
  archive/extract and fully paused protected Preview commands as DATA, not execution.
  Activation, Portal sessions, event triggers, migrations and alias moves are
  explicitly excluded. All17 build/runtime settings remain pinned paused.
- Preflight also requires coverage of every reachable legacy Checkout entry point;
  missing coverage is UNKNOWN, not a pass inferred from the corrected source.

**121/121 selected checks PASS**, including11 new checks. That comprises111 affected
application/provider/watchdog/promotion checks,2 real loopback HTTP checks and8
exact-source packet checks. Scoped lint:0 errors;2 existing warnings in the dynamic
Property Intelligence API (unused constant/empty block) remain unsuppressed.
Scoped TypeScript and both API bundles PASS. Completed unrelated suites/builds
were retained rather than repeated. The buyer migration remains unchanged:
`9bb5aa7eda7047863e1910ab40337388e9cfc0b6455539699bf637471eb114dd`.

## Publication and hosted gate

`payment-free-preflight-packet.json` pins the new source/tree, existing integration
branch and last-reviewed remote commit. Its paths/run ID are examples, and
`executionReady=false`. Fresh remote and connected CI/Vercel build-suppression
checks remain mandatory before push. Publish the approved application commit,
not a moving HEAD; the later reporting/preparation commit is distinct.

The minimum owner authorization is: publish the reviewed new candidate to existing
draft PR#2; create ONE $0 protected paused S2 Preview; perform normal authenticated
payment-free preflight; independently verify same-state disabling of the dedicated
already-disabled Stripe TEST endpoint and already-paused S2 receiver; remove only
the newly owned unaliased temporary deployment. Preserve the fallback and every
existing deployment. Use the independently verified immutable hostname; no alias
move, migration, purchase, Portal session, test-event trigger or registration
unpause belongs to this approval. Do not reopen old email/key/setup work.

No current hosted identity, permissions, quota, runtime flags, legacy-route coverage
or independent provider authority was verified here. Tests used synthetic data;
the detached-process and loopback behavior were actual OS operations. Actual
provider effects/readbacks must pass under the separately approved hosted scope.
Old reachable deployments are not patched by this local change. Stop before any
activation if their containment cannot be demonstrated.

All prior launch gates remain: trusted original buyer-key compatibility, hosted
buyer/privacy acceptance, Pro TEST activation and lifecycle, legal approval,
independent encrypted restoration, and separately approved Production cutover.
No push, deployment, hosted write, payment, migration, buyer/key change, Production
or MoneyMap operation occurred. Public release remains NO-GO. No new percentage
milestone is asserted.
