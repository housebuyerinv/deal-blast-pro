// Rehearse schema installation only; do not import/repeat historical test bodies.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const source = await readFile("tests/buyermatch/database.test.js", "utf8");
const block = source.split("for (const name of [")[1]?.split("])")[0];
const baseline = [...block.matchAll(/"(\d+_buyermatch_[^"]+\.sql)"/g)].map(
  (m) => m[1],
);
assert.equal(
  baseline.length,
  20,
  "Reuse exactly the established historical DDL chain",
);
const chain = [
  ...baseline,
  "20261018165041_buyermatch_analysis_version_guard.sql",
  "20261022141326_buyermatch_owned_subscription_plan_changes.sql",
  "20261023153356_buyermatch_completed_checkout_guards.sql",
  "20261024000845_buyermatch_private_buyer_intake.sql",
];
const sql = await readFile(
  "supabase/migrations/20261026175709_buyermatch_authenticated_buyer_self_service.sql",
  "utf8",
);
async function historical() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table account_profiles(user_id uuid primary key,role text,account_status text);
 create table buyer_portal_submissions(id uuid primary key default gen_random_uuid(),status text default 'pending_review',buyer_data jsonb,created_at timestamptz default now(),imported_at timestamptz,approved_at timestamptz,approved_by text,created_buyer_id text);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
  for (const name of chain)
    await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  return db;
}
const db = await historical();
after(() => db.close());
const owner = randomUUID(),
  buyer = randomUUID(),
  deal = randomUUID(),
  exposure = randomUUID(),
  identity = randomUUID();
