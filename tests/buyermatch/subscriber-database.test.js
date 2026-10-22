import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
const db=new PGlite();
const owner=randomUUID(),other=randomUUID(),checkout=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table bm_plans(version text primary key,product text,stripe_price_id text,approved boolean,allowance integer);
create table bm_checkouts(id uuid,owner_id uuid,product text,plan_version text);
create table bm_entitlements(owner_id uuid,product text,stripe_subscription_id text);
create table bm_live_billing_config(id boolean,enabled boolean,verified boolean);
create table applied(owner_id uuid,price text,subscription text);
create function bm_apply_billing(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language sql as $$insert into applied values($3,$5,$6)$$;
-- Existing service-only RPC ACLs must survive CREATE OR REPLACE.
create function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language sql as $$select$$;
create function bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) returns void language sql as $$select$$;
revoke all on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz),bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz),bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
insert into bm_plans values('buyermatch-starter-v1','buyermatch','price_starter',true,20),('buyermatch-pro-v1','buyermatch','price_pro',true,50),('other','buyermatch','price_bad',true,999);
insert into bm_live_billing_config values(true,true,true);`);
await db.query('insert into bm_checkouts values($1,$2,$3,$4)',[checkout,owner,'buyermatch','buyermatch-starter-v1']);
await db.exec(await readFile('supabase/migrations/20261022141326_buyermatch_owned_subscription_plan_changes.sql','utf8'));
const apply=(mode,overrides={})=>db.query(`select bm_apply_${mode}_billing($1,'evt',1,$2,$3,$4,$5,'active',now(),now()+interval '1 month')`,[checkout,owner,'buyermatch','price_pro','sub_owned'].map((v,i)=>overrides[i]??v));
test('new subscription cannot use a price different from its checkout',async()=>{await assert.rejects(apply('test'));await assert.rejects(apply('live'));});
test('approved upgrade/downgrade stays on same owned subscription; foreign and unapproved mappings fail',async()=>{
 await db.query('insert into bm_entitlements values($1,$2,$3)',[owner,'buyermatch','sub_owned']);
 for(const mode of ['test','live']) {
  await apply(mode);await apply(mode,{3:'price_starter'});
  for(const overrides of [{1:other},{4:'sub_foreign'},{3:'price_bad'},{2:'network'},{0:randomUUID()}]) await assert.rejects(apply(mode,overrides));
 }
 assert.equal((await db.query('select count(*)::int n from applied')).rows[0].n,4);
});
test('live config gate and service-only grants remain intact',async()=>{
 await db.exec('update bm_live_billing_config set enabled=false');await assert.rejects(apply('live'),/disabled/);
 for(const mode of ['test','live']) for(const role of ['anon','authenticated','service_role']) {
  const result=await db.query(`select has_function_privilege($1,'bm_apply_${mode}_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)','EXECUTE') allowed`,[role]);
  assert.equal(result.rows[0].allowed,role==='service_role');
 }
});
test.after(()=>db.close());
