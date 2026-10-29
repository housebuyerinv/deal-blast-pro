// Real isolated local HTTP acceptance. No hosted URLs, dotenv, Stripe or delivery.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { localEnvironment } from "./local-full-stack-runtime.mjs";
const { env, privateValues } = localEnvironment();
const origin = env.PUBLIC_APP_URL,
  url = env.SUPABASE_URL;
const db = new Client({
  host: "127.0.0.1",
  port: 55322,
  user: "postgres",
  database: "postgres",
  password: env.BM_LOCAL_DATABASE_PASSWORD,
});
const client = () =>
  createClient(url, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const results = [];
const users = {};
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({
      name,
      status: "FAIL",
      reason: e.message.replace(/eyJ\S+/g, "[redacted]").slice(0, 250),
    });
    console.log("FAIL " + name);
    throw e;
  }
}
async function request(route, token, input, expected = 200) {
  const r = await fetch(origin + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const value = await r.json();
  assert.equal(
    r.status,
    expected,
    `${route} ${input.action || input.kind}: HTTP ${r.status} expected ${expected}`,
  );
  return value;
}
const buyer = (who, input, status) =>
  request("/api/buyermatch-buyer", users[who]?.token, input, status);
const api = (who, input, status) =>
  request("/api/buyermatch", users[who]?.token, input, status);
const criteria = {
  markets: [{ state: "TX", city: "Austin" }],
  assetTypes: ["sfh"],
  maxPrice: 150000,
  maxArvRatio: 0.7,
};
const property = {
  address: "100 SYNTHETIC ONLY STREET",
  city: "Austin",
  state: "TX",
  zip: "78701",
  assetType: "sfh",
  price: 100000,
  arv: 250000,
  repairs: 20000,
  beds: 3,
  baths: 2,
  sqft: 1200,
  serviceType: "software",
};
const run = Date.now();
let proofId, dealId;
try {
  await db.connect();
  await check(
    "real signup, local SMTP confirmation, password login, Free CRM provisioning",
    async () => {
      for (const label of ["buyer", "other", "pro"]) {
        const email = `bm-${label}-${run}@example.invalid`;
        await request("/api/register-account", null, {
          action: "start",
          name: "SYNTHETIC " + label,
          email,
          password: privateValues.password,
          product: "crm",
          plan: "Free",
          role: "Admin",
        });
        const c = client();
        const denied = await c.auth.signInWithPassword({
          email,
          password: privateValues.password,
        });
        assert(denied.error, "unconfirmed login must fail");
        let message;
        for (let n = 0; n < 20; n++) {
          const inbox = await (
            await fetch("http://127.0.0.1:55324/api/v1/messages")
          ).json();
          const found = inbox.messages?.find((m) =>
            m.To?.some((t) => t.Address === email),
          );
          if (found) {
            message = await (
              await fetch(`http://127.0.0.1:55324/api/v1/message/${found.ID}`)
            ).json();
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        assert(message, "local confirmation mail missing");
        const content = message.HTML || message.Text;
        const link = content
          .match(/https?:[^\s"<>]+\/auth\/v1\/verify[^\s"<>]+/)?.[0]
          ?.replace(/&amp;/g, "&");
        assert(link, "confirmation link missing");
        assert.equal(new URL(link).origin, url);
        const confirm = await fetch(link, { redirect: "manual" });
        assert.equal(confirm.status, 303);
        const login = await c.auth.signInWithPassword({
          email,
          password: privateValues.password,
        });
        assert(!login.error, "confirmed password login failed");
        users[label] = {
          email,
          id: login.data.user.id,
          token: login.data.session.access_token,
          client: c,
        };
        await request("/api/register-account", users[label].token, {
          action: "complete",
        });
      }
      const plans = await db.query(
        "select plan_name,billing_status from workspace_plan_assignments where user_id=any($1)",
        [Object.values(users).map((u) => u.id)],
      );
      assert(
        plans.rows.every(
          (p) => p.plan_name === "Free" && p.billing_status === "Free Active",
        ),
      );
      assert.equal(plans.rows.length, 3);
    },
  );
  await check(
    "buyer create, private profile, criteria revision and stale update rejection",
    async () => {
      for (const label of ["buyer", "other"])
        await buyer(label, {
          action: "create",
          operationKey: randomUUID(),
          name: "SYNTHETIC " + label,
          criteria,
          consentVersion: "buyer-maintenance-v1",
          accurate: true,
          invitations: true,
        });
      const account = await buyer("buyer", { action: "account" });
      assert(account.linked);
      assert.equal(account.revision, 0);
      await buyer("buyer", {
        action: "profile",
        operationKey: randomUUID(),
        revision: 0,
        name: "SYNTHETIC Browser Buyer",
        company: "Synthetic Only",
        phone: "",
      });
      await buyer("buyer", {
        action: "criteria",
        operationKey: randomUUID(),
        revision: 1,
        criteria,
        consentVersion: "buyer-maintenance-v1",
        accurate: true,
        invitations: true,
      });
      await buyer(
        "buyer",
        {
          action: "profile",
          operationKey: randomUUID(),
          revision: 0,
          name: "STALE",
          company: "",
          phone: "",
        },
        400,
      );
      assert.equal(
        (await buyer("buyer", { action: "account" })).profile.name,
        "SYNTHETIC Browser Buyer",
      );
    },
  );
  await check(
    "real private Storage proof upload, byte-exact signed download, replay and replacement",
    async () => {
      const bytes = Buffer.from(
        "%PDF-1.4\n% SYNTHETIC ONLY - NOT PROOF OF FUNDS\n%%EOF\n",
      );
      const proof = {
        action: "proof",
        operationKey: randomUUID(),
        revision: 2,
        content: bytes.toString("base64"),
        mime: "application/pdf",
        expiresOn: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10),
      };
      await buyer("buyer", proof);
      await buyer("buyer", proof);
      let account = await buyer("buyer", { action: "account" });
      assert.equal(account.proofs.length, 1);
      proofId = account.proofs[0].id;
      const signed = await buyer("buyer", {
        action: "proof-link",
        id: proofId,
      });
      assert.equal(new URL(signed.url).origin, url);
      const download = await fetch(signed.url);
      assert(download.ok);
      assert(Buffer.from(await download.arrayBuffer()).equals(bytes));
      await buyer("other", { action: "proof-link", id: proofId }, 400);
      const path = (
        await db.query("select storage_path from bm_buyer_proofs where id=$1", [
          proofId,
        ])
      ).rows[0].storage_path;
      const direct = await users.buyer.client.storage
        .from("bm-buyer-self-service")
        .download(path);
      assert(direct.error, "direct browser Storage read must fail");
      await buyer("buyer", {
        ...proof,
        operationKey: randomUUID(),
        revision: 3,
      });
      account = await buyer("buyer", { action: "account" });
      assert.equal(account.proofs.length, 2);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from storage.objects where bucket_id=$1",
            ["bm-buyer-self-service"],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check(
    "subscriber deal creation, real matching, private result and idempotent usage",
    async () => {
      // Explicit local entitlement fixture; no provider objects or billing operations.
      await db.query(
        "insert into bm_entitlements(owner_id,product,plan_version,status,period_start,period_end,allowance) values($1,'buyermatch','buyermatch-pro-v1','active',now()-interval '1 day',now()+interval '29 days',50)",
        [users.pro.id],
      );
      const account = (
        await db.query(
          "select buyer_id from bm_buyer_accounts where user_id=$1",
          [users.buyer.id],
        )
      ).rows[0];
      await db.query(
        "update bm_buyers set status='active',criteria_verified_at=now() where id=$1",
        [account.buyer_id],
      );
      await api(
        "pro",
        { action: "save", property: { ...property, price: -1 } },
        400,
      );
      dealId = (await api("pro", { action: "save", property })).id;
      assert(dealId);
      const input = {
        action: "analyze",
        id: dealId,
        operationKey: randomUUID(),
      };
      const result = await api("pro", input);
      assert(result.explanation);
      assert(!JSON.stringify(result).includes(account.buyer_id));
      assert.deepEqual(await api("pro", input), result);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from bm_analyses where deal_id=$1",
            [dealId],
          )
        ).rows[0].n,
        1,
      );
      await api("buyer", { action: "detail", id: dealId }, 403);
      const direct = await users.buyer.client.from("bm_buyers").select("*");
      assert(direct.error || direct.data.length === 0);
    },
  );
  await check(
    "delivered synthetic invitation, HTTP response replay and isolated private history",
    async () => {
      const buyerId = (
        await db.query(
          "select buyer_id from bm_buyer_accounts where user_id=$1",
          [users.buyer.id],
        )
      ).rows[0].buyer_id;
      const exposure = randomUUID(),
        token = (await import("node:crypto"))
          .randomBytes(32)
          .toString("base64url");
      await db.query(
        "insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')",
        [exposure, dealId, buyerId, users.pro.id, randomUUID()],
      );
      await db.query(
        "insert into bm_outbox(exposure_id,state,accepted_at,delivered_at) values($1,'delivered',now(),now())",
        [exposure],
      );
      await db.query(
        "insert into bm_response_tokens(token_hash,exposure_id,environment,expires_at) values($1,$2,'staging',now()+interval '1 day')",
        [createHash("sha256").update(token).digest("hex"), exposure],
      );
      const input = { token, operationKey: randomUUID(), kind: "interested" };
      await request("/api/buyermatch-response", null, input);
      await request("/api/buyermatch-response", null, input);
      await request("/api/buyermatch-response", null, {
        token,
        operationKey: randomUUID(),
        kind: "message",
        terms: "SYNTHETIC local question",
      });
      const own = await buyer("buyer", { action: "history" }),
        other = await buyer("other", { action: "history" });
      assert.equal(own.items.length, 1);
      assert.equal(other.items.length, 0);
      assert(JSON.stringify(own).includes("interested"));
      await request(
        "/api/buyermatch-response",
        null,
        { ...input, token: "A".repeat(43) },
        400,
      );
    },
  );
  await check(
    "unauthenticated, legacy route and disabled-account denial over real HTTP",
    async () => {
      await request("/api/buyermatch-buyer", null, { action: "account" }, 401);
      assert.equal((await fetch(origin + "/api/import-buyers")).status, 404);
      await api("pro", { action: "admin-buyer-proof-queue" }, 403);
      await db.query(
        "update account_profiles set account_status='Deactivated' where user_id=$1",
        [users.other.id],
      );
      await buyer("other", { action: "account" }, 403);
    },
  );
  writeFileSync(
    "test-artifacts/local-browser-private.json",
    JSON.stringify({
      email: users.buyer.email,
      password: privateValues.password,
      subscriberEmail: users.pro.email,
    }),
    { mode: 0o600 },
  );
} catch (e) {
  console.error("Acceptance stopped:", e.message.slice(0, 250));
  process.exitCode = 1;
} finally {
  await db.end();
  writeFileSync(
    "test-artifacts/local-full-stack-results.json",
    JSON.stringify(
      {
        mode: "LOCAL_REAL_SERVICES",
        results,
        billing: "NOT_RUN_NO_STRIPE_OPERATIONS",
        browser: "PENDING",
      },
      null,
      2,
    ),
  );
}
