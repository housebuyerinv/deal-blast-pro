import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import process from "node:process";
const owner = "11111111-1111-4111-8111-111111111111",
  dealId = "22222222-2222-4222-8222-222222222222";
process.env.SUPABASE_URL = "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
const calls = [];
let email = "regular@example.invalid";
const records = {
  account_profiles: [{ user_id: owner, account_status: "Active" }],
  workspaces: [],
  workspace_plan_assignments: [],
  bm_deals: [
    {
      id: dealId,
      owner_id: owner,
      property: { address: "123 Fixture" },
      status: "analyzed",
      contract_key: "private-object",
      contract_verified: false,
    },
  ],
  bm_analyses: [
    {
      deal_id: dealId,
      public_result: { score: null },
      private_result: { buyerId: "PRIVATE-BUYER-ID" },
    },
  ],
  bm_events: [
    {
      id: "event",
      deal_id: dealId,
      kind: "analyzed",
      public_note: "Analysis completed",
      created_at: "2026-09-30",
      evidence: { email: "PRIVATE-EMAIL" },
    },
  ],
  bm_offers: [],
  bm_closings: [],
};
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.fields = "*";
    calls.push(table);
  }
  select(fields) {
    this.fields = fields;
    return this;
  }
  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    this.singleResult = true;
    return this;
  }
  single() {
    this.singleResult = true;
    return this;
  }
  then(resolve) {
    const rows = (records[this.table] || [])
      .filter((r) => this.filters.every((f) => f(r)))
      .map((row) =>
        this.fields === "*" || this.fields === "*,bm_outbox(*)"
          ? row
          : Object.fromEntries(
              this.fields.split(",").map((key) => [key, row[key]]),
            ),
      );
    resolve({ data: this.singleResult ? rows[0] || null : rows, error: null });
  }
}
globalThis.__buyerMatchFixture = {
  auth: {
    getUser: async (token) =>
      token === "valid"
        ? { data: { user: { id: owner, email } }, error: null }
        : { data: { user: null }, error: {} },
  },
  from: (table) => new Query(table),
};
const compiled = await build({
  entryPoints: ["api/buyermatch.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "supabase-fixture",
      setup(b) {
        b.onResolve({ filter: /^stripe$/ }, () => ({
          path: "stripe",
          namespace: "stripe-fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "stripe-fixture" }, () => ({
          contents: "export default class Stripe {}",
        }));
        b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
          path: "fixture",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const createClient=()=>globalThis.__buyerMatchFixture;",
        }));
      },
    },
  ],
});
const { default: handler } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
async function invoke(action, body = {}, token = "valid", method = "POST") {
  const result = { headers: {}, statusCode: 0, body: null };
  const res = {
    setHeader: (k, v) => (result.headers[k] = v),
    status: (code) => {
      result.statusCode = code;
      return res;
    },
    json: (value) => {
      result.body = value;
      return res;
    },
  };
  await handler(
    {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: { action, ...body },
      query: { action, ...body },
    },
    res,
  );
  return result;
}
test("API denies missing and invalid bearer tokens", async () => {
  assert.equal((await invoke("list", {}, "")).statusCode, 401);
  assert.equal((await invoke("list", {}, "invalid")).statusCode, 401);
});
test("admin detail normalizes PostgREST one-to-one delivery receipts", async () => {
  email = "housebuyerinv@gmail.com";
  records.bm_exposures = [
    {
      deal_id: dealId,
      bm_outbox: { state: "accepted", accepted_at: "2026-10-01" },
    },
  ];
  try {
    const response = await invoke("admin-detail", { id: dealId });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.exposures[0].bm_outbox[0].state, "accepted");
    records.bm_exposures[0].bm_outbox = null;
    assert.deepEqual(
      (await invoke("admin-detail", { id: dealId })).body.exposures[0]
        .bm_outbox,
      [],
    );
  } finally {
    email = "regular@example.invalid";
    delete records.bm_exposures;
  }
});
test("API denies admin actions even if user submits forged admin flags", async () => {
  calls.length = 0;
  const result = await invoke("admin-list", {
    isOwnerAdmin: true,
    role: "Admin",
  });
  assert.equal(result.statusCode, 403);
  assert.equal(calls.includes("bm_buyers"), false);
});
test("API rejects cross-user deal access before private analysis retrieval", async () => {
  const original = records.bm_deals[0].owner_id;
  records.bm_deals[0].owner_id = "other";
  calls.length = 0;
  assert.equal((await invoke("detail", { id: dealId })).statusCode, 404);
  assert.equal(calls.includes("bm_analyses"), false);
  records.bm_deals[0].owner_id = original;
});
test("actual public detail response strips private evidence and storage keys", async () => {
  const result = await invoke("detail", { id: dealId });
  assert.equal(result.statusCode, 200);
  const serialized = JSON.stringify(result.body);
  for (const secret of [
    "PRIVATE-BUYER-ID",
    "PRIVATE-EMAIL",
    "private-object",
    "owner_id",
    "private_result",
  ])
    assert.equal(serialized.includes(secret), false);
  assert.equal(result.headers["Cache-Control"], "no-store");
});
test("read-only method cannot execute mutation", async () => {
  assert.equal((await invoke("save", {}, "valid", "GET")).statusCode, 405);
});
test.after(() => {
  delete globalThis.__buyerMatchFixture;
});

test("all private admin operations deny regular accounts before network access", async () => {
  for (const action of [
    "admin-list",
    "admin-detail",
    "admin-preview",
    "admin-import",
    "admin-buyer",
    "admin-duplicates",
    "admin-duplicate-review",
    "admin-test-response-link",
    "admin-test-dispatch",
    "admin-configure",
    "admin-review",
    "admin-document",
    "admin-progress",
  ]) {
    calls.length = 0;
    assert.equal(
      (await invoke(action, { id: dealId, isOwnerAdmin: true })).statusCode,
      403,
      action,
    );
    assert.equal(
      calls.some((table) => table.startsWith("bm_")),
      false,
      action,
    );
  }
});
test("cross-owner mutations and private upload issuance are denied", async () => {
  const original = records.bm_deals[0].owner_id;
  records.bm_deals[0].owner_id = "other";
  try {
    for (const action of [
      "analyze",
      "upload",
      "title",
      "accept",
      "distribution",
      "update",
    ])
      assert.equal(
        (await invoke(action, { id: dealId })).statusCode,
        404,
        action,
      );
  } finally {
    records.bm_deals[0].owner_id = original;
  }
});

test("terminal deal cannot be reopened by title edit or administrator contract approval", async () => {
  const before = records.bm_deals[0].status;
  records.bm_deals[0].status = "closed";
  try {
    assert.equal((await invoke("title", { id: dealId })).statusCode, 409);
    process.env.DEALBLAST_OWNER_ADMIN_EMAILS = email;
    assert.equal(
      (await invoke("admin-review", { id: dealId })).statusCode,
      409,
    );
  } finally {
    records.bm_deals[0].status = before;
    delete process.env.DEALBLAST_OWNER_ADMIN_EMAILS;
  }
});
