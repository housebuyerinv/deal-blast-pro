import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
after(() => db.close());
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
await db.exec(
  await readFile(
    "supabase/migrations/20260930120000_buyermatch_foundation.sql",
    "utf8",
  ),
);
await db.exec(
  await readFile(
    "supabase/migrations/20260930130000_buyermatch_workflow.sql",
    "utf8",
  ),
);
await db.exec(
  `create table bm_responses(id uuid primary key default gen_random_uuid(),exposure_id uuid references bm_exposures,kind text,created_at timestamptz default now());`,
);
await db.exec(
  await readFile(
    "supabase/migrations/20261029204937_buyermatch_property_conversion_intelligence.sql",
    "utf8",
  ),
);
const owner = randomUUID(),
  other = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  c = randomUUID();
await db.query("insert into auth.users values($1),($2)", [owner, other]);
for (const [id, who] of [
  [a, owner],
  [b, owner],
  [c, other],
])
  await db.query(
    `insert into bm_deals(id,owner_id,property) values($1,$2,'{"address":"123 Main","city":"Austin","state":"TX","zip":"78701"}')`,
    [id, who],
  );
async function record(
  deal = a,
  kind = "closed",
  payload = { amountCents: 100000, confirmed: true },
  key = randomUUID(),
  who = owner,
  reference = "receipt-" + randomUUID(),
) {
  return (
    await db.query("select bm_conversion_record($1,$2,$3,$4,$5,$6,$7) result", [
      who,
      deal,
      key,
      kind,
      "2026-01-01T00:00:00Z",
      reference,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
}
test("actual migration supports idempotent append, rejects replay drift and immutable edits", async () => {
  const key = randomUUID(),
    ref = "close-" + randomUUID(),
    first = await record(
      a,
      "closed",
      { amountCents: 100000, confirmed: true },
      key,
      owner,
      ref,
    );
  assert.equal(
    (
      await record(
        a,
        "closed",
        { amountCents: 100000, confirmed: true },
        key,
        owner,
        ref,
      )
    ).id,
    first.id,
  );
  await assert.rejects(
    record(
      a,
      "closed",
      { amountCents: 200000, confirmed: true },
      key,
      owner,
      ref,
    ),
    /conflict/,
  );
  await assert.rejects(
    db.query("update bm_conversion_events set kind=$1 where id=$2", [
      "lost",
      first.id,
    ]),
    /Append-only/,
  );
  await assert.rejects(
    db.query("delete from bm_conversion_events where id=$1", [first.id]),
    /Append-only/,
  );
});
test("cross-owner records, reads and corrections are isolated", async () => {
  await assert.rejects(record(c), /Owned deal/);
  const foreign = await record(
    c,
    "closed",
    { amountCents: 10000, confirmed: true },
    randomUUID(),
    other,
  );
  await assert.rejects(
    record(a, "void", { eventId: foreign.id, reason: "other_documented" }),
    /Invalid correction/,
  );
  const snapshot = (
    await db.query("select bm_conversion_snapshot($1) result", [owner])
  ).rows[0].result;
  assert.equal(
    snapshot.deals.some((row) => row.id === c),
    false,
  );
  assert.equal(
    snapshot.events.some((row) => row.id === foreign.id),
    false,
  );
});
test("financial receipt cannot be inserted twice and void is an append-only correction", async () => {
  const ref = "cash-" + randomUUID(),
    cash = await record(
      a,
      "fee_received",
      { amountCents: 2000, confirmed: true },
      randomUUID(),
      owner,
      ref,
    );
  await assert.rejects(
    record(
      a,
      "fee_received",
      { amountCents: 2000, confirmed: true },
      randomUUID(),
      owner,
      ref,
    ),
    /duplicate key/,
  );
  await record(a, "void", { eventId: cash.id, reason: "other_documented" });
  await assert.rejects(
    record(a, "void", { eventId: cash.id, reason: "other_documented" }),
    /Invalid correction/,
  );
});
const review = async (
  source,
  target,
  key = randomUUID(),
  who = owner,
  reason = "same_submission",
) =>
  (
    await db.query("select bm_conversion_review($1,$2,$3,$4,$5) result", [
      who,
      source,
      target,
      key,
      reason,
    ])
  ).rows[0].result;
test("no same-address auto merge; units/contracts/interests must match; originals survive", async () => {
  await assert.rejects(review(a, b), /identities/);
  const identity = {
    propertySnapshot: {
      address: "123 Main",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    propertyKey: "property-1",
    unit: "whole",
    contractRef: "contract-1",
    interestRef: "fee-simple",
    transactionRef: "transaction-1",
    source: "direct",
    jvPartner: "",
    market: "Austin",
  };
  await record(a, "identity", identity);
  await record(b, "identity", { ...identity, unit: "unit-2" });
  await assert.rejects(review(a, b), /identities/);
  await record(b, "identity", identity);
  const key = randomUUID(),
    r = await review(a, b, key);
  assert.equal((await review(a, b, key)).id, r.id);
  await assert.rejects(
    db.query(`update bm_deals set property='{}' where id=$1`, [a]),
    /Unmerge/,
  );
  assert.equal(
    (
      await db.query("select count(*)::int n from bm_deals where owner_id=$1", [
        owner,
      ])
    ).rows[0].n,
    2,
  );
  await assert.rejects(
    record(a, "identity", { ...identity, contractRef: "different" }),
    /Unmerge/,
  );
  await review(a, null, randomUUID(), owner, "incorrect_merge");
  await record(a, "identity", { ...identity, contractRef: "different" });
  for (const key of ["contractRef", "interestRef", "transactionRef"]) {
    await record(a, "identity", { ...identity, [key]: "different" });
    await assert.rejects(review(a, b), /identities/);
  }
  await db.query(
    `update bm_deals set property=jsonb_set(property,'{address}','"999 Other"') where id=$1`,
    [a],
  );
  await assert.rejects(review(a, b), /Property changed/);
  await db.query("update bm_deals set property=$1 where id=$2", [
    JSON.stringify(identity.propertySnapshot),
    a,
  ]);
  await assert.rejects(review(a, c), /Owned deals/);
});
test("anon and authenticated cannot read tables or execute owner-argument RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(
        db.query("select * from bm_conversion_events"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select bm_conversion_snapshot($1)", [owner]),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
test("snapshot contains actual match/delivery/response records but no buyer UUID or private payload", async () => {
  const buyer = randomUUID(),
    exposure = randomUUID();
  await db.query(
    `insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria) values($1,'PRIVATE-CIPHERTEXT','PRIVATE-HASH','{}')`,
    [buyer],
  );
  await db.query(
    `insert into bm_exposures(id,deal_id,owner_id,buyer_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')`,
    [exposure, a, owner, buyer, randomUUID()],
  );
  await db.query(
    `insert into bm_outbox(exposure_id,state,accepted_at) values($1,'accepted',now())`,
    [exposure],
  );
  await db.query(
    `insert into bm_responses(exposure_id,kind) values($1,'interested')`,
    [exposure],
  );
  const s = (
    await db.query("select bm_conversion_snapshot($1) result", [owner])
  ).rows[0].result;
  assert.equal(s.recipients[0].delivered_at, null);
  assert.match(s.recipients[0].ref, /^B-/);
  for (const secret of [buyer, "PRIVATE-CIPHERTEXT", "PRIVATE-HASH"])
    assert.equal(JSON.stringify(s).includes(secret), false);
});
test("service-only runtime RPC inserts identity sequence without broader grants", async () => {
  await db.exec("set role service_role");
  try {
    assert.ok((await record(a, "stalled", { reason: "other_documented" })).id);
  } finally {
    await db.exec("reset role");
  }
});
test("local catalog security checks verify RLS, invoker functions and denied anonymous mutation RPCs", async () => {
  const tables = await db.query(
    "select relrowsecurity from pg_class where relname in ('bm_conversion_events','bm_conversion_merge_reviews')",
  );
  assert.equal(tables.rows.length, 2);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  const functions = await db.query(
    "select prosecdef,proconfig from pg_proc where proname in ('bm_conversion_record','bm_conversion_review','bm_conversion_snapshot','bm_conversion_property_guard')",
  );
  assert.equal(functions.rows.length, 4);
  assert.ok(
    functions.rows.every(
      (row) =>
        row.prosecdef === false &&
        row.proconfig.some((v) => v.startsWith("search_path=")),
    ),
  );
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("select * from bm_conversion_merge_reviews"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select bm_conversion_record($1,$2,$3,'lost',now(),'source-ref','{}')",
        [owner, a, randomUUID()],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select bm_conversion_review($1,$2,$3,$4,$5)", [
        owner,
        a,
        b,
        randomUUID(),
        "same_submission",
      ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("SQL rejects unsupported financial proof and cross-deal duplicate receipts", async () => {
  await assert.rejects(
    record(a, "fee_received", { amountCents: 100 }),
    /check constraint/,
  );
  await assert.rejects(
    record(a, "closed", { confirmed: true }),
    /check constraint/,
  );
  const ref = "global-receipt-" + randomUUID();
  await record(
    a,
    "fee_received",
    { amountCents: 500, confirmed: true },
    randomUUID(),
    owner,
    ref,
  );
  await assert.rejects(
    record(
      b,
      "fee_received",
      { amountCents: 500, confirmed: true },
      randomUUID(),
      owner,
      ref,
    ),
    /duplicate key/,
  );
});
