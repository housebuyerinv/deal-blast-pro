import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignRequestArgs,
  campaignStripeArgs,
} from "../../scripts/testing/s2-stripe-campaign-args.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
for (const path of [
  "/v1/checkout/sessions/cs_test_Campaign",
  "/v1/customers/cus_Campaign",
  "/v1/subscriptions/sub_Campaign",
  "/v1/subscriptions?customer=cus_Campaign&limit=100&status=all",
  "/v1/invoices?customer=cus_Campaign&limit=100",
])
  test("maps exact read " + path, () => {
    const a = campaignStripeArgs(campaignRequestArgs({ method: "GET", path }));
    assert.ok(a.includes(S2.account));
    assert.ok(a.includes("buyermatch-s2"));
    assert.ok(!a.includes("--live"));
    assert.ok(!a.includes("--api-key"));
  });
test("exact cancellation encoding has false invoice/proration, no live flag, key or automatic idempotent replay", () => {
  const a = campaignRequestArgs({
    method: "DELETE",
    path: "/v1/subscriptions/sub_Campaign",
    body: { invoice_now: false, prorate: false },
  });
  assert.deepEqual(a, [
    "delete",
    "/v1/subscriptions/sub_Campaign",
    "-d",
    "invoice_now=false",
    "-d",
    "prorate=false",
    "--confirm",
  ]);
  assert.ok(campaignStripeArgs(a).includes(S2.account));
});
for (const r of [
  { method: "POST", path: "/v1/subscriptions/sub_Campaign", body: {} },
  { method: "GET", path: "https://evil.example/v1/subscriptions/sub_Campaign" },
  { method: "GET", path: "/v1/customers/cus_Campaign/../sub_Foreign" },
  { method: "GET", path: "/v1/billing_portal/sessions" },
  {
    method: "DELETE",
    path: "/v1/customers/cus_Campaign",
    body: { invoice_now: false, prorate: false },
  },
  {
    method: "DELETE",
    path: "/v1/subscriptions/sub_Campaign",
    body: { invoice_now: true, prorate: false },
  },
  {
    method: "DELETE",
    path: "/v1/subscriptions/sub_Campaign",
    body: { invoice_now: false, prorate: false, extra: true },
  },
  {
    method: "GET",
    path: "/v1/invoices?customer=cus_Campaign&limit=100&status=all",
  },
  { method: "GET", path: "/v1/subscriptions?customer=cus_Campaign&limit=100" },
])
  test("rejects unsupported command " + JSON.stringify(r), () =>
    assert.throws(() => campaignRequestArgs(r)),
  );
for (const suffix of [
  ["--live"],
  ["--api-key", "dummy"],
  ["--request-header", "Authorization: dummy"],
  ["--api-base", "https://evil.example"],
  ["--project-name", "foreign"],
  ["--expand", "customer"],
])
  test("rejects CLI option injection " + suffix[0], () =>
    assert.throws(() =>
      campaignStripeArgs(["get", "/v1/subscriptions/sub_Campaign", ...suffix]),
    ),
  );
