import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';
const bundle=async(entry,plugins=[])=>{
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {subscriberDestination}=await bundle('src/lib/subscriberDestination.ts');
const {signRegistrationIntent,verifyRegistrationIntent}=await bundle('api/_registrationIntent.ts');
const intent={version:1,email:'synthetic@example.test',name:'Test User',company:'',role:'Admin',product:'buyermatch',tier:'pro',plan:'Free',documents:[],expires:Date.now()+3600000};
test('product and tier are HMAC-bound, identity-scoped, expiring and never grant a paid CRM plan',()=>{
 const token=signRegistrationIntent(intent,'synthetic-key');
 assert.equal(verifyRegistrationIntent(token,intent.email,'synthetic-key').tier,'pro');
 assert.throws(()=>verifyRegistrationIntent(token,'other@example.test','synthetic-key'));
 assert.throws(()=>verifyRegistrationIntent(token,intent.email,'synthetic-key',intent.expires+1));
 const changed=Buffer.from(JSON.stringify({...intent,tier:'starter'})).toString('base64url')+'.'+token.split('.')[1];
 assert.throws(()=>verifyRegistrationIntent(changed,intent.email,'synthetic-key'));
 for(const override of [{product:'other'},{tier:'enterprise'},{plan:'Pro'},{role:'Super Admin'}]) assert.throws(()=>signRegistrationIntent({...intent,...override},'synthetic-key'));
});
test('navigation is restricted to explicit internal destinations; product query cannot grant access',()=>{
 assert.equal(subscriberDestination('?product=buyermatch&tier=pro&next=https://evil.example'),'/app/buyermatch/plans?tier=pro');
 assert.equal(subscriberDestination('','https://evil.example'),'/app/dashboard');
 assert.equal(subscriberDestination('','/app/buyermatch/plans?tier=starter'),'/app/buyermatch/plans?tier=starter');
 assert.equal(subscriberDestination('?product=crm&tier=pro'),'/app/dashboard');
});
globalThis.__subscriberSession={data:{session:{access_token:'synthetic'}}};
const {completeRegistration}=await bundle('src/lib/completeRegistration.ts',[{name:'session',setup(b){b.onResolve({filter:/^\.\/supabase$/},()=>({path:'session',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase={auth:{getSession:async()=>globalThis.__subscriberSession}}'}));}}]);
test('existing login uses read-only status, including while registration is paused',async()=>{
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({ok:true,provisioned:true,destination:'/app/buyermatch/plans?tier=pro'})}};
 try {assert.equal(await completeRegistration(),'/app/buyermatch/plans?tier=pro');assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/register-account?action=status');assert.equal(calls[0][1].method,undefined)}finally{globalThis.fetch=original}
});
test('missing profile completes only after verified status and propagates pause/failure safely',async()=>{
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{calls.push(url);return {ok:!calls.length||calls.length===1,json:async()=>calls.length===1?{ok:true,provisioned:false}:{ok:false,error:'Paused'}}};
 try {await assert.rejects(completeRegistration(),/Paused/);assert.deepEqual(calls,['/api/register-account?action=status','/api/register-account'])}finally{globalThis.fetch=original}
});
