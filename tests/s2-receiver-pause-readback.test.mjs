import test from "node:test";
import assert from "node:assert/strict";
import { readPausedReceiver } from "../scripts/testing/s2-receiver-pause-readback.mjs";
const paused = { ok: false, error: "Staging webhook processing paused" };
const response = (status, body, extra = {}) => ({
  status,
  redirected: false,
  text: async () => JSON.stringify(body),
  ...extra,
});
test("pause probe is exact S2 empty unsigned POST, without event, Auth or Stripe signature", async () => {
  let count = 0;
  assert.equal(
    await readPausedReceiver(async (url, options) => {
      count++;
      assert.equal(
        url,
        "https://qxhhlprentrufobpcgna.supabase.co/functions/v1/stripe-webhook",
      );
      assert.equal(options.method, "POST");
      assert.equal(options.body, "");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers["Stripe-Signature"], undefined);
      assert.ok(options.signal);
      return response(503, paused);
    }),
    true,
  );
  assert.equal(count, 1);
});
for (const [name, value] of Object.entries({
  getRejected: response(405, { ok: false, error: "Method not allowed" }),
  processingEnabled: response(400, { error: "Invalid signature" }),
  authDenied: response(401, {}),
  wrongBody: response(503, { ok: false, error: "other" }),
  privateExtra: response(503, { ...paused, secret: "DUMMY" }),
  redirect: response(503, paused, { redirected: true }),
  oversize: response(503, paused, { text: async () => "x".repeat(1025) }),
}))
  test(`pause remains UNKNOWN on ${name}`, async () => {
    await assert.rejects(
      readPausedReceiver(async () => value),
      (e) => e.message === "RECEIVER_PAUSE_UNVERIFIED",
    );
  });
test("network failure does not retry or reveal provider diagnostics", async () => {
  let count = 0;
  await assert.rejects(
    readPausedReceiver(async () => {
      count++;
      throw Error("PRIVATE_PROVIDER_DETAIL");
    }),
    (e) => e.message === "RECEIVER_PAUSE_UNVERIFIED",
  );
  assert.equal(count, 1);
});
