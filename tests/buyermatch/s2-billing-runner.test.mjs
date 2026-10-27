import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { billingEvidenceStore } from "../../scripts/testing/s2-billing-journal.mjs";
import {
  runBillingStage,
  BILLING_STEPS,
  billingWindowBindings,
} from "../../scripts/testing/s2-billing-runner.mjs";
import {
  REQUIRED_S2_ENV,
  S2_RELEASE as S2,
} from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const source = "de9009e165cb15709497e538118d1ceda013cdb5";
const plan = () => ({
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
  startedAt: Date.now() - 1000,
  expiresAt: Date.now() + 60000,
});
const preservation = () => ({
  buyers: 223,
  provenance: 9,
  nonstandardHashes: 8,
  buyerDigest: "a".repeat(64),
  dependenciesDigest: "b".repeat(64),
  unrelatedAccountsDigest: "c".repeat(64),
});
const safety = () =>
  Object.fromEntries(
    [
      "registrationPaused",
      "checkoutPaused",
      "liveBillingPaused",
      "deliveryDisabled",
      "receiverPaused",
      "endpointDisabled",
      "protectionEnabled",
      "fallbackVerified",
      "portalAccessEnded",
      "newCheckoutSessionsClosedOrCompleted",
      "temporaryPreviewRemoved",
      "unrelatedDeploymentsUnchanged",
      "inflightOperationsReconciled",
    ].map((k) => [k, true]),
  );
function fixture() {
  const p = plan(),
    calls = [],
    journal = [],
    claims = new Set();
  let snapshots = 0;
  const a = {
    releaseRun: async () => ({ released: true }),
    verifyApproval: async (_, d) => ({
      approved: true,
      mode: p.mode,
      planDigest: d,
    }),
    verifyAuthority: async () => ({
      ...p,
      livemode: false,
      ownerAuthorized: true,
    }),
    claimRun: async () => {
      if (claims.has(p.runId)) return { claimed: false };
      claims.add(p.runId);
      return { claimed: true };
    },
    readPreflight: async () => ({
      ...p,
      ...safety(),
      target: "preview",
      ready: true,
      livemode: false,
      normalLoginVerified: true,
      restrictedKeysVerified: true,
      billingGuardsVerified: true,
      serverWindowGuardVerified: true,
      versionedAgreementsVerified: true,
      noPriorUnreconciledCheckout: true,
      build: { ...REQUIRED_S2_ENV },
      runtime: { ...REQUIRED_S2_ENV },
    }),
    verifyWatchdog: async (_, d) => ({
      independent: true,
      planDigest: d,
      canCloseBothGates: true,
      canRemoveTemporaryPreview: true,
      canCloseProviderSessions: true,
      expiresAt: p.expiresAt,
    }),
    activateTestWindow: async (_, b) => {
      calls.push("activate");
      return {
        verified: true,
        registrationPaused: true,
        liveBillingPaused: true,
        deliveryDisabled: true,
        bindingsDigest: hash(b),
      };
    },
    runStep: async (_, step) => {
      calls.push(step);
      return {
        passed: true,
        mode: p.mode,
        owner: p.owner,
        testMode: true,
        assertions: Object.fromEntries(
          BILLING_STEPS[step].map((k) => [k, true]),
        ),
      };
    },
    readPreservation: async () => {
      snapshots++;
      return preservation();
    },
    readClosure: async () => safety(),
  };
  for (const name of [
    "disableEndpoint",
    "pauseReceiver",
    "closeNewCheckoutSessions",
    "closePortalSessions",
    "restoreRoutingAndRemoveTemporaryPreview",
  ])
    a[name] = async () => {
      calls.push(name);
      return { verified: true };
    };
  const options = {
    approvedSource: source,
    journal: async (value) => {
      journal.push(value);
      return { durable: true };
    },
    timeoutMs: 1000,
  };
  return {
    p,
    a,
    options,
    calls,
    journal,
    get snapshots() {
      return snapshots;
    },
    run: () => runBillingStage(p, a, options),
  };
}
test("activation and lifecycle runner profiles finish every scoped step and all independent closures", async () => {
  for (const profile of ["activation", "lifecycle"]) {
    const f = fixture();
    f.p.profile = profile;
    const r = await f.run();
    assert.equal(r.status, "PASS");
    assert.equal(r.mode, "LOCAL_SYNTHETIC");
    assert.equal(r.closureVerified, true);
    assert.equal(f.snapshots, 2);
    assert.equal(f.journal.at(-1).stage, "closure");
    assert.ok(f.calls.includes("closePortalSessions"));
  }
});
for (const change of [
  { account: "wrong" },
  { database: "aigvnbxiydbzzqbetlhl" },
  { owner: "foreign" },
  { source: "0".repeat(40) },
  { expiresAt: 0 },
])
  test(
    "wrong scope/source/window invokes no provider action " +
      JSON.stringify(change),
    async () => {
      const f = fixture();
      Object.assign(f.p, change);
      await assert.rejects(f.run(), /invalid/);
      assert.deepEqual(f.calls, []);
    },
  );
