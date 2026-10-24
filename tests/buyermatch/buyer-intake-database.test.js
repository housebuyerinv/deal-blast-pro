import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const owner=randomUUID(),customer=randomUUID();
const schema=`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;grant usage on schema auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
create table account_profiles(user_id uuid primary key,role text,account_status text);
create table buyer_portal_submissions(id uuid primary key default gen_random_uuid(),status text default 'pending_review',buyer_data jsonb,created_at timestamptz default now(),imported_at timestamptz,approved_at timestamptz,approved_by text,created_buyer_id text);
alter table buyer_portal_submissions enable row level security;
grant all on buyer_portal_submissions to anon,authenticated,service_role;
create policy legacy_public_read on buyer_portal_submissions for select to anon,authenticated using(true);
create policy legacy_public_update on buyer_portal_submissions for update to anon,authenticated using(true) with check(true);`;
await db.exec(schema);
await db.query("insert into auth.users values($1,'housebuyerinv@gmail.com',now(),null),($2,'customer@example.invalid',now(),null)",[owner,customer]);
await db.query("insert into account_profiles values($1,'Admin','Active'),($2,'Admin','Active')",[owner,customer]);
const historical=randomUUID();
await db.query("insert into buyer_portal_submissions(id,status,buyer_data) values($1,'imported',$2)",[historical,{name:'Synthetic prior review',optedOut:true}]);
const original=(await db.query('select id,status,buyer_data,created_at from buyer_portal_submissions where id=$1',[historical])).rows;
await db.exec('set role anon');
const legacyReadCount=(await db.query('select count(*)::int as n from buyer_portal_submissions')).rows[0].n;
await db.exec('reset role');
// Reproduce the actual Production state, not just the older permissive bootstrap.
await db.exec(await readFile('scripts/security/contain-buyer-intake.sql','utf8'));
await assert.rejects(db.exec('set role anon;select id from buyer_portal_submissions'));
await db.exec('reset role');
await db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8'));
const payload=()=>({name:'Synthetic buyer',company:'Synthetic entity',email:'buyer@example.invalid',phone:'555-0100',markets:['AL'],assetTypes:['SFH'],portalForm:{consent:true,dealConsent:true},proofFiles:[]});
async function as(role,uid,fn){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);try{return await fn()}finally{await db.exec('reset role')}}
const submit=(key,value=payload())=>db.query('select bm_submit_buyer_intake($1,$2) as receipt',[key,value]);
test('migration closes reproduced legacy exposure without changing pre-existing data',async()=>{
 assert.equal(legacyReadCount,1);
 assert.deepEqual((await db.query('select id,status,buyer_data,created_at from buyer_portal_submissions where id=$1',[historical])).rows,original);
});

