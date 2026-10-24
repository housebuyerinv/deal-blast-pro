import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const sql=await readFile('scripts/security/contain-buyer-intake.sql','utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table buyer_portal_submissions(id int primary key,status text,buyer_data jsonb);
 create table unrelated(id int);
 insert into buyer_portal_submissions values(1,'pending_review','{"synthetic":true}');
 grant all on buyer_portal_submissions to public,anon,authenticated,service_role;
 grant select(id),update(buyer_data) on buyer_portal_submissions to anon,authenticated;
 grant all on unrelated to anon,authenticated;
 alter table buyer_portal_submissions enable row level security;
 create policy "App can read pending buyer portal submissions" on buyer_portal_submissions for select to anon,authenticated using(true);
 create policy "App can update buyer portal submissions" on buyer_portal_submissions for update to anon,authenticated using(true) with check(true);
 create policy "Public can create buyer portal submissions" on buyer_portal_submissions for insert to anon,authenticated with check(status='pending_review');
 create policy unrelated_policy on buyer_portal_submissions for all to anon,authenticated using(true) with check(true);`);
 // PGlite's database owner is postgres, matching the provider precondition.
 return db;
}
async function role(db,r,query){await db.exec(`set role ${r}`);try{return await db.query(query)}finally{await db.exec('reset role')}}
for(const r of ['anon','authenticated'])test(`${r}: all direct table mutations/reads and receipt inserts denied`,async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  for(const q of ['select * from buyer_portal_submissions','select id from buyer_portal_submissions',
   "update buyer_portal_submissions set buyer_data='{}' where id=1",
   "insert into buyer_portal_submissions values(2,'pending_review','{}') returning id",
   'delete from buyer_portal_submissions','truncate buyer_portal_submissions']){
   await assert.rejects(role(db,r,q),e=>e.code==='42501');
  }
  assert.equal((await db.query('select count(*)::int n from buyer_portal_submissions')).rows[0].n,1);
 }finally{await db.close()}
});
test('server review and unrelated client operations remain available; rows unchanged; repeat safe',async()=>{
 const db=await fixture();try{
  const before=(await db.query('select * from buyer_portal_submissions')).rows;
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await role(db,'service_role','select * from buyer_portal_submissions')).rows,before);
  assert.equal((await role(db,'service_role',"update buyer_portal_submissions set status=status returning id")).rows.length,1);
  assert.deepEqual((await db.query('select * from buyer_portal_submissions')).rows,before);
  await role(db,'anon','insert into unrelated values(1)');
  assert.equal((await role(db,'authenticated','select * from unrelated')).rows.length,1);
 }finally{await db.close()}
});
test('restrictive policy prevents permissive-policy bypass after accidental regrant',async()=>{
 const db=await fixture();try{
  await db.exec(sql);await db.exec('grant select,insert,update,delete on buyer_portal_submissions to anon,authenticated');
  assert.equal((await role(db,'anon','select * from buyer_portal_submissions')).rows.length,0);
  assert.equal((await role(db,'authenticated',"update buyer_portal_submissions set status='forged' returning id")).rows.length,0);
  await assert.rejects(role(db,'anon',"insert into buyer_portal_submissions values(2,'pending_review','{}')"),e=>e.code==='42501');
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='unrelated_policy'")).rows[0].n,1);
 }finally{await db.close()}
});
test('unexpected inherited access aborts transaction without partial DDL',async()=>{
 const db=await fixture();try{
  await db.exec('create role unexpected;grant unexpected to authenticated;grant select on buyer_portal_submissions to unexpected');
  await assert.rejects(db.exec(sql),/Unexpected residual table privilege/);await db.exec('rollback');
  assert.equal((await db.query("select has_table_privilege('anon','buyer_portal_submissions','SELECT') ok")).rows[0].ok,true);
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='dbp_emergency_intake_deny'")).rows[0].n,0);
 }finally{await db.close()}
});
test('missing expected server authority stops before changing permissions',async()=>{
 const db=await fixture();try{
  await db.exec('alter role service_role nobypassrls');
  await assert.rejects(db.exec(sql),/Expected server access absent/);await db.exec('rollback');
  assert.equal((await db.query("select has_table_privilege('anon','buyer_portal_submissions','SELECT') ok")).rows[0].ok,true);
 }finally{await db.close()}
});
