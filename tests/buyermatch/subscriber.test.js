import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { subscriberPortal } from '../../server/buyermatch/portal.js';
import { subscriberAgreements, requireSubscriberAgreements } from '../../server/buyermatch/onboarding.js';
const owner='synthetic-owner';
const env={BM_ENVIRONMENT:'staging',BM_STAGING_PROJECT_REF:'fixture',SUPABASE_URL:'https://fixture.supabase.co',BM_APP_ORIGIN:'https://fixture.vercel.app',BM_STRIPE_PORTAL_CONFIGURATION_ID:'bpc_fixture'};
function fixture() {
 const metadata={dbpProduct:'buyermatch',dealBlastUserId:owner,dbpCheckoutId:'checkout'};
 const sub={id:'sub_owned',customer:'cus_bm',livemode:false,metadata,items:{data:[{id:'si_owned'}]}};
 const checkout={id:'checkout',owner_id:owner,product:'buyermatch',session_id:'cs_owned'};
 const session={id:'cs_owned',status:'complete',mode:'subscription',client_reference_id:owner,customer:'cus_bm',subscription:'sub_owned',livemode:false,metadata:{...metadata}};
 const config={active:true,livemode:false};
 const price={id:'price_pro',livemode:false,active:true,type:'recurring',currency:'usd',unit_amount:11900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const created=[];const tables=[];
 const db={from(table){tables.push(table);const chain={select(){return this},eq(k,v){if(k==='owner_id')assert.equal(v,owner);return this},maybeSingle(){return Promise.resolve({data:table==='bm_entitlements'?{stripe_subscription_id:'sub_owned'}:checkout})},single(){return Promise.resolve({data:{version:'buyermatch-pro-v1',product:'buyermatch',stripe_price_id:'price_pro'}})}};return chain}};
 const list={has_more:false,data:[sub]};
 const stripe={subscriptions:{retrieve:async()=>sub,list:async()=>list},checkout:{sessions:{retrieve:async()=>session}},prices:{retrieve:async()=>price},billingPortal:{configurations:{retrieve:async()=>config},sessions:{create:async value=>{created.push(value);return {url:'https://billing.stripe.com/p/fixture',livemode:false}}}}};
 return {db,stripe,sub,session,config,price,list,created,tables,run:(operation,version)=>subscriberPortal(db,{id:owner},operation,version,env,stripe)};
}
test('independent payment, cancel and approved tier changes use only server-owned resources',async()=>{
 const f=fixture();for(const operation of ['payment','cancel','change']) await f.run(operation,'buyermatch-pro-v1');
 assert.equal(f.created.length,3);assert.equal(f.created[0].customer,'cus_bm');
 assert.equal(f.created[0].flow_data.type,'payment_method_update');
 assert.equal(f.created[1].flow_data.subscription_cancel.subscription,'sub_owned');
 assert.equal(f.created[2].flow_data.subscription_update_confirm.items[0].price,'price_pro');
 assert.ok(f.created.every(c=>c.return_url.startsWith(env.BM_APP_ORIGIN+'/app/buyermatch/plans')));
 assert.ok(!f.tables.includes('workspace_plan_assignments'));
})
for(const [name,mutate] of [
 ['foreign owner',f=>{f.sub.metadata.dealBlastUserId='foreign'}],
 ['CRM product',f=>{f.sub.metadata.dbpProduct='crm'}],
 ['live resource in sandbox',f=>{f.sub.livemode=true}],
 ['mismatched customer',f=>{f.session.customer='cus_other'}],
 ['mismatched subscription',f=>{f.session.subscription='sub_other'}],
 ['mismatched checkout identity',f=>{f.session.client_reference_id='other'}],
 ['open checkout',f=>{f.session.status='open'}],
 ['expired checkout',f=>{f.session.status='expired'}],
 ['missing completion proof',f=>{delete f.session.status}],
 ['one-time checkout',f=>{f.session.mode='payment'}],
 ['wrong checkout session',f=>{f.session.id='cs_other'}],
 ['foreign checkout metadata',f=>{f.session.metadata.dealBlastUserId='other'}],
 ['CRM checkout metadata',f=>{f.session.metadata.dbpProduct='crm'}],
 ['shared CRM customer',f=>{f.list.data=[f.sub,{livemode:false,metadata:{dbpProduct:'crm',dealBlastUserId:owner}}]}],
 ['incomplete customer inventory',f=>{f.list.has_more=true}],
 ['inactive portal configuration',f=>{f.config.active=false}],
 ['wrong portal mode',f=>{f.config.livemode=true}],
]) test(`portal rejects ${name} before creating a session`,async()=>{
 const f=fixture();mutate(f);await assert.rejects(f.run('payment'));assert.equal(f.created.length,0);
});
test('portal rejects unknown tier, wrong amount and live price in test environment',async()=>{
 const f=fixture();await assert.rejects(f.run('change','enterprise'));
 f.price.unit_amount=1;await assert.rejects(f.run('change','buyermatch-pro-v1'));
 f.price.unit_amount=11900;f.price.livemode=true;await assert.rejects(f.run('change','buyermatch-pro-v1'));assert.equal(f.created.length,0);
});
function agreements() {
 const documents=['platform_terms','privacy'].map((kind,i)=>({id:`doc-${i}`,kind,version:'1',content:kind,document_hash:createHash('sha256').update(kind).digest('hex')}));
 const accepted=[];const filters=[];
 const db={from(table){return {select(){return this},eq(k,v){filters.push([table,k,v]);return this},in(){return this},is(k,v){assert.equal(k,'deal_id');assert.equal(v,null);return this},then(resolve){return Promise.resolve({data:table==='bm_documents'?documents:accepted}).then(resolve)}}}};
 return {documents,accepted,filters,db};
}
test('checkout requires current version/hash consent bound to the authenticated owner',async()=>{
 const f=agreements();await assert.rejects(requireSubscriberAgreements(f.db,owner));
 f.accepted.push(...f.documents.map(d=>({document_id:d.id,version:d.version,document_hash:d.document_hash})));
 await requireSubscriberAgreements(f.db,owner);
 assert.ok(f.filters.some(([t,k,v])=>t==='bm_acceptances'&&k==='owner_id'&&v===owner));
 f.accepted[0].document_hash='stale';await assert.rejects(requireSubscriberAgreements(f.db,owner));
});
test('missing approved documents and tampered agreement text fail closed',async()=>{
 const f=agreements();f.documents[0].content='changed';await assert.rejects(subscriberAgreements(f.db,owner));
 f.documents.splice(0,1);await assert.rejects(subscriberAgreements(f.db,owner));
});
