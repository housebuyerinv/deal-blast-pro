import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import { build } from "esbuild";
const compiled = await build({
  entryPoints: ["api/create-billing-portal-session.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "synthetic-auth",
      setup(b) {
        b.onResolve({ filter: /_accountAuth\.js$/ }, () => ({
          path: "auth",
          namespace: "synthetic",
        }));
        b.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
          contents: `export const cleanString=v=>String(v||'').trim();export async function getAuthenticatedAccount(){globalThis.__s2LegacyAuthCalls++;throw Object.assign(Error('Normal authentication required'),{status:401});}`,
        }));
      },
    },
  ],
});
const { default: handler } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const markers = [
  "VERCEL_PROJECT_ID",
  "BM_STAGING_PROJECT_REF",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
];
async function run(patch, fn) {
  const old = Object.fromEntries(markers.map((k) => [k, process.env[k]])),
    calls = globalThis.__s2LegacyAuthCalls;
  try {
    for (const k of markers) delete process.env[k];
    Object.assign(process.env, patch);
    globalThis.__s2LegacyAuthCalls = 0;
    const result = {};
    const res = {
      setHeader() {},
      status(code) {
        result.status = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    };
    await handler({ method: "POST", headers: {}, body: {} }, res);
    await fn(result);
  } finally {
    for (const k of markers) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    globalThis.__s2LegacyAuthCalls = calls;
  }
}
for (const patch of [
  { VERCEL_PROJECT_ID: "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl" },
  { BM_STAGING_PROJECT_REF: "qxhhlprentrufobpcgna" },
  { SUPABASE_URL: "https://qxhhlprentrufobpcgna.supabase.co/" },
  { VITE_SUPABASE_URL: "https://qxhhlprentrufobpcgna.supabase.co" },
])
  test(
    "legacy Portal is closed before authentication/provider access for " +
      Object.keys(patch)[0],
    () =>
      run(patch, async (result) => {
        assert.equal(result.status, 503);
        assert.equal(result.body.code, "s2_legacy_portal_disabled");
        assert.equal(globalThis.__s2LegacyAuthCalls, 0);
      }),
  );
test("unrelated Production runtime retains its normal authentication gate", () =>
  run(
    { SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co" },
    async (result) => {
      assert.equal(result.status, 401);
      assert.equal(globalThis.__s2LegacyAuthCalls, 1);
    },
  ));
