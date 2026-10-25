import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {signRegistrationIntent,verifyRegistrationIntent} from '../api/_registrationIntent.ts';
import {provisionOwner,assertProvisionRequest,validateBaseline,validateInput,DOCS,OWNER,REF,APPROVAL} from '../scripts/testing/s2-owner-provision.mjs';
const uid='d06b3f41-72fa-4517-a36a-f14d83b0a6e2',wid='9e025ba0-2483-4e91-8619-3a97447c8d90';
const now=Date.now(),pwd='DUMMY_OWNER_PASSWORD_12345',token='DUMMY_PRIVATE_ACCESS_TOKEN';
const key=role=>`dummy.${Buffer.from(JSON.stringify({ref:REF,role})).toString('base64url')}.dummy`;
const baseline=()=>({approval:APPROVAL,project:REF,email:OWNER,ownerId:uid,runId:'8f811ef0-6f4c-4e8c-9c08-e8e7892fd938',functionHash:'360ec632abd40692cee1683b30de3bd0',serviceOnly:true,pausesVerified:true,createdAt:now});
const input=()=>({password:pwd,name:'Synthetic Owner',company:'',acceptedBoth:true,acceptedAt:now,documents:DOCS.map(d=>({id:d.id,hash:d.document_hash}))});
const documents=()=>DOCS.map(d=>({...d,content:`SYNTHETIC QA FIXTURE ONLY — ${d.kind}. This is not a legal agreement, fee authorization, contract, or approval to contact real buyers. Used only to exercise version acceptance in isolated staging. No success fees are payable.`}));
const complete=()=>({
 account_profiles:[{user_id:uid,email:OWNER,full_name:'Synthetic Owner',company:null,role:'Admin',account_status:'Active',deactivated_at:null}],
 workspaces:[{id:wid,owner_user_id:uid,owner_email:OWNER,name:"Synthetic Owner's Workspace",account_status:'Active',deactivated_at:null}],
 workspace_plan_assignments:[{workspace_id:wid,user_id:uid,plan_name:'Free',billing_status:'Free Active',trial_status:'Free Active',payment_status:'No payment required',access_status:'Active',stripe_customer_id:null,stripe_subscription_id:null}],
 bm_acceptances:DOCS.map(d=>({owner_id:uid,deal_id:null,document_id:d.id,version:d.version,document_hash:d.document_hash,signature_evidence:{typedName:'Synthetic Owner',method:'authenticated_typed_signature',userId:uid}})),
 account_registration_events:[{user_id:uid,workspace_id:wid,email:OWNER,event_type:'new_account_created',status:'created',idempotency_key:`new_account_created:${uid}`}],
});
function fixture(change={}){
 const calls=[];let state=change.before||Object.fromEntries(Object.keys(complete()).map(k=>[k,[]]));let rpcCount=0;
 const io={getKeys:()=>({anon:key('anon'),service:change.service||key('service_role')}),signRegistrationIntent,verifyRegistrationIntent,
  request:async(method,url,credential,body)=>{
   assertProvisionRequest(method,url,body);calls.push({method,url,credential,body});const u=new URL(url);
   if(u.pathname==='/auth/v1/token'){if(change.loginError)throw Error(pwd);return {access_token:token,user:{id:uid}};}
   if(u.pathname==='/auth/v1/user')return {id:uid,email:OWNER,email_confirmed_at:'2026-10-24',is_anonymous:false,...change.user};
   if(u.pathname==='/auth/v1/logout'){if(change.logoutError)throw Error(token);return {};}
   if(u.pathname.endsWith('/bm_documents'))return change.documents||documents();
   if(u.pathname.includes('/rpc/')){rpcCount++;if(change.rpcError)throw Error('DUMMY_PRIVATE_PROVIDER_ERROR');state=change.after||complete();return {created:true,workspaceId:wid};}
   return state[u.pathname.split('/').at(-1)];
  }};
 return {io,calls,get rpcCount(){return rpcCount;}};
}
test('genuine password authentication and exact accepted documents create only approved Free tuple',async()=>{
 const f=fixture(),r=await provisionOwner(input(),f.io,baseline(),now);
 assert.equal(r.ok,true);assert.equal(r.verified,true);assert.equal(r.localSessionClosed,true);assert.equal(f.rpcCount,1);
 const b=f.calls.find(x=>x.url.includes('/rpc/')).body;
 assert.equal(b.p_user,uid);assert.equal(b.p_plan,'Free');assert.equal(b.p_role,'Admin');assert.equal(b.p_require_documents,true);assert.deepEqual(b.p_documents,input().documents);
 assert.equal(f.calls.at(-1).url,`https://${REF}.supabase.co/auth/v1/logout?scope=local`);
 for(const v of [pwd,token,key('service_role'),'Synthetic Owner','registration_intent'])assert.ok(!JSON.stringify(r).includes(v));
});
for(const[label,mutate]of Object.entries({noConsent:x=>{x.acceptedBoth=false;},missingConsent:x=>{delete x.acceptedBoth;},expiredAcceptance:x=>{x.acceptedAt=now-900001;},futureAcceptance:x=>{x.acceptedAt=now+1;},blankSignature:x=>{x.name='';},wrongDocs:x=>{x.documents[0].hash='0'.repeat(64);},duplicateDocs:x=>{x.documents[1]=x.documents[0];},extraRole:x=>{x.role='Super Admin';}}))test(`${label}: no authentication or RPC`,async()=>{
 const f=fixture(),x=input();mutate(x);const r=await provisionOwner(x,f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.calls.length,0);
});
for(const[label,user]of Object.entries({unconfirmed:{email_confirmed_at:null},differentOwner:{email:'other@example.invalid'},differentIdentity:{id:wid},anonymous:{is_anonymous:true},banned:{banned_until:'2099-01-01'}}))test(`${label}: server identity rejection precedes privileged reads/writes`,async()=>{
 const f=fixture({user}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.rpcCount,0);assert.equal(r.localSessionClosed,true);assert.equal(f.calls.filter(c=>c.url.includes('/rest/')).length,0);
});
test('wrong password stops without retry or fake ownership',async()=>{const f=fixture({loginError:true}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.calls.length,1);assert.equal(f.rpcCount,0);});
test('Production key cannot authenticate or reach provisioning',async()=>{const f=fixture({service:`dummy.${Buffer.from(JSON.stringify({ref:'aigvnbxiydbzzqbetlhl',role:'service_role'})).toString('base64url')}.dummy`}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.calls.length,0);});
test('changed actual document content fails before provisioning',async()=>{const d=documents();d[0].content+='altered';const f=fixture({documents:d}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.rpcCount,0);assert.equal(r.localSessionClosed,true);});
test('existing exact tuple is verified idempotently without RPC or new acceptance',async()=>{const f=fixture({before:complete()}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,true);assert.equal(r.stage,'already-exact-no-write');assert.equal(f.rpcCount,0);});
for(const[label,mutate]of Object.entries({partial:s=>{s.workspaces=[];},wrongRole:s=>{s.account_profiles[0].role='Team Member / VA';},paidCRM:s=>{s.workspace_plan_assignments[0].plan_name='Pro';},deactivated:s=>{s.workspaces[0].account_status='Deactivated';},wrongConsent:s=>{s.bm_acceptances[0].signature_evidence.typedName='Another Name';}}))test(`${label}: no repair/overwrite`,async()=>{const s=complete();mutate(s);const f=fixture({before:s}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.rpcCount,0);});
test('forged signed-intent output cannot assign a paid plan',async()=>{const f=fixture();f.io.verifyRegistrationIntent=(...a)=>({...verifyRegistrationIntent(...a),plan:'Pro'});const r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(f.rpcCount,0);});
test('transaction RPC failure is uncertain; no fallback writes or automatic retry',async()=>{const f=fixture({rpcError:true}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(r.rpcAttempted,true);assert.equal(f.rpcCount,1);assert.equal(r.localSessionClosed,true);assert.equal(r.retryAttempted,false);});
test('post-commit assertion failure remains uncertain and does not delete evidence',async()=>{const s=complete();s.account_profiles[0].role='Buyer';const f=fixture({after:s}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(r.stage,'post-commit-verification');assert.equal(f.rpcCount,1);assert.equal(f.calls.some(x=>x.method==='DELETE'||x.method==='PATCH'),false);});
test('session cleanup failure is not reported as fully completed',async()=>{const f=fixture({logoutError:true}),r=await provisionOwner(input(),f.io,baseline(),now);assert.equal(r.ok,false);assert.equal(r.verified,true);assert.equal(r.stage,'session-cleanup-unverified');assert.equal(f.rpcCount,1);});
test('expired or substituted preflight capsule fails before credentials',()=>{for(const b of [{...baseline(),createdAt:now-3600001},{...baseline(),project:'aigvnbxiydbzzqbetlhl'},{...baseline(),serviceOnly:false},{...baseline(),pausesVerified:false},{...baseline(),functionHash:'changed'}])assert.throws(()=>validateBaseline(b,now));});
test('actual request allowlist denies other origins, roles, paid plans, Auth mutations and disabled consent',()=>{
 const b={p_user:uid,p_email:OWNER,p_name:'Synthetic Owner',p_company:'',p_role:'Admin',p_plan:'Free',p_documents:input().documents,p_require_documents:true},url=`https://${REF}.supabase.co/rest/v1/rpc/dbp_provision_registration`;
 assert.doesNotThrow(()=>assertProvisionRequest('POST',url,b));
 for(const patch of [{p_role:'Super Admin'},{p_plan:'Pro'},{p_require_documents:false},{p_email:'other@example.invalid'},{p_documents:[input().documents[0],input().documents[0]]}])assert.throws(()=>assertProvisionRequest('POST',url,{...b,...patch}));
 for(const[method,u,body]of [['POST',url.replace(REF,'aigvnbxiydbzzqbetlhl'),b],['PATCH',`https://${REF}.supabase.co/auth/v1/admin/users/${uid}`,{email_confirm:true}],['POST',`https://${REF}.supabase.co/auth/v1/logout?scope=global`],['POST',`https://${REF}.supabase.co/rest/v1/account_profiles`,{}]])assert.throws(()=>assertProvisionRequest(method,u,body));
});
test('actual invalid child invocation exits with sanitized result and no CLI/network work',()=>{const r=spawnSync(process.execPath,['scripts/testing/s2-owner-provision.mjs','--unauthorized'],{encoding:'utf8',input:JSON.stringify(input())});assert.equal(r.status,1);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).rpcAttempted,false);assert.ok(!r.stdout.includes(pwd));});
test('wrapper pins exact reviewed core and never adds a registration unpause',()=>{const s=readFileSync('scripts/owner-provision-buyermatch-s2.ps1','utf8'),h=createHash('sha256').update(readFileSync('scripts/testing/s2-owner-provision.mjs')).digest('hex').toUpperCase();assert.ok(s.includes(h));assert.doesNotMatch(s,/DBP_REGISTRATION_PAUSED\s*=|RESEND_API_KEY|Write-Host\s+\$json/);assert.match(s,/ACCEPT BOTH S2 QA FIXTURES/);});
test('private input contract rejects extra privileged fields',()=>{assert.throws(()=>validateInput({...input(),ownerId:wid},now));});
