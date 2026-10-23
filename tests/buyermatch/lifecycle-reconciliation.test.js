// LOCAL ONLY: actual signed webhook + real migration SQL in disposable PGlite.
// Every HTTP request is intercepted. No provider credentials or hosted writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`);
// Reuse the existing rehearsal's reviewed migration list, then its corrected wrapper.
const rehearsal = await readFile('tests/buyermatch/database.test.js', 'utf8');
const migrationNames = [...rehearsal.matchAll(/"(\d{14}_buyermatch_[^"]+\.sql)"/g)].map(m => m[1]);
assert.equal(migrationNames.length, 20);
for (const name of [...migrationNames, '20261022141326_buyermatch_owned_subscription_plan_changes.sql',
  '20261023153356_buyermatch_completed_checkout_guards.sql'])
  await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
await db.exec(`update bm_plans set approved=true,stripe_price_id=case version
  when 'buyermatch-starter-v1' then 'price_local_starter' when 'buyermatch-pro-v1' then 'price_local_pro' end
  where version in ('buyermatch-starter-v1','buyermatch-pro-v1');
  create table local_crm_sentinel(owner_id uuid primary key,plan text,role text);
  insert into local_crm_sentinel values('99999999-9999-4999-8999-999999999999','Pro','Owner');`);

const compiled = await build({ entryPoints: ['supabase/functions/stripe-webhook/index.ts'], bundle: true,
  write: false, platform: 'neutral', format: 'esm' });
const values = { SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'dummy-only-service', STRIPE_SECRET_KEY:'rk_test_dummy_only',
  STRIPE_WEBHOOK_SECRET:'dummy-only-signature', BM_ENVIRONMENT:'staging',
  BM_STAGING_PROJECT_REF:'qxhhlprentrufobpcgna', BM_S2_STRIPE_WEBHOOK_ENABLED:'true' };
const oldDeno = globalThis.Deno;
const realFetch = globalThis.fetch;
const NativeRequest = globalThis.Request, NativeResponse = globalThis.Response;
let handler, current, invoiceLookup;
const requests = [];
globalThis.Deno = { env:{ get:key => values[key] }, serve:fn => { handler=fn; } };
await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

