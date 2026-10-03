import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["supabase/functions/stripe-webhook/index.ts"],
  bundle: true,
  write: false,
  platform: "neutral",
  format: "esm",
});
let handler;
const values = {
  STRIPE_WEBHOOK_SECRET: "fixture-signing-secret",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "fixture",
};
globalThis.Deno = {
  env: { get: (name) => values[name] },
  serve: (fn) => {
    handler = fn;
  },
};
await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
delete globalThis.Deno;
// Deno env is read when handling requests, so expose only fixture settings during this suite.
globalThis.Deno = { env: { get: (name) => values[name] } };
const realFetch = globalThis.fetch;
const RequestType = globalThis.Request;
const ResponseType = globalThis.Response;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  if (String(url).includes("/v1/subscriptions/"))
    return new ResponseType(
      JSON.stringify({
        id: "sub_fixture",
        status: "active",
        livemode: false,
        metadata: {
          dbpProduct: "buyermatch",
          dbpCheckoutId: "33333333-3333-4333-8333-333333333333",
          dealBlastUserId: "11111111-1111-4111-8111-111111111111",
        },
        items: {
          data: [
            {
              price: { id: "price_fixture" },
              current_period_start: 1780000000,
              current_period_end: 1790000000,
            },
          ],
        },
      }),
    );
  if (String(url).endsWith("/rpc/bm_apply_test_billing"))
    return new ResponseType("null");
  throw new Error("Unexpected CRM or external request");
};
function request(
  body,
  signed = true,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const headers = { "Content-Type": "application/json" };
  if (signed)
    headers["stripe-signature"] =
      `t=${timestamp},v1=${createHmac("sha256", values.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex")}`;
  return new RequestType("https://fixture.supabase.co/webhook", {
    method: "POST",
    headers,
    body,
  });
}
test("actual Stripe webhook rejects unsigned, invalid and stale signatures before database calls", async () => {
  const event = JSON.stringify({
    id: "evt_fixture",
    livemode: false,
    type: "customer.subscription.updated",
    data: {
      object: { id: "sub_fixture", metadata: { dbpProduct: "buyermatch" } },
    },
  });
  for (const req of [
    request(event, false),
    request(event, true, 1),
    new RequestType("https://fixture.supabase.co/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=wrong" },
      body: event,
    }),
  ])
    assert.equal((await handler(req)).status, 400);
  assert.equal(calls.length, 0);
});
test("signed product events enter independent billing RPC, never CRM updates", async () => {
  const event = JSON.stringify({
    id: "evt_fixture",
    livemode: false,
    created: 1780000001,
    type: "customer.subscription.updated",
    data: {
      object: { id: "sub_fixture", metadata: { dbpProduct: "buyermatch" } },
    },
  });
  const response = await handler(request(event));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).product, "buyermatch");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith("/rpc/bm_apply_test_billing"));
  const params = JSON.parse(calls[1].options.body);
  assert.equal(params.p_product, "buyermatch");
  assert.equal(params.p_price, "price_fixture");
});
test.after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.Deno;
});

test("signed live-mode BuyerMatch events never mutate entitlements or CRM", async () => {
  calls.length = 0;
  const response = await handler(
    request(
      JSON.stringify({
        id: "evt_live",
        livemode: true,
        type: "customer.subscription.updated",
        data: {
          object: { id: "sub_fixture", metadata: { dbpProduct: "buyermatch" } },
        },
      }),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
  assert.equal((await response.json()).ignored, true);
});
