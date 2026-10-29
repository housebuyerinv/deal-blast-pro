import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";
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
  deal = randomUUID(),
  foreign = randomUUID();
await db.query("insert into auth.users values($1),($2)", [owner, other]);
for (const [id, user] of [
  [deal, owner],
  [foreign, other],
])
  await db.query(
    `insert into bm_deals(id,owner_id,property,created_at) values($1,$2,'{"address":"123 Synthetic","city":"Austin","state":"TX","zip":"78701"}','2026-01-01')`,
    [id, user],
  );
await mkdir("node_modules/.cache/conversion-api", { recursive: true });
const outfile = path.resolve(
  await mkdtemp("node_modules/.cache/conversion-api/handler-"),
  "handler.mjs",
);
await build({
  entryPoints: ["server/http/buyermatch.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);",
  },
});
const { default: handler } = await import(pathToFileURL(outfile));
async function request(
  action,
  input = {},
  { paid = true, token = "Bearer synthetic" } = {},
) {
  const savedEnv = { ...process.env },
    savedFetch = globalThis.fetch;
  let rpcCalls = 0;
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, {
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-fixture-not-a-credential",
    });
    globalThis.fetch = async (url, init) => {
      const target = new URL(typeof url === "string" ? url : url.url);
      assert.equal(target.origin, process.env.SUPABASE_URL);
      if (target.pathname === "/auth/v1/user")
        return Response.json({
          id: owner,
          email: "synthetic@example.invalid",
          email_confirmed_at: "2026-01-01",
          is_anonymous: false,
        });
      if (
        target.pathname.endsWith("/account_profiles") ||
        target.pathname.endsWith("/workspaces")
      )
        return Response.json([{ account_status: "Active" }]);
      if (target.pathname.endsWith("/workspace_plan_assignments"))
        return Response.json([{ access_status: "Active" }]);
      if (target.pathname.endsWith("/bm_entitlements"))
        return Response.json(
          paid
            ? [
                {
                  product: "buyermatch",
                  status: "active",
                  period_start: "2020-01-01",
                  period_end: "2099-01-01",
                },
              ]
            : [],
        );
      if (target.pathname.endsWith("/bm_deals")) {
        const id = target.searchParams.get("id")?.replace("eq.", "");
        return Response.json(
          (
            await db.query(
              "select property from bm_deals where id=$1 and owner_id=$2",
              [id, owner],
            )
          ).rows,
        );
      }
      const match =
        /\/rpc\/(bm_conversion_snapshot|bm_conversion_record|bm_conversion_review)$/.exec(
          target.pathname,
        );
      assert.ok(match, "Unexpected provider route " + target.pathname);
      rpcCalls++;
      const args = JSON.parse(init.body);
      assert.equal(args.p_owner, owner);
      try {
        const names =
          match[1] === "bm_conversion_snapshot"
            ? ["p_owner"]
            : match[1] === "bm_conversion_record"
              ? [
                  "p_owner",
                  "p_deal",
                  "p_key",
                  "p_kind",
                  "p_at",
                  "p_evidence",
                  "p_payload",
                ]
              : ["p_owner", "p_source", "p_target", "p_key", "p_reason"];
        const values = names.map((n) =>
          typeof args[n] === "object" && args[n] !== null
            ? JSON.stringify(args[n])
            : args[n],
        );
        const result = await db.query(
          `select ${match[1]}(${names.map((_, i) => "$" + (i + 1)).join(",")}) result`,
          values,
        );
        return Response.json(result.rows[0].result);
      } catch {
        return Response.json(
          { message: "RPC rejected", code: "P0001" },
          { status: 400 },
        );
      }
    };
    const read = action === "conversion-report";
    let status = 0,
      body;
    const response = {
      setHeader() {},
      status(value) {
        status = value;
        return response;
      },
      json(value) {
        body = value;
        return response;
      },
    };
    await handler(
      {
        method: read ? "GET" : "POST",
        headers: { authorization: token },
        query: { action, ...input },
        body: { action, ...input },
      },
      response,
    );
    return { status, body, rpcCalls };
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
test("actual authenticated API appends evidence via real SQL and report reads its property outcome", async () => {
  const input = {
    dealId: deal,
    operationKey: randomUUID(),
    kind: "closed",
    occurredAt: "2026-01-02T12:00:00Z",
    evidenceRef: "settlement-1",
    payload: { amountCents: 12500000, confirmed: true },
  };
  const written = await request("conversion-record", input);
  assert.equal(written.status, 200);
  assert.ok(written.body.id);
  const report = await request("conversion-report");
  assert.equal(report.status, 200);
  assert.equal(report.body.closedTransactions, 1);
  assert.equal(report.body.closedVolumeCents, 12500000);
  assert.equal(
    report.body.rows.some((row) => row.id === foreign),
    false,
  );
  const replay = await request("conversion-record", input);
  assert.equal(replay.body.id, written.body.id);
  assert.equal(replay.body.replayed, true);
});
test("actual API denies anonymous/Free accounts, owner injection and foreign deal writes", async () => {
  assert.equal(
    (await request("conversion-report", {}, { token: "" })).status,
    401,
  );
  const free = await request("conversion-report", {}, { paid: false });
  assert.equal(free.status, 403);
  assert.equal(free.rpcCalls, 0);
  assert.equal(
    (await request("conversion-record", { ownerId: other })).status,
    400,
  );
  const foreignWrite = await request("conversion-record", {
    dealId: foreign,
    operationKey: randomUUID(),
    kind: "lost",
    occurredAt: "2026-01-02T12:00:00Z",
    evidenceRef: "loss-1",
    payload: { reason: "other_documented" },
  });
  assert.equal(foreignWrite.status, 404);
  assert.equal(foreignWrite.rpcCalls, 0);
});
