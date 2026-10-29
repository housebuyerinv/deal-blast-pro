// Narrow operational controller: public plan only, native provider authentication,
// fixed S2 identifiers, no credential reads, activation, aliases or arbitrary CLI.
import { spawn } from 'node:child_process';
import { readFile, open, lstat, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
export const SCOPE = Object.freeze({ source:'c4f19fea2060355565e7c0dad4141456b66d3817', project:'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl', team:'team_2ejXKYjjGXIFsIQTUMEqZ8Cf', database:'qxhhlprentrufobpcgna', account:'acct_1UTRcRL6efr9LhPI', endpoint:'we_1UTTc1L6efr9LhPICbZjgCHA', fallback:'dpl_nr5RVunmUGdryPUtWkRkVdsA96pT', alias:'dbp-registration-s2-preview-housebuyerinv.vercel.app' });
const node='C:/Program Files/nodejs/node.exe', npm='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/';
const tools={vercel:npm+'vercel/dist/vc.js',supabase:npm+'supabase/dist/supabase.js',stripe:'C:/Users/CTL Katastrophic/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe'};
const pins={node:'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3',vercel:'33542f1ec34ec6b9953ee7486c7ae5f9cc2a2b0225671ece4ed22fe8625bab86',supabase:'253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240',stripe:'88162aeacb9875bdb48b654a81f00ad45b9155a28545770144e7997f90efd486'};
const digest=b=>createHash('sha256').update(b).digest('hex');
const deny=()=>{throw Error('S2_CONTROLLER_UNVERIFIED');};
export function validateControllerPlan(p, now=Date.now()) {
  if(!p || Object.entries(SCOPE).some(([k,v])=>p[k]!==v) || p.scope!=='payment-free-preflight' || p.approved!==true ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.runId||'') ||
    !Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.expiresAt)||p.startedAt>now||p.expiresAt<=now||p.expiresAt-p.startedAt>1800000||
    !Array.isArray(p.preexistingIds)||!p.preexistingIds.includes(SCOPE.fallback)||!p.preexistingIds.every(x=>/^dpl_[A-Za-z0-9]+$/.test(x))||
    !['HOSTED','LOCAL_SYNTHETIC'].includes(p.mode)||!path.isAbsolute(p.coordinationRoot||'')||!path.isAbsolute(p.root||'')||
    path.resolve(p.root)!==path.join(path.resolve(p.coordinationRoot),p.runId)||
    (p.mode==='HOSTED'&&path.resolve(p.coordinationRoot)!==path.resolve('C:/Users/CTL Katastrophic/DBPBuyerMatchS2'))||
    !Number.isSafeInteger(p.launcherPid)||p.launcherPid<1||
    !/^[a-f0-9]{64}$/.test(p.controllerHash||'')||!/^[a-f0-9]{64}$/.test(p.observerHash||''))deny();
  return p;
}
export async function requireCanonicalDirectory(dir, operations={realpath,lstat}) {
  const expected=path.resolve(dir),info=await operations.lstat(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||(await operations.realpath(dir)).toLowerCase()!==expected.toLowerCase())deny();
  return expected;
}
export function ownedDeployment(d,p) {
  if(d?.projectId!==p.project||d.ownerId!==p.team||d.target!==null||d.meta?.githubCommitSha!==p.source||d.meta?.s2RunId!==p.runId||
    !/^dpl_[A-Za-z0-9]+$/.test(d.id||'')||p.preexistingIds.includes(d.id)||!Array.isArray(d.alias)||d.alias.length)deny();
  return d;
}
export function scopedApiPath(value,p) {
  const u=new URL(value,'https://api.vercel.com');
  if(u.origin!=='https://api.vercel.com'||u.searchParams.get('teamId')!==p.team||u.hash)deny();
  const permitted=['/v9/projects/'+p.project,'/v2/teams/'+p.team,'/v4/aliases/'+p.alias,'/v6/deployments'];
  if(!permitted.includes(u.pathname)&&!/^\/v13\/deployments\/dpl_[A-Za-z0-9]+$/.test(u.pathname))deny();
  if(u.pathname==='/v6/deployments'&&(u.searchParams.get('projectId')!==p.project||u.searchParams.get('limit')!=='100'))deny();
  return u.pathname;
}
export async function launch(file, expectedHash, ports) {
  const boot={stage:'PLAN_READ',root:null};
  try{return await launchVerified(file,expectedHash,ports,boot);}
  catch(error){
    const codes=new Set(['ENOENT','EACCES','EPERM','ESRCH','EINVAL','EEXIST']);
    const evidence={stage:boot.stage,status:'FAILED_OR_UNKNOWN',code:codes.has(error?.code)?error.code:'ASSERTION_OR_OTHER',errno:Number.isInteger(error?.errno)?error.errno:null,providerPassClaimed:false};
    if(boot.root)try{const h=await open(path.join(boot.root,'startup-failure.json'),'wx',0o600);try{await h.writeFile(JSON.stringify(evidence)+'\n');await h.sync();}finally{await h.close();}}catch{/* Preopened stderr still retains classifications only. */}
    process.stderr.write(JSON.stringify(evidence)+'\n');throw Error('S2_CONTROLLER_UNVERIFIED');
  }
}
async function launchVerified(file, expectedHash, ports, boot) {
  const raw=await readFile(file); if(digest(raw)!==expectedHash)deny();
  boot.stage='PLAN_SCOPE';
  const p=validateControllerPlan(JSON.parse(raw)); const root=path.resolve(p.root);
  const synthetic=p.mode==='LOCAL_SYNTHETIC';
  if(synthetic?typeof ports?.runNative!=='function'||typeof ports?.receiver!=='function':ports!==undefined)deny();
  boot.stage='CANONICAL_DIRECTORIES';
  await requireCanonicalDirectory(root);await requireCanonicalDirectory(p.coordinationRoot);
  boot.stage='OPERATOR_HASHES';
  if(digest(await readFile(fileURLToPath(import.meta.url)))!==p.controllerHash||digest(await readFile(path.join(root,'observer.mjs')))!==p.observerHash)deny();
  boot.root=root;boot.stage='TOOL_PINS';
  for(const [k,f]of Object.entries({node,...tools}))if(digest(await readFile(f))!==pins[k])deny();
  const write=async(name,v)=>{const h=await open(path.join(root,name),'wx',0o600);try{await h.writeFile(JSON.stringify(v)+'\n');await h.sync();}finally{await h.close();}};
  let seq=0;const record=(stage,status,extra={})=>write(`journal-${String(seq++).padStart(4,'0')}.json`,{at:new Date().toISOString(),source:p.source,runId:p.runId,stage,status,...extra});
  boot.stage='LAUNCHER_EXIT';
  let parentExited=false;for(let i=0;i<100;i++){try{process.kill(p.launcherPid,0);}catch(e){if(e.code==='ESRCH'){parentExited=true;break;}throw e;}await delay(50);}if(!parentExited)deny();
  const allowed=['SYSTEMROOT','WINDIR','SYSTEMDRIVE','COMSPEC','PATHEXT','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH','USERNAME','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'];
  const environment=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.includes(k.toUpperCase())));
  async function run(name,args,observe=false) {
    if(synthetic)return ports.runNative(name,args,observe);
    const statuses=[]; const command=name==='stripe'?tools.stripe:node;
    const argv=name==='stripe'?args:[...(observe?['--import',pathToFileURL(path.join(root,'observer.mjs')).href]:[]),tools[name],...args];
    return new Promise((resolve,reject)=>{
      let output='',bytes=0,timedOut=false;const child=spawn(command,argv,{cwd:root,env:environment,shell:false,windowsHide:true,stdio:observe?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
      const timer=setTimeout(()=>{timedOut=true;child.kill();},25000);
      child.stdout.on('data',b=>{bytes+=b.length;if(bytes>4194304){timedOut=true;child.kill();}else output+=b;});
      child.stderr.on('data',()=>{});
      child.on('message',m=>{if(m?.type==='scoped-http-status')statuses.push(m);});
      child.once('error',()=>{clearTimeout(timer);reject(Error('PRIVATE_COMMAND_FAILED'));});
      child.once('close',code=>{clearTimeout(timer);resolve({code,timedOut,output,statuses});});
    });
  }
  async function api(value) {
    const expected=scopedApiPath(value,p);
    const r=await run('vercel',['api',value,'--method','GET','--scope','housebuyerinv','--raw'],true);
    const codes=r.statuses.filter(m=>m.method==='GET'&&m.path===expected).map(m=>m.status);
    if(r.timedOut||!codes.length||new Set(codes).size!==1)deny();
    if(codes[0]===404&&r.code===1)return {status:404};
    if(codes[0]!==200||r.code!==0)deny();return {status:200,body:JSON.parse(r.output)};
  }
  const query='?teamId='+p.team;
  const project=async()=> (await api('/v9/projects/'+p.project+query)).body;
  const inventory=async()=>{const b=(await api('/v6/deployments'+query+'&projectId='+p.project+'&limit=100')).body;if(!Array.isArray(b?.deployments)||b.pagination?.next)deny();return b.deployments;};
  async function endpoint(update=false) {
    const args=update?['webhook_endpoints','update',p.endpoint,'--disabled=true','--confirm']:['webhook_endpoints','retrieve',p.endpoint];
    const r=await run('stripe',[...args,'--stripe-context',p.account,'--project-name','buyermatch-s2']);
    if(r.code!==0||r.timedOut)deny();const b=JSON.parse(r.output);
    if(b.id!==p.endpoint||b.livemode!==false||b.url!==`https://${p.database}.supabase.co/functions/v1/stripe-webhook`||b.status!=='disabled')deny();
    return {id:b.id,livemode:false,status:'disabled'};
  }
  async function receiver() {
    if(synthetic){if(await ports.receiver()!==true)deny();return true;}
    const r=await globalThis.fetch(`https://${p.database}.supabase.co/functions/v1/stripe-webhook`,{method:'POST',body:'',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},signal:globalThis.AbortSignal.timeout(10000)});
    const b=await r.json();if(r.status!==503||Object.keys(b).sort().join(',')!=='error,ok'||b.ok!==false||b.error!=='Staging webhook processing paused')deny();return true;
  }
  async function pauseReceiver(){const r=await run('supabase',['secrets','set','BM_S2_STRIPE_WEBHOOK_ENABLED=false','--project-ref',p.database]);if(r.code!==0||r.timedOut)deny();await receiver();}
  async function authority() {
    const a=await project(),t=(await api('/v2/teams/'+p.team+query)).body;
    if(a?.id!==p.project||a.accountId!==p.team||a.link||a.ssoProtection?.deploymentType!=='all'||Object.keys(a.protectionBypass||{}).length||a.autoAssignCustomDomains!==false||a.gitProviderOptions?.createDeployments!=='disabled'||
      t?.id!==p.team||t.membership?.role!=='OWNER'||t.billing?.plan!=='hobby'||t.billing?.status!=='active')deny();
    const r=await run('stripe',['whoami','--format','json','--project-name','buyermatch-s2']);if(r.code!==0||r.timedOut)deny();
    const accounts=JSON.parse(r.output).authorized_accounts;if(accounts?.length!==1||accounts[0].id!==p.account||accounts[0].modes?.length!==1||accounts[0].modes[0]!=='test')deny();
    return {project:p.project,team:p.team,account:p.account,mode:'test',hobby:true};
  }
  let candidate, ready=false, phase='authority',failed=false;
  const lockPath=path.join(p.coordinationRoot,'dbp-s2-billing.lock.json');
  const lease={source:p.source,runId:p.runId,scope:p.scope,nonce:randomUUID()};
  try {
    const lock=await open(lockPath,'wx',0o600);try{await lock.writeFile(JSON.stringify(lease)+'\n');await lock.sync();}finally{await lock.close();}
    await write(p.runId+'.claim.json',{source:p.source,runId:p.runId,scope:p.scope});
    await record('launcher-exit','PASS',{launcherExited:true});
    await authority();await endpoint();await receiver();
    const alias=(await api('/v4/aliases/'+p.alias+query)).body;if((alias?.deploymentId??alias?.deployment?.id)!==p.fallback||alias.projectId!==p.project)deny();
    const fallback=(await api('/v13/deployments/'+p.fallback+query)).body;if(fallback?.projectId!==p.project||fallback.ownerId!==p.team||fallback.readyState!=='READY')deny();
    // Authorized same-state proof, not event replay or payment activity.
    phase='independent-same-state-containment';await endpoint(true);await pauseReceiver();await endpoint();await receiver();
    ready=true;await write('authority-ready.json',{source:p.source,runId:p.runId,launcherExited:true,independent:true,stripeDisableVerified:true,receiverPauseVerified:true,vercelOwnerReadVerified:true,deleteOperation:'NOT_YET_EXECUTED',hobby:true,deadline:p.expiresAt});
    phase='discover-owned-preview';
    while(Date.now()<p.expiresAt){
      try{const close=JSON.parse(await readFile(path.join(root,'close.request'),'utf8'));if(close.runId!==p.runId||close.source!==p.source)deny();break;}catch(e){if(e.code!=='ENOENT')throw e;}
      const found=[];
      for(const item of (await inventory()).filter(i=>!p.preexistingIds.includes(i.uid??i.id))){const d=(await api('/v13/deployments/'+(item.uid??item.id)+query)).body;if(d?.meta?.s2RunId===p.runId)found.push(ownedDeployment(d,p));}
      if(found.length>1)deny();
      if(found[0]){
        candidate=found[0];
        try{await write('candidate-receipt.json',{source:p.source,runId:p.runId,id:candidate.id,projectId:candidate.projectId,ownerId:candidate.ownerId,url:candidate.url,alias:candidate.alias});}catch(e){if(e.code!=='EEXIST')throw e;}
      }
      phase='monitor-only';await delay(synthetic?1:3000);
    }
  } catch {failed=true;try{await record(phase,'FAILED_OR_UNKNOWN');}catch{/* Preserve uncertainty. */}}
  const cleanup={stripe:false,receiver:false,deployment:!candidate,inventory:false,fallback:false};
  if(ready){
    try{await authority();await endpoint(true);await endpoint();cleanup.stripe=true;}catch{/* Other cleanup still executes. */}
    try{await pauseReceiver();cleanup.receiver=true;}catch{/* Other cleanup still executes. */}
    try{
      if(!candidate){const found=[];for(const item of(await inventory()).filter(i=>!p.preexistingIds.includes(i.uid??i.id))){const d=(await api('/v13/deployments/'+(item.uid??item.id)+query)).body;if(d?.meta?.s2RunId===p.runId)found.push(ownedDeployment(d,p));}if(found.length>1)deny();candidate=found[0];}
      if(candidate){ownedDeployment((await api('/v13/deployments/'+candidate.id+query)).body,p);const r=await run('vercel',['remove',candidate.id,'--safe','--yes','--scope','housebuyerinv']);if(r.code!==0||r.timedOut)deny();if((await api('/v13/deployments/'+candidate.id+query)).status!==404)deny();}
      cleanup.deployment=true;
    }catch{cleanup.deployment=false;}
    try{const current=(await inventory()).map(i=>i.uid??i.id);cleanup.inventory=p.preexistingIds.every(id=>current.includes(id));const a=(await api('/v4/aliases/'+p.alias+query)).body;cleanup.fallback=(a.deploymentId??a.deployment?.id)===p.fallback&&a.projectId===p.project;}catch{/* UNKNOWN */}
  }
  await write('controller-result.json',{mode:p.mode,source:p.source,runId:p.runId,phase,ready,failed,candidateId:candidate?.id??null,independent:true,cleanup,verified:ready&&Object.values(cleanup).every(v=>v===true),preflight:'NOT_CLAIMED_BY_CLEANUP_CONTROLLER'});
  if(ready&&Object.values(cleanup).every(v=>v===true)){
    if((await lstat(lockPath)).isSymbolicLink()||JSON.stringify(JSON.parse(await readFile(lockPath,'utf8')))!==JSON.stringify(lease))deny();
    await unlink(lockPath); // Only this nonce-owned coordination lease, after durable verified closure.
  }
  if(!ready||!Object.values(cleanup).every(v=>v===true))process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  launch(process.argv[2],process.argv[3]).catch(()=>{process.stderr.write('S2_CONTROLLER_UNVERIFIED\n');process.exitCode=2;});
}
