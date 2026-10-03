// Offline schema-only rehearsal. This script has no network client or credentials.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  stagingSources,
  stripTransaction,
} from "./buyermatch-staging-sources.mjs";

const snapshot = JSON.parse(
  readFileSync("tests/fixtures/buyermatch-production-schema.json", "utf8"),
);
const db = new PGlite({ extensions: { pgcrypto } });
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const checks = [];
const changes = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
}
async function exec(sql, label) {
  try {
    await db.exec(sql);
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}
const privilege = {
  a: "INSERT",
  r: "SELECT",
  w: "UPDATE",
  d: "DELETE",
  D: "TRUNCATE",
  x: "REFERENCES",
  t: "TRIGGER",
  m: "MAINTAIN",
  X: "EXECUTE",
};
async function acl(kind, name, entries) {
  if (!entries) return;
  await exec(
    `revoke all on ${kind} ${name} from public,anon,authenticated,service_role`,
    name,
  );
  for (const entry of entries) {
    const [grantee, rest] = entry.split("=");
    const codes = rest.split("/")[0].replaceAll("*", "");
    const grants = [...new Set([...codes].map((c) => privilege[c]))];
    if (grants.some((g) => !g)) throw Error("Unsupported ACL");
    await exec(
      `grant ${grants.join(",")} on ${kind} ${name} to ${grantee ? quote(grantee) : "public"}`,
      name,
    );
  }
}
async function catalog() {
  const { rows } = await db.query(`select jsonb_build_object(
    'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public' and table_name not like 'bm_%'),
    'tables',(select jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not like 'bm_%'),
    'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and k.contype in ('p','u','c','f') and c.relname not like 'bm_%'),
    'indexes',(select jsonb_agg(to_jsonb(i) order by indexname) from pg_indexes i where schemaname='public' and tablename not like 'bm_%'),
    'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl) order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not like 'bm_%' and p.prokind='f'),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage') and tablename not like 'bm_%'),
    'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and c.relname not like 'bm_%')
  ) as state`);
  return rows[0].state;
}
async function buyerMatchObjects() {
  const { rows } =
    await db.query(`select 'column:'||c.relname||'.'||a.attname as object,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text as definition from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname like 'bm_%' and c.relkind='r' and a.attnum>0 and not a.attisdropped
    union all select 'constraint:'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relname like 'bm_%' and k.contype in ('p','u','c','f')
    union all select 'index:'||indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'bm_%'
    union all select 'function:'||p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'bm_%'
    union all select 'trigger:'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname like 'bm_%' and not t.tgisinternal`);
  return Object.fromEntries(rows.map((r) => [r.object, r.definition]));
}
try {
  // Managed Auth/Storage infrastructure is represented only by required contracts;
  // no Auth users, bucket contents, customer data, credentials or vault data are copied.
  await exec(
    `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    create schema extensions; create extension pgcrypto with schema extensions;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on storage.objects to anon,authenticated,service_role;
    set check_function_bodies=off;`,
    "managed prerequisites",
  );
  for (const t of snapshot.tables) {
    await exec(
      `create table public.${quote(t.name)} (${t.columns.map((c) => `${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notnull ? " not null" : ""}`).join(",")})`,
      t.name,
    );
    if (t.rls)
      await exec(
        `alter table public.${quote(t.name)} enable row level security`,
        t.name,
      );
    if (t.force)
      await exec(
        `alter table public.${quote(t.name)} force row level security`,
        t.name,
      );
    await acl("table", "public." + quote(t.name), t.acl);
  }
  for (const type of ["p", "u", "c", "f"])
    for (const c of snapshot.constraints.filter((c) => c.type === type))
      await exec(
        `alter table public.${quote(c.table)} add constraint ${quote(c.name)} ${c.definition}`,
        c.name,
      );
  const backing = new Set(
    snapshot.constraints
      .filter((c) => ["p", "u"].includes(c.type))
      .map((c) => c.name),
  );
  for (const i of snapshot.indexes.filter((i) => !backing.has(i.name)))
    await exec(i.definition, i.name);
  for (const f of snapshot.functions) {
    await exec(f.definition, f.name);
    await acl("function", `public.${quote(f.name)}(${f.identity})`, f.acl);
  }
  for (const t of snapshot.triggers) await exec(t.definition, t.name);
  for (const p of snapshot.policies)
    await exec(
      `create policy ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""}`,
      p.policyname,
    );
  await exec(
    `set check_function_bodies=on;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public revoke execute on functions from public;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`,
    "Production default privileges",
  );
  const before = await catalog();
  check(
    before.tables.length === 33,
    "33 Production public tables reconstructed",
  );
  check(
    before.constraints.length === 85,
    "85 Production constraints reconstructed",
  );
  check(before.indexes.length === 84, "84 Production indexes reconstructed");
  check(
    before.functions.length === 28,
    "28 Production application functions reconstructed",
  );
  check(before.triggers.length === 10, "10 Production triggers reconstructed");
  check(
    before.policies.length === 80,
    "80 Production public/storage policies reconstructed",
  );
  await exec(
    `insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    insert into cloud_snapshots(user_id,snapshot) values('00000000-0000-4000-8000-000000000001','{"synthetic":true}');
    insert into workspaces(owner_user_id,owner_email,name) values('00000000-0000-4000-8000-000000000001','rehearsal@example.invalid','Synthetic rehearsal workspace');`,
    "Disposable legacy rows",
  );
  const legacyRows = (
    await db.query(
      "select to_jsonb(c) row from cloud_snapshots c union all select to_jsonb(w) from workspaces w",
    )
  ).rows;
  const migrations = stagingSources().filter((s) =>
    s.path.includes("_buyermatch_"),
  );
  for (const s of migrations) {
    const prior = await buyerMatchObjects();
    await exec("begin;" + stripTransaction(s.sql) + ";commit;", s.path);
    check(true, s.path);
    const after = await buyerMatchObjects();
    changes.push({
      path: s.path,
      sha256: s.hash,
      created: Object.keys(after).filter((k) => !(k in prior)),
      changed: Object.keys(after).filter(
        (k) => k in prior && after[k] !== prior[k],
      ),
      removed: Object.keys(prior).filter((k) => !(k in after)),
    });
  }
  assert.deepEqual(
    await catalog(),
    before,
    "Legacy schema definitions, RLS, policies, grants, RPCs, indexes and triggers unchanged",
  );
  check(true, "Legacy schema unchanged after all eleven migrations");
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(c) row from cloud_snapshots c union all select to_jsonb(w) from workspaces w",
      )
    ).rows,
    legacyRows,
  );
  check(true, "Synthetic legacy workspace and snapshot records unchanged");
  await exec(
    "set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)",
    "Legacy owner session",
  );
  check(
    (await db.query("select * from cloud_snapshots")).rows.length === 1,
    "Existing owner can retrieve own legacy snapshot",
  );
  await exec(
    "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)",
    "Other legacy session",
  );
  check(
    (await db.query("select * from cloud_snapshots")).rows.length === 0,
    "Other user cannot retrieve legacy snapshot",
  );
  await exec("reset role", "reset");
  const tables = (
    await db.query(
      `select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'bm_%' order by relname`,
    )
  ).rows;
  for (const t of tables) {
    check(t.relrowsecurity, `${t.relname}: RLS enabled`);
    check(
      (
        await db.query(
          "select has_table_privilege('service_role',$1,'SELECT') and has_table_privilege('service_role',$1,'INSERT') and has_table_privilege('service_role',$1,'UPDATE') and has_table_privilege('service_role',$1,'DELETE') allowed",
          [t.relname],
        )
      ).rows[0].allowed,
      `${t.relname}: server role retains CRUD`,
    );
    for (const role of ["anon", "authenticated"]) {
      const r = (
        await db.query(
          `select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`,
          [role, t.relname],
        )
      ).rows[0];
      check(!r.allowed, `${t.relname}: ${role} has no direct access`);
    }
  }
  const funcs = (
    await db.query(
      `select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.prorettype::regtype::text return_type,has_function_privilege('service_role',p.oid,'EXECUTE') server,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'bm_%' order by p.proname`,
    )
  ).rows;
  for (const f of funcs.filter((f) => f.prosecdef)) {
    check(
      !f.anon && !f.authenticated,
      `${f.signature}: private SECURITY DEFINER RPC`,
    );
    check(
      f.proconfig?.includes("search_path=public"),
      `${f.signature}: fixed search_path`,
    );
    check(f.server, `${f.signature}: server role retains execution`);
  }
  for (const f of funcs.filter((f) => !f.prosecdef))
    check(
      f.return_type === "trigger",
      `${f.signature}: invoker trigger only, not a privileged public RPC`,
    );
  const config = (
    await db.query("select enabled from bm_production_delivery_config")
  ).rows[0];
  check(config.enabled === false, "Production delivery remains disabled");
  check(
    (
      await db.query("select success_fees_enabled from bm_configuration")
    ).rows.every((r) => r.success_fees_enabled === false),
    "Success fees remain disabled",
  );
  check(
    (
      await db.query(
        "select has_schema_privilege('authenticated','public','CREATE') allowed",
      )
    ).rows[0].allowed === false,
    "Browser role cannot shadow public search_path objects",
  );
  await exec(
    "insert into storage.objects(bucket_id,name) values('buyermatch-private','synthetic-rehearsal.pdf')",
    "Synthetic private Storage object",
  );
  await exec(`set role authenticated`, "browser role");
  check(
    (
      await db.query(
        `select * from storage.objects where bucket_id='buyermatch-private'`,
      )
    ).rows.length === 0,
    "Existing Storage policies expose no BuyerMatch rows",
  );
  await exec("reset role", "reset");
  mkdirSync("test-artifacts", { recursive: true });
  const result = {
    status: "passed",
    migrationCount: migrations.length,
    assertions: checks.length,
    buyerMatchTables: tables.length,
    privateDefinerFunctions: funcs.filter((f) => f.prosecdef).length,
    checks,
    limitations: [
      "Schema-only, no Production customer records.",
      "Managed Auth/Storage represented by minimal contracts.",
      "PGlite is single-session; does not establish live lock timing or multi-session contention.",
      "Legacy functions restored with check_function_bodies off as in schema restore; BuyerMatch migration functions use normal validation.",
    ],
  };
  writeFileSync(
    "test-artifacts/buyermatch-production-rehearsal.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  writeFileSync(
    "test-artifacts/buyermatch-migration-object-changes.json",
    JSON.stringify(changes, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
} finally {
  await db.close();
}
