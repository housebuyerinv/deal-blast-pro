import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProductionResend } from '../../server/buyermatch/provider-verification.js';
const env={VERCEL_ENV:'production',BM_ENVIRONMENT:'production',BM_RESPONSE_ENABLED:'true',BM_PRODUCTION_PROJECT_REF:'aigvnbxiydbzzqbetlhl',SUPABASE_URL:'https://aigvnbxiydbzzqbetlhl.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',BM_CHECKOUT_ENABLED:'false',BM_DELIVERY_MODE:'disabled',RESEND_API_KEY:'fixture-secret',BM_RESEND_FROM:'Deal Blast Pro <notifications@housebuyerinvestments.com>'};
test('provider preflight refuses missing key and nonproduction without network access',async()=>{
 for(const change of [{RESEND_API_KEY:''},{VERCEL_ENV:'preview'},{BM_ENVIRONMENT:'staging'},{SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co'}]){
 let calls=0;const result=await verifyProductionResend({...env,...change},async()=>{calls++;throw Error('unexpected');});assert.equal(result.authenticated,false);assert.equal(calls,0);
 }
});
test('provider preflight uses only fixed GET and returns no provider payload or secret',async()=>{
 let calls=0;const result=await verifyProductionResend(env,async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/domains');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);return {ok:true,json:async()=>({data:[{name:'housebuyerinvestments.com',status:'verified',secret:'private'}]})};});
 assert.equal(calls,1);assert.equal(result.authenticated,true);assert.equal(result.senderVerified,true);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(JSON.stringify(result).includes(env.RESEND_API_KEY),false);
});
test('provider preflight fails closed on denial, outage, malformed response, or unverified domain',async()=>{
 for(const status of [401,403,429,500]){const r=await verifyProductionResend(env,async()=>({ok:false,status}));assert.equal(r.authenticated,false);assert.equal(r.senderVerified,false);}
 const failure=await verifyProductionResend(env,async()=>{throw Error(env.RESEND_API_KEY)});assert.equal(JSON.stringify(failure).includes(env.RESEND_API_KEY),false);
 const r=await verifyProductionResend(env,async()=>({ok:true,json:async()=>({data:[{name:'housebuyerinvestments.com',status:'pending'}]})}));assert.equal(r.senderVerified,false);
});
