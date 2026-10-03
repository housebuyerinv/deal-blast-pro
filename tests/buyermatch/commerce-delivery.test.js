import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  assertStaging,
  stagingOrigin,
  PRODUCTION_SUPABASE_REF,
} from "../../server/buyermatch/staging.js";
import { testProvider } from "../../server/buyermatch/provider.js";
import {
  createCheckout,
  testStripe,
} from "../../server/buyermatch/checkout.js";
import { duplicateReasons } from "../../server/buyermatch/deduplication.js";
import { responseToken, hashToken } from "../../server/buyermatch/tokens.js";
const env = {
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "fixture",
  SUPABASE_URL: "https://fixture.supabase.co",
  BM_APP_ORIGIN: "https://fixture.vercel.app",
  BM_CHECKOUT_ENABLED: "true",
  BM_RESPONSE_SECRET: "x".repeat(32),
};
test("staging guard refuses production, mismatched browser/server projects and live Stripe keys", () => {
  assert.equal(assertStaging(env), env.SUPABASE_URL);
  for (const change of [
    { VERCEL_ENV: "production" },
    { BM_ENVIRONMENT: "production" },
    {
      SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      BM_STAGING_PROJECT_REF: PRODUCTION_SUPABASE_REF,
    },
    { VITE_SUPABASE_URL: "https://other.supabase.co" },
  ])
    assert.throws(() => assertStaging({ ...env, ...change }));
  assert.throws(() =>
    stagingOrigin({
      ...env,
      BM_APP_ORIGIN: "https://deal-blast-pro.vercel.app",
    }),
  );
  assert.throws(
    () => testStripe({ ...env, BM_STRIPE_TEST_SECRET_KEY: "sk_live_fixture" }),
    /test key/,
  );
});
test("delivery test sink ignores real email and refuses nonsynthetic buyers or live mode", async () => {
  const calls = [];
  const provider = testProvider(
    { ...env, BM_DELIVERY_MODE: "resend-test", RESEND_API_KEY: "fixture" },
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: "receipt" }) };
    },
  );
  const payload = {
    property: { address: "SYNTHETIC" },
    idempotencyKey: "exposure",
    responseUrl: env.BM_APP_ORIGIN + "/buyer-response#token",
    synthetic: true,
    email: "real@company.com",
  };
  await provider.send(payload);
  await provider.send(payload);
  assert.deepEqual(JSON.parse(calls[0].options.body).to, [
    "delivered@resend.dev",
  ]);
  assert.equal(
    calls[0].options.headers["Idempotency-Key"],
    calls[1].options.headers["Idempotency-Key"],
  );
  await assert.rejects(provider.send({ ...payload, synthetic: false }));
  assert.throws(() => testProvider({ ...env, BM_DELIVERY_MODE: "live" }));
});
test("checkout uses approved recurring test price and durable provider key across receipt persistence retry", async () => {
  const plan = {
    version: "v1",
    product: "buyermatch",
    stripe_price_id: "price_fixture",
  };
  const record = {
    id: randomUUID(),
    state: "pending",
    created_at: new Date().toISOString(),
    email: "qa@example.invalid",
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: plan }),
    then: (resolve) => resolve({ error: saveFails ? {} : null }),
  };
  let saveFails = true;
  const db = {
    from: () => ({ ...chain, update: () => chain }),
    rpc: async () => ({ data: record }),
  };
  const calls = [];
  const stripe = {
    prices: {
      retrieve: async () => ({
        livemode: false,
        active: true,
        currency: "usd",
        unit_amount: 100,
        recurring: {
          usage_type: "licensed",
          interval: "month",
          interval_count: 1,
        },
        type: "recurring",
      }),
    },
    checkout: {
      sessions: {
        create: async (data, options) => {
          calls.push({ data, options });
          return {
            id: "cs_fixture",
            url: "https://checkout.stripe.com/c/pay/fixture",
            livemode: false,
          };
        },
      },
    },
  };
  const run = () =>
    createCheckout(
      db,
      { id: randomUUID(), email: "qa@example.invalid" },
      "v1",
      randomUUID(),
      env,
      stripe,
    );
  await assert.rejects(run(), /same operation key/);
  saveFails = false;
  assert.equal((await run()).testMode, true);
  assert.equal(
    calls[0].options.idempotencyKey,
    calls[1].options.idempotencyKey,
  );
  assert.equal(
    calls[0].data.subscription_data.metadata.dbpCheckoutId,
    record.id,
  );
  stripe.prices.retrieve = async () => ({
    livemode: true,
    active: true,
    currency: "usd",
    unit_amount: 100,
    recurring: { usage_type: "licensed", interval: "month", interval_count: 1 },
    type: "recurring",
  });
  await assert.rejects(run(), /TEST price/);
  assert.equal(calls.length, 2);
});
test("dedup normalizes phone/company/principal while preserving separate people for review", () => {
  const a = {
    email: " TEST@example.invalid ",
    phone: "+1 (202) 555-0101",
    company: "Ácme LLC",
    name: "Jane Doe",
  };
  assert.deepEqual(
    duplicateReasons(a, {
      email: "test@example.invalid",
      phone: "2025550101",
      company: "Acme Inc.",
      name: "jane doe",
    }),
    ["same_email", "same_phone", "same_company_principal"],
  );
  assert.deepEqual(
    duplicateReasons(a, { company: "Acme", name: "Someone Else" }),
    ["same_company_review"],
  );
  assert.deepEqual(duplicateReasons({ name: "Jane" }, { name: "Jane" }), []);
});
test("response capability is stable for retries and unguessable without secret, scoped to exposure", () => {
  const a = responseToken("exposure-a", env);
  assert.equal(a.length, 43);
  assert.equal(a, responseToken("exposure-a", env));
  assert.notEqual(a, responseToken("exposure-b", env));
  assert.notEqual(hashToken(a), a);
  assert.throws(() => responseToken("a", { BM_RESPONSE_SECRET: "short" }));
});

