# Private Stripe watchdog connection — 2026-10-28

Application remains `68c5cf9f4d8fcd590e45dd536eab1eb29edecccc`. Parent operator is `0964db1d18a340dc1f2676fbd52088ae7db18a64`. This checkpoint changes only operator transport, a read-only independent entrypoint and focused adapter verification. It does not authorize its own hosted mutations.

## Actual private connection

The existing named CLI profile `buyermatch-s2` authenticates to exactly `acct_1UTRcRL6efr9LhPI`, TEST mode. No key, token, cookie or credential-file content was read, copied, returned or logged by the operator. No browser/connector credential bridge or new credential was used.

The credential file and its parent passed owner-only ACL checks (owner, Administrators and SYSTEM). The installed CLI executable matched SHA256 `88162aeacb9875bdb48b654a81f00ad45b9155a28545770144e7997f90efd486`, version 1.53.0. Its parent directory has additional write grants, so the native adapter refuses to execute from that directory. It stages only the unchanged public executable using exclusive copy into the owner-custodied evidence directory, verifies its hash, canonical path and ACL before execution, and preserves the original installation/permissions. The profile stays in place. A short-path evidence alias was also rejected; the successful proof used a canonical directory.

An actual detached Windows process authenticated after its launcher exited. It read the existing exact endpoint (disabled), Pro price (active $119 USD monthly, TEST) and subscription collection through the real CLI transport. The shared request was hash-bound, owner-custodied and fsynced; independent per-process sanitized operation records were fsynced. Non-sensitive result:

```json
{"status":"READ_ONLY_CONNECTION_VERIFIED","launcherExited":true,"durableSharedRequestVerified":true,"account":"acct_1UTRcRL6efr9LhPI","livemode":false,"endpointDisabled":true,"priceVerified":true,"subscriptionReadVerified":true,"cancellationWriteVerified":false,"mutations":0}
```

## Cancellation wiring and boundaries

`makeNativeStripeWatchdog` constructs the named-profile adapter and existing shared `billingEvidenceStore`. Its `closeNewTestSubscriptions(plan, signal)` has the watchdog's exact signature, loads the durable Checkout receipt through the supplied reader, and delegates exclusively to the existing campaign provenance/cancellation validator. There is no generic public subscription mutation API and no raw HTTP credential callback is necessary for this Stripe-only path.

Execution construction requires actual approval, reconciled Checkout policy/receipt and preservation readers in that independent process. Missing readers reject construction; read-only probe mode cannot cancel. Those readers must supply fresh real facts, never fixture booleans. Approval is bound to the revised operator SHA, plan digest and explicit cancellation grant. Customer/Checkout/subscription reads and exact customer-scoped list reads are narrowly encoded; only the validated exact subscription can reach `delete`, with both invoicing/proration false. Account context and named profile are fixed, and live mode, arbitrary paths/headers, API-key flags, alternate origins/profile selection and Portal operations are denied.

The existing durable cancellation intent still prevents a second automatic mutation after an unknown outcome. Native execution additionally rechecks explicit cancellation authority and unchanged preservation immediately before its one DELETE command. Existing CLI secret-bearing stdout/stderr remain private and sanitized; provider JSON errors fail closed. The CLI's pinned source makes no network-error retry; its documented implementation may refresh/retry an explicit401 rejection, which is a known rejected request, not an unknown cancellation outcome. References: [CLI request implementation](https://github.com/stripe/stripe-cli/blob/v1.53.0/pkg/requests/base.go), [HTTP client](https://github.com/stripe/stripe-cli/blob/v1.53.0/pkg/stripe/client.go).

## Focused results and remaining execution gate

28 distinct new adapter checks passed:21 command/context/injection checks and7 subprocess transport cases covering success, shared CRM customer, unknown outcome/reconstructed invocation, missing cancellation permission, preservation drift, pre-existing subscription and unrelated customer. Scoped lint passed. No previously completed application or cleanup suite was repeated. Synthetic cancellation is distinguished from the actual private GET proof above.

**Actual hosted cancellation and `subscription_write` remain unproven.** No campaign-owned subscription exists to cancel. Testing a pre-existing subscription, creating a disposable extra subscription or treating dry-run output as a successful DELETE would violate the scope. Actual cancellation/readback must occur only for the single durably proven campaign-created object after this revised operator is explicitly authorized and every runtime/preservation/independent-reader gate passes. A permission denial must stop without credential/configuration improvisation.

No Checkout, customer, subscription, Preview, signed event, routing/receiver/endpoint update, buyer/provenance access, encryption-key change, migration, Production or MoneyMap operation occurred. Real spending is $0. This removes the missing Stripe credential transport; it is not a claim that all other campaign runtime readers or full teardown have passed. Public release remains **NO-GO**.
