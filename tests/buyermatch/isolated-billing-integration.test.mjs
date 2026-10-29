import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID,createHmac } from 'node:crypto';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { BASE,ID,validateProfile,runtime,fixtureEnvironment,digest,ownership } from '../../isolated-billing/profile.mjs';
import { buildIsolated } from '../../isolated-billing/build.mjs';
import { createLocalFixture } from '../../isolated-billing/fixtures.mjs';
import { nativePorts } from '../../isolated-billing/native.mjs';
import { createIsolatedApi } from '../../isolated-billing/api.mjs';
import { createIsolatedWebhook } from '../../isolated-billing/webhook.mjs';
const {Request,Response}=globalThis;
const now=Math.floor(Date.now()/1000)*1000;
const p=validateProfile({schema:ID,baseSource:BASE,source:'a'.repeat(40),mode:'LOCAL_SYNTHETIC',runId:randomUUID(),owner:randomUUID(),
  project:'prj_IsolatedNew',team:'team_Isolated',database:'z'.repeat(20),account:'acct_IsolatedNew',endpoint:'we_IsolatedNew',
  pro:'price_IsolatedPro',origin:'https://buyermatch-isolated-fixture.vercel.app',startedAt:now-1000,expiresAt:now+300000,
  provisioningStartedAt:now-60000,hosting:'vercel',baseline:{projects:['prj_Original'],databases:['qxhhlprentrufobpcgna','aigvnbxiydbzzqbetlhl'],
    accounts:['acct_1UTRcRL6efr9LhPI'],owners:['368f5f93-acf7-4cc3-9805-a4c0817506c3']}});
