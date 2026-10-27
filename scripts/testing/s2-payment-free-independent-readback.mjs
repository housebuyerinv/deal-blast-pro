// Independent read-only closure observation. No controller decisions or mutations.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import { SCOPE, requireCanonicalDirectory } from './s2-payment-free-controller.mjs';
const node='C:/Program Files/nodejs/node.exe';
const vercel='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const stripe='C:/Users/CTL Katastrophic/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function main(){
  const root=await requireCanonicalDirectory(process.argv[2]);
  const p=JSON.parse(await fs.readFile(path.join(root,'plan.json'),'utf8'));
  if(Object.entries(SCOPE).some(([k,v])=>p[k]!==v)||p.root!==root||p.mode!=='HOSTED')throw Error();
  const observer=path.join(root,'observer.mjs');if(sha(await fs.readFile(observer))!==p.observerHash)throw Error();
  const allowed=['SYSTEMROOT','WINDIR','SYSTEMDRIVE','COMSPEC','PATHEXT','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH','USERNAME','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'];
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.includes(k.toUpperCase())));
  const run=(tool,args,observe=false)=>new Promise((resolve,reject)=>{
    let stdout='',bytes=0,timedOut=false;const statuses=[];
    const c=spawn(tool,observe?['--import',pathToFileURL(observer).href,...args]:args,{cwd:root,env,shell:false,windowsHide:true,stdio:observe?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{timedOut=true;c.kill();},25000);
    c.stdout.on('data',b=>{bytes+=b.length;if(bytes>4194304){timedOut=true;c.kill();}else stdout+=b;});c.stderr.on('data',()=>{});
    c.on('message',m=>{if(m?.type==='scoped-http-status')statuses.push(m);});
    c.once('error',()=>{clearTimeout(timer);reject(Error());});c.once('close',code=>{clearTimeout(timer);resolve({code,stdout,timedOut,statuses});});
  });
  const api=async route=>{
    const r=await run(node,[vercel,'api',route,'--method','GET','--scope','housebuyerinv','--raw'],true),pathname=new URL(route,'https://api.vercel.com').pathname;
    const codes=r.statuses.filter(s=>s.method==='GET'&&s.path===pathname).map(s=>s.status);
    if(r.timedOut||!codes.length||new Set(codes).size!==1)throw Error();
    if(codes[0]===404&&r.code===1)return {httpStatus:404};
    if(codes[0]!==200||r.code!==0)throw Error();return {httpStatus:200,body:JSON.parse(r.stdout)};
  };
  const receipt=JSON.parse(await fs.readFile(path.join(root,'candidate-receipt.json'),'utf8'));
  if(receipt.source!==p.source||receipt.runId!==p.runId||!/^dpl_[A-Za-z0-9]+$/.test(receipt.id)||p.preexistingIds.includes(receipt.id))throw Error();
  const result={at:new Date().toISOString(),source:p.source,runId:p.runId,deploymentId:receipt.id,method:'FRESH_PROVIDER_READS_AFTER_DETACHED_CLEANUP',deletion:'UNKNOWN',fallback:'UNKNOWN',inventory:'UNKNOWN',stripe:'UNKNOWN',receiver:'UNKNOWN'};
  const query='?teamId='+p.team;
  try{const r=await api('/v13/deployments/'+receipt.id+query);result.deletion={httpStatus:r.httpStatus,verified:r.httpStatus===404};}catch{/* UNKNOWN */}
  try{const r=(await api('/v4/aliases/'+p.alias+query)).body;result.fallback={verified:r.projectId===p.project&&(r.deploymentId??r.deployment?.id)===p.fallback,deploymentId:r.deploymentId??r.deployment?.id};}catch{/* UNKNOWN */}
  try{const r=(await api('/v6/deployments'+query+'&projectId='+p.project+'&limit=100')).body;if(!Array.isArray(r.deployments)||r.pagination?.next)throw Error();const ids=r.deployments.map(d=>d.uid??d.id);result.inventory={priorCount:p.preexistingIds.length,currentCount:ids.length,allPriorPreserved:p.preexistingIds.every(id=>ids.includes(id)),temporaryAbsent:!ids.includes(receipt.id)};}catch{/* UNKNOWN */}
  try{const r=await run(stripe,['webhook_endpoints','retrieve',p.endpoint,'--stripe-context',p.account,'--project-name','buyermatch-s2']);if(r.code!==0||r.timedOut)throw Error();const e=JSON.parse(r.stdout);result.stripe={verified:e.id===p.endpoint&&e.status==='disabled'&&e.livemode===false&&e.url===`https://${p.database}.supabase.co/functions/v1/stripe-webhook`,status:e.status==='disabled'?'disabled':'UNEXPECTED'};}catch{/* UNKNOWN */}
  try{const r=await globalThis.fetch(`https://${p.database}.supabase.co/functions/v1/stripe-webhook`,{method:'POST',body:'',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},signal:globalThis.AbortSignal.timeout(10000)}),b=await r.json();result.receiver={httpStatus:r.status,verified:r.status===503&&b.ok===false&&b.error==='Staging webhook processing paused'};}catch{/* UNKNOWN */}
  const file=await fs.open(path.join(root,'independent-cleanup-readback.json'),'wx',0o600);try{await file.writeFile(JSON.stringify(result)+'\n');await file.sync();}finally{await file.close();}
  process.stdout.write(JSON.stringify(result)+'\n');
}
main().catch(()=>{process.stderr.write('INDEPENDENT_CLOSURE_UNVERIFIED\n');process.exitCode=2;});
