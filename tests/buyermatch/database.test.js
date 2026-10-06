import { URL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import commercialPlans from '../../supabase/functions/_shared/buyermatchPlans.json' with { type: 'json' };
const db = new PGlite();
const owner = randomUUID(),
  other = randomUUID(),
  deal = randomUUID();
const property = {
  address: "123 Example",
  state: "TN",
  city: "Memphis",
  zip: "38111",
  assetType: "sfh",
  price: 60000,
};
await db.exec(
  `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`,
);
for (const name of [
  "20260930120000_buyermatch_foundation.sql",
  "20260930130000_buyermatch_workflow.sql",
  "20260930140000_buyermatch_analysis_concurrency.sql",
  "20260930150000_buyermatch_billing.sql",
  "20260930160000_buyermatch_agreements_imports.sql",
  "20260930170000_buyermatch_outbox_claim.sql",
  "20260930180000_buyermatch_document_publishing.sql",
  "20260930190000_buyermatch_reminders.sql",
  "20261001090000_buyermatch_test_commerce_delivery.sql",
  "20261002190115_buyermatch_response_scope.sql",
  "20261003001913_buyermatch_production_outbox.sql",
  "20261005203000_buyermatch_messages.sql",
  "20261006010617_buyermatch_live_billing_boundary.sql",
  "20261006010804_buyermatch_conversation_safety.sql",
  "20261006013219_buyermatch_portal_sync_atomic.sql",
  "20261006013640_buyermatch_software_distribution.sql",
  "20261006030201_buyermatch_usage_accounting.sql",
  "20261006043844_buyermatch_commercial_limits.sql",
  "20261006164348_buyermatch_subscription_plan_changes.sql",
])
  await db.exec(
    readFileSync(
      new URL("../../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
await db.query("insert into auth.users values ($1),($2)", [owner, other]);
await db.query("insert into bm_deals(id,owner_id,property) values($1,$2,$3)", [
  deal,
  owner,
  property,
]);
await db.query(
  "insert into bm_entitlements values($1,'buyermatch','test-v1','active',now()-interval '1 day',now()+interval '30 days',2,null,0)",
  [owner],
);
const commit = (who, key, p = property) =>
  db.query("select bm_commit_analysis($1,$2,$3,$4,$5,$6)", [
    who,
    deal,
    key,
    { matches: [] },
    { score: null },
    p,
  ]);
test("migrations apply; browser roles have no access to network, deals, evidence or RPC", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of [
      "bm_buyers",
      "bm_deals",
      "bm_analyses",
      "bm_exposures",
      "bm_outbox",
      "bm_acceptances",
      "bm_closings",
    ]) {
      const { rows } = await db.query(
        "select has_table_privilege($1,$2,'SELECT') as allowed",
        [role, table],
      );
      assert.equal(rows[0].allowed, false);
    }
    const { rows } = await db.query(
      "select has_function_privilege($1,'bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') as allowed",
      [role],
    );
    assert.equal(rows[0].allowed, false);
  }
  const bucket = await db.query(
    "select public from storage.buckets where id='buyermatch-private'",
  );
  assert.equal(bucket.rows[0].public, false);
});
test("transactional usage rejects cross-user and changed property without charge", async () => {
  await assert.rejects(commit(other, randomUUID()), /Deal not found/);
  await assert.rejects(
    commit(owner, randomUUID(), { ...property, price: 1 }),
    /Deal changed/,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from bm_analyses")).rows[0].n,
    0,
  );
});
test("same operation retries once; quota survives concurrent requests and audit is immutable", async () => {
  const key = randomUUID();
  await Promise.all([commit(owner, key), commit(owner, key)]);
  assert.equal(
    (await db.query("select count(*)::int as n from bm_analyses")).rows[0].n,
    1,
  );
  const results = await Promise.allSettled([
    commit(owner, randomUUID()),
    commit(owner, randomUUID()),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    (await db.query("select count(*)::int as n from bm_analyses")).rows[0].n,
    2,
  );
  await assert.rejects(db.query("delete from bm_analyses"), /Append-only/);
});
test("distribution default denies without attribution, send, or charge", async () => {
  await assert.rejects(
    db.query("select bm_queue_distribution($1,$2,$3)", [
      owner,
      deal,
      randomUUID(),
    ]),
    /Distribution disabled/,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from bm_exposures")).rows[0].n,
    0,
  );
});
test("contract expiration and current agreement checks fail closed", async () => {
  await db.exec(
    "update bm_configuration set distribution_enabled=true,provider_verified=true,permissions_verified=true,agreements_verified=true",
  );
  const key = `${owner}/${deal}/contract.pdf`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('buyermatch-private',$1)",
    [key],
  );
  await db.query(
    "update bm_deals set status='approved_for_distribution',contract_verified=true,admin_approved=true,contract_key=$1,title=$2 where id=$3",
    [
      key,
      {
        company: "Title",
        name: "Agent",
        email: "title@example.com",
        phone: "5555555555",
        eoc: "2020-01-01",
      },
      deal,
    ],
  );
  await assert.rejects(
    db.query("select bm_queue_distribution($1,$2,$3)", [
      owner,
      deal,
      randomUUID(),
    ]),
    /Future EOC/,
  );
  await db.query(
    "update bm_deals set title=jsonb_set(title,'{eoc}',to_jsonb((current_date+30)::text)) where id=$1",
    [deal],
  );
  await db.query(
    "insert into bm_entitlements values($1,'network','network-test','active',now()-interval '1 day',now()+interval '30 days',2,null,0)",
    [owner],
  );
  await assert.rejects(
    db.query("select bm_queue_distribution($1,$2,$3)", [
      owner,
      deal,
      randomUUID(),
    ]),
    /Current agreements/,
  );
});
test("signature or email-open cannot create interest, fee due, or verified closing", async () => {
  await assert.rejects(
    db.query("select bm_admin_progress($1,$2,$3,$4)", [
      owner,
      deal,
      "buyer_interest",
      { signal: "open", exposureId: randomUUID() },
    ]),
    /Actual exposure/,
  );
  await assert.rejects(
    db.query("select bm_admin_progress($1,$2,$3,$4)", [
      owner,
      deal,
      "fee_due",
      { amountCents: 100 },
    ]),
    /Verified settlement/,
  );
  await assert.rejects(
    db.query("select bm_admin_progress($1,$2,$3,$4)", [
      owner,
      deal,
      "closing_verified",
      { settlementKey: "fake" },
    ]),
    /Private settlement/,
  );
});
test.after(() => db.close());

test("approved distribution is idempotent, opt-outs excluded, attribution immutable, send-time suppression enforced", async () => {
  for (const kind of ["network", "fee_schedule", "deal_certification"]) {
    const doc = randomUUID();
    await db.query(
      "insert into bm_documents(id,kind,version,document_hash,content,approved,current) values($1,$2,$3,$4,$5,true,true)",
      [doc, kind, "v1", "hash", "Test fixture only"],
    );
    await db.query("select bm_accept_document($1,$2,$3,$4,$5)", [
      owner,
      deal,
      doc,
      "hash",
      "Test Owner",
    ]);
  }
  await db.query(
    "insert into bm_fee_policies(state,plan_version,version,approved,enabled,formula,document_id) values('TN','network-test','v1',true,false,'{}',(select id from bm_documents where kind='fee_schedule' and current))",
  );
  const recipient = randomUUID(),
    suppressed = randomUUID();
  await db.query(
    "insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria,status,consent_evidence,opted_out_at) values($1,'encrypted','one','{}','active','recorded opt-in',null),($2,'encrypted','two','{}','active','old opt-in',now())",
    [recipient, suppressed],
  );
  await db.query(
    "insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result) values($1,$2,$3,$4,$5)",
    [
      deal,
      owner,
      randomUUID(),
      {
        matches: [
          { buyerId: recipient, eligible: true },
          { buyerId: suppressed, eligible: true },
        ],
      },
      { score: null },
    ],
  );
  const key = randomUUID();
  const call = () =>
    db.query("select bm_queue_distribution($1,$2,$3) as result", [
      owner,
      deal,
      key,
    ]);
  const first = await call();
  const retry = await call();
  assert.equal(first.rows[0].result.requestId, retry.rows[0].result.requestId);
  assert.equal(
    (await db.query("select count(*)::int as n from bm_exposures")).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from bm_outbox where accepted_at is not null",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(db.exec("delete from bm_exposures"), /Append-only/);
  const outbox = (await db.query("select id from bm_outbox")).rows[0].id;
  await db.query("update bm_buyers set opted_out_at=now() where id=$1", [
    recipient,
  ]);
  const claim = await db.query("select bm_claim_outbox($1) as job", [outbox]);
  assert.equal(claim.rows[0].job, null);
  assert.equal(
    (await db.query("select state from bm_outbox where id=$1", [outbox]))
      .rows[0].state,
    "suppressed",
  );
});
test("duplicate import is transactional and never overwrites reviewed buyer", async () => {
  const rows = [
    {
      identity_hash: "import-hash",
      identity_ciphertext: "encrypted",
      criteria: { markets: [] },
      source_ciphertext: "source",
    },
  ];
  await db.query("select bm_import_buyers($1,$2,$3)", [
    owner,
    JSON.stringify(rows),
    1,
  ]);
  await db.query("select bm_import_buyers($1,$2,$3)", [
    owner,
    JSON.stringify(rows),
    1,
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from bm_buyers where identity_hash='import-hash'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from bm_imports")).rows[0].n,
    2,
  );
});
test("approved billing mapping updates only product entitlement and ignores replays and old events", async () => {
  await db.query(
    "insert into bm_plans values('paid-analysis-v1','buyermatch','Test plan',40,'price_test',true)",
  );
  const args = [
    "evt_new",
    200,
    other,
    "buyermatch",
    "price_test",
    "sub_test",
    "active",
    "2026-09-01",
    "2026-11-01",
  ];
  const call = (a) =>
    db.query("select bm_apply_billing($1,$2,$3,$4,$5,$6,$7,$8,$9)", a);
  await call(args);
  await call(args);
  await call([
    "evt_old",
    100,
    ...args.slice(2, 6),
    "inactive",
    ...args.slice(7),
  ]);
  const entitlement = (
    await db.query(
      "select * from bm_entitlements where owner_id=$1 and product='buyermatch'",
      [other],
    )
  ).rows[0];
  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.allowance, 40);
  await assert.rejects(
    call([
      "evt_unknown",
      300,
      owner,
      "network",
      "price_unknown",
      "sub_x",
      "active",
      ...args.slice(7),
    ]),
    /Approved product plan/,
  );
});

test("reminder rows recalculate and reset acknowledgement after extension", async () => {
  const before = (
    await db.query(
      "select due_date from bm_reminders where deal_id=$1 order by day_offset",
      [deal],
    )
  ).rows;
  assert.equal(before.length, 5);
  await db.query(
    "update bm_reminders set acknowledged_at=now() where deal_id=$1",
    [deal],
  );
  await db.query(
    "update bm_deals set title=jsonb_set(title,'{eoc}',to_jsonb((current_date+60)::text)) where id=$1",
    [deal],
  );
  const after = (
    await db.query(
      "select due_date,acknowledged_at from bm_reminders where deal_id=$1 order by day_offset",
      [deal],
    )
  ).rows;
  assert.equal(after.length, 5);
  assert.notEqual(String(after[0].due_date), String(before[0].due_date));
  assert.equal(after[0].acknowledged_at, null);
});
test("publishing document atomically supersedes old version and rejects stale acceptance", async () => {
  await db.query("select bm_publish_document($1,$2,$3,$4,$5)", [
    "privacy",
    "v1",
    "Fixture only",
    "one",
    true,
  ]);
  const old = (
    await db.query("select id from bm_documents where kind='privacy'")
  ).rows[0].id;
  await db.query("select bm_publish_document($1,$2,$3,$4,$5)", [
    "privacy",
    "v2",
    "Fixture two",
    "two",
    true,
  ]);
  await assert.rejects(
    db.query("select bm_accept_document($1,$2,$3,$4,$5)", [
      owner,
      null,
      old,
      "one",
      "Test Owner",
    ]),
    /Current approved/,
  );
  await assert.rejects(
    db.query("update bm_documents set content='changed' where id=$1", [old]),
    /immutable/,
  );
});

async function deliveryFixture() {
  const d = randomUUID(),
    b = randomUUID(),
    ex = randomUUID(),
    o = randomUUID();
  await db.query(
    "insert into bm_deals(id,owner_id,property,status,title,contract_verified,admin_approved) values($1,$2,$3,'distributing',jsonb_build_object('eoc',(current_date+30)::text),true,true)",
    [d, owner, property],
  );
  await db.query(
    "insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria,status,consent_evidence,synthetic) values($1::uuid,'encrypted',$1::text,'{}','active','synthetic consent',true)",
    [b],
  );
  await db.query(
    "insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,$6)",
    [ex, d, b, owner, randomUUID(), { property }],
  );
  await db.query(
    "insert into bm_outbox(id,exposure_id,state) values($1,$2,'pending')",
    [o, ex],
  );
  return { d, b, ex, o };
}
test("outbox lease prevents duplicate claims and refuses ambiguous retries after provider retention window", async () => {
  const { o } = await deliveryFixture();
  const claim = () => db.query("select bm_claim_outbox($1) as result", [o]);
  assert.equal((await claim()).rows[0].result.synthetic, true);
  assert.equal((await claim()).rows[0].result, null);
  await db.query(
    "update bm_outbox set lease_until=null,first_attempt_at=now()-interval '24 hours' where id=$1",
    [o],
  );
  assert.equal((await claim()).rows[0].result, null);
  assert.equal(
    (await db.query("select state from bm_outbox where id=$1", [o])).rows[0]
      .state,
    "reconciliation_required",
  );
});
test("provider callbacks dedupe and cannot manufacture interest; bounce suppresses future deliveries", async () => {
  const { o, b } = await deliveryFixture();
  await db.query(
    "update bm_outbox set accepted_at=now(),provider_message_id=$1,state='accepted' where id=$2",
    [o, o],
  );
  const event = (kind) =>
    db.query("select bm_record_provider_event($1,$2,$3,now()) as result", [
      kind + o,
      o,
      kind,
    ]);
  await event("email.opened");
  assert.equal(
    (await db.query("select last_active_at from bm_buyers where id=$1", [b]))
      .rows[0].last_active_at,
    null,
  );
  await event("email.bounced");
  await event("email.delivered");
  await event("email.delivered");
  assert.equal(
    (await db.query("select state from bm_outbox where id=$1", [o])).rows[0]
      .state,
    "bounced",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from bm_provider_events where outbox_id=$1",
        [o],
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (await db.query("select status from bm_buyers where id=$1", [b])).rows[0]
      .status,
    "suppressed",
  );
  assert.equal(
    (
      await db.query(
        "select bm_record_provider_event('unknown','unknown','email.delivered',now()) as result",
      )
    ).rows[0].result,
    false,
  );
});
test("capability responses require accepted exposure, reject unknown/expired links, dedupe offers and honor unsubscribe", async () => {
  const { d, b, ex, o } = await deliveryFixture();
  const hash = randomUUID();
  await db.query(
    "insert into bm_response_tokens(token_hash,exposure_id,expires_at,revoked_at) values($1,$2,now()+interval '1 day',null)",
    [hash, ex],
  );
  const respond = (kind, key = randomUUID(), token = hash) =>
    db.query("select bm_buyer_response($1,$2,$3,$4,$5)", [
      token,
      key,
      kind,
      6000000,
      "Synthetic terms",
    ]);
  await assert.rejects(respond("offer"), /not accepted/);
  await db.query(
    "update bm_outbox set accepted_at=now(),state='accepted' where id=$1",
    [o],
  );
  await assert.rejects(
    respond("offer", randomUUID(), "unknown"),
    /unavailable/,
  );
  const key = randomUUID();
  await respond("offer", key);
  await respond("offer", key);
  await respond("interested");
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from bm_offers where deal_id=$1",
        [d],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select status from bm_deals where id=$1", [d])).rows[0]
      .status,
    "offer_received",
  );
  await respond("unsubscribe");
  await assert.rejects(respond("declined"), /unavailable/);
  assert.ok(
    (await db.query("select opted_out_at from bm_buyers where id=$1", [b]))
      .rows[0].opted_out_at,
  );
  await db.query(
    "update bm_response_tokens set expires_at=now()-interval '1 second' where token_hash=$1",
    [hash],
  );
  await assert.rejects(respond("offer"), /unavailable/);
});
test("capability scope is immutable, action/environment constrained and semantic replay atomic", async () => {
  const { ex, o, d } = await deliveryFixture();
  const hash = randomUUID();
  await db.query(
    "update bm_outbox set accepted_at=now(),state='accepted' where id=$1",
    [o],
  );
  await db.query(
    "insert into bm_response_tokens(token_hash,exposure_id,expires_at,allowed_actions) values($1,$2,now()+interval '1 day',array['offer'])",
    [hash, ex],
  );
  const respond = (kind = "offer", amount = 6000000, environment = "staging") =>
    db.query("select bm_buyer_response_scoped($1,$2,$3,$4,'QA',$5)", [
      hash,
      randomUUID(),
      kind,
      amount,
      environment,
    ]);
  await assert.rejects(respond("interested"), /unavailable/);
  await assert.rejects(respond("offer", 6000000, "production"), /unavailable/);
  for (const column of [
    "token_hash",
    "exposure_id",
    "capability_id",
    "environment",
    "allowed_actions",
  ]) {
    const value =
      column === "environment"
        ? "'production'"
        : column === "allowed_actions"
          ? "array['interested']"
          : column === "token_hash"
            ? "'altered'"
            : "gen_random_uuid()";
    await assert.rejects(
      db.query(
        `update bm_response_tokens set ${column}=${value} where token_hash=$1`,
        [hash],
      ),
      /immutable/,
    );
  }
  // PGlite schedules these on one connection; real overlapping transactions are
  // separately exercised by the hosted HTTP runner, not claimed by this test.
  await Promise.all(Array.from({ length: 8 }, () => respond()));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_offers where exposure_id=$1",
        [ex],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_responses where exposure_id=$1",
        [ex],
      )
    ).rows[0].n,
    1,
  );
  await respond("offer", 6100000);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_offers where exposure_id=$1",
        [ex],
      )
    ).rows[0].n,
    2,
  );
  await db.query("update bm_deals set status='closed' where id=$1", [d]);
  await respond(); // acknowledgement only; no terminal state regression
  await assert.rejects(respond("offer", 6200000), /unavailable/);
  assert.equal(
    (await db.query("select status from bm_deals where id=$1", [d])).rows[0]
      .status,
    "closed",
  );
  await db.query(
    "update bm_response_tokens set revoked_at=now() where token_hash=$1",
    [hash],
  );
  await assert.rejects(respond(), /unavailable/);
});

