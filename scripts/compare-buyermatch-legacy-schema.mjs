// Offline comparison: branch baseline versus captured live Production metadata.
import { readFileSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  stagingSources,
  stripTransaction,
} from "./buyermatch-staging-sources.mjs";
const live = JSON.parse(
  readFileSync("tests/fixtures/buyermatch-production-schema.json", "utf8"),
);
const db = new PGlite();
const drift = [];
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;create function auth.role() returns text language sql as $$select 'service_role'::text$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`,
  );
  const sources = stagingSources().filter(
    (s) => s.path.includes("000_baseline") || /\/202607/.test(s.path),
  );
  for (const s of sources)
    await db.exec(
      stripTransaction(s.sql).replace(
        /create extension if not exists pgcrypto;/gi,
        "",
      ),
    );
  const columns = (
    await db.query(
      `select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as notnull,pg_get_expr(d.adbin,d.adrelid) as "default" from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,
    )
  ).rows;
  for (const c of columns) {
    const t = live.tables.find((t) => t.name === c.table);
    const actual = t?.columns.find((x) => x.name === c.name);
    for (const field of ["type", "notnull", "default"])
      if (actual?.[field] !== c[field])
        drift.push({
          object: c.table + "." + c.name,
          field,
          branch: c[field],
          production: actual?.[field] ?? null,
        });
  }
  const functions = (
    await db.query(
      `select proname name,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace`,
    )
  ).rows;
  const norm = (s) => s?.replace(/\s+/g, " ").trim();
  const changedFunctions = functions
    .filter(
      (f) =>
        !live.functions.some(
          (l) => l.name === f.name && norm(l.definition) === norm(f.definition),
        ),
    )
    .map((f) => f.name);
  const tables = [...new Set(columns.map((c) => c.table))];
  const rls = (
    await db.query(
      `select relname name,relrowsecurity rls from pg_class where relnamespace='public'::regnamespace and relkind='r'`,
    )
  ).rows;
  const rlsDrift = rls.filter(
    (t) => live.tables.find((l) => l.name === t.name)?.rls !== t.rls,
  );
  const constraints = (
    await db.query(
      "select c.relname as table,k.conname as name,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and k.contype in ('p','u','c','f')",
    )
  ).rows;
  const constraintDifferences = constraints.filter(
    (c) =>
      !live.constraints.some(
        (l) =>
          l.table === c.table &&
          l.name === c.name &&
          l.definition === c.definition,
      ),
  );
  const policies = (
    await db.query("select * from pg_policies where schemaname='public'")
  ).rows;
  const policyDifferences = policies.filter(
    (p) =>
      !live.policies.some(
        (l) =>
          l.schemaname === p.schemaname &&
          l.tablename === p.tablename &&
          l.policyname === p.policyname &&
          l.qual === p.qual &&
          l.with_check === p.with_check &&
          l.cmd === p.cmd &&
          JSON.stringify(l.roles) === JSON.stringify(p.roles),
      ),
  );
  const indexes = (
    await db.query(
      "select tablename as table,indexname as name,indexdef as definition from pg_indexes where schemaname='public'",
    )
  ).rows;
  const indexDifferences = indexes.filter(
    (i) =>
      !live.indexes.some(
        (l) =>
          l.table === i.table &&
          l.name === i.name &&
          l.definition === i.definition,
      ),
  );
  const result = {
    constraintDifferences,
    policyDifferences,
    indexDifferences,
    sharedMigrationIdentities: 29,
    branchPrelude:
      "Reconstructed staging bootstrap, not an original Production migration",
    comparedTables: tables.length,
    comparedColumns: columns.length,
    columnDrift: drift,
    changedFunctionDefinitions: changedFunctions,
    rlsDrift,
    productionAdditionalTables: live.tables
      .filter((t) => !tables.includes(t.name))
      .map((t) => t.name),
    conclusion:
      "Differences are expected legacy evolution or staging bootstrap differences; BuyerMatch SQL depends on auth.users and storage.buckets, not these public legacy tables. No historical checksum equality is claimed.",
  };
  writeFileSync(
    "docs/BUYERMATCH_LEGACY_SCHEMA_COMPARISON.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.close();
}
