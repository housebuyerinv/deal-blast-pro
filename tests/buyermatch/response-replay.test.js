import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { responseOperationKey } from "../../server/buyermatch/tokens.js";

const input = {
  token: "a".repeat(43),
  kind: "offer",
  amountCents: 6200000,
  terms: "QA offer",
};
test("response fingerprint survives new tabs/retries but separates capabilities and changed offers", () => {
  const key = responseOperationKey(input);
  assert.match(
    key,
    /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/,
  );
  assert.equal(
    key,
    responseOperationKey({
      ...input,
      operationKey: randomUUID(),
      terms: " QA offer ",
    }),
  );
  for (const change of [
    { token: "b".repeat(43) },
    { amountCents: 6300000 },
    { terms: "Changed terms" },
    { kind: "interested" },
  ])
    assert.notEqual(key, responseOperationKey({ ...input, ...change }));
  assert.equal(
    responseOperationKey({ ...input, kind: "interested" }),
    responseOperationKey({
      ...input,
      kind: "interested",
      amountCents: 1,
      terms: "ignored",
    }),
  );
});

process.env.BM_ENVIRONMENT = "staging";
process.env.BM_STAGING_PROJECT_REF = "fixture";
process.env.SUPABASE_URL = "https://fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
const calls = [];
let rpcError = false;
let legacyResponse = false;
let capabilityValid = true;
globalThis.__responseFixture = {
  from: () => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      gt: () => query,
      maybeSingle: async () => ({
        data: capabilityValid ? { exposure_id: "fixture-exposure" } : null,
      }),
      limit: async () => ({
        data: legacyResponse ? [{ id: "legacy-response" }] : [],
      }),
    };
    return query;
  },
  rpc: async (name, body) => {
    calls.push({ name, body });
    return rpcError
      ? { error: { message: "PRIVATE EXPIRY DETAILS" } }
      : { data: { recorded: true, privateBuyer: "MUST NOT LEAK" } };
  },
};
const compiled = await build({
  entryPoints: ["api/buyermatch-response.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "fixture",
      setup(b) {
        b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
          path: "fixture",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const createClient=()=>globalThis.__responseFixture;",
        }));
      },
    },
  ],
});
const { default: handler } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
async function invoke(body, method = "POST") {
  const result = { headers: {} };
  const res = {
    setHeader: (k, v) => (result.headers[k] = v),
    status: (s) => {
      result.status = s;
      return res;
    },
    json: (v) => {
      result.body = v;
      return res;
    },
  };
  await handler({ method, body, headers: {} }, res);
  return result;
}
test("public response API ignores caller replay keys and returns only acknowledgement", async () => {
  const first = await invoke({ ...input, operationKey: randomUUID() });
  const second = await invoke({ ...input, operationKey: randomUUID() });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { recorded: true });
  assert.deepEqual(second.body, { recorded: true });
  assert.equal(calls.at(-1).body.p_key, calls.at(-2).body.p_key);
  assert.equal(first.headers["Cache-Control"], "no-store");
  assert.equal(first.headers["Referrer-Policy"], "no-referrer");
});
test("invalid, expired and direct GET capability access fails without private details", async () => {
  assert.equal((await invoke({}, "GET")).status, 405);
  assert.equal(
    (await invoke({ ...input, token: "invalid", operationKey: randomUUID() }))
      .status,
    400,
  );
  rpcError = true;
  const expired = await invoke({ ...input, operationKey: randomUUID() });
  rpcError = false;
  assert.equal(expired.status, 400);
  assert.deepEqual(Object.keys(expired.body), ["error"]);
  assert.equal(JSON.stringify(expired).includes("PRIVATE"), false);
});
test("legacy accepted responses replay without mutations but expired capabilities still deny", async () => {
  legacyResponse = true;
  const before = calls.length;
  assert.deepEqual(
    (await invoke({ ...input, operationKey: randomUUID() })).body,
    { recorded: true },
  );
  assert.equal(calls.length, before);
  capabilityValid = false;
  assert.equal(
    (await invoke({ ...input, operationKey: randomUUID() })).status,
    400,
  );
  capabilityValid = true;
  legacyResponse = false;
});
