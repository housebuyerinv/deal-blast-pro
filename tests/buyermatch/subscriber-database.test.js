import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
const db=new PGlite();
const owner=randomUUID(),other=randomUUID(),checkout=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table bm_plans(version text primary key,product text,stripe_price_id text,approved boolean,allowance integer);
create table bm_checkouts(id uuid,owner_id uuid,product text,plan_version text,state text default 'completed',session_id text default 'cs_fixture');
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
const identities=async()=> (await db.query("select proname,proacl::text as acl,pg_get_userbyid(proowner) as owner,prosecdef,proconfig from pg_proc where proname in ('bm_apply_test_billing','bm_apply_live_billing') order by proname")).rows;
const originalIdentities=await identities();
const rollbackDefinitions=(await db.query("select pg_get_functiondef(oid) as definition from pg_proc where proname in ('bm_apply_test_billing','bm_apply_live_billing') order by proname")).rows.map(r=>r.definition+';').join('\n');
const correctedMigration=await readFile('supabase/migrations/20261023153356_buyermatch_completed_checkout_guards.sql','utf8');
await db.exec(correctedMigration);
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

test('tier changes preserve completed-checkout and session prerequisites in both modes',async()=>{
 await db.exec('update bm_live_billing_config set enabled=true');
 try {
  for(const mode of ['test','live']) {
   await db.exec("update bm_checkouts set state='pending'");
   await assert.rejects(apply(mode),/mapping/);
   await db.exec("update bm_checkouts set state='completed',session_id=null");
   await assert.rejects(apply(mode),/mapping/);
   await db.exec("update bm_checkouts set session_id='cs_fixture'");
  }
 } finally { await db.exec("update bm_checkouts set state='completed',session_id='cs_fixture'"); }
});

test('both billing entrypoints retain owner serialization and fixed search path',async()=>{
 for(const mode of ['test','live']) {
  const result=await db.query(`select prosrc,proconfig from pg_proc where proname=$1`,['bm_apply_'+mode+'_billing']);
  assert.match(result.rows[0].prosrc,/perform pg_advisory_xact_lock\(hashtextextended\(p_owner::text,0\)\)/);
  assert.deepEqual(result.rows[0].proconfig,['search_path=public']);
 }
});

test('new migration preserves exact function owners, ACLs, security-definer and search paths',async()=>{
 assert.deepEqual(await identities(),originalIdentities);
});

test('corrected initial and tier-change guards reject pending, null and blank sessions in both modes',async()=>{
 for(const mode of ['test','live'])for(const price of ['price_starter','price_pro']){
  for(const [state,session] of [['pending','cs_fixture'],['completed',null],['completed',''],['completed','   ']]){
   await db.query('update bm_checkouts set state=$1,session_id=$2',[state,session]);
   await assert.rejects(apply(mode,{3:price}),/mapping/);
  }
 }
 await db.exec("update bm_checkouts set state='completed',session_id='cs_fixture'");
});

test('service role can execute valid billing while browser roles are denied by PostgreSQL',async()=>{
 for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{
  await tx.exec('set local role '+role);
  await tx.query("select bm_apply_test_billing($1,'evt_denied',1,$2,'buyermatch','price_starter','sub_owned','active',now(),now()+interval '1 month')",[checkout,owner]);
 }),/permission denied/);
 await db.transaction(async tx=>{
  await tx.exec('set local role service_role');
  await tx.query("select bm_apply_test_billing($1,'evt_service',1,$2,'buyermatch','price_starter','sub_owned','active',now(),now()+interval '1 month')",[checkout,owner]);
 });
});

test('paused rollback/roll-forward rehearsal preserves all local rows and grants',async()=>{
 const before=(await db.query('select * from applied order by price,subscription')).rows;
 await db.exec('begin;'+rollbackDefinitions+'commit;');
 assert.deepEqual(await identities(),originalIdentities);
 await db.exec(correctedMigration);
 assert.deepEqual(await identities(),originalIdentities);
 assert.deepEqual((await db.query('select * from applied order by price,subscription')).rows,before);
});

test('migration refuses a widened browser EXECUTE grant before replacing functions',async()=>{
 await db.exec('grant execute on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to authenticated');
 try {await assert.rejects(db.exec(correctedMigration),/service-only/);} finally {
  await db.exec('rollback');
  await db.exec('revoke execute on function bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from authenticated');
 }
 assert.deepEqual(await identities(),originalIdentities);
});

test('migration also refuses non-browser custom EXECUTE grantees instead of repairing unknown privileges',async()=>{
 await db.exec('create role local_unexpected_role; grant execute on function bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to local_unexpected_role');
 try {await assert.rejects(db.exec(correctedMigration),/service-only/);} finally {
  await db.exec('rollback');
  await db.exec('revoke execute on function bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from local_unexpected_role');
 }
 assert.deepEqual(await identities(),originalIdentities);
});
test.after(()=>db.close());
