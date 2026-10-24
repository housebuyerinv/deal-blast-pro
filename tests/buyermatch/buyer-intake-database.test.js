import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const owner=randomUUID(),customer=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;grant usage on schema auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
create table account_profiles(user_id uuid primary key,role text,account_status text);
create table buyer_portal_submissions(id uuid primary key default gen_random_uuid(),status text default 'pending_review',buyer_data jsonb,created_at timestamptz default now());
alter table buyer_portal_submissions enable row level security;
grant all on buyer_portal_submissions to anon,authenticated,service_role;
create policy legacy_public_read on buyer_portal_submissions for select to anon,authenticated using(true);
create policy legacy_public_update on buyer_portal_submissions for update to anon,authenticated using(true) with check(true);`);
await db.query("insert into auth.users values($1,'housebuyerinv@gmail.com',now(),null),($2,'customer@example.invalid',now(),null)",[owner,customer]);
await db.query("insert into account_profiles values($1,'Admin','Active'),($2,'Admin','Active')",[owner,customer]);
const historical=randomUUID();
await db.query("insert into buyer_portal_submissions(id,status,buyer_data) values($1,'imported',$2)",[historical,{name:'Synthetic prior review',optedOut:true}]);
const original=(await db.query('select id,status,buyer_data,created_at from buyer_portal_submissions where id=$1',[historical])).rows;
await db.exec('set role anon');
const legacyReadCount=(await db.query('select count(*)::int as n from buyer_portal_submissions')).rows[0].n;
await db.exec('reset role');
await db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8'));
const payload=()=>({name:'Synthetic buyer',company:'Synthetic entity',email:'buyer@example.invalid',phone:'555-0100',markets:['AL'],assetTypes:['SFH'],portalForm:{consent:true,dealConsent:true},proofFiles:[]});
async function as(role,uid,fn){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);try{return await fn()}finally{await db.exec('reset role')}}
const submit=(key,value=payload())=>db.query('select bm_submit_buyer_intake($1,$2) as receipt',[key,value]);
test('migration closes reproduced legacy exposure without changing pre-existing data',async()=>{
 assert.equal(legacyReadCount,1);
 assert.deepEqual((await db.query('select id,status,buyer_data,created_at from buyer_portal_submissions where id=$1',[historical])).rows,original);
});
test('anonymous submission creates only a receipt, pending state and server-recorded separate consent',async()=>{
 const key=randomUUID(),r=await as('anon',null,()=>submit(key));
 assert.deepEqual(Object.keys(r.rows[0].receipt).sort(),['id','recorded']);
 const row=(await db.query('select * from buyer_portal_submissions where submission_key=$1',[key])).rows[0];
 assert.equal(row.status,'pending_review');assert.equal(row.buyer_data.blastEligible,false);
 assert.equal(row.buyer_data.consent.dealInvitations,true);assert.ok(row.buyer_data.consent.recordedAt);
});
test('duplicate retry returns one receipt; changed payload cannot overwrite the row',async()=>{
 const key=randomUUID(),first=await as('anon',null,()=>submit(key));
 const second=await as('anon',null,()=>submit(key,{...payload(),submittedAt:'different-client-clock'}));
 assert.deepEqual(first.rows,second.rows);
 await assert.rejects(as('anon',null,()=>submit(key,{...payload(),name:'Changed'})));
 assert.equal((await db.query('select count(*)::int as n from buyer_portal_submissions where submission_key=$1',[key])).rows[0].n,1);
});
test('legacy public grants/policies cannot expose or change buyer records',async()=>{
 await assert.rejects(as('anon',null,()=>db.query('select * from buyer_portal_submissions')));
 await assert.rejects(as('anon',null,()=>db.query("update buyer_portal_submissions set status='approved'")));
 assert.equal((await as('authenticated',customer,()=>db.query('select * from buyer_portal_submissions'))).rows.length,0);
 assert.equal((await as('authenticated',customer,()=>db.query("update buyer_portal_submissions set status='approved' returning id"))).rows.length,0);
 await assert.rejects(as('authenticated',customer,()=>db.exec('truncate buyer_portal_submissions')));
});
test('confirmed active platform owner can review while normal Admin cannot impersonate owner',async()=>{
 assert.ok((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length>0);
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);
 assert.equal((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length,0);
 await db.query('update auth.users set email_confirmed_at=now(),banned_until=now()+interval \'1 day\' where id=$1',[owner]);
 assert.equal((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length,0);
 await db.query('update auth.users set banned_until=null where id=$1',[owner]);
});
for(const [name,change] of Object.entries({noAccuracy:p=>{p.portalForm.consent=false},badEmail:p=>{p.email='invalid'},noMarket:p=>{p.markets=[]},badAsset:p=>{p.assetTypes={}},huge:p=>{p.notes='x'.repeat(140000)},anonymousProof:p=>{p.proofFiles=[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:'buyer-documents/foreign/proof.pdf'}]}}))test(`invalid ${name} writes nothing`,async()=>{
 const p=payload();change(p);const key=randomUUID();
 await assert.rejects(as('anon',null,()=>submit(key,p)));
 assert.equal((await db.query('select count(*)::int as n from buyer_portal_submissions where submission_key=$1',[key])).rows[0].n,0);
});
test('optional invitation consent defaults false; client cannot self-approve or forge evidence',async()=>{
 const key=randomUUID(),p=payload();delete p.portalForm.dealConsent;p.blastEligible=true;p.status='approved';p.consent={dealInvitations:true};
 await as('anon',null,()=>submit(key,p));
 const r=(await db.query('select status,buyer_data from buyer_portal_submissions where submission_key=$1',[key])).rows[0];
 assert.equal(r.status,'pending_review');assert.equal(r.buyer_data.blastEligible,false);assert.equal(r.buyer_data.consent.dealInvitations,false);
});
test('authenticated proof metadata cannot point at another account or embed file contents',async()=>{
 for(const proof of [{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:`buyer-documents/${owner}/proof.pdf`},{storageProvider:'local',fileDataUrl:'data:private'}]){
  const p=payload();p.proofFiles=[proof];await assert.rejects(as('authenticated',customer,()=>submit(randomUUID(),p)));
 }
 const p=payload();p.proofFiles=[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:`buyer-documents/${customer}/proof.pdf`}];
 assert.equal((await as('authenticated',customer,()=>submit(randomUUID(),p))).rows[0].receipt.recorded,true);
});
test.after(()=>db.close());
