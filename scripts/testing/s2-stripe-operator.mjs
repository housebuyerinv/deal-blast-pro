// Named CLI profile owns authentication; no key/config-file extraction or output.
import { spawn } from "node:child_process";
import { readFile, lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import path from "node:path";
import process from "node:process";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
import {
  scopedStripeArgs,
  stripeProfileAccount,
} from "./s2-canary-provider.mjs";
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";

export function combineBillingStripeTransports(operator, runtime) {
  if (
    typeof operator?.stripeRequest !== "function" ||
    typeof runtime?.stripeRequest !== "function"
  )
    throw Error("Stripe transports incomplete");
  return (request) =>
    request?.path === "/v1/webhook_endpoints/" + S2.endpoint
      ? operator.stripeRequest(request)
      : runtime.stripeRequest(request);
}
const deny = () => {
  throw Error("S2_STRIPE_OPERATOR_UNVERIFIED; no automatic retry");
};
export function makeStripeOperator(
  input,
  {
    approvedSource,
    tool,
    cwd,
    verifyToolCustody,
    verifyApproval,
    journal,
    spawnProcess = spawn,
    environment = process.env,
    timeoutMs = 10000,
  } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, input.startedAt);
  if (
    !path.isAbsolute(tool?.path || "") ||
    !/^[a-f0-9]{64}$/.test(tool?.sha256 || "") ||
    !path.isAbsolute(cwd || "") ||
    [verifyToolCustody, verifyApproval, journal, spawnProcess].some(
      (f) => typeof f !== "function",
    ) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    (plan.mode === "HOSTED" &&
      path.basename(tool.path).toLowerCase() !== "stripe.exe")
  )
    deny();
  const executable = tool.path,
    hash = tool.sha256,
    root = path.resolve(cwd),
    digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const names = [
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "COMSPEC",
    "PATHEXT",
    "PATH",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "HOMEDRIVE",
    "HOMEPATH",
    "USERNAME",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
  ];
  const env = Object.fromEntries(
    names
      .filter((k) => typeof environment[k] === "string")
      .map((k) => [k, environment[k]]),
  );
  async function run(args, external) {
    const signal = globalThis.AbortSignal.any([
      globalThis.AbortSignal.timeout(timeoutMs),
      ...(external ? [external] : []),
    ]);
    let abort;
    try {
      return await Promise.race([
        execute(args, signal),
        new Promise((_, reject) => {
          abort = () =>
            reject(Error("S2_STRIPE_OPERATOR_UNVERIFIED; no automatic retry"));
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  async function execute(args, signal) {
    let timer, child;
    try {
      if (signal?.aborted) deny();
      const consent = await verifyApproval(plan, digest, signal);
      if (
        consent?.approved !== true ||
        consent.planDigest !== digest ||
        consent.mode !== plan.mode
      )
        deny();
      const [file, folder] = await Promise.all([
        lstat(executable),
        lstat(root),
      ]);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        !folder.isDirectory() ||
        folder.isSymbolicLink() ||
        (await realpath(executable)).toLowerCase() !==
          path.resolve(executable).toLowerCase() ||
        (await realpath(root)).toLowerCase() !== root.toLowerCase() ||
        createHash("sha256")
          .update(await readFile(executable))
          .digest("hex") !== hash
      )
        deny();
      const custody = await verifyToolCustody(executable, root, signal);
      if (
        custody?.ownerVerified !== true ||
        custody.restrictiveAclVerified !== true ||
        custody.sha256 !== hash
      )
        deny();
      if (
        (
          await journal({
            runId: plan.runId,
            source: plan.source,
            mode: plan.mode,
            stage: "closure",
            status: "STARTED",
          })
        )?.durable !== true ||
        signal?.aborted
      )
        deny();
      const argv = scopedStripeArgs(args);
      const raw = await new Promise((resolve, reject) => {
        let stdout = "",
          bytes = 0,
          stopped = false;
        child = spawnProcess(executable, argv, {
          cwd: root,
          env,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const abort = () => {
          stopped = true;
          child.kill();
        };
        timer = setTimeout(abort, timeoutMs);
        signal?.addEventListener("abort", abort, { once: true });
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        child.stdout.on("data", (b) => {
          bytes += b.length;
          if (bytes > 65536) abort();
          else stdout += b;
        });
        child.stderr.on("data", (b) => {
          bytes += b.length;
          if (bytes > 65536) abort();
        }); // Never retain provider stderr.
        child.once("error", () => {
          cleanup();
          reject(Error());
        });
        child.once("close", (code) => {
          cleanup();
          if (stopped || code !== 0) reject(Error());
          else resolve(stdout);
        });
      });
      const body = JSON.parse(raw);
      if (signal?.aborted) deny();
      if (
        (
          await journal({
            runId: plan.runId,
            source: plan.source,
            mode: plan.mode,
            stage: "closure",
            status: "PASS",
          })
        )?.durable !== true
      )
        deny();
      return body;
    } catch {
      deny();
    } finally {
      clearTimeout(timer);
    }
  }
  const endpoint = (e) => {
    if (
      e?.id !== plan.endpoint ||
      e.livemode !== false ||
      e.url !==
        `https://${plan.database}.supabase.co/functions/v1/stripe-webhook` ||
      !["enabled", "disabled"].includes(e.status)
    )
      deny();
    return { id: e.id, livemode: false, url: e.url, status: e.status };
  };
  return {
    async readIdentity(signal) {
      const who = await run(["whoami", "--format", "json"], signal);
      return { account: stripeProfileAccount(who), mode: "test" };
    },
    async stripeRequest({
      method,
      path: requestPath,
      body,
      account,
      mode,
      retries,
      signal,
    }) {
      if (
        account !== plan.account ||
        mode !== "test" ||
        retries !== 0 ||
        requestPath !== "/v1/webhook_endpoints/" + plan.endpoint
      )
        deny();
      if (
        method !== "GET" &&
        !(
          method === "POST" &&
          body?.disabled === true &&
          Object.keys(body).length === 1
        )
      )
        deny();
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const current = endpoint(
        await run(["webhook_endpoints", "retrieve", plan.endpoint], signal),
      );
      if (method === "GET") return current;
      const updated = endpoint(
        await run(
          [
            "webhook_endpoints",
            "update",
            plan.endpoint,
            "--disabled=true",
            "--confirm",
          ],
          signal,
        ),
      );
      if (updated.status !== "disabled") deny();
      return updated; // Containment adapter does independent final readback.
    },
  };
}
