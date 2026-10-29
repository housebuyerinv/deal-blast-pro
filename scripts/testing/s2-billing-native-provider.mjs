// Native owner-profile provider. Fixed S2 scope; no credential extraction.
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import {
  readFile,
  writeFile,
  open,
  lstat,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  S2_RELEASE as S2,
  REQUIRED_S2_ENV,
} from "../buyermatch-s2-release.mjs";
import { verifyNativeCustody } from "./s2-stripe-native-watchdog.mjs";
import { readPausedReceiver } from "./s2-receiver-pause-readback.mjs";
import {
  PRESERVATION_SQL,
  checkoutReadSql,
  priorCheckoutReadSql,
} from "./s2-billing-live-readers.mjs";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
import { readLegacyPortalCoverage } from "./s2-legacy-portal-coverage.mjs";
const deny = () => {
  throw Error("S2 native provider UNVERIFIED");
};
const sha = (x) => createHash("sha256").update(x).digest("hex");
const npm = "C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/";
const originals = {
  supabase:
    npm + "supabase/node_modules/@supabase/cli-windows-x64/bin/supabase.exe",
  vercel: npm + "vercel/dist/vc.js",
};
const pins = {
  supabase: "903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118",
  vercel: "33542f1ec34ec6b9953ee7486c7ae5f9cc2a2b0225671ece4ed22fe8625bab86",
};
export function portalSourceMatches(source) {
  if (!/^[a-f0-9]{40}$/.test(source || "")) return false;
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  const blob = (ref, f) => {
    const r = spawnSync("git", ["-C", repo, "rev-parse", ref + ":" + f], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 10000,
    });
    return r.status === 0 && /^[a-f0-9]{40}\s*$/.test(r.stdout)
      ? r.stdout.trim()
      : null;
  };
  return [
    "api/create-billing-portal-session.ts",
    "server/buyermatch/portal.js",
    "server/buyermatch/s2-billing-window.js",
  ].every((f) => {
    const approved = blob("68c5cf9f4d8fcd590e45dd536eab1eb29edecccc", f);
    return approved && blob(source, f) === approved;
  });
}
export function ownsCampaignPreview(d, b, plan, currentAliasTarget) {
  return (
    d?.projectId === S2.project &&
    d.ownerId === S2.team &&
    d.target === null &&
    d.meta?.githubCommitSha === plan.source &&
    d.meta?.s2RunId === plan.runId &&
    /^dpl_[A-Za-z0-9]+$/.test(d.id || "") &&
    !b.ids.includes(d.id) &&
    d.id !== S2.fallback &&
    Number.isSafeInteger(d.createdAt) &&
    d.createdAt >= plan.startedAt &&
    d.createdAt <= plan.expiresAt &&
    Array.isArray(d.alias) &&
    (d.alias.length === 0 ||
      (d.alias.length === 1 &&
        d.alias[0] === new URL(S2.origin).hostname &&
        currentAliasTarget === d.id))
  );
}
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
export async function makePrivateEvidence(directory, plan) {
  await verifyNativeCustody([directory], globalThis.AbortSignal.timeout(10000));
  const file = (name) => {
    if (!/^[a-zA-Z0-9-]{1,140}$/.test(name)) deny();
    return path.join(directory, plan.runId + "." + name + ".json");
  };
  const api = {
    async create(name, value) {
      const f = await open(file(name), "wx", 0o600);
      try {
        await f.writeFile(JSON.stringify(value) + "\n");
        await f.sync();
      } finally {
        await f.close();
      }
      return { durable: true };
    },
    async read(name) {
      const p = file(name),
        s = await lstat(p);
      if (!s.isFile() || s.isSymbolicLink() || s.size > 262144) deny();
      await verifyNativeCustody([p], globalThis.AbortSignal.timeout(10000));
      return JSON.parse(await readFile(p, "utf8"));
    },
    async readLease() {
      const p = path.join(directory, "dbp-s2-billing.lock.json"),
        s = await lstat(p);
      if (!s.isFile() || s.isSymbolicLink() || s.size > 1024) deny();
      await verifyNativeCustody([p], globalThis.AbortSignal.timeout(10000));
      return JSON.parse(await readFile(p, "utf8"));
    },
    async latestHeartbeat() {
      const names = (await readdir(directory))
        .filter(
          (n) =>
            n.startsWith(plan.runId + ".heartbeat-") &&
            /\.heartbeat-[0-9]{13}-[a-f0-9-]{36}\.json$/.test(n),
        )
        .sort();
      if (!names.length || names.length > 1000) deny();
      return api.read(names.at(-1).slice(plan.runId.length + 1, -5));
    },
  };
  return api;
}
export async function makeNativePlatformProvider(
  input,
  { directory, evidence, verifyMutationApproval } = {},
) {
  const plan = validateBillingPlan(
    input,
    "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
    input.startedAt,
  );
  if (
    plan.database !== S2.staging ||
    plan.project !== S2.project ||
    plan.team !== S2.team ||
    !path.isAbsolute(directory) ||
    typeof verifyMutationApproval !== "function"
  )
    deny();
  await verifyNativeCustody([directory], globalThis.AbortSignal.timeout(10000));
  for (const [k, p] of Object.entries(originals))
    if (sha(await readFile(p)) !== pins[k]) deny();
  const sqlExe = path.join(directory, "supabase.exe");
  try {
    await copyFile(originals.supabase, sqlExe, constants.COPYFILE_EXCL);
  } catch (e) {
    if (e.code !== "EEXIST") deny();
  }
  if (sha(await readFile(sqlExe)) !== pins.supabase) deny();
  await verifyNativeCustody([sqlExe], globalThis.AbortSignal.timeout(10000));
  const dbRoot = path.join(directory, "database");
  try {
    await mkdir(dbRoot);
  } catch (e) {
    if (e.code !== "EEXIST") deny();
  }
  await mkdir(path.join(dbRoot, "supabase/.temp"), { recursive: true });
  const ref = path.join(dbRoot, "supabase/.temp/project-ref");
  try {
    await writeFile(ref, S2.staging, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") deny();
  }
  if ((await readFile(ref, "utf8")) !== S2.staging) deny();
  const observer = new URL("./s2-canary-http-observer.mjs", import.meta.url)
    .href;
  async function run(tool, args, signal) {
    if (signal?.aborted) deny();
    if (tool === "supabase") {
      if (sha(await readFile(sqlExe)) !== pins.supabase) deny();
      await verifyNativeCustody([sqlExe, directory], signal);
    } else if (sha(await readFile(originals.vercel)) !== pins.vercel) deny();
    return new Promise((resolve, reject) => {
      const statuses = [],
        argv =
          tool === "supabase"
            ? args
            : ["--import", observer, originals.vercel, ...args];
      const c = spawn(tool === "supabase" ? sqlExe : process.execPath, argv, {
        env: { ...env(), NO_UPDATE_NOTIFIER: "1" },
        cwd: directory,
        shell: false,
        windowsHide: true,
        stdio:
          tool === "supabase"
            ? ["ignore", "pipe", "pipe"]
            : ["ignore", "pipe", "pipe", "ipc"],
        signal,
        timeout: 20000,
      });
      let stdout = "",
        bytes = 0;
      const diagnostics = new Set();
      c.on("message", (m) => {
        if (m?.type === "scoped-http-status" && m.method === "GET")
          statuses.push({ path: m.path, status: m.status });
      });
      c.stdout.on("data", (b) => {
        bytes += b.length;
        if (bytes > 2097152) c.kill();
        else stdout += b;
      });
      c.stderr.on("data", (b) => {
        bytes += b.length;
        const text = b.toString();
        for (const [k, re] of Object.entries({
          PERMISSION: /403|unauthorized|permission denied/i,
          MODULE:
            /cannot find module|ERR_MODULE|ERR_UNSUPPORTED_ESM_URL_SCHEME/i,
          ENVIRONMENT: /environment|env run/i,
          TIMEOUT: /timed out|timeout/i,
          UPDATE_CHECK: /dist-tags|package info|update check/i,
        }))
          if (re.test(text)) diagnostics.add(k);
        if (bytes > 2097152) c.kill();
      });
      c.once("error", () => reject(Error("Private provider unavailable")));
      c.once("close", (code) => {
        if (bytes > 2097152 || signal?.aborted)
          reject(Error("Private provider unavailable"));
        else resolve({ code, stdout, statuses, diagnostics: [...diagnostics] });
      });
    });
  }
  const api = async (p, signal) => {
    if (!p.startsWith("/") || p.includes("://") || p.includes("..")) deny();
    const u = new URL(p, "https://api.vercel.com");
    u.searchParams.set("teamId", S2.team);
    const r = await run(
      "vercel",
      [
        "api",
        u.pathname + u.search,
        "--method",
        "GET",
        "--scope",
        S2.team,
        "--non-interactive",
        "--raw",
      ],
      signal,
    );
    const states = r.statuses
      .filter((x) => x.path === u.pathname)
      .map((x) => x.status);
    await evidence.create("provider-read-" + randomUUID(), {
      path: u.pathname,
      statuses: states,
      exitCode: r.code,
    });
    if (
      !states.length ||
      new Set(states).size !== 1 ||
      ![200, 404].includes(states[0]) ||
      (states[0] === 200 && r.code !== 0)
    )
      deny();
    return {
      status: states[0],
      body: states[0] === 200 ? JSON.parse(r.stdout) : null,
    };
  };
  const inventory = async (signal) => {
    const r = await api(
      "/v6/deployments?projectId=" + S2.project + "&limit=100",
      signal,
    );
    if (!Array.isArray(r.body?.deployments) || r.body.pagination?.next) deny();
    return r.body.deployments;
  };
  const readAlias = async (signal) => {
    const r = (await api("/v4/aliases/" + new URL(S2.origin).hostname, signal))
      .body;
    if (
      r?.projectId !== S2.project ||
      (r.deploymentId ?? r.deployment?.id) !== S2.fallback
    )
      deny();
    return true;
  };
  const managedEnvironment = async (signal) => {
    const r = await run(
      "vercel",
      [
        "env",
        "run",
        "--project",
        S2.project,
        "--environment",
        "preview",
        "--scope",
        S2.team,
        "--",
        process.execPath,
        fileURLToPath(import.meta.url),
        "env-report",
      ],
      signal,
    );
    await evidence.create("managed-env-command-" + randomUUID(), {
      exitCode: r.code,
      outputBytes: r.stdout.length,
      diagnostics: r.diagnostics,
    });
    if (r.code !== 0) deny();
    const candidates = r.stdout.split(/\r?\n/).flatMap((line) => {
      try {
        const e = JSON.parse(line);
        return e?.settings && e?.project ? [e] : [];
      } catch {
        return [];
      }
    });
    if (candidates.length !== 1) deny();
    const e = candidates[0];
    await evidence.create("managed-env-observation-" + randomUUID(), {
      scopeVerified: e.scopeVerified === true,
      mismatchedSettings: Object.entries(REQUIRED_S2_ENV)
        .filter(([k, v]) => e.settings[k] !== v)
        .map(([k]) => k),
    });
    if (
      e.scopeVerified !== true ||
      e.project !== S2.project ||
      e.database !== S2.staging ||
      Object.keys(e.settings || {}).length !== 17
    )
      deny();
    return e.settings;
  };
  const paused = async (signal) => {
    const s = await managedEnvironment(signal);
    // Project-wide issuance pauses are distinct from the candidate's full17
    // build/runtime contract (origin, catalog diagnostics, agreement policy).
    // Immutable deployment coverage is checked separately, never inferred here.
    return [
      "DBP_REGISTRATION_PAUSED",
      "BM_CHECKOUT_ENABLED",
      "BM_LIVE_BILLING_ENABLED",
      "BM_LIVE_DELIVERY_ENABLED",
    ].every((k) => s[k] === REQUIRED_S2_ENV[k]);
  };
  return {
    query: async (sql, signal) => {
      if (
        sql !== PRESERVATION_SQL &&
        sql !== checkoutReadSql(plan) &&
        sql !== priorCheckoutReadSql(plan)
      )
        deny();
      if (
        !/^select\s/i.test(sql) ||
        /[;]/.test(sql) ||
        /\b(insert|update|delete|create|alter|drop|grant|revoke|copy|execute|pg_read_file)\b/i.test(
          sql,
        )
      )
        deny();
      if ((await readFile(ref, "utf8")) !== S2.staging) deny();
      const file = path.join(directory, "query-" + randomUUID() + ".sql");
      await writeFile(
        file,
        "begin read only; set local statement_timeout='10s'; set local timezone='UTC'; select statement_timestamp() as observed_at,q.* from (" +
          sql +
          ") q; rollback;",
        { flag: "wx", mode: 0o600 },
      );
      const r = await run(
        "supabase",
        [
          "db",
          "query",
          "--linked",
          "--workdir",
          dbRoot,
          "--output",
          "json",
          "--file",
          file,
        ],
        signal,
      );
      if (r.code !== 0) deny();
      return JSON.parse(r.stdout);
    },
    async capturePlatformBaseline(signal) {
      const p = (await api("/v9/projects/" + S2.project, signal)).body;
      const team = (await api("/v2/teams/" + S2.team, signal)).body;
      await evidence.create("project-check-" + randomUUID(), {
        projectMatches: p?.id === S2.project,
        teamMatches: p?.accountId === S2.team,
        gitLinked: Boolean(p?.link),
        deploymentProtection: p?.ssoProtection?.deploymentType ?? null,
        bypassCount: Object.keys(p?.protectionBypass ?? {}).length,
      });
      if (
        team?.id !== S2.team ||
        team.membership?.role !== "OWNER" ||
        p?.id !== S2.project ||
        p.accountId !== S2.team ||
        p.link ||
        p.ssoProtection?.deploymentType !== "all" ||
        Object.keys(p.protectionBypass || {}).length
      )
        deny();
      await readAlias(signal);
      if (
        !(await paused(signal)) ||
        !(await readPausedReceiver(undefined, signal))
      )
        deny();
      const ids = (await inventory(signal)).map((x) => x.uid ?? x.id);
      if (!ids.includes(S2.fallback) || new Set(ids).size !== ids.length)
        deny();
      await evidence.create("platform-baseline", {
        source: plan.source,
        runId: plan.runId,
        ids,
        observedAt: Date.now(),
      });
      return { preexisting: ids.length };
    },
    async readIssuancePaused(signal) {
      const b = await evidence.read("platform-baseline");
      if (b.source !== plan.source || b.runId !== plan.runId) deny();
      const current = await inventory(signal);
      if (current.some((x) => !b.ids.includes(x.uid ?? x.id))) return false;
      return (await paused(signal)) && (await readAlias(signal));
    },
    async pauseReceiver(_plan, signal) {
      await verifyMutationApproval("pause", signal);
      const r = await run(
        "supabase",
        [
          "secrets",
          "set",
          "BM_S2_STRIPE_WEBHOOK_ENABLED=false",
          "--project-ref",
          S2.staging,
        ],
        signal,
      );
      if (r.code !== 0 || !(await readPausedReceiver(undefined, signal)))
        deny();
      return { verified: true };
    },
    async restoreRoutingAndRemoveTemporaryPreview(_plan, signal) {
      const b = await evidence.read("platform-baseline");
      if (b.source !== plan.source || b.runId !== plan.runId) deny();
      const alias = (
        await api("/v4/aliases/" + new URL(S2.origin).hostname, signal)
      ).body;
      if (alias?.projectId !== S2.project) deny();
      const aliasTarget = alias.deploymentId ?? alias.deployment?.id;
      const current = await inventory(signal),
        added = current.filter((x) => !b.ids.includes(x.uid ?? x.id));
      if (added.length > 2) deny();
      const candidates = [];
      for (const x of added) {
        const d = (await api("/v13/deployments/" + (x.uid ?? x.id), signal))
          .body;
        if (!ownsCampaignPreview(d, b, plan, aliasTarget)) deny();
        candidates.push(d);
      }
      if (aliasTarget !== S2.fallback) {
        if (!candidates.some((d) => d.id === aliasTarget)) deny();
        const fallback = (await api("/v13/deployments/" + S2.fallback, signal))
          .body;
        if (
          fallback?.id !== S2.fallback ||
          fallback.projectId !== S2.project ||
          fallback.ownerId !== S2.team ||
          fallback.readyState !== "READY" ||
          !/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(
            fallback.url || "",
          )
        )
          deny();
        await verifyMutationApproval("restore-alias", signal);
        await run(
          "vercel",
          [
            "alias",
            "set",
            fallback.url,
            new URL(S2.origin).hostname,
            "--scope",
            S2.team,
          ],
          signal,
        );
        await readAlias(signal); // A lost command response never triggers a second write.
      }
      for (const previous of candidates) {
        const d = (await api("/v13/deployments/" + previous.id, signal)).body;
        if (!ownsCampaignPreview(d, b, plan, S2.fallback) || d.alias.length)
          deny();
        await verifyMutationApproval("remove-preview", signal);
        const r = await run(
          "vercel",
          ["remove", d.id, "--safe", "--yes", "--scope", S2.team],
          signal,
        );
        if (
          r.code !== 0 ||
          (await api("/v13/deployments/" + d.id, signal)).status !== 404
        )
          deny();
      }
      const after = (await inventory(signal)).map((x) => x.uid ?? x.id);
      if (
        after.length !== b.ids.length ||
        b.ids.some((x) => !after.includes(x))
      )
        deny();
      await readAlias(signal);
      return { verified: true };
    },
    async readPlatformClosed(signal) {
      return (
        (await this.readIssuancePaused(signal)) &&
        (await readPausedReceiver(undefined, signal))
      );
    },
    async readPortalCoverage(signal) {
      const b = await evidence.read("platform-baseline");
      if (b.source !== plan.source || b.runId !== plan.runId) deny();
      const http = async (host, endpoint, method, requestedSignal) => {
        if (!["GET", "OPTIONS"].includes(method) ||
            !/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(host) ||
            !endpoint.startsWith("/") || endpoint.includes("://")) deny();
        // Never allow curl to provision a missing SSO automation bypass.
        // Its native implementation reuses an existing automation entry; absence fails closed.
        const project = (await api("/v9/projects/" + S2.project, requestedSignal)).body;
        if (project?.id !== S2.project || project.accountId !== S2.team ||
            project.ssoProtection?.deploymentType !== "all" ||
            !Object.values(project.protectionBypass ?? {}).some(x => x.scope === "automation-bypass")) deny();
        const r = await run("vercel", ["curl", "https://" + host + endpoint,
          "--scope", S2.team, "--", "--request", method, "--max-time", "15",
          "--max-redirs", "0", "--include", "--write-out", "\nSAFE_HTTP:%{http_code}"], requestedSignal);
        const header = name => r.stdout.match(new RegExp("^" + name + ":\\s*([^\\r\\n]+)", "im"))?.[1]?.trim();
        return { code: r.code, status: Number(r.stdout.match(/SAFE_HTTP:(\d{3})/)?.[1] || 0),
          redirect: !!header("location"),
          title: r.stdout.match(/<title>([^<]{0,160})<\/title>/i)?.[1] ?? null,
          sso: /Authentication Required|vercel.com\/sso|Log in to Vercel/i.test(r.stdout),
          firewallDenied: header("x-vercel-mitigated") === "deny" &&
            header("x-vercel-error") === "FORBIDDEN",
          requestId: header("x-vercel-id") ?? null };
      };
      return readLegacyPortalCoverage({ api, http, inventory, baseline: b, evidence }, signal);
    },
  };
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) &&
  process.argv[2] === "env-report"
) {
  const e = process.env;
  process.stdout.write(
    JSON.stringify({
      project: S2.project,
      database: S2.staging,
      scopeVerified:
        (!e.VERCEL_PROJECT_ID || e.VERCEL_PROJECT_ID === S2.project) &&
        e.SUPABASE_URL === `https://${S2.staging}.supabase.co`,
      settings: Object.fromEntries(
        Object.entries(REQUIRED_S2_ENV).map(([k, v]) => [
          k,
          e[k] === v ? v : null,
        ]),
      ),
    }),
  );
}
