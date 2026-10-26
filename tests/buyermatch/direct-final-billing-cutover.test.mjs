// New release-path verification ONLY. Disposable in-memory PostgreSQL/WASM;
// no provider calls, hosted records, credentials or historical test-suite import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('direct final billing guard cutover without the weaker tier predecessor', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table bm_plans(version text primary key,product text,stripe_price_id text,approved boolean,allowance integer);
      create table bm_checkouts(id uuid primary key,owner_id uuid,product text,plan_version text,state text,session_id text);
      create table bm_entitlements(owner_id uuid,product text,stripe_subscription_id text);
      create table bm_live_billing_config(id boolean,enabled boolean,verified boolean);
      create table local_applied(owner_id uuid,price text,subscription text);
      create table local_crm_sentinel(plan text,role text); insert into local_crm_sentinel values('Pro','Owner');
      create function bm_apply_billing(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language sql as $$insert into local_applied values($3,$5,$6)$$;
      create function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language plpgsql security definer set search_path=public as $$begin return;end$$;
      create function bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language plpgsql security definer set search_path=public as $$begin return;end$$;
      revoke all on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz),bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
      grant execute on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz),bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
      insert into bm_plans values('buyermatch-starter-v1','buyermatch','price_synthetic_starter',true,20),('buyermatch-pro-v1','buyermatch','price_synthetic_pro',true,50);
      insert into bm_live_billing_config values(true,true,true);`);
    const metadata = async () => (await db.query(`select proname,proacl::text,pg_get_userbyid(proowner) as owner,prosecdef,proconfig
      from pg_proc where proname in ('bm_apply_test_billing','bm_apply_live_billing') order by proname`)).rows;
    const before = await metadata();
    // Deliberately do NOT load 20261022141326_owned_subscription_plan_changes.
    await db.exec(await readFile('supabase/migrations/20261023153356_buyermatch_completed_checkout_guards.sql', 'utf8'));
    const fixture = async ({ state = 'completed', session = 'cs_synthetic', ownedSub = false } = {}) => {
      const owner = randomUUID(), id = randomUUID(), subscription = 'sub_synthetic_' + randomUUID();
      await db.query(`insert into bm_checkouts values($1,$2,'buyermatch','buyermatch-starter-v1',$3,$4)`, [id,owner,state,session]);
      if (ownedSub) await db.query(`insert into bm_entitlements values($1,'buyermatch',$2)`, [owner,subscription]);
      return { owner,id,subscription };
    };
    const call = (mode, f, { owner = f.owner, price = 'price_synthetic_starter', subscription = f.subscription } = {}) =>
      db.query(`select bm_apply_${mode}_billing($1,'evt_synthetic',1,$2,'buyermatch',$3,$4,'active',now(),now()+interval '1 month')`, [f.id,owner,price,subscription]);
    const count = async () => (await db.query('select count(*)::int as n from local_applied')).rows[0].n;
    await t.test('function owner/ACL/definer/search-path metadata preserved', async () => assert.deepEqual(await metadata(), before));
    for (const mode of ['test','live']) {
      await t.test(mode + ': completed owned initial activation accepted', async () => {
        const f=await fixture(), n=await count(); await call(mode,f); assert.equal(await count(),n+1);
      });
      await t.test(mode + ': pending/null/blank Checkout session denied atomically', async () => {
        for (const options of [{state:'pending'}, {session:null}, {session:'   '}]) {
          const f=await fixture(options), n=await count(); await assert.rejects(call(mode,f),/mapping/); assert.equal(await count(),n);
        }
      });
      await t.test(mode + ': same-owned tier change works; foreign ownership/subscription denied', async () => {
        const f=await fixture({ownedSub:true}), n=await count();
        await call(mode,f,{price:'price_synthetic_pro'}); assert.equal(await count(),n+1);
        for (const change of [{owner:randomUUID(),price:'price_synthetic_pro'}, {subscription:'sub_foreign',price:'price_synthetic_pro'}]) {
          await assert.rejects(call(mode,f,change),/mapping/); assert.equal(await count(),n+1);
        }
      });
    }
    await t.test('actual anon/authenticated execution denied; service-only grant preserved', async () => {
      const f=await fixture(), n=await count();
      for (const role of ['anon','authenticated']) {
        await db.exec('set role '+role);
        try { await assert.rejects(call('test',f),/permission denied/); }
        finally { await db.exec('reset role'); }
      }
      for (const mode of ['test','live']) {
        const fn='bm_apply_'+mode+'_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)';
        assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed",[fn])).rows[0].allowed,true);
      }
      assert.equal(await count(),n);
    });
    await t.test('disabled live configuration refuses activation and CRM sentinel unchanged', async () => {
      const f=await fixture(), n=await count(); await db.exec('update bm_live_billing_config set enabled=false');
      await assert.rejects(call('live',f),/disabled/); assert.equal(await count(),n);
      assert.deepEqual((await db.query('select * from local_crm_sentinel')).rows,[{plan:'Pro',role:'Owner'}]);
    });
  } finally { await db.close(); }
});
