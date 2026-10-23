import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loginSyntheticSubscriber, cuaLoginDriver } from '../../scripts/testing/buyermatch-browser-login.mjs';
const origin='https://dbp-registration-s2-preview-housebuyerinv.vercel.app';
const credentials={email:'dbp-s2-dummy-harness@example.com',password:'DUMMY-local-only-password'};
function fixture(changes={}){
  let url;const calls=[];
  const driver={navigate:async v=>{url=v;calls.push('navigate')},readURL:async()=>url,
    passwordIsMasked:async()=>true,fillEmail:async()=>calls.push('email'),fillPassword:async()=>calls.push('password'),
    submit:async()=>calls.push('submit'),waitForReady:async()=>{url=origin+'/app/buyermatch/plans';calls.push('ready')},close:async()=>calls.push('close'),...changes};
  return {driver,calls};
}
test('normal login uses only token-free URL and observes only after safe route',async()=>{
  const {driver,calls}=fixture();const result=await loginSyntheticSubscriber(driver,credentials);
  assert.deepEqual(result,{ok:true,stage:'ready',route:'/app/buyermatch/plans',observationAllowed:true});
  assert.deepEqual(calls,['navigate','email','password','submit','ready']);
  assert.doesNotMatch(JSON.stringify(result),/DUMMY|access_token|refresh_token|Authorization/);
});
for(const target of ['https://deal-blast-pro.vercel.app','https://evil.invalid','http://127.0.0.1:9999'])test('reject unapproved origin '+target,async()=>{
  const {driver,calls}=fixture();const r=await loginSyntheticSubscriber(driver,{...credentials,origin:target});
  assert.equal(r.ok,false);assert.deepEqual(calls,['close']);
});
test('retired exposed identity cannot be reused',async()=>{
  const {driver,calls}=fixture();const r=await loginSyntheticSubscriber(driver,{...credentials,email:'dbp-s2-billing-1792713543427@example.com'});
  assert.equal(r.ok,false);assert.deepEqual(calls,['close']);
});
test('unmasked password input stops before credential entry',async()=>{
  const {driver,calls}=fixture({passwordIsMasked:async()=>false});const r=await loginSyntheticSubscriber(driver,credentials);
  assert.equal(r.ok,false);assert.equal(calls.includes('email'),false);assert.equal(calls.includes('password'),false);
});
for(const target of [origin+'/auth/callback#access_token=DUMMY',origin+'/app/buyermatch/plans?token=DUMMY',origin+'/app/buyermatch/plans#refresh_token=DUMMY','https://evil.invalid/app/buyermatch/plans'])test('unsafe post-login route never permits observation: '+target.split(/[?#]/)[0],async()=>{
  const {driver,calls}=fixture({readURL:async()=>calls.includes('ready')?target:origin+'/admin-login?product=buyermatch'});
  const r=await loginSyntheticSubscriber(driver,credentials);assert.equal(r.ok,false);assert.equal(r.observationAllowed,false);assert.equal(calls.at(-1),'close');assert.doesNotMatch(JSON.stringify(r),/DUMMY/);
});
test('timeout/error with credentials discards complete exception and does not retry',async()=>{
  const {driver,calls}=fixture({waitForReady:async()=>{throw new Error('DUMMY access_token=DUMMY Authorization: DUMMY')}});
  const r=await loginSyntheticSubscriber(driver,credentials);assert.equal(r.stage,'safe_route_wait');assert.equal(r.closed,true);assert.doesNotMatch(JSON.stringify(r),/DUMMY|Authorization|access_token/);assert.equal(calls.filter(c=>c==='submit').length,1);
});
test('failed close keeps observations prohibited',async()=>{
  const {driver}=fixture({waitForReady:async()=>{throw Error('DUMMY')},close:async()=>{throw Error('DUMMY')}});
  const r=await loginSyntheticSubscriber(driver,credentials);assert.equal(r.closed,false);assert.equal(r.observationAllowed,false);assert.doesNotMatch(JSON.stringify(r),/DUMMY/);
});
test('navigation between email and password entry stops before password or submit',async()=>{
  let reads=0;const {driver,calls}=fixture({readURL:async()=>++reads===1?origin+'/admin-login?product=buyermatch':'https://evil.invalid/login'});
  const result=await loginSyntheticSubscriber(driver,credentials);
  assert.equal(result.ok,false);assert.equal(calls.includes('password'),false);assert.equal(calls.includes('submit'),false);
});
test('driver exceptions at each stage never expose raw errors or repeat login',async()=>{
  for(const method of ['navigate','readURL','passwordIsMasked','fillEmail','fillPassword','submit','waitForReady']){
    const {driver,calls}=fixture({[method]:async()=>{throw Error('DUMMY-PASSWORD access_token=DUMMY refresh_token=DUMMY Authorization:DUMMY')}});
    const result=await loginSyntheticSubscriber(driver,credentials);
    assert.equal(result.ok,false);assert.equal(result.observationAllowed,false);assert.equal(result.closed,true);
    assert.doesNotMatch(JSON.stringify(result),/DUMMY|access_token|refresh_token|Authorization/);
    assert.ok(calls.filter(c=>c==='submit').length<=1);
  }
});
test('Cua metadata request explicitly suppresses output and selects only the owned tab',async()=>{
  let options;const driver=cuaLoginDriver({id:'owned'},{browserId:'2',listTabs:async o=>{options=o;return [{id:'foreign',url:'https://evil.invalid/#DUMMY'},{id:'owned',url:origin+'/app/buyermatch/plans'}]}});
  assert.equal(await driver.readURL(),origin+'/app/buyermatch/plans');assert.deepEqual(options,{browser:'2',emit:false});
});
test('installed Supabase SDK supplies expiry on normal password login without URL tokens',async()=>{
  const requested=[];const auth=createClient('http://127.0.0.1:9999','DUMMY-anon',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,opts)=>{
    requested.push(String(url));assert.equal(JSON.parse(opts.body).password,credentials.password);
    return new globalThis.Response(JSON.stringify({access_token:'DUMMY-access',refresh_token:'DUMMY-refresh',token_type:'bearer',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:credentials.email}}),{status:200,headers:{'Content-Type':'application/json'}});
  }}});
  const {data,error}=await auth.auth.signInWithPassword(credentials);assert.equal(error,null);assert.equal(data.session.expires_in,3600);assert.ok(data.session.expires_at>Date.now()/1000);assert.equal(requested.length,1);assert.doesNotMatch(requested[0],/DUMMY|access_token|refresh_token/);
});
test('harness never emits observations, credentials or manual session fragments',()=>{
  const source=readFileSync('scripts/testing/buyermatch-browser-login.mjs','utf8');
  assert.doesNotMatch(source,/console\.|getAXState\(|getScreenshot\(|writeFile|access_token=|refresh_token=|Authorization|Location:/);
});
