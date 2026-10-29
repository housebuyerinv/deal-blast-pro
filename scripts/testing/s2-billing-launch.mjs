// Owner-operated entrypoint. verify-runtime is provider-read-only. start requires
// an explicitly authorized exact operator SHA and a clean committed source tree.
import process from "node:process";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { readFile, open } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import {
  BILLING_COORDINATION_ROOT as directory,
  EXECUTION_FILES,
  assembleBillingExecution,
} from "./s2-billing-execution.mjs";
import { makePrivateEvidence } from "./s2-billing-native-provider.mjs";
import { verifyNativeCustody } from "./s2-stripe-native-watchdog.mjs";
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const deny = () => {
  throw Error("Billing launch precondition UNVERIFIED");
};
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
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
const env = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      [
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
      ].includes(k.toUpperCase()),
    ),
  );
const [command, arg, kind, operationKey] = process.argv.slice(2);
try {
  if (
    !["verify-runtime", "start", "beat", "close", "reserve"].includes(command)
  )
    deny();
  await verifyNativeCustody([directory], globalThis.AbortSignal.timeout(10000));
  if (["beat", "close", "reserve"].includes(command)) {
    if (!/^[a-f0-9-]{36}$/.test(arg || "")) deny();
    const file = path.join(directory, arg + ".runtime-config.json");
    await verifyNativeCustody([file], globalThis.AbortSignal.timeout(10000));
    const config = JSON.parse(await readFile(file, "utf8"));
    if (
      config.intent !== "watch" ||
      config.operatorSource !== git(["rev-parse", "HEAD"]) ||
      config.plan.runId !== arg
    )
      deny();
    const e = await makePrivateEvidence(directory, config.plan),
      a = await e.read("approval");
    if (
      a.planDigest !== digest(config.plan) ||
      a.cleanupOperatorSource !== config.operatorSource ||
      a.approved !== true
    )
      deny();
    if (command === "reserve") {
      const runtime = await assembleBillingExecution(config),
        result = await runtime.authorizeCampaignAction(kind, operationKey);
      process.stdout.write(
        JSON.stringify({ runId: arg, command, kind, ...result }),
      );
    } else if (command === "beat")
      await e.create("heartbeat-" + Date.now() + "-" + randomUUID(), {
        runId: arg,
        planDigest: digest(config.plan),
        at: Date.now(),
      });
    else
      await e.create("close-request", {
        runId: arg,
        planDigest: digest(config.plan),
        close: true,
      });
    if (command !== "reserve")
      process.stdout.write(
        JSON.stringify({ runId: arg, command, recorded: true }),
      );
  } else {
    const operatorSource = git(["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(operatorSource)) deny();
    if (command === "start") {
      if (arg !== operatorSource) deny();
      const files = EXECUTION_FILES.map((f) =>
        path.relative(repo, f).replaceAll("\\", "/"),
      );
      git(["ls-files", "--error-unmatch", ...files]);
      git(["diff", "--quiet", "HEAD", "--", ...files]);
    }
    const now = Date.now(),
      runId = randomUUID(),
      plan = {
        source: "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
        runId,
        project: S2.project,
        team: S2.team,
        database: S2.staging,
        account: S2.account,
        endpoint: S2.endpoint,
        owner: S2_PRO_OWNER,
        mode: "HOSTED",
        profile: "activation",
        startedAt: now + 300000,
        expiresAt: now + 1800000,
      };
    const config = {
      intent: command === "start" ? "watch" : "verify-runtime",
      operatorSource,
      directory,
      plan,
      codePins: await Promise.all(
        EXECUTION_FILES.map(async (p) => ({
          path: p,
          sha256: createHash("sha256")
            .update(await readFile(p))
            .digest("hex"),
        })),
      ),
    };
    const evidence = await makePrivateEvidence(directory, plan);
    if (command === "start") {
      await evidence.create("approval", {
        approved: true,
        mode: plan.mode,
        scope: "subscription-activation",
        planDigest: digest(plan),
        cleanupOperatorSource: operatorSource,
        cancelCampaignCreatedTestSubscription: true,
      });
      await evidence.create("heartbeat-" + now + "-" + randomUUID(), {
        runId,
        planDigest: digest(plan),
        at: now,
      });
    }
    const text = JSON.stringify(config),
      file = path.join(directory, runId + ".runtime-config.json"),
      f = await open(file, "wx", 0o600);
    try {
      await f.writeFile(text);
      await f.sync();
    } finally {
      await f.close();
    }
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("./s2-billing-execution.mjs", import.meta.url)),
        file,
        createHash("sha256").update(text).digest("hex"),
        String(process.pid),
      ],
      {
        env: env(),
        cwd: repo,
        windowsHide: true,
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
    process.stdout.write(
      JSON.stringify({
        runId,
        workerPid: child.pid,
        operatorSource,
        intent: config.intent,
        deadline: plan.expiresAt,
        mutationAuthorized: command === "start",
      }),
    );
  }
} catch {
  process.stderr.write("BILLING_LAUNCH_UNVERIFIED\n");
  process.exitCode = 1;
}