test("Production capability consumption rejects synthetic invitations and staging environments", async () => {
  const { ex, o } = await deliveryFixture();
  const hash = randomUUID();
  await db.query(
    "update bm_outbox set accepted_at=now(),state='accepted' where id=$1",
    [o],
  );
  await db.query(
    "insert into bm_response_tokens(token_hash,exposure_id,expires_at,environment) values($1,$2,now()+interval '1 day','production')",
    [hash, ex],
  );
  await assert.rejects(
    db.query(
      "select bm_buyer_response_scoped($1,$2,'offer',6000000,'QA','production')",
      [hash, randomUUID()],
    ),
    /Test capability unavailable/,
  );
  await assert.rejects(
    db.query("select bm_buyer_response($1,$2,'offer',6000000,'QA')", [
      hash,
      randomUUID(),
    ]),
    /unavailable/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_responses where exposure_id=$1",
        [ex],
      )
    ).rows[0].n,
    0,
  );
});

test("Production issuer authorizes immutable scope, leases retries and requires actual receipt before response", async () => {
  const { d, b, ex, o } = await deliveryFixture();
  const hash = "a".repeat(64);
  const claim = (who = owner, dealId = d, exposureId = ex) =>
    db.query("select bm_claim_production_invitation($1,$2,$3,$4) result", [
      who,
      dealId,
      exposureId,
      hash,
    ]);
  await assert.rejects(claim(), /disabled/);
  await db.exec("update bm_production_delivery_config set enabled=true");
  try {
    await assert.rejects(claim(other), /unavailable/);
    await assert.rejects(claim(owner, randomUUID()), /unavailable/);
    await assert.rejects(claim(owner, d, randomUUID()), /unavailable/);
    await assert.rejects(claim(), /Authorized distribution/);
    await db.query(
      "insert into bm_distribution_requests(owner_id,deal_id,operation_key) values($1,$2,$3)",
      [owner, d, randomUUID()],
    );
    await assert.rejects(claim(), /Buyer unavailable/); // synthetic cannot become live
    await db.query("update bm_buyers set synthetic=false where id=$1", [b]);
    await db.query("update bm_deals set status='closed' where id=$1", [d]);
    await assert.rejects(claim(), /Deal unavailable/);
    await db.query("update bm_deals set status='distributing' where id=$1", [
      d,
    ]);
    const claims = await Promise.all(Array.from({ length: 4 }, () => claim()));
    const jobs = claims.map((r) => r.rows[0].result).filter(Boolean);
    assert.equal(jobs.length, 1);
    assert.equal(
      (await db.query("select accepted_at from bm_outbox where id=$1", [o]))
        .rows[0].accepted_at,
      null,
    );
    const respond = () =>
      db.query(
        "select bm_buyer_response_scoped($1,$2,'interested',null,'','production')",
        [hash, randomUUID()],
      );
    await assert.rejects(respond(), /Exposure not accepted/);
    await db.query("select bm_retry_production_invitation($1,$2)", [
      o,
      jobs[0].leaseId,
    ]);
    const retry = (await claim()).rows[0].result;
    assert.notEqual(retry.leaseId, jobs[0].leaseId);
    assert.equal(
      (
        await db.query(
          "select bm_finish_production_invitation($1,$2,'receipt-stale') result",
          [o, jobs[0].leaseId],
        )
      ).rows[0].result,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select bm_finish_production_invitation($1,$2,'receipt-production-fixture') result",
          [o, retry.leaseId],
        )
      ).rows[0].result,
      true,
    );
    await respond();
    assert.equal((await claim()).rows[0].result, null);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from bm_response_tokens where exposure_id=$1",
          [ex],
        )
      ).rows[0].n,
      1,
    );
    await db.query(
      "update bm_response_tokens set revoked_at=now() where exposure_id=$1",
      [ex],
    );
    await assert.rejects(claim(), /Capability unavailable/);
    await assert.rejects(respond(), /unavailable/);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'bm_claim_production_invitation(uuid,uuid,uuid,text)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
  } finally {
    await db.exec("update bm_production_delivery_config set enabled=false");
  }
});