await mkdir('node_modules/.cache',{recursive:true});
const output=await mkdtemp(path.resolve('node_modules/.cache/isolated-build-'));
await buildIsolated(p,output,{frontendKey:'sb_publishable_synthetic'});
const app=await import(pathToFileURL(path.join(output,'application.mjs')));
const originalWebhook=(await import(pathToFileURL(path.join(output,'receiver.mjs')))).default;
const operator=await import(pathToFileURL(path.join(output,'operator.mjs')));
const fixture=await createLocalFixture(p);
const env=fixtureEnvironment(p);Object.assign(env,{BM_CHECKOUT_ENABLED:'true',BM_S2_STRIPE_WEBHOOK_ENABLED:'true',
  BM_STRIPE_TEST_SECRET_KEY:'rk_test_'+ 'synthetic_only',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',STRIPE_WEBHOOK_SECRET:'synthetic-signing'});
for(const [k,v]of Object.entries(env))process.env[k]=v;
const calls=[];const state={session:null,subscription:null,customer:null,deleted:0,endpoint:'disabled',hostingRemoved:false};
const credential={profileDigest:digest(p),account:p.account,database:p.database,stripeKey:env.BM_STRIPE_TEST_SECRET_KEY,
  serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,signingSecret:env.STRIPE_WEBHOOK_SECRET,hostingToken:'synthetic-hosting',oidcToken:'synthetic-oidc',ownerAccessToken:fixture.token()};
const json=(v,status=200)=>Response.json(v,{status});
async function rpc(name,params){
  assert(/^(bm_isolated_|bm_begin_checkout$|bm_checkout_event$|bm_apply_test_billing$|bm_account_usage$)/.test(name));
  const keys=Object.keys(params);assert(keys.every(k=>/^p_[a-z_]+$/.test(k)));
  const r=await fixture.db.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(params));
  return r.rows[0].value;
}
const realFetch=globalThis.fetch;
async function transport(url,options={}) {
  const u=new URL(String(url));const method=options.method||'GET';calls.push({host:u.hostname,path:u.pathname,method});
  assert(!String(url).includes('qxhhlprentrufobpcgna') && !String(url).includes('aigvnbxiydbzzqbetlhl'));
  if(u.origin===`https://${p.database}.supabase.co`){
    if(u.pathname==='/auth/v1/user'){
      try{return json(await fixture.authenticate(String(new Headers(options.headers).get('authorization')).slice(7)));}catch{return json({error:'unauthorized'},401);}
    }
    if(u.pathname.startsWith('/rest/v1/rpc/')){try{return json(await rpc(u.pathname.split('/').at(-1),JSON.parse(options.body||'{}')));}catch{return json({error:'fixture SQL rejected'},503);}}
    const table=u.pathname.split('/').at(-1);assert(['bm_plans','bm_checkouts','account_profiles','workspaces','workspace_plan_assignments','bm_entitlements','bm_configuration','bm_documents','bm_acceptances'].includes(table));
    const select=u.searchParams.get('select')||'*';assert(/^(\*|[a-z_,]+)$/.test(select));
    const parameters=[];let filter=[];
    for(const [key,value]of u.searchParams)if(!['select','limit','order'].includes(key)){
      assert(/^[a-z_]+$/.test(key));assert(value.startsWith('eq.'));parameters.push(value.slice(3));filter.push(`${key}=$${parameters.length}`);
    }
    const where=filter.length?' where '+filter.join(' and '):'';
    if(method==='PATCH'){
      const changes=JSON.parse(options.body);const names=Object.keys(changes);assert.equal(table,'bm_checkouts');
      assert(names.every(k=>['session_id','session_url'].includes(k)));const r=await fixture.db.query(`update ${table} set ${names.map((k,i)=>`${k}=$${parameters.length+i+1}`).join(',')}${where} returning *`,[...parameters,...Object.values(changes)]);return json(r.rows);
    }
    assert.equal(method,'GET');const r=await fixture.db.query(`select ${select} from ${table}${where}`,parameters);
    return json(new Headers(options.headers).get('accept')?.includes('vnd.pgrst.object')?r.rows[0]:r.rows);
  }
  if(u.origin==='https://api.stripe.com'){
    if(u.pathname==='/v1/account')return json({id:p.account,created:Math.floor(p.provisioningStartedAt/1000)+1});
    if(u.pathname==='/v1/prices/'+p.pro)return json({id:p.pro,active:true,livemode:false,type:'recurring',currency:'usd',unit_amount:11900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
    if(u.pathname==='/v1/webhook_endpoints/'+p.endpoint){if(method==='POST')state.endpoint=new URLSearchParams(options.body).get('disabled')==='true'?'disabled':'enabled';return json({id:p.endpoint,livemode:false,status:state.endpoint,url:`https://${p.database}.supabase.co/functions/v1/isolated-billing-webhook`});}
    if(u.pathname==='/v1/checkout/sessions')return json({has_more:false,data:state.session?[state.session]:[]});
    if(u.pathname==='/v1/checkout/sessions/cs_test_Isolated')return json(state.session);
    if(u.pathname==='/v1/checkout/sessions/cs_test_Isolated/expire'){state.session.status='expired';return json(state.session);}
    if(u.pathname==='/v1/subscriptions')return json({has_more:false,data:state.subscription?[state.subscription]:[]});
    if(u.pathname==='/v1/customers')return json({has_more:false,data:state.customer?[state.customer]:[]});
    if(u.pathname==='/v1/customers/cus_Isolated')return json(state.customer);
    if(u.pathname==='/v1/invoices')return json({has_more:false,data:[]});
    if(u.pathname==='/v1/subscriptions/sub_Isolated'){
      if(method==='DELETE'){state.deleted++;state.subscription.status='canceled';state.subscription.canceled_at=Math.floor(Date.now()/1000);}
      return json(state.subscription);
    }
    throw Error('Unexpected Stripe fixture endpoint');
  }
  if(u.origin==='https://api.vercel.com'){
    if(u.pathname==='/v9/projects/'+p.project)return json({id:p.project,accountId:p.team,createdAt:p.provisioningStartedAt+1,ssoProtection:{deploymentType:'all'},protectionBypass:{}});
    if(u.pathname==='/v6/deployments')return json({deployments:state.hostingRemoved?[]:[{uid:'dpl_Isolated'}],pagination:{next:null}});
    if(u.pathname==='/v4/aliases')return json({aliases:[],pagination:{next:null}});
    if(u.pathname==='/v13/deployments/dpl_Isolated'){
      if(method==='DELETE'){state.hostingRemoved=true;return json({ok:true});}
      if(state.hostingRemoved)return json({error:'not found'},404);
      return json({id:'dpl_Isolated',projectId:p.project,ownerId:p.team,target:null,createdAt:p.provisioningStartedAt+1,readyState:'READY',meta:{isolatedRunId:p.runId,githubCommitSha:p.source}});
    }
  }
  if(u.origin===p.origin)return json({profileDigest:digest(p),source:p.source});
  throw Error('Unexpected external fixture request');
}
globalThis.fetch=transport;
test.after(async()=>{globalThis.fetch=realFetch;await fixture.close();});
test('build identifies derivative and leaves approved source intact',async()=>{
  const info=JSON.parse(await readFile(path.join(output,'derivative.json')));assert.equal(info.baseSource,BASE);
  assert.equal(info.profile,ID);assert.equal(info.localOnly,true);assert(info.sources.some(x=>x.file==='server/http/buyermatch.ts'));
  assert((await readFile(path.join(output,'.vercel/output/static/index.html'),'utf8')).includes('ISOLATED SYNTHETIC BILLING TEST'));
  const routes=JSON.parse(await readFile(path.join(output,'.vercel/output/config.json'))).routes;
  assert.equal(routes[1].status,403);assert.equal(routes[1].src,'^/api/.*');
});
test('profile rejects original/foreign bindings, unknown fields, long windows and unsafe origin',()=>{
  for(const change of [x=>x.database='qxhhlprentrufobpcgna',x=>x.account='acct_1UTRcRL6efr9LhPI',
    x=>x.owner='368f5f93-acf7-4cc3-9805-a4c0817506c3',x=>x.project='prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',
    x=>x.origin='http://localhost',x=>x.expiresAt=x.startedAt+1800001,x=>x.unexpected=true]){
    const changed=structuredClone(p);change(changed);assert.throws(()=>validateProfile(changed));}
});
test('replacement guard enforces time, owner, runtime resources and checkout-only operation',()=>{
  assert.equal(app.requireS2BillingWindow(p.owner,'checkout',env).runId,p.runId);
  for(const op of ['payment','change','cancel','portal'])assert.throws(()=>app.requireS2BillingWindow(p.owner,op,env));
  assert.throws(()=>app.requireS2BillingWindow(randomUUID(),'checkout',env));
  assert.throws(()=>app.requireS2BillingWindow(p.owner,'checkout',env,p.expiresAt));
  assert.throws(()=>runtime(p,{...env,SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co'}));
});
const ports=nativePorts(p,async()=>credential,{fetch:transport,authorizeMutation:async()=>true});
test('native preflight uses connected account, price, DB lease and hosting wire protocols',async()=>{
  const snapshot=await ports.preflight();assert.equal(snapshot.buyers,0);assert.equal(snapshot.provenance,0);
  assert.equal((await ports.authenticate({headers:{authorization:'Bearer '+fixture.token()}})).id,p.owner);
  await assert.rejects(ports.authenticate({headers:{authorization:'Bearer invalid'}}));
});
test('new API denies Portal/lifecycle, buyer routes and foreign Auth before delegation',async()=>{
  let delegated=0;const handler=createIsolatedApi(p,{env,buyermatch:()=>delegated++,accountStatus:()=>delegated++,
    authenticate:ports.authenticate,authority:ports.authority,permitCheckout:()=>{throw Error('unused')}});
  for(const [url,action,token]of [['/api/create-billing-portal-session','payment',fixture.token()],
    ['/api/buyermatch','billing-portal',fixture.token()],['/api/buyermatch','list',fixture.token()],
    ['/api/buyermatch','checkout',fixture.token(randomUUID())]]){
    let status;await handler({url,method:'POST',body:{action},headers:{authorization:'Bearer '+token}},
      {setHeader(){},status(s){status=s;return{json(){}}}});assert.equal(status,503);}
  assert.equal(delegated,0);
});
let checkoutId;let baseline;let store;
test('database lease rejects closed issuance and real approved Checkout creates only one scoped reservation',async()=>{
  await assert.rejects(rpc('bm_isolated_permit',{p_run:p.runId,p_digest:digest(p),p_owner:p.owner,p_operation:p.runId}));
  baseline=await ports.authority();
  const directory=await mkdtemp(path.resolve('node_modules/.cache/isolated-journal-'));
  store=await operator.billingEvidenceStore(directory,operator.cancellationPlan(p));await store.claimRun();
  await store.recordSubscriptionBaseline({observedAt:p.startedAt,subscriptionIds:[]});
  await rpc('bm_isolated_arm',{p_run:p.runId,p_digest:digest(p)});
  await rpc('bm_isolated_permit',{p_run:p.runId,p_digest:digest(p),p_owner:p.owner,p_operation:p.runId});
  const client=createClient(`https://${p.database}.supabase.co`,credential.serviceKey);
  const stripe={prices:{retrieve:async()=> (await transport('https://api.stripe.com/v1/prices/'+p.pro)).json()},
    checkout:{sessions:{create:async options=>{
      checkoutId=options.metadata.dbpCheckoutId;
      state.session={id:'cs_test_Isolated',url:'https://checkout.stripe.com/c/test_synthetic',livemode:false,mode:'subscription',
        status:'open',created:Math.floor(Date.now()/1000),metadata:options.metadata,client_reference_id:p.owner};
      return state.session;},retrieve:async()=>state.session}}};
  const result=await app.createCheckout(client,{id:p.owner,email:`billing-${p.runId}@example.invalid`},'buyermatch-pro-v1',p.runId,env,stripe);
  assert.equal(result.testMode,true);assert.equal(state.session.metadata.dbpS2RunId,p.runId);
  assert.equal((await fixture.db.query('select count(*)::int n from bm_checkouts')).rows[0].n,1);
  await assert.rejects(rpc('bm_isolated_permit',{p_run:p.runId,p_digest:digest(p),p_owner:p.owner,p_operation:randomUUID()}));
  Object.assign(state.session,{status:'complete',payment_status:'paid',amount_total:11900,currency:'usd',customer:'cus_Isolated',subscription:'sub_Isolated'});
  state.customer={id:'cus_Isolated',livemode:false,created:Math.floor(Date.now()/1000)};
  state.subscription={id:'sub_Isolated',livemode:false,created:Math.floor(Date.now()/1000),customer:state.customer.id,status:'active',metadata:{...state.session.metadata},
    latest_invoice:{id:'in_Isolated',livemode:false,status:'paid',amount_paid:11900,parent:{subscription_details:{subscription:'sub_Isolated'}}},
    items:{has_more:false,data:[{quantity:1,price:{id:p.pro},current_period_start:Math.floor(Date.now()/1000)-1,current_period_end:Math.floor(Date.now()/1000)+2592000}]}};
});
function signed(event,valid=true){const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000);
  const sig=createHmac('sha256',valid?credential.signingSecret:'wrong').update(t+'.'+raw).digest('hex');
  return new Request(`https://${p.database}.supabase.co/functions/v1/isolated-billing-webhook`,{method:'POST',body:raw,headers:{'stripe-signature':`t=${t},v1=${sig}`}});}
test('actual derivative receiver + signed wrapper activates Pro once; invalid signatures and replay do not alter CRM',async()=>{
  const webhook=createIsolatedWebhook(p,{env,signingSecret:credential.signingSecret,authority:ports.authority,
    reconcile:ports.reconcile,countDelivery:id=>rpc('bm_isolated_event',{p_run:p.runId,p_digest:digest(p),p_event:id}),delegate:originalWebhook});
  const event={id:'evt_Isolated',type:'checkout.session.completed',livemode:false,created:Math.floor(Date.now()/1000),data:{object:state.session}};
  assert.equal((await webhook(signed(event,false))).status,400);
  assert.equal((await fixture.db.query('select count(*)::int n from bm_entitlements')).rows[0].n,0);
  const response=await webhook(signed(event));assert.equal(response.status,200,await response.text());
  assert.equal((await webhook(signed(event))).status,200);
  const e=(await fixture.db.query('select * from bm_entitlements where owner_id=$1',[p.owner])).rows[0];
  assert.equal(e.status,'active');assert.equal(e.allowance,50);assert.equal(e.stripe_subscription_id,'sub_Isolated');
  const plan=(await fixture.db.query("select * from bm_plans where version='buyermatch-pro-v1'")).rows[0];
  assert.equal(plan.distribution_allowance,25);assert.equal(plan.max_distribution_fanout,50);
  assert.equal((await fixture.db.query('select count(*)::int n from bm_billing_events')).rows[0].n,1);
  assert.equal((await ports.authority()).snapshot.crmDigest,baseline.snapshot.crmDigest);
  const forged=structuredClone(event);forged.data.object={...state.session,id:'cs_test_Foreign'};
  assert.equal((await webhook(signed(forged))).status,503);
  assert.equal((await webhook(signed({...event,account:'acct_Foreign'}))).status,503);
  for(let i=2;i<12;i++)assert.equal((await webhook(signed(event))).status,200);
  assert.equal((await webhook(signed(event))).status,503);
});
test('ownership rejects preexisting/foreign subscriptions, customers, account data and changed allowances',()=>{
  ownership(p,state.session,state.subscription,state.customer,checkoutId);
  for(const [which,change]of [['sub',x=>x.customer='cus_Foreign'],['sub',x=>x.created=Math.floor(p.startedAt/1000)-10],
    ['sub',x=>x.metadata.dealBlastUserId=randomUUID()],['sub',x=>x.items.data[0].quantity=2],['customer',x=>x.livemode=true]]){
    const s=structuredClone(state.subscription),c=structuredClone(state.customer);change(which==='sub'?s:c);
    assert.throws(()=>ownership(p,state.session,s,c,checkoutId));}
});
test('independent durable cleanup uses adapted original cancellation helper, provider readback and hosting teardown',async()=>{
  const approval={approved:true,source:p.source,profileDigest:digest(p),account:p.account,runId:p.runId,cancelCampaignCreatedTestSubscription:true};
  const result=await operator.executeCleanup(p,ports,store,approval,baseline.snapshot);
  assert.equal(result.verified,true);assert.equal(result.hostedCancellationVerified,false);
  assert.equal(state.deleted,1);assert.equal(state.endpoint,'disabled');assert.equal(state.hostingRemoved,true);
  assert.equal((await ports.authority()).snapshot.crmDigest,baseline.snapshot.crmDigest);
  await operator.executeCleanup(p,ports,store,approval,baseline.snapshot);assert.equal(state.deleted,1);
});
test('HOSTED profile cannot inject fake transport or import original credential scope',()=>{
  const live={...p,mode:'HOSTED'};assert.throws(()=>nativePorts(live,async()=>credential,{fetch:transport}));
});
test('ambiguous cancellation is not retried and never obtains a success receipt',async()=>{
  state.subscription.status='active';let attempts=0;
  const unknown=nativePorts(p,async()=>credential,{fetch:async(url,init)=>{
    if(init?.method==='DELETE' && String(url).includes('/subscriptions/')){attempts++;throw Error('Unknown network outcome');}
    return transport(url,init);
  },authorizeMutation:async()=>true});
  const directory=await mkdtemp(path.resolve('node_modules/.cache/isolated-unknown-'));
  const evidence=await operator.billingEvidenceStore(directory,operator.cancellationPlan(p));await evidence.claimRun();
  await evidence.recordSubscriptionBaseline({observedAt:p.startedAt,subscriptionIds:[]});
  const approval={approved:true,source:p.source,profileDigest:digest(p),account:p.account,runId:p.runId,cancelCampaignCreatedTestSubscription:true};
  await assert.rejects(operator.executeCleanup(p,unknown,evidence,approval,baseline.snapshot));
  await assert.rejects(operator.executeCleanup(p,unknown,evidence,approval,baseline.snapshot));
  assert.equal(attempts,1);assert.equal(state.subscription.status,'active');
});
test('preexisting provider subscription is rejected before cancellation',async()=>{
  const directory=await mkdtemp(path.resolve('node_modules/.cache/isolated-preexisting-'));
  const evidence=await operator.billingEvidenceStore(directory,operator.cancellationPlan(p));await evidence.claimRun();
  await evidence.recordSubscriptionBaseline({observedAt:p.startedAt,subscriptionIds:['sub_Isolated']});
  const approval={approved:true,source:p.source,profileDigest:digest(p),account:p.account,runId:p.runId,cancelCampaignCreatedTestSubscription:true};
  const before=state.deleted;await assert.rejects(operator.executeCleanup(p,ports,evidence,approval,baseline.snapshot));
  assert.equal(state.deleted,before);
});

test('watchdog evidence failure still invokes cleanup and does not claim execution success',async()=>{
  const directory=await mkdtemp(path.resolve('node_modules/.cache/isolated-worker-failure-'));
  await writeFile(path.join(directory,'watchdog-ready.json'),'{}');let cleaned=0;
  await assert.rejects(operator.watch(p,directory,{prepare:async()=>({crmDigest:'fixture'}),
    cleanup:async()=>{cleaned++;return {verified:true,hostedCancellationVerified:false};}},process.pid));
  assert.equal(cleaned,1);
});
test('detached non-probe worker starts with native wire dependencies and cleans up after primary process exits',async()=>{
  const start=Math.floor(Date.now()/1000)*1000+20000;
  const childProfile=validateProfile({...p,runId:randomUUID(),owner:randomUUID(),startedAt:start,expiresAt:start+180000,
    provisioningStartedAt:start-120000});
  const out=await mkdtemp(path.resolve('node_modules/.cache/isolated-detached-build-'));await buildIsolated(childProfile,out);
  const directory=await mkdtemp(path.resolve('node_modules/.cache/isolated-detached-evidence-'));
  const cred={...credential,profileDigest:digest(childProfile)};
  const approval={approved:true,source:childProfile.source,profileDigest:digest(childProfile),account:childProfile.account,
    runId:childProfile.runId,cancelCampaignCreatedTestSubscription:true,activateCampaign:true};
  const privateFile=path.join(directory,'credentials.json'),approvalFile=path.join(directory,'approval.json');
  await writeFile(privateFile,JSON.stringify(cred));await writeFile(approvalFile,JSON.stringify(approval));
  const provider={state:'paused',hasCheckout:false,disabled:true,removed:false,deleted:0};
  const metadata={dealBlastUserId:childProfile.owner,dbpProduct:'buyermatch',dbpCheckoutId:childProfile.runId,dbpS2RunId:childProfile.runId};
  const session={id:'cs_test_Isolated',metadata,mode:'subscription',livemode:false,status:'complete',payment_status:'paid',
    client_reference_id:childProfile.owner,amount_total:11900,currency:'usd',customer:'cus_Isolated',subscription:'sub_Isolated',created:start/1000};
  const subscription={id:'sub_Isolated',metadata,livemode:false,status:'active',customer:'cus_Isolated',created:start/1000,
    items:{has_more:false,data:[{quantity:1,price:{id:childProfile.pro}}]}};
  async function remote(url,method,body){
    const u=new URL(url);const cp=childProfile;
    if(u.origin===`https://${cp.database}.supabase.co`){const name=u.pathname.split('/').at(-1);
      if(name==='bm_isolated_snapshot')return {profileDigest:digest(cp),database:cp.database,account:cp.account,owner:cp.owner,
        buyers:0,provenance:0,crmDigest:'unchanged-fixture',state:provider.state};
      if(name==='bm_isolated_pause'){provider.state='closed';return true;}
      if(name==='bm_isolated_arm'){assert(Date.now()>=start);provider.state='armed';return true;}
      if(name==='bm_isolated_checkout')return provider.hasCheckout?{checkoutId:cp.runId,session:session.id}:{checkoutId:null,session:null};
    }
    if(u.origin===cp.origin)return {profileDigest:digest(cp),source:cp.source};
    if(u.origin==='https://api.stripe.com'){
      if(u.pathname==='/v1/account')return {id:cp.account,created:Math.floor(cp.provisioningStartedAt/1000)+1};
      if(u.pathname==='/v1/prices/'+cp.pro)return {id:cp.pro,livemode:false,active:true,unit_amount:11900,currency:'usd',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
      if(u.pathname==='/v1/webhook_endpoints/'+cp.endpoint){if(method==='POST')provider.disabled=new URLSearchParams(body).get('disabled')==='true';
        return {id:cp.endpoint,livemode:false,status:provider.disabled?'disabled':'enabled',url:`https://${cp.database}.supabase.co/functions/v1/isolated-billing-webhook`};}
      if(u.pathname==='/v1/checkout/sessions')return {has_more:false,data:provider.hasCheckout?[session]:[]};
      if(u.pathname.endsWith('/cs_test_Isolated'))return session;
      if(u.pathname==='/v1/customers')return {has_more:false,data:[]};
      if(u.pathname==='/v1/customers/cus_Isolated')return {id:'cus_Isolated',livemode:false,created:start/1000};
      if(u.pathname==='/v1/subscriptions')return {has_more:false,data:provider.hasCheckout?[{id:subscription.id}]:[]};
      if(u.pathname==='/v1/invoices')return {has_more:false,data:[]};
      if(u.pathname==='/v1/subscriptions/sub_Isolated'){if(method==='DELETE'){provider.deleted++;subscription.status='canceled';subscription.canceled_at=Math.floor(Date.now()/1000);}return subscription;}
    }
    if(u.origin==='https://api.vercel.com'){
      if(u.pathname==='/v9/projects/'+cp.project)return {id:cp.project,accountId:cp.team,createdAt:cp.provisioningStartedAt+1,ssoProtection:{deploymentType:'all'},protectionBypass:{}};
      if(u.pathname==='/v6/deployments')return {deployments:provider.removed?[]:[{uid:'dpl_Isolated'}],pagination:{next:null}};
      if(u.pathname==='/v4/aliases')return {aliases:[],pagination:{next:null}};
      if(u.pathname==='/v13/deployments/dpl_Isolated'){
        if(method==='DELETE'){provider.removed=true;return {};}
        if(provider.removed)return {missing:true};
        return {id:'dpl_Isolated',projectId:cp.project,ownerId:cp.team,target:null,createdAt:cp.provisioningStartedAt+1,
          readyState:'READY',meta:{isolatedRunId:cp.runId,githubCommitSha:cp.source}};
      }
    }
    throw Error('Unknown detached provider fixture path');
  }
  const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;
    try{const value=JSON.parse(raw),body=await remote(value.url,value.method,value.body);
      res.end(JSON.stringify({status:body?.missing?404:200,body}));}catch{res.end(JSON.stringify({status:503,body:{error:'fixture provider failed'}}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const proxy=`http://127.0.0.1:${server.address().port}/`;
  const primary=spawn(process.execPath,['tests/fixtures/isolated-primary.mjs',path.join(out,'operator.mjs'),
    path.join(out,'profile.json'),directory,privateFile,approvalFile,proxy],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostic='';primary.stderr.on('data',x=>diagnostic+=x.toString());
  const wait=async file=>{for(let i=0;i<1000;i++){try{return JSON.parse(await readFile(path.join(directory,file),'utf8'));}catch{/* receipt not ready */}
    await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Missing detached receipt '+file+' '+diagnostic);};
  try{
    const ready=await wait('watchdog-ready.json');assert.notEqual(ready.pid,primary.pid);assert.equal(ready.profileDigest,digest(childProfile));
    while(Date.now()<start)await new Promise(resolve=>setTimeout(resolve,100));
    const compiled=await import(pathToFileURL(path.join(out,'operator.mjs')));
    const ex=await compiled.makeExecution(childProfile,directory,{credentialFile:privateFile,approvalFile,
      fetch:async(url,init={})=>{const result=await remote(String(url),init.method||'GET',init.body?String(init.body):null);return json(result,result?.missing?404:200);}});
    await ex.arm();provider.hasCheckout=true;
    await writeFile(path.join(directory,'release-primary'),'exit');
    await new Promise((resolve,reject)=>{primary.on('exit',code=>code===0?resolve():reject(Error('Primary fixture failed '+diagnostic)));});
    const result=await wait('cleanup-result.json');assert.equal(result.verified,true);assert.equal(result.hostedCancellationVerified,false);
    assert.equal(provider.deleted,1);assert.equal(provider.state,'closed');assert.equal(provider.disabled,true);assert.equal(provider.removed,true);
  }finally{primary.kill();await new Promise(resolve=>server.close(resolve));}
});
