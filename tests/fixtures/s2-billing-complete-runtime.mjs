// Full LOCAL_SYNTHETIC execution child. Real disk lease, PGlite SQL, and CLI
// subprocess protocol; no hosted credential, provider URL or mutation is used.
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile, open, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { assembleBillingExecution } from "../../scripts/testing/s2-billing-execution.mjs";
import { makeStripeOperator } from "../../scripts/testing/s2-stripe-operator.mjs";
import { billingEvidenceStore } from "../../scripts/testing/s2-billing-journal.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const [role, directory, scenario, parent] = process.argv.slice(2);
if (role === "launcher") {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "worker",
      directory,
      scenario,
      String(process.pid),
    ],
    { detached: true, windowsHide: true, stdio: "ignore" },
  );
  child.unref();
  process.exit(0);
}
if (role !== "worker" || !path.isAbsolute(directory))
  throw Error("Fixture scope");
let clock = Date.now();
Date.now = () => clock;
const start = clock + 60000,
  plan = {
    source: "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
    runId: randomUUID(),
    project: S2.project,
    team: S2.team,
    database: S2.staging,
    account: S2.account,
    endpoint: S2.endpoint,
    owner: S2_PRO_OWNER,
    mode: "LOCAL_SYNTHETIC",
    profile: "activation",
    startedAt: start,
    expiresAt: start + 1800000,
  };
const operatorSource = "a".repeat(40),
  digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
const db = await PGlite.create();
await db.exec(
  `create table bm_buyers(id int,identity_ciphertext text,identity_hash text,source_ciphertext text,status text);insert into bm_buyers select i,'synthetic-'||i,case when i<=8 then 'nonstandard-'||i else repeat('a',64) end,case when i<=9 then 'synthetic-source-'||i else null end,'inactive' from generate_series(1,223)i;create table bm_exposures(id int);create table bm_response_tokens(id int);create table bm_outbox(id int);create table bm_duplicate_reviews(id int);create table account_profiles(user_id uuid,account_status text);insert into account_profiles values('${plan.owner}','active');create table bm_entitlements(owner_id uuid,product text,status text);create table bm_checkouts(id uuid,owner_id uuid,operation_key uuid,product text,plan_version text,session_id text,state text,created_at timestamptz);`,
);
const stateFile = path.join(directory, "stripe-fixture.json"),
  crm = {
    id: "sub_Crm",
    customer: "cus_Crm",
    livemode: false,
    status: "active",
    metadata: { dbpProduct: "crm" },
    items: {
      has_more: false,
      data: [{ quantity: 1, price: { id: "price_Crm" } }],
    },
  };
