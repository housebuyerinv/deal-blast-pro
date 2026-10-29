/* global AbortController, setTimeout, clearTimeout */
import {S2_RELEASE as S2} from '../buyermatch-s2-release.mjs';
import {URL} from 'node:url';
export const MVP_SOURCE='b99830596080eef2b24472e71bdcb061c855bf57';
export const MVP_ALIAS=new URL(S2.origin).hostname;
export const WINDOW_MS=1800000;
export const ACCEPTANCE_KEYS=Object.freeze(['ownerAttestation17','agreementDiscovery','ownerBuyerMatchReadOnly','buyerIntakeReadOnly','ownerNetworkReviewReadOnly','keyboardAndNarrowLayout','unauthenticatedDenied','safeguardsUnchanged']);
const id=x=>/^dpl_[A-Za-z0-9]+$/.test(x??'');
export function validateMvpPlan(p){
 if(p?.schema!==1||p.source!==MVP_SOURCE||p.project!==S2.project||p.team!==S2.team||p.alias!==MVP_ALIAS||p.fallback!==S2.fallback||p.windowMs!==WINDOW_MS||!Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.discoveryDeadline)||p.discoveryDeadline<=p.startedAt||p.discoveryDeadline-p.startedAt>600000||!Array.isArray(p.preexistingIds)||!p.preexistingIds.includes(S2.fallback)||!p.preexistingIds.every(id)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.runId??'')||!p.operatorPins||Object.keys(p.operatorPins).length<8||!Object.values(p.operatorPins).every(x=>/^[a-f0-9]{64}$/.test(x)))throw Error('MVP plan rejected');
 return p;
}
export function requirePaused(s){
 for(const key of ['registrationPaused','checkoutPaused','liveBillingPaused','deliveryDisabled','stagingOnly','endpointDisabled','receiverPaused','protectionEnabled'])if(s?.[key]!==true)throw Error('Paused state unavailable');
 return s;
}
export function requireFallback(d,p){
 if(d?.kind!=='found'||d.id!==p.fallback||d.projectId!==p.project||d.ownerId!==p.team||d.target!==null||d.readyState!=='READY')throw Error('Fallback identity unavailable');
 return d;
}
export function requireCandidate(d,p,{ready=true,assigned=false}={}){
 validateMvpPlan(p);
 if(d?.kind!=='found'||!id(d.id)||p.preexistingIds.includes(d.id)||d.projectId!==p.project||d.ownerId!==p.team||d.target!==null||d.meta?.githubCommitSha!==MVP_SOURCE||d.meta?.s2RunId!==p.runId||(ready&&d.readyState!=='READY')||!Array.isArray(d.alias)||d.alias.some(x=>!assigned||x!==p.alias)||!/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(d.url??''))throw Error('Candidate identity unavailable');
 return d;
}
export async function limited(fn,ms=25000){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Operation deadline'));},ms);})]);}finally{clearTimeout(timer);}
}
export async function restoreMvpAlias(p,a,candidate,{proof=false,timeoutMs=25000}={}){
 validateMvpPlan(p);await limited(s=>a.verifyRoutingAuthority(s),timeoutMs);
 requireFallback(await limited(s=>a.readDeployment(p.fallback,s),timeoutMs),p);
 const before=await limited(s=>a.readAlias(p.alias,s),timeoutMs);if(before?.projectId!==p.project)throw Error('Alias project unavailable');
 if(before.deploymentId===p.fallback){if(proof)await limited(s=>a.assignFallback(p.fallback,null,s),timeoutMs);}
 else{
  if(!candidate||before.deploymentId!==candidate.id)throw Error('Unexpected alias target; no overwrite');
  requireCandidate(await limited(s=>a.readDeployment(candidate.id,s),timeoutMs),p,{assigned:true});
  await limited(s=>a.assignFallback(candidate.id,candidate,s),timeoutMs);
 }
 const after=await limited(s=>a.readAlias(p.alias,s),timeoutMs);if(after?.projectId!==p.project||after.deploymentId!==p.fallback)throw Error('Rollback readback unavailable');
 return {verified:true,alreadyFallback:before.deploymentId===p.fallback,proof};
}
export async function activateMvpAlias(p,a,candidate,{timeoutMs=25000,now=Date.now}={}){
 validateMvpPlan(p);await limited(s=>a.verifyRoutingAuthority(s),timeoutMs);
 requirePaused(await limited(s=>a.readSafetyState(s),timeoutMs));
 requireFallback(await limited(s=>a.readDeployment(p.fallback,s),timeoutMs),p);
 const target=requireCandidate(await limited(s=>a.readDeployment(candidate.id,s),timeoutMs),p);
 const before=await limited(s=>a.readAlias(p.alias,s),timeoutMs);
 if(before?.projectId!==p.project||before.deploymentId!==p.fallback)throw Error('Forward route drift; no overwrite');
 const startedAt=now();await limited(s=>a.assignCandidate(target,s),timeoutMs);
 const after=await limited(s=>a.readAlias(p.alias,s),timeoutMs);if(after?.projectId!==p.project||after.deploymentId!==target.id)throw Error('Forward readback unavailable');
 return {startedAt,deadline:startedAt+WINDOW_MS,deploymentId:target.id};
}
export function validateAcceptance(v,p,candidate,window,now=Date.now()){
 if(!v||v.runId!==p.runId||v.source!==MVP_SOURCE||v.deploymentId!==candidate.id||!Number.isSafeInteger(v.observedAt)||v.observedAt<window.startedAt||v.observedAt>now||now>=window.deadline||!/^[a-f0-9]{64}$/.test(v.buildChecksum??'')||ACCEPTANCE_KEYS.some(k=>v.checks?.[k]!==true))throw Error('Acceptance incomplete or expired');
 return v;
}
export async function closeMvpWindow(p,a,candidate,{timeoutMs=25000}={}){
 validateMvpPlan(p);
 // Provider failures cannot suppress the independent routing restoration attempt.
 const operations=await Promise.allSettled([
  limited(s=>a.disableEndpoint(S2.endpoint,s),timeoutMs),
  limited(s=>a.pauseReceiver(S2.staging,s),timeoutMs),
  restoreMvpAlias(p,a,candidate,{timeoutMs}),
 ]);
 let routing=false,safe=false,mutationCertain=false;
 try{const r=await limited(s=>a.readAlias(p.alias,s),timeoutMs);routing=r?.projectId===p.project&&r.deploymentId===p.fallback;}catch{/* UNKNOWN is not success. */}
 try{requirePaused(await limited(s=>a.readSafetyState(s),timeoutMs));safe=true;}catch{/* UNKNOWN is not success. */}
 try{mutationCertain=(await limited(()=>a.readMutationState(),timeoutMs))?.uncertain===false;}catch{/* Missing mutation evidence is UNKNOWN. */}
 return {verified:operations.every(x=>x.status==='fulfilled')&&routing&&safe&&mutationCertain,routingRestored:routing,safeguardsVerified:safe,mutationCertain,operationResults:operations.map(x=>x.status)};
}
