import test from "node:test";
import assert from "node:assert/strict";
import { URL } from "node:url";
import { createServer } from "node:http";
import { makeBillingTransports } from "../../scripts/testing/s2-billing-transports.mjs";
import {
  S2_RELEASE as S2,
  REQUIRED_S2_ENV,
} from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
import { billingWindowBindings } from "../../scripts/testing/s2-billing-runner.mjs";
const source = "c00d59f048282343af5d81afe9655556aa285e75";
function fixture() {
  const time = Date.now(),
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
      startedAt: time - 1000,
      expiresAt: time + 60000,
    };
  const requests = [],
    events = [],
    opened = [];
  const session = {
    id: "cs_test_OnlyOwned",
    created: Math.floor(time / 1000),
    livemode: false,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    client_reference_id: plan.owner,
    metadata: {
      dealBlastUserId: plan.owner,
      dbpProduct: "buyermatch",
      dbpS2RunId: plan.runId,
      dbpCheckoutId: plan.runId,
    },
  };
  const entitlement = {
    owner_id: plan.owner,
    product: "buyermatch",
    plan_version: "buyermatch-pro-v1",
    status: "active",
    allowance: 50,
    stripe_subscription_id: "sub_Owned",
  };
  const window = {
    ...billingWindowBindings(plan),
    schema: 1,
    source,
    projectId: plan.project,
    deploymentId: "dpl_SyntheticOnly",
    checkoutEnabled: true,
    registrationPaused: true,
    liveBillingDisabled: true,
    deliveryDisabled: true,
  };
  const opts = {
    approvedSource: source,
    now: () => time,
    timeoutMs: 1000,
    verifyApproval: async (_, digest) => ({
      approved: true,
      planDigest: digest,
      mode: plan.mode,
    }),
    verifyAuthority: async () => ({
      ...plan,
      livemode: false,
      ownerAuthorized: true,
    }),
    headersFor: async (slot) =>
      slot === "guard-probe"
        ? {}
        : {
            authorization:
              "Bearer " +
              (slot.startsWith("stripe")
                ? "rk_test_dummy_" +
                  (slot === "stripe-operator" ? "operator" : "runtime")
                : slot === "supabase"
                  ? "admin_dummy"
                  : "user_dummy"),
            ...(slot.startsWith("supabase") ? { apikey: "dummy_public" } : {}),
          },
    journal: async (entry) => {
      events.push(entry);
      return { durable: true };
    },
    privateOpenCheckout: async (value) => {
      opened.push(value);
    },
    fetcher: async (url, options) => {
      requests.push({ url, options });
      const u = new URL(url);
      let value;
      if (u.pathname === "/auth/v1/user")
        value = {
          id: plan.owner,
          role: "authenticated",
          email_confirmed_at: "2026-10-27T12:00:00Z",
        };
      else if (u.pathname === "/api/buyermatch" && options.method === "GET")
        value = window;
      else if (u.pathname === "/api/buyermatch") {
        assert.deepEqual(JSON.parse(options.body), {
          action: "checkout",
          planVersion: "buyermatch-pro-v1",
          operationKey: plan.runId,
        });
        value = {
          url: "https://checkout.stripe.com/DUMMY_CAPABILITY",
          testMode: true,
        };
      } else if (u.pathname === "/rest/v1/bm_entitlements")
        value = [entitlement];
      else if (u.pathname === "/rest/v1/bm_checkouts")
        value = [
          {
            owner_id: plan.owner,
            id: plan.runId,
            session_id: session.id,
            state: "pending",
            operation_key: plan.runId,
          },
        ];
      else if (u.pathname === "/rest/v1/bm_billing_events")
        value = [
          {
            owner_id: plan.owner,
            event_id: "evt_Owned",
            event_created: 100,
            subscription_id: "sub_Owned",
            product: "buyermatch",
          },
        ];
      else if (u.pathname === "/v1/subscriptions/sub_Owned")
        value = {
          id: "sub_Owned",
          status: "active",
          livemode: false,
          metadata: { dealBlastUserId: plan.owner, dbpProduct: "buyermatch" },
          latest_invoice: "in_Owned",
        };
      else if (u.pathname === "/v1/invoices/in_Owned")
        value = {
          id: "in_Owned",
          livemode: false,
          status: "paid",
          paid: true,
          amount_paid: 11900,
          parent: { subscription_details: { subscription: "sub_Owned" } },
        };
      else if (u.pathname.startsWith("/v1/checkout/sessions/")) {
        if (u.pathname.endsWith("/expire")) {
          session.status = "expired";
          assert.equal(options.body, "");
        }
        value = session;
      } else if (u.pathname === "/v1/webhook_endpoints/" + plan.endpoint)
        value = {
          id: plan.endpoint,
          status: "disabled",
          livemode: false,
          url: `https://${plan.database}.supabase.co/functions/v1/stripe-webhook`,
        };
      else if (u.pathname === "/v1/billing_portal/configurations/" + S2.portal)
        value = {
          id: S2.portal,
          active: true,
          livemode: false,
          login_page: { enabled: false },
          features: {},
        };
      else assert.fail("Unexpected synthetic request");
      return new globalThis.Response(JSON.stringify(value));
    },
  };
  return {
    plan,
    window,
    opts,
    requests,
    events,
    opened,
    session,
    entitlement,
    make: () => makeBillingTransports(plan, opts),
  };
}
test("transport performs exact S2 entitlement/subscription/invoice/ledger reads and strips owner data", async () => {
  const f = fixture(),
    a = f.make();
  assert.equal((await a.readEntitlement())[0].allowance, 50);
  assert.equal(
    (await a.readSubscription("sub_Owned")).latest_invoice,
    "in_Owned",
  );
  assert.equal((await a.readInvoice("in_Owned")).amount_paid, 11900);
  assert.equal((await a.readLedger("evt_Owned")).length, 1);
  assert.ok(
    f.requests.every(
      (r) => r.options.redirect === "error" && r.options.cache === "no-store",
    ),
  );
  for (const r of f.requests.filter((r) => r.url.includes("api.stripe.com")))
    assert.equal(r.options.headers.get("stripe-context"), S2.account);
  assert.equal(JSON.stringify(f.events).includes("Bearer"), false);
  assert.equal(JSON.stringify(f.events).includes("owner_id"), false);
});
test("normal owner Auth and attested window precede Pro Checkout; capability reaches only private sink", async () => {
  const f = fixture();
  const result = await f.make().createProCheckout();
  assert.deepEqual(result, { created: true });
  assert.equal(f.opened.length, 1);
  assert.equal(
    f.requests[0].url,
    `https://${S2.staging}.supabase.co/auth/v1/user`,
  );
  assert.equal(
    f.requests[0].options.headers.get("authorization"),
    "Bearer user_dummy",
  );
  const post = f.requests.find((r) => r.options.method === "POST");
  assert.equal(post.url, S2.origin + "/api/buyermatch");
  assert.ok(
    post.options.headers.get("x-dbp-operation-key").startsWith(f.plan.runId),
  );
  assert.equal(
    JSON.stringify([result, f.events]).includes("DUMMY_CAPABILITY"),
    false,
  );
});
test("only DB-mapped, provider-verified run sessions may be expired, with separate operator credentials", async () => {
  const f = fixture(),
    a = f.make();
  await a.readCheckoutMapping();
  assert.equal(
    (
      await a.stripeRequest({
        method: "POST",
        path: "/v1/checkout/sessions/" + f.session.id + "/expire",
        body: {},
        account: S2.account,
        mode: "test",
        retries: 0,
      })
    ).status,
    "expired",
  );
  await a.stripeRequest({
    method: "POST",
    path: "/v1/webhook_endpoints/" + S2.endpoint,
    body: { disabled: true },
    account: S2.account,
    mode: "test",
    retries: 0,
  });
  assert.equal(
    f.requests.at(-1).options.headers.get("authorization"),
    "Bearer rk_test_dummy_operator",
  );
});
test("Portal configuration is read-only; creation, enable, foreign sessions and arbitrary paths are refused", async () => {
  const f = fixture(),
    a = f.make();
  assert.equal((await a.readPortalConfiguration()).loginPageEnabled, false);
  const count = f.requests.length;
  for (const r of [
    { method: "POST", path: "/v1/billing_portal/sessions", body: {} },
    {
      method: "POST",
      path: "/v1/webhook_endpoints/" + S2.endpoint,
      body: { disabled: false },
    },
    {
      method: "POST",
      path: "/v1/checkout/sessions/cs_test_Foreign/expire",
      body: {},
    },
    { method: "GET", path: "https://production.invalid" },
  ])
    await assert.rejects(
      a.stripeRequest({ ...r, account: S2.account, mode: "test", retries: 0 }),
    );
  assert.equal(f.requests.length, count);
});
test("foreign entitlement, owner mapping or unverified subscription cannot be read through", async () => {
  const f = fixture();
  f.entitlement.owner_id = "foreign";
  await assert.rejects(f.make().readEntitlement());
  const a = fixture().make();
  await assert.rejects(a.readSubscription("sub_Foreign"));
  await assert.rejects(a.readInvoice("in_Foreign"));
});
for (const [label, mutate] of [
  [
    "denied approval",
    (f) => {
      f.opts.verifyApproval = async () => ({ approved: false });
    },
  ],
  [
    "wrong account",
    (f) => {
      f.opts.verifyAuthority = async () => ({
        ...f.plan,
        account: "foreign",
        livemode: false,
        ownerAuthorized: true,
      });
    },
  ],
  [
    "unacknowledged evidence",
    (f) => {
      f.opts.journal = async () => ({ durable: false });
    },
  ],
  [
    "live key",
    (f) => {
      f.opts.headersFor = async () => ({
        authorization: "Bearer sk_live_dummy",
      });
    },
  ],
  [
    "unrestricted runtime key",
    (f) => {
      f.opts.headersFor = async () => ({
        authorization: "Bearer sk_test_dummy",
      });
    },
  ],
  [
    "header injection",
    (f) => {
      f.opts.headersFor = async () => ({
        authorization: "Bearer rk_test_dummy",
        host: "production.invalid",
      });
    },
  ],
])
  test(label + " prevents transport requests", async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.make().readPortalConfiguration(), /UNVERIFIED/);
    assert.equal(f.requests.length, 0);
  });
