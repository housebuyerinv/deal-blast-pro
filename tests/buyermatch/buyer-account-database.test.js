import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { buyerAccountInput } from "../../server/buyermatch/buyer-account.js";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 create table account_profiles(user_id uuid primary key,role text,account_status text);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;create policy legacy_wide on storage.objects for all to anon,authenticated using(true) with check(true);`);
await db.exec(
  await readFile(
    "supabase/migrations/20260930120000_buyermatch_foundation.sql",
    "utf8",
  ),
);
await db.exec(`alter table bm_buyers add column synthetic boolean not null default true;
 create table bm_response_tokens(token_hash text primary key,exposure_id uuid unique references bm_exposures(id),environment text,expires_at timestamptz,revoked_at timestamptz);
 create table bm_responses(id uuid primary key default gen_random_uuid(),exposure_id uuid,kind text,created_at timestamptz default now());
 create table bm_messages(id uuid primary key default gen_random_uuid(),exposure_id uuid,sender_kind text,body text,created_at timestamptz default now());
 create table bm_offers(id uuid primary key default gen_random_uuid(),exposure_id uuid,amount_cents bigint,terms text,created_at timestamptz default now());`);
await db.exec(
  await readFile(
    "supabase/migrations/20261026175709_buyermatch_authenticated_buyer_self_service.sql",
    "utf8",
  ),
);
after(() => db.close());
async function fixture() {
  const user = randomUUID(),
    buyer = randomUUID(),
    deal = randomUUID(),
    exposure = randomUUID(),
    hash = randomUUID();
  await db.query(
    "insert into auth.users values($1,'synthetic@example.invalid',now(),null)",
    [user],
  );
  await db.query(
    "insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria,status,criteria_verified_at,consent_evidence) values($1,'SYNTHETIC',$2,'{}','active',now(),'PRIOR CONSENT')",
    [buyer, hash],
  );
  await db.query(
    'insert into bm_deals(id,owner_id,property,title) values($1,$2,\'{"address":"Synthetic address","privateNote":"DO NOT EXPOSE"}\',\'{}\')',
    [deal, user],
  );
  await db.query(
    "insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')",
    [exposure, deal, buyer, user, randomUUID()],
  );
  await db.query(
    "insert into bm_outbox(exposure_id,state,accepted_at) values($1,'accepted',now())",
    [exposure],
  );
  await db.query(
    "insert into bm_response_tokens values($1,$2,'staging',now()+interval '1 day',null)",
    [hash, exposure],
  );
  return { user, buyer, deal, exposure, hash };
}
const claim = (
  f,
  user = f.user,
  hash = f.hash,
  identity = f.hash,
  environment = "staging",
) =>
  db.query("select bm_buyer_account_claim($1,$2,$3,$4) result", [
    user,
    hash,
    identity,
    environment,
  ]);
const payload = () => ({
  criteria: { markets: [{ state: "TX" }], minPrice: 100, maxPrice: 500 },
  consentVersion: "buyer-maintenance-v1",
  accurate: true,
  invitations: true,
});
const mutate = async (
  f,
  kind = "criteria",
  value = payload(),
  revision = 0,
  key = kind === "proof" ? value.id : randomUUID(),
) => {
  if (kind === "proof")
    await db.query("select bm_buyer_account_reserve_proof($1,$2,$3,$4)", [
      f.user,
      key,
      revision,
      value,
    ]);
  return db.query("select bm_buyer_account_mutate($1,$2,$3,$4,$5) result", [
    f.user,
    key,
    revision,
    kind,
    value,
  ]);
};
const history = (f) =>
  db.query("select bm_buyer_account_history($1,null,null) result", [f.user]);

test("confirmed Auth plus accepted identity-matched invitation creates exactly one durable binding", async () => {
  const f = await fixture();
  await claim(f);
  await claim(f);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_account_events where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
});
for (const [name, change] of [
  [
    "unconfirmed",
    (f) =>
      db.query("update auth.users set email_confirmed_at=null where id=$1", [
        f.user,
      ]),
  ],
  [
    "banned",
    (f) =>
      db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [f.user],
      ),
  ],
  [
    "expired",
    (f) =>
      db.query(
        "update bm_response_tokens set expires_at=now()-interval '1 day' where token_hash=$1",
        [f.hash],
      ),
  ],
  [
    "revoked",
    (f) =>
      db.query(
        "update bm_response_tokens set revoked_at=now() where token_hash=$1",
        [f.hash],
      ),
  ],
  [
    "not delivered",
    (f) =>
      db.query("update bm_outbox set accepted_at=null where exposure_id=$1", [
        f.exposure,
      ]),
  ],
  [
    "forged deal owner",
    (f) =>
      db.query("update bm_deals set owner_id=$1 where id=$2", [
        randomUUID(),
        f.deal,
      ]),
  ],
])
  test(`claim rejects ${name} without binding or audit writes`, async () => {
    const f = await fixture();
    if (name === "forged deal owner") {
      const other = await fixture();
      await db.query("update bm_deals set owner_id=$1 where id=$2", [
        other.user,
        f.deal,
      ]);
    } else await change(f);
    await assert.rejects(claim(f));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from bm_buyer_accounts where user_id=$1",
          [f.user],
        )
      ).rows[0].n,
      0,
    );
  });
test("email/hash alone, wrong invitation and wrong environment cannot claim", async () => {
  const f = await fixture();
  await assert.rejects(claim(f, f.user, "missing"));
  await assert.rejects(claim(f, f.user, f.hash, "wrong"));
  await assert.rejects(claim(f, f.user, f.hash, f.hash, "production"));
});
test("a second identity cannot take over a bound buyer; same identity cannot change buyer binding", async () => {
  const f = await fixture(),
    other = await fixture();
  await claim(f);
  await assert.rejects(claim(f, other.user));
  await assert.rejects(claim(other, f.user));
  await assert.rejects(
    db.query("update bm_buyer_accounts set buyer_id=$1 where user_id=$2", [
      other.buyer,
      f.user,
    ]),
  );
});
test("queued competing claims yield one owner, never two (single-connection serialization)", async () => {
  const f = await fixture(),
    other = await fixture();
  const result = await Promise.allSettled([claim(f), claim(f, other.user)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
});
test("criteria save increments revision, preserves original consent evidence and pauses eligibility", async () => {
  const f = await fixture();
  await claim(f);
  await mutate(f);
  const b = (await db.query("select * from bm_buyers where id=$1", [f.buyer]))
    .rows[0];
  assert.equal(b.status, "inactive");
  assert.equal(b.criteria_verified_at, null);
  assert.equal(b.consent_evidence, "PRIOR CONSENT");
  assert.equal(b.criteria.minPrice, 100);
});
test("same operation is idempotent; changed payload conflicts; stale updates are rolled back", async () => {
  const f = await fixture();
  await claim(f);
  const key = randomUUID();
  const one = await mutate(f, "criteria", payload(), 0, key);
  assert.deepEqual(
    (await mutate(f, "criteria", payload(), 0, key)).rows,
    one.rows,
  );
  await assert.rejects(
    mutate(f, "criteria", { ...payload(), invitations: false }, 0, key),
  );
  await assert.rejects(mutate(f));
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].revision,
    1,
  );
});
for (const [name, value] of [
  ["missing version", { ...payload(), consentVersion: undefined }],
  ["old version", { ...payload(), consentVersion: "old" }],
  ["missing accuracy", { ...payload(), accurate: false }],
  ["missing optional decision", { ...payload(), invitations: undefined }],
])
  test(`invalid consent rejects ${name}`, async () => {
    const f = await fixture();
    await claim(f);
    await assert.rejects(mutate(f, "criteria", value));
    assert.equal(
      (
        await db.query(
          "select revision from bm_buyer_accounts where user_id=$1",
          [f.user],
        )
      ).rows[0].revision,
      0,
    );
  });
test("withdrawal requires no coerced agreement, suppresses pending delivery and cannot be undone by edit", async () => {
  const f = await fixture();
  await claim(f);
  await db.query("update bm_outbox set accepted_at=null where exposure_id=$1", [
    f.exposure,
  ]);
  await mutate(f, "withdraw", {});
  await mutate(f, "criteria", payload(), 1);
  const b = (
    await db.query("select status,opted_out_at from bm_buyers where id=$1", [
      f.buyer,
    ])
  ).rows[0];
  assert.equal(b.status, "suppressed");
  assert.ok(b.opted_out_at);
  assert.equal(
    (
      await db.query("select state from bm_outbox where exposure_id=$1", [
        f.exposure,
      ])
    ).rows[0].state,
    "suppressed",
  );
});
function proof(f, id = randomUUID()) {
  return {
    id,
    path: `${f.user}/${id}`,
    sha256: "a".repeat(64),
    mime: "application/pdf",
    bytes: 8,
    expiresOn: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10),
  };
}
test("replacement proofs are immutable, retain predecessors and do not activate buyer eligibility", async () => {
  const f = await fixture();
  await claim(f);
  await mutate(f, "proof", proof(f));
  await mutate(f, "proof", proof(f), 1);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_proofs where buyer_id=$1",
        [f.buyer],
      )
    ).rows[0].n,
    2,
  );
  await assert.rejects(
    db.query("delete from bm_buyer_proofs where buyer_id=$1", [f.buyer]),
  );
  await assert.rejects(
    db.query("update bm_buyer_proofs set sha256=$1 where buyer_id=$2", [
      "b".repeat(64),
      f.buyer,
    ]),
  );
  assert.equal(
    (await db.query("select status from bm_buyers where id=$1", [f.buyer]))
      .rows[0].status,
    "active",
  );
});
test("foreign proof paths and expired documents cannot commit; statement failure retains revision and audit", async () => {
  const f = await fixture();
  await claim(f);
  await assert.rejects(
    mutate(f, "proof", { ...proof(f), path: `${randomUUID()}/file` }),
  );
  await assert.rejects(
    mutate(f, "proof", { ...proof(f), expiresOn: "2000-01-01" }),
  );
  await assert.rejects(mutate(f, "proof", { ...proof(f), sha256: "invalid" }));
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].revision,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_account_events where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
});
test("personal history includes own responses, offers and messages, never another buyer or private deal fields", async () => {
  const f = await fixture(),
    other = await fixture();
  await claim(f);
  await claim(other);
  await db.query(
    "insert into bm_messages(exposure_id,sender_kind,body) values($1,'buyer','my own response'),($2,'buyer','OTHER BUYER SECRET')",
    [f.exposure, other.exposure],
  );
  await db.query(
    "insert into bm_responses(exposure_id,kind) values($1,'declined')",
    [f.exposure],
  );
  await db.query(
    "insert into bm_offers(exposure_id,amount_cents,terms) values($1,10000,'own terms')",
    [f.exposure],
  );
  const result = (await history(f)).rows[0].result;
  assert.equal(result.length, 1);
  assert.equal(result[0].responses[0].kind, "declined");
  assert.equal(result[0].offers[0].amountCents, 10000);
  assert.match(JSON.stringify(result), /my own response/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /OTHER BUYER|DO NOT EXPOSE|identity_hash|owner_id|token/,
  );
});
test("history excludes undelivered invitations and banned identities", async () => {
  const f = await fixture();
  await claim(f);
  await db.query("update bm_outbox set accepted_at=null where exposure_id=$1", [
    f.exposure,
  ]);
  assert.deepEqual((await history(f)).rows[0].result, []);
  await db.query(
    "update bm_outbox set accepted_at=now() where exposure_id=$1",
    [f.exposure],
  );
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [f.user],
  );
  assert.deepEqual((await history(f)).rows[0].result, []);
});
test("RLS, browser grants, function execution and audit immutability fail closed", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of [
      "bm_buyer_accounts",
      "bm_buyer_account_events",
      "bm_buyer_proofs",
    ])
      await assert.rejects(
        db.query(`select * from ${table}`),
        (e) => e.code === "42501",
      );
    await assert.rejects(
      db.query("select bm_buyer_account_history($1,null,null)", [randomUUID()]),
      (e) => e.code === "42501",
    );
    await db.exec("reset role");
  }
  await assert.rejects(
    db.query("update bm_buyer_account_events set kind='forged'"),
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

test("real PostgreSQL offset cursors load all 29 invitations without loss or duplicates", async () => {
  const f = await fixture();
  await claim(f);
  await db.query(
    `with d as (insert into bm_deals(owner_id,property) select $1,'{}' from generate_series(1,28) returning id)
 insert into bm_exposures(deal_id,buyer_id,owner_id,operation_key,frozen_terms)
 select id,$2,$1,gen_random_uuid(),'{}' from d`,
    [f.user, f.buyer],
  );
  await db.query(
    `insert into bm_outbox(exposure_id,state,accepted_at)
 select id,'accepted',now() from bm_exposures where buyer_id=$1 on conflict(exposure_id) do nothing`,
    [f.buyer],
  );
  await db.exec("set timezone='America/New_York'");
  try {
    const first = (await history(f)).rows[0].result;
    assert.equal(first.length, 26);
    const last = first[24];
    assert.equal(
      buyerAccountInput.safeParse({
        action: "history",
        before: last.createdAt,
        beforeId: last.id,
      }).success,
      true,
    );
    const second = (
      await db.query("select bm_buyer_account_history($1,$2,$3) result", [
        f.user,
        last.createdAt,
        last.id,
      ])
    ).rows[0].result;
    assert.equal(second.length, 4);
    assert.equal(
      new Set([...first.slice(0, 25), ...second].map((row) => row.id)).size,
      29,
    );
  } finally {
    await db.exec("set timezone='UTC'");
  }
});

test("reservation throttles precede file writes, reject malformed input and cannot be reused", async () => {
  const f = await fixture();
  await claim(f);
  const reserve = (p) =>
    db.query("select bm_buyer_account_reserve_proof($1,$2,0,$3)", [
      f.user,
      p.id,
      p,
    ]);
  for (const patch of [
    { mime: null },
    { sha256: null },
    { bytes: null },
    { expiresOn: null },
  ])
    await assert.rejects(reserve({ ...proof(f), ...patch }));
  const first = proof(f);
  await reserve(first);
  await assert.rejects(reserve(first));
  for (let i = 0; i < 4; i++) await reserve(proof(f));
  await assert.rejects(reserve(proof(f)));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_proof_uploads where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    5,
  );
  await assert.rejects(
    db.query("select bm_buyer_account_mutate($1,$2,null,'criteria',$3)", [
      f.user,
      randomUUID(),
      payload(),
    ]),
  );
});

test("only a confirmed active platform owner can review; decisions are immutable and do not activate funds or delivery", async () => {
  const f = await fixture();
  await claim(f);
  const p = proof(f);
  await mutate(f, "proof", p);
  const owner = randomUUID();
  await db.query(
    "insert into auth.users values($1,'housebuyerinv@gmail.com',now(),null)",
    [owner],
  );
  await db.query(
    "insert into account_profiles values($1,'Admin','Active'),($2,'Admin','Active')",
    [owner, f.user],
  );
  const review = (actor, decision = "approved") =>
    db.query("select bm_buyer_proof_review($1,$2,$3)", [actor, p.id, decision]);
  await assert.rejects(review(f.user));
  await review(owner);
  await review(owner);
  await assert.rejects(review(owner, "rejected"));
  await assert.rejects(
    db.query("delete from bm_buyer_proof_reviews where proof_id=$1", [p.id]),
  );
  const b = (
    await db.query(
      "select status,opted_out_at,verification_evidence from bm_buyers where id=$1",
      [f.buyer],
    )
  ).rows[0];
  assert.equal(b.status, "active");
  assert.equal(b.verification_evidence, null);
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [owner],
  );
  await assert.rejects(review(owner));
});

test("restrictive Storage policy blocks inherited broad policies only for the new private bucket", async () => {
  await db.query(
    "insert into storage.objects(bucket_id,name) values('bm-buyer-self-service','private'),('other-bucket','unchanged')",
  );
  await db.exec("set role authenticated");
  try {
    assert.deepEqual(
      (await db.query("select name from storage.objects order by name")).rows,
      [{ name: "unchanged" }],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('bm-buyer-self-service','forged')",
      ),
      (e) => e.code === "42501",
    );
    assert.equal(
      (
        await db.query(
          "update storage.objects set name='forged' where bucket_id='bm-buyer-self-service' returning name",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where bucket_id='bm-buyer-self-service' returning name",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.exec("reset role");
  }
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from storage.objects where name='private'",
      )
    ).rows[0].n,
    1,
  );
});

test("read authorization independently rejects banned and unconfirmed Auth records", async () => {
  const f = await fixture();
  assert.equal(
    (await db.query("select bm_buyer_account_authorized($1) allowed", [f.user]))
      .rows[0].allowed,
    true,
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    f.user,
  ]);
  assert.equal(
    (await db.query("select bm_buyer_account_authorized($1) allowed", [f.user]))
      .rows[0].allowed,
    false,
  );
});

test("new confirmed buyer profile is create-only, pending, synthetic in staging and idempotent", async () => {
  const f = await fixture();
  const hash = randomUUID(),
    key = randomUUID();
  const create = () =>
    db.query("select bm_buyer_account_create($1,$2,$3,$4,'staging',$5)", [
      f.user,
      key,
      hash,
      "SYNTHETIC ENCRYPTED",
      payload(),
    ]);
  await create();
  await create();
  const a = (
    await db.query("select * from bm_buyer_accounts where user_id=$1", [f.user])
  ).rows[0];
  const b = (
    await db.query("select * from bm_buyers where id=$1", [a.buyer_id])
  ).rows[0];
  assert.equal(b.status, "inactive");
  assert.equal(b.synthetic, true);
  assert.equal(b.criteria_verified_at, null);
  assert.notEqual(b.id, f.buyer);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_account_events where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
});

test("create cannot claim, overwrite or merge an existing hash and cannot bypass confirmation", async () => {
  const f = await fixture();
  const before = (
    await db.query("select * from bm_buyers where id=$1", [f.buyer])
  ).rows;
  await assert.rejects(
    db.query("select bm_buyer_account_create($1,$2,$3,'FORGED','staging',$4)", [
      f.user,
      randomUUID(),
      f.hash,
      payload(),
    ]),
  );
  assert.deepEqual(
    (await db.query("select * from bm_buyers where id=$1", [f.buyer])).rows,
    before,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    0,
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    f.user,
  ]);
  await assert.rejects(
    db.query(
      "select bm_buyer_account_create($1,$2,$3,'SYNTHETIC','staging',$4)",
      [f.user, randomUUID(), randomUUID(), payload()],
    ),
  );
});

test("buyer profile mutation retains identity hash and opt-out; stale or forged changes roll back", async () => {
  const f = await fixture();
  await claim(f);
  await mutate(f, "withdraw", {});
  const key = randomUUID(),
    value = {
      name: "Updated synthetic buyer",
      company: "Synthetic LLC",
      phone: "555-222-1234",
    };
  const update = (revision = 1, payload = value) =>
    db.query("select bm_buyer_account_mutate($1,$2,$3,'profile',$4,$5)", [
      f.user,
      key,
      revision,
      payload,
      "SYNTHETIC NEW CIPHERTEXT",
    ]);
  await update();
  await update();
  const b = (await db.query("select * from bm_buyers where id=$1", [f.buyer]))
    .rows[0];
  assert.equal(b.identity_hash, f.hash);
  assert.equal(b.status, "suppressed");
  assert.ok(b.opted_out_at);
  assert.equal(b.identity_ciphertext, "SYNTHETIC NEW CIPHERTEXT");
  await assert.rejects(update(2, { ...value, email: "other@example.invalid" }));
  await assert.rejects(
    db.query("select bm_buyer_account_mutate($1,$2,1,'profile',$3,$4)", [
      f.user,
      randomUUID(),
      value,
      "SYNTHETIC STALE CIPHERTEXT",
    ]),
  );
  assert.equal(
    (
      await db.query(
        "select revision from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].revision,
    2,
  );
});

test("external administrator edits invalidate stale self-service revisions before buyer data can be overwritten", async () => {
  const f = await fixture();
  await claim(f);
  await db.query(
    "update bm_buyers set criteria='{\"minPrice\":777}'::jsonb where id=$1",
    [f.buyer],
  );
  await assert.rejects(mutate(f, "criteria", payload(), 0));
  assert.equal(
    (await db.query("select criteria from bm_buyers where id=$1", [f.buyer]))
      .rows[0].criteria.minPrice,
    777,
  );
});

test("acceptance gate: expired or revoked invitation can remain in own history without permitting a new claim", async () => {
  const f = await fixture();
  await claim(f);
  await db.query(
    "update bm_response_tokens set expires_at=now()-interval '1 day',revoked_at=now() where token_hash=$1",
    [f.hash],
  );
  const items = (await history(f)).rows[0].result;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, f.exposure);
  await assert.rejects(claim(f));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_buyer_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0].n,
    1,
  );
});

test("acceptance gate: personal history uses the authorized invitation property snapshot rather than a later deal edit", async () => {
  const f = await fixture();
  await claim(f);
  const nextDeal = randomUUID(),
    nextExposure = randomUUID();
  await db.query(
    'insert into bm_deals(id,owner_id,property) values($1,$2,\'{"address":"NEW UNINVITED ADDRESS"}\')',
    [nextDeal, f.user],
  );
  await db.query(
    "insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,$6)",
    [
      nextExposure,
      nextDeal,
      f.buyer,
      f.user,
      randomUUID(),
      {
        property: {
          address: "AUTHORIZED SNAPSHOT",
          city: "Sample",
          state: "TX",
        },
      },
    ],
  );
  await db.query(
    "insert into bm_outbox(exposure_id,state,accepted_at) values($1,'accepted',now())",
    [nextExposure],
  );
  const items = (await history(f)).rows[0].result;
  const item = items.find((row) => row.id === nextExposure);
  assert.equal(item.property.address, "AUTHORIZED SNAPSHOT");
  assert.doesNotMatch(JSON.stringify(item), /NEW UNINVITED/);
});

test("acceptance gate: expired proof cannot be approved and rejection preserves immutable file evidence and buyer state", async () => {
  const f = await fixture();
  await claim(f);
  const admin = randomUUID(),
    document = randomUUID();
  await db.query(
    "insert into auth.users values($1,'housebuyerinv@gmail.com',now(),null)",
    [admin],
  );
  await db.query("insert into account_profiles values($1,'Admin','Active')", [
    admin,
  ]);
  await db.query(
    "insert into bm_buyer_proofs(id,buyer_id,storage_path,sha256,mime,bytes,expires_on) values($1,$2,$3,$4,'application/pdf',8,current_date-1)",
    [document, f.buyer, `${f.user}/${document}`, "a".repeat(64)],
  );
  const buyerBefore = (
    await db.query("select * from bm_buyers where id=$1", [f.buyer])
  ).rows;
  const proofBefore = (
    await db.query("select * from bm_buyer_proofs where id=$1", [document])
  ).rows;
  await assert.rejects(
    db.query("select bm_buyer_proof_review($1,$2,'approved')", [
      admin,
      document,
    ]),
  );
  await db.query("select bm_buyer_proof_review($1,$2,'rejected')", [
    admin,
    document,
  ]);
  assert.deepEqual(
    (await db.query("select * from bm_buyer_proofs where id=$1", [document]))
      .rows,
    proofBefore,
  );
  assert.deepEqual(
    (await db.query("select * from bm_buyers where id=$1", [f.buyer])).rows,
    buyerBefore,
  );
  assert.equal(
    (
      await db.query(
        "select decision from bm_buyer_proof_reviews where proof_id=$1",
        [document],
      )
    ).rows[0].decision,
    "rejected",
  );
});