test("missing or denied owner approval cannot activate or perform cleanup mutations", async () => {
  const f = fixture();
  f.a.verifyApproval = async () => ({ approved: false });
  await assert.rejects(f.run(), /approval/);
  assert.deepEqual(f.calls, []);
});
test("persistent exclusive claim refuses reuse of a completed run without closing another run", async () => {
  const f = fixture();
  assert.equal((await f.run()).status, "PASS");
  f.calls.length = 0;
  await assert.rejects(f.run(), /claimed/);
  assert.deepEqual(f.calls, []);
});
test("attestation mismatch stops before activation and still performs authorized containment", async () => {
  const f = fixture(),
    old = f.a.readPreflight;
  f.a.readPreflight = async () => {
    const p = await old();
    p.runtime.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS = "false";
    return p;
  };
  const r = await f.run();
  assert.notEqual(r.status, "PASS");
  assert.ok(!f.calls.includes("activate"));
  assert.ok(f.calls.includes("disableEndpoint"));
  assert.ok(f.calls.includes("pauseReceiver"));
});
test("unsafe original preservation stops without activation", async () => {
  const f = fixture();
  f.a.readPreservation = async () => ({ ...preservation(), buyers: 222 });
  assert.notEqual((await f.run()).status, "PASS");
  assert.ok(!f.calls.includes("activate"));
});
test("loss of buyer bytes or unrelated accounts is never a successful closure", async () => {
  const f = fixture();
  let reads = 0;
  f.a.readPreservation = async () => ({
    ...preservation(),
    buyerDigest: (reads++ ? "d" : "a").repeat(64),
  });
  const r = await f.run();
  assert.equal(r.status, "CLOSURE_UNVERIFIED");
  assert.equal(r.requiresOperator, true);
});
test("raw token-bearing step results fail closed and never enter sanitized journal/result", async () => {
  const f = fixture();
  f.a.runStep = async () => ({
    passed: true,
    url: "https://dummy.invalid/DO_NOT_LOG",
  });
  const r = await f.run();
  assert.equal(r.status, "FAILED_CONTAINED");
  assert.ok(!JSON.stringify([r, f.journal]).includes("DO_NOT_LOG"));
  assert.equal(f.calls.includes("activation"), false);
});
test("step errors stop remaining tests without exposing details or retrying", async () => {
  const f = fixture();
  let count = 0;
  f.a.runStep = async () => {
    count++;
    throw Error("DUMMY_SECRET");
  };
  const r = await f.run();
  assert.equal(count, 1);
  assert.equal(r.status, "FAILED_CONTAINED");
  assert.ok(!JSON.stringify([r, f.journal]).includes("DUMMY_SECRET"));
});
for (const name of [
  "disableEndpoint",
  "pauseReceiver",
  "closeNewCheckoutSessions",
  "closePortalSessions",
  "restoreRoutingAndRemoveTemporaryPreview",
])
  test(
    "closure failure does not suppress other closure operations: " + name,
    async () => {
      const f = fixture();
      f.a[name] = async () => {
        f.calls.push(name);
        throw Error("DUMMY_SECRET");
      };
      const r = await f.run();
      assert.equal(r.status, "CLOSURE_UNVERIFIED");
      assert.ok(f.calls.includes("disableEndpoint"));
      assert.ok(f.calls.includes("pauseReceiver"));
      assert.ok(f.calls.includes("closePortalSessions"));
    },
  );