test("admin merge preserves optout and immutable exposure attribution; distinct review is audited", async () => {
  const source = randomUUID(),
    target = randomUUID();
  await db.query(
    "insert into bm_buyers(id,identity_hash,identity_ciphertext,criteria,opted_out_at) values($1::uuid,$1::text,'encrypted','{}',now()),($2::uuid,$2::text,'encrypted','{}',null)",
    [source, target],
  );
  await db.query(
    "select bm_review_duplicate($1,$2,$3,'distinct','Different principals')",
    [owner, source, target],
  );
  await db.query(
    "select bm_review_duplicate($1,$2,$3,'merge','Confirmed same entity')",
    [owner, source, target],
  );
  assert.equal(
    (await db.query("select merged_into from bm_buyers where id=$1", [source]))
      .rows[0].merged_into,
    target,
  );
  assert.equal(
    (await db.query("select status from bm_buyers where id=$1", [target]))
      .rows[0].status,
    "suppressed",
  );
  await assert.rejects(
    db.exec("delete from bm_duplicate_reviews"),
    /Append-only/,
  );
  const { b } = await deliveryFixture();
  await assert.rejects(
    db.query("select bm_review_duplicate($1,$2,$3,'merge','same company')", [
      owner,
      b,
      target,
    ]),
    /attribution reconciliation/,
  );
});
test("closing tracks selection, signature, title, scheduling and settlement separately; success fees cannot be enabled", async () => {
  const { d, ex, o } = await deliveryFixture();
  await db.query(
    "update bm_outbox set accepted_at=now(),state='accepted' where id=$1",
    [o],
  );
  const progress = (kind, evidence = {}) =>
    db.query("select bm_admin_progress($1,$2,$3,$4)", [
      owner,
      d,
      kind,
      evidence,
    ]);
  await progress("buyer_selected", { exposureId: ex });
  await progress("title_open");
  await progress("closing_scheduled", { date: "2027-01-01" });
  await assert.rejects(
    progress("title_acknowledged", { reference: "fixture" }),
    /signature/,
  );
  const doc = randomUUID();
  await db.query(
    "insert into bm_documents(id,kind,version,document_hash,content,approved,current) values($1,'closing_authorization','close-v1','hash','SYNTHETIC',true,true)",
    [doc],
  );
  await db.query("select bm_accept_document($1,$2,$3,$4,$5)", [
    owner,
    d,
    doc,
    "hash",
    "Test Owner",
  ]);
  assert.equal(
    (
      await db.query(
        "select title_acknowledged_at from bm_closings where deal_id=$1",
        [d],
      )
    ).rows[0].title_acknowledged_at,
    null,
  );
  await progress("title_acknowledged", {
    reference: "Synthetic title acknowledgement",
  });
  const settlement = `${owner}/${d}/settlement.pdf`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('buyermatch-private',$1)",
    [settlement],
  );
  await progress("closing_verified", { settlementKey: settlement });
  const closing = (
    await db.query("select * from bm_closings where deal_id=$1", [d])
  ).rows[0];
  assert.ok(closing.verified_at);
  assert.ok(closing.user_signed_at);
  assert.ok(closing.title_acknowledged_at);
  assert.equal(closing.paid_at, null);
  await assert.rejects(
    progress("buyer_interest", { exposureId: ex, signal: "reply" }),
    /regress/,
  );
  await assert.rejects(
    progress("fee_due", { amountCents: 100 }),
    /enabled fees/,
  );
  await assert.rejects(
    db.exec("update bm_configuration set success_fees_enabled=true"),
    /bm_fees_remain_disabled/,
  );
});
test('approved plan changes require the original owner and an already bound subscription', async () => {
 const who=randomUUID(),foreign=randomUUID(),checkout=randomUUID();
 await db.query('insert into auth.users(id) values($1),($2)',[who,foreign]);
 await db.query("insert into bm_plans(version,product,label,allowance,stripe_price_id,approved) values ('change-a','buyermatch','A',20,'price_change_a',true),('change-b','buyermatch','B',50,'price_change_b',true),('change-no','buyermatch','Unapproved',50,'price_change_no',false)");
 await db.query("insert into bm_checkouts(id,owner_id,product,plan_version,operation_key,email,session_id,state) values($1,$2,'buyermatch','change-a',$3,'synthetic@example.invalid','cs_change','completed')",[checkout,who,randomUUID()]);
 const apply=(price,event,sub='sub_change',user=who)=>db.query("select bm_apply_test_billing($1,$2,600,$3,'buyermatch',$4,$5,'active',now(),now()+interval '30 days')",[checkout,event,user,price,sub]);
 await assert.rejects(apply('price_change_b','premature'),/Server checkout/);
 await apply('price_change_a','initial_change');
 await apply('price_change_b','upgrade_change');
 assert.equal((await db.query('select allowance from bm_entitlements where owner_id=$1',[who])).rows[0].allowance,50);
 await assert.rejects(apply('price_change_b','foreign_change','sub_change',foreign),/Server checkout/);
 await assert.rejects(apply('price_change_b','foreign_sub','sub_other'),/Server checkout/);
 await assert.rejects(apply('price_change_no','unapproved_change'),/Server checkout/);
 await Promise.all([apply('price_change_a','downgrade_change'),apply('price_change_a','downgrade_change')]);
 assert.equal((await db.query('select allowance from bm_entitlements where owner_id=$1',[who])).rows[0].allowance,20);
 assert.equal((await db.query("select count(*)::int as n from bm_billing_events where event_id='downgrade_change'")).rows[0].n,1);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
});

