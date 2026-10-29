import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { buyerProofReview } from "../../server/buyermatch/buyer-proof-review.js";
import {
  encryptIdentity,
  decryptIdentity,
  identityHash,
} from "../../server/buyermatch/security.js";
const priorIdentityKey = process.env.BUYERMATCH_IDENTITY_KEY;
test.beforeEach(() => {
  process.env.BUYERMATCH_IDENTITY_KEY = Buffer.alloc(32, 7).toString("base64");
});
test.afterEach(() => {
  if (priorIdentityKey === undefined)
    delete process.env.BUYERMATCH_IDENTITY_KEY;
  else process.env.BUYERMATCH_IDENTITY_KEY = priorIdentityKey;
});
import {
  buyerAccountInput,
  buyerAccountOperation,
  proofBytes,
} from "../../server/buyermatch/buyer-account.js";
const user = {
  id: randomUUID(),
  email: "synthetic@example.invalid",
  email_confirmed_at: "2026-01-01",
};
const key = randomUUID();
const proof = {
  action: "proof",
  operationKey: key,
  revision: 0,
  content: Buffer.from("%PDF-synthetic").toString("base64"),
  mime: "application/pdf",
  expiresOn: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10),
};
const bad = () => ({ data: null, error: { message: "PRIVATE DETAIL" } });
function database() {
  const calls = [],
    tables = {
      bm_buyer_accounts: { buyer_id: randomUUID(), revision: 0 },
      bm_buyers: {
        criteria: {},
        status: "inactive",
        synthetic: true,
        identity_hash: identityHash(user.email),
        identity_ciphertext: encryptIdentity({
          name: "Synthetic buyer",
          email: user.email,
        }),
      },
      bm_buyer_proofs: [],
      bm_buyer_account_events: null,
    };
  const db = {
    calls,
    tables,
    rpcResult: { data: { saved: true }, error: null },
    from(table) {
      const q = {
        select(fields) {
          calls.push(["select", table, fields]);
          return q;
        },
        eq(field, value) {
          calls.push(["eq", table, field, value]);
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        in() {
          return q;
        },
        gt() {
          return q;
        },
        maybeSingle() {
          return Promise.resolve({ data: tables[table], error: null });
        },
        single() {
          return Promise.resolve({ data: tables[table], error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: tables[table], error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return q;
    },
    rpc(name, args) {
      calls.push(["rpc", name, args]);
      if (name === "bm_buyer_account_authorized")
        return Promise.resolve(db.authorization || { data: true, error: null });
      return Promise.resolve(db.rpcResult);
    },
    storage: {
      from(bucket) {
        return {
          upload(path, bytes, options) {
            calls.push(["upload", bucket, path, bytes.length, options]);
            return Promise.resolve(
              db.uploadResult || { data: { path }, error: null },
            );
          },
          createSignedUrl(path, ttl, options) {
            calls.push(["signed", bucket, path, ttl, options]);
            return Promise.resolve({
              data: { signedUrl: "https://storage.invalid/private" },
              error: null,
            });
          },
        };
      },
    },
  };
  return db;
}

test("strict input rejects arbitrary buyer/user identifiers, unknown actions and forged approval state", () => {
  for (const input of [
    { action: "account", buyerId: randomUUID() },
    {
      action: "criteria",
      operationKey: key,
      revision: 0,
      criteria: { status: "active" },
      accurate: true,
      invitations: true,
      consentVersion: "buyer-maintenance-v1",
    },
    { action: "approve" },
    { ...proof, userId: user.id },
  ])
    assert.equal(buyerAccountInput.safeParse(input).success, false);
});
test("criteria use the existing range validator, exact consent version and explicit decisions", () => {
  const base = {
    action: "criteria",
    operationKey: key,
    revision: 0,
    criteria: { minPrice: 100, maxPrice: 50 },
    accurate: true,
    invitations: false,
    consentVersion: "buyer-maintenance-v1",
  };
  assert.equal(buyerAccountInput.safeParse(base).success, false);
  assert.equal(
    buyerAccountInput.safeParse({
      ...base,
      criteria: { minPrice: 50, maxPrice: 100 },
    }).success,
    true,
  );
  assert.equal(
    buyerAccountInput.safeParse({
      ...base,
      criteria: {},
      consentVersion: "old",
    }).success,
    false,
  );
});
test("proof bytes reject MIME mismatch, noncanonical base64, empty and oversized content", () => {
  for (const [bytes, mime] of [
    ["not a PDF", "application/pdf"],
    ["%PDF-x", "image/jpeg"],
  ])
    assert.throws(() =>
      proofBytes(Buffer.from(bytes).toString("base64"), mime),
    );
  assert.throws(() => proofBytes("!!!!", "application/pdf"));
  assert.throws(() =>
    proofBytes(Buffer.alloc(2097153).toString("base64"), "application/pdf"),
  );
  assert.equal(proofBytes(proof.content, proof.mime).length, 14);
});
test("unconfirmed, missing and anonymous identities fail before any database operation", async () => {
  for (const identity of [
    null,
    { ...user, email_confirmed_at: null },
    { ...user, is_anonymous: true },
  ]) {
    const db = database();
    await assert.rejects(
      buyerAccountOperation(db, identity, { action: "account" }, "staging"),
    );
    assert.equal(db.calls.length, 0);
  }
});
test("claim uses authenticated ID and server-derived identity digest, never accepts client ownership", async () => {
  const db = database();
  const previous = process.env.BUYERMATCH_IDENTITY_KEY;
  process.env.BUYERMATCH_IDENTITY_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    await buyerAccountOperation(
      db,
      user,
      { action: "claim", token: "a".repeat(43) },
      "staging",
    );
    const args = db.calls[0][2];
    assert.equal(args.p_user, user.id);
    assert.match(args.p_identity_hash, /^[a-f0-9]{64}$/);
    assert.equal(args.p_environment, "staging");
    assert.notEqual(args.p_hash, "a".repeat(43));
  } finally {
    if (previous === undefined) delete process.env.BUYERMATCH_IDENTITY_KEY;
    else process.env.BUYERMATCH_IDENTITY_KEY = previous;
  }
});
test("unlinked account is explicit, not an automatic email-based link", async () => {
  const db = database();
  db.tables.bm_buyer_accounts = null;
  assert.deepEqual(
    await buyerAccountOperation(db, user, { action: "account" }, "staging"),
    {
      linked: false,
      consent: {
        version: "buyer-maintenance-v1",
        text: "I confirm these criteria are accurate and authorize BuyerMatch to store these updates and private proof documents for buyer review. Invitation consent is optional. Changing criteria requires review; uploading proof does not verify funds or activate delivery.",
      },
    },
  );
  assert.equal(
    db.calls.some((c) => c[0] === "rpc"),
    false,
  );
});
test("synthetic buyer cannot use Production self-service", async () => {
  await assert.rejects(
    buyerAccountOperation(
      database(),
      user,
      { action: "account" },
      "production",
    ),
  );
});
test("account returns criteria, consent and safe proof metadata without encrypted identities or storage paths", async () => {
  const db = database();
  const result = await buyerAccountOperation(
    db,
    user,
    { action: "account" },
    "staging",
  );
  assert.equal(result.linked, true);
  assert.equal(result.revision, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|buyer_id|storage_path/);
});
test("proof reservation precedes immutable upload and atomic commit; no upsert", async () => {
  const db = database();
  await buyerAccountOperation(db, user, proof, "staging");
  const operations = db.calls.filter((c) => ["rpc", "upload"].includes(c[0]));
  assert.deepEqual(
    operations.map((c) => (c[0] === "rpc" ? c[1] : "upload")),
    ["bm_buyer_account_reserve_proof", "upload", "bm_buyer_account_mutate"],
  );
  assert.equal(operations[1][4].upsert, false);
  assert.equal(operations[1][2], `${user.id}/${key}`);
});
test("failed reservation never uploads; failed upload never commits or deletes earlier documents", async () => {
  const db = database();
  db.rpcResult = bad();
  await assert.rejects(buyerAccountOperation(db, user, proof, "staging"));
  assert.equal(
    db.calls.some((c) => c[0] === "upload"),
    false,
  );
  const second = database();
  second.uploadResult = bad();
  await assert.rejects(buyerAccountOperation(second, user, proof, "staging"));
  assert.equal(second.calls.filter((c) => c[0] === "rpc").length, 1);
});
test("expired or invalid expiration is rejected before upload or reservation", async () => {
  for (const expiresOn of ["2000-01-01", "2027-02-30", "2050-01-01"]) {
    const db = database();
    await assert.rejects(
      buyerAccountOperation(db, user, { ...proof, expiresOn }, "staging"),
    );
    assert.equal(
      db.calls.some((c) => c[0] === "upload" || c[0] === "rpc"),
      false,
    );
  }
});
test("committed proof replay skips storage and delegates payload conflict check to locked RPC", async () => {
  const db = database();
  db.tables.bm_buyer_account_events = { payload: {} };
  await buyerAccountOperation(db, user, proof, "staging");
  assert.equal(
    db.calls.some((c) => c[0] === "upload"),
    false,
  );
  assert.equal(db.calls.filter((c) => c[0] === "rpc").length, 1);
});
test("private proof download filters both proof ID and owned buyer, with attachment and 60-second lifetime", async () => {
  const db = database();
  db.tables.bm_buyer_proofs = { storage_path: "private-owned" };
  await buyerAccountOperation(
    db,
    user,
    { action: "proof-link", id: key },
    "staging",
  );
  assert.ok(
    db.calls.some(
      (c) =>
        c[0] === "eq" &&
        c[1] === "bm_buyer_proofs" &&
        c[2] === "buyer_id" &&
        c[3] === db.tables.bm_buyer_accounts.buyer_id,
    ),
  );
  assert.deepEqual(db.calls.at(-1), [
    "signed",
    "bm-buyer-self-service",
    "private-owned",
    60,
    { download: true },
  ]);
});
test("history validates complete cursor and paginates without dropping the extra row", async () => {
  const db = database();
  await assert.rejects(
    buyerAccountOperation(
      db,
      user,
      { action: "history", before: "2026-01-01T00:00:00Z" },
      "staging",
    ),
  );
  db.rpcResult = {
    data: Array.from({ length: 26 }, (_, i) => ({
      id: String(i),
      createdAt: "2026-01-01T00:00:00Z",
    })),
    error: null,
  };
  const result = await buyerAccountOperation(
    db,
    user,
    { action: "history" },
    "staging",
  );
  assert.equal(result.items.length, 25);
  assert.equal(result.next.beforeId, "24");
});

let authMode = "valid",
  calls = 0;
const httpTables = {};
globalThis.__buyerAccountHttp = {
  auth: {
    getUser: async () => {
      calls++;
      return authMode === "valid"
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: "SECRET TOKEN" } };
    },
  },
  rpc: async () => ({ data: true, error: null }),
  from(table) {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: httpTables[table] || null,
        error: null,
      }),
    };
  },
};
const bundle = await build({
  entryPoints: ["server/http/buyermatch-buyer.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "private-fixture",
      setup(b) {
        b.onResolve(
          { filter: /_accountAuth\.js$|response-config\.js$/ },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents: a.path.endsWith("_accountAuth.js")
            ? 'export const getSupabaseAdminClient=()=>globalThis.__buyerAccountHttp;export const getBearerToken=req=>req.headers?.authorization?.replace(/^Bearer /, "");'
            : 'export const responseEnvironment=()=>"staging";',
        }));
      },
    },
  ],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
