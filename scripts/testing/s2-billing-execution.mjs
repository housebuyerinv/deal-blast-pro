// Complete independent cleanup runtime. No activation on import, no Portal API.
import process from "node:process";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
import { billingEvidenceStore } from "./s2-billing-journal.mjs";
import {
  makeNativeStripeWatchdog,
  verifyNativeCustody,
} from "./s2-stripe-native-watchdog.mjs";
import {
  makeNativePlatformProvider,
  makePrivateEvidence,
} from "./s2-billing-native-provider.mjs";
import { makeLiveBillingReaders } from "./s2-billing-live-readers.mjs";
import { verifyLauncherExited } from "./s2-billing-watchdog.mjs";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const deny = () => {
  throw Error("Complete S2 billing execution UNVERIFIED");
};
const SOURCE = "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc";
export const BILLING_COORDINATION_ROOT =
  "C:/Users/CTL Katastrophic/DBPBuyerMatchS2";
export const EXECUTION_FILES = [
  "s2-billing-execution.mjs",
  "s2-billing-launch.mjs",
  "s2-billing-live-readers.mjs",
  "s2-billing-native-provider.mjs",
  "s2-stripe-native-watchdog.mjs",
  "s2-stripe-operator.mjs",
  "s2-stripe-campaign-args.mjs",
  "s2-billing-runner.mjs",
  "s2-billing-journal.mjs",
  "s2-billing-subscription-cleanup.mjs",
  "s2-billing-watchdog.mjs",
  "s2-canary-provider.mjs",
  "s2-canary-http-observer.mjs",
  "s2-receiver-pause-readback.mjs",
]
  .map((f) => fileURLToPath(new URL(f, import.meta.url)))
  .concat([
    fileURLToPath(new URL("../buyermatch-s2-release.mjs", import.meta.url)),
    fileURLToPath(
      new URL("../../server/buyermatch/s2-billing-window.js", import.meta.url),
    ),
  ]);

