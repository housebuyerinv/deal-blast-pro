import test from "node:test";
import assert from "node:assert/strict";
import {
  s2BillingWindowStatus,
  requireS2BillingWindow,
  S2_PRO_OWNER,
  S2_BILLING_REF,
} from "../../server/buyermatch/s2-billing-window.js";
import { createCheckout } from "../../server/buyermatch/checkout.js";
import { subscriberPortal } from "../../server/buyermatch/portal.js";
const when = Date.now();
const env = () => ({
  VERCEL_ENV: "preview",
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: S2_BILLING_REF,
  SUPABASE_URL: `https://${S2_BILLING_REF}.supabase.co`,
  BM_APP_ORIGIN: "https://dbp-registration-s2-preview-housebuyerinv.vercel.app",
  DBP_REGISTRATION_PAUSED: "true",
  BM_LIVE_BILLING_ENABLED: "false",
  BM_LIVE_DELIVERY_ENABLED: "false",
  BM_S2_BILLING_OWNER_ID: S2_PRO_OWNER,
  BM_S2_BILLING_RUN_ID: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
  BM_S2_BILLING_STARTED_AT: new Date(when - 1000).toISOString(),
  BM_S2_BILLING_EXPIRES_AT: new Date(when + 60000).toISOString(),
  BM_S2_BILLING_OPERATIONS: "checkout,payment,change,cancel",
  BM_CHECKOUT_ENABLED: "true",
});

test("S2 billing status projects only non-secret runtime bindings for the confirmed Pro fixture", () => {
  const e = {
    ...env(),
    VERCEL_PROJECT_ID: "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl",
    VERCEL_DEPLOYMENT_ID: "dpl_SyntheticOnly",
    BM_S2_ATTESTATION_SOURCE_SHA: "a".repeat(40),
  };
  Object.defineProperty(e, "BUYERMATCH_IDENTITY_KEY", {
    get() {
      throw Error("No secret access");
    },
  });
  const r = s2BillingWindowStatus(
    { id: S2_PRO_OWNER, email_confirmed_at: "2026-10-27T12:00:00Z" },
    e,
  );
  assert.equal(r.BM_S2_BILLING_RUN_ID, e.BM_S2_BILLING_RUN_ID);
  assert.equal(r.checkoutEnabled, true);
  assert.equal(Object.hasOwn(r, "BUYERMATCH_IDENTITY_KEY"), false);
  assert.equal(Object.hasOwn(r, "protected"), false);
  for (const key of [
    "BM_S2_BILLING_OWNER_ID",
    "BM_S2_BILLING_RUN_ID",
    "BM_S2_BILLING_STARTED_AT",
    "BM_S2_BILLING_OPERATIONS",
  ])
    assert.throws(
      () =>
        s2BillingWindowStatus(
          { id: S2_PRO_OWNER, email_confirmed_at: "2026-10-27T12:00:00Z" },
          { ...e, [key]: "DUMMY_SECRET_NOT_TO_REFLECT" },
        ),
      (error) =>
        error.status === 503 && !error.message.includes("DUMMY_SECRET"),
    );
});
test("status refuses foreign/unconfirmed actors and non-S2/missing-runtime provenance", () => {
  const e = {
    ...env(),
    VERCEL_PROJECT_ID: "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl",
    VERCEL_DEPLOYMENT_ID: "dpl_SyntheticOnly",
    BM_S2_ATTESTATION_SOURCE_SHA: "a".repeat(40),
  };
  for (const u of [
    { id: "foreign", email_confirmed_at: "2026-10-27T12:00:00Z" },
    { id: S2_PRO_OWNER },
  ])
    assert.throws(
      () => s2BillingWindowStatus(u, e),
      (e) => e.status === 403,
    );
  assert.throws(
    () =>
      s2BillingWindowStatus(
        { id: S2_PRO_OWNER, email_confirmed_at: "2026-10-27T12:00:00Z" },
        { ...e, VERCEL_ENV: "production" },
      ),
    (e) => e.status === 404,
  );
  assert.throws(
    () =>
      s2BillingWindowStatus(
        { id: S2_PRO_OWNER, email_confirmed_at: "2026-10-27T12:00:00Z" },
        { ...e, BM_S2_ATTESTATION_SOURCE_SHA: "" },
      ),
    (e) => e.status === 503,
  );
});