test("stored checkout URL is refreshed from Stripe and expired sessions reconcile without another charge", async () => {
  const owner = randomUUID(),
    id = randomUUID();
  const record = {
    id,
    session_id: "cs_existing",
    session_url: "https://checkout.stripe.com/stale",
    state: "pending",
  };
  const plan = {
    product: "buyermatch",
    version: "v1",
    stripe_price_id: "price_fixture",
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: plan }),
  };
  const calls = [];
  const db = {
    from: () => chain,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: record };
    },
  };
  let status = "open";
  const stripe = {
    prices: {
      retrieve: async () => ({
        livemode: false,
        active: true,
        type: "recurring",
        currency: "usd",
        unit_amount: 100,
        recurring: { usage_type: "licensed" },
      }),
    },
    checkout: {
      sessions: {
        retrieve: async () => ({
          id: "cs_existing",
          livemode: false,
          status,
          url: "https://checkout.stripe.com/fresh",
          client_reference_id: owner,
          metadata: { dbpCheckoutId: id },
        }),
        create: async () => assert.fail("Must not create another session"),
      },
    },
  };
  const run = () =>
    createCheckout(
      db,
      { id: owner, email: "qa@example.invalid" },
      "v1",
      randomUUID(),
      env,
      stripe,
    );
  assert.equal((await run()).url, "https://checkout.stripe.com/fresh");
  status = "expired";
  await assert.rejects(run(), (error) => error.status === 409);
  assert.equal(calls.at(-1).name, "bm_checkout_event");
  assert.equal(calls.at(-1).args.p_state, "expired");
  stripe.checkout.sessions.retrieve = async () => ({
    livemode: false,
    client_reference_id: randomUUID(),
    metadata: { dbpCheckoutId: id },
  });
  await assert.rejects(run(), /ownership/);
});
