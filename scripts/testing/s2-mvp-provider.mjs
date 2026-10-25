/* global setTimeout, clearTimeout */
import {spawn} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeProvider,CANARY_SOURCE,sha,checkedStatus} from './s2-canary-provider.mjs';
import {S2_RELEASE as S2} from '../buyermatch-s2-release.mjs';
import {validateMvpPlan,requireCandidate,requireFallback,requirePaused} from './s2-mvp-routing.mjs';
const node='C:/Program Files/nodejs/node.exe',cli='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const nodeHash='b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3',cliHash='33542f1ec34ec6b9953ee7486c7ae5f9cc2a2b0225671ece4ed22fe8625bab86';
export function makeMvpProvider(plan,dir){
 validateMvpPlan(plan);
 // Reuse only reviewed scoped reads/pausing. The old deletion/alias API is NOT exposed.
 const base=makeProvider({...plan,source:CANARY_SOURCE},dir);
 let uncertainMutation=false;
 function pins(){
  if(sha(readFileSync(node))!==nodeHash||sha(readFileSync(cli))!==cliHash)throw Error('Pinned CLI changed');
  for(const[f,h]of Object.entries(plan.operatorPins))if(sha(readFileSync(f))!==h)throw Error('Operator changed');
  if(['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','VERCEL_TOKEN','STRIPE_API_KEY','STRIPE_ACCOUNT','STRIPE_CONTEXT'].some(k=>process.env[k])||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Ambient override denied');
 }
 async function run(args,signal,{observe=false,cwd}={}){
  pins();if(signal?.aborted)throw Error('Aborted');
  return new Promise((resolve,reject)=>{
   let stdout='',stderr='',bytes=0,timedOut=false;const statuses=[];
   const child=spawn(node,[...(observe?['--import',new URL('./s2-canary-http-observer.mjs',import.meta.url).href]:[]),cli,...args],{cwd,shell:false,windowsHide:true,stdio:observe?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
   const abort=()=>{timedOut=true;child.kill();};const timer=setTimeout(abort,20000);signal?.addEventListener('abort',abort,{once:true});
   const collect=(out,b)=>{bytes+=b.length;if(bytes>4194304){abort();return;}if(out)stdout+=b;else stderr+=b;};
   child.stdout.on('data',b=>collect(true,b));child.stderr.on('data',b=>collect(false,b));
   child.on('message',m=>{if(m?.type==='scoped-http-status'&&Object.keys(m).sort().join(',')==='method,path,status,type')statuses.push(m);});
   child.once('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('Private command unavailable'));});
   child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({code,timedOut,statuses,stdout,stderr});});
  });
 }
 const requiredRead=async(path,signal)=>{const r=await run(['api',path,'--scope',S2.scope,'--raw'],signal,{observe:true});if(checkedStatus(r,path)!==200)throw Error('Required read unavailable');return JSON.parse(r.stdout);};
 const verifyRoutingAuthority=async signal=>{
  const[p,t]=await Promise.all([base.api('/v9/projects/'+plan.project,signal),base.api('/v2/teams/'+plan.team,signal)]);
  if(p.body?.id!==plan.project||p.body.accountId!==plan.team||t.body?.id!==plan.team||t.body.membership?.role!=='OWNER')throw Error('Routing authority unavailable');
  return {project:plan.project,team:plan.team};
 };
 async function setRoute(target,expected,candidate,signal){
  await verifyRoutingAuthority(signal);
  requireFallback(await base.readDeployment(plan.fallback,signal),plan);
  if(target===plan.fallback){
   if(expected!==plan.fallback){if(!candidate||candidate.id!==expected)throw Error('Rollback receipt missing');requireCandidate(await base.readDeployment(expected,signal),plan,{assigned:true});}
  }else{
   if(expected!==plan.fallback||!candidate||target!==candidate.id)throw Error('Forward target denied');
   requirePaused(await base.readSafetyState(signal));requireCandidate(await base.readDeployment(target,signal),plan);
  }
  const before=await base.readAlias(plan.alias,signal);if(before.projectId!==plan.project||before.deploymentId!==expected)throw Error('Concurrent alias drift; no overwrite');
  try{
   const r=await run(['alias','set',target,plan.alias,'--scope',S2.scope,'--non-interactive'],signal);
   if(r.code!==0||r.timedOut)throw Error('Alias operation failed or unknown');
   const after=await base.readAlias(plan.alias,signal);if(after.projectId!==plan.project||after.deploymentId!==target)throw Error('Alias readback unavailable');
  }catch{uncertainMutation=true;try{appendFileSync(resolve(dir,'uncertain-alias-mutations.jsonl'),JSON.stringify({at:new Date().toISOString(),target,expected,status:'UNKNOWN'})+'\n');}catch{/* Uncertainty remains in memory and cannot become PASS. */}throw Error('Alias operation uncertain; review required');}
  return {verified:true,previous:expected,deploymentId:target};
 }
 return {
  readDeployment:base.readDeployment,readAlias:base.readAlias,readSafetyState:base.readSafetyState,
  disableEndpoint:base.disableEndpoint,pauseReceiver:base.pauseReceiver,
  verifyScopeAuthority:base.verifyAuthority,verifyRoutingAuthority,
  async readMutationState(){return {uncertain:uncertainMutation};},
  async readInventory(signal){const r=await base.api('/v6/deployments?projectId='+plan.project+'&limit=100',signal);if(r.code!==200||!Array.isArray(r.body?.deployments)||r.body.pagination?.next)throw Error('Incomplete inventory');return r.body.deployments;},
  async readProjectDomains(signal){const r=await requiredRead('/v9/projects/'+plan.project+'/domains?teamId='+plan.team+'&limit=100',signal);if(!Array.isArray(r.domains)||r.pagination?.next)throw Error('Domain read unavailable');return r.domains;},
  async readFreePlan(signal){const r=(await base.api('/v2/teams/'+plan.team,signal)).body;return {hobby:r?.billing?.plan==='hobby',planKnown:typeof r?.billing?.plan==='string'};},
  async assignCandidate(candidate,signal){return setRoute(candidate.id,plan.fallback,candidate,signal);},
  async assignFallback(expected,candidate,signal){return setRoute(plan.fallback,expected,candidate,signal);},
 };
}