test("checkout reservations are durable and billing cannot attach a foreign checkout", async () => {
  const key = randomUUID();
  const reserve = () =>
    db.query(
      "select bm_begin_checkout($1,'buyermatch','paid-analysis-v1',$2,'test@example.invalid') as result",
      [owner, key],
    );
  const c = (await reserve()).rows[0].result;
  assert.equal((await reserve()).rows[0].result.id, c.id);
  await assert.rejects(
    db.query(
      "select bm_apply_test_billing($1,'foreign',400,$2,'buyermatch','price_test','sub_test','active',now(),now()+interval '30 days')",
      [c.id, other],
    ),
    /Server checkout/,
  );
  await db.query("select bm_checkout_event($1,$2,'cs_test','completed')", [
    c.id,
    owner,
  ]);
  await db.query("select bm_checkout_event($1,$2,'cs_test','expired')", [
    c.id,
    owner,
  ]);
  assert.equal(
    (await db.query("select state from bm_checkouts where id=$1", [c.id]))
      .rows[0].state,
    "completed",
  );
});

test("atomic edits reject terminal rows and stale contract evidence; existing paid subscriptions cannot be duplicated", async () => {
  const { d } = await deliveryFixture();
  const key = `${owner}/${d}/review.pdf`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('buyermatch-private',$1)",
    [key],
  );
  await db.query("update bm_deals set contract_key=$1 where id=$2", [key, d]);
  const snapshot = (
    await db.query("select title,property from bm_deals where id=$1", [d])
  ).rows[0];
  await assert.rejects(
    db.query("select bm_edit_deal($1,$2,$3,$4)", [
      other,
      d,
      "title",
      snapshot.title,
    ]),
    /not found/,
  );
  await assert.rejects(
    db.query("select bm_review_contract($1,$2,$3,$4,$5)", [
      owner,
      d,
      key,
      snapshot.title,
      { ...snapshot.property, price: 1 },
    ]),
    /Deal changed/,
  );
  await db.query("select bm_review_contract($1,$2,$3,$4,$5)", [
    owner,
    d,
    key,
    snapshot.title,
    snapshot.property,
  ]);
  assert.equal(
    (await db.query("select status from bm_deals where id=$1", [d])).rows[0]
      .status,
    "distributing",
  );
  await db.query("update bm_deals set status='closed' where id=$1", [d]);
  await assert.rejects(
    db.query("select bm_edit_deal($1,$2,$3,$4)", [
      owner,
      d,
      "title",
      snapshot.title,
    ]),
    /Terminal/,
  );
  await assert.rejects(
    db.query("select bm_review_contract($1,$2,$3,$4,$5)", [
      owner,
      d,
      key,
      snapshot.title,
      snapshot.property,
    ]),
    /unavailable/,
  );
  await db.query(
    "update bm_entitlements set status='inactive' where owner_id=$1 and product='buyermatch'",
    [other],
  );
  await assert.rejects(
    db.query(
      "select bm_begin_checkout($1,'buyermatch','paid-analysis-v1',$2,'qa@example.invalid')",
      [other, randomUUID()],
    ),
    /Existing subscription/,
  );
  for (const name of [
    "bm_edit_deal(uuid,uuid,text,jsonb)",
    "bm_review_contract(uuid,uuid,text,jsonb,jsonb)",
  ])
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('authenticated',$1,'EXECUTE') as allowed",
          [name],
        )
      ).rows[0].allowed,
      false,
    );
});