globalThis.fetch = async (url, options) => {
  requests.push(String(url));
  if (String(url) === 'https://api.stripe.com/v1/subscriptions/' + current.id)
    return new NativeResponse(JSON.stringify(current));
  if (String(url) === 'https://api.stripe.com/v1/invoices/' + current.latest_invoice) {
    if (invoiceLookup instanceof Error) throw invoiceLookup;
    return new NativeResponse(JSON.stringify(invoiceLookup));
  }
  if (String(url) === 'https://api.stripe.com/v1/prices/' + current.items.data[0].price.id)
    return new NativeResponse(JSON.stringify({livemode:current.livemode,active:true,currency:'usd',unit_amount:11900,
      recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}));
  const path = String(url).replace(values.SUPABASE_URL, '');
  const args = JSON.parse(options?.body || '{}');
  try {
    if (path === '/rest/v1/rpc/bm_checkout_event') {
      await db.query('select bm_checkout_event($1,$2,$3,$4)', [args.p_id,args.p_owner,args.p_session,args.p_state]);
    } else if (['/rest/v1/rpc/bm_apply_test_billing','/rest/v1/rpc/bm_apply_live_billing'].includes(path)) {
      const mode=path.endsWith('bm_apply_live_billing')?'live':'test';
      await db.query(`select bm_apply_${mode}_billing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [args.p_checkout,args.p_event,args.p_created,args.p_owner,args.p_product,args.p_price,args.p_subscription,args.p_status,args.p_start,args.p_end]);
    } else throw new Error('Unpermitted local fixture request: ' + path);
    return new NativeResponse('null');
  } catch (error) {
    if (/Unpermitted/.test(error.message)) throw error;
    return new NativeResponse(JSON.stringify({code:'local_database_rejected'}),{status:400});
  }
};

async function fixture({ tier='pro', state='completed' } = {}) {
  invoiceLookup=null;
  const owner=randomUUID(), checkout=randomUUID();
  const sub='sub_local_' + randomUUID();
  await db.query('insert into auth.users values($1)',[owner]);
  await db.query(`insert into bm_checkouts(id,owner_id,product,plan_version,operation_key,email,session_id,state)
    values($1,$2,'buyermatch',$3,$4,'local@example.invalid',$5,$6)`,
    [checkout,owner,'buyermatch-'+tier+'-v1',randomUUID(),'cs_'+checkout,state]);
  current={id:sub,livemode:false,status:'active',cancel_at_period_end:false,
    latest_invoice:{id:'in_current_local',status:'paid',amount_paid:tier==='pro'?11900:5900,livemode:false,
      parent:{subscription_details:{subscription:sub}}},
    metadata:{dbpProduct:'buyermatch',dealBlastUserId:owner,dbpCheckoutId:checkout},
    items:{data:[{id:'si_local',quantity:1,price:{id:'price_local_'+tier},current_period_start:1780000000,current_period_end:1890000000}]}};
  return {owner,checkout,sub};
}
async function emit(f,type,created,{id='evt_local_'+randomUUID(),unsigned=false,object}={}) {
  const event={id,type,created,livemode:false,api_version:'2026-09-30.endive',data:{object:object ||
    (type.startsWith('customer.subscription.')?structuredClone(current):
      {id:'in_local',parent:{subscription_details:{subscription:f.sub}}})}};
  const body=JSON.stringify(event),t=Math.floor(Date.now()/1000);
  const headers={'Content-Type':'application/json'};
  if(!unsigned)headers['stripe-signature']=`t=${t},v1=${createHmac('sha256',values.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex')}`;
  const response=await handler(new NativeRequest('https://local.invalid/webhook',{method:'POST',headers,body}));
  return {status:response.status,body:await response.json(),id};
}
const entitlement = async f => (await db.query('select * from bm_entitlements where owner_id=$1',[f.owner])).rows[0];
const ledgerCount = async f => (await db.query('select count(*)::int n from bm_billing_events where owner_id=$1',[f.owner])).rows[0].n;

test('local paid Pro Checkout maps exactly 50 analyses / 25 distributions / 50 fanout',async()=>{
  const f=await fixture({state:'pending'});
  const r=await emit(f,'checkout.session.completed',100,{object:{id:'cs_'+f.checkout,subscription:f.sub,payment_status:'paid',metadata:current.metadata}});
  assert.equal(r.status,200);
  const e=await entitlement(f);assert.equal(e.status,'active');assert.equal(e.allowance,50);
  const p=(await db.query('select distribution_allowance,max_distribution_fanout from bm_plans where version=$1',[e.plan_version])).rows[0];
  assert.deepEqual(p,{distribution_allowance:25,max_distribution_fanout:50});
});

test('duplicate signed event has one ledger entry and unchanged entitlement',async()=>{
  const f=await fixture();const id='evt_local_duplicate_'+randomUUID();
  assert.equal((await emit(f,'invoice.paid',100,{id})).status,200);
  const before=await entitlement(f);
  assert.equal((await emit(f,'invoice.paid',100,{id})).status,200);
  assert.equal(await ledgerCount(f),1);assert.deepEqual(await entitlement(f),before);
});

test('strictly older failure cannot overwrite a newer applied recovery',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',200);const before=await entitlement(f);
  await emit(f,'invoice.payment_failed',100);
  assert.deepEqual(await entitlement(f),before);assert.equal(await ledgerCount(f),2);
});

test('past-due failure and newer payment recovery deactivate then reactivate',async()=>{
  const f=await fixture();current.status='past_due';current.latest_invoice.status='open';current.latest_invoice.amount_paid=0;
  await emit(f,'invoice.payment_failed',100);
  assert.equal((await entitlement(f)).status,'inactive');
  current.status='active';current.latest_invoice.status='paid';current.latest_invoice.amount_paid=11900;await emit(f,'invoice.paid',200);
  assert.equal((await entitlement(f)).status,'active');
});

test('same-owned-subscription downgrade and upgrade recalculate allowances',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',100);
  current.items.data[0].price.id='price_local_starter';await emit(f,'customer.subscription.updated',200);
  assert.equal((await entitlement(f)).allowance,20);
  current.items.data[0].price.id='price_local_pro';await emit(f,'customer.subscription.updated',300);
  assert.equal((await entitlement(f)).allowance,50);
});

test('cancel-at-period-end retains paid access, terminal cancellation revokes it',async()=>{
  const f=await fixture();current.cancel_at_period_end=true;
  await emit(f,'customer.subscription.updated',100);assert.equal((await entitlement(f)).status,'active');
  current.status='canceled';await emit(f,'customer.subscription.deleted',200);
  assert.equal((await entitlement(f)).status,'inactive');
  await emit(f,'invoice.paid',300);assert.equal((await entitlement(f)).status,'inactive');
});

test('foreign owner mapping is rejected transactionally without ledger or entitlement writes',async()=>{
  const f=await fixture();current.metadata.dealBlastUserId=randomUUID();
  assert.equal((await emit(f,'invoice.paid',100)).status,503);
  assert.equal(await ledgerCount(f),0);assert.equal(await entitlement(f),undefined);
});

test('conflicting subscription cannot replace an existing owned entitlement',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',100);const before=await entitlement(f);
  current.id='sub_conflict_'+randomUUID();
  assert.equal((await emit(f,'customer.subscription.updated',200)).status,503);
  assert.deepEqual(await entitlement(f),before);assert.equal(await ledgerCount(f),1);
});

test('unsigned events are denied before any provider or database operation',async()=>{
  const f=await fixture();const before=requests.length;
  assert.equal((await emit(f,'invoice.paid',100,{unsigned:true})).status,400);
  assert.equal(requests.length,before);assert.equal(await ledgerCount(f),0);
});

test('browser roles cannot read private buyer/ledger data or execute billing RPCs',async()=>{
  for(const role of ['anon','authenticated']){
    for(const table of ['bm_buyers','bm_billing_events','bm_entitlements']){
      await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from '+table);}),/permission denied/);
    }
    const r=await db.query("select has_function_privilege($1,'bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)','execute') allowed",[role]);
    assert.equal(r.rows[0].allowed,false);
  }
});

test('billing events preserve CRM sentinel records and never call CRM or delivery endpoints',async()=>{
  assert.deepEqual((await db.query('select plan,role from local_crm_sentinel')).rows,[{plan:'Pro',role:'Owner'}]);
  assert.equal(requests.some(path=>/workspace_plan|resend|notification|bm_buyers/.test(path)),false);
});

test('same-second delayed invoice failure must not revoke a recovered active subscription',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',200);
  assert.equal((await entitlement(f)).status,'active');
  // Stripe timestamps have second precision; delivery order is not a tie-breaker.
  await emit(f,'invoice.payment_failed',200);
  assert.equal((await entitlement(f)).status,'active');
});

test('initial subscription activation must wait for its Checkout to be completed',async()=>{
  const f=await fixture({state:'pending'});
  const r=await emit(f,'customer.subscription.created',100);
  const actual={httpStatus:r.status,entitlementStatus:(await entitlement(f))?.status,ledgerEvents:await ledgerCount(f)};
  assert.deepEqual(actual,{httpStatus:503,entitlementStatus:undefined,ledgerEvents:0});
});

test('equal-second failure then recovery finishes active without discarding either event',async()=>{
  const f=await fixture();current.status='past_due';current.latest_invoice.status='open';current.latest_invoice.amount_paid=0;
  await emit(f,'invoice.payment_failed',200);assert.equal((await entitlement(f)).status,'inactive');
  current.status='active';current.latest_invoice.status='paid';current.latest_invoice.amount_paid=11900;
  await emit(f,'invoice.paid',200);assert.equal((await entitlement(f)).status,'active');assert.equal(await ledgerCount(f),2);
});

test('a truly current unpaid invoice stops access even when subscription status still says active',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',200);
  current.latest_invoice.status='open';current.latest_invoice.amount_paid=0;
  await emit(f,'invoice.payment_action_required',200);assert.equal((await entitlement(f)).status,'inactive');
  // An older paid snapshot arriving later must not re-grant against today's unpaid invoice.
  await emit(f,'invoice.paid',200);assert.equal((await entitlement(f)).status,'inactive');
});

