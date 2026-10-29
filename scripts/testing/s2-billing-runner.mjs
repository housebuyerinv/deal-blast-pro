// No CLI, credentials, provider defaults or activation on import.
// Real execution requires separately reviewed private adapters and owner approval.
import { z } from "zod";
import { createHash } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import {
  S2_RELEASE as S2,
  REQUIRED_S2_ENV,
} from "../buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const AbortController = globalThis.AbortController;

export const BILLING_STEPS = Object.freeze({
  checkout: [
    "oneOwnedProCheckout",
    "quantityOne",
    "testPrice11900",
    "pendingNotEntitled",
  ],
  activation: [
    "completedCheckout",
    "signedEvent",
    "ownedSubscription",
    "proEntitlement",
    "crmUnchanged",
  ],
  boundaries: [
    "starter20_10_25",
    "pro50_25_50",
    "serverAuthoritative",
    "foreignOwnerDenied",
  ],
  signature: [
    "unsignedDenied",
    "invalidSignatureDenied",
    "noUnauthorizedMutation",
  ],
  replay: [
    "sameEventSingleLedger",
    "unchangedEntitlement",
    "outOfOrderUsesAuthoritativeState",
  ],
  payment: ["ownedPortalOnly", "testCustomer", "noForeignOrCrmCustomer"],
  change: [
    "approvedPricesOnly",
    "quantityOne",
    "prorationVerified",
    "noDuplicateSubscription",
  ],
  renewal: [
    "sameOwnedSubscription",
    "newPeriodOnce",
    "historicalUsageRetained",
  ],
  failure: [
    "failureDeniedOrSuspended",
    "recoveryAuthoritative",
    "delayedFailureDoesNotRevokeRecovered",
  ],
  cancel: ["periodEndPolicy", "paidThroughVerified", "terminalStateNotAssumed"],
});
const profiles = {
  activation: ["checkout", "activation", "boundaries", "signature", "replay"],
  lifecycle: [
    "payment",
    "change",
    "renewal",
    "failure",
    "cancel",
    "replay",
    "boundaries",
  ],
};
const schema = z
  .object({
    source: z.string().regex(/^[a-f0-9]{40}$/),
    runId: z.string().uuid(),
    project: z.literal(S2.project),
    team: z.literal(S2.team),
    database: z.literal(S2.staging),
    account: z.literal(S2.account),
    endpoint: z.literal(S2.endpoint),
    owner: z.literal(S2_PRO_OWNER),
    mode: z.enum(["LOCAL_SYNTHETIC", "HOSTED"]),
    profile: z.enum(["activation", "lifecycle"]),
    startedAt: z.number().int(),
    expiresAt: z.number().int(),
  })
  .strict();
const methods = [
  "claimRun",
  "releaseRun",
  "verifyApproval",
  "verifyAuthority",
  "readPreflight",
  "verifyWatchdog",
  "activateTestWindow",
  "runStep",
  "closeNewCheckoutSessions",
  "closeNewTestSubscriptions",
  "closePortalSessions",
  "disableEndpoint",
  "pauseReceiver",
  "restoreRoutingAndRemoveTemporaryPreview",
  "readClosure",
  "readPreservation",
];
const safeFields = [
  "registrationPaused",
  "checkoutPaused",
  "liveBillingPaused",
  "deliveryDisabled",
  "receiverPaused",
  "endpointDisabled",
  "protectionEnabled",
  "fallbackVerified",
];
const closedFields = [
  ...safeFields,
  "portalAccessEnded",
  "newCheckoutSessionsClosedOrCompleted",
  "newTestSubscriptionsCanceled",
  "temporaryPreviewRemoved",
  "unrelatedDeploymentsUnchanged",
  "inflightOperationsReconciled",
];

export function validateBillingPlan(input, approvedSource, now = Date.now()) {
  const p = schema.safeParse(input);
  if (
    !p.success ||
    !/^[a-f0-9]{40}$/.test(approvedSource || "") ||
    p.data.source !== approvedSource ||
    !Number.isFinite(now) ||
    p.data.startedAt > now ||
    p.data.expiresAt <= now ||
    p.data.expiresAt <= p.data.startedAt ||
    p.data.expiresAt - p.data.startedAt > 1800000
  )
    throw Error("Billing scope/source/window invalid; no operations");
  return Object.freeze(p.data);
}
export function billingWindowBindings(plan) {
  return {
    BM_S2_BILLING_OWNER_ID: plan.owner,
    BM_S2_BILLING_RUN_ID: plan.runId,
    BM_S2_BILLING_STARTED_AT: new Date(plan.startedAt).toISOString(),
    BM_S2_BILLING_EXPIRES_AT: new Date(plan.expiresAt).toISOString(),
    BM_S2_BILLING_OPERATIONS:
      plan.profile === "activation" ? "checkout" : "payment,change,cancel",
  };
}
const digest = (p) =>
  createHash("sha256").update(JSON.stringify(p)).digest("hex");