test('portal draft retries create one record per owner and submission', async () => {
 const sourceSubmissionId=randomUUID();
 const create=(who)=>db.query('select bm_create_draft($1,$2) id',[who,{...property,sourceSubmissionId}]);
 const results=await Promise.all(Array.from({length:4},()=>create(owner)));
 assert.equal(new Set(results.map(r=>r.rows[0].id)).size,1);
 assert.notEqual((await create(other)).rows[0].id,results[0].rows[0].id);
});

test('conversation acceptance, prior interest, replay, suppression and privacy are enforced in SQL', async () => {
 const {d,b,ex,o}=await deliveryFixture();const hash=randomUUID();const key=randomUUID();
 await db.query("insert into bm_response_tokens(token_hash,exposure_id,expires_at) values($1,$2,now()+interval '1 day')",[hash,ex]);
 const send=()=>db.query("select bm_buyer_message_scoped($1,$2,'Synthetic question','staging')",[hash,key]);
 const view=()=>db.query("select bm_buyer_conversation($1,'staging') value",[hash]);
 await assert.rejects(send(),/accepted/);await assert.rejects(view(),/Exposure/);
 await db.query("update bm_outbox set accepted_at=now(),state='accepted' where id=$1",[o]);
 await assert.rejects(send(),/interest/);
 await db.query("select bm_buyer_response_scoped($1,$2,'interested',null,'','staging')",[hash,randomUUID()]);
 await Promise.all([send(),send(),send()]);
 const ownerKey=randomUUID();const reply=()=>db.query("select bm_owner_message($1,$2,$3,$4,'Synthetic reply')",[owner,d,ex,ownerKey]);
 await Promise.all([reply(),reply()]);
 assert.equal((await db.query('select count(*)::int n from bm_messages where deal_id=$1',[d])).rows[0].n,2);
 const data=(await view()).rows[0].value;
 assert.equal(data.messages.length,2);assert.deepEqual(Object.keys(data).sort(),['address','city','messages','state']);
 assert.equal(JSON.stringify(data).includes(b),false);
 await assert.rejects(db.query("select bm_owner_message($1,$2,$3,$4,'Other')",[other,d,ex,randomUUID()]),/Deal/);
 await assert.rejects(db.query("select bm_buyer_message_scoped($1,$2,'Other','production')",[hash,randomUUID()]),/unavailable/);
 await db.query("update bm_buyers set status='suppressed',opted_out_at=now() where id=$1",[b]);
 await assert.rejects(send(),/unavailable/);await assert.rejects(reply(),/unavailable/);await assert.rejects(view(),/unavailable/);
});