test('unknown latest invoice evidence requests reconciliation without changing access',async()=>{
  const f=await fixture();await emit(f,'invoice.paid',100);const before=await entitlement(f);
  current.latest_invoice=null;
  assert.equal((await emit(f,'invoice.payment_failed',200)).status,503);
  assert.deepEqual(await entitlement(f),before);assert.equal(await ledgerCount(f),1);
});

test('initial same-price activation requires completed nonempty session in TEST and LIVE RPCs',async()=>{
  const f=await fixture();await db.exec('update bm_live_billing_config set enabled=true,verified=true');
  for(const mode of ['test','live']) {
    for(const [state,session] of [['pending','cs_pending'],['completed',null],['completed',''],['completed','   ']]) {
      await db.query('update bm_checkouts set state=$1,session_id=$2 where id=$3',[state,session,f.checkout]);
      await assert.rejects(db.query(`select bm_apply_${mode}_billing($1,$2,100,$3,'buyermatch','price_local_pro',$4,'active',now(),now()+interval '1 month')`,[f.checkout,'evt_guard_'+randomUUID(),f.owner,f.sub]),/mapping/);
      assert.equal(await ledgerCount(f),0);assert.equal(await entitlement(f),undefined);
    }
  }
});

test('string latest-invoice reference is retrieved and bound to its subscription',async()=>{
  const f=await fixture();invoiceLookup=current.latest_invoice;current.latest_invoice=invoiceLookup.id;
  const before=requests.length;assert.equal((await emit(f,'invoice.payment_failed',200)).status,200);
  assert.equal((await entitlement(f)).status,'active');
  assert.ok(requests.slice(before).includes('https://api.stripe.com/v1/invoices/in_current_local'));
});

