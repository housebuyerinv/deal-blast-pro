import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers";
import { readFile, mkdtemp, rm, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  makeStripeOperator,
  combineBillingStripeTransports,
} from "../../scripts/testing/s2-stripe-operator.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const hash = createHash("sha256")
  .update(await readFile(process.execPath))
  .digest("hex");
async function fixture(fn) {
  const base = await mkdtemp(path.join(await realpath(tmpdir()), "bm-operator-public-"));
  try {
    const source = "c00d59f048282343af5d81afe9655556aa285e75",
      now = Date.now(),
      calls = [],
      journal = [];
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
    const state = { scenario: "success", calls, journal, plan };
    const options = {
      approvedSource: source,
      tool: { path: process.execPath, sha256: hash },
      cwd: base,
      timeoutMs: 2000,
      verifyApproval: async (_, digest) => ({
        approved: true,
        scope: "payment-free-preflight",
        planDigest: digest,
        mode: plan.mode,
      }),
      verifyToolCustody: async () => ({
        ownerVerified: true,
        restrictiveAclVerified: true,
        sha256: hash,
      }),
      journal: async (e) => {
        journal.push(e);
        return { durable: true };
      },
      environment: {
        ...process.env,
        STRIPE_API_KEY: "DUMMY_NOT_INHERITED",
        NODE_OPTIONS: "DUMMY_NOT_INHERITED",
      },
      spawnProcess: (executable, args, opts) => {
        calls.push({ args, envKeys: Object.keys(opts.env) });
        assert.equal(opts.shell, false);
        assert.equal(opts.windowsHide, true);
        return spawn(
          executable,
          [
            fileURLToPath(
              new URL(
                "../fixtures/s2-stripe-operator-cli.mjs",
                import.meta.url,
              ),
            ),
            state.scenario,
            ...args,
          ],
          opts,
        );
      },
    };
    state.options = options;
    state.make = () => makeStripeOperator(plan, options);
    await fn(state);
  } finally {
    assert.equal(path.dirname(base), await realpath(tmpdir()));
    await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
test("actual pinned child protocol uses named S2 context, strips output and preserves default profile", () =>
  fixture(async (f) => {
    const a = f.make();
    assert.deepEqual(await a.readIdentity(), {
      account: S2.account,
      mode: "test",
    });
    const r = await a.stripeRequest({
      method: "POST",
      path: "/v1/webhook_endpoints/" + S2.endpoint,
      body: { disabled: true },
      account: S2.account,
      mode: "test",
      retries: 0,
    });
    assert.equal(r.status, "disabled");
    assert.equal(Object.keys(r).includes("secret"), false);
    assert.ok(
      f.calls.every(
        (c) =>
          !c.envKeys.includes("STRIPE_API_KEY") &&
          !c.envKeys.includes("NODE_OPTIONS"),
      ),
    );
    assert.ok(
      !JSON.stringify([r, f.journal, f.calls]).includes("DUMMY_DO_NOT_REPORT"),
    );
    assert.ok(f.calls.every((c) => c.args.at(-1) === "buyermatch-s2"));
    assert.ok(!JSON.stringify(f.calls).includes("--api-key"));
  }));
for (const kind of ["hash", "custody", "approval"])
  test("unverified " + kind + " stops before spawning", () =>
    fixture(async (f) => {
      if (kind === "hash") f.options.tool.sha256 = "0".repeat(64);
      if (kind === "custody") f.options.verifyToolCustody = async () => ({});
      if (kind === "approval")
        f.options.verifyApproval = async () => ({ approved: false });
      await assert.rejects(f.make().readIdentity(), /UNVERIFIED/);
      assert.equal(f.calls.length, 0);
    }),
  );
test("operator refuses enabled destinations, foreign paths and retry requests", () =>
  fixture(async (f) => {
    const a = f.make();
    for (const patch of [
      { body: { disabled: false } },
      { account: "foreign" },
      { path: "/v1/billing_portal/sessions" },
      { retries: 1 },
    ])
      await assert.rejects(
        a.stripeRequest({
          method: "POST",
          path: "/v1/webhook_endpoints/" + S2.endpoint,
          body: { disabled: true },
          account: S2.account,
          mode: "test",
          retries: 0,
          ...patch,
        }),
      );
    assert.equal(f.calls.length, 0);
  }));

test("composed transport keeps operator webhook authority outside runtime Checkout credentials", () =>
  fixture(async (f) => {
    let runtimeCalls = 0;
    const request = combineBillingStripeTransports(f.make(), {
      stripeRequest: async (r) => {
        runtimeCalls++;
        assert.equal(r.path, "/v1/checkout/sessions/cs_test_Owned");
        return { verified: true };
      },
    });
    await request({
      method: "GET",
      path: "/v1/webhook_endpoints/" + S2.endpoint,
      account: S2.account,
      mode: "test",
      retries: 0,
    });
    assert.equal(runtimeCalls, 0);
    await request({
      method: "GET",
      path: "/v1/checkout/sessions/cs_test_Owned",
    });
    assert.equal(runtimeCalls, 1);
  }));
test("real child failure/timeout and hung approval cannot leak errors or retry", () =>
  fixture(async (f) => {
    f.scenario = "error";
    await assert.rejects(
      f.make().readIdentity(),
      (e) => !e.message.includes("DUMMY_PRIVATE"),
    );
    assert.equal(f.calls.length, 1);
    f.scenario = "hang";
    const controller = new globalThis.AbortController(),
      original = f.options.spawnProcess;
    f.options.spawnProcess = (...args) => {
      const child = original(...args);
      setTimeout(() => controller.abort(), 50);
      return child;
    };
    await assert.rejects(
      f.make().readIdentity(controller.signal),
      /UNVERIFIED/,
    );
    assert.equal(f.calls.length, 2);
    f.options.spawnProcess = original;
    f.options.timeoutMs = 30;
    f.options.verifyApproval = async () => new Promise(() => {});
    await assert.rejects(f.make().readIdentity(), /UNVERIFIED/);
    assert.equal(f.calls.length, 2);
  }));