test("S2 window permits only the configured confirmed-fixture operation before its deadline", () => {
  for (const op of ["checkout", "payment", "change", "cancel"])
    assert.ok(requireS2BillingWindow(S2_PRO_OWNER, op, env(), when));
  assert.throws(() =>
    requireS2BillingWindow(S2_PRO_OWNER, "worker", env(), when),
  );
  assert.throws(() =>
    requireS2BillingWindow("foreign", "checkout", env(), when),
  );
});
for (const [label, patch] of [
  ["missing run", { BM_S2_BILLING_RUN_ID: "" }],
  ["missing owner", { BM_S2_BILLING_OWNER_ID: "" }],
  ["expired", { BM_S2_BILLING_EXPIRES_AT: new Date(when).toISOString() }],
  [
    "future start",
    { BM_S2_BILLING_STARTED_AT: new Date(when + 1000).toISOString() },
  ],
  [
    "overlong window",
    { BM_S2_BILLING_EXPIRES_AT: new Date(when + 1800001).toISOString() },
  ],
  ["bad timestamp", { BM_S2_BILLING_EXPIRES_AT: "tomorrow" }],
  ["wrong target", { VERCEL_ENV: "production" }],
  ["wrong environment", { BM_ENVIRONMENT: "production" }],
  ["mismatched project", { BM_STAGING_PROJECT_REF: "foreign" }],
  ["mismatched URL", { SUPABASE_URL: "https://foreign.supabase.co" }],
  ["registration open", { DBP_REGISTRATION_PAUSED: "false" }],
  ["live billing", { BM_LIVE_BILLING_ENABLED: "true" }],
  ["delivery on", { BM_LIVE_DELIVERY_ENABLED: "true" }],
  ["unknown operation", { BM_S2_BILLING_OPERATIONS: "checkout,worker" }],
  ["duplicate operation", { BM_S2_BILLING_OPERATIONS: "checkout,checkout" }],
  ["portal not approved", { BM_S2_BILLING_OPERATIONS: "checkout" }],
])
  test("S2 window rejects " + label, () =>
    assert.throws(() =>
      requireS2BillingWindow(
        S2_PRO_OWNER,
        "payment",
        { ...env(), ...patch },
        when,
      ),
    ),
  );

test("staging window does not change Production or unrelated fixture policy", () => {
  assert.equal(
    requireS2BillingWindow("normal-subscriber", "payment", {
      BM_ENVIRONMENT: "production",
      SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
    }),
    undefined,
  );
  assert.equal(
    requireS2BillingWindow("normal-subscriber", "payment", {
      BM_ENVIRONMENT: "staging",
      SUPABASE_URL: "https://fixture.supabase.co",
    }),
    undefined,
  );
});
test("closed S2 window blocks both actual entrypoints before database or Stripe calls", async () => {
  const forbidden = new Proxy(
    {},
    {
      get() {
        assert.fail("No DB/Stripe access permitted");
      },
    },
  );
  const e = { ...env(), BM_S2_BILLING_RUN_ID: "" };
  await assert.rejects(
    createCheckout(
      forbidden,
      { id: S2_PRO_OWNER },
      "buyermatch-pro-v1",
      "dummy",
      e,
      forbidden,
    ),
    /window/,
  );
  await assert.rejects(
    subscriberPortal(
      forbidden,
      { id: S2_PRO_OWNER },
      "payment",
      undefined,
      e,
      forbidden,
    ),
    /window/,
  );
});
test("portal creation rechecks expiration after asynchronous ownership reads", async () => {
  const e = env(),
    metadata = {
      dbpProduct: "buyermatch",
      dealBlastUserId: S2_PRO_OWNER,
      dbpCheckoutId: "checkout",
    };
  const sub = { id: "sub", customer: "cus", livemode: false, metadata };
  const session = {
    id: "cs",
    status: "complete",
    mode: "subscription",
    client_reference_id: S2_PRO_OWNER,
    customer: "cus",
    subscription: "sub",
    livemode: false,
    metadata,
  };
  const db = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({
          data:
            table === "bm_entitlements"
              ? { stripe_subscription_id: "sub" }
              : { id: "checkout", session_id: "cs" },
        }),
      };
    },
  };
  const stripe = {
    subscriptions: {
      retrieve: async () => sub,
      list: async () => ({ has_more: false, data: [sub] }),
    },
    checkout: { sessions: { retrieve: async () => session } },
    billingPortal: {
      configurations: {
        retrieve: async () => {
          e.BM_S2_BILLING_EXPIRES_AT = e.BM_S2_BILLING_STARTED_AT;
          return { active: true, livemode: false };
        },
      },
      sessions: { create: async () => assert.fail("Expired session creation") },
    },
  };
  e.BM_STRIPE_PORTAL_CONFIGURATION_ID = "bpc_dummy";
  await assert.rejects(
    subscriberPortal(db, { id: S2_PRO_OWNER }, "payment", undefined, e, stripe),
    /window/,
  );
});

test("existing Checkout URL is withheld when its retrieval crosses the S2 deadline", async () => {
  const e = env(),
    record = { id: "checkout", state: "pending", session_id: "cs" };
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single: async () => ({
          data: {
            version: "buyermatch-pro-v1",
            product: "buyermatch",
            stripe_price_id: "price",
          },
        }),
      };
    },
    rpc: async () => ({ data: record }),
  };
  const stripe = {
    prices: {
      retrieve: async () => ({
        livemode: false,
        active: true,
        type: "recurring",
        currency: "usd",
        unit_amount: 11900,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
    },
    checkout: {
      sessions: {
        retrieve: async () => {
          e.BM_S2_BILLING_EXPIRES_AT = e.BM_S2_BILLING_STARTED_AT;
          return {
            id: "cs",
            livemode: false,
            status: "open",
            client_reference_id: S2_PRO_OWNER,
            metadata: { dbpCheckoutId: "checkout" },
            url: "https://checkout.stripe.com/dummy",
          };
        },
      },
    },
  };
  await assert.rejects(
    createCheckout(
      db,
      { id: S2_PRO_OWNER },
      "buyermatch-pro-v1",
      "dummy",
      e,
      stripe,
    ),
    /window/,
  );
});
