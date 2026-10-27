import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { makeBillingContainment } from "../../scripts/testing/s2-billing-containment.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const source = "57976a5bb85cec906783173dfaa85b843ea801ca";
function fixture() {
  const now = Date.now(),
    plan = {
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
  const receipt = {
    source,
    runId: plan.runId,
    checkouts: [
      {
        id: "cs_test_SyntheticOnly",
        checkoutId: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
      },
    ],
  };
  const session = {
    id: receipt.checkouts[0].id,
    livemode: false,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    created: Math.floor(now / 1000),
    client_reference_id: plan.owner,
    metadata: {
      dbpProduct: "buyermatch",
      dealBlastUserId: plan.owner,
      dbpCheckoutId: receipt.checkouts[0].checkoutId,
      dbpS2RunId: plan.runId,
    },
  };
  const endpoint = {
    id: S2.endpoint,
    livemode: false,
    status: "enabled",
    url: `https://${S2.staging}.supabase.co/functions/v1/stripe-webhook`,
  };
  const portal = {
    source,
    runId: plan.runId,
    owner: plan.owner,
    operations: "checkout",
    runtimeAttested: true,
    allReachableS2RuntimesCovered: true,
    legacyPortalDenied: true,
    providerLoginPageDisabled: true,
    issuanceJournalComplete: true,
    issuedSessions: [],
  };
  const checkoutPolicy = {
    source,
    runId: plan.runId,
    issuanceJournalComplete: true,
    inflightReconciled: true,
    sessionIds: [session.id],
  };
  const calls = [];
  const ports = {
    readApproval: async (digest) => ({
      approved: true,
      scope: "subscription-activation",
      mode: plan.mode,
      planDigest: digest,
    }),
    readAuthority: async () => ({
      ...plan,
      livemode: false,
      ownerAuthorized: true,
    }),
    stripeRequest: async (r) => {
      calls.push(r);
      assert.equal(r.account, S2.account);
      assert.equal(r.mode, "test");
      assert.equal(r.retries, 0);
      if (r.path.startsWith("/v1/webhook_endpoints/")) {
        if (r.method === "POST") {
          assert.deepEqual(r.body, { disabled: true });
          endpoint.status = "disabled";
        }
        return { ...endpoint };
      }
      assert.ok(r.path.startsWith("/v1/checkout/sessions/" + session.id));
      if (r.method === "POST") {
        assert.equal(r.path.endsWith("/expire"), true);
        session.status = "expired";
      }
      return { ...session };
    },
    pauseReceiver: async (ref) => {
      assert.equal(ref, S2.staging);
      calls.push("pauseReceiver");
    },
    readReceiverPaused: async () => true,
    readPortalPolicy: async () => portal,
    readCheckoutPolicy: async () => checkoutPolicy,
    closeRouting: async (p) => ({
      verified: true,
      source: p.source,
      runId: p.runId,
    }),
  };
  const make = () => makeBillingContainment(plan, receipt, ports, source);
  return {
    plan,
    receipt,
    session,
    endpoint,
    portal,
    checkoutPolicy,
    calls,
    ports,
    make,
    run: (method) => make()[method](plan),
  };
}
test("scoped adapter disables endpoint, expires owned open Checkout and independently reads both back", async () => {
  const f = fixture();
  assert.deepEqual(await f.run("disableEndpoint"), { verified: true });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(await f.run("closeNewCheckoutSessions"), { verified: true });
  assert.equal(f.session.status, "expired");
  assert.equal(f.calls.length, 6);
  assert.deepEqual(await f.run("pauseReceiver"), { verified: true });
  assert.deepEqual(await f.run("restoreRoutingAndRemoveTemporaryPreview"), {
    verified: true,
  });
});
for (const change of [
  { livemode: true },
  { mode: "payment" },
  { client_reference_id: "foreign" },
  { status: "unexpected" },
  { created: 0 },
  { metadata: { dbpProduct: "crm" } },
  { metadata: { dbpS2RunId: "another-run" } },
])
  test(
    "unsafe Checkout cannot be expired " + JSON.stringify(change),
    async () => {
      const f = fixture();
      Object.assign(f.session, change);
      await assert.rejects(f.run("closeNewCheckoutSessions"), /unavailable/);
      assert.equal(
        f.calls.some((c) => c.method === "POST"),
        false,
      );
    },
  );
test("completed or expired sessions are read back without cancellation, refund or expiration writes", async () => {
  for (const status of ["complete", "expired"]) {
    const f = fixture();
    f.session.status = status;
    assert.equal((await f.run("closeNewCheckoutSessions")).verified, true);
    assert.equal(
      f.calls.some((c) => c.method === "POST"),
      false,
    );
  }
});
test("lost issuance receipt or in-flight operations prevent an empty inventory falsely passing", async () => {
  for (const change of [
    { sessionIds: [] },
    { issuanceJournalComplete: false },
    { inflightReconciled: false },
    { runId: "foreign" },
  ]) {
    const f = fixture();
    Object.assign(f.checkoutPolicy, change);
    await assert.rejects(f.run("closeNewCheckoutSessions"));
    assert.equal(f.calls.length, 0);
  }
});
test("no-Portal proof requires runtime gate and complete issuance evidence, not an empty list alone", async () => {
  const good = fixture();
  assert.deepEqual(await good.run("closePortalSessions"), { verified: true });
  assert.equal(good.calls.length, 0);
  for (const change of [
    { runtimeAttested: false },
    { allReachableS2RuntimesCovered: false },
    { legacyPortalDenied: false },
    { providerLoginPageDisabled: false },
    { issuanceJournalComplete: false },
    { operations: "payment" },
    { issuedSessions: ["bps_dummy"] },
    { owner: "foreign" },
    { source: "b".repeat(40) },
  ]) {
    const f = fixture();
    Object.assign(f.portal, change);
    await assert.rejects(f.run("closePortalSessions"));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.plan.profile = "lifecycle";
  await assert.rejects(f.run("closePortalSessions"));
});
test("endpoint URL/account drift and wrong invocation scope never cause mutations", async () => {
  const f = fixture();
  f.endpoint.url = "https://production.invalid";
  await assert.rejects(f.run("disableEndpoint"));
  assert.equal(
    f.calls.some((c) => c.method === "POST"),
    false,
  );
  const other = fixture();
  other.ports.readAuthority = async () => ({
    ...other.plan,
    account: "foreign",
    livemode: false,
    ownerAuthorized: true,
  });
  await assert.rejects(other.run("pauseReceiver"));
  assert.equal(other.calls.length, 0);
  await assert.rejects(f.make().pauseReceiver({ ...f.plan, owner: "foreign" }));
});
test("already-aborted operation does no network or receiver work", async () => {
  const f = fixture(),
    abort = new globalThis.AbortController();
  abort.abort();
  await assert.rejects(f.make().pauseReceiver(f.plan, abort.signal));
  assert.equal(f.calls.length, 0);
});
test("raw provider errors cannot escape sanitized containment failures", async () => {
  const f = fixture();
  f.ports.stripeRequest = async () => {
    throw Error("DUMMY_SECRET_URL");
  };
  await assert.rejects(
    f.run("disableEndpoint"),
    (e) => !e.message.includes("DUMMY_SECRET"),
  );
});
test("readback still open or enabled is not a successful closure", async () => {
  const f = fixture();
  f.ports.stripeRequest = async (r) =>
    r.path.includes("webhook") ? f.endpoint : f.session;
  await assert.rejects(f.run("disableEndpoint"));
  await assert.rejects(f.run("closeNewCheckoutSessions"));
});
test("mutating the original receipt cannot redirect validated operations", async () => {
  const f = fixture(),
    adapter = f.make();
  f.receipt.checkouts[0].id = "cs_test_Foreign";
  assert.equal((await adapter.closeNewCheckoutSessions(f.plan)).verified, true);
  assert.ok(f.calls.every((c) => !c.path.includes("Foreign")));
});

test("actual loopback HTTP transport executes only scoped disable/expire operations with readbacks", async () => {
  const f = fixture(),
    syntheticProvider = f.ports.stripeRequest;
  let requests = 0,
    transportFailure;
  const serverFailures = [];
  const server = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const response = await syntheticProvider({
        method: req.method,
        path: req.url,
        body: body ? JSON.parse(body) : undefined,
        account: S2.account,
        mode: "test",
        retries: 0,
      });
      requests++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(response));
    } catch (error) {
      serverFailures.push({
        code: error.code,
        name: error.name,
        message: error.message,
      });
      res.statusCode = 500;
      res.end("{}");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    f.ports.stripeRequest = async (r) => {
      let response;
      try {
        response = await globalThis.fetch(origin + r.path, {
          method: r.method,
          signal: r.signal,
          headers: { "content-type": "application/json" },
          body: r.body ? JSON.stringify(r.body) : undefined,
        });
      } catch (error) {
        transportFailure = { name: error.name, code: error.cause?.code };
        throw error;
      }
      if (!response.ok) throw Error("Synthetic transport failed");
      return response.json();
    };
    const adapter = f.make();
    try {
      await adapter.disableEndpoint(f.plan);
      await adapter.closeNewCheckoutSessions(f.plan);
    } catch {
      assert.fail(
        JSON.stringify({ requests, transportFailure, serverFailures }),
      );
    }
    assert.equal(requests, 6);
    assert.equal(f.session.status, "expired");
    assert.equal(f.endpoint.status, "disabled");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("approval is source/run bound and cannot return raw errors", async () => {
  const f = fixture(),
    digest = createHash("sha256").update(JSON.stringify(f.plan)).digest("hex");
  // Canonical plan parsing order is the same as this fixture's fixed schema.
  const canonical = {
    source: f.plan.source,
    runId: f.plan.runId,
    project: f.plan.project,
    team: f.plan.team,
    database: f.plan.database,
    account: f.plan.account,
    endpoint: f.plan.endpoint,
    owner: f.plan.owner,
    mode: f.plan.mode,
    profile: f.plan.profile,
    startedAt: f.plan.startedAt,
    expiresAt: f.plan.expiresAt,
  };
  const checked = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  assert.equal(checked, digest);
  assert.equal((await f.make().verifyApproval(f.plan, checked)).approved, true);
  f.ports.readApproval = async () => {
    throw Error("DUMMY_SECRET");
  };
  await assert.rejects(
    f.make().verifyApproval(f.plan, checked),
    (e) => !e.message.includes("DUMMY_SECRET"),
  );
});

test("each cleanup operation requires fresh approval, not just an earlier runner check", async () => {
  const f = fixture();
  f.ports.readApproval = async () => ({ approved: false });
  for (const method of [
    "disableEndpoint",
    "pauseReceiver",
    "closeNewCheckoutSessions",
    "closePortalSessions",
    "restoreRoutingAndRemoveTemporaryPreview",
  ])
    await assert.rejects(f.run(method));
  assert.equal(f.calls.length, 0);
});
