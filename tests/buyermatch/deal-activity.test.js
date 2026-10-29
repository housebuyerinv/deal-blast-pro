import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile('supabase/migrations/20260930120000_buyermatch_foundation.sql','utf8'));
await db.exec(`create table bm_responses(id uuid primary key default gen_random_uuid(),exposure_id uuid references bm_exposures,kind text,created_at timestamptz default now());`);
const migration = await readFile('supabase/migrations/20261028025423_buyermatch_deal_activity.sql','utf8');
await db.exec(migration);
after(() => db.close());
const owner = randomUUID(), deal = randomUUID(), buyer = randomUUID(), exposure = randomUUID();
await db.query('insert into auth.users values($1)',[owner]);
await db.query(`insert into bm_deals(id,owner_id,property) values($1,$2,'{}')`,[deal,owner]);
await db.query(`insert into bm_buyers(id,identity_ciphertext,identity_hash,criteria) values($1,'PRIVATE-CIPHERTEXT','PRIVATE-HASH','{}')`,[buyer]);
await db.query(`insert into bm_exposures(id,deal_id,owner_id,buyer_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')`,[exposure,deal,owner,buyer,randomUUID()]);
await db.query(`insert into bm_outbox(exposure_id,state,accepted_at,delivered_at) values($1,'delivered',now(),now())`,[exposure]);
for (let index=0;index<23;index++) await db.query(`insert into bm_responses(exposure_id,kind,created_at) values($1,$2,$3)`,[exposure,index===22?'declined':'interested',new Date(Date.UTC(2026,0,1,0,0,index)).toISOString()]);
const activity = async (actor=owner, page=0) => (await db.query('select bm_deal_activity($1,$2,$3) result',[actor,deal,page])).rows[0].result;
test('actual SQL reports latest decisions and bounded history, without private identities',async()=>{
  const result=await activity();
  assert.deepEqual(result.summary,{reserved:1,accepted:1,delivered:1,pending:0,suppressed:0,interests:0,offers:0,declines:1});
  assert.equal(result.history.length,20);assert.equal(result.hasMore,true);
  assert.equal(result.history[0].kind,'declined');
  assert.equal(result.history[0].buyerRef,`BM-${createHash('sha256').update(buyer).digest('hex').slice(0,8).toUpperCase()}`);
  for(const secret of [buyer,exposure,'PRIVATE-CIPHERTEXT','PRIVATE-HASH']) assert.equal(JSON.stringify(result).includes(secret),false);
});
test('history pagination is stable and nonoverlapping',async()=>{
  const first=await activity(), second=await activity(owner,1);
  assert.equal(second.history.length,3);assert.equal(second.hasMore,false);
  assert.equal(second.history.some(row=>first.history.some(item=>item.id===row.id)),false);
  assert.equal((await activity(owner,2)).history.length,0);
});
test('current interests and offers clear on later decline or unsubscribe without rewriting history',async()=>{
  await db.exec('begin');
  try {
    for (const [index,kind] of ['interested','offer','unsubscribe'].entries()) {
      await db.query(`insert into bm_responses(exposure_id,kind,created_at) values($1,$2,$3)`,[exposure,kind,new Date(Date.UTC(2027,0,1,0,0,index)).toISOString()]);
      const result=await activity();
      assert.equal(result.summary.interests,kind==='interested'?1:0);
      assert.equal(result.summary.offers,kind==='offer'?1:0);
      assert.equal(result.summary.declines,0);
    }
    assert.equal((await db.query('select count(*) n from bm_responses')).rows[0].n,26);
  } finally {await db.exec('rollback');}
});
test('foreign exposures never contribute to a deal summary or response page',async()=>{
  await db.exec('begin');
  try {
    const foreign=randomUUID(),other=randomUUID(),otherExposure=randomUUID();
    await db.query('insert into auth.users values($1)',[foreign]);
    await db.query(`insert into bm_deals(id,owner_id,property) values($1,$2,'{}')`,[other,foreign]);
    await db.query(`insert into bm_exposures(id,deal_id,owner_id,buyer_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')`,[otherExposure,other,foreign,buyer,randomUUID()]);
    await db.query(`insert into bm_responses(exposure_id,kind) values($1,'offer')`,[otherExposure]);
    const result=await activity();assert.equal(result.summary.reserved,1);assert.equal(result.summary.offers,0);
    assert.equal(JSON.stringify(result).includes(otherExposure),false);
  } finally {await db.exec('rollback');}
});
test('foreign owner and invalid pages are denied by the database itself',async()=>{
  await assert.rejects(activity(randomUUID()),/Deal not found/);
  await assert.rejects(activity(null),/Invalid activity/);
  for(const page of [-1,100001,null]) await assert.rejects(activity(owner,page),/Invalid activity/);
});
test('browser roles cannot execute the service-only function and it does not elevate caller privileges',async()=>{
  for(const role of ['anon','authenticated']) assert.equal((await db.query(`select has_function_privilege($1,'bm_deal_activity(uuid,uuid,integer)','execute') allowed`,[role])).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege('service_role','bm_deal_activity(uuid,uuid,integer)','execute') allowed`)).rows[0].allowed,true);
  assert.equal((await db.query("select prosecdef from pg_proc where proname='bm_deal_activity'")).rows[0].prosecdef,false);
});
test('activity is read-only and migration reapplication preserves the forensic rows',async()=>{
  const before=(await db.query('select count(*) n from bm_responses')).rows[0].n;
  await db.exec(migration);await activity();
  assert.equal((await db.query('select count(*) n from bm_responses')).rows[0].n,before);
  assert.equal((await db.query('select provolatile from pg_proc where proname=\'bm_deal_activity\'')).rows[0].provolatile,'s');
});