export async function assembleBillingExecution(config, factories = {}) {
  const plan = validateBillingPlan(config.plan, SOURCE, config.plan.startedAt),
    digest = hash(plan);
  if (
    plan.profile !== "activation" ||
    !/^[a-f0-9]{40}$/.test(config.operatorSource || "") ||
    !path.isAbsolute(config.directory || "")
  )
    deny();
  if (plan.mode === "HOSTED" && Object.keys(factories).length) deny(); // Never inject fixture ports into hosted mode.
  if (
    plan.mode === "HOSTED" &&
    (plan.expiresAt > Date.now() + 1800000 ||
      plan.startedAt > Date.now() + 300000)
  )
    deny();
  if (
    plan.mode === "LOCAL_SYNTHETIC" &&
    (["evidence", "platform", "stripe", "store"].some(
      (k) => typeof factories[k] !== "function",
    ) ||
      Object.keys(factories).some(
        (k) => !["evidence", "platform", "stripe", "store"].includes(k),
      ))
  )
    deny();
  if (
    plan.mode === "HOSTED" &&
    path.resolve(config.directory) !== path.resolve(BILLING_COORDINATION_ROOT)
  )
    deny();
  const evidence = await (factories.evidence ?? makePrivateEvidence)(
    config.directory,
    plan,
  );
  const approval = async () => {
    const a = await evidence.read("approval");
    if (
      a.planDigest !== digest ||
      a.cleanupOperatorSource !== config.operatorSource ||
      a.mode !== plan.mode ||
      a.scope !== "subscription-activation" ||
      a.approved !== true ||
      a.cancelCampaignCreatedTestSubscription !== true
    )
      deny();
    return a;
  };
  const verifyApproval = async (_plan, d) => {
    if (hash(_plan) !== digest || d !== digest) deny();
    if (config.intent === "verify-runtime")
      return {
        approved: true,
        planDigest: d,
        cleanupOperatorSource: config.operatorSource,
        mode: plan.mode,
        scope: "payment-free-preflight",
        cancelCampaignCreatedTestSubscription: false,
      };
    return approval();
  };
  const mutationApproval = async () => {
    if (config.intent !== "watch") deny();
    await approval();
  };
  const platform = await (factories.platform ?? makeNativePlatformProvider)(
    plan,
    {
      directory: config.directory,
      evidence,
      verifyMutationApproval: mutationApproval,
    },
  );
  let stripe;
  // The cycle is closed by real method delegation, not by canned safety booleans.
  const combined = {
    readIssuancePaused: (signal) => platform.readIssuancePaused(signal),
    listCampaignCheckouts: (signal) => stripe.listCampaignCheckouts(signal),
    readPriorCheckoutStates: (rows, signal) =>
      stripe.readPriorCheckoutStates(rows, signal),
    readSubscriptionSentinels: (signal) =>
      stripe.readSubscriptionSentinels(signal),
  };
  const readers = makeLiveBillingReaders(plan, {
    query: platform.query,
    provider: combined,
    evidence,
    approvedSource: SOURCE,
  });
  stripe = await (factories.stripe ?? makeNativeStripeWatchdog)(plan, {
    directory: config.directory,
    operatorSource: config.operatorSource,
    verifyApproval,
    readCheckoutPolicy: readers.readCheckoutPolicy,
    readCheckoutReceipt: readers.readCheckoutReceipt,
    verifyPreservation: readers.verifyPreservation,
  });
  const store = await (factories.store ?? billingEvidenceStore)(
    config.directory,
    plan,
  );
  const record = async (stage, status) =>
    evidence.create("execution-" + Date.now() + "-" + randomUUID(), {
      source: plan.source,
      runId: plan.runId,
      operatorSource: config.operatorSource,
      stage,
      status,
    });
  let executionStage = "CONSTRUCTED",
    prepared = false,
    claimed = false;
  const same = (requested) => {
    if (hash(requested) !== digest) deny();
  };
  const closePortalSessions = async (_plan, signal) => {
    same(_plan);
    const p = await stripe.readPortalConfiguration(signal);
    if (p.loginDisabled !== true) deny();
    const coverage = await platform.readPortalCoverage(signal);
    if (coverage.verified !== true) deny();
    // No Portal issuer exists in this runtime. Closing removes active Previews;
    // every remaining runtime must independently prove denial above.
    return { verified: true };
  };
  const prepare = async (signal) => {
    await record("STARTUP", "STARTED");
    executionStage = "PLATFORM_BASELINE";
    await platform.capturePlatformBaseline(signal);
    executionStage = "PRESERVATION_BASELINE";
    await readers.capturePreservationBaseline(signal);
    executionStage = "STRIPE_CONNECTION";
    const connection = await stripe.readConnection(signal);
    if (
      connection.account !== plan.account ||
      connection.livemode !== false ||
      !connection.endpointDisabled ||
      !connection.priceVerified ||
      !connection.subscriptionReadVerified
    )
      deny();
    executionStage = "CHECKOUT_RECEIPT";
    const receipts = await readers.readCheckoutReceipt(plan, signal);
    if (receipts.checkouts.length) deny();
    executionStage = "CHECKOUT_POLICY";
    await readers.verifyNoPriorUnreconciledCheckout(signal);
    await readers.readCheckoutPolicy(signal);
    executionStage = "PRESERVATION_READBACK";
    await readers.verifyPreservation(plan, signal);
    executionStage = "PORTAL_CONTAINMENT";
    await closePortalSessions(plan, signal);
    prepared = true;
    executionStage = "PREPARED";
    await record("STARTUP", "VERIFIED");
    return {
      nonProbe: true,
      allReadersConnected: true,
      providerReadsVerified: true,
      mutationAuthorized: config.intent === "watch",
      hostedCancellationVerified: false,
    };
  };
  const arm = async (signal) => {
    if (config.intent !== "watch") deny();
    await approval();
    if (!prepared) await prepare(signal);
    const ids = await stripe.readSubscriptionInventory(signal),
      observedAt = Date.now();
    if (observedAt > plan.startedAt) deny();
    const claim = await store.claimRun();
    if (claim.claimed !== true) deny();
    claimed = true;
    await store.recordSubscriptionBaseline({
      observedAt,
      subscriptionIds: ids,
    });
    await record("ARMED", "VERIFIED");
    return { armed: true };
  };
  const cleanup = async (signal) => {
    if (config.intent !== "watch" || !prepared || !claimed) deny();
    await mutationApproval();
    let evidenceHealthy = true;
    try {
      await evidence.create("closing", {
        source: plan.source,
        runId: plan.runId,
        planDigest: digest,
      });
    } catch (e) {
      if (e.code !== "EEXIST") evidenceHealthy = false;
      else {
        const c = await evidence.read("closing");
        if (c.planDigest !== digest) deny();
      }
    }
    try {
      await record("CLOSURE", "STARTED");
    } catch {
      evidenceHealthy = false;
    }
    const results = [];
    const call = async (name, fn) => {
      try {
        const value = await fn();
        results.push({ operation: name, verified: value?.verified === true });
        return value?.verified === true;
      } catch {
        results.push({ operation: name, verified: false });
        return false;
      }
    };
    // Always attempt independent pauses and exact owned-resource cleanup. Issuance
    // must be closed before DB/Stripe reconciliation can permit object mutation.
    await Promise.all([
      call("disableEndpoint", () => stripe.disableEndpoint(plan, signal)),
      call("pauseReceiver", () => platform.pauseReceiver(plan, signal)),
    ]);
    const removed = await call("restoreRoutingAndRemoveTemporaryPreview", () =>
      platform.restoreRoutingAndRemoveTemporaryPreview(plan, signal),
    );
    const checkout =
      removed &&
      (await call("closeNewCheckoutSessions", () =>
        stripe.closeNewCheckoutSessions(plan, signal),
      ));
    if (!removed)
      results.push({ operation: "closeNewCheckoutSessions", verified: false });
    if (checkout)
      await call("closeNewTestSubscriptions", () =>
        stripe.closeNewTestSubscriptions(plan, signal),
      );
    else
      results.push({ operation: "closeNewTestSubscriptions", verified: false });
    await call("closePortalSessions", () => closePortalSessions(plan, signal));
    await call("preservation", async () =>
      readers.verifyPreservation(plan, signal),
    );
    await call("platformReadback", async () => ({
      verified: await platform.readPlatformClosed(signal),
    }));
    let verified =
      evidenceHealthy &&
      results.length === 8 &&
      results.every((x) => x.verified);
    try {
      await record("CLOSURE", verified ? "VERIFIED" : "FAILED_OR_UNKNOWN");
    } catch {
      verified = false;
      evidenceHealthy = false;
    }
    const result = {
      source: plan.source,
      operatorSource: config.operatorSource,
      runId: plan.runId,
      status: verified ? "CLOSED" : "CLOSURE_UNVERIFIED",
      closureVerified: verified,
      requiresOperator: !verified,
      results,
      leaseReleased: false,
    };
    if (verified) {
      try {
        await evidence.create("resource-cleanup-receipt", {
          ...result,
          status: "RESOURCE_CLOSURE_VERIFIED",
          requiresOperator: true,
        });
        await store.journal({
          runId: plan.runId,
          source: plan.source,
          mode: plan.mode,
          stage: "closure",
          status: "VERIFIED",
        });
        await store.releaseRun(plan, { ...result, status: "FAILED_CONTAINED" });
        result.leaseReleased = true;
      } catch {
        verified = false;
      }
    }
    if (!verified) {
      result.status = "CLOSURE_UNVERIFIED";
      result.closureVerified = false;
      result.requiresOperator = true;
    }
    try {
      await evidence.create("cleanup-result", result);
    } catch {
      result.status = "CLOSURE_UNVERIFIED";
      result.closureVerified = false;
      result.requiresOperator = true;
    }
    return result;
  };
  const authorizeCampaignAction = async (kind, operationKey) => {
    if (
      config.intent !== "watch" ||
      Date.now() < plan.startedAt ||
      Date.now() >= plan.expiresAt ||
      !["preview", "checkout", "signed-event"].includes(kind)
    )
      deny();
    await approval();
    const ready = await evidence.read("watchdog-ready"),
      lease = await evidence.readLease();
    if (
      ready.operatorSource !== config.operatorSource ||
      ready.source !== plan.source ||
      ready.runId !== plan.runId ||
      ready.armed !== true ||
      lease.runId !== plan.runId ||
      lease.source !== plan.source ||
      lease.mode !== plan.mode
    )
      deny();
    try {
      await evidence.read("closing");
      deny();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const limits = { preview: 2, checkout: 1, "signed-event": 12 };
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(operationKey || "")) deny();
    // One create-only slot per allowed mutation; unknown writes consume the slot.
    // No restart, command failure or alternate key permits an extra object/event.
    for (let i = 0; i < limits[kind]; i++) {
      try {
        await evidence.create("intent-" + kind + "-" + i, {
          planDigest: digest,
          operationKey,
        });
        return { authorized: true, slot: i };
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const previous = await evidence.read("intent-" + kind + "-" + i);
        if (previous.operationKey === operationKey) deny();
      }
    }
    deny();
  };
  return {
    get executionStage() {
      return executionStage;
    },
    plan,
    readers,
    prepare,
    arm,
    cleanup,
    authorizeCampaignAction,
    evidence,
    async heartbeat() {
      await approval();
      return evidence.create("heartbeat-" + Date.now() + "-" + randomUUID(), {
        runId: plan.runId,
        planDigest: digest,
        at: Date.now(),
      });
    },
    async monitor({ parentPid, heartbeatMs = 15000, pollMs = 250 } = {}) {
      if (config.intent !== "watch") deny();
      await verifyLauncherExited(parentPid, { waitMs: 5000 });
      await arm(globalThis.AbortSignal.timeout(120000));
      await evidence.create("watchdog-ready", {
        runId: plan.runId,
        source: plan.source,
        operatorSource: config.operatorSource,
        nonProbe: true,
        armed: true,
      });
      while (Date.now() < plan.expiresAt) {
        try {
          const close = await evidence.read("close-request");
          if (
            close.runId !== plan.runId ||
            close.planDigest !== digest ||
            close.close !== true
          )
            deny();
          break;
        } catch (e) {
          if (e.code !== "ENOENT") break;
        }
        try {
          const h = await evidence.latestHeartbeat();
          if (
            h.planDigest !== digest ||
            h.runId !== plan.runId ||
            !Number.isSafeInteger(h.at) ||
            h.at > Date.now() + 1000 ||
            Date.now() - h.at > heartbeatMs
          )
            break;
        } catch {
          break;
        }
        await delay(pollMs);
      }
      return cleanup(globalThis.AbortSignal.timeout(120000));
    },
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [file, expectedHash, parent] = process.argv.slice(2);
  let config, evidence, runtime;
  try {
    if (
      !path.isAbsolute(file || "") ||
      !/^[a-f0-9]{64}$/.test(expectedHash || "")
    )
      deny();
    await verifyNativeCustody(
      [file, path.dirname(file)],
      globalThis.AbortSignal.timeout(10000),
    );
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
      deny();
    config = JSON.parse(bytes);
    if (
      config.plan.mode !== "HOSTED" ||
      !["verify-runtime", "watch"].includes(config.intent)
    )
      deny();
    if (config.intent === "watch") {
      const repo = fileURLToPath(new URL("../../", import.meta.url));
      const git = (args) => {
        const r = spawnSync("git", ["-C", repo, ...args], {
          windowsHide: true,
          encoding: "utf8",
          timeout: 10000,
        });
        if (r.status !== 0) deny();
        return r.stdout.trim();
      };
      if (git(["rev-parse", "HEAD"]) !== config.operatorSource) deny();
      const files = EXECUTION_FILES.map((f) =>
        path.relative(repo, f).replaceAll("\\", "/"),
      );
      git(["ls-files", "--error-unmatch", ...files]);
      git(["diff", "--quiet", "HEAD", "--", ...files]);
    }
    await verifyLauncherExited(Number(parent), { waitMs: 5000 });
    // Pin all executable dependency files, not merely a self-reported operator SHA.
    if (
      !Array.isArray(config.codePins) ||
      config.codePins.length !== EXECUTION_FILES.length ||
      new Set(config.codePins.map((p) => p.path)).size !==
        EXECUTION_FILES.length ||
      EXECUTION_FILES.some((f) => !config.codePins.some((p) => p.path === f))
    )
      deny();
    for (const p of config.codePins) {
      if (
        !path.isAbsolute(p.path) ||
        !/^[a-f0-9]{64}$/.test(p.sha256) ||
        createHash("sha256")
          .update(await readFile(p.path))
          .digest("hex") !== p.sha256
      )
        deny();
    }
    runtime = await assembleBillingExecution(config);
    evidence = runtime.evidence;
    const result =
      config.intent === "watch"
        ? await runtime.monitor({ parentPid: Number(parent) })
        : await runtime.prepare(globalThis.AbortSignal.timeout(180000));
    await evidence.create("worker-result", {
      status:
        config.intent === "watch"
          ? result.status
          : "NON_PROBE_RUNTIME_VERIFIED",
      ...result,
    });
  } catch {
    if (config)
      try {
        evidence ??= await makePrivateEvidence(config.directory, config.plan);
        await evidence.create("worker-result", {
          status: "UNVERIFIED",
          nonProbe: true,
          mutationsAuthorized: config.intent === "watch",
          passClaimed: false,
          failedAt: runtime?.executionStage ?? "CONSTRUCTION",
        });
      } catch {
        /* No unsafe path fallback or raw diagnostics. */
      }
    process.exitCode = 1;
  }
}