test('new billing and conversation objects remain private and live billing defaults off', async () => {
 const config=(await db.query('select enabled,verified from bm_live_billing_config')).rows[0];
 assert.deepEqual(config,{enabled:false,verified:false});
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query("select has_table_privilege($1,'bm_messages','SELECT') allowed",[role])).rows[0].allowed,false);
  for(const fn of ['bm_owner_message(uuid,uuid,uuid,uuid,text)','bm_buyer_conversation(text,text)','bm_create_draft(uuid,jsonb)','bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)'])
   assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
 }
 await assert.rejects(db.query("select bm_apply_live_billing($1,'evt',1,$2,'buyermatch','price','sub','active',now(),now()+interval '1 month')",[randomUUID(),owner]),/disabled/);
});


test('portal buyer approval retries preserve one identity, unverified status, suppression and audit', async () => {
 const hash=randomUUID(), key=randomUUID();const value={identity_hash:hash,identity_ciphertext:'encrypted synthetic identity',criteria:{markets:['TN']},consent_evidence:'SYNTHETIC',source_ciphertext:'encrypted source',synthetic:true};
 const sync=()=>db.query('select bm_sync_portal_buyer($1,$2,$3) result',[owner,key,value]);
 const results=await Promise.all([sync(),sync(),sync()]);
 assert.equal(new Set(results.map(r=>r.rows[0].result.id)).size,1);
 const id=results[0].rows[0].result.id;
 const row=(await db.query('select verification_level,status,synthetic from bm_buyers where id=$1',[id])).rows[0];
 assert.deepEqual(row,{verification_level:'unverified',status:'active',synthetic:true});
 assert.equal((await db.query("select count(*)::int n from bm_imports where summary->>'buyerId'=$1",[id])).rows[0].n,1);
 await db.query("update bm_buyers set status='suppressed',opted_out_at=now() where id=$1",[id]);
 assert.equal((await sync()).rows[0].result.synced,false);
 assert.equal((await db.query('select status from bm_buyers where id=$1',[id])).rows[0].status,'suppressed');
 for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'bm_sync_portal_buyer(uuid,uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
});

