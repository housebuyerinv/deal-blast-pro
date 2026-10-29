import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { billingEvidenceStore } from "../../scripts/testing/s2-billing-journal.mjs";
import { closeCampaignSubscription } from "../../scripts/testing/s2-billing-subscription-cleanup.mjs";
import { makeBillingTransports } from "../../scripts/testing/s2-billing-transports.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function fixture(fn, { creation = true } = {}) {
  const base = await mkdtemp(
    path.join(await realpath(tmpdir()), "bm-sub-cleanup-"),
  );
  try {
    const source = "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
      operatorSource = "a".repeat(40),
      now = Math.floor(Date.now() / 1000) * 1000;
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
    const receipt = {
      source,
      runId: plan.runId,
      checkouts: [{ id: "cs_test_Campaign", checkoutId: plan.runId }],
    };
    const approval = {
      approved: true,
      planDigest: hash(plan),
      mode: plan.mode,
      scope: "subscription-activation",
      cleanupOperatorSource: operatorSource,
      cancelCampaignCreatedTestSubscription: true,
    };
    const authority = { ...plan, livemode: false, ownerAuthorized: true };
    const policy = {
      source,
      runId: plan.runId,
      issuanceJournalComplete: true,
      inflightReconciled: true,
      sessionIds: ["cs_test_Campaign"],
    };
    const metadata = {
      dealBlastUserId: plan.owner,
      dbpProduct: "buyermatch",
      dbpCheckoutId: plan.runId,
      dbpS2RunId: plan.runId,
    };
    const session = {
      id: "cs_test_Campaign",
      livemode: false,
      mode: "subscription",
      client_reference_id: plan.owner,
      metadata,
      created: now / 1000,
      status: "complete",
      subscription: "sub_Campaign",
      customer: "cus_Campaign",
      payment_status: "paid",
      amount_total: 11900,
      currency: "usd",
    };
    const subscription = {
      id: "sub_Campaign",
      livemode: false,
      customer: "cus_Campaign",
      metadata: { ...metadata },
      created: now / 1000,
      status: "active",
      items: {
        has_more: false,
        data: [{ quantity: 1, price: { id: S2.pro } }],
      },
    };
    const customer = {
      id: "cus_Campaign",
      livemode: false,
      created: now / 1000,
    };
    const store = await billingEvidenceStore(base, plan);
    await store.claimRun();
    await store.recordSubscriptionBaseline({
      observedAt: plan.startedAt,
      subscriptionIds: ["sub_Preexisting"],
    });
    if (creation)
      await store.recordSubscriptionCreation({
        subscription: subscription.id,
        customer: customer.id,
        session: session.id,
        checkoutId: plan.runId,
      });
    const related = { has_more: false, data: [{ id: subscription.id }] },
      invoices = { has_more: false, data: [] };
    const calls = [];
    let outcome = "success";
    const ports = {
      readApproval: async () => approval,
      readAuthority: async () => authority,
      readCheckoutPolicy: async () => policy,
      readSubscriptionEvidence: store.readSubscriptionEvidence,
      recordSubscriptionCreation: store.recordSubscriptionCreation,
      claimSubscriptionCancellation: store.claimSubscriptionCancellation,
      stripeRequest: async (r) => {
        calls.push({ method: r.method, path: r.path, body: r.body });
        if (r.path.startsWith("/v1/subscriptions?"))
          return structuredClone(related);
        if (r.path.startsWith("/v1/invoices?"))
          return structuredClone(invoices);
        if (r.method === "DELETE") {
          assert.equal(r.path, "/v1/subscriptions/sub_Campaign");
          assert.deepEqual(r.body, { invoice_now: false, prorate: false });
          assert.equal(r.retries, 0);
          if (outcome === "unknown") throw Error("synthetic timeout");
          subscription.status = "canceled";
          subscription.canceled_at = now / 1000;
          if (outcome === "lost-response")
            throw Error("synthetic lost response");
        }
        if (r.path === "/v1/checkout/sessions/" + session.id)
          return structuredClone(session);
        if (r.path === "/v1/customers/" + customer.id)
          return structuredClone(customer);
        if (r.path === "/v1/subscriptions/" + subscription.id)
          return structuredClone(subscription);
        throw Error("unexpected object");
      },
    };
    await fn({
      plan,
      receipt,
      operatorSource,
      approval,
      authority,
      policy,
      session,
      subscription,
      customer,
      store,
      base,
      calls,
      ports,
      related,
      invoices,
      setOutcome: (v) => (outcome = v),
      run: () =>
        closeCampaignSubscription(plan, receipt, ports, operatorSource),
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}
test("durable campaign cancellation, independent GET, restarted store and no repeated DELETE", () =>
  fixture(async (f) => {
    assert.deepEqual(await f.run(), { verified: true });
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
    assert.equal(f.calls.at(-1).method, "GET");
    const reopened = await billingEvidenceStore(f.base, f.plan);
    f.ports.readSubscriptionEvidence = reopened.readSubscriptionEvidence;
    f.ports.claimSubscriptionCancellation =
      reopened.claimSubscriptionCancellation;
    await f.run();
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
  }));
for (const [name, alter] of [
  [
    "missing new permission",
    (f) => (f.approval.cancelCampaignCreatedTestSubscription = false),
  ],
  [
    "wrong operator pin",
    (f) => (f.approval.cleanupOperatorSource = "b".repeat(40)),
  ],
  ["wrong account", (f) => (f.authority.account = "acct_Foreign")],
  ["live authority", (f) => (f.authority.livemode = true)],
  ["wrong S2 project", (f) => (f.authority.database = "foreign")],
  ["incomplete issuance", (f) => (f.policy.inflightReconciled = false)],
  [
    "missing durable evidence",
    (f) =>
      (f.ports.readSubscriptionEvidence = async () => ({ durable: false })),
  ],
  [
    "tampered evidence hash",
    (f) => {
      const read = f.ports.readSubscriptionEvidence;
      f.ports.readSubscriptionEvidence = async (p) => ({
        ...(await read(p)),
        creationSha256: "0".repeat(64),
      });
    },
  ],
  [
    "preexisting subscription",
    (f) => {
      const read = f.ports.readSubscriptionEvidence;
      f.ports.readSubscriptionEvidence = async (p) => {
        const e = await read(p);
        e.baseline.subscriptionIds.push("sub_Campaign");
        e.baselineSha256 = hash(e.baseline);
        e.creation.baselineSha256 = e.baselineSha256;
        e.creationSha256 = hash(e.creation);
        return e;
      };
    },
  ],
  ["foreign Checkout customer", (f) => (f.session.customer = "cus_Foreign")],
  [
    "foreign subscription customer",
    (f) => (f.subscription.customer = "cus_Foreign"),
  ],
  [
    "foreign owner",
    (f) => (f.subscription.metadata.dealBlastUserId = "foreign"),
  ],
  ["foreign run", (f) => (f.subscription.metadata.dbpS2RunId = "foreign")],
  [
    "wrong checkout metadata",
    (f) => (f.subscription.metadata.dbpCheckoutId = "foreign"),
  ],
  ["live subscription", (f) => (f.subscription.livemode = true)],
  ["live customer", (f) => (f.customer.livemode = true)],
  [
    "wrong price",
    (f) => (f.subscription.items.data[0].price.id = "price_Foreign"),
  ],
  ["wrong quantity", (f) => (f.subscription.items.data[0].quantity = 2)],
  ["paginated items", (f) => (f.subscription.items.has_more = true)],
  [
    "pre-campaign creation",
    (f) => (f.subscription.created = Math.floor(f.plan.startedAt / 1000) - 10),
  ],
  ["open Checkout", (f) => (f.session.status = "open")],
  ["unpaid Checkout", (f) => (f.session.payment_status = "unpaid")],
  ["wrong amount", (f) => (f.session.amount_total = 1)],
])
  test("rejects " + name + " without DELETE", () =>
    fixture(async (f) => {
      alter(f);
      await assert.rejects(f.run());
      assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 0);
    }),
  );
test("lost DELETE response resolves only by exact-object independent readback", () =>
  fixture(async (f) => {
    f.setOutcome("lost-response");
    await f.run();
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
  }));
test("unknown DELETE outcome blocks retries even in independently reconstructed store", () =>
  fixture(async (f) => {
    f.setOutcome("unknown");
    await assert.rejects(f.run());
    const reopened = await billingEvidenceStore(f.base, f.plan);
    f.ports.readSubscriptionEvidence = reopened.readSubscriptionEvidence;
    f.ports.claimSubscriptionCancellation =
      reopened.claimSubscriptionCancellation;
    await assert.rejects(f.run());
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
  }));
test("revoked authority after durable cancellation claim prevents mutation", () =>
  fixture(async (f) => {
    const claim = f.ports.claimSubscriptionCancellation;
    f.ports.claimSubscriptionCancellation = async (...args) => {
      const r = await claim(...args);
      f.authority.ownerAuthorized = false;
      return r;
    };
    await assert.rejects(f.run());
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 0);
  }));
