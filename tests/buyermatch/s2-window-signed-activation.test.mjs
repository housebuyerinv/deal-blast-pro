// LOCAL ONLY: actual signed webhook + real migration SQL in disposable PGlite.
// Every HTTP request is intercepted. No provider credentials or hosted writes.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

import { createCheckout } from "../../server/buyermatch/checkout.js";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`);
// Reuse the existing rehearsal's reviewed migration list, then its corrected wrapper.
const rehearsal = await readFile("tests/buyermatch/database.test.js", "utf8");
const migrationNames = [
  ...rehearsal.matchAll(/"(\d{14}_buyermatch_[^"]+\.sql)"/g),
].map((m) => m[1]);
assert.equal(migrationNames.length, 20);
for (const name of [
  ...migrationNames,
  "20261022141326_buyermatch_owned_subscription_plan_changes.sql",
  "20261023153356_buyermatch_completed_checkout_guards.sql",
])
  await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
await db.exec(`update bm_plans set approved=true,stripe_price_id=case version
  when 'buyermatch-starter-v1' then 'price_local_starter' when 'buyermatch-pro-v1' then 'price_local_pro' end
  where version in ('buyermatch-starter-v1','buyermatch-pro-v1');
  create table local_crm_sentinel(owner_id uuid primary key,plan text,role text);
  insert into local_crm_sentinel values('99999999-9999-4999-8999-999999999999','Pro','Owner');`);

const compiled = await build({
  entryPoints: ["supabase/functions/stripe-webhook/index.ts"],
  bundle: true,
  write: false,
  platform: "neutral",
  format: "esm",
});
const values = {
  SUPABASE_URL: "https://qxhhlprentrufobpcgna.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy-only-service",
  STRIPE_SECRET_KEY: "rk_test_dummy_only",
  STRIPE_WEBHOOK_SECRET: "dummy-only-signature",
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "qxhhlprentrufobpcgna",
  BM_S2_STRIPE_WEBHOOK_ENABLED: "true",
};
const oldDeno = globalThis.Deno;
const realFetch = globalThis.fetch;
const NativeRequest = globalThis.Request,
  NativeResponse = globalThis.Response;
let handler, current, invoiceLookup;
const requests = [];
globalThis.Deno = {
  env: { get: (key) => values[key] },
  serve: (fn) => {
    handler = fn;
  },
};
await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

globalThis.fetch = async (url, options) => {
  requests.push(String(url));
  if (String(url) === "https://api.stripe.com/v1/subscriptions/" + current.id)
    return new NativeResponse(JSON.stringify(current));
  if (
    String(url) ===
    "https://api.stripe.com/v1/invoices/" + current.latest_invoice
  ) {
    if (invoiceLookup instanceof Error) throw invoiceLookup;
    return new NativeResponse(JSON.stringify(invoiceLookup));
  }
  if (
    String(url) ===
    "https://api.stripe.com/v1/prices/" + current.items.data[0].price.id
  )
    return new NativeResponse(
      JSON.stringify({
        livemode: current.livemode,
        active: true,
        currency: "usd",
        unit_amount: 11900,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
    );
  const path = String(url).replace(values.SUPABASE_URL, "");
  const args = JSON.parse(options?.body || "{}");
  try {
    if (path === "/rest/v1/rpc/bm_checkout_event") {
      await db.query("select bm_checkout_event($1,$2,$3,$4)", [
        args.p_id,
        args.p_owner,
        args.p_session,
        args.p_state,
      ]);
    } else if (
      [
        "/rest/v1/rpc/bm_apply_test_billing",
        "/rest/v1/rpc/bm_apply_live_billing",
      ].includes(path)
    ) {
      const mode = path.endsWith("bm_apply_live_billing") ? "live" : "test";
      await db.query(
        `select bm_apply_${mode}_billing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          args.p_checkout,
          args.p_event,
          args.p_created,
          args.p_owner,
          args.p_product,
          args.p_price,
          args.p_subscription,
          args.p_status,
          args.p_start,
          args.p_end,
        ],
      );
    } else throw new Error("Unpermitted local fixture request: " + path);
    return new NativeResponse("null");
  } catch (error) {
    if (/Unpermitted/.test(error.message)) throw error;
    return new NativeResponse(
      JSON.stringify({ code: "local_database_rejected" }),
      { status: 400 },
    );
  }
};

