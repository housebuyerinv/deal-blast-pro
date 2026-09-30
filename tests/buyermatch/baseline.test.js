import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { randomUUID, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import {
  stagingSources,
  stripTransaction,
} from "../../scripts/buyermatch-staging-sources.mjs";

test("fresh DBP baseline and all migrations support the actual synthetic seed twice without duplication", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;create function auth.role() returns text language sql as $$select 'service_role'::text$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`,
  );
  try {
    for (const source of stagingSources()) {
      try {
        await db.exec("begin;");
        await db.exec(
          stripTransaction(source.sql).replace(
            /create extension if not exists pgcrypto;/gi,
            "",
          ),
        );
        await db.exec("commit;");
      } catch (error) {
        throw new Error(`${source.path}: ${error.message}`);
      }
    }
    const privacy = await db.query(
      "select has_table_privilege('authenticated','bm_buyers','SELECT') as allowed",
    );
    assert.equal(privacy.rows[0].allowed, false);
    await db.exec(
      "create table dbp_staging_installation(project_ref text);insert into dbp_staging_installation values('fixture')",
    );
    const users = [];
    class Query {
      constructor(table) {
        this.table = table;
        this.fields = "*";
        this.filters = [];
      }
      select(fields) {
        this.fields = fields;
        return this;
      }
      single() {
        this.one = true;
        return this;
      }
      eq(key, value) {
        this.filters.push([key, value]);
        return this;
      }
      upsert(value, options) {
        this.values = value;
        this.options = options;
        return this;
      }
      update(value) {
        this.patch = value;
        return this;
      }
      async then(resolve, reject) {
        try {
          let result;
          const name = '"' + this.table + '"';
          if (this.values) {
            const cols = Object.keys(this.values);
            const conflict = this.options.onConflict
              .split(",")
              .map((c) => '"' + c + '"')
              .join(",");
            const update = this.options.ignoreDuplicates
              ? "nothing"
              : "update set " +
                cols.map((c) => '"' + c + '"=excluded."' + c + '"').join(",");
            result = await db.query(
              "insert into " +
                name +
                " (" +
                cols.map((c) => '"' + c + '"').join(",") +
                ") values (" +
                cols.map((_, i) => "$" + (i + 1)).join(",") +
                ") on conflict (" +
                conflict +
                ") do " +
                update +
                " returning *",
              Object.values(this.values),
            );
          } else if (this.patch) {
            const cols = Object.keys(this.patch);
            result = await db.query(
              "update " +
                name +
                " set " +
                cols.map((c, i) => '"' + c + '"=$' + (i + 1)).join(",") +
                " where " +
                this.filters
                  .map(([c], i) => '"' + c + '"=$' + (i + cols.length + 1))
                  .join(" and ") +
                " returning *",
              [...Object.values(this.patch), ...this.filters.map(([, v]) => v)],
            );
          } else
            result = await db.query("select " + this.fields + " from " + name);
          resolve({
            data: this.one ? result.rows[0] : result.rows,
            error: null,
          });
        } catch (error) {
          reject(error);
        }
      }
    }
    globalThis.__seedClient = {
      from: (table) => new Query(table),
      auth: {
        admin: {
          listUsers: async () => ({ data: { users }, error: null }),
          createUser: async (input) => {
            const user = { ...input, id: randomUUID() };
            users.push(user);
            await db.query("insert into auth.users values($1)", [user.id]);
            return { data: { user }, error: null };
          },
        },
      },
    };
    Object.assign(process.env, {
      BM_ENVIRONMENT: "staging",
      BM_STAGING_PROJECT_REF: "fixture",
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fixture",
      BUYERMATCH_IDENTITY_KEY: randomBytes(32).toString("base64"),
      BM_STAGING_CONFIRM: "I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION",
      BM_TEST_USER_EMAIL: "user@example.invalid",
      BM_TEST_OTHER_EMAIL: "other@example.invalid",
      BM_TEST_ADMIN_EMAIL: "admin@example.invalid",
      DEALBLAST_OWNER_ADMIN_EMAILS: "admin@example.invalid",
      BM_TEST_USER_PASSWORD: "fixture-password-123",
      BM_TEST_OTHER_PASSWORD: "fixture-password-456",
      BM_TEST_ADMIN_PASSWORD: "fixture-password-789",
    });
    const bundle = await build({
      entryPoints: ["scripts/seed-buyermatch-staging.mjs"],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      plugins: [
        {
          name: "db-adapter",
          setup(b) {
            b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
              path: "db",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: "export const createClient=()=>globalThis.__seedClient",
            }));
          },
        },
      ],
    });
    const code =
      "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64");
    await import(code + "#first");
    await import(code + "#second");
    assert.equal(users.length, 3);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from bm_buyers where synthetic",
        )
      ).rows[0].n,
      6,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from bm_deals")).rows[0].n,
      3,
    );
    assert.equal(
      (await db.query("select success_fees_enabled from bm_configuration"))
        .rows[0].success_fees_enabled,
      false,
    );
    delete globalThis.__seedClient;
  } finally {
    await db.close();
  }
});