async function request(method, headers = {}, body) {
  const res = {
    headers: {},
    status(code) {
      this.code = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(value) {
      this.value = value;
      return this;
    },
  };
  await module.exports.default({ method, headers, body }, res);
  return res;
}
test("HTTP methods and unauthenticated requests cannot reach body parsing", async () => {
  calls = 0;
  assert.equal((await request("GET")).code, 405);
  assert.equal((await request("POST", {}, "NOT JSON")).code, 401);
  assert.equal(calls, 0);
});
test("HTTP verifies Auth remotely and never returns private provider errors", async () => {
  authMode = "invalid";
  const response = await request(
    "POST",
    { authorization: "Bearer DUMMY" },
    "NOT JSON",
  );
  assert.equal(response.code, 401);
  assert.doesNotMatch(JSON.stringify(response), /SECRET TOKEN|DUMMY/);
  authMode = "valid";
});
test("HTTP invalid input returns sanitized no-store errors without database mutations", async () => {
  const response = await request(
    "POST",
    { authorization: "Bearer DUMMY" },
    { action: "account", userId: user.id },
  );
  assert.equal(response.code, 400);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(JSON.stringify(response.value), new RegExp(user.id));
});
test("history preserves controlled introductions by redacting contact details from messages and offers", async () => {
  const db = database();
  db.rpcResult = {
    data: [
      {
        id: key,
        createdAt: "2026-01-01T00:00:00Z",
        messages: [{ body: "email owner@example.invalid or 555-222-1234" }],
        offers: [{ terms: "call 555-222-1234" }],
      },
    ],
    error: null,
  };
  const result = await buyerAccountOperation(
    db,
    user,
    { action: "history" },
    "staging",
  );
  assert.doesNotMatch(JSON.stringify(result), /owner@example|555-222/);
  assert.match(JSON.stringify(result), /contact withheld/);
});

test("owner proof review rejects unconfirmed, non-owner, non-Admin and banned identities before file access", async () => {
  const owner = { ...user, email: "housebuyerinv@gmail.com" };
  for (const identity of [user, { ...owner, email_confirmed_at: null }]) {
    const db = database();
    await assert.rejects(
      buyerProofReview(db, identity, { action: "admin-buyer-proof-queue" }),
    );
    assert.equal(db.calls.length, 0);
  }
  for (const authorization of [
    { data: false, error: null },
    { data: null, error: { message: "PRIVATE" } },
  ]) {
    const db = database();
    db.authorization = authorization;
    await assert.rejects(
      buyerProofReview(db, owner, {
        action: "admin-buyer-proof-link",
        id: key,
      }),
    );
    assert.equal(
      db.calls.some((c) => c[0] === "select" || c[0] === "signed"),
      false,
    );
  }
  const db = database();
  db.tables.account_profiles = { role: "Buyer", account_status: "Active" };
  await assert.rejects(
    buyerProofReview(db, owner, { action: "admin-buyer-proof-queue" }),
  );
  assert.equal(
    db.calls.some((c) => c[1] === "bm_buyer_proofs"),
    false,
  );
});

test("owner proof queue is paginated; review and private links use supported server-only paths", async () => {
  const db = database(),
    owner = { ...user, email: "housebuyerinv@gmail.com" };
  db.tables.account_profiles = { role: "Admin", account_status: "Active" };
  db.tables.bm_buyer_proofs = Array.from({ length: 26 }, () => ({
    id: randomUUID(),
    buyer_id: randomUUID(),
    expires_on: "2027-01-01",
    created_at: "2026-01-01",
  }));
  db.tables.bm_buyer_proof_reviews = [];
  const queue = await buyerProofReview(db, owner, {
    action: "admin-buyer-proof-queue",
  });
  assert.equal(queue.items.length, 25);
  assert.equal(queue.next, db.tables.bm_buyer_proofs[24].id);
  assert.doesNotMatch(
    JSON.stringify(queue),
    /storage_path|identity_ciphertext/,
  );
  await buyerProofReview(db, owner, {
    action: "admin-buyer-proof-review",
    id: key,
    decision: "rejected",
  });
  assert.ok(
    db.calls.some(
      (c) =>
        c[0] === "rpc" &&
        c[1] === "bm_buyer_proof_review" &&
        c[2].p_actor === owner.id,
    ),
  );
  db.tables.bm_buyer_proofs = { storage_path: "owner-reviewed" };
  await buyerProofReview(db, owner, {
    action: "admin-buyer-proof-link",
    id: key,
  });
  assert.deepEqual(db.calls.at(-1), [
    "signed",
    "bm-buyer-self-service",
    "owner-reviewed",
    60,
    { download: true },
  ]);
});

test("owner proof review rejects forged reviewer or arbitrary object path input", async () => {
  const db = database(),
    owner = { ...user, email: "housebuyerinv@gmail.com" };
  db.tables.account_profiles = { role: "Admin", account_status: "Active" };
  for (const body of [
    { action: "admin-buyer-proof-link", id: key, path: "arbitrary" },
    {
      action: "admin-buyer-proof-review",
      id: key,
      decision: "approved",
      actor: randomUUID(),
    },
  ])
    await assert.rejects(buyerProofReview(db, owner, body));
  assert.equal(
    db.calls.some((c) => c[0] === "signed"),
    false,
  );
});

test("HTTP new profile creation fails closed while registration is paused", async () => {
  const prior = process.env.DBP_REGISTRATION_PAUSED;
  process.env.DBP_REGISTRATION_PAUSED = "true";
  try {
    const result = await request(
      "POST",
      { authorization: "Bearer DUMMY" },
      {
        action: "create",
        operationKey: randomUUID(),
        name: "Synthetic buyer",
        criteria: {},
        consentVersion: "buyer-maintenance-v1",
        accurate: true,
        invitations: false,
      },
    );
    assert.equal(result.code, 503);
    assert.match(result.value.error, /paused/);
  } finally {
    if (prior === undefined) delete process.env.DBP_REGISTRATION_PAUSED;
    else process.env.DBP_REGISTRATION_PAUSED = prior;
  }
});

test("new profile identity comes from confirmed Auth, is encrypted server-side, and accepts no client email/role", async () => {
  const previous = process.env.BUYERMATCH_IDENTITY_KEY;
  process.env.BUYERMATCH_IDENTITY_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const input = {
      action: "create",
      operationKey: randomUUID(),
      name: "Synthetic buyer",
      criteria: {},
      consentVersion: "buyer-maintenance-v1",
      accurate: true,
      invitations: false,
    };
    assert.equal(
      buyerAccountInput.safeParse({
        ...input,
        email: "another@example.invalid",
        role: "Admin",
      }).success,
      false,
    );
    const db = database();
    await buyerAccountOperation(db, user, input, "staging");
    const args = db.calls[0][2];
    assert.equal(args.p_user, user.id);
    assert.match(
      args.p_ciphertext,
      /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/,
    );
    assert.doesNotMatch(JSON.stringify(args), /synthetic@example/);
    assert.equal(args.p_payload.invitations, false);
  } finally {
    if (previous === undefined) delete process.env.BUYERMATCH_IDENTITY_KEY;
    else process.env.BUYERMATCH_IDENTITY_KEY = previous;
  }
});