await writeFile(
  stateFile,
  JSON.stringify({
    plan,
    scenario,
    completeRuntime: true,
    created: false,
    crm,
  }),
);
if (scenario === "prior-open") {
  const id = randomUUID(),
    s = JSON.parse(await readFile(stateFile, "utf8"));
  s.priorSession = {
    id: "cs_test_Prior",
    mode: "subscription",
    livemode: false,
    status: "open",
    client_reference_id: plan.owner,
    metadata: {
      dealBlastUserId: plan.owner,
      dbpProduct: "buyermatch",
      dbpCheckoutId: id,
    },
  };
  await writeFile(stateFile, JSON.stringify(s));
  await db.query(
    `insert into bm_checkouts values('${id}','${plan.owner}','${randomUUID()}','buyermatch','buyermatch-pro-v1','cs_test_Prior','pending',to_timestamp(${start - 100000}/1000.0))`,
  );
}
let runtime;
const evidence = {
  async create(name, value) {
    if (
      scenario === "journal-failure" &&
      name.startsWith("execution-") &&
      value.stage === "CLOSURE" &&
      value.status === "STARTED"
    )
      throw Object.assign(Error("Synthetic fsync failure"), { code: "EIO" });
    const f = await open(
      path.join(directory, plan.runId + "." + name + ".json"),
      "wx",
      0o600,
    );
    try {
      await f.writeFile(JSON.stringify(value));
      await f.sync();
    } finally {
      await f.close();
    }
    if (name === "watchdog-ready") {
      clock = start + 2000;
      previews = ["dpl_Owned"];
      const metadata = {
        dealBlastUserId: plan.owner,
        dbpProduct: "buyermatch",
        dbpCheckoutId: plan.runId,
        dbpS2RunId: plan.runId,
      };
      const subscription = {
        id: scenario === "preexisting" ? "sub_Crm" : "sub_Owned",
        customer: scenario === "shared" ? "cus_Crm" : "cus_Owned",
        livemode: false,
        status: "active",
        created: Math.floor((start + 1000) / 1000),
        metadata,
        items: {
          has_more: false,
          data: [{ quantity: 1, price: { id: S2.pro } }],
        },
      };
      const customer = {
        id: subscription.customer,
        livemode: false,
        created: Math.floor((start + 1000) / 1000),
      };
      const session = {
        id: "cs_test_Owned",
        created: Math.floor((start + 1000) / 1000),
        livemode: false,
        mode: "subscription",
        status: scenario === "open" ? "open" : "complete",
        payment_status: scenario === "open" ? "unpaid" : "paid",
        subscription: scenario === "open" ? null : subscription.id,
        customer: customer.id,
        metadata,
        client_reference_id: plan.owner,
        amount_total: 11900,
        currency: "usd",
      };
      await db.query(
        `insert into bm_checkouts values('${plan.runId}','${plan.owner}','${plan.runId}','buyermatch','buyermatch-pro-v1','cs_test_Owned','pending',to_timestamp(${start + 1000}/1000.0))`,
      );
      await writeFile(
        stateFile,
        JSON.stringify({
          plan,
          scenario,
          completeRuntime: true,
          created: true,
          now: clock,
          crm,
          subscription,
          customer,
          session,
        }),
      );
      if (scenario === "preservation-drift")
        await db.exec("update bm_buyers set status='changed' where id=1");
      if (scenario === "limits") {
        for (const [kind, count] of Object.entries({
          preview: 2,
          checkout: 1,
          "signed-event": 12,
        })) {
          for (let i = 0; i < count; i++)
            await runtime.authorizeCampaignAction(kind, kind + "-" + i);
          let denied = false;
          try {
            await runtime.authorizeCampaignAction(kind, "extra-" + kind);
          } catch {
            denied = true;
          }
          if (!denied) throw Error("Limit bypass");
          denied = false;
          try {
            await runtime.authorizeCampaignAction(kind, kind + "-0");
          } catch {
            denied = true;
          }
          if (!denied) throw Error("Retry bypass");
        }
        const leaseFile = path.join(directory, "dbp-s2-billing.lock.json"),
          lease = await readFile(leaseFile, "utf8");
        await writeFile(
          leaseFile,
          JSON.stringify({ ...JSON.parse(lease), runId: randomUUID() }),
        );
        let denied = false;
        try {
          await runtime.authorizeCampaignAction("checkout", "foreign-lease");
        } catch {
          denied = true;
        }
        if (!denied) throw Error("Lease bypass");
        await writeFile(leaseFile, lease);
        await evidence.create("closing", {
          source: plan.source,
          runId: plan.runId,
          planDigest: digest,
        });
        denied = false;
        try {
          await runtime.authorizeCampaignAction("checkout", "after-closing");
        } catch {
          denied = true;
        }
        if (!denied) throw Error("Closing bypass");
      }
      if (!["interrupted", "deadline"].includes(scenario))
        await evidence.create("close-request", {
          runId: plan.runId,
          planDigest: digest,
          close: true,
        });
    }
    return { durable: true };
  },
  async read(name) {
    return JSON.parse(
      await readFile(
        path.join(directory, plan.runId + "." + name + ".json"),
        "utf8",
      ),
    );
  },
  async readLease() {
    return JSON.parse(
      await readFile(path.join(directory, "dbp-s2-billing.lock.json"), "utf8"),
    );
  },
  async latestHeartbeat() {
    if (scenario === "interrupted") throw Error("primary exited");
    clock = plan.expiresAt + 1;
    return { runId: plan.runId, planDigest: digest, at: clock };
  },
};
await evidence.create("approval", {
  approved: true,
  planDigest: digest,
  cleanupOperatorSource: operatorSource,
  mode: plan.mode,
  scope: "subscription-activation",
  cancelCampaignCreatedTestSubscription: true,
});
let previews = [],
  calls = [];