test("private transport permits exact validated cancellation but generic DELETE stays forbidden", () =>
  fixture(async (f) => {
    const api = makeBillingTransports(f.plan, {
      approvedSource: f.plan.source,
      operatorSource: f.operatorSource,
      subscriptionEvidenceStore: f.store,
      readCheckoutPolicy: f.ports.readCheckoutPolicy,
      verifyApproval: async () => f.approval,
      verifyAuthority: f.ports.readAuthority,
      journal: async () => ({ durable: true }),
      headersFor: async () => ({ authorization: "Bearer rk_test_SYNTHETIC" }),
      fetcher: async (url, o) =>
        new Response(
          JSON.stringify(
            await f.ports.stripeRequest({
              method: o.method,
              path: new URL(url).pathname + new URL(url).search,
              body:
                o.method === "DELETE"
                  ? Object.fromEntries(
                      new URLSearchParams(o.body)
                        .entries()
                        .map(([k, v]) => [k, v === "false" ? false : v]),
                    )
                  : undefined,
              retries: 0,
            }),
          ),
          { status: 200 },
        ),
    });
    await assert.rejects(
      api.stripeRequest({
        method: "DELETE",
        path: "/v1/subscriptions/sub_Campaign",
        body: {},
        account: f.plan.account,
        mode: "test",
        retries: 0,
      }),
    );
    assert.deepEqual(
      await api.closeCampaignSubscription(f.plan, f.receipt, f.operatorSource),
      { verified: true },
    );
    assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
  }));

