import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {makeProvider,sha,validateCanaryPlan,CANARY_SOURCE,assertRemoval} from './s2-canary-provider.mjs';
import {closeS2Run} from '../buyermatch-s2-cleanup.mjs';
import {S2_RELEASE as S2} from '../buyermatch-s2-release.mjs';
let dir,plan,adapter,receipt;
let phase='plan-verification';
const write=(name,value)=>writeFileSync(resolve(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const journal=x=>appendFileSync(resolve(dir,'watchdog.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,...x})+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 if(process.argv.length!==4)throw Error();
 const path=resolve(process.argv[2]),raw=readFileSync(path);dir=dirname(path);
 if(!/^[a-f0-9]{64}$/.test(process.argv[3])||sha(raw)!==process.argv[3])throw Error();
 plan=validateCanaryPlan(JSON.parse(raw));
 if(Date.now()-plan.startedAt>30000||plan.startedAt>Date.now())throw Error();
 adapter=makeProvider(plan,dir);
 phase='launcher-independence';
 const launcher=process.ppid;let parentAlive=true;
 for(let i=0;i<50;i++){try{process.kill(launcher,0);await sleep(100);}catch{parentAlive=false;break;}}
 if(parentAlive)throw Error();
 journal({stage:'launcher-exit-verified'});
 phase='independent-provider-authority';
 await adapter.verifyAuthority();const safety=await adapter.readSafetyState();
 if(Object.entries(safety).some(([,v])=>v!==true))throw Error();
 const alias=await adapter.readAlias(plan.alias);if(alias.projectId!==plan.project||alias.deploymentId!==plan.fallback)throw Error();
 write('watchdog-ready.json',{ready:true,pid:process.pid,launcherExited:true,source:CANARY_SOURCE,safety,at:new Date().toISOString()});
 phase='discover-exact-run';
 const deadline=plan.startedAt+900000;
 while(Date.now()<deadline){
  const listing=await adapter.api('/v6/deployments?projectId='+S2.project+'&limit=100');
  if(listing.code!==200||!Array.isArray(listing.body?.deployments)||listing.body.pagination?.next)throw Error();
  const discovered=[];
  for(const item of listing.body.deployments.filter(x=>!plan.preexistingIds.includes(x.uid??x.id))){
   const d=await adapter.readDeployment(item.uid??item.id);
   if(d.kind==='found'&&d.meta?.s2RunId===plan.runId){assertRemoval(d,plan);discovered.push(d);}
  }
  if(discovered.length>1)throw Error();
  if(discovered.length===1){
   const d=discovered[0];
   receipt={runId:plan.runId,deploymentId:d.id,source:CANARY_SOURCE,project:S2.project,team:S2.team,preexistingDeploymentIds:plan.preexistingIds,fallbackId:plan.fallback,alias:plan.alias};
   write('watchdog-receipt.json',receipt);journal({stage:'exact-run-discovered',deploymentId:d.id});break;
  }
  await sleep(5000);
 }
 if(!receipt)throw Error();
 phase='await-explicit-close-or-deadline';
 while(Date.now()<deadline&&!existsSync(resolve(dir,'close.request')))await sleep(500);
 phase='automatic-closure';
 const result=await closeS2Run(receipt,adapter,{approvedSource:CANARY_SOURCE,timeoutMs:30000,journal:async x=>journal(x)});
 write('watchdog-result.json',{mode:'INDEPENDENT_AUTOMATIC',pid:process.pid,launcherExited:true,receipt,result});
 if(!result.verified)process.exitCode=2;
}catch{
 try{journal({stage:phase,status:'FAILED_OR_UNKNOWN'});}catch{/* No success without a journal. */}
 if(adapter&&plan)await Promise.allSettled([adapter.disableEndpoint(S2.endpoint),adapter.pauseReceiver(S2.staging)]);
 try{write('watchdog-result.json',{mode:'INDEPENDENT_AUTOMATIC',phase,verified:false,requiresOperator:true,receiptPresent:!!receipt});}catch{/* Preserve prior evidence; never overwrite. */}
 process.exitCode=2;
}