test('fresh legacy environments also converge safely without an emergency migration history entry',async()=>{
 const legacy=new PGlite();try{
  await legacy.exec(schema);
  await legacy.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8'));
  await legacy.exec('set role anon');
  const receipt=(await legacy.query('select bm_submit_buyer_intake($1,$2) receipt',[randomUUID(),payload()])).rows[0].receipt;
  assert.deepEqual(Object.keys(receipt).sort(),['id','recorded']);assert.equal(receipt.recorded,true);
  await assert.rejects(legacy.query('select buyer_data from buyer_portal_submissions'),e=>e.code==='42501');
 }finally{await legacy.close()}
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
 await db.query("update account_profiles set account_status='Disabled' where user_id=$1",[owner]);
 assert.equal((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length,0);
 await db.query("update account_profiles set account_status='Active',role='Member' where user_id=$1",[owner]);
 assert.equal((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length,0);
 await db.query("update account_profiles set role='Admin' where user_id=$1",[owner]);
});

test('owner can resolve reviews but cannot overwrite submitted data, consent or identity',async()=>{
 assert.equal((await as('authenticated',owner,()=>db.query("update buyer_portal_submissions set status='imported',imported_at=now(),approved_at=now(),approved_by='owner',created_buyer_id='synthetic' where id=$1 returning id",[historical]))).rows.length,1);
 for(const q of ["update buyer_portal_submissions set buyer_data='{}'",'update buyer_portal_submissions set submission_key=gen_random_uuid()', 'update buyer_portal_submissions set id=gen_random_uuid()', 'delete from buyer_portal_submissions', 'truncate buyer_portal_submissions']){
  await assert.rejects(as('authenticated',owner,()=>db.exec(q)),e=>e.code==='42501');
 }
});

test('receipt and review RPC privileges and definer search paths are explicitly scoped',async()=>{
 const functions=(await db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('bm_submit_buyer_intake','bm_can_review_buyer_intake')")).rows;
 assert.equal(functions.length,2);for(const f of functions){assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=""'));}
 await assert.rejects(as('anon',null,()=>db.query('select bm_can_review_buyer_intake()')),e=>e.code==='42501');
 assert.equal((await as('authenticated',customer,()=>db.query('select bm_can_review_buyer_intake() allowed'))).rows[0].allowed,false);
 assert.equal((await db.query("select count(*)::int n from pg_proc p cross join lateral aclexplode(p.proacl) a where p.proname in ('bm_submit_buyer_intake','bm_can_review_buyer_intake') and a.grantee=0")).rows[0].n,0);
});

test('forward migration replay preserves receipts, data and least-privilege review',async()=>{
 const key=randomUUID();const receipt=(await as('anon',null,()=>submit(key))).rows;
 const before=(await db.query('select * from buyer_portal_submissions order by id')).rows;
 await db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8'));
 assert.deepEqual((await db.query('select * from buyer_portal_submissions order by id')).rows,before);
 assert.deepEqual((await as('anon',null,()=>submit(key))).rows,receipt);
 assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='dbp_emergency_intake_deny'")).rows[0].n,0);
 assert.equal((await as('authenticated',customer,()=>db.query('select id from buyer_portal_submissions'))).rows.length,0);
 assert.ok((await as('authenticated',owner,()=>db.query('select id from buyer_portal_submissions'))).rows.length>0);
});

test('permanent deny policies withstand accidental client DML regrants without stopping receipt creation',async()=>{
 await db.exec(`create policy synthetic_legacy_all on buyer_portal_submissions for all to anon,authenticated using(true) with check(true);
 grant select,insert,update,delete on buyer_portal_submissions to anon,authenticated`);
 assert.equal((await as('anon',null,()=>db.query('select * from buyer_portal_submissions'))).rows.length,0);
 assert.equal((await as('anon',null,()=>db.query("update buyer_portal_submissions set status='forged' returning id"))).rows.length,0);
 await assert.rejects(as('authenticated',owner,()=>db.exec("insert into buyer_portal_submissions(status,buyer_data) values('pending_review','{}')")),e=>e.code==='42501');
 assert.equal((await as('authenticated',owner,()=>db.query('delete from buyer_portal_submissions returning id'))).rows.length,0);
 assert.equal((await as('anon',null,()=>submit(randomUUID()))).rows[0].receipt.recorded,true);
 await db.exec('drop policy synthetic_legacy_all on buyer_portal_submissions');
 await db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8'));
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
 const p=payload();p.proofFiles=[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:`buyer-documents/${customer}/proof.pdf`,verificationStatus:'Verified',uploadedBy:owner,isVerified:true}];
 const key=randomUUID();assert.equal((await as('authenticated',customer,()=>submit(key,p))).rows[0].receipt.recorded,true);
 const stored=(await db.query('select buyer_data from buyer_portal_submissions where submission_key=$1',[key])).rows[0].buyer_data.proofFiles[0];
 assert.equal(stored.verificationStatus,'Pending Review');assert.equal(stored.uploadedBy,customer);assert.equal('isVerified' in stored,false);
});
test('crafted role/source/verification fields never enter review records',async()=>{
 const key=randomUUID(),p={...payload(),role:'Admin',isVerified:true,consentStatus:'verified',workspace_id:owner,tags:['Verified Buyer'],fundingStatus:'Verified'};
 p.portalForm.isVerified=true;p.portalForm.website='javascript:unsafe';
 await as('anon',null,()=>submit(key,p));
 const row=(await db.query('select buyer_data from buyer_portal_submissions where submission_key=$1',[key])).rows[0].buyer_data;
 for(const field of ['role','isVerified','consentStatus','workspace_id'])assert.equal(field in row,false);
 assert.deepEqual(row.tags,['Buyer Portal','Pending Review']);assert.equal(row.fundingStatus,'Proof needed');
 assert.equal('isVerified' in row.portalForm,false);assert.equal(row.portalForm.website,'');
});
test('unsafe website and disguised owner-prefix traversal cannot be submitted',async()=>{
 for(const website of ['javascript:unsafe','data:text/html,unsafe']){
  await assert.rejects(as('anon',null,()=>submit(randomUUID(),{...payload(),website})));
 }
 for(const suffix of ['../../foreign/proof.pdf','%2e%2e/foreign.pdf','..\\foreign.pdf']){
  const p=payload();p.proofFiles=[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:`buyer-documents/${customer}/${suffix}`}];
  await assert.rejects(as('authenticated',customer,()=>submit(randomUUID(),p)));
 }
});

test('failure at final restoration step rolls back to actual containment without changing records',async()=>{
 const before=(await db.query('select * from buyer_portal_submissions order by id')).rows;
 await db.exec(await readFile('scripts/security/contain-buyer-intake.sql','utf8'));
 const migration=await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8');
 const interrupted=migration.replace('drop policy if exists dbp_emergency_intake_deny',"select nonexistent_synthetic_restoration_gate();\ndrop policy if exists dbp_emergency_intake_deny");
 await assert.rejects(db.exec(interrupted),/nonexistent_synthetic_restoration_gate/);await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='dbp_emergency_intake_deny'")).rows[0].n,1);
 for(const role of ['anon','authenticated'])await assert.rejects(as(role,null,()=>db.query('select id from buyer_portal_submissions')),e=>e.code==='42501');
 assert.deepEqual((await db.query('select * from buyer_portal_submissions order by id')).rows,before);
 await db.exec(migration);
});

test('an existing incompatible receipt index is rejected rather than silently accepted on retry',async()=>{
 await db.exec('drop index buyer_portal_submission_key_unique;create index buyer_portal_submission_key_unique on buyer_portal_submissions(submission_key)');
 await assert.rejects(db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8')),/Unexpected intake receipt schema/);
 await db.exec('rollback');
 assert.equal((await db.query("select indisunique from pg_index where indexrelid='buyer_portal_submission_key_unique'::regclass")).rows[0].indisunique,false);
 await db.exec('drop index buyer_portal_submission_key_unique;create unique index buyer_portal_submission_key_unique on buyer_portal_submissions(submission_key)');
});

test('inherited column INSERT cannot silently bypass the create-only receipt contract on restoration',async()=>{
 await db.exec(await readFile('scripts/security/contain-buyer-intake.sql','utf8'));
 await db.exec('create role unexpected_intake_writer;grant unexpected_intake_writer to authenticated;grant insert(status) on buyer_portal_submissions to unexpected_intake_writer');
 await assert.rejects(db.exec(await readFile('supabase/migrations/20261024000845_buyermatch_private_buyer_intake.sql','utf8')),/Unexpected inherited review column privilege/);
 await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='dbp_emergency_intake_deny'")).rows[0].n,1);
});
test.after(()=>db.close());
