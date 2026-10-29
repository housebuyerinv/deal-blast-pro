import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import process from "node:process";
import { ENGINE_VERSION } from "../../server/buyermatch/matching.js";
const owner = "11111111-1111-4111-8111-111111111111",
  dealId = "22222222-2222-4222-8222-222222222222";
process.env.SUPABASE_URL = "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
const calls = [];
let email = "regular@example.invalid";
let confirmedAt = '2026-01-01';
const records = {
  account_profiles: [{ user_id: owner, account_status: "Active" }],
  workspaces: [],
  workspace_plan_assignments: [],
  bm_entitlements: [{ owner_id: owner, product: 'buyermatch', status: 'active',
    period_start: '2020-01-01', period_end: '2099-01-01' }],
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
  is(key, value) { return this.eq(key, value); }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  gte(key, value) {
    this.filters.push((row) => row[key] >= value);
    return this;
  }
  lt(key, value) {
    this.filters.push((row) => row[key] < value);
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
        ? { data: { user: { id: owner, email, email_confirmed_at: confirmedAt } }, error: null }
        : { data: { user: null }, error: {} },
  },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    calls.push({ rpc: name, args });
    if (name === 'bm_account_usage') return {data: {analysis:{used:2,remaining:18},softwareDistribution:{used:1,remaining:19},managedDispo:{used:3,remaining:7}},error:null};
    return {data:{accounts:[]},error:null};
  },
};
const compiled = await build({
  entryPoints: ["server/http/buyermatch.ts"],
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
test("Production plans expose disabled integration states without private configuration", async () => {
  const prior = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    const result = await invoke("plans", {}, "valid", "GET");
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.distributionEnabled, false);
    assert.equal(result.body.testDeliveryEnabled, false);
    assert.equal(result.body.checkoutEnabled, false);
    assert.equal(result.body.successFeesEnabled, false);
    assert.equal(result.body.deliveryMode, "disabled");
    assert.equal(JSON.stringify(result.body).includes("fixture-only"), false);
  } finally {
    if (prior === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prior;
  }
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

test("Production outreach uses authenticated owner, denies cross-owner and fails closed when disabled", async () => {
  const config = {
    VERCEL_ENV: "production",
    BM_ENVIRONMENT: "production",
    BM_RESPONSE_ENABLED: "true",
    BM_PRODUCTION_PROJECT_REF: "aigvnbxiydbzzqbetlhl",
    SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
    BM_CHECKOUT_ENABLED: "false",
    BM_DELIVERY_MODE: "resend",
    BM_LIVE_DELIVERY_ENABLED: "true",
    RESEND_API_KEY: "fixture",
    BM_RESEND_FROM: "fixture@example.invalid",
    BM_RESPONSE_SECRET: "x".repeat(32),
    BM_APP_ORIGIN: "https://deal-blast-pro.vercel.app",
    PUBLIC_APP_URL: "https://deal-blast-pro.vercel.app",
  };
  const prior = Object.fromEntries(
    Object.keys(config).map((k) => [k, process.env[k]]),
  );
  const rpc = [];
  const previousRpc = globalThis.__buyerMatchFixture.rpc;
  const previousAnalysis = records.bm_analyses[0].private_result;
  globalThis.__buyerMatchFixture.rpc = async (name, args) => {
    rpc.push({ name, args });
    return { data: { status: "queued", sent: false } };
  };
  const body = {
    id: dealId,
    operationKey: dealId,
    ownerId: "forged",
    workspaceId: "forged",
    buyerId: "forged",
    maxDistributionFanout: 10000,
    distributionAllowance: 10000,
    planVersion: 'buyermatch-pro-v1',
  };
  try {
    Object.assign(process.env, config);
    assert.equal((await invoke("distribution", body, "")).statusCode, 401);
    records.bm_deals[0].owner_id = "other";
    assert.equal((await invoke("distribution", body)).statusCode, 404);
    records.bm_deals[0].owner_id = owner;
    // Missing-version analyses must stop before provider availability is tested.
    const stale = await invoke("distribution", body);
    assert.equal(stale.statusCode, 409);
    assert.match(stale.body.error, /Matching safety revalidation required/);
    assert.equal(rpc.length, 0);
    records.bm_analyses[0].private_result = { ...previousAnalysis, engineVersion: ENGINE_VERSION };
    process.env.BM_LIVE_DELIVERY_ENABLED = "false";
    assert.equal((await invoke("distribution", body)).statusCode, 503);
    assert.equal(rpc.length, 0);
    process.env.BM_LIVE_DELIVERY_ENABLED = "true";
    const queued = await invoke("distribution", body);
    assert.equal(queued.statusCode, 200);
    assert.deepEqual(queued.body, { status: "queued", sent: false });
    assert.deepEqual(rpc[0], {
      name: "bm_queue_production_distribution",
      args: { p_owner: owner, p_deal: dealId, p_key: dealId },
    });
  } finally {
    records.bm_deals[0].owner_id = owner;
    records.bm_analyses[0].private_result = previousAnalysis;
    globalThis.__buyerMatchFixture.rpc = previousRpc;
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test.after(() => {
  delete globalThis.__buyerMatchFixture;
});

test('BuyerMatch access is independent of CRM plans and denies inactive entitlements', async () => {
  const entitlement = records.bm_entitlements[0];
  try {
    for (const status of ['inactive', 'past_due', 'canceled']) {
      entitlement.status = status;
      assert.equal((await invoke('list')).statusCode, 403);
    }
    entitlement.status = 'active';
    entitlement.period_end = '2020-01-01';
    assert.equal((await invoke('list')).statusCode, 403);
    entitlement.period_end = '2099-01-01';
    entitlement.product = 'network';
    assert.equal((await invoke('list')).statusCode, 403);
    entitlement.product = 'buyermatch';
    assert.equal((await invoke('list')).statusCode, 200);
  } finally {
    Object.assign(entitlement, { status: 'active', product: 'buyermatch', period_end: '2099-01-01' });
  }
});

test("all private admin operations deny regular accounts before network access", async () => {
  for (const action of [
    "admin-list",
    "admin-usage",
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

test('plans binds usage to authenticated owner and excludes operating metrics', async () => {
  calls.length=0;
  const response=await invoke('plans',{ownerId:'99999999-9999-4999-8999-999999999999'});
  assert.equal(response.statusCode,200);
  assert.equal(calls.find(c=>c.rpc==='bm_account_usage').args.p_owner,owner);
  assert.equal(response.body.usage.softwareDistribution.used,1);
  assert.equal(response.body.usage.managedDispo.used,3);
  assert.equal('accounts' in response.body,false);
  assert.equal('hypothetical' in response.body,false);
});

test('provider verification denies anonymous and ordinary users without BuyerMatch mutations', async () => {
  calls.length=0;
  assert.equal((await invoke('admin-verify-provider',{},'','GET')).statusCode,401);
  assert.equal((await invoke('admin-verify-provider',{},'valid','GET')).statusCode,403);
  assert.equal(calls.some(name=>name.startsWith('bm_')),false);
});
test('owner-admin provider preflight fails closed outside Production without BuyerMatch writes',async()=>{
  email='housebuyerinv@gmail.com';calls.length=0;
  try {const r=await invoke('admin-verify-provider',{},'valid','GET');assert.equal(r.statusCode,200);assert.equal(r.body.authenticated,false);assert.equal(calls.some(name=>name.startsWith('bm_')),false);}
  finally {email='regular@example.invalid';}
});

test('unconfirmed owner cannot read network administration records',async()=>{
  email='housebuyerinv@gmail.com';confirmedAt=null;calls.length=0;
  try {
    const response=await invoke('admin-operations',{},'valid','GET');
    assert.equal(response.statusCode,403);
    assert.equal(calls.some(name=>typeof name==='string'&&name.startsWith('bm_')),false);
  } finally {email='regular@example.invalid';confirmedAt='2026-01-01';}
});

test('activity binds owner and deal to the authenticated subject, not submitted owner',async()=>{
  calls.length=0;
  const response=await invoke('activity',{id:dealId,page:'1',ownerId:'foreign'},'valid','GET');
  assert.equal(response.statusCode,200);
  const call=calls.find(item=>item.rpc==='bm_deal_activity');
  assert.deepEqual(call.args,{p_owner:owner,p_deal:dealId,p_page:1});
  calls.length=0;
  assert.equal((await invoke('activity',{id:'33333333-3333-4333-8333-333333333333'},'valid','GET')).statusCode,404);
  assert.equal(calls.some(item=>item.rpc==='bm_deal_activity'),false);
  assert.equal((await invoke('activity',{id:dealId})).statusCode,405);
});

test('network approval requires recorded buyer invitation consent before any sync write',async()=>{
 calls.length=0;process.env.DEALBLAST_OWNER_ADMIN_EMAILS=email;
 try{
  const response=await invoke('admin-sync-buyer',{identity:{name:'Synthetic',email:'buyer@example.invalid'},criteria:{markets:[{state:'AL'}],assetTypes:['sfh']},sourceId:dealId,consentEvidence:'Approved by an admin'});
  assert.equal(response.statusCode,409);
  assert.equal(calls.some(c=>c.rpc==='bm_sync_portal_buyer'),false);
 }finally{delete process.env.DEALBLAST_OWNER_ADMIN_EMAILS}
});

test('unsubscribed BuyerMatch user can review and sign only current platform agreements',async()=>{
 const previous=records.bm_entitlements;records.bm_entitlements=[];
 const doc={id:'33333333-3333-4333-8333-333333333333',kind:'platform_terms',version:'1',approved:true,current:true,content:'Synthetic terms'};
 doc.document_hash=createHash('sha256').update(doc.content).digest('hex');
 const privacy={...doc,id:'44444444-4444-4444-8444-444444444444',kind:'privacy'};
 records.bm_documents=[doc,privacy];records.bm_acceptances=[];
 try {
  const result=await invoke('onboarding',{},'valid','GET');assert.equal(result.statusCode,200);assert.equal(result.body.documents.length,2);
  calls.length=0;
  const accepted=await invoke('onboarding-accept',{documentId:doc.id,hash:doc.document_hash,signature:'Synthetic Owner',ownerId:'foreign'});
  assert.equal(accepted.statusCode,200);
  const write=calls.find(c=>c.rpc==='bm_accept_document');assert.equal(write.args.p_owner,owner);assert.equal(write.args.p_deal,null);
  calls.length=0;
  assert.equal((await invoke('onboarding-accept',{documentId:doc.id,hash:'changed',signature:'Synthetic Owner'})).statusCode,409);
  assert.equal(calls.some(c=>c.rpc==='bm_accept_document'),false);
  assert.equal((await invoke('checkout',{planVersion:'buyermatch-starter-v1',operationKey:'55555555-5555-4555-8555-555555555555'})).statusCode,409);
 } finally {records.bm_entitlements=previous;delete records.bm_documents;delete records.bm_acceptances;}
});