test("independent watchdog reconstructs missing creation receipt from exact Checkout and durable baseline", () =>
  fixture(
    async (f) => {
      const reopened = await billingEvidenceStore(f.base, f.plan);
      f.ports.readSubscriptionEvidence = reopened.readSubscriptionEvidence;
      f.ports.recordSubscriptionCreation = reopened.recordSubscriptionCreation;
      f.ports.claimSubscriptionCancellation =
        reopened.claimSubscriptionCancellation;
      await f.run();
      assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);
      assert.equal(
        (await reopened.readSubscriptionEvidence(f.plan)).creation.subscription,
        "sub_Campaign",
      );
    },
    { creation: false },
  ));
test("expired Checkout without creation is a verified no-op only with complete issuance reconciliation", () =>
  fixture(
    async (f) => {
      f.session.status = "expired";
      f.session.subscription = null;
      await f.run();
      assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 0);
    },
    { creation: false },
  ));
for (const [name, alter] of [
  [
    "preexisting customer",
    (f) => (f.customer.created = Math.floor(f.plan.startedAt / 1000) - 10),
  ],
  [
    "CRM subscription on shared customer",
    (f) => f.related.data.push({ id: "sub_Crm" }),
  ],
  ["unknown paginated subscriptions", (f) => (f.related.has_more = true)],
  [
    "unrelated invoice",
    (f) =>
      f.invoices.data.push({
        id: "in_Crm",
        livemode: false,
        customer: f.customer.id,
        status: "paid",
        paid: true,
        subscription: "sub_Crm",
      }),
  ],
  ["unknown paginated invoices", (f) => (f.invoices.has_more = true)],
])
  test("rejects " + name + " without DELETE", () =>
    fixture(async (f) => {
      alter(f);
      await assert.rejects(f.run());
      assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 0);
    }),
  );
test("creation evidence is create-only and refuses a baseline subscription", () =>
  fixture(async (f) => {
    await assert.rejects(
      f.store.recordSubscriptionCreation({
        subscription: "sub_Preexisting",
        customer: f.customer.id,
        session: f.session.id,
        checkoutId: f.plan.runId,
      }),
      /Pre-existing/,
    );
    await assert.rejects(
      f.store.recordSubscriptionCreation({
        subscription: "sub_Another",
        customer: f.customer.id,
        session: f.session.id,
        checkoutId: f.plan.runId,
      }),
      { code: "EEXIST" },
    );
    assert.equal(
      (await f.store.readSubscriptionEvidence(f.plan)).creation.subscription,
      "sub_Campaign",
    );
  }));
