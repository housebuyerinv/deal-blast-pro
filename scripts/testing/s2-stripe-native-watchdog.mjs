// Owner-context named-profile transport. Never reads the credential file contents.
import process from "node:process";
import path from "node:path";
import { spawn } from "node:child_process";
import { readFile, lstat, realpath, open, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeStripeOperator } from "./s2-stripe-operator.mjs";
import { billingEvidenceStore } from "./s2-billing-journal.mjs";
import { verifyLauncherExited } from "./s2-billing-watchdog.mjs";
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";
const sourceExe =
  "C:/Users/CTL Katastrophic/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe";
const toolHash =
  "88162aeacb9875bdb48b654a81f00ad45b9155a28545770144e7997f90efd486";
const deny = () => {
  throw Error("Native Stripe watchdog connection UNVERIFIED");
};
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
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
async function acl(files, signal) {
  if (process.platform !== "win32" || !files.every(path.isAbsolute)) deny();
  for (const f of files) {
    const s = await lstat(f);
    if (
      s.isSymbolicLink() ||
      (await realpath(f)).toLowerCase() !== path.resolve(f).toLowerCase()
    )
      deny();
  }
  // Only metadata is read. No Get-Content, CLI config output or key extraction.
  const literals = files
    .map((f) => "'" + f.replaceAll("'", "''") + "'")
    .join(",");
  const script = `$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$ok=$true;foreach($p in @(${literals})){$a=Get-Acl -LiteralPath $p;if($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){$ok=$false};foreach($r in $a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){$ok=$false}}};[pscustomobject]@{ownerVerified=$ok;restrictiveAclVerified=$ok}|ConvertTo-Json -Compress`;
  const value = await new Promise((resolve, reject) => {
    const child = spawn(
      path.join(
        process.env.SYSTEMROOT,
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: env(),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        signal,
        timeout: 10000,
      },
    );
    let out = "",
      bytes = 0;
    child.stdout.on("data", (b) => {
      bytes += b.length;
      if (bytes > 16384) child.kill();
      else out += b;
    });
    child.stderr.resume();
    child.once("error", () => reject(Error()));
    child.once("close", (c) => {
      try {
        if (c !== 0 || bytes > 16384) throw Error();
        resolve(JSON.parse(out));
      } catch {
        reject(Error());
      }
    });
  });
  if (value.ownerVerified !== true || value.restrictiveAclVerified !== true)
    deny();
  return value;
}
export async function makeNativeStripeWatchdog(
  plan,
  {
    directory,
    operatorSource,
    verifyApproval,
    readCheckoutPolicy,
    readCheckoutReceipt,
    verifyPreservation,
    readOnly = false,
  } = {},
) {
  if (
    !path.isAbsolute(directory) ||
    !/^[a-f0-9]{40}$/.test(operatorSource || "") ||
    typeof verifyApproval !== "function"
  )
    deny();
  if (
    !readOnly &&
    [readCheckoutPolicy, readCheckoutReceipt, verifyPreservation].some(
      (f) => typeof f !== "function",
    )
  )
    deny();
  const config = path.join(
    process.env.USERPROFILE,
    ".config/stripe/config.toml",
  );
  await acl(
    [directory, config, path.dirname(config)],
    globalThis.AbortSignal.timeout(10000),
  );
  // Stage only the public, pinned executable. Never copy its credential profile.
  // The installed executable's parent is writable by sandbox principals, so the
  // watchdog executes an exclusive hash-checked copy inside owner-only custody.
  const exe = path.join(directory, "stripe.exe");
  try {
    await copyFile(sourceExe, exe, constants.COPYFILE_EXCL);
  } catch (e) {
    if (e.code !== "EEXIST") deny();
  }
  if (
    createHash("sha256")
      .update(await readFile(exe))
      .digest("hex") !== toolHash
  )
    deny();
  const store = await billingEvidenceStore(directory, plan),
    nonce = randomUUID();
  let sequence = 0;
  const custody = async (_exe, _cwd, signal) => {
    const proof = await acl(
      [exe, path.dirname(exe), config, path.dirname(config), directory],
      signal,
    );
    if (
      createHash("sha256")
        .update(await readFile(exe))
        .digest("hex") !== toolHash
    )
      deny();
    return { ...proof, sha256: toolHash };
  };
  const journal = async (e) => {
    if (
      e.runId !== plan.runId ||
      e.source !== plan.source ||
      e.mode !== plan.mode ||
      e.stage !== "closure" ||
      !["STARTED", "PASS"].includes(e.status) ||
      Object.keys(e).sort().join(",") !== "mode,runId,source,stage,status"
    )
      deny();
    const file = await open(
      path.join(
        directory,
        plan.runId + ".native-" + nonce + "-" + sequence++ + ".json",
      ),
      "wx",
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(e) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    return { durable: true };
  };
  const operator = makeStripeOperator(plan, {
    approvedSource: plan.source,
    operatorSource,
    tool: { path: exe, sha256: toolHash },
    cwd: directory,
    verifyToolCustody: custody,
    verifyApproval,
    journal,
    environment: env(),
    subscriptionEvidenceStore: store,
    readCheckoutPolicy,
    verifyPreservation,
  });
  return {
    readConnection: operator.readConnection,
    closeNewTestSubscriptions: async (requested, signal) => {
      if (readOnly) deny();
      if (typeof readCheckoutReceipt !== "function") deny();
      const receipt = await readCheckoutReceipt(requested, signal);
      return operator.closeCampaignSubscription(
        requested,
        receipt,
        operatorSource,
        signal,
      );
    },
  };
}

// Read-only proof entrypoint: the launcher exits before this process authenticates.
// Cancellation is not exposed via CLI; only the validated factory above can do it.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [command, directory, parent, requestHash] = process.argv.slice(2);
  if (
    command !== "probe" ||
    !path.isAbsolute(directory || "") ||
    !/^[a-f0-9]{64}$/.test(requestHash || "")
  )
    deny();
  let stage = "EVIDENCE_CUSTODY",
    result = { status: "UNVERIFIED", mutations: 0 };
  try {
    await acl([directory, path.join(directory, "probe-request.json")]);
    stage = "SHARED_REQUEST";
    const request = JSON.parse(
      await readFile(path.join(directory, "probe-request.json"), "utf8"),
    );
    if (
      digest(request) !== requestHash ||
      request.plan.source !== "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc" ||
      request.plan.account !== S2.account ||
      request.plan.mode !== "HOSTED"
    )
      deny();
    stage = "LAUNCHER_EXIT";
    await verifyLauncherExited(Number(parent), { waitMs: 5000 });
    stage = "CONSTRUCTION";
    const transport = await makeNativeStripeWatchdog(request.plan, {
      directory,
      readOnly: true,
      operatorSource: request.operatorSource,
      verifyApproval: async (p, d) => {
        // Owner authorized this read-only connection proof, never a cancellation.
        if (
          d !== digest(request.plan) ||
          JSON.stringify(p) !== JSON.stringify(request.plan)
        )
          deny();
        return {
          approved: true,
          planDigest: d,
          mode: "HOSTED",
          scope: "payment-free-preflight",
        };
      },
    });
    stage = "PRIVATE_CONNECTION";
    result = {
      status: "READ_ONLY_CONNECTION_VERIFIED",
      launcherExited: true,
      durableSharedRequestVerified: true,
      ...(await transport.readConnection()),
      mutations: 0,
    };
  } catch {
    result.failedAt = stage;
    /* Never return raw provider/credential diagnostics. */
  }
  const file = await open(
    path.join(directory, "probe-result.json"),
    "wx",
    0o600,
  );
  try {
    await file.writeFile(JSON.stringify(result) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
}
