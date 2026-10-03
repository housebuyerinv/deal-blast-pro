import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import {
  productionDeliveryConfig,
  productionProvider,
  deliverProductionInvitation,
} from "../../server/buyermatch/production-delivery.js";
import { encryptIdentity } from "../../server/buyermatch/security.js";
import { testProvider } from "../../server/buyermatch/provider.js";

const env = {
  VERCEL_ENV: "production",
  BM_ENVIRONMENT: "production",
  BM_RESPONSE_ENABLED: "true",
  BM_PRODUCTION_PROJECT_REF: "aigvnbxiydbzzqbetlhl",
  SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
  BM_CHECKOUT_ENABLED: "false",
  BM_DELIVERY_MODE: "resend",
  BM_LIVE_DELIVERY_ENABLED: "true",
  RESEND_API_KEY: "fixture-only",
  BM_RESEND_FROM: "Fixture <sender@example.invalid>",
  BM_RESPONSE_SECRET: "x".repeat(32),
  BM_APP_ORIGIN: "https://deal-blast-pro.vercel.app",
  PUBLIC_APP_URL: "https://deal-blast-pro.vercel.app",
};

test("Production delivery requires independent explicit flags and rejects staging/synthetic provider configuration", () => {
  assert.equal(productionDeliveryConfig(env), env.PUBLIC_APP_URL);
  for (const change of [
    { VERCEL_ENV: "preview" },
    { BM_ENVIRONMENT: "staging" },
    { BM_LIVE_DELIVERY_ENABLED: "false" },
    { BM_DELIVERY_MODE: "mock" },
    { RESEND_API_KEY: "" },
    { BM_RESPONSE_SECRET: "" },
    { BM_CHECKOUT_ENABLED: "true" },
    { PUBLIC_APP_URL: "https://other.invalid" },
    { SUPABASE_URL: "https://qxhhlprentrufobpcgna.supabase.co" },
  ])
    assert.throws(() => productionDeliveryConfig({ ...env, ...change }));
  assert.throws(() => testProvider(env));
});

test("Production provider requires success receipt and preserves provider idempotency across retries", async () => {
  const requests = [];
  let status = 503;
  const provider = productionProvider(env, async (url, options) => {
    requests.push({ url, options });
    return {
      ok: status === 200,
      json: async () =>
        status === 200
          ? { id: "provider-receipt" }
          : { error: "private provider details" },
    };
  });
  const payload = {
    email: "recipient@example.invalid",
    exposureId: "fixture",
    property: { address: "SYNTHETIC TEST" },
    responseUrl: env.PUBLIC_APP_URL + "/buyer-response#opaque",
  };
  await assert.rejects(provider.send(payload), /did not accept/);
  status = 200;
  assert.deepEqual(await provider.send(payload), { id: "provider-receipt" });
  assert.equal(
    requests[0].options.headers["Idempotency-Key"],
    requests[1].options.headers["Idempotency-Key"],
  );
  assert.deepEqual(JSON.parse(requests[1].options.body).to, [
    "recipient@example.invalid",
  ]);
});

test("Failed production send never accepts; receipt persistence retry reuses the invitation and exposes acknowledgement only", async () => {
  process.env.BUYERMATCH_IDENTITY_KEY =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const intent = { ownerId: "owner", dealId: "deal", exposureId: "exposure" };
  const job = {
    id: "outbox",
    exposureId: "exposure",
    leaseId: "lease",
    synthetic: false,
    identityCiphertext: encryptIdentity({ email: "recipient@example.invalid" }),
    property: { address: "SYNTHETIC TEST" },
  };
  const calls = [],
    sends = [];
  let sendFails = true,
    saveFails = false;
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === "bm_claim_production_invitation"
        ? { data: job }
        : name === "bm_finish_production_invitation"
          ? { data: !saveFails }
          : { data: null };
    },
  };
  const provider = {
    environment: "production",
    supportsIdempotency: true,
    send: async (payload) => {
      sends.push(payload);
      if (sendFails) throw Error("secret provider details");
      return { id: "receipt" };
    },
  };
  const run = () => deliverProductionInvitation(db, intent, provider, env);
  await assert.rejects(run(), /retry or reconciliation/);
  assert.equal(
    calls.some((c) => c.name === "bm_finish_production_invitation"),
    false,
  );
  assert.equal(calls.at(-1).name, "bm_retry_production_invitation");
  sendFails = false;
  saveFails = true;
  await assert.rejects(run(), /retry or reconciliation/);
  saveFails = false;
  assert.deepEqual(await run(), { accepted: true });
  assert.equal(new Set(sends.map((s) => s.responseUrl)).size, 1);
  assert.equal(
    new Set(
      calls
        .filter((c) => c.name === "bm_claim_production_invitation")
        .map((c) => c.args.p_hash),
    ).size,
    1,
  );
  await assert.rejects(
    deliverProductionInvitation(
      db,
      intent,
      { ...provider, environment: "staging" },
      env,
    ),
    /Production provider/,
  );
});

test("Production worker boundary refuses synthetic or substituted exposure before provider transmission", async () => {
  for (const change of [{ synthetic: true }, { exposureId: "other" }]) {
    let sent = false;
    const db = {
      rpc: async (name) =>
        name === "bm_claim_production_invitation"
          ? {
              data: {
                id: "job",
                leaseId: "lease",
                exposureId: "exposure",
                synthetic: false,
                ...change,
              },
            }
          : {},
    };
    await assert.rejects(
      deliverProductionInvitation(
        db,
        { ownerId: "owner", dealId: "deal", exposureId: "exposure" },
        {
          environment: "production",
          supportsIdempotency: true,
          send: async () => {
            sent = true;
          },
        },
        env,
      ),
    );
    assert.equal(sent, false);
  }
});