test('software distribution needs no network subscription or fee agreement; managed distribution still does', async () => {
 await db.query("insert into bm_plans(version,product,label,allowance,distribution_allowance,max_distribution_fanout) values('software-v1','buyermatch','Synthetic',5,5,3)");
 const who=randomUUID(), d=randomUUID(), buyer=randomUUID(), buyer2=randomUUID(), buyer3=randomUUID();
 await db.query('insert into auth.users values($1)',[who]);
 await db.query("insert into bm_entitlements values($1,'buyermatch','software-v1','active',now()-interval '1 day',now()+interval '30 days',5,null,0)",[who]);
 const contract=`${who}/${d}/contract.pdf`;
 await db.query("insert into storage.objects(bucket_id,name) values('buyermatch-private',$1)",[contract]);
 await db.query("insert into bm_deals(id,owner_id,property,title,status,contract_verified,admin_approved,contract_key) values($1,$2,$3,$4,'approved_for_distribution',true,true,$5)",[d,who,{...property,serviceType:'software'},{company:'Synthetic Title',name:'Agent',email:'title@example.invalid',phone:'5555555555',eoc:'2099-01-01'},contract]);
 for (const recipient of [buyer,buyer2,buyer3]) await db.query("insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria,status,consent_evidence,synthetic) values($1,'encrypted',$2,'{}','active','SYNTHETIC CONSENT',true)",[recipient,randomUUID()]);
 for(const kind of ['network','deal_certification']) {
  const doc=(await db.query('select id,document_hash from bm_documents where kind=$1 and current and approved limit 1',[kind])).rows[0];
  await db.query('select bm_accept_document($1,$2,$3,$4,$5)',[who,d,doc.id,doc.document_hash,'Synthetic Owner']);
 }
 await db.query('insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result) values($1,$2,$3,$4,$5)',[d,who,randomUUID(),{matches:[buyer,buyer2,buyer3].map(buyerId=>({buyerId,eligible:true}))},{}]);
 const key=randomUUID(), queue=()=>db.query('select bm_queue_distribution($1,$2,$3) value',[who,d,key]);
 const results=await Promise.all([queue(),queue(),queue()]);
 assert.equal(new Set(results.map(r=>r.rows[0].value.requestId)).size,1);
 const exposures=(await db.query('select frozen_terms from bm_exposures where deal_id=$1',[d])).rows;
 assert.equal(exposures.length,3);assert.equal(exposures[0].frozen_terms.serviceType,'software');assert.equal(exposures[0].frozen_terms.policy.enabled,false);
 assert.equal(exposures[0].frozen_terms.acceptances.some(a=>a.kind==='fee_schedule'),false);
 const managed=randomUUID();
 await db.query("insert into bm_deals(id,owner_id,property,title,status,contract_verified,admin_approved,contract_key) select $1,owner_id,jsonb_set(property,'{serviceType}','\"managed_dispo\"'),title,'approved_for_distribution',true,true,contract_key from bm_deals where id=$2",[managed,d]);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,managed,randomUUID()]),/entitlement/);
 await db.query("insert into bm_entitlements values($1,'network','network-v1','active',now()-interval '1 day',now()+interval '30 days',5,null,0)",[who]);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,managed,randomUUID()]),/agreements/);
 assert.equal((await db.query('select count(*)::int n from bm_outbox o join bm_exposures e on e.id=o.exposure_id where e.deal_id=$1 and o.accepted_at is not null',[d])).rows[0].n,0);
 const usage=(await db.query('select bm_account_usage($1) value',[who])).rows[0].value;
 assert.equal(usage.analysis.used,1);assert.equal(usage.softwareDistribution.used,1);assert.equal(usage.softwareDistribution.remaining,4);assert.equal(usage.managedDispo.used,0);
 const metrics=(await db.query('select bm_operating_metrics($1) value',[who])).rows[0].value;
 assert.equal(metrics.softwareExposures,3);assert.deepEqual(metrics.softwareFanout,{average:3,median:3,minimum:3,maximum:3});
 assert.equal(metrics.retryAttempts,0);assert.equal(metrics.deduplicatedOrRejectedAttempts,null);
 assert.equal(JSON.stringify(usage).includes(buyer),false);
 // Complete a Managed Dispo request for the SAME account; neither counter contaminates the other.
 for(const kind of ['network','deal_certification','fee_schedule']) {
  const doc=(await db.query('select id,document_hash from bm_documents where kind=$1 and current and approved limit 1',[kind])).rows[0];
  await db.query('select bm_accept_document($1,$2,$3,$4,$5)',[who,managed,doc.id,doc.document_hash,'Synthetic Owner']);
 }
 await db.query("insert into bm_fee_policies(state,plan_version,version,approved,enabled,formula,document_id) values('TN','network-v1','mixed-v1',true,false,'{}',(select id from bm_documents where kind='fee_schedule' and current and approved limit 1))");
 await db.query('insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result) values($1,$2,$3,$4,$5)',[managed,who,randomUUID(),{matches:[{buyerId:buyer,eligible:true}]},{}]);
 await db.query('select bm_queue_distribution($1,$2,$3)',[who,managed,randomUUID()]);
 const mixed=(await db.query('select bm_account_usage($1) value',[who])).rows[0].value;
 assert.equal(mixed.softwareDistribution.used,1);assert.equal(mixed.managedDispo.used,1);
 const emptyDeal=randomUUID();
 await db.query("insert into bm_deals(id,owner_id,property,title,status,contract_verified,admin_approved,contract_key) select $1,owner_id,property,title,'approved_for_distribution',true,true,contract_key from bm_deals where id=$2",[emptyDeal,d]);
 for(const kind of ['network','deal_certification']) {
  const doc=(await db.query('select id,document_hash from bm_documents where kind=$1 and current and approved limit 1',[kind])).rows[0];
  await db.query('select bm_accept_document($1,$2,$3,$4,$5)',[who,emptyDeal,doc.id,doc.document_hash,'Synthetic Owner']);
 }
 await db.query('insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result) values($1,$2,$3,$4,$5)',[emptyDeal,who,randomUUID(),{matches:[]},{}]);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,emptyDeal,randomUUID()]),/No consented/);
 assert.equal((await db.query('select count(*)::int n from bm_distribution_requests where deal_id=$1',[emptyDeal])).rows[0].n,0,'failed reservation rolls back attribution and usage');
 await db.query("update bm_deals set status='closed',property=jsonb_set(property,'{serviceType}','\"managed_dispo\"') where id=$1",[d]);
 assert.equal((await db.query('select bm_account_usage($1) value',[who])).rows[0].value.softwareDistribution.used,1,'frozen usage survives mutable deal changes');
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,d,randomUUID()]),/Contract review/);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[other,d,randomUUID()]),/Deal not found/);
 await db.query("update bm_entitlements set status='inactive' where owner_id=$1 and product='buyermatch'",[who]);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,emptyDeal,randomUUID()]),/entitlement/);
 const inactive=(await db.query('select bm_account_usage($1) value',[who])).rows[0].value;
 assert.equal(inactive.analysis.active,false);assert.equal(inactive.softwareDistribution.remaining,0);assert.equal(inactive.softwareDistribution.used,1);
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query("select has_table_privilege($1,'bm_distribution_usage','SELECT') allowed",[role])).rows[0].allowed,false);
  for(const fn of ['bm_account_usage(uuid)','bm_operating_metrics(uuid)']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
 }
});