test('missing, foreign, mismatched-mode and lookup-failed invoice evidence never changes access',async()=>{
  for(const scenario of ['foreign','mode','missing-status','missing-amount','wrong-id','lookup-failed']){
    const f=await fixture();await emit(f,'invoice.paid',100);const before=await entitlement(f);
    invoiceLookup=structuredClone(current.latest_invoice);current.latest_invoice=invoiceLookup.id;
    if(scenario==='foreign')invoiceLookup.parent.subscription_details.subscription='sub_foreign';
    if(scenario==='mode')invoiceLookup.livemode=true;
    if(scenario==='missing-status')delete invoiceLookup.status;
    if(scenario==='missing-amount')delete invoiceLookup.amount_paid;
    if(scenario==='wrong-id')invoiceLookup.id='in_foreign';
    if(scenario==='lookup-failed')invoiceLookup=new Error('dummy-provider-failure');
    const r=await emit(f,'invoice.payment_failed',200);assert.equal(r.status,503,scenario);
    assert.deepEqual(await entitlement(f),before,scenario);assert.equal(await ledgerCount(f),1);
  }
});

test('legacy expanded invoice subscription reference also reconciles authoritative paid state',async()=>{
  const f=await fixture();current.latest_invoice.subscription=f.sub;delete current.latest_invoice.parent;
  await emit(f,'invoice.payment_action_required',200);assert.equal((await entitlement(f)).status,'active');
});

test('LIVE fixture reconciles both equal-second directions and preserves current unpaid failure',async()=>{
  const previous={...values};
  Object.assign(values,{BM_ENVIRONMENT:'production',BM_PRODUCTION_PROJECT_REF:'aigvnbxiydbzzqbetlhl',
    SUPABASE_URL:'https://aigvnbxiydbzzqbetlhl.supabase.co',STRIPE_SECRET_KEY:'rk_live_dummy_only',BM_LIVE_BILLING_ENABLED:'true',BM_BILLING_VERIFIED:'true'});
  try {
    await db.exec('update bm_live_billing_config set enabled=true,verified=true');
    const f=await fixture();current.livemode=true;current.latest_invoice.livemode=true;
    // emit() is explicitly TEST by default; construct only this local signed live envelope.
    const send=async(type,created)=>{
      const event={id:'evt_live_local_'+randomUUID(),type,created,livemode:true,data:{object:{id:'in_old_local',subscription:f.sub}}};
      const body=JSON.stringify(event),t=Math.floor(Date.now()/1000);
      return handler(new NativeRequest('https://local.invalid/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${createHmac('sha256',values.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex')}`},body}));
    };
    assert.equal((await send('invoice.paid',100)).status,200);
    assert.equal((await send('invoice.payment_failed',100)).status,200);assert.equal((await entitlement(f)).status,'active');
    current.status='past_due';current.latest_invoice.status='open';current.latest_invoice.amount_paid=0;
    assert.equal((await send('invoice.payment_failed',200)).status,200);assert.equal((await entitlement(f)).status,'inactive');
    current.status='active';current.latest_invoice.status='paid';current.latest_invoice.amount_paid=11900;
    assert.equal((await send('invoice.paid',200)).status,200);assert.equal((await entitlement(f)).status,'active');
    current.latest_invoice.status='open';current.latest_invoice.amount_paid=0;
    assert.equal((await send('invoice.paid',200)).status,200);assert.equal((await entitlement(f)).status,'inactive');
  } finally {for(const key of Object.keys(values))delete values[key];Object.assign(values,previous);}
});

test.after(async()=>{globalThis.fetch=realFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;await db.close();});
