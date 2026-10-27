// Library only. No provider defaults, activation, environment reads or launch on import.
import process from "node:process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { setTimeout, clearTimeout } from "node:timers";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
const AbortController = globalThis.AbortController;

export async function verifyLauncherExited(
  pid,
  { probe = (p) => process.kill(p, 0), waitMs = 5000 } = {},
) {
  if (
    !Number.isSafeInteger(pid) ||
    pid < 1 ||
    pid === process.pid ||
    !Number.isInteger(waitMs) ||
    waitMs < 1 ||
    waitMs > 5000
  )
    throw Error("Launcher identity invalid");
  const end = Date.now() + waitMs;
  do {
    try {
      probe(pid);
    } catch (error) {
      if (error?.code === "ESRCH") return true;
      throw Error("Launcher state UNKNOWN"); // EPERM is not an exited launcher.
    }
    await delay(20);
  } while (Date.now() < end);
  throw Error("Launcher still active");
}

export async function runIndependentBillingCleanup(
  input,
  adapter,
  { approvedSource, parentPid, journal, timeoutMs = 1000, waitMs = 5000 } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, input.startedAt);
  if (
    typeof journal !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw Error("Watchdog configuration invalid");
  const names = [
    "disableEndpoint",
    "pauseReceiver",
    "closeNewCheckoutSessions",
    "closePortalSessions",
    "restoreRoutingAndRemoveTemporaryPreview",
  ];
  if (names.some((n) => typeof adapter?.[n] !== "function"))
    throw Error("Watchdog adapter incomplete");
  // Independent process proof precedes any cleanup calls. No signal to kill parent.
  await verifyLauncherExited(parentPid, { waitMs });
  try {
    const digest = createHash("sha256")
      .update(JSON.stringify(plan))
      .digest("hex");
    const approval = await bounded(
      (signal) => adapter.verifyApproval(plan, digest, signal),
      timeoutMs,
    );
    const authority = await bounded(
      (signal) => adapter.verifyAuthority(plan, signal),
      timeoutMs,
    );
    if (
      approval?.approved !== true ||
      approval.planDigest !== digest ||
      approval.mode !== plan.mode ||
      authority?.project !== plan.project ||
      authority.team !== plan.team ||
      authority.database !== plan.database ||
      authority.account !== plan.account ||
      authority.endpoint !== plan.endpoint ||
      authority.livemode !== false ||
      authority.ownerAuthorized !== true
    )
      throw Error();
  } catch {
    throw Error("Independent approval/authority unavailable; no mutations");
  }
  let evidence = true;
  const record = async (stage, status) => {
    try {
      const r = await bounded(
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
      if (r?.durable !== true) evidence = false;
    } catch {
      evidence = false;
    }
  };
  await record("closure", "STARTED");
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        return {
          operation: name,
          verified:
            (await bounded((signal) => adapter[name](plan, signal), timeoutMs))
              ?.verified === true,
        };
      } catch {
        return { operation: name, verified: false };
      }
    }),
  );
  const verified = evidence && results.every((r) => r.verified);
  await record("closure", verified ? "VERIFIED" : "FAILED_OR_UNKNOWN");
  // This receipt proves cleanup CALLS only. Provider readback/preservation must
  // still pass independently in the billing runner; no global closure PASS here.
  return {
    mode: plan.mode,
    runId: plan.runId,
    source: plan.source,
    launcherExited: true,
    cleanupCallsVerified: verified && evidence,
    independentReadbackRequired: true,
    results,
  };
}

async function bounded(fn, ms) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("Watchdog deadline"));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Optional scheduling wrapper; never opens a gate. Unknown stop state closes now.
// ready acknowledges monitoring only, NOT verified provider cleanup authority.
export async function monitorBillingWindow(input, adapter, options) {
  const plan = validateBillingPlan(
    input,
    options?.approvedSource,
    input.startedAt,
  );
  const {
    parentPid,
    readCloseRequest,
    ready,
    timeoutMs = 1000,
    waitMs = 5000,
  } = options || {};
  if (
    typeof readCloseRequest !== "function" ||
    typeof ready !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw Error("Watchdog monitor incomplete");
  await verifyLauncherExited(parentPid, { waitMs });
  let reason = "DEADLINE";
  try {
    const receipt = await bounded(
      () =>
        ready({
          runId: plan.runId,
          source: plan.source,
          mode: plan.mode,
          monitoringOnly: true,
        }),
      timeoutMs,
    );
    if (receipt?.durable !== true) throw Error();
    while (Date.now() < plan.expiresAt) {
      const stop = await bounded(
        (signal) => readCloseRequest(signal),
        Math.min(timeoutMs, Math.max(1, plan.expiresAt - Date.now())),
      );
      if (
        stop?.runId !== plan.runId ||
        stop.source !== plan.source ||
        typeof stop.close !== "boolean"
      )
        throw Error();
      if (stop.close) {
        reason = "CLOSE_REQUEST";
        break;
      }
      await delay(Math.min(20, Math.max(1, plan.expiresAt - Date.now())));
    }
  } catch {
    reason = "UNKNOWN_STOP_STATE";
  }
  const result = await runIndependentBillingCleanup(plan, adapter, options);
  return { ...result, reason };
}