test("private profile updates preserve canonical email, reject role/email injection and encrypt replacement identity", async () => {
  const db = database(),
    input = {
      action: "profile",
      operationKey: randomUUID(),
      revision: 0,
      name: "Updated buyer",
      company: "Synthetic LLC",
      phone: "555-222-1234",
    };
  assert.equal(
    buyerAccountInput.safeParse({
      ...input,
      email: "other@example.invalid",
      role: "Admin",
    }).success,
    false,
  );
  await buyerAccountOperation(db, user, input, "staging");
  const args = db.calls.find((c) => c[0] === "rpc")[2];
  assert.equal(args.p_user, user.id);
  assert.equal(args.p_kind, "profile");
  const identity = decryptIdentity(args.p_ciphertext);
  assert.equal(identity.email, user.email);
  assert.equal(identity.name, "Updated buyer");
  assert.equal(identity.company, "Synthetic LLC");
  assert.equal(args.p_payload.email, undefined);
  assert.equal(args.p_payload.identity_hash, undefined);
});

test("decrypted profile must match its stored identity digest before reading or replacing private details", async () => {
  for (const input of [
    { action: "account" },
    {
      action: "profile",
      operationKey: randomUUID(),
      revision: 0,
      name: "Synthetic buyer",
      company: "",
      phone: "",
    },
  ]) {
    const db = database();
    db.tables.bm_buyers.identity_hash = "other-identity";
    await assert.rejects(buyerAccountOperation(db, user, input, "staging"));
    assert.equal(
      db.calls.some((c) => c[0] === "rpc" || c[0] === "signed"),
      false,
    );
  }
});

test("HTTP preserves disabled profile/workspace/assignment account-state denial", async () => {
  for (const [table, value] of [
    ["account_profiles", { account_status: "Deactivated" }],
    ["workspaces", { account_status: "Deleted" }],
    ["workspace_plan_assignments", { access_status: "Deactivated" }],
  ]) {
    httpTables[table] = value;
    try {
      assert.equal(
        (
          await request(
            "POST",
            { authorization: "Bearer DUMMY" },
            { action: "account" },
          )
        ).code,
        403,
      );
    } finally {
      delete httpTables[table];
    }
  }
});

test("buyer-only confirmed Auth can read an unlinked account without a paid CRM/workspace assignment", async () => {
  const response = await request(
    "POST",
    { authorization: "Bearer DUMMY" },
    { action: "account" },
  );
  assert.equal(response.code, 200);
  assert.equal(response.value.linked, false);
  assert.equal(response.value.consent.version, "buyer-maintenance-v1");
});
