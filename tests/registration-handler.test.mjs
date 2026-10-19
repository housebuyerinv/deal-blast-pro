import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import process from 'node:process'
import { Buffer } from 'node:buffer'

let calls, user, existing, signupError, rpcError, signupInput, captured, created, immediateSession
const secret='synthetic-signing-key'
process.env.SUPABASE_SERVICE_ROLE_KEY=secret
process.env.SUPABASE_URL='https://synthetic.example.test'
process.env.SUPABASE_ANON_KEY='synthetic-anon'
process.env.PUBLIC_APP_URL='https://preview.example.test'
const signup=async input=>{ calls.push('signup');signupInput=input;return {data:{session:immediateSession},error:signupError} }
const admin={auth:{getUser:async token=>{calls.push('verify');return {data:{user:token==='valid'?user:null},error:token==='valid'?null:new Error('invalid')}}},
  from(table){calls.push(`read:${table}`);assert.equal(table,'account_profiles');return {select(){return this},eq(_,id){assert.equal(id,user.id);return this},async maybeSingle(){return {data:existing?{user_id:user.id}:null,error:null}}}},
  async rpc(name,args){calls.push(name);captured=args;return {data:{created,workspaceId:'synthetic-workspace'},error:rpcError}}}
globalThis.__registrationMocks={createClient:()=>({auth:{signUp:signup}}),getSupabaseAdminClient:()=>admin,getBearerToken:req=>req.headers?.authorization?.replace(/^Bearer /,'')||''}
const result=await build({entryPoints:['api/register-account.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'registration-mocks',setup(b){
  b.onResolve({filter:/^@supabase\/supabase-js$|^\.\/_accountAuth\.js$/},args=>({path:args.path,namespace:'registration-mock'}))
  b.onLoad({filter:/.*/,namespace:'registration-mock'},()=>({contents:'export const {createClient,getSupabaseAdminClient,getBearerToken}=globalThis.__registrationMocks;',loader:'js'}))
}}]})
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
const {outputFiles}=await build({entryPoints:['api/_registrationIntent.ts'],bundle:true,write:false,platform:'node',format:'esm'})
const {signRegistrationIntent}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'))
const intent={version:1,email:'new@example.test',name:'Synthetic User',company:'Company',role:'Admin',plan:'Starter',documents:[],expires:Date.now()+86400000}
const call=async(body,token)=>{let status,payload;await handler({method:'POST',body,headers:{authorization:token?`Bearer ${token}`:undefined}},{setHeader(){},status(s){status=s;return this},json(p){payload=p}});return {status,payload}}
test.beforeEach(()=>{calls=[];existing=false;signupError=null;rpcError=null;signupInput=null;captured=null;created=false;immediateSession=null;delete process.env.DBP_REGISTRATION_PAUSED;delete process.env.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS;user={id:'verified-identity',email:intent.email,email_confirmed_at:'2026-01-01',user_metadata:{registration_intent:signRegistrationIntent(intent,secret)}}})
test('new signup invokes provider policy but performs no privileged writes before confirmation',async()=>{
 const r=await call({...intent,password:'synthetic-password'});assert.equal(r.status,200);assert.deepEqual(calls,['signup']);assert.equal(signupInput.options.emailRedirectTo,'https://preview.example.test/auth/callback');assert.ok(signupInput.options.data.registration_intent);assert.equal(r.payload.user,undefined)
})
test('existing email and wrong password signup reveal no identity and perform no privileged writes',async()=>{
 signupError={code:'user_already_exists'};const r=await call({...intent,password:'incorrect-password'});assert.equal(r.status,200);assert.equal(r.payload.user,undefined);assert.deepEqual(calls,['signup'])
})
for(const token of [undefined,'invalid']) test(`completion rejects ${token||'missing'} session`,async()=>{
 const r=await call({action:'complete',userId:'victim',email:'victim@example.test'},token);assert.equal(r.status,401);assert.ok(!calls.includes('dbp_provision_registration'))
})
test('email confirmation alone without session cannot provision',async()=>{const r=await call({action:'complete',emailVerified:true});assert.equal(r.status,401);assert.deepEqual(calls,[])})
test('unconfirmed authenticated session cannot provision',async()=>{user.email_confirmed_at=null;assert.equal((await call({action:'complete'},'valid')).status,401);assert.deepEqual(calls,['verify'])})
test('verified existing customer completion is read-only despite attacker supplied billing and role',async()=>{
 existing=true;const r=await call({action:'complete',plan:'Free',role:'Super Admin',userId:'victim'},'valid');assert.equal(r.status,200);assert.equal(r.payload.created,false);assert.deepEqual(calls,['verify','read:account_profiles'])
})
test('confirmed new identity uses signed details and server UUID, ignoring body escalation',async()=>{
 const r=await call({action:'complete',plan:'Owner Admin',role:'Super Admin',userId:'victim',email:'victim@example.test'},'valid');assert.equal(r.status,200);assert.equal(captured.p_user,user.id);assert.equal(captured.p_plan,'Starter');assert.equal(captured.p_role,'Admin')
})
test('forged metadata and another email intent cannot reach provisioning',async()=>{
 user.user_metadata.registration_intent+='bad';assert.equal((await call({action:'complete'},'valid')).status,409);assert.equal(captured,null)
 user.user_metadata.registration_intent=signRegistrationIntent({...intent,email:'other@example.test'},secret);assert.equal((await call({action:'complete'},'valid')).status,409);assert.equal(captured,null)
})
test('atomic RPC failure returns retryable generic error with no fallback writes',async()=>{
 rpcError={message:'private database details'};const r=await call({action:'complete'},'valid');assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.payload),/private database/);assert.deepEqual(calls,['verify','read:account_profiles','dbp_provision_registration'])
})
test('privileged role and BuyerMatch product cannot be registered through CRM input',async()=>{
 for(const override of [{role:'Super Admin'},{plan:'Owner Admin'},{plan:'buyermatch-pro-v1'},{product:'buyermatch'}]) assert.equal((await call({...intent,password:'synthetic-password',...override})).status,400)
 assert.deepEqual(calls,[])
})
test('provider rate limits retained and CAPTCHA token forwarded',async()=>{
 signupError={status:429};assert.equal((await call({...intent,password:'synthetic-password',captchaToken:'synthetic-captcha'})).status,429);assert.equal(signupInput.options.captchaToken,'synthetic-captcha')
})
test('optional pause blocks only new registration, preserving verified existing access',async()=>{
 process.env.DBP_REGISTRATION_PAUSED='true';assert.equal((await call({...intent,password:'synthetic-password'})).status,503);assert.deepEqual(calls,[]);existing=true;assert.equal((await call({action:'complete'},'valid')).status,200)
})
test('immediate Auth session still performs no provisioning until verified completion',async()=>{
 immediateSession={access_token:'synthetic',user:{id:'verified-identity'}};const r=await call({...intent,password:'synthetic-password'});assert.equal(r.payload.session.access_token,'synthetic');assert.deepEqual(calls,['signup'])
})
test('post-commit notification failure cannot misreport successful provisioning',async()=>{
 created=true;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('synthetic notification failure')}
 try {const r=await call({action:'complete'},'valid');assert.equal(r.status,200);assert.equal(r.payload.created,true)} finally {globalThis.fetch=originalFetch}
})
