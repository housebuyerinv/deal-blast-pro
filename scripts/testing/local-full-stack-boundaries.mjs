import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { localEnvironment } from "./local-full-stack-runtime.mjs";
const { env, privateValues } = localEnvironment(),
  creds = JSON.parse(
    readFileSync("test-artifacts/local-browser-private.json", "utf8"),
  );
const db = new Client({
  host: "127.0.0.1",
  port: 55322,
  user: "postgres",
  database: "postgres",
  password: env.BM_LOCAL_DATABASE_PASSWORD,
});
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function login(email) {
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const r = await c.auth.signInWithPassword({
    email,
    password: privateValues.password,
  });
  assert(!r.error);
  return { id: r.data.user.id, token: r.data.session.access_token };
}
async function call(route, user, body, status = 200) {
  const r = await fetch(env.PUBLIC_APP_URL + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, status, `${body.action}: HTTP ${r.status}`);
  return r.json();
}
try {
  await db.connect();
  const buyer = await login(creds.email),
    pro = await login(creds.subscriberEmail);
  await check(
    "proof expiry, expired upload rejection and browser-saved profile persistence",
    async () => {
      const account = await call("/api/buyermatch-buyer", buyer, {
        action: "account",
      });
      assert.equal(account.profile.company, "SYNTHETIC Browser Verified");
      const proof = { id: randomUUID() };
      // Aging fixture inserted as old evidence; never disable append-only triggers or change OS time.
      const old = (
        await db.query("select * from bm_buyer_proofs where id=$1", [
          account.proofs[0].id,
        ])
      ).rows[0];
      const content = await admin.storage
        .from("bm-buyer-self-service")
        .download(old.storage_path);
      assert(!content.error);
      const path = buyer.id + "/" + proof.id;
      assert(
        !(
          await admin.storage
            .from("bm-buyer-self-service")
            .upload(path, await content.data.arrayBuffer(), {
              contentType: old.mime,
            })
        ).error,
      );
      await db.query(
        "insert into bm_buyer_proofs(id,buyer_id,storage_path,sha256,mime,bytes,expires_on,created_at) values($1,$2,$3,$4,$5,$6,current_date-1,now()-interval '60 days')",
        [proof.id, old.buyer_id, path, old.sha256, old.mime, old.bytes],
      );
      const expired = await call("/api/buyermatch-buyer", buyer, {
        action: "account",
      });
      assert.equal(
        expired.proofs.find((p) => p.id === proof.id).status,
        "expired",
      );
      await call(
        "/api/buyermatch-buyer",
        buyer,
        {
          action: "proof",
          operationKey: randomUUID(),
          revision: account.revision,
          content: Buffer.from("%PDF-SYNTHETIC").toString("base64"),
          mime: "application/pdf",
          expiresOn: "2020-01-01",
        },
        400,
      );
    },
  );
  await check(
    "actual authenticated local policy-owner proof review and immutable audit",
    async () => {
      // Fixed policy address in LOCAL Auth only; this is a synthetic policy-owner fixture,
      // not the actual owner's hosted identity. No email or hosted account is accessed.
      const made = await admin.auth.admin.createUser({
        email: "housebuyerinv@gmail.com",
        password: privateValues.password,
        email_confirm: true,
      });
      assert(!made.error);
      const owner = await login("housebuyerinv@gmail.com");
      await db.query(
        "insert into account_profiles(user_id,email,full_name,role,account_status) values($1,'housebuyerinv@gmail.com','SYNTHETIC LOCAL POLICY OWNER','Admin','Active')",
        [owner.id],
      );
      const queue = await call("/api/buyermatch", owner, {
        action: "admin-buyer-proof-queue",
      });
      assert(queue.items.length >= 2);
      const proof = (
        await db.query(
          "select id from bm_buyer_proofs where expires_on>current_date order by created_at desc limit 1",
        )
      ).rows[0].id;
      const link = await call("/api/buyermatch", owner, {
        action: "admin-buyer-proof-link",
        id: proof,
      });
      assert.equal(new URL(link.url).origin, env.SUPABASE_URL);
      assert((await fetch(link.url)).ok);
      await call("/api/buyermatch", owner, {
        action: "admin-buyer-proof-review",
        id: proof,
        decision: "approved",
      });
      const denied = await fetch(env.PUBLIC_APP_URL + "/api/buyermatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${owner.token}`,
        },
        body: JSON.stringify({
          action: "admin-buyer-proof-review",
          id: proof,
          decision: "rejected",
        }),
      });
      assert(!denied.ok);
      assert.equal(
        (
          await db.query(
            "select decision from bm_buyer_proof_reviews where proof_id=$1",
            [proof],
          )
        ).rows[0].decision,
        "approved",
      );
    },
  );
  await check(
    "entitled cross-owner deal denial and real hourly analysis limit",
    async () => {
      const deals = await call("/api/buyermatch", pro, { action: "list" }),
        id = deals.deals[0].id;
      await db.query(
        "insert into bm_entitlements(owner_id,product,plan_version,status,period_start,period_end,allowance) values($1,'buyermatch','buyermatch-starter-v1','active',now()-interval '1 day',now()+interval '1 day',20)",
        [buyer.id],
      );
      await call("/api/buyermatch", buyer, { action: "detail", id }, 404);
      for (let i = 0; i < 9; i++)
        await call("/api/buyermatch", pro, {
          action: "analyze",
          id,
          operationKey: randomUUID(),
        });
      await call(
        "/api/buyermatch",
        pro,
        { action: "analyze", id, operationKey: randomUUID() },
        409,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from bm_analyses where owner_id=$1",
            [pro.id],
          )
        ).rows[0].n,
        10,
      );
    },
  );
} catch (e) {
  console.error(e.message.slice(0, 250));
  process.exitCode = 1;
} finally {
  await db.end();
  writeFileSync(
    "test-artifacts/local-boundary-results.json",
    JSON.stringify(results, null, 2),
  );
}
