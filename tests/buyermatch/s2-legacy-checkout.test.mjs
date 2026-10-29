import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import { build } from "esbuild";
import { isS2LegacyCheckout } from "../../server/buyermatch/s2-billing-window.js";

async function compile(file) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "synthetic-account-only",
        setup(b) {
          b.onResolve({ filter: /_accountAuth\.js$/ }, () => ({
            path: "auth",
            namespace: "synthetic",
          }));
          b.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
            contents: `export function canUsePropertyIntelligence(){return false};export async function getAuthenticatedAccount(){globalThis.__s2CheckoutAuthCalls++;throw Object.assign(Error('Authentication required'),{status:401})}`,
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const [{ default: trial }, { default: dynamic }, { handlePlatformAction }] =
  await Promise.all([
    compile("api/property-intelligence/pro-trial-checkout.ts"),
    compile("api/property-intelligence/[action].ts"),
    compile("src/server/platformActions.ts"),
  ]);
async function scoped(environment, fn) {
  const keys = [
    "VERCEL_PROJECT_ID",
    "BM_STAGING_PROJECT_REF",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  ];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]])),
    counter = globalThis.__s2CheckoutAuthCalls;
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, environment);
    globalThis.__s2CheckoutAuthCalls = 0;
    await fn();
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
    globalThis.__s2CheckoutAuthCalls = counter;
  }
}
function response() {
  const value = {};
  return {
    value,
    setHeader() {},
    status(code) {
      value.status = code;
      return this;
    },
    json(body) {
      value.body = body;
      return this;
    },
  };
}
for (const [name, handler, action] of [
  ["dedicated trial", trial, "pro-trial-checkout"],
  ["dynamic trial", dynamic, "pro-trial-checkout"],
  ["dynamic credits", dynamic, "credit-packs"],
])
  test(
    name + " rejects S2 purchases before account/provider/configuration access",
    () =>
      scoped({ BM_STAGING_PROJECT_REF: "qxhhlprentrufobpcgna" }, async () => {
        const res = response();
        await handler(
          { method: "POST", query: { action }, body: {}, headers: {} },
          res,
        );
        assert.equal(res.value.status, 503);
        assert.equal(res.value.body.code, "s2_legacy_checkout_disabled");
        assert.equal(globalThis.__s2CheckoutAuthCalls, 0);
      }),
  );
test("central action handler also blocks direct purchase callers while allowing public catalog reads", () =>
  scoped(
    { VERCEL_PROJECT_ID: "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl" },
    async () => {
      const account = new Proxy(
        {},
        {
          get() {
            assert.fail("No account/provider access");
          },
        },
      );
      for (const action of ["credit-packs", "pro-trial-checkout"]) {
        const res = response();
        assert.equal(
          await handlePlatformAction(action, { method: "POST" }, res, account),
          true,
        );
        assert.equal(res.value.status, 503);
      }
      const res = response();
      await handlePlatformAction("credit-packs", { method: "GET" }, res, {
        workspace: {},
      });
      assert.equal(res.value.status, 200);
    },
  ));
test("non-S2 routes retain normal authentication and shared CRM pricing paths", () =>
  scoped(
    { SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co" },
    async () => {
      const res = response();
      await trial({ method: "POST", query: {}, body: {}, headers: {} }, res);
      assert.equal(res.value.status, 401);
      assert.equal(globalThis.__s2CheckoutAuthCalls, 1);
      assert.equal(isS2LegacyCheckout("credit-packs", "POST"), false);
    },
  ));
test("S2 selector leaves non-purchase reads/actions unchanged", () => {
  const env = { BM_STAGING_PROJECT_REF: "qxhhlprentrufobpcgna" };
  assert.equal(isS2LegacyCheckout("credit-packs", "GET", env), false);
  assert.equal(isS2LegacyCheckout("recent-searches", "POST", env), false);
});
