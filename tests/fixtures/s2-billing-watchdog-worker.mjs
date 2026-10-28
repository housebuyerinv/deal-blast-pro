// Synthetic-only child. Never imports provider clients or reads credentials.
import process from "node:process";
import { open, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  runIndependentBillingCleanup,
  monitorBillingWindow,
} from "../../scripts/testing/s2-billing-watchdog.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const [base, parent, scenario] = process.argv.slice(2);
if (
  !path.isAbsolute(base) ||
  ![
    "success",
    "hung",
    "journal-failure",
    "deadline",
    "close-request",
    "unknown-stop",
    "denied-approval",
    "wrong-authority",
  ].includes(scenario)
)
  throw Error("Invalid synthetic fixture");
const source = "57976a5bb85cec906783173dfaa85b843ea801ca",
  now = Date.now();
const plan = {
  source,
  runId: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
  project: S2.project,
  team: S2.team,
  database: S2.staging,
  account: S2.account,
  endpoint: S2.endpoint,
  owner: S2_PRO_OWNER,
  mode: "LOCAL_SYNTHETIC",
  profile: "activation",
  startedAt: now - 1000,
  expiresAt: now + (scenario === "deadline" ? 250 : 60000),
};
const append = async (name) => {
  const f = await open(path.join(base, "actual-operations.jsonl"), "a", 0o600);
  try {
    await f.writeFile(JSON.stringify({ operation: name }) + "\n");
    await f.sync();
  } finally {
    await f.close();
  }
};
const adapter = {
  verifyApproval: async (_, digest) => ({
    approved: scenario !== "denied-approval",
    scope: "subscription-activation",
    mode: plan.mode,
    planDigest: digest,
    cancelCampaignCreatedTestSubscription: true,
    cleanupOperatorSource: source,
  }),
  verifyAuthority: async () => ({
    ...plan,
    account: scenario === "wrong-authority" ? "foreign" : plan.account,
    livemode: false,
    ownerAuthorized: true,
  }),
};
const abortEvidence = [];
for (const method of [
  "disableEndpoint",
  "pauseReceiver",
  "closeNewCheckoutSessions",
  "closeNewTestSubscriptions",
  "closePortalSessions",
  "restoreRoutingAndRemoveTemporaryPreview",
]) {
  adapter[method] = async (_, signal) => {
    await append(method);
    if (scenario === "hung" && method === "pauseReceiver")
      return new Promise(() =>
        signal.addEventListener("abort", () => {
          abortEvidence.push(append("abort-observed"));
        }),
      );
    return { verified: true };
  };
}
const options = {
  approvedSource: source,
  parentPid: Number(parent),
  timeoutMs: 100,
  journal: async (entry) => {
    const f = await open(path.join(base, "journal.jsonl"), "a", 0o600);
    try {
      await f.writeFile(JSON.stringify(entry) + "\n");
      await f.sync();
    } finally {
      await f.close();
    }
    return { durable: scenario !== "journal-failure" };
  },
};
options.ready = async () => ({ durable: true });
options.readCloseRequest = async () =>
  scenario === "unknown-stop"
    ? {}
    : {
        runId: plan.runId,
        source: plan.source,
        close: scenario === "close-request",
      };
let result;
try {
  result = await (
    ["deadline", "close-request", "unknown-stop"].includes(scenario)
      ? monitorBillingWindow
      : runIndependentBillingCleanup
  )(plan, adapter, options);
} catch {
  result = { stopped: true, cleanupCallsVerified: false };
}
await Promise.all(abortEvidence);
await writeFile(path.join(base, "result.json"), JSON.stringify(result), {
  flag: "wx",
  mode: 0o600,
});
