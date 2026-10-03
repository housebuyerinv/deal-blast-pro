import { Client } from "pg";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { verifyStagingLedger } from "./buyermatch-staging-ledger.mjs";
import {
  assertStaging,
  PRODUCTION_SUPABASE_REF,
} from "../server/buyermatch/staging.js";
import {
  stagingSources,
  stripTransaction,
} from "./buyermatch-staging-sources.mjs";
const env = process.env;
assertStaging(env);
if (env.BM_STAGING_CONFIRM !== "I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION")
  throw new Error("Explicit staging confirmation required");
// Existing connector installations can be verified without a database password.
// This path performs only SELECT requests and never bootstraps or applies SQL.
if (process.argv.includes("--verify-only")) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error(
      "Staging service-role credential required for verification",
    );
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const marker = await client
    .from("dbp_staging_installation")
    .select("project_ref");
  if (
    marker.error ||
    marker.data.length !== 1 ||
    marker.data[0].project_ref !== env.BM_STAGING_PROJECT_REF
  )
    throw new Error("Staging installation marker could not be verified");
  const ledger = await client
    .from("dbp_staging_migrations")
    .select("path,hash");
  if (ledger.error)
    throw new Error("Staging migration ledger could not be read");
  const count = verifyStagingLedger(stagingSources(), ledger.data);
  console.log(
    `Verified ${count} staging migration checksums; no writes performed.`,
  );
  process.exit(0);
}
const connection = new URL(env.BM_STAGING_DATABASE_URL || "");
const ref = env.BM_STAGING_PROJECT_REF;
if (
  connection.href.includes(PRODUCTION_SUPABASE_REF) ||
  !["postgres:", "postgresql:"].includes(connection.protocol) ||
  !(
    connection.hostname === `db.${ref}.supabase.co` ||
    (connection.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(connection.username) === `postgres.${ref}`)
  )
)
  throw new Error(
    "Database connection must identify the exact staging project",
  );
const db = new Client({
  connectionString: connection.href,
  ssl: {
    rejectUnauthorized: true,
    ...(env.BM_DATABASE_CA_FILE
      ? { ca: readFileSync(env.BM_DATABASE_CA_FILE, "utf8") }
      : {}),
  },
});
await db.connect();
try {
  await db.query("select pg_advisory_lock(803030)");
  const marker = await db.query(
    "select to_regclass('public.dbp_staging_installation') as marker",
  );
  if (!marker.rows[0].marker) {
    const exists = await db.query(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
    );
    if (exists.rows[0].n !== 0)
      throw new Error(
        "Bootstrap requires a fresh empty public schema; refusing an existing app database",
      );
    await db.query("begin");
    await db.query(
      "create table public.dbp_staging_installation(project_ref text primary key,created_at timestamptz not null default now());create table public.dbp_staging_migrations(path text primary key,hash text not null,applied_at timestamptz not null default now());revoke all on public.dbp_staging_installation,public.dbp_staging_migrations from public,anon,authenticated;grant all on public.dbp_staging_installation,public.dbp_staging_migrations to service_role;",
    );
    await db.query(
      "insert into public.dbp_staging_installation(project_ref) values($1)",
      [ref],
    );
    await db.query("commit");
  }
  const installed = await db.query(
    "select project_ref from public.dbp_staging_installation",
  );
  if (installed.rows.length !== 1 || installed.rows[0].project_ref !== ref)
    throw new Error("Staging identity mismatch");
  for (const source of stagingSources()) {
    const previous = await db.query(
      "select hash from public.dbp_staging_migrations where path=$1",
      [source.path],
    );
    if (previous.rows.length) {
      if (previous.rows[0].hash !== source.hash)
        throw new Error(`Applied migration changed: ${source.path}`);
      continue;
    }
    await db.query("begin");
    try {
      await db.query(stripTransaction(source.sql));
      await db.query(
        "insert into public.dbp_staging_migrations(path,hash) values($1,$2)",
        [source.path, source.hash],
      );
      await db.query("commit");
    } catch {
      await db.query("rollback");
      throw new Error(`Staging migration failed: ${source.path}`);
    }
    console.log(`Applied ${source.path}`);
  }
  console.log("Staging schema ready. No production access or seed data used.");
} finally {
  await db.end();
}
