import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { Webhook } from "svix";
let handler;
let known = false;
let lookupError = null;
let writes = [];
const receipts = new Set();
let reads = 0;
const secret =
  "whsec_" +
  Buffer.from("legacy-callback-fixture-secret-32").toString("base64");
globalThis.Deno = {
  serve(fn) {
    handler = fn;
  },
  env: {
    get(key) {
      return {
        RESEND_WEBHOOK_SECRET: secret,
        SUPABASE_URL: "https://fixture.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture",
      }[key];
    },
  },
};
globalThis.__legacyClient = () => ({
  from(table) {
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      async maybeSingle() {
        reads++;
        return {
          data: known
            ? { id: "known-outbox", recipient: "known@example.invalid" }
            : null,
          error: lookupError,
        };
      },
      async insert(row) {
        if (receipts.has(row.provider_event_id))
          return { error: { code: "23505" } };
        receipts.add(row.provider_event_id);
        writes.push({ table, row });
        return { error: null };
      },
      update(row) {
        return {
          async eq(key, id) {
            writes.push({ table, row, key, id });
            return { error: null };
          },
        };
      },
      async upsert(row) {
        writes.push({ table, row });
        return { error: null };
      },
    };
    return chain;
  },
});
const compiled = await build({
  entryPoints: ["supabase/functions/resend-webhook/index.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "legacy-client",
      setup(b) {
        b.onResolve({ filter: /^https:.*supabase-js/ }, () => ({
          path: "client",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: "export const createClient=globalThis.__legacyClient;",
        }));
      },
    },
  ],
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
function request(type, id = "event", signed = true) {
  const now = new Date();
  const body = JSON.stringify({
    type,
    created_at: now.toISOString(),
    data: {
      email_id: "unrelated-message",
      to: ["tampered@example.invalid"],
      owner_id: "forged",
    },
  });
  return new globalThis.Request("https://fixture.invalid", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": signed
        ? new Webhook(secret).sign(id, now, body)
        : "bad",
    },
  });
}
test("legacy callback rejects invalid signature before any database access", async () => {
  assert.equal(
    (await handler(request("email.delivered", "bad", false))).status,
    401,
  );
  assert.equal(reads, 0);
  assert.equal(writes.length, 0);
});
for (const kind of [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.delivery_delayed",
  "email.suppressed",
  "email.opened",
  "email.clicked",
])
  test(`legacy ${kind} unknown receipt performs zero writes`, async () => {
    const response = await handler(request(kind, kind));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, ignored: true });
    assert.equal(writes.length, 0);
  });
test("legacy lookup failure remains retryable instead of silently dropping known delivery", async () => {
  lookupError = { message: "fixture" };
  assert.equal((await handler(request("email.delivered"))).status, 503);
  assert.equal(writes.length, 0);
  lookupError = null;
});
test("known legacy receipt preserves delivery and replay; suppression uses stored recipient only", async () => {
  known = true;
  const response = await handler(request("email.delivered", "known"));
  assert.equal(response.status, 200);
  assert.equal(writes.length, 2);
  await handler(request("email.delivered", "known"));
  assert.equal(writes.length, 2);
  await handler(request("email.complained", "complaint"));
  assert.equal(writes.length, 5);
  assert.equal(JSON.stringify(writes).includes("tampered"), false);
});
test.after(() => {
  delete globalThis.Deno;
  delete globalThis.__legacyClient;
});
