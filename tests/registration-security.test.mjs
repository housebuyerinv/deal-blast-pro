import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import { Buffer } from 'node:buffer'

const compiled = await build({ entryPoints: ['api/_registrationIntent.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { signRegistrationIntent, verifyRegistrationIntent } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const key = 'synthetic-only-secret', now = Date.now()
const intent = { version: 1, email: 'new@example.test', name: 'New User', company: '', role: 'Admin', plan: 'Starter', documents: [], expires: now + 86400000 }
test('signed intent preserves CRM selection but does not grant paid access', () => {
  for (const plan of ['Free','Starter','Pro']) {
    const token = signRegistrationIntent({ ...intent, plan }, key, now)
    assert.equal(verifyRegistrationIntent(token, intent.email, key, now).plan, plan)
  }
})
test('tampered, cross-account, expired and privileged intents fail', () => {
  const token = signRegistrationIntent(intent, key, now)
  assert.throws(() => verifyRegistrationIntent(token, 'other@example.test', key, now))
  assert.throws(() => verifyRegistrationIntent(token + 'bad', intent.email, key, now))
  assert.throws(() => verifyRegistrationIntent(token, intent.email, key, now + 86400001))
  for (const override of [{role:'Super Admin'},{plan:'Owner Admin'},{plan:'buyermatch-pro-v1'}]) assert.throws(() => signRegistrationIntent({...intent,...override},key,now))
})

const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);`)
let baseline = await readFile('supabase/migrations/20260712180000_registration_durability.sql','utf8')
await db.exec(baseline.replace('create extension if not exists pgcrypto;',''))
await db.exec(`alter table account_profiles add column display_name text, add column business_name text;
create table bm_documents(id uuid primary key,kind text,current boolean,approved boolean,document_hash text);
create table bm_acceptances(owner_id uuid,document_id uuid);
create table bm_entitlements(owner_id uuid,product text,status text);
-- Agreement dependency stub; this suite exercises transactionality, not the existing agreement implementation.
create function bm_accept_document(p_owner uuid,p_deal uuid,p_document uuid,p_hash text,p_signature text) returns void language sql as $$insert into bm_acceptances values(p_owner,p_document)$$;`)
await db.exec(await readFile('supabase/migrations/20261019233315_registration_create_only_provisioning.sql','utf8'))
const provision = (id, overrides={}) => db.query('select dbp_provision_registration($1,$2,$3,$4,$5,$6,$7,$8) as result', [id,`${id}@example.test`,'Synthetic User','Original Company','Admin','Starter',[],false].map((v,i)=>overrides[i]??v))
const identity = async (confirmed=true) => { const id=randomUUID(); await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.test`,confirmed?new Date():null]);return id }
const snapshot = async () => JSON.stringify((await db.query(`select jsonb_build_object('profiles',(select jsonb_agg(p order by user_id) from account_profiles p),'workspaces',(select jsonb_agg(w order by owner_user_id) from workspaces w),'billing',(select jsonb_agg(b order by user_id) from workspace_plan_assignments b),'events',(select jsonb_agg(e order by user_id) from account_registration_events e),'agreements',(select jsonb_agg(a order by owner_id) from bm_acceptances a),'entitlements',(select jsonb_agg(e order by owner_id) from bm_entitlements e)) as state`)).rows)
test('confirmed new account creates all records together with pending paid CRM status', async () => {
  const id=await identity(); assert.equal((await provision(id)).rows[0].result.created,true)
  assert.equal((await db.query('select billing_status from workspace_plan_assignments where user_id=$1',[id])).rows[0].billing_status,'Pending Payment')
})
test('unconfirmed or cross-account email cannot provision', async () => {
  const id=await identity(false), before=await snapshot()
  await assert.rejects(provision(id)); await assert.rejects(provision(await identity(),{1:'victim@example.test'}))
  assert.equal(await snapshot(),before)
})
test('duplicate retries and 16 queued calls create exactly one account (serialized PGlite)', async () => {
  const id=await identity(); const results=await Promise.all(Array.from({length:16},()=>provision(id)))
  assert.equal(results.filter(r=>r.rows[0].result.created).length,1)
  const before=await snapshot(); await provision(id); assert.equal(await snapshot(),before)
})
test('existing customer workspace, role, CRM subscription and BuyerMatch remain immutable', async () => {
  const id=await identity();await provision(id)
  await db.query("update account_profiles set role='Super Admin' where user_id=$1",[id])
  await db.query("update workspace_plan_assignments set plan_name='Pro',billing_status='Paid Active' where user_id=$1",[id])
  await db.query("insert into bm_entitlements values($1,'buyermatch','active')",[id])
  const before=await snapshot(); await provision(id,{2:'Overwrite',3:'Changed',4:'Buyer',5:'Free'});assert.equal(await snapshot(),before)
})
test('privileged role and unknown product rejected without writes', async () => {
  for(const change of [{4:'Super Admin'},{5:'Owner Admin'},{5:'buyermatch-starter-v1'}]) {
    const id=await identity(),before=await snapshot();await assert.rejects(provision(id,change));assert.equal(await snapshot(),before)
  }
})
test('historically partial account fails closed without repair', async () => {
  const id=await identity();await db.query("insert into workspaces(owner_user_id,owner_email,name) values($1,$2,'Keep Me')",[id,`${id}@example.test`])
  const before=await snapshot();await assert.rejects(provision(id));assert.equal(await snapshot(),before)
})
test('database failure after profile/workspace/billing/agreements rolls back everything and retry works', async () => {
  const id=await identity(), doc=randomUUID(); await db.query("insert into bm_documents values($1,'privacy',true,true,'hash')",[doc])
  await db.exec(`create function fail_registration() returns trigger language plpgsql as $$begin raise exception 'injected event failure';end$$;
create trigger inject_failure before insert on account_registration_events for each row execute function fail_registration();`)
  const before=await snapshot();await assert.rejects(provision(id,{6:[{id:doc,hash:'hash'}]}));assert.equal(await snapshot(),before)
  await db.exec('drop trigger inject_failure on account_registration_events')
  assert.equal((await provision(id)).rows[0].result.created,true)
})
test('required or stale agreements reject atomically', async () => {
  const id=await identity(),before=await snapshot();await assert.rejects(provision(id,{7:true}));await assert.rejects(provision(id,{6:[{id:randomUUID(),hash:'stale'}]}));assert.equal(await snapshot(),before)
})
test('database grants prohibit anon and authenticated direct invocation', async () => {
  for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'public.dbp_provision_registration(uuid,text,text,text,text,text,jsonb,boolean)','EXECUTE') as allowed",[role])).rows[0].allowed,false)
  assert.equal((await db.query("select has_function_privilege('service_role','public.dbp_provision_registration(uuid,text,text,text,text,text,jsonb,boolean)','EXECUTE') as allowed")).rows[0].allowed,true)
})
test.after(()=>db.close())
