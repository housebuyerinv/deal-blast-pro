import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { SCOPE, validateControllerPlan, scopedApiPath, ownedDeployment, launch, requireCanonicalDirectory } from '../../scripts/testing/s2-payment-free-controller.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(patch={}) {
  const coordinationRoot=await mkdtemp(path.join(tmpdir(),'bm-controller-synthetic-')), runId=randomUUID();
  const root=path.join(coordinationRoot,runId);await mkdir(root);
  await copyFile('scripts/testing/s2-canary-http-observer.mjs',path.join(root,'observer.mjs'));
  const exited=spawnSync(process.execPath,['-e',''],{stdio:'ignore'});
  const p={...SCOPE,mode:'LOCAL_SYNTHETIC',scope:'payment-free-preflight',approved:true,runId,startedAt:Date.now(),expiresAt:Date.now()+10000,root,coordinationRoot,launcherPid:exited.pid,preexistingIds:[SCOPE.fallback],controllerHash:sha(await readFile('scripts/testing/s2-payment-free-controller.mjs')),observerHash:sha(await readFile(path.join(root,'observer.mjs'))),...patch};
  return p;
}
test('scope, source, approval, stale deadline, TEST identity and plan mode are mandatory',async()=>{
  const p=await fixture();assert.equal(validateControllerPlan(p).source,SCOPE.source);
  for(const change of [{source:'1'.repeat(40)},{approved:false},{scope:'subscription-activation'},{account:'acct_other'},{mode:'OTHER'},{expiresAt:Date.now()-1}])assert.throws(()=>validateControllerPlan({...p,...change}));
});
test('API origin, explicit team and exact S2 inventory are restricted',async()=>{
  const p=await fixture();assert.equal(scopedApiPath('/v9/projects/'+p.project+'?teamId='+p.team,p),'/v9/projects/'+p.project);
  for(const u of ['https://evil.invalid/v9/projects/'+p.project+'?teamId='+p.team,'/v9/projects/'+p.project,'/v9/projects/other?teamId='+p.team,'/v6/deployments?teamId='+p.team+'&projectId=other&limit=100'])assert.throws(()=>scopedApiPath(u,p));
});
test('asynchronous canonical-path verification rejects packaged-app redirection without a sync fallback',async()=>{
  const p=await fixture();
  const info={isDirectory:()=>true,isSymbolicLink:()=>false};
  await assert.rejects(requireCanonicalDirectory(p.root,{lstat:async()=>info,realpath:async()=>path.join(p.root,'Packages','OpenAI.Codex','LocalCache')}));
  assert.equal(await requireCanonicalDirectory(p.root,{lstat:async()=>info,realpath:async()=>path.resolve(p.root)}),path.resolve(p.root));
});
test('deletion requires exact owned new source/run, unaliased Preview and excludes fallback',async()=>{
  const p=await fixture(),d={id:'dpl_NewSynthetic',projectId:p.project,ownerId:p.team,target:null,meta:{githubCommitSha:p.source,s2RunId:p.runId},alias:[]};
  assert.equal(ownedDeployment(d,p).id,d.id);
  for(const change of [{id:p.fallback},{projectId:'other'},{target:'production'},{alias:['alias.invalid']},{meta:{...d.meta,githubCommitSha:'0'.repeat(40)}},{meta:{...d.meta,s2RunId:randomUUID()}}])assert.throws(()=>ownedDeployment({...d,...change},p));
});
async function scenario(kind='pass') {
  const p=await fixture();let removed=false,updates=0,pauses=0;const operations=[];
  if(kind==='conflicting-lease')await writeFile(path.join(p.coordinationRoot,'dbp-s2-billing.lock.json'),JSON.stringify({nonce:'EXISTING_SYNTHETIC_LEASE'}),{flag:'wx'});
  const d={id:'dpl_NewSynthetic',projectId:p.project,ownerId:p.team,target:null,meta:{githubCommitSha:p.source,s2RunId:p.runId},alias:[],url:'synthetic.invalid'};
  const result=(body,extra={})=>({code:0,timedOut:false,output:JSON.stringify(body),statuses:[],...extra});
  const ports={receiver:async()=>true,runNative:async(name,args)=>{
    operations.push([name,args]);
    if(name==='stripe'){
      if(args[0]==='whoami')return result({authorized_accounts:[{id:p.account,modes:['test']}]});
      if(args[1]==='update'&&++updates===2&&kind==='cleanup-stripe-failure')return result({}, {code:1});
      return result({id:p.endpoint,livemode:false,status:'disabled',url:`https://${p.database}.supabase.co/functions/v1/stripe-webhook`});
    }
    if(name==='supabase'){pauses++;return result({});}
    if(args[0]==='remove'){removed=true;return result({});}
    const u=new URL(args[1],'https://api.vercel.com');let body,status=200;
    if(u.pathname.startsWith('/v9/projects/'))body={id:p.project,accountId:p.team,ssoProtection:{deploymentType:kind==='authority-failure'?'none':'all'},autoAssignCustomDomains:false,gitProviderOptions:{createDeployments:'disabled'}};
    else if(u.pathname.startsWith('/v2/teams/'))body={id:p.team,membership:{role:'OWNER'},billing:{plan:'hobby',status:'active'}};
    else if(u.pathname.startsWith('/v4/aliases/'))body={projectId:p.project,deploymentId:p.fallback};
    else if(u.pathname==='/v6/deployments'){
      body={deployments:[{uid:p.fallback},...(!removed?[{uid:d.id}]:[])],pagination:{next:null}};
      try{await writeFile(path.join(p.root,'close.request'),JSON.stringify({runId:p.runId,source:p.source}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
    }else if(u.pathname.endsWith('/'+p.fallback))body={id:p.fallback,projectId:p.project,ownerId:p.team,readyState:'READY'};
    else if(removed){status=404;body={};}
    else body=kind==='foreign-preview'?{...d,meta:{...d.meta,githubCommitSha:'0'.repeat(40)}}:d;
    return result(body,{code:status===404?1:0,statuses:[{type:'scoped-http-status',method:'GET',path:u.pathname,status}]});
  }};
  const raw=JSON.stringify(p),file=path.join(p.root,'plan.json');await writeFile(file,raw,{flag:'wx'});
  const old=process.exitCode;try{await launch(file,sha(raw),ports);}finally{process.exitCode=old;}
  return {r:JSON.parse(await readFile(path.join(p.root,'controller-result.json'))),operations,removed,pauses,coordinationRoot:p.coordinationRoot};
}
test('actual exited launcher and durable controller orchestration with synthetic providers',async()=>{
  const {r,removed}=await scenario();assert.equal(r.mode,'LOCAL_SYNTHETIC');assert.equal(r.independent,true);assert.equal(r.verified,true);assert.equal(removed,true);assert.ok(Object.values(r.cleanup).every(Boolean));
});
test('failed initial authority makes no provider mutation or deletion',async()=>{
  const {r,removed,pauses,operations}=await scenario('authority-failure');assert.equal(r.ready,false);assert.equal(r.verified,false);assert.equal(removed,false);assert.equal(pauses,0);assert.equal(operations.some(([n,a])=>n==='stripe'&&a[1]==='update'),false);
});
test('a different run cannot bypass the shared lease or delete prior ownership evidence',async()=>{
  const {r,operations,coordinationRoot}=await scenario('conflicting-lease');assert.equal(r.ready,false);assert.equal(r.verified,false);assert.equal(operations.length,0);
  assert.deepEqual(JSON.parse(await readFile(path.join(coordinationRoot,'dbp-s2-billing.lock.json'))),{nonce:'EXISTING_SYNTHETIC_LEASE'});
});
test('Stripe cleanup failure does not suppress receiver pause or independently owned deletion',async()=>{
  const {r,removed,pauses}=await scenario('cleanup-stripe-failure');assert.equal(r.verified,false);assert.equal(r.cleanup.stripe,false);assert.equal(r.cleanup.receiver,true);assert.equal(removed,true);assert.equal(pauses,2);
});
test('foreign candidate is preserved, never relabeled as successful cleanup',async()=>{
  const {r,removed}=await scenario('foreign-preview');assert.equal(r.verified,false);assert.equal(r.cleanup.deployment,false);assert.equal(removed,false);
});