async function bounded(fn, ms) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("Deadline"));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function preservation(value) {
  return z
    .object({
      buyers: z.literal(223),
      provenance: z.literal(9),
      nonstandardHashes: z.literal(8),
      buyerDigest: z.string().regex(/^[a-f0-9]{32,64}$/),
      dependenciesDigest: z.string().regex(/^[a-f0-9]{32,64}$/),
      unrelatedAccountsDigest: z.string().regex(/^[a-f0-9]{32,64}$/),
    })
    .strict()
    .parse(value);
}
export async function runBillingStage(
  input,
  adapter,
  { approvedSource, journal, timeoutMs = 25000, now = Date.now } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, now());
  if (plan.mode === "HOSTED" && plan.profile === "lifecycle")
    throw Error(
      "Hosted Portal-session containment is not verified; no activation",
    );
  if (
    methods.some((m) => typeof adapter?.[m] !== "function") ||
    typeof journal !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw Error("Billing adapters/journal/deadline incomplete; no operations");
  const steps = [];
  let journalFailed = false,
    failed = false,
    before,
    claimed = false;
  const record = async (stage, status) => {
    try {
      const receipt = await bounded(
        () =>
          journal({
            runId: plan.runId,
            source: plan.source,
            mode: plan.mode,
            stage,
            status,
          }),
        timeoutMs,
      );
      if (receipt?.durable !== true) throw Error();
    } catch {
      journalFailed = true;
      throw Error("Journal unavailable");
    }
  };
  const call = (name, ...args) =>
    bounded((signal) => adapter[name](plan, ...args, signal), timeoutMs);
  // Approval verification is read-only and precedes every containment mutation.
  let approval;
  try {
    approval = await call("verifyApproval", digest(plan));
  } catch {
    /* No inferred authority. */
  }
  if (
    approval?.approved !== true ||
    approval.planDigest !== digest(plan) ||
    approval.mode !== plan.mode ||
    approval.scope !== `subscription-${plan.profile}` ||
    (plan.profile === "activation" &&
      (approval.cancelCampaignCreatedTestSubscription !== true ||
        !/^[a-f0-9]{40}$/.test(approval.cleanupOperatorSource || "")))
  )
    throw Error(
      "Billing approval unavailable; no activation or containment mutations",
    );
  const authorityMatches = (a) =>
    a?.project === plan.project &&
    a.team === plan.team &&
    a.database === plan.database &&
    a.account === plan.account &&
    a.endpoint === plan.endpoint &&
    a.livemode === false &&
    a.ownerAuthorized === true;
  let authority;
  try {
    authority = await call("verifyAuthority");
  } catch {
    /* Never guess provider context. */
  }
  if (!authorityMatches(authority))
    throw Error("Billing provider authority unavailable; no mutations");
  // Persistent exclusive claim is adapter-owned. Never close a different run's gates
  // when a concurrent/duplicate claim was rejected.
  try {
    claimed = (await call("claimRun")).claimed === true;
  } catch {
    /* Unknown claim is not authorization. */
  }
  if (!claimed)
    throw Error("Billing run already claimed or claim unknown; no activation");
  try {
    await record("preflight", "STARTED");
    const pre = await call("readPreflight");
    if (
      pre?.source !== plan.source ||
      pre.project !== plan.project ||
      pre.team !== plan.team ||
      pre.database !== plan.database ||
      pre.account !== plan.account ||
      pre.owner !== plan.owner ||
      pre.target !== "preview" ||
      pre.ready !== true ||
      pre.livemode !== false ||
      pre.normalLoginVerified !== true ||
      pre.restrictedKeysVerified !== true ||
      pre.billingGuardsVerified !== true ||
      pre.serverWindowGuardVerified !== true ||
      pre.versionedAgreementsVerified !== true ||
      pre.noPriorUnreconciledCheckout !== true ||
      (plan.profile === "activation" &&
        pre.cleanupCustomerIsolationVerified !== true) ||
      safeFields.some((f) => pre[f] !== true)
    )
      throw Error();
    for (const kind of ["build", "runtime"])
      if (
        Object.entries(REQUIRED_S2_ENV).some(([k, v]) => pre[kind]?.[k] !== v)
      )
        throw Error();
    before = preservation(await call("readPreservation"));
    const watcher = await call("verifyWatchdog", digest(plan));
    if (
      watcher?.independent !== true ||
      watcher.planDigest !== digest(plan) ||
      watcher.canCloseBothGates !== true ||
      watcher.canRemoveTemporaryPreview !== true ||
      watcher.canCloseProviderSessions !== true ||
      (plan.profile === "activation" &&
        (watcher.canCancelOwnedTestSubscription !== true ||
          watcher.cleanupOperatorSource !== approval.cleanupOperatorSource)) ||
      watcher.expiresAt !== plan.expiresAt
    )
      throw Error();
    if (now() >= plan.expiresAt) throw Error();
    await record("activation", "STARTED");
    const active = await call(
      "activateTestWindow",
      billingWindowBindings(plan),
    );
    if (
      active?.verified !== true ||
      active.registrationPaused !== true ||
      active.liveBillingPaused !== true ||
      active.deliveryDisabled !== true ||
      active.bindingsDigest !== digest(billingWindowBindings(plan))
    )
      throw Error();
    for (const step of profiles[plan.profile]) {
      if (now() >= plan.expiresAt) throw Error();
      await record(step, "STARTED");
      const result = await call("runStep", step);
      if (now() >= plan.expiresAt) throw Error();
      const allowed = ["passed", "mode", "owner", "testMode", "assertions"];
      if (
        !result ||
        Object.keys(result).some((k) => !allowed.includes(k)) ||
        result.passed !== true ||
        result.mode !== plan.mode ||
        result.owner !== plan.owner ||
        result.testMode !== true ||
        Object.keys(result.assertions || {})
          .sort()
          .join("|") !== [...BILLING_STEPS[step]].sort().join("|") ||
        Object.values(result.assertions).some((v) => v !== true)
      )
        throw Error();
      steps.push({ step, status: "PASS" });
      await record(step, "PASS");
    }
  } catch {
    failed = true;
    try {
      await record("operation", "FAILED_OR_UNKNOWN");
    } catch {
      /* Closure must continue. */
    }
  }
  // No retries. Every independent closure is attempted, even on timeout/journal failure.
  let closureAuthority;
  try {
    closureAuthority = await call("verifyAuthority");
  } catch {
    /* Wrong/unknown authority is not permission to mutate. */
  }
  const closures = authorityMatches(closureAuthority)
    ? await Promise.allSettled(
        [
          "disableEndpoint",
          "pauseReceiver",
          "closeNewCheckoutSessions",
          "closePortalSessions",
          "restoreRoutingAndRemoveTemporaryPreview",
        ].map((name) => call(name)),
      )
    : [];
  let verified = false;
  // Subscription closure must follow Checkout reconciliation and independently pass.
  let subscriptionClosed = false;
  try {
    if (
      authorityMatches(closureAuthority) &&
      closures[2]?.status === "fulfilled" &&
      closures[2].value?.verified === true
    )
      subscriptionClosed =
        (await call("closeNewTestSubscriptions"))?.verified === true;
  } catch {
    /* Unknown closure keeps the run claim and cannot become PASS. */
  }
  try {
    const state = await call("readClosure"),
      after = preservation(await call("readPreservation"));
    verified =
      authorityMatches(closureAuthority) &&
      subscriptionClosed &&
      closures.length === 5 &&
      !!before &&
      closedFields.every((f) => state?.[f] === true) &&
      JSON.stringify(before) === JSON.stringify(after) &&
      closures.every(
        (r) => r.status === "fulfilled" && r.value?.verified === true,
      );
  } catch {
    /* Unknown never becomes safe. */
  }
  try {
    await record("closure", verified ? "VERIFIED" : "FAILED_OR_UNKNOWN");
  } catch {
    /* Reflected below. */
  }
  const result = {
    mode: plan.mode,
    profile: plan.profile,
    source: plan.source,
    runId: plan.runId,
    status:
      !verified || journalFailed
        ? "CLOSURE_UNVERIFIED"
        : failed
          ? "FAILED_CONTAINED"
          : "PASS",
    steps,
    closureVerified: verified && !journalFailed,
    requiresOperator: !verified || journalFailed,
  };
  if (result.closureVerified) {
    try {
      if ((await call("releaseRun", result))?.released !== true) throw Error();
    } catch {
      result.status = "CLOSURE_UNVERIFIED";
      result.closureVerified = false;
      result.requiresOperator = true;
      try {
        await record("closure", "FAILED_OR_UNKNOWN");
      } catch {
        /* Evidence uncertainty retained. */
      }
    }
  }
  return result;
}
