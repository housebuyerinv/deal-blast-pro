// OFFLINE PREPARATION ONLY. Reads committed Git objects; never reads env/credentials,
// invokes a provider, pushes, extracts an archive, or executes returned commands.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { win32 } from "node:path";
import { URL } from "node:url";
import {
  s2AttestationDeploymentArgs,
  S2_RELEASE,
} from "../buyermatch-s2-release.mjs";

export const CANDIDATE = "de9009e165cb15709497e538118d1ceda013cdb5";
export const REVIEWED_REMOTE = "531beb77c11a0b8275a321b69e0ce21200650339";
export const BRANCH = "codex/buyermatch-1b-integration";
export const MIGRATION =
  "supabase/migrations/20261026175709_buyermatch_authenticated_buyer_self_service.sql";
export const MIGRATION_HASH =
  "9bb5aa7eda7047863e1910ab40337388e9cfc0b6455539699bf637471eb114dd";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function requireDirectory(path) {
  if (
    typeof path !== "string" ||
    !/^[A-Za-z]:[\\/]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) < 32) ||
    /["<>|*?]/.test(path) ||
    path.slice(2).includes(":") ||
    path.split(/[\\/]/).some((part) => part === ".." || /[. ]$/.test(part))
  )
    throw Error("Explicit absolute local preparation directories required");
  return win32.normalize(path);
}

export function prepareCurrentSourcePacket({
  repo,
  remoteHead,
  source = CANDIDATE,
  sourceDirectory,
  databaseDirectory,
  runId,
}) {
  if (source !== CANDIDATE || remoteHead !== REVIEWED_REMOTE)
    throw Error("Exact source/remote review pin changed; re-review required");
  const sourceDir = requireDirectory(sourceDirectory);
  const databaseDir = requireDirectory(databaseDirectory);
  const related = (a, b) =>
    a.toLowerCase() === b.toLowerCase() ||
    a.toLowerCase().startsWith(b.toLowerCase() + "\\");
  if (related(sourceDir, databaseDir) || related(databaseDir, sourceDir))
    throw Error("Source and isolated database directories must be separate");
  // All arguments below are locally fixed or strictly pinned SHA strings.
  const git = (args) =>
    execFileSync("git", args, {
      cwd: repo,
      timeout: 15000,
      maxBuffer: 16777216,
      stdio: ["ignore", "pipe", "pipe"],
    });
  git(["cat-file", "-e", source + "^{commit}"]);
  git(["merge-base", "--is-ancestor", remoteHead, source]);
  const read = (path, ref = source) => git(["show", ref + ":" + path]);
  for (const ref of [remoteHead, source]) {
    const config = JSON.parse(read("vercel.json", ref));
    if (config.git?.deploymentEnabled?.[BRANCH] !== false)
      throw Error("Committed automatic-deployment guard missing");
  }
  const config = JSON.parse(read("vercel.json"));
  if (
    config.functions?.["api/platform/*.ts"]?.includeFiles !==
      "server/generated/s2-build-attestation.json" ||
    !config.rewrites?.some(
      (r) =>
        r.source === "/api/buyermatch-buyer" &&
        r.destination === "/api/platform/buyermatch-buyer",
    )
  )
    throw Error("Buyer route or attestation package missing");
  if (hash(read(MIGRATION)) !== MIGRATION_HASH)
    throw Error("Reviewed migration changed");
  const tree = git(["rev-parse", source + "^{tree}"])
    .toString()
    .trim();
  const changedFiles = git(["diff", "--name-only", remoteHead, source])
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const deploy = s2AttestationDeploymentArgs(sourceDir, runId, source);
  return {
    schema: 1,
    status: "PREPARED_ONLY_BLOCKED_NO_EXECUTION",
    executionReady: false,
    source,
    tree,
    remoteHead,
    branch: BRANCH,
    ahead: Number(
      git(["rev-list", "--count", remoteHead + ".." + source])
        .toString()
        .trim(),
    ),
    changedFileCount: changedFiles.length,
    changedFiles,
    project: S2_RELEASE.project,
    team: S2_RELEASE.team,
    target: "preview",
    database: S2_RELEASE.staging,
    stripeAccount: S2_RELEASE.account,
    alias: new URL(S2_RELEASE.origin).hostname,
    fallback: S2_RELEASE.fallback,
    runId,
    maxWindowMinutes: 30,
    additionalBudgetUsd: 0,
    migration: {
      path: MIGRATION,
      sha256: MIGRATION_HASH,
      version: "20261026175709",
      applyOnlyIfAbsent: true,
      replayPrivateIntake: false,
      bulkPush: false,
    },
    commandsAreDataOnly: true,
    commands: {
      push: ["git", "push", "origin", source + ":refs/heads/" + BRANCH],
      archive: [
        "git",
        "-c",
        "core.autocrlf=false",
        "archive",
        "--format=tar",
        "--output",
        win32.join(sourceDir + "-archive.tar"),
        source,
      ],
      extract: ["tar.exe", "-xf", sourceDir + "-archive.tar", "-C", sourceDir],
      initializeIsolatedCli: ["supabase", "init", "--workdir", databaseDir],
      linkIsolatedCli: [
        "supabase",
        "link",
        "--project-ref",
        S2_RELEASE.staging,
        "--workdir",
        databaseDir,
      ],
      applySingleMigration: [
        "supabase",
        "db",
        "query",
        "--linked",
        "--workdir",
        databaseDir,
        "--file",
        win32.join(sourceDir, MIGRATION),
      ],
      recordAfterIndependentVerification: [
        "supabase",
        "migration",
        "repair",
        "20261026175709",
        "--status",
        "applied",
        "--linked",
        "--workdir",
        databaseDir,
      ],
      deploy: ["vercel", ...deploy],
    },
    mandatoryGates: [
      "Separate exact-source push/migration/deployment/alias authorization; no command in this file executes them.",
      "Fresh remote head must equal remoteHead; no force push; independently verify all connected project/CI deployment suppression before push.",
      "Create only new empty source/database directories after approval; never overwrite; extract exact Git archive and verify every Git blob, no working-tree files or dotenv.",
      "Privately restore trusted original three Preview Secrets; independently verify complete synthetic identity AES-GCM/HMAC compatibility; no rejected source or runtime export.",
      "Pin installed CLIs and confirm supported arguments; verify isolated CLI link is qxhhlprentrufobpcgna before query; fresh database prerequisites/history/permissions before write.",
      "Stage only the exact fingerprinted migration in the new isolated CLI migrations directory using exclusive creation; no historical migrations. Verify bytes again before execution/history repair.",
      "Apply only this fingerprinted SQL once; on failure stop. Verify schema/ACL/RLS/audit and existing records before recording history; repair alone is not proof of execution.",
      "Fresh S2 ownership, protection, zero-cost capacity, disabled Stripe endpoint, paused receiver, all billing/registration/delivery pauses and fallback readback.",
      "Independently verified detached watchdog must support THIS source and restored-secret receipt before any deploy/alias mutation. Historical b998305 launcher is incompatible.",
      "Verify exact READY Preview/source/team/project, private runtime provenance, all 17 build/runtime settings, owner-only attestation and agreement hashes before alias move.",
      "Move only S2 alias with prior-target comparison; restore pinned fallback on failure/deadline. Retain private tables/proofs/audit; never drop evidence or reopen browser grants.",
      "This paused deployment packet authorizes no hosted writes, payment, registration unpause, event delivery or distribution; use separately bounded approved testing windows.",
    ],
  };
}
