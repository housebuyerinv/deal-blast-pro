import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { URL } from 'node:url';
import { executeProDenials, validateDenialPlan } from '../../scripts/testing/s2-pro-denials.mjs';
const UID='368f5f93-acf7-4cc3-9805-a4c0817506c3',PRIVATE='DUMMY_PRIVATE_PASSWORD',TOKEN='DUMMY_PRIVATE_AUTH_TOKEN';
const ref='qxhhlprentrufobpcgna',project='prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',team='team_2ejXKYjjGXIFsIQTUMEqZ8Cf';
const jwt=p=>'e30.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.DUMMY';
const plan=()=>{const runId='19d2a021-f08e-41c9-823a-995046a7e714';return {source:'4e79c99ac98d13bb030076aaf55a8289934d9ae4',project,team,database:ref,scope:'payment-free-preflight',runId,root:path.join(path.resolve('C:/Users/CTL Katastrophic/DBPBuyerMatchS2'),runId),deploymentId:'dpl_SyntheticOnly',origin:'https://dbp-registration-s2-synthetic-housebuyerinv.vercel.app',expiresAt:Date.now()+600000};};
const env=()=>({SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:jwt({role:'anon',ref}),VERCEL_OIDC_TOKEN:jwt({project_id:project,owner_id:team,exp:Date.now()/1000+600})});
const response=(status,b)=>new globalThis.Response(status===204?null:JSON.stringify(b),{status});
async function fixture(kind='pass'){
  const p=plan(),calls=[];
  const fetcher=async(url,o)=>{
    calls.push({url,options:o});assert.equal(o.redirect,'error');
    if(url.startsWith(p.origin))assert.ok(o.headers['x-vercel-trusted-oidc-idp-token']);
    else{assert.equal(o.headers['x-vercel-trusted-oidc-idp-token'],undefined);assert.equal(new URL(url).origin,`https://${ref}.supabase.co`);}
    if(url.includes('/logout'))return response(204);
    if(url.includes('/token?')){
      assert.deepEqual(JSON.parse(o.body),{email:'dbp-s2-pro-1792721835370@example.com',password:PRIVATE});
      if(kind==='bad-password')return response(400,{message:PRIVATE});
      return response(200,{access_token:TOKEN,user:{id:kind==='wrong-user'?'foreign':UID}});
    }
    if(url.endsWith('/auth/v1/user'))return response(200,{id:UID,email:'dbp-s2-pro-1792721835370@example.com',role:'authenticated',email_confirmed_at:'2026-10-22T00:00:00Z'});
    if(url.includes('billing-status')){
      if(!o.headers.Authorization)return response(401,{error:'Sign in required'});
      assert.equal(o.headers.Authorization,'Bearer '+TOKEN);
      return response(200,{source:kind==='wrong-source'?'0'.repeat(40):p.source,projectId:project,deploymentId:p.deploymentId,registrationPaused:true,checkoutEnabled:false,liveBillingDisabled:true,deliveryDisabled:true,...Object.fromEntries(['OWNER_ID','RUN_ID','STARTED_AT','EXPIRES_AT','OPERATIONS'].map(k=>['BM_S2_BILLING_'+k,'']))});
    }
    if(url.includes('/s2-attestation')||url.includes('/s2-stripe-readiness'))return response(403,{error:'Owner access required'});
    if(url.endsWith('/create-billing-portal-session'))return kind==='unexpected-success'?response(200,{url:'https://billing.stripe.com/'+TOKEN}):response(503,{ok:false,code:'s2_legacy_portal_disabled',error:'fixed'});
    if(url.includes('/property-intelligence/'))return response(503,{ok:false,code:'s2_legacy_checkout_disabled',error:'fixed'});
    return response(503,{error:'S2 billing test window is closed or this operation is not approved.'});
  };
  const r=await executeProDenials(p,{env:env(),password:PRIVATE,fetcher});return {r,calls};
}
test('normal password Auth and every fixed denied request pass without Stripe/session mutation or disclosure',async()=>{
  const {r,calls}=await fixture();assert.equal(r.status,'HOSTED_PAYMENT_FREE_CHECKS_PASS');assert.equal(r.localAuthSessionClosed,true);assert.equal(r.fixtureVerified,true);
  assert.equal(r.checks.length,11);assert.ok(r.checks.every(c=>c.verified));
  assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes(TOKEN),false);
  assert.equal(calls.filter(c=>c.url.includes('/token?')).length,1);assert.equal(calls.filter(c=>c.url.includes('/logout')).length,1);
  assert.equal(calls.some(c=>c.url.includes('api.stripe.com')),false);
});
for(const kind of ['bad-password','wrong-user','wrong-source','unexpected-success'])test('fail closed once, preserve private output: '+kind,async()=>{
  const {r,calls}=await fixture(kind);assert.equal(r.status,'FAILED_OR_UNKNOWN');assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes(TOKEN),false);
  assert.equal(calls.filter(c=>c.url.includes('/token?')).length,1);
  if(kind==='bad-password'||kind==='wrong-user')assert.equal(calls.some(c=>c.options.headers.Authorization),false);
  if(kind==='unexpected-success')assert.equal(calls.some(c=>c.url.includes('/property-intelligence/')),false);
});
test('wrong project/backend, expired OIDC, service key and injected Node override prevent all requests',async()=>{
  for(const patch of [{SUPABASE_URL:'https://wrong.invalid'},{VERCEL_OIDC_TOKEN:jwt({project_id:'other',owner_id:team,exp:Date.now()/1000+600})},{VERCEL_OIDC_TOKEN:jwt({project_id:project,owner_id:team})},{VITE_SUPABASE_ANON_KEY:jwt({role:'service_role',ref})},{NODE_OPTIONS:'DUMMY'}]){
    const r=await executeProDenials(plan(),{env:{...env(),...patch},password:PRIVATE,fetcher:()=>assert.fail()});assert.equal(r.status,'FAILED_OR_UNKNOWN');
  }
});
test('source, immutable scope, deadline and run-owned root cannot be replaced',()=>{
  const p=plan();for(const change of [{source:'0'.repeat(40)},{origin:'https://evil.invalid'},{root:'C:/wrong'},{expiresAt:Date.now()+1000},{scope:'subscription-activation'}])assert.throws(()=>validateDenialPlan({...p,...change}));
});