test("actual S2 window → Checkout reservation SQL → signed webhook → Pro activation; all providers intercepted", async (t) => {
  const owner = S2_PRO_OWNER,
    operation = randomUUID();
  let session,
    creates = 0;
  const env = {
    ...values,
    VERCEL_ENV: "preview",
    DBP_REGISTRATION_PAUSED: "true",
    BM_LIVE_BILLING_ENABLED: "false",
    BM_LIVE_DELIVERY_ENABLED: "false",
    BM_CHECKOUT_ENABLED: "true",
    BM_APP_ORIGIN:
      "https://dbp-registration-s2-preview-housebuyerinv.vercel.app",
    BM_S2_BILLING_OWNER_ID: owner,
    BM_S2_BILLING_RUN_ID: randomUUID(),
    BM_S2_BILLING_OPERATIONS: "checkout",
    BM_S2_BILLING_STARTED_AT: new Date(Date.now() - 1000).toISOString(),
    BM_S2_BILLING_EXPIRES_AT: new Date(Date.now() + 60000).toISOString(),
  };
  const client = {
    from(table) {
      const filters = {};
      let patch;
      return {
        select() {
          return this;
        },
        eq(k, v) {
          filters[k] = v;
          return this;
        },
        update(v) {
          patch = v;
          return this;
        },
        async single() {
          assert.equal(table, "bm_plans");
          return {
            data: (
              await db.query(
                "select * from bm_plans where version=$1 and approved=$2",
                [filters.version, filters.approved],
              )
            ).rows[0],
          };
        },
        then(resolve, reject) {
          assert.equal(table, "bm_checkouts");
          return db
            .query(
              "update bm_checkouts set session_id=$1,session_url=$2 where id=$3",
              [patch.session_id, patch.session_url, filters.id],
            )
            .then(() => resolve({ error: null }), reject);
        },
      };
    },
    async rpc(name, a) {
      assert.equal(name, "bm_begin_checkout");
      return {
        data: (
          await db.query("select bm_begin_checkout($1,$2,$3,$4,$5) result", [
            a.p_owner,
            a.p_product,
            a.p_version,
            a.p_key,
            a.p_email,
          ])
        ).rows[0].result,
      };
    },
  };
  const stripe = {
    prices: {
      retrieve: async (id) => ({
        id,
        active: true,
        livemode: false,
        type: "recurring",
        currency: "usd",
        unit_amount: 11900,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
    },
    checkout: {
      sessions: {
        create: async (args) => {
          creates++;
          assert.deepEqual(args.line_items, [
            { price: "price_local_pro", quantity: 1 },
          ]);
          assert.equal(args.client_reference_id, owner);
          assert.equal(args.metadata.dbpS2RunId, env.BM_S2_BILLING_RUN_ID);
          assert.equal(
            args.subscription_data.metadata.dbpS2RunId,
            env.BM_S2_BILLING_RUN_ID,
          );
          session = {
            id: "cs_local_window",
            url: "https://checkout.stripe.com/dummy-only",
            livemode: false,
            status: "open",
            client_reference_id: owner,
            metadata: args.metadata,
          };
          return session;
        },
        retrieve: async () => session,
      },
    },
  };
  const entitlement = async () =>
    (await db.query("select * from bm_entitlements where owner_id=$1", [owner]))
      .rows[0];
  const emit = async ({
    id = randomUUID(),
    unsigned = false,
    wrong = false,
    type = "checkout.session.completed",
    created = 100,
  } = {}) => {
    const body = JSON.stringify({
      id: "evt_" + id,
      type,
      created,
      livemode: false,
      api_version: "2026-09-30.endive",
      data: {
        object:
          type === "checkout.session.completed"
            ? { ...session, subscription: current.id, payment_status: "paid" }
            : { id: "in_late", subscription: current.id },
      },
    });
    const stamp = Math.floor(Date.now() / 1000),
      headers = { "Content-Type": "application/json" };
    if (!unsigned)
      headers["stripe-signature"] = `t=${stamp},v1=${createHmac(
        "sha256",
        wrong ? "wrong-dummy" : values.STRIPE_WEBHOOK_SECRET,
      )
        .update(`${stamp}.${body}`)
        .digest("hex")}`;
    return handler(
      new NativeRequest("https://local.invalid/webhook", {
        method: "POST",
        headers,
        body,
      }),
    );
  };
  try {
    await db.query("insert into auth.users values($1)", [owner]);
    await t.test(
      "foreign fixture rejected before Checkout reservation",
      async () => {
        await assert.rejects(
          createCheckout(
            client,
            { id: randomUUID() },
            "buyermatch-pro-v1",
            operation,
            env,
            stripe,
          ),
          /window/,
        );
        assert.equal(creates, 0);
      },
    );
    await t.test(
      "real Checkout code creates one pending SQL record without entitlement",
      async () => {
        assert.equal(
          (
            await createCheckout(
              client,
              { id: owner, email: "window@example.invalid" },
              "buyermatch-pro-v1",
              operation,
              env,
              stripe,
            )
          ).testMode,
          true,
        );
        assert.equal(creates, 1);
        assert.equal(await entitlement(), undefined);
        assert.equal(
          (
            await db.query(
              "select state,session_id from bm_checkouts where owner_id=$1",
              [owner],
            )
          ).rows[0].state,
          "pending",
        );
      },
    );
    current = {
      id: "sub_window",
      livemode: false,
      status: "active",
      metadata: session.metadata,
      latest_invoice: {
        id: "in_window",
        status: "paid",
        amount_paid: 11900,
        livemode: false,
        parent: { subscription_details: { subscription: "sub_window" } },
      },
      items: {
        data: [
          {
            id: "si_window",
            quantity: 1,
            price: { id: "price_local_pro" },
            current_period_start: 1780000000,
            current_period_end: 1890000000,
          },
        ],
      },
    };
    await t.test(
      "unsigned and incorrectly signed activation denied without provider calls",
      async () => {
        const count = requests.length;
        assert.equal((await emit({ unsigned: true })).status, 400);
        assert.equal((await emit({ wrong: true })).status, 400);
        assert.equal(requests.length, count);
        assert.equal(await entitlement(), undefined);
      },
    );
    const eventId = randomUUID();
    await t.test(
      "signed completion activates 50/25/50 through actual guarded SQL",
      async () => {
        assert.equal((await emit({ id: eventId })).status, 200);
        const e = await entitlement();
        assert.equal(e.status, "active");
        assert.equal(e.allowance, 50);
        assert.deepEqual(
          (
            await db.query(
              "select distribution_allowance,max_distribution_fanout from bm_plans where version=$1",
              [e.plan_version],
            )
          ).rows[0],
          { distribution_allowance: 25, max_distribution_fanout: 50 },
        );
      },
    );
    await t.test(
      "same signed event has one ledger record and unchanged entitlement",
      async () => {
        const before = await entitlement();
        assert.equal((await emit({ id: eventId })).status, 200);
        assert.deepEqual(await entitlement(), before);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from bm_billing_events where owner_id=$1",
              [owner],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "delayed failure reconciles current paid subscription",
      async () => {
        assert.equal(
          (await emit({ type: "invoice.payment_failed", created: 200 })).status,
          200,
        );
        assert.equal((await entitlement()).status, "active");
      },
    );
    await t.test(
      "completed SQL Checkout cannot reopen a purchase",
      async () => {
        await assert.rejects(
          createCheckout(
            client,
            { id: owner, email: "window@example.invalid" },
            "buyermatch-pro-v1",
            operation,
            env,
            stripe,
          ),
          /Checkout/,
        );
        assert.equal(creates, 1);
      },
    );
    await t.test(
      "CRM sentinel unchanged; no identity, delivery or unrelated endpoint used",
      async () => {
        assert.deepEqual(
          (await db.query("select plan,role from local_crm_sentinel")).rows,
          [{ plan: "Pro", role: "Owner" }],
        );
        assert.equal(
          requests.some((path) =>
            /workspace_plan|resend|notification|bm_buyers/.test(path),
          ),
          false,
        );
      },
    );
  } finally {
    globalThis.fetch = realFetch;
    globalThis.Deno = oldDeno;
    await db.close();
  }
});