test("wrong-runtime binding, expired window and service identity cannot create Checkout", async () => {
  for (const kind of ["runtime", "expired", "service"]) {
    const f = fixture();
    if (kind === "runtime") f.window.source = "wrong";
    if (kind === "expired") f.opts.now = () => f.plan.expiresAt;
    if (kind === "service")
      f.opts.fetcher = async () =>
        new globalThis.Response(
          JSON.stringify({
            id: f.plan.owner,
            role: "service_role",
            email_confirmed_at: "x",
          }),
        );
    await assert.rejects(f.make().createProCheckout());
    assert.equal(f.opened.length, 0);
    assert.equal(
      f.requests.some((r) => r.options.method === "POST"),
      false,
    );
  }
});
test("different app and verified-user bearers are rejected before a billing write", async () => {
  const f = fixture(),
    old = f.opts.headersFor;
  f.opts.headersFor = async (slot) =>
    slot === "application"
      ? { authorization: "Bearer different_user" }
      : old(slot);
  await assert.rejects(f.make().createProCheckout());
  assert.equal(f.requests.length, 1);
});
test("timeouts bound hung authority/credential callbacks as well as HTTP; errors never expose private text", async () => {
  for (const name of ["verifyAuthority", "headersFor", "fetcher"]) {
    const f = fixture();
    f.opts.timeoutMs = 15;
    f.opts[name] = async () => new Promise(() => {});
    await assert.rejects(f.make().readEntitlement(), /UNVERIFIED/);
  }
  const f = fixture();
  f.opts.privateOpenCheckout = async () => {
    throw Error("DUMMY_PRIVATE");
  };
  await assert.rejects(
    f.make().createProCheckout(),
    (e) => !e.message.includes("DUMMY_PRIVATE"),
  );
});
test("oversized, malformed and non-OK provider responses fail without retry or raw error disclosure", async () => {
  for (const response of [
    new globalThis.Response("x".repeat(65537)),
    new globalThis.Response("bad json"),
    new globalThis.Response("DUMMY_PRIVATE", { status: 403 }),
  ]) {
    const f = fixture();
    let count = 0;
    f.opts.fetcher = async () => {
      count++;
      return response;
    };
    await assert.rejects(
      f.make().readEntitlement(),
      (e) => !e.message.includes("DUMMY_PRIVATE"),
    );
    assert.equal(count, 1);
  }
});
test("new provider transport runs through an actual loopback socket without ambient credentials", async () => {
  const f = fixture();
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.method, "GET");
    assert.equal(req.headers.authorization, "Bearer admin_dummy");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([f.entitlement]));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    f.opts.fetcher = async (url, o) => {
      assert.equal(new URL(url).origin, `https://${S2.staging}.supabase.co`);
      return globalThis.fetch(origin + new URL(url).pathname, { ...o });
    };
    assert.equal((await f.make().readEntitlement())[0].allowance, 50);
    assert.equal(requests, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("caller-aborted operations and missing synthetic fetch adapter cannot touch a provider", async () => {
  const f = fixture(),
    abort = new globalThis.AbortController();
  abort.abort();
  await assert.rejects(f.make().readEntitlement(abort.signal));
  assert.equal(f.requests.length, 0);
  delete f.opts.fetcher;
  assert.throws(f.make);
});

test("actual attestation path validates exact source/run/deployment and all17 build/runtime settings", async () => {
  const f = fixture();
  const evidence = {
    schema: 1,
    qaOnly: true,
    identity: {
      deploymentId: "dpl_SyntheticOnly",
      projectId: S2.project,
      sourceSha: source,
      runId: f.plan.runId,
      target: "preview",
      hostname: "dbp-registration-s2-synthetic-housebuyerinv.vercel.app",
    },
    build: {
      sha256: "a".repeat(64),
      observedAt: new Date().toISOString(),
      observation: "build-process-environment",
      settings: { ...REQUIRED_S2_ENV },
    },
    runtime: {
      observation: "effective-function-process-environment",
      settings: { ...REQUIRED_S2_ENV },
    },
  };
  f.opts.fetcher = async (url) => {
    assert.equal(url, S2.origin + "/api/platform/s2-attestation");
    return new globalThis.Response(JSON.stringify(evidence));
  };
  assert.equal(
    (await f.make().readAttestation("dpl_SyntheticOnly")).source,
    source,
  );
  evidence.runtime.settings.BM_LIVE_DELIVERY_ENABLED = "true";
  await assert.rejects(f.make().readAttestation("dpl_SyntheticOnly"));
});
test("hosted transport requires a pinned immutable Preview and independent source/origin binding", async () => {
  const f = fixture();
  f.plan.mode = "HOSTED";
  assert.throws(f.make);
  f.opts.previewOrigin = "https://production.invalid";
  f.opts.deploymentId = "dpl_Candidate";
  assert.throws(f.make);
  f.opts.previewOrigin =
    "https://dbp-registration-s2-candidate-housebuyerinv.vercel.app";
  await assert.rejects(f.make().readPortalConfiguration());
  assert.equal(f.requests.length, 0);
  f.opts.verifyAuthority = async () => ({
    ...f.plan,
    livemode: false,
    ownerAuthorized: true,
    source,
    previewOrigin: f.opts.previewOrigin,
    deploymentId: f.opts.deploymentId,
    protectionEnabled: true,
  });
  assert.equal((await f.make().readPortalConfiguration()).active, true);
});
test("an absent provider Portal-login setting remains UNKNOWN", async () => {
  const f = fixture();
  f.opts.fetcher = async () =>
    new globalThis.Response(
      JSON.stringify({ id: S2.portal, livemode: false, active: true }),
    );
  await assert.rejects(f.make().readPortalConfiguration());
});

test("legacy pause probe sends no application bearer and requires the exact new503 guard", async () => {
  const f = fixture();
  f.opts.fetcher = async (url, o) => {
    assert.equal(url, S2.origin + "/api/create-billing-portal-session");
    assert.equal(o.headers.has("authorization"), false);
    return new globalThis.Response(
      JSON.stringify({ ok: false, code: "s2_legacy_portal_disabled" }),
      { status: 503 },
    );
  };
  assert.equal((await f.make().readLegacyPortalDenied()).denied, true);
  f.opts.fetcher = async () => new globalThis.Response("{}", { status: 401 });
  await assert.rejects(f.make().readLegacyPortalDenied());
});