await db.query(
  "insert into auth.users values($1,'synthetic@example.invalid',now(),null)",
  [owner],
);
await db.query("insert into account_profiles values($1,'Admin','Active')", [
  owner,
]);
await db.query(
  "insert into bm_buyers(id,identity_hash,identity_ciphertext,criteria,status,synthetic) values($1,$2,'SYNTHETIC CIPHERTEXT','{\"minPrice\":100}','active',true)",
  [buyer, identity],
);
await db.query(
  "insert into buyer_portal_submissions(buyer_data) values('{\"synthetic\":true}')",
);
const preserved = (
  await db.query("select * from bm_buyers where id=$1", [buyer])
).rows;
const billingBefore = (
  await db.query(
    "select proname,proacl::text,pg_get_functiondef(oid) as definition from pg_proc where proname in ('bm_apply_test_billing','bm_apply_live_billing') order by proname",
  )
).rows;
await db.exec(sql);
test("new draft applies after all 24 historical BuyerMatch schema sources without rewriting records or billing guards", async () => {
  assert.deepEqual(
    (await db.query("select * from bm_buyers where id=$1", [buyer])).rows,
    preserved,
  );
  assert.deepEqual(
    (
      await db.query(
        "select proname,proacl::text,pg_get_functiondef(oid) as definition from pg_proc where proname in ('bm_apply_test_billing','bm_apply_live_billing') order by proname",
      )
    ).rows,
    billingBefore,
  );
  assert.equal(
    (await db.query("select count(*)::int n from buyer_portal_submissions"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from bm_buyer_accounts")).rows[0].n,
    0,
  );
});
test("full-schema private tables, bucket and service-only functions retain browser denial", async () => {
  const tables = [
    "bm_buyer_accounts",
    "bm_buyer_account_events",
    "bm_buyer_proofs",
    "bm_buyer_proof_uploads",
    "bm_buyer_proof_reviews",
  ];
  for (const table of tables) {
    assert.equal(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          ["public." + table],
        )
      ).rows[0].relrowsecurity,
      true,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",
            [role, "public." + table],
          )
        ).rows[0].allowed,
        false,
      );
  }
  const functions = (
    await db.query(
      "select oid::regprocedure::text signature from pg_proc where proname in ('bm_buyer_account_create','bm_buyer_account_claim','bm_buyer_account_mutate','bm_buyer_account_history','bm_buyer_account_reserve_proof','bm_buyer_proof_review','bm_buyer_account_authorized')",
    )
  ).rows;
  assert.equal(functions.length, 7);
  for (const f of functions)
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,$2,'EXECUTE') allowed",
            [role, f.signature],
          )
        ).rows[0].allowed,
        role === "service_role",
      );
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='bm-buyer-self-service'",
      )
    ).rows[0].public,
    false,
  );
});
test("legacy administrator portal-sync RPC invalidates stale buyer update without overwriting its changes", async () => {
  await db.query(
    "insert into bm_deals(id,owner_id,property) values($1,$2,'{}')",
    [deal, owner],
  );
  await db.query(
    "insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')",
    [exposure, deal, buyer, owner, randomUUID()],
  );
  await db.query(
    "insert into bm_outbox(exposure_id,accepted_at) values($1,now())",
    [exposure],
  );
  await db.query(
    "insert into bm_response_tokens(token_hash,exposure_id,expires_at) values($1,$2,now()+interval '1 day')",
    [identity, exposure],
  );
  await db.query("select bm_buyer_account_claim($1,$2,$2,'staging')", [
    owner,
    identity,
  ]);
  await db.query("select bm_sync_portal_buyer($1,$2,$3)", [
    owner,
    randomUUID(),
    {
      identity_hash: identity,
      identity_ciphertext: "SYNTHETIC NEW ADMIN CIPHERTEXT",
      criteria: { minPrice: 999 },
      consent_evidence: "synthetic recorded consent",
      synthetic: true,
    },
  ]);
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [owner],
      )
    ).rows[0].revision,
    1,
  );
  await assert.rejects(
    db.query("select bm_buyer_account_mutate($1,$2,0,'criteria',$3)", [
      owner,
      randomUUID(),
      {
        criteria: { minPrice: 100 },
        consentVersion: "buyer-maintenance-v1",
        accurate: true,
        invitations: true,
      },
    ]),
  );
  assert.equal(
    (await db.query("select criteria from bm_buyers where id=$1", [buyer]))
      .rows[0].criteria.minPrice,
    999,
  );
});
test("activity-only updates do not invalidate criteria; accepted portal edit advances exactly once", async () => {
  await db.query("update bm_buyers set last_active_at=now() where id=$1", [
    buyer,
  ]);
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [owner],
      )
    ).rows[0].revision,
    1,
  );
  await db.query("select bm_buyer_account_mutate($1,$2,1,'criteria',$3)", [
    owner,
    randomUUID(),
    {
      criteria: { minPrice: 1000 },
      consentVersion: "buyer-maintenance-v1",
      accurate: true,
      invitations: true,
    },
  ]);
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [owner],
      )
    ).rows[0].revision,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_account_events where user_id=$1 and kind='criteria'",
        [owner],
      )
    ).rows[0].n,
    1,
  );
});
test("unrecorded reapplication fails closed and leaves prior evidence intact after rollback", async () => {
  const before = (
    await db.query("select * from bm_buyer_account_events order by id")
  ).rows;
  await assert.rejects(db.exec(sql));
  await db.exec("rollback");
  assert.deepEqual(
    (await db.query("select * from bm_buyer_account_events order by id")).rows,
    before,
  );
});
test("partial installation failure rolls back all new objects and permits a clean retry", async () => {
  const isolated = await historical();
  try {
    const fault = sql.replace(
      "create function public.bm_buyer_account_claim(",
      "select 1/0;create function public.bm_buyer_account_claim(",
    );
    await assert.rejects(isolated.exec(fault));
    await isolated.exec("rollback");
    assert.equal(
      (
        await isolated.query(
          "select to_regclass('public.bm_buyer_accounts') name",
        )
      ).rows[0].name,
      null,
    );
    assert.equal(
      (
        await isolated.query(
          "select count(*)::int n from storage.buckets where id='bm-buyer-self-service'",
        )
      ).rows[0].n,
      0,
    );
    await isolated.exec(sql);
    assert.notEqual(
      (
        await isolated.query(
          "select to_regclass('public.bm_buyer_accounts') name",
        )
      ).rows[0].name,
      null,
    );
  } finally {
    await isolated.close();
  }
});
