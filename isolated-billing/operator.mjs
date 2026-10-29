// @ts-check
import process from 'node:process';
import path from 'node:path';
import { readFile,open,lstat,realpath,rename } from 'node:fs/promises';
import { setTimeout,setInterval,clearInterval } from 'node:timers';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { fileURLToPath,URL } from 'node:url';
import { binding } from 'isolated:binding';
import { validateProfile,digest,demand } from './profile.mjs';
import { nativePorts } from './native.mjs';
import { billingEvidenceStore } from '../scripts/testing/s2-billing-journal.mjs';
import { closeCampaignSubscription } from '../scripts/testing/s2-billing-subscription-cleanup.mjs';
import { verifyNativeCustody } from '../scripts/testing/s2-stripe-native-watchdog.mjs';
const {AbortSignal,Response}=globalThis;
export { billingEvidenceStore,closeCampaignSubscription };
export function cancellationPlan(p) {
  p=validateProfile(p);return {source:p.source,runId:p.runId,mode:p.mode,profile:'activation',
    project:p.project,team:p.team,database:p.database,account:p.account,endpoint:p.endpoint,owner:p.owner,
    startedAt:p.startedAt,expiresAt:p.expiresAt};
}
async function safeRead(file,p) {
  const s=await lstat(file);demand(s.isFile()&&!s.isSymbolicLink()&&s.size<262144,'PRIVATE_FILE');
  demand((await realpath(file)).toLowerCase()===path.resolve(file).toLowerCase(),'PRIVATE_FILE_REDIRECT');
  if(p.mode==='HOSTED')await verifyNativeCustody([file,path.dirname(file)],AbortSignal.timeout(10000));
  return JSON.parse(await readFile(file,'utf8'));
}
export async function writeOnce(directory,name,value) {
  demand(/^[a-zA-Z0-9.-]+$/.test(name),'EVIDENCE_NAME');
  const s=await lstat(directory);demand(s.isDirectory()&&!s.isSymbolicLink(),'EVIDENCE_DIRECTORY');
  const h=await open(path.join(directory,name),'wx',0o600);
  try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}
}
export async function executeCleanup(p,ports,store,approval,baseline) {
  p=validateProfile(p);const plan=cancellationPlan(p);
  demand(approval.approved===true && approval.source===p.source && approval.profileDigest===digest(p) &&
    approval.account===p.account && approval.runId===p.runId && approval.cancelCampaignCreatedTestSubscription===true,'EXACT_APPROVAL');
  await ports.pause();const reconciled=await ports.expireOwned();
  const receipt={source:p.source,runId:p.runId,checkouts:reconciled.checkouts};
  const result=await closeCampaignSubscription(plan,receipt,{
    readApproval:async()=>({approved:true,planDigest:digest(plan),mode:p.mode,scope:'subscription-activation',
      cleanupOperatorSource:p.source,cancelCampaignCreatedTestSubscription:true}),
    readAuthority:ports.authority,
    readCheckoutPolicy:async()=>{const current=await ports.checkout();return {source:p.source,runId:p.runId,
      issuanceJournalComplete:true,inflightReconciled:true,sessionIds:current?[current.session.id]:[]};},
    readSubscriptionEvidence:store.readSubscriptionEvidence,recordSubscriptionCreation:store.recordSubscriptionCreation,
    claimSubscriptionCancellation:store.claimSubscriptionCancellation,
    stripeRequest:async r=>{
      demand(r.account===p.account && r.mode==='test' && r.retries===0,'CANCELLATION_TRANSPORT');
      if(r.method==='DELETE') {
        const e=await store.readSubscriptionEvidence(plan);
        demand(e.creation && r.path==='/v1/subscriptions/'+e.creation.subscription,'CANCELLATION_CAPABILITY');
      }else demand(r.method==='GET','STRIPE_METHOD');
      return ports.stripe(r.method,r.path,r.body);
    },
  },p.source,AbortSignal.timeout(45000));
  demand(result.verified===true,'CANCELLATION_READBACK');
  await ports.removeOwnedHosting();const after=await ports.authority();
  demand(after.snapshot.crmDigest===baseline.crmDigest && after.snapshot.buyers===0 && after.snapshot.provenance===0,'PRESERVATION');
  await store.journal({source:p.source,runId:p.runId,mode:p.mode,stage:'closure',status:'VERIFIED'});
  return {verified:true,profileDigest:digest(p),hostedCancellationVerified:p.mode==='HOSTED'};
}
/** @param {any} p @param {string} directory @param {{credentialFile?:string,approvalFile?:string,fetch?:typeof globalThis.fetch}} [options] */
export async function makeExecution(p,directory,{credentialFile,approvalFile,fetch:injected}={}) {
  p=validateProfile(p);demand(path.isAbsolute(directory) && !directory.toLowerCase().includes('dbpbuyermatchs2'),'NEW_EVIDENCE_DIRECTORY');
  demand([credentialFile,approvalFile].every(f=>typeof f==='string' && path.dirname(path.resolve(f))===path.resolve(directory)),'NEW_PRIVATE_CUSTODY');
  if(p.mode==='HOSTED')await verifyNativeCustody([directory,credentialFile,approvalFile],AbortSignal.timeout(10000));
  const approval=await safeRead(approvalFile,p);
  demand(approval.approved===true && approval.source===p.source && approval.profileDigest===digest(p) &&
    approval.account===p.account && approval.runId===p.runId && approval.cancelCampaignCreatedTestSubscription===true,'EXACT_APPROVAL');
  const checkApproval=async()=>{
    const a=await safeRead(approvalFile,p);
    demand(a.approved===true && a.source===p.source && a.profileDigest===digest(p) && a.runId===p.runId &&
      a.account===p.account && a.cancelCampaignCreatedTestSubscription===true,'CURRENT_APPROVAL');return a;
  };
  const store=await billingEvidenceStore(directory,cancellationPlan(p));
  const ports=nativePorts(p,()=>safeRead(credentialFile,p),{fetch:injected,authorizeMutation:async request=>{
    const a=await checkApproval();
    demand(Date.now()<p.expiresAt,'MUTATION_WINDOW_EXPIRED');
    if(request.provider==='stripe' && request.method==='DELETE'){
      const e=await store.readSubscriptionEvidence(cancellationPlan(p));
      const claim=await safeRead(path.join(directory,p.runId+'.subscription-cancellation-intent.json'),p);
      demand(e.creation && request.path==='/v1/subscriptions/'+e.creation.subscription &&
        claim.subscription===e.creation.subscription && claim.creationSha256===e.creationSha256,'DURABLE_CANCELLATION_CLAIM');
    }
    if(request.path==='bm_isolated_arm' || request.body?.disabled===false)demand(a.activateCampaign===true,'ISSUANCE_APPROVAL');
    return true;
  }});
  return {ports,store,approval,
    async prepare(){const baseline=await ports.preflight();
      await ports.protectedRead('/api/isolated-attestation');
      demand(Date.now()<=p.startedAt,'BASELINE_MUST_PRECEDE_CAMPAIGN');
      await store.claimRun();await store.recordSubscriptionBaseline({observedAt:Date.now(),subscriptionIds:[]});
      await writeOnce(directory,'baseline.json',{profileDigest:digest(p),...baseline});return baseline;},
    async cleanup(){const baseline=await safeRead(path.join(directory,'baseline.json'),p);
      demand(baseline.profileDigest===digest(p),'BASELINE_DIGEST');return executeCleanup(p,ports,store,await checkApproval(),baseline);},
    async arm(){await checkApproval();const ready=await safeRead(path.join(directory,'watchdog-ready.json'),p);
      const health=await safeRead(path.join(directory,'watchdog-health.json'),p);
      demand(ready.profileDigest===digest(p) && ready.source===p.source && health.pid===ready.pid &&
        health.profileDigest===digest(p) && Date.now()-health.at<3000 && health.at<=Date.now(),'WATCHDOG_NOT_READY');
      process.kill(ready.pid,0);
      await writeOnce(directory,'arm-intent.json',{source:p.source,profileDigest:digest(p)});
      await ports.arm();},
  };
}
export async function pulse(p,directory,parentPid=process.pid) {
  const name=`heartbeat-${process.pid}-${Date.now()}.json`;
  await writeOnce(directory,name,{profileDigest:digest(p),runId:p.runId,parentPid,at:Date.now()});
  await rename(path.join(directory,name),path.join(directory,'heartbeat.json'));
}
export async function startWatchdog(profileFile,directory,credentialFile,approvalFile,parentPid=process.pid,fixtureProxy) {
  const p=validateProfile(JSON.parse(await readFile(profileFile,'utf8')));
  demand(p.source===binding.source && digest(p)===digest(binding),'COMPILED_BINDING');
  demand(!fixtureProxy || (p.mode==='LOCAL_SYNTHETIC' && new URL(fixtureProxy).hostname==='127.0.0.1'),'FIXTURE_TRANSPORT');
  await pulse(p,directory,parentPid);
  const timer=setInterval(()=>pulse(p,directory,parentPid).catch(()=>clearInterval(timer)),1000);timer.unref();
  // Start a truly separate process; it reopens approval, credentials and durable evidence itself.
  const diagnostic=p.mode==='LOCAL_SYNTHETIC'?await open(path.join(directory,'fixture-worker.txt'),'wx',0o600):null;
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'watch',profileFile,directory,credentialFile,approvalFile,String(parentPid),...(fixtureProxy?[fixtureProxy]:[])],
    {detached:true,windowsHide:true,stdio:diagnostic?['ignore',diagnostic.fd,diagnostic.fd]:'ignore',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,
      USERPROFILE:process.env.USERPROFILE,TEMP:process.env.TEMP,APPDATA:process.env.APPDATA}});
  child.once('error',()=>{clearInterval(timer);writeOnce(directory,'watchdog-spawn-error.json',{code:'SPAWN_FAILED'}).catch(()=>{});});
  if(diagnostic)await diagnostic.close();
  child.unref();return {pid:child.pid,ready:false,stopHeartbeat:()=>clearInterval(timer)};
}
export async function watch(p,directory,execution,parentPid,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}) {
  const baseline=await execution.prepare();
  try{
  await writeOnce(directory,'watchdog-ready.json',{pid:process.pid,source:p.source,runId:p.runId,
    profileDigest:digest(p),readyAt:now(),crmDigest:baseline.crmDigest});
  while(now()<p.expiresAt-60000){
    const health=`health-${process.pid}-${now()}.json`;
    await writeOnce(directory,health,{pid:process.pid,profileDigest:digest(p),at:now()});
    await rename(path.join(directory,health),path.join(directory,'watchdog-health.json'));
    let alive=true;try{process.kill(parentPid,0);}catch{alive=false;}
    let heartbeat;try{heartbeat=await safeRead(path.join(directory,'heartbeat.json'),p);}catch{alive=false;}
    if(!alive || heartbeat?.parentPid!==parentPid || heartbeat?.runId!==p.runId ||
      heartbeat?.profileDigest!==digest(p) || now()-heartbeat?.at>15000 || now()<heartbeat?.at)break;
    await sleep(1000);
  }
  }finally{
    // Once a baseline exists, evidence/heartbeat failures must also attempt independent containment.
    const result=await execution.cleanup();await writeOnce(directory,'cleanup-result.json',result);
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,profileFile,directory,credentialFile,approvalFile,parent,proxy]=process.argv.slice(2);
  if(command==='watch'){
    try{const p=validateProfile(JSON.parse(await readFile(profileFile,'utf8')));
      demand(digest(p)===digest(binding),'COMPILED_BINDING');
      let fixtureFetch;
      if(proxy){const u=new URL(proxy);demand(p.mode==='LOCAL_SYNTHETIC' && u.protocol==='http:' &&
        u.hostname==='127.0.0.1' && u.pathname==='/' && !u.username && !u.password,'LOCAL_PROXY');
        fixtureFetch=async(url,init={})=>{
          const r=await globalThis.fetch(proxy,{method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({url,method:init.method||'GET',body:init.body?String(init.body):null})});
          const result=await r.json();return new Response(JSON.stringify(result.body),{status:result.status});
        };}
      const execution=await makeExecution(p,directory,{credentialFile,approvalFile,fetch:fixtureFetch});
      await watch(p,directory,execution,Number(parent));
    }catch(error){
      // Persist only an allowlisted diagnostic code; never serialize provider responses or credentials.
      const code=String(error?.message||'').match(/^(?:ISOLATED_BILLING_STOP:)?([A-Z_]+)$/)?.[1]||'WATCHDOG_START_OR_CLEANUP_FAILED';
      try{await writeOnce(directory,'watchdog-error.json',{code});}catch{/* evidence may be unavailable */}
      process.exitCode=1;
    }
  }else{console.error('Isolated operator requires explicit watch arguments; no operation performed');process.exitCode=1;}
}
