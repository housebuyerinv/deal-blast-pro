import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeStripeOperator } from "../../scripts/testing/s2-stripe-operator.mjs";
import { billingEvidenceStore } from "../../scripts/testing/s2-billing-journal.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const hash = (x) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : JSON.stringify(x))
    .digest("hex");
for (const scenario of [
  "success",
  "shared",
  "unknown",
  "missing-permission",
  "preservation-drift",
  "preexisting",
  "unrelated",
])
  test("new native CLI cancellation wiring: " + scenario, async () => {
    const directory = await mkdtemp(
      path.join(await realpath(tmpdir()), "bm-native-fixture-"),
    );
    try {
      const now = Math.floor(Date.now() / 1000) * 1000,
        source = "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
        operatorSource = "a".repeat(40);
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
        expiresAt: now + 60000,
      };
      const metadata = {
        dbpS2RunId: plan.runId,
        dealBlastUserId: plan.owner,
        dbpProduct: "buyermatch",
        dbpCheckoutId: plan.runId,
      };
      const state = {
        plan,
        scenario,
        session: {
          id: "cs_test_Owned",
          mode: "subscription",
          livemode: false,
          created: now / 1000,
          metadata,
          client_reference_id: plan.owner,
          status: "complete",
          payment_status: "paid",
          amount_total: 11900,
          currency: "usd",
          customer: "cus_Owned",
          subscription: "sub_Owned",
        },
        customer: { id: "cus_Owned", livemode: false, created: now / 1000 },
        subscription: {
          id: "sub_Owned",
          customer: "cus_Owned",
          livemode: false,
          created: now / 1000,
          metadata,
          status: "active",
          items: {
            has_more: false,
            data: [{ quantity: 1, price: { id: S2.pro } }],
          },
        },
      };
      if (scenario === "preexisting")
        state.subscription.created = Math.floor(plan.startedAt / 1000) - 10;
      if (scenario === "unrelated") state.subscription.customer = "cus_Foreign";
      const file = path.join(directory, "synthetic.json");
      await writeFile(file, JSON.stringify(state));
      const store = await billingEvidenceStore(directory, plan);
      await store.claimRun();
      await store.recordSubscriptionBaseline({
        observedAt: plan.startedAt,
        subscriptionIds: ["sub_Preexisting"],
      });
      await store.recordSubscriptionCreation({
        subscription: "sub_Owned",
        customer: "cus_Owned",
        session: "cs_test_Owned",
        checkoutId: plan.runId,
      });
      const toolHash = createHash("sha256")
        .update(await readFile(process.execPath))
        .digest("hex");
      const opts = {
        approvedSource: source,
        operatorSource,
        tool: { path: process.execPath, sha256: toolHash },
        cwd: directory,
        timeoutMs: 2000,
        subscriptionEvidenceStore: store,
        verifyToolCustody: async () => ({
          ownerVerified: true,
          restrictiveAclVerified: true,
          sha256: toolHash,
        }),
        verifyApproval: async (_, d) => ({
          approved: true,
          planDigest: d,
          mode: plan.mode,
          scope: "subscription-activation",
          cleanupOperatorSource: operatorSource,
          cancelCampaignCreatedTestSubscription:
            scenario !== "missing-permission",
        }),
        verifyPreservation: async () => ({
          verified: true,
          unchanged: scenario !== "preservation-drift",
          planDigest: hash(plan),
        }),
        readCheckoutPolicy: async () => ({
          source,
          runId: plan.runId,
          issuanceJournalComplete: true,
          inflightReconciled: true,
          sessionIds: ["cs_test_Owned"],
        }),
        journal: async () => ({ durable: true }),
        spawnProcess: (exe, args, o) =>
          spawn(
            exe,
            [
              fileURLToPath(
                new URL(
                  "../fixtures/s2-stripe-campaign-cli.mjs",
                  import.meta.url,
                ),
              ),
              file,
              ...args,
            ],
            o,
          ),
      };
      const receipt = {
        source,
        runId: plan.runId,
        checkouts: [{ id: "cs_test_Owned", checkoutId: plan.runId }],
      };
      const invoke = () =>
        makeStripeOperator(plan, opts).closeCampaignSubscription(
          plan,
          receipt,
          operatorSource,
        );
      if (scenario === "success")
        assert.deepEqual(await invoke(), { verified: true });
      else await assert.rejects(invoke());
      if (scenario === "unknown") await assert.rejects(invoke());
      let calls = [];
      try {
        calls = (await readFile(file + ".calls", "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      assert.equal(
        calls.filter((a) => a[0] === "delete").length,
        ["success", "unknown"].includes(scenario) ? 1 : 0,
      );
      for (const a of calls) {
        assert.ok(a.includes("buyermatch-s2"));
        if (a[0] !== "whoami") assert.ok(a.includes(S2.account));
        assert.ok(!a.includes("--live"));
        assert.ok(!a.includes("--api-key"));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
