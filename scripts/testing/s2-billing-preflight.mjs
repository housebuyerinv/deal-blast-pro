// Executable read-only proof aggregation. No credentials, activation or provider defaults.
import { validateBillingPlan } from "./s2-billing-runner.mjs";
import { setTimeout, clearTimeout } from "node:timers";
const required = [
  "registrationPaused",
  "checkoutPaused",
  "liveBillingPaused",
  "deliveryDisabled",
  "endpointDisabled",
  "receiverPaused",
  "protected",
  "fallbackVerified",
  "freeQuotaVerified",
  "credentialProvenanceVerified",
  "normalProLoginVerified",
  "agreementsVerified",
  "serviceRoleOnlyBilling",
  "completedCheckoutRequired",
  "subscriptionOwnershipRequired",
  "ownerLockingRequired",
  "allReachablePortalEntryPointsDenied",
  "providerPortalLoginDisabled",
  "sharedCoordinationRootVerified",
];

export async function executeBillingPreflight(
  input,
  ports,
  { approvedSource, timeoutMs = 10000, now = Date.now } = {},
) {
  const p = validateBillingPlan(input, approvedSource, now());
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    [
      "readFacts",
      "readPreservation",
      "readWatchdogAuthority",
      "readAttestation",
      "readOperatorIdentity",
      "journal",
    ].some((k) => typeof ports?.[k] !== "function")
  )
    throw Error("Preflight configuration invalid");
  const call = async (name, ...args) => {
    const controller = new globalThis.AbortController();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() =>
          ports[name](p, ...args, controller.signal),
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error());
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    if (
      (await call("journal", { stage: "preflight", status: "STARTED" }))
        ?.durable !== true
    )
      throw Error();
    const facts = await call("readFacts");
    if (
      facts?.source !== p.source ||
      facts.runId !== p.runId ||
      facts.project !== p.project ||
      facts.team !== p.team ||
      facts.database !== p.database ||
      facts.account !== p.account ||
      facts.endpoint !== p.endpoint ||
      facts.livemode !== false ||
      facts.target !== "preview" ||
      facts.ready !== true ||
      !/^dpl_[A-Za-z0-9]+$/.test(facts.deploymentId || "") ||
      facts.leaseRunId !== p.runId ||
      required.some((k) => facts[k] !== true)
    )
      throw Error();
    const identity = await call("readOperatorIdentity");
    if (identity?.account !== p.account || identity.mode !== "test")
      throw Error();
    const attested = await call("readAttestation", facts.deploymentId);
    if (
      attested?.source !== p.source ||
      attested.runId !== p.runId ||
      attested.deploymentId !== facts.deploymentId ||
      attested.verified !== true
    )
      throw Error();
    const before = await call("readPreservation"),
      watch = await call("readWatchdogAuthority");
    if (
      before?.buyers !== 223 ||
      before.provenance !== 9 ||
      before.nonstandardHashes !== 8 ||
      ["buyerDigest", "dependenciesDigest", "unrelatedAccountsDigest"].some(
        (k) => !/^[a-f0-9]{64}$/.test(before[k] || ""),
      )
    )
      throw Error();
    if (
      watch?.source !== p.source ||
      watch.runId !== p.runId ||
      watch.account !== p.account ||
      watch.project !== p.project ||
      watch.team !== p.team ||
      watch.database !== p.database ||
      watch.endpoint !== p.endpoint ||
      watch.independent !== true ||
      watch.providerReadbacksVerified !== true ||
      watch.canCloseBothGates !== true ||
      watch.canExpireOwnedCheckouts !== true ||
      watch.canRestoreAndRemoveOwnedPreview !== true ||
      watch.noPortalIssuedVerified !== true
    )
      throw Error();
    const after = await call("readPreservation");
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      now() >= p.expiresAt
    )
      throw Error();
    if (
      (await call("journal", { stage: "preflight", status: "PASS" }))
        ?.durable !== true
    )
      throw Error();
    return {
      mode: p.mode,
      source: p.source,
      runId: p.runId,
      status:
        p.mode === "HOSTED"
          ? "HOSTED_READ_ONLY_PREFLIGHT_PASS"
          : "LOCAL_SYNTHETIC_PREFLIGHT_PASS",
      paymentAuthorized: false,
      activationPerformed: false,
    };
  } catch {
    try {
      await call("journal", {
        stage: "preflight",
        status: "FAILED_OR_UNKNOWN",
      });
    } catch {
      /* UNKNOWN retained in outcome. */
    }
    return {
      mode: p.mode,
      source: p.source,
      runId: p.runId,
      status: "PREFLIGHT_UNVERIFIED",
      paymentAuthorized: false,
      activationPerformed: false,
    };
  }
}
