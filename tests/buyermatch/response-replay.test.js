import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
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

globalThis.__responseFixture = {
  rpc: async (name, body) => {
    calls.push({ name, body });
    return rpcError
      ? { error: { message: "PRIVATE EXPIRY DETAILS" } }
      : { data: { recorded: true, privateBuyer: "MUST NOT LEAK" } };
  },
};
const compiled = await build({
  entryPoints: ["server/http/buyermatch-response.ts"],
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
test("caller identity and scope overrides never reach the response transaction", async () => {
  const result = await invoke({
    ...input,
    operationKey: randomUUID(),
    dealId: randomUUID(),
    buyerId: randomUUID(),
    workspaceId: randomUUID(),
    accountId: randomUUID(),
    environment: "production",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(calls.at(-1).body).sort(), [
    "p_amount",
    "p_environment",
    "p_hash",
    "p_key",
    "p_kind",
    "p_terms",
  ]);
  const before = calls.length;
  assert.equal(
    (await invoke({ ...input, operationKey: randomUUID(), kind: "admin" }))
      .status,
    400,
  );
  assert.equal(calls.length, before);
});

test("public response handler refuses Production before any response transaction", async () => {
  const previous = process.env.VERCEL_ENV;
  const before = calls.length;
  try {
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(
      (await invoke({ ...input, operationKey: randomUUID() })).body,
      {
        error: "Response link unavailable.",
      },
    );
    assert.equal(calls.length, before);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("Production-mode HTTP acknowledgement works only with explicit safe configuration", async () => {
  const config = {
    VERCEL_ENV: "production",
    BM_ENVIRONMENT: "production",
    BM_RESPONSE_ENABLED: "true",
    BM_PRODUCTION_PROJECT_REF: "aigvnbxiydbzzqbetlhl",
    SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    BM_CHECKOUT_ENABLED: "false",
    BM_DELIVERY_MODE: "disabled",
  };
  const prior = Object.fromEntries(
    Object.keys(config).map((k) => [k, process.env[k]]),
  );
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    req.body = body;
    res.status = (status) => {
      res.statusCode = status;
      return res;
    };
    res.json = (value) => res.end(JSON.stringify(value));
    await handler(req, res);
  });
  try {
    Object.assign(process.env, config);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const send = () =>
      globalThis.fetch(
        `http://127.0.0.1:${server.address().port}/api/buyermatch-response`,
        {
          method: "POST",
          body: JSON.stringify({ ...input, operationKey: randomUUID() }),
        },
      );
    const accepted = await send();
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { recorded: true });
    assert.equal(calls.at(-1).body.p_environment, "production");
    for (const [key, value] of Object.entries({
      BM_RESPONSE_ENABLED: "false",
      SUPABASE_SERVICE_ROLE_KEY: "",
      BM_PRODUCTION_PROJECT_REF: "fixture",
      BM_CHECKOUT_ENABLED: "true",
      BM_DELIVERY_MODE: "mock",
      BM_ENVIRONMENT: "staging",
    })) {
      process.env[key] = value;
      const before = calls.length;
      const denied = await send();
      assert.equal(denied.status, 400);
      assert.deepEqual(await denied.json(), {
        error: "Response link unavailable.",
      });
      assert.equal(calls.length, before);
      process.env[key] = config[key];
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
