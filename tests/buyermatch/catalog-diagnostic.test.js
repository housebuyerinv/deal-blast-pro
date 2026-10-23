import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subscriptionCatalog, catalogDiagnosticEnabled } from '../../server/buyermatch/catalog.js';
const env = { BM_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview',
  BM_STAGING_PROJECT_REF: 'qxhhlprentrufobpcgna', SUPABASE_URL: 'https://qxhhlprentrufobpcgna.supabase.co',
  BM_APP_ORIGIN: 'https://dbp-registration-s2-preview-housebuyerinv.vercel.app', BM_CHECKOUT_ENABLED: 'false',
  BM_S2_CATALOG_DIAGNOSTIC: 'true' };
const plans = ['starter','pro'].map(tier => ({ version:`buyermatch-${tier}-v1`,product:'buyermatch',allowance:20,stripe_price_id:tier }));
const db = { from:()=>({select:()=>({eq:async()=>({data:plans})})}) };
const price = tier=>({livemode:false,active:true,type:'recurring',currency:'usd',unit_amount:tier==='starter'?5900:11900,recurring:{usage_type:'licensed',interval:'month',interval_count:1}});
const factory = ()=>({prices:{retrieve:async id=>price(id)}});
test('paused S2 diagnostic reads both plans without enabling checkout',async()=>{
  const result=await subscriptionCatalog(db,{env,stripeFactory:factory,log:()=>assert.fail('Unexpected diagnostic')});
  assert.equal(catalogDiagnosticEnabled(env),true);assert.equal(result.available,true);
  assert.deepEqual(result.catalog.map(p=>p.amount),[5900,11900]);assert.equal(env.BM_CHECKOUT_ENABLED,'false');
});
test('diagnostic never opts in outside exact protected staging scope',()=>{
  for(const changes of [{VERCEL_ENV:'production'},{BM_ENVIRONMENT:'production'},{SUPABASE_URL:'https://aigvnbxiydbzzqbetlhl.supabase.co'},{BM_STAGING_PROJECT_REF:'other'},{BM_S2_CATALOG_DIAGNOSTIC:'false'}])
    assert.equal(catalogDiagnosticEnabled({...env,...changes}),false);
});
test('restricted key denial retains only safe provider fields',async()=>{
  const logs=[];const e=Object.assign(new Error('Authorization: rk_test_SYNTHETIC_NOT_A_KEY'),{type:'StripePermissionError',code:'permission_missing',statusCode:403,requestId:'req_fixture123',raw:{secret:'do-not-log'}});
  const result=await subscriptionCatalog(db,{env,stripeFactory:()=>({prices:{retrieve:async()=>{throw e}}}),log:v=>logs.push(v)});
  assert.deepEqual(result,{catalog:[],available:false,live:false});assert.equal(logs[0].stage,'stripe_price_read');
  assert.equal(logs[0].errorClass,'StripePermissionError');assert.equal(logs[0].code,'permission_missing');
  assert.equal(logs[0].status,403);assert.equal(logs[0].requestId,'req_fixture123');
  assert.doesNotMatch(JSON.stringify(logs),/rk_test|Authorization|do-not-log/);
});
test('missing test key and invalid origin fail closed at configuration',async()=>{
  for(const [changes,code] of [[{},'test_key_missing_or_invalid'],[{BM_APP_ORIGIN:'https://deal-blast-pro.vercel.app'},'preview_origin_invalid']]){
    const logs=[];const result=await subscriptionCatalog(db,{env:{...env,...changes},log:v=>logs.push(v)});
    assert.equal(result.available,false);assert.equal(logs[0].stage,'configuration_validation');assert.equal(logs[0].code,code);
  }
});
test('database failures have no provider calls or raw diagnostics',async()=>{
  const logs=[];const bad={from:()=>({select:()=>({eq:async()=>({error:{message:'private SQL data'}})})})};
  await subscriptionCatalog(bad,{env,stripeFactory:factory,log:v=>logs.push(v)});
  assert.equal(logs[0].stage,'catalog_database_read');assert.equal(logs[0].code,'catalog_database_unavailable');
  assert.doesNotMatch(JSON.stringify(logs),/private SQL/);
});
test('provider errors reject injected request IDs, classes and codes',async()=>{
  const logs=[];await subscriptionCatalog(db,{env,stripeFactory:()=>({prices:{retrieve:async()=>{throw {name:'rk_test_SECRET',code:'rk_test_SECRET',requestId:'req_foo\nSECRET',statusCode:200,body:'SECRET'}}}}),log:v=>logs.push(v)});
  assert.equal(logs[0].errorClass,'UnknownError');assert.equal(logs[0].code,'unclassified');assert.equal(logs[0].requestId,null);assert.equal(logs[0].status,null);
  assert.doesNotMatch(JSON.stringify(logs),/SECRET/);
});
test('live-mode price in staging is rejected distinctly',async()=>{
  const logs=[];const result=await subscriptionCatalog(db,{env,stripeFactory:()=>({prices:{retrieve:async()=>({...price('starter'),livemode:true})}}),log:v=>logs.push(v)});
  assert.equal(result.available,false);assert.equal(logs[0].stage,'account_mode_validation');assert.equal(logs[0].code,'price_mode_mismatch');
});
test('handler keeps checkout gating separate and response generic',()=>{
  const source=readFileSync('server/http/buyermatch.ts','utf8');
  assert.match(source,/checkoutEnabled = process.env.BM_CHECKOUT_ENABLED === "true" && result.available/);
  assert.doesNotMatch(source,/catalogDiagnosticEnabled\(\).*BM_CHECKOUT_ENABLED\s*=/);
  assert.doesNotMatch(source,/emit\(\{[^}]*correlationId/s);
});
