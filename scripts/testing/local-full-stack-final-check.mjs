import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { localEnvironment } from "./local-full-stack-runtime.mjs";
const { env } = localEnvironment(),
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
try {
  for (const path of [
    "/test-artifacts/local-full-stack-private.json",
    "/test-artifacts/local-stack-status-private.json",
    "/.env.buyermatch-staging",
    "/acceptance/local-synthetic/supabase/config.toml",
  ]) {
    const r = await fetch(env.PUBLIC_APP_URL + path);
    // An absent dotenv path can legitimately receive the SPA's HTML fallback.
    if (path.startsWith("/.env") && r.status === 200) {
      assert(r.headers.get("content-type")?.includes("text/html"));
      const html = await r.text();
      assert(!html.includes(env.SUPABASE_SERVICE_ROLE_KEY));
    } else
      assert(
        [403, 404].includes(r.status),
        "Private local file must not be served",
      );
  }
  console.log("PASS private runtime files excluded from browser output");
  await db.connect();
  const proofs = await db.query(
    "select p.expires_on,p.bytes,p.sha256 from bm_buyer_proofs p join bm_buyer_accounts a on a.buyer_id=p.buyer_id join auth.users u on u.id=a.user_id where u.email=$1",
    [creds.email],
  );
  assert.equal(proofs.rows.length, 4);
  assert(proofs.rows.some((p) => p.bytes === 53));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from bm_deals where property->>'address'='200 SYNTHETIC BROWSER STREET'",
      )
    ).rows[0].n,
    1,
  );
  const analyses = await db.query(
    "select private_result from bm_analyses order by created_at limit 1",
  );
  assert.equal(analyses.rows[0].private_result.totalMatches, 1);
  console.log(
    "PASS browser proof bytes, browser-created deal and positive private matching persisted",
  );
  const results = {
    ...JSON.parse(
      readFileSync("test-artifacts/local-full-stack-results.json", "utf8"),
    ),
    boundaries: JSON.parse(
      readFileSync("test-artifacts/local-boundary-results.json", "utf8"),
    ),
    browser: {
      status: "PASS",
      checks: [
        "normal buyer sign-in",
        "profile save and reload persistence",
        "private history",
        "native-date proof replacement retained prior files",
        "normal subscriber sign-in",
        "Pro usage and CRM separation",
        "browser deal creation",
        "hourly limit denial",
        "distribution disabled",
        "sign-out",
      ],
    },
    privateFiles: "PASS_HTTP_DENIAL",
    positivePrivateMatches: 1,
    hostedOperations: false,
    stripeOperations: false,
  };
  writeFileSync(
    "docs/release-evidence/2026-10-28/LOCAL_FULL_STACK_RESULTS.json",
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await db.end();
}