const factories = {
  evidence: async () => evidence,
  store: billingEvidenceStore,
  platform: async () => ({
    query: async (sql) => {
      const r = await db.query(
        `select '${new Date(clock).toISOString()}'::timestamptz as observed_at,q.* from (${sql})q`,
      );
      return r.rows;
    },
    capturePlatformBaseline: async () => {
      await evidence.create("platform-baseline", {
        source: plan.source,
        runId: plan.runId,
        ids: ["dpl_Preserved"],
      });
      return { preexisting: 1 };
    },
    readIssuancePaused: async () => previews.length === 0,
    pauseReceiver: async () => {
      calls.push("pauseReceiver");
      return { verified: true };
    },
    restoreRoutingAndRemoveTemporaryPreview: async () => {
      calls.push("removePreviews");
      if (scenario === "foreign-preview") throw Error("Foreign object");
      previews = [];
      return { verified: true };
    },
    readPortalCoverage: async () => ({ verified: previews.length === 0 }),
    readPlatformClosed: async () => previews.length === 0,
  }),
  stripe: async (p, o) => {
    const toolHash = createHash("sha256")
        .update(await readFile(process.execPath))
        .digest("hex"),
      store = await billingEvidenceStore(directory, p);
    const operator = makeStripeOperator(p, {
      ...o,
      approvedSource: p.source,
      cwd: directory,
      tool: { path: process.execPath, sha256: toolHash },
      subscriptionEvidenceStore: store,
      verifyToolCustody: async () => ({
        ownerVerified: true,
        restrictiveAclVerified: true,
        sha256: toolHash,
      }),
      journal: async () => ({ durable: true }),
      spawnProcess: (exe, args, opts) =>
        spawn(
          exe,
          [
            fileURLToPath(
              new URL("./s2-stripe-campaign-cli.mjs", import.meta.url),
            ),
            stateFile,
            ...args,
          ],
          opts,
        ),
      timeoutMs: 5000,
    });
    return {
      ...operator,
      disableEndpoint: async () => {
        calls.push("disableEndpoint");
        return { verified: true };
      },
      closeNewCheckoutSessions: async (requested, signal) =>
        operator.closeCampaignCheckouts(
          await o.readCheckoutReceipt(requested, signal),
          signal,
        ),
      closeNewTestSubscriptions: async (requested, signal) =>
        operator.closeCampaignSubscription(
          requested,
          await o.readCheckoutReceipt(requested, signal),
          operatorSource,
          signal,
        ),
    };
  },
};
try {
  runtime = await assembleBillingExecution(
    { intent: "watch", operatorSource, directory, plan },
    factories,
  );
  const result = await runtime.monitor({
    parentPid: Number(parent),
    pollMs: 1,
  });
  let trace = [];
  try {
    trace = (await readFile(stateFile + ".calls", "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
  } catch {
    /* No trace exists when the constructor fails before CLI use. */
  }
  const final = JSON.parse(await readFile(stateFile, "utf8"));
  await writeFile(
    path.join(directory, "result.json"),
    JSON.stringify({
      result,
      calls,
      deleteCount: trace.filter((x) => x[0] === "delete").length,
      crmUnchanged: JSON.stringify(final.crm) === JSON.stringify(crm),
      hasLock: (await readdir(directory)).includes("dbp-s2-billing.lock.json"),
      subscriptionStatus: final.subscription?.status,
      checkoutStatus: final.session?.status,
    }),
  );
} catch {
  await writeFile(
    path.join(directory, "result.json"),
    JSON.stringify({
      status: "UNVERIFIED",
      stage: runtime?.executionStage,
      calls,
    }),
  );
}
await db.close();
