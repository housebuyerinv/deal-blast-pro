/* global setTimeout */
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {sha} from './s2-canary-provider.mjs';
import {makeMvpProvider} from './s2-mvp-provider.mjs';
import {validateMvpPlan,requirePaused,requireFallback,requireCandidate,restoreMvpAlias,activateMvpAlias,validateAcceptance,closeMvpWindow,limited} from './s2-mvp-routing.mjs';
let p,dir,a,candidate,window,phase='verify-plan';
const save=(n,v)=>writeFileSync(resolve(dir,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const journal=(stage,data={})=>appendFileSync(resolve(dir,'routing-watchdog.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,stage,...data})+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 if(process.argv.length!==4)throw Error();const file=resolve(process.argv[2]),raw=readFileSync(file);dir=dirname(file);
 if(!/^[a-f0-9]{64}$/.test(process.argv[3])||sha(raw)!==process.argv[3])throw Error();p=validateMvpPlan(JSON.parse(raw));
 if(Date.now()<p.startedAt||Date.now()-p.startedAt>30000)throw Error();a=makeMvpProvider(p,dir);
 phase='launcher-independence';let exited=false;const parent=process.ppid;
 for(let i=0;i<50;i++){try{process.kill(parent,0);await sleep(100);}catch{exited=true;break;}}if(!exited)throw Error();journal('launcher-exit-verified');
 phase='authority-and-free-plan';await a.verifyScopeAuthority();await a.verifyRoutingAuthority();const budget=await a.readFreePlan();if(!budget.hobby)throw Error();
 requirePaused(await a.readSafetyState());requireFallback(await a.readDeployment(p.fallback),p);if((await a.readProjectDomains()).length)throw Error();
 const initial=await a.readAlias(p.alias);if(initial.projectId!==p.project||initial.deploymentId!==p.fallback)throw Error();
 phase='independent-same-state-alias-proof';await restoreMvpAlias(p,a,null,{proof:true});const safety=await closeMvpWindow(p,a,null);if(!safety.verified)throw Error();
 journal('same-state-fallback-restoration',{verified:true});save('routing-ready.json',{ready:true,pid:process.pid,launcherExited:true,rollbackAuthorityVerified:true,source:p.source,freePlanVerified:true,at:new Date().toISOString()});
 phase='discover-owned-candidate';
 while(Date.now()<p.discoveryDeadline&&!existsSync(resolve(dir,'close.request'))){
  const remaining=p.discoveryDeadline-Date.now();if(remaining<=0)break;
  const list=await limited(s=>a.readInventory(s),Math.min(25000,remaining)),matches=[];
  for(const item of list.filter(x=>!p.preexistingIds.includes(x.uid??x.id))){
   if(Date.now()>=p.discoveryDeadline)throw Error('Discovery deadline');
   const d=await limited(s=>a.readDeployment(item.uid??item.id,s),Math.min(25000,p.discoveryDeadline-Date.now()));
   if(d.meta?.s2RunId===p.runId)matches.push(requireCandidate(d,p,{ready:false}));
  }
  if(matches.length>1)throw Error();if(matches.length===1){candidate=matches[0];save('routing-receipt.json',candidate);journal('candidate-discovered',{deploymentId:candidate.id});break;}await sleep(1000);
 }
 if(!candidate)throw Error('No candidate');
 phase='await-controlled-activation';
 while(Date.now()<p.discoveryDeadline&&!existsSync(resolve(dir,'activate.request'))&&!existsSync(resolve(dir,'close.request')))await sleep(500);
 if(Date.now()>=p.discoveryDeadline||existsSync(resolve(dir,'close.request')))throw Error();
 const activation=JSON.parse(readFileSync(resolve(dir,'activate.request')));if(activation.runId!==p.runId||activation.source!==p.source||activation.deploymentId!==candidate.id)throw Error();
 phase='activate-owned-alias';window=await activateMvpAlias(p,a,candidate);save('routing-active.json',{...window,runId:p.runId,alias:p.alias,source:p.source});journal('alias-active',{deploymentId:candidate.id,deadline:window.deadline});
 phase='read-only-acceptance-window';
 while(Date.now()<window.deadline&&!existsSync(resolve(dir,'acceptance.complete.json'))&&!existsSync(resolve(dir,'close.request')))await sleep(500);
 if(Date.now()>=window.deadline||existsSync(resolve(dir,'close.request')))throw Error('Incomplete window');
 const acceptance=validateAcceptance(JSON.parse(readFileSync(resolve(dir,'acceptance.complete.json'))),p,candidate,window);
 await a.verifyRoutingAuthority();requirePaused(await a.readSafetyState());requireCandidate(await a.readDeployment(candidate.id),p,{assigned:true});
 const final=await a.readAlias(p.alias);if(final.projectId!==p.project||final.deploymentId!==candidate.id||Date.now()>=window.deadline||(await a.readMutationState()).uncertain!==false)throw Error();
 journal('acceptance-complete',{deploymentId:candidate.id});save('routing-result.json',{mode:'INDEPENDENT_CONTROLLER',verified:true,retained:true,source:p.source,candidateId:candidate.id,acceptance,window});
}catch{
 try{journal('FAILED_OR_INCOMPLETE',{phase});}catch{/* Never claim success without evidence. */}
 let rollback={verified:false,routingRestored:false,safeguardsVerified:false};
 if(a&&p)try{rollback=await closeMvpWindow(p,a,candidate);}catch{/* Keep UNKNOWN and require operator review. */}
 try{save('routing-result.json',{mode:'INDEPENDENT_CONTROLLER',verified:false,retained:false,phase,candidateId:candidate?.id??null,window:window??null,rollback,operatorRequired:!rollback.verified});}catch{/* Preserve prior/partial evidence; no overwrite. */}
 process.exitCode=2;
}
