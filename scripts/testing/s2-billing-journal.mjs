// Sanitized operational evidence only. Never store credentials, URLs or API bodies.
import { open, lstat, realpath, readFile, unlink } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { subscriptionEvidenceScope } from "./s2-billing-subscription-cleanup.mjs";

const entry = z
  .object({
    runId: z.string().uuid(),
    source: z.string().regex(/^[a-f0-9]{40}$/),
    mode: z.enum(["LOCAL_SYNTHETIC", "HOSTED"]),
    stage: z.enum([
      "preflight",
      "activation",
      "checkout",
      "boundaries",
      "signature",
      "replay",
      "payment",
      "change",
      "renewal",
      "failure",
      "cancel",
      "operation",
      "closure",
    ]),
    status: z.enum(["STARTED", "PASS", "FAILED_OR_UNKNOWN", "VERIFIED"]),
  })
  .strict();

// Caller must independently approve filesystem ownership/ACLs. This module
// additionally rejects redirection and never overwrites/removes a prior claim.
export async function billingEvidenceStore(directory, plan) {
  if (
    !path.isAbsolute(directory) ||
    !z.string().uuid().safeParse(plan.runId).success ||
    !/^[a-f0-9]{40}$/.test(plan.source || "") ||
    !["LOCAL_SYNTHETIC", "HOSTED"].includes(plan.mode)
  )
    throw Error("Invalid evidence scope");
  plan = structuredClone(plan);
  const base = path.resolve(directory);
  for (let item = base; ; item = path.dirname(item)) {
    const info = await lstat(item);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw Error("Redirected or invalid evidence directory");
    if (item === path.dirname(item)) break;
  }
  if ((await realpath(base)).toLowerCase() !== base.toLowerCase())
    throw Error("Evidence path mismatch");
  let claimed = false,
    sequence = 0;
  let closureRecorded = false;
  const scope = { runId: plan.runId, source: plan.source, mode: plan.mode };
  const lock = { ...scope, nonce: randomUUID() },
    lockName = "dbp-s2-billing.lock.json";
  const write = async (filename, flags, value) => {
    // wx prevents existing claims being replaced; append handles use no truncation.
    const handle = await open(path.join(base, filename), flags, 0o600);
    try {
      await handle.writeFile(JSON.stringify(value) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  const subscriptionScope = subscriptionEvidenceScope(plan);
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const evidenceFile = (kind) =>
    path.join(base, scope.runId + ".subscription-" + kind + ".json");
  const readEvidence = async (kind) => {
    const file = evidenceFile(kind),
      info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 262144)
      throw Error("Invalid subscription evidence");
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!Object.entries(subscriptionScope).every(([k, v]) => value[k] === v))
      throw Error("Subscription evidence scope mismatch");
    return value;
  };
  const creationSchema = z
    .object({
      subscription: z.string().regex(/^sub_[A-Za-z0-9]+$/),
      customer: z.string().regex(/^cus_[A-Za-z0-9]+$/),
      session: z.string().regex(/^cs_test_[A-Za-z0-9]+$/),
      checkoutId: z.string().uuid(),
    })
    .strict();
  const readSubscriptionEvidence = async (requested) => {
    if (
      JSON.stringify(subscriptionEvidenceScope(requested)) !==
      JSON.stringify(subscriptionScope)
    )
      throw Error("Subscription scope changed");
    const baseline = await readEvidence("baseline");
    let creation = null;
    try {
      creation = await readEvidence("creation");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return {
      durable: true,
      baseline,
      baselineSha256: digest(baseline),
      creation,
      creationSha256: creation ? digest(creation) : null,
    };
  };
  return {
    async recordSubscriptionBaseline(value) {
      if (!claimed) throw Error("Run claim required");
      const v = z
        .object({
          observedAt: z.number().int().nonnegative().max(plan.startedAt),
          subscriptionIds: z
            .array(z.string().regex(/^sub_[A-Za-z0-9]+$/))
            .max(1000),
        })
        .strict()
        .parse(value);
      if (new Set(v.subscriptionIds).size !== v.subscriptionIds.length)
        throw Error("Ambiguous subscription baseline");
      const data = { ...subscriptionScope, ...v };
      await write(scope.runId + ".subscription-baseline.json", "wx", data);
      return { durable: true, sha256: digest(await readEvidence("baseline")) };
    },
    async recordSubscriptionCreation(value) {
      // A separately started watchdog may append the single creation receipt,
      // but cannot acquire/release another process's run or overwrite evidence.
      const runClaim = JSON.parse(
        await readFile(path.join(base, scope.runId + ".claim.json"), "utf8"),
      );
      const runLock = JSON.parse(
        await readFile(path.join(base, lockName), "utf8"),
      );
      if (
        ![runClaim, runLock].every((v) =>
          Object.entries(scope).every(([k, x]) => v[k] === x),
        )
      )
        throw Error("Run claim required");
      const v = creationSchema.parse(value),
        baseline = await readEvidence("baseline");
      if (Date.now() < plan.startedAt)
        throw Error("Creation evidence before campaign");
      if (baseline.subscriptionIds.includes(v.subscription))
        throw Error("Pre-existing subscription");
      const data = {
        ...subscriptionScope,
        ...v,
        recordedAt: Date.now(),
        baselineSha256: digest(baseline),
      };
      await write(scope.runId + ".subscription-creation.json", "wx", data);
      return { durable: true, sha256: digest(await readEvidence("creation")) };
    },
    readSubscriptionEvidence,
    async claimSubscriptionCancellation(requested, record, creationSha256) {
      const evidence = await readSubscriptionEvidence(requested);
      if (
        !evidence.creation ||
        evidence.creationSha256 !== creationSha256 ||
        JSON.stringify(record) !== JSON.stringify(evidence.creation)
      )
        throw Error("Cancellation evidence mismatch");
      const intent = {
        ...subscriptionScope,
        subscription: record.subscription,
        creationSha256,
      };
      try {
        await write(
          scope.runId + ".subscription-cancellation-intent.json",
          "wx",
          intent,
        );
      } catch (e) {
        if (e.code === "EEXIST") return { claimed: false };
        throw e;
      }
      return { claimed: true };
    },
    async claimRun() {
      try {
        await lstat(path.join(base, scope.runId + ".claim.json"));
        throw Error("Existing run claim; no retry");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      // One shared, independently custody-verified directory for ALL S2 runs.
      // Per-run claims alone cannot exclude a conflicting run with another UUID.
      await write(lockName, "wx", lock);
      await write(scope.runId + ".claim.json", "wx", scope);
      claimed = true;
      return { claimed: true };
    },
    async journal(value) {
      const data = entry.parse(value);
      if (
        !claimed ||
        data.runId !== scope.runId ||
        data.source !== scope.source ||
        data.mode !== scope.mode
      )
        throw Error("Unclaimed or mismatched evidence");
      // No resume of a different process. Journals are per-claim; exclusive create
      // on first entry prevents following a previously placed file or link.
      await write(
        scope.runId + "." + String(sequence++).padStart(4, "0") + ".json",
        "wx",
        data,
      );
      if (data.stage === "closure")
        closureRecorded = data.status === "VERIFIED";
      return { durable: true };
    },
    async releaseRun(_plan, result) {
      if (
        !claimed ||
        !closureRecorded ||
        result?.runId !== scope.runId ||
        result.source !== scope.source ||
        result.closureVerified !== true ||
        result.requiresOperator !== false ||
        !["PASS", "FAILED_CONTAINED"].includes(result.status)
      )
        throw Error("Verified closure required before releasing S2 lock");
      const file = path.join(base, lockName),
        info = await lstat(file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        JSON.stringify(JSON.parse(await readFile(file, "utf8"))) !==
          JSON.stringify(lock)
      )
        throw Error("S2 lock ownership uncertain; preserved");
      await unlink(file);
      claimed = false;
      return { released: true }; // Run claim/evidence remain.
    },
  };
}