test("unknown portal expiration remains UNKNOWN rather than assuming closing a browser revokes Stripe", async () => {
  const f = fixture();
  f.p.profile = "lifecycle";
  f.a.readClosure = async () => ({ ...safety(), portalAccessEnded: undefined });
  assert.equal((await f.run()).status, "CLOSURE_UNVERIFIED");
});
test("a hung operation times out, signals abort, and contains instead of continuing", async () => {
  const f = fixture();
  f.options.timeoutMs = 15;
  let aborted = false;
  f.a.runStep = async (_, __, signal) =>
    new Promise(() => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
  const r = await f.run();
  assert.equal(aborted, true);
  assert.equal(r.status, "FAILED_CONTAINED");
  assert.ok(f.calls.includes("pauseReceiver"));
});
test("journal acknowledgement loss cannot become PASS even when readbacks are safe", async () => {
  const f = fixture();
  f.options.journal = async () => ({ durable: false });
  assert.equal((await f.run()).status, "CLOSURE_UNVERIFIED");
  assert.ok(!f.calls.includes("activate"));
});
test("runner composes with actual shared lock and durable journal; verified closure releases only the lock", async () => {
  const f = fixture(),
    base = await mkdtemp(path.join(tmpdir(), "bm-runner-public-"));
  try {
    const store = await billingEvidenceStore(base, f.p);
    f.a.claimRun = store.claimRun;
    f.a.releaseRun = store.releaseRun;
    f.options.journal = store.journal;
    assert.equal((await f.run()).status, "PASS");
    await assert.rejects(
      readFile(path.join(base, "dbp-s2-billing.lock.json")),
      { code: "ENOENT" },
    );
    assert.ok(await readFile(path.join(base, f.p.runId + ".claim.json")));
  } finally {
    assert.equal(path.dirname(base), path.resolve(tmpdir()));
    await rm(base, { recursive: true, force: true });
  }
});

test("activation profile never authorizes a portal action", () => {
  const f = fixture();
  assert.equal(billingWindowBindings(f.p).BM_S2_BILLING_OPERATIONS, "checkout");
  f.p.profile = "lifecycle";
  assert.equal(
    billingWindowBindings(f.p).BM_S2_BILLING_OPERATIONS,
    "payment,change,cancel",
  );
});

test("HOSTED lifecycle is blocked before any adapter call until provider-session containment is resolved", async () => {
  const f = fixture();
  f.p.mode = "HOSTED";
  f.p.profile = "lifecycle";
  await assert.rejects(f.run(), /Portal-session containment/);
  assert.deepEqual(f.calls, []);
});

test("unverified lock release requires operator review and never records final success", async () => {
  const f = fixture();
  f.a.releaseRun = async () => ({ released: false });
  const r = await f.run();
  assert.equal(r.status, "CLOSURE_UNVERIFIED");
  assert.equal(r.requiresOperator, true);
  assert.equal(f.journal.at(-1).status, "FAILED_OR_UNKNOWN");
});

test("wrong or unknown provider authority causes no mutations", async () => {
  for (const account of ["foreign", undefined]) {
    const f = fixture();
    f.a.verifyAuthority = async () => ({ account });
    await assert.rejects(f.run(), /authority/);
    assert.deepEqual(f.calls, []);
  }
});
test("authority drift prevents cleanup through another account and reports unknown containment", async () => {
  const f = fixture();
  let n = 0,
    old = f.a.verifyAuthority;
  f.a.verifyAuthority = async () =>
    ++n === 1 ? old() : { account: "foreign" };
  assert.equal((await f.run()).status, "CLOSURE_UNVERIFIED");
  assert.ok(!f.calls.includes("disableEndpoint"));
});
test("missing deployed server guard stops before opening the test window", async () => {
  const f = fixture(),
    old = f.a.readPreflight;
  f.a.readPreflight = async () => ({
    ...(await old()),
    serverWindowGuardVerified: false,
  });
  assert.notEqual((await f.run()).status, "PASS");
  assert.ok(!f.calls.includes("activate"));
});

test("unverified webhook ownership cannot mutate a different endpoint in the same sandbox", async () => {
  const f = fixture(),
    old = f.a.verifyAuthority;
  f.a.verifyAuthority = async () => ({
    ...(await old()),
    endpoint: "we_foreign",
  });
  await assert.rejects(f.run(), /authority/);
  assert.deepEqual(f.calls, []);
});
test("an operation finishing after the window cannot be recorded as PASS", async () => {
  const f = fixture(),
    old = f.a.runStep;
  let time = f.p.startedAt + 1000;
  f.options.now = () => time;
  f.a.runStep = async (...args) => {
    const result = await old(...args);
    time = f.p.expiresAt;
    return result;
  };
  const result = await f.run();
  assert.equal(result.status, "FAILED_CONTAINED");
  assert.deepEqual(result.steps, []);
});
