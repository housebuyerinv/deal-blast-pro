import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { Webhook } from "svix";
let handler;
globalThis.Deno = {
  serve: (fn) => {
    handler = fn;
  },
  env: { get: (key) => values[key] },
};
globalThis.__Webhook = Webhook;
const values = {
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "fixture",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  BM_RESEND_WEBHOOK_SECRET:
    "whsec_" + Buffer.from("x".repeat(32)).toString("base64"),
};
const compiled = await build({
  entryPoints: ["supabase/functions/buyermatch-delivery/index.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "real-svix",
      setup(b) {
        b.onResolve({ filter: /^npm:svix/ }, () => ({
          path: "svix",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: "export const Webhook=globalThis.__Webhook",
        }));
      },
    },
  ],
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const originalFetch = globalThis.fetch;
const calls = [];
let found = true;
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return new globalThis.Response(JSON.stringify(found), { status: 200 });
};
function request(signed = true, date = new Date()) {
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: "message-fixture", to: ["private@example.invalid"] },
  });
  return new globalThis.Request("https://fixture.invalid", {
    method: "POST",
    body,
    headers: {
      "svix-id": "evt_fixture",
      "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": signed
        ? new Webhook(values.BM_RESEND_WEBHOOK_SECRET).sign(
            "evt_fixture",
            date,
            body,
          )
        : "invalid",
    },
  });
}
test("actual provider handler rejects invalid and stale signatures before accessing database", async () => {
  assert.equal((await handler(request(false))).status, 400);
  assert.equal((await handler(request(true, new Date(0)))).status, 400);
  assert.equal(calls.length, 0);
});
test("valid provider signature stores only delivery fields and requests retry for unknown receipt", async () => {
  assert.equal((await handler(request())).status, 200);
  assert.equal(JSON.parse(calls[0].options.body).p_message, "message-fixture");
  assert.equal(calls[0].options.body.includes("private@"), false);
  found = false;
  assert.equal((await handler(request())).status, 503);
});
test.after(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.Deno;
  delete globalThis.__Webhook;
});

test("Production delivery callback requires explicit provider enablement and valid signature", async () => {
  const prior = { ...values };
  try {
    Object.assign(values, {
      BM_ENVIRONMENT: "production",
      BM_PRODUCTION_PROJECT_REF: "aigvnbxiydbzzqbetlhl",
      SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
      BM_DELIVERY_MODE: "resend",
      BM_LIVE_DELIVERY_ENABLED: "false",
    });
    const before = calls.length;
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls.length, before);
    values.BM_LIVE_DELIVERY_ENABLED = "true";
    assert.equal((await handler(request(false))).status, 400);
    assert.equal(calls.length, before);
    found = true;
    assert.equal((await handler(request())).status, 200);
    assert.equal(calls.at(-1).options.body.includes("private@"), false);
  } finally {
    for (const key of Object.keys(values)) delete values[key];
    Object.assign(values, prior);
  }
});
