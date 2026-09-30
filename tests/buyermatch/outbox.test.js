import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import process from "node:process";
import { encryptIdentity } from "../../server/buyermatch/security.js";
import { dispatchOutbox } from "../../server/buyermatch/outbox.js";
Object.assign(process.env, {
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "fixture",
  SUPABASE_URL: "https://fixture.supabase.co",
  BM_APP_ORIGIN: "https://fixture.vercel.app",
  BM_RESPONSE_SECRET: "x".repeat(32),
});
process.env.BUYERMATCH_IDENTITY_KEY = randomBytes(32).toString("base64");
test("worker requires approved provider and does not send suppressed jobs", async () => {
  await assert.rejects(dispatchOutbox({}, "id", {}), /Verified/);
  let sends = 0;
  const result = await dispatchOutbox(
    { rpc: async () => ({ data: null }) },
    "id",
    { verified: true, supportsIdempotency: true, send: async () => sends++ },
  );
  assert.equal(result.sent, false);
  assert.equal(sends, 0);
});
test("failed delivery retry reuses exposure key; acceptance is not delivery", async () => {
  const keys = [];
  const updates = [];
  let attempts = 0;
  const chain = {
    eq: () => chain,
    is: () => chain,
    then: (resolve) => resolve({ error: null }),
  };
  const db = {
    rpc: async () => ({
      data: {
        id: "job",
        exposureId: "immutable-exposure",
        identityCiphertext: encryptIdentity({
          email: "fixture@example.invalid",
        }),
        property: { price: 100 },
        synthetic: true,
        expiresAt: "2027-01-01",
      },
    }),
    from: () => ({
      upsert: async () => ({ error: null }),
      update: (value) => {
        updates.push(value);
        return chain;
      },
    }),
  };
  const provider = {
    verified: true,
    supportsIdempotency: true,
    send: async (payload) => {
      keys.push(payload.idempotencyKey);
      if (!attempts++) throw new Error("Provider failure");
      return { id: "receipt" };
    },
  };
  await assert.rejects(dispatchOutbox(db, "job", provider), /requires retry/);
  await dispatchOutbox(db, "job", provider);
  assert.deepEqual(keys, ["immutable-exposure", "immutable-exposure"]);
  assert.equal(updates.at(-1).state, "accepted");
  assert.equal(updates.at(-1).delivered_at, undefined);
});
