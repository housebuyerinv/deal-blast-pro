import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { relayOwnerConfirmation, OWNER, REF, CALLBACK } from '../scripts/testing/s2-owner-confirmation.mjs';
const id = 'd06b3f41-72fa-4517-a36a-f14d83b0a6e2';
const password = 'DUMMY_PRIVATE_PASSWORD_123';
const resendKey = 're_DUMMY_PRIVATE_KEY_123456789';
const key = `dummy.${Buffer.from(JSON.stringify({ref: REF, role:'service_role'})).toString('base64url')}.dummy`;
function fixture(change={}) {
  const calls=[];
  const user={id,email:OWNER,email_confirmed_at:null};
  const generated={...user,verification_type:'signup',action_link:`https://${REF}.supabase.co/auth/v1/verify?token=DUMMY_PRIVATE_TOKEN&type=signup&redirect_to=${encodeURIComponent(CALLBACK)}`,...change.generated};
  const io={getServiceKey:()=>change.key||key,request:async(method,url,credential,body,headers)=>{
    calls.push({method,url,credential,body,headers});
    if(change.fail===calls.length)throw Error('DUMMY_PRIVATE_TOKEN '+password+' '+resendKey);
    if(calls.length===1)return {users:change.users||[],total:change.total===undefined?(change.users||[]).length:change.total};
    if(calls.length===2)return generated;
    if(calls.length===3)return {...user,...change.user};
    return change.sent||{id:'95611e56-a7c1-4f37-9019-c435bf15c635'};
  }};
  return {io,calls};
}
const input=()=>({password,passwordConfirmation:password,resendKey});
test('supported signup relay sends exactly one owner-only message and never confirms or provisions',async()=>{
  const f=fixture(),r=await relayOwnerConfirmation(input(),f.io);
  assert.equal(r.ok,true);assert.equal(r.emailAccepted,true);
  assert.equal(r.stage,'awaiting-private-owner-confirmation');
  assert.equal(f.calls.length,4);
  assert.deepEqual(f.calls.map(c=>c.method),['GET','POST','GET','POST']);
  assert.deepEqual(Object.keys(f.calls[1].body).sort(),['email','password','redirect_to','type']);
  assert.equal(f.calls[1].body.type,'signup');assert.equal(f.calls[1].body.email,OWNER);
  assert.equal(f.calls[1].body.redirect_to,CALLBACK);
  assert.equal(f.calls[3].url,'https://api.resend.com/emails');
  assert.equal(f.calls[3].credential,resendKey);
  assert.deepEqual(f.calls[3].body.to,[OWNER]);
  assert.equal(f.calls[3].body.from,'BuyerMatch S2 <s2-verification@housebuyerinvestments.com>');
  assert.equal(f.calls[3].headers['Idempotency-Key'],`buyermatch-s2-owner-confirmation:${id}:v1`);
  assert.ok(!JSON.stringify(f.calls).includes('email_confirm":true'));
  const output=JSON.stringify(r);
  for(const secret of [password,resendKey,key,'DUMMY_PRIVATE_TOKEN','action_link'])assert.ok(!output.includes(secret));
});
for(const [label,change] of Object.entries({
  existingOwner:{users:[{id,email:OWNER}]},
  caseVariantExistingOwner:{users:[{id,email:OWNER.toUpperCase()}]},
  truncatedInventory:{users:Array(1000).fill({email:'dummy@example.invalid'})},
  missingPaginationEvidence:{total:null},
  inconsistentPagination:{total:4},
  productionKey:{key:`dummy.${Buffer.from(JSON.stringify({ref:'aigvnbxiydbzzqbetlhl',role:'service_role'})).toString('base64url')}.dummy`},
  anonKey:{key:`dummy.${Buffer.from(JSON.stringify({ref:REF,role:'anon'})).toString('base64url')}.dummy`},
  wrongIdentity:{generated:{email:'other@example.invalid'}},
  autoConfirmed:{generated:{email_confirmed_at:'2026-10-23'}},
  invalidId:{generated:{id:'not-an-id'}},
  magicLink:{generated:{verification_type:'magiclink'}},
  productionLink:{generated:{action_link:`https://aigvnbxiydbzzqbetlhl.supabase.co/auth/v1/verify?token=DUMMY_PRIVATE_TOKEN&type=signup&redirect_to=${encodeURIComponent(CALLBACK)}`}},
  incorrectCallback:{generated:{action_link:`https://${REF}.supabase.co/auth/v1/verify?token=DUMMY_PRIVATE_TOKEN&type=signup&redirect_to=https%3A%2F%2Fexample.invalid`}},
  duplicateToken:{generated:{action_link:`https://${REF}.supabase.co/auth/v1/verify?token=DUMMY_PRIVATE_TOKEN&token=other&type=signup&redirect_to=${encodeURIComponent(CALLBACK)}`}},
  alreadyConfirmedReadback:{user:{email_confirmed_at:'2026-10-23'}},
  anonymousReadback:{user:{is_anonymous:true}},
  bannedReadback:{user:{banned_until:'2099-01-01'}},
  mismatchedReadback:{user:{id:'wrong'}},
}))test(`${label} fails closed before any email`,async()=>{
  const f=fixture(change),r=await relayOwnerConfirmation(input(),f.io);
  assert.equal(r.ok,false);assert.equal(r.emailAccepted,false);
  assert.ok(!f.calls.some(c=>c.url.startsWith('https://api.resend.com')));
  assert.ok(!JSON.stringify(r).includes('DUMMY_PRIVATE'));
});
for(const [label,modify] of Object.entries({
  shortPassword:x=>{x.password=x.passwordConfirmation='short';},
  mismatch:x=>{x.passwordConfirmation='different';},
  unexpectedRecipient:x=>{x.to='other@example.invalid';},
  missingKey:x=>{delete x.resendKey;},
  malformedKey:x=>{x.resendKey='not-a-key';},
}))test(`${label} makes no provider request`,async()=>{
  const f=fixture(),x=input();modify(x);
  const r=await relayOwnerConfirmation(x,f.io);
  assert.equal(r.ok,false);assert.equal(r.accountMayExist,false);assert.equal(f.calls.length,0);
});
for(const fail of [1,2,3,4])test(`provider failure at stage ${fail} retains uncertainty without retry or leakage`,async()=>{
  const f=fixture({fail}),r=await relayOwnerConfirmation(input(),f.io);
  assert.equal(r.ok,false);assert.equal(r.retryAttempted,false);assert.equal(f.calls.length,fail);
  assert.equal(r.accountMayExist,fail>1);
  for(const secret of [password,resendKey,'DUMMY_PRIVATE_TOKEN'])assert.ok(!JSON.stringify(r).includes(secret));
});
test('mail acceptance is not delivery, confirmation or login',async()=>{
  const f=fixture({sent:{}}),r=await relayOwnerConfirmation(input(),f.io);
  assert.equal(r.ok,false);assert.equal(r.accountMayExist,true);assert.equal(r.emailAccepted,false);
});
test('actual child process invalid input exits sanitized before provider calls',()=>{
  const r=spawnSync(process.execPath,['scripts/testing/s2-owner-confirmation.mjs'],{input:JSON.stringify({password}),encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stderr,'');assert.ok(!r.stdout.includes(password));
  assert.equal(JSON.parse(r.stdout).accountMayExist,false);
});
test('real entry remains blocked even with valid synthetic private input',()=>{
  const r=spawnSync(process.execPath,['scripts/testing/s2-owner-confirmation.mjs'],{input:JSON.stringify(input()),encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stderr,'');
  const result=JSON.parse(r.stdout);
  assert.equal(result.stage,'provider-routing-unverified');assert.equal(result.accountMayExist,false);
  assert.ok(!r.stdout.includes(password));assert.ok(!r.stdout.includes(resendKey));
});