// Commercial fixtures remain local: no provider calls or paid entitlements.
async function commercialOwner(plan) {
 const who=randomUUID();await db.query('insert into auth.users values($1)',[who]);
 await db.query("insert into bm_entitlements values($1,'buyermatch',$2,'active',now()-interval '1 day',now()+interval '30 days',$3,null,0)",[who,plan.version,plan.analysisAllowance]);
 return who;
}
async function commercialDeal(who,matches) {
 const id=randomUUID(),contract=`${who}/${id}/contract.pdf`;
 await db.query("insert into storage.objects(bucket_id,name) values('buyermatch-private',$1)",[contract]);
 await db.query("insert into bm_deals(id,owner_id,property,title,status,contract_verified,admin_approved,contract_key,updated_at) values($1,$2,$3,$4,'approved_for_distribution',true,true,$5,now()-interval '3 hours')",[id,who,{...property,serviceType:'software'},{company:'Synthetic',name:'Synthetic',email:'test@example.invalid',phone:'5555555555',eoc:'2099-01-01'},contract]);
 for(const kind of ['network','deal_certification']) {
  const doc=(await db.query('select id,document_hash from bm_documents where kind=$1 and current and approved limit 1',[kind])).rows[0];
  await db.query('select bm_accept_document($1,$2,$3,$4,$5)',[who,id,doc.id,doc.document_hash,'Synthetic Owner']);
 }
 await db.query("insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result,created_at) values($1,$2,$3,$4,'{}',now()-interval '2 hours')",[id,who,randomUUID(),{matches}]);
 return id;
}
async function rankedBuyers() {
 const matches=[];
 for(let i=0;i<103;i++) {
  const buyerId=randomUUID();
  await db.query("insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria,status,consent_evidence,synthetic) values($1,'encrypted',$2,'{}',$3,$4,true)",[buyerId,randomUUID(),i===101?'suppressed':'active',i===102?'':'SYNTHETIC']);
  matches.push({buyerId,eligible:i!==100,score:Math.floor(i/2),confidence:i%2?95:90});
 }
 return matches;
}
for(const plan of commercialPlans) test(`${plan.name}: hard fanout, deterministic strongest buyers, retries, concurrency and monthly boundary`,async()=>{
 const stored=(await db.query('select * from bm_plans where version=$1',[plan.version])).rows[0];
 assert.equal(stored.allowance,plan.analysisAllowance);assert.equal(stored.distribution_allowance,plan.distributionAllowance);assert.equal(stored.max_distribution_fanout,plan.maxDistributionFanout);
 assert.equal(stored.approved,false);assert.equal(stored.stripe_price_id,null);
 const who=await commercialOwner(plan), matches=await rankedBuyers(), id=await commercialDeal(who,matches), key=randomUUID();
 const queue=()=>db.query('select bm_queue_distribution($1,$2,$3) result',[who,id,key]);
 const attempts=await Promise.all(Array.from({length:8},queue));
 assert.equal(new Set(attempts.map(r=>r.rows[0].result.requestId)).size,1);
 await queue();
 const actual=(await db.query('select buyer_id,frozen_terms from bm_exposures where deal_id=$1 order by buyer_id',[id])).rows;
 const expected=matches.slice(0,100).sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.buyerId.localeCompare(b.buyerId)).slice(0,plan.maxDistributionFanout).map(m=>m.buyerId).sort();
 assert.deepEqual(actual.map(x=>x.buyer_id),expected);
 assert.ok(actual.every(x=>x.frozen_terms.allowedFanout===plan.maxDistributionFanout && x.frozen_terms.planVersion===plan.version));
 const frozen=(await db.query('select service_type,plan_version,allowed_fanout,operation_key,created_at from bm_distribution_requests where deal_id=$1',[id])).rows[0];
 assert.equal(frozen.plan_version,plan.version);assert.equal(frozen.allowed_fanout,plan.maxDistributionFanout);assert.equal(frozen.operation_key,key);assert.ok(frozen.created_at);
 const usage=(await db.query('select bm_account_usage($1) u',[who])).rows[0].u;
 assert.equal(usage.softwareDistribution.used,1);assert.equal(usage.softwareDistribution.remaining,plan.distributionAllowance-1);assert.equal(usage.softwareDistribution.invitations,plan.maxDistributionFanout);assert.equal(usage.managedDispo.used,0);
 assert.ok(matches.every(m=>!JSON.stringify(usage).includes(m.buyerId)));
 assert.equal((await db.query('select count(*)::int n from bm_outbox o join bm_exposures e on e.id=o.exposure_id where e.deal_id=$1',[id])).rows[0].n,plan.maxDistributionFanout);
 for(let i=1;i<plan.distributionAllowance;i++) {
  const next=await commercialDeal(who,matches);
  await db.query('select bm_queue_distribution($1,$2,$3)',[who,next,randomUUID()]);
 }
 const over=await commercialDeal(who,matches);
 const denied=await Promise.allSettled(Array.from({length:4},()=>db.query('select bm_queue_distribution($1,$2,$3)',[who,over,randomUUID()])));
 assert.ok(denied.every(x=>x.status==='rejected'&&/allowance exhausted/.test(x.reason.message)));
 assert.equal((await db.query('select count(*)::int n from bm_exposures where deal_id=$1',[over])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from bm_distribution_requests where deal_id=$1',[over])).rows[0].n,0);
 const exhausted=(await db.query('select bm_account_usage($1) u',[who])).rows[0].u;
 assert.equal(exhausted.softwareDistribution.used,plan.distributionAllowance);assert.equal(exhausted.softwareDistribution.remaining,0);
 assert.ok(exhausted.analysis.remaining>0);
 await db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',[who,over,randomUUID(),{matches},{},{...property,serviceType:'software'}]);
 await assert.rejects(db.query('update bm_distribution_requests set allowed_fanout=999 where deal_id=$1',[id]),/Append-only audit record/);
});

for(const plan of commercialPlans) test(`${plan.name}: exact analysis allowance rejects next operation independently`,async()=>{
 const who=await commercialOwner(plan), id=randomUUID();
 await db.query('insert into bm_deals(id,owner_id,property) values($1,$2,$3)',[id,who,property]);
 for(let i=0;i<plan.analysisAllowance-1;i++) await db.query("insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result,created_at) values($1,$2,$3,'{}','{}',now()-interval '2 hours')",[id,who,randomUUID()]);
 const args=[who,id,randomUUID(),{}, {},property];
 await db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',args);
 await db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',args);
 await assert.rejects(db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',[who,id,randomUUID(),{},{},property]),/Analysis allowance exhausted/);
 const usage=(await db.query('select bm_account_usage($1) u',[who])).rows[0].u;
 assert.equal(usage.analysis.used,plan.analysisAllowance);assert.equal(usage.softwareDistribution.used,0);
});

test('effective upgrades/downgrades affect only future distribution; missing/expired/canceled/unknown plans fail closed',async()=>{
 const who=await commercialOwner(commercialPlans[0]),matches=await rankedBuyers(),history=[];
 for(const plan of [commercialPlans[0],commercialPlans[1],commercialPlans[0]]) {
  await db.query("update bm_entitlements set plan_version=$2,allowance=$3 where owner_id=$1 and product='buyermatch'",[who,plan.version,plan.analysisAllowance]);
  const id=await commercialDeal(who,matches),key=randomUUID();
  await db.query('select bm_queue_distribution($1,$2,$3)',[who,id,key]);history.push({id,key,cap:plan.maxDistributionFanout});
  for(const prior of history) {
   await db.query('select bm_queue_distribution($1,$2,$3)',[who,prior.id,prior.key]);
   assert.equal((await db.query('select count(*)::int n from bm_exposures where deal_id=$1',[prior.id])).rows[0].n,prior.cap);
   assert.equal((await db.query('select allowed_fanout from bm_distribution_requests where deal_id=$1',[prior.id])).rows[0].allowed_fanout,prior.cap);
  }
 }
 const id=await commercialDeal(who,matches);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[other,id,randomUUID()]),/Deal not found/);
 for(const change of ["status='inactive'","status='active',period_end=now()-interval '1 second'","period_end=now()+interval '1 day',plan_version='missing-plan'"]) {
  await db.query(`update bm_entitlements set ${change} where owner_id=$1 and product='buyermatch'`,[who]);
  await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,id,randomUUID()]),/entitlement required|limits unavailable/);
 }
 await db.query("delete from bm_entitlements where owner_id=$1",[who]);
 await assert.rejects(db.query('select bm_queue_distribution($1,$2,$3)',[who,id,randomUUID()]),/entitlement required/);
 assert.equal((await db.query('select count(*)::int n from bm_exposures where deal_id=$1',[id])).rows[0].n,0);
});
