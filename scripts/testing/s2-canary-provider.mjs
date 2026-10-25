import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {S2_RELEASE as S2} from '../buyermatch-s2-release.mjs';
export const CANARY_SOURCE='202b3d3965aa2fd4bb9e16dab06f207b157b8acd';
const base='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/';
const paths={node:'C:/Program Files/nodejs/node.exe',vercel:base+'vercel/dist/vc.js',supabase:base+'supabase/dist/supabase.js',stripe:'C:/Users/CTL Katastrophic/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe'};
const pins={node:'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3',vercel:'33542f1ec34ec6b9953ee7486c7ae5f9cc2a2b0225671ece4ed22fe8625bab86',supabase:'253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240',stripe:'88162aeacb9875bdb48b654a81f00ad45b9155a28545770144e7997f90efd486'};
export const sha=x=>createHash('sha256').update(x).digest('hex');
const observer=new URL('./s2-canary-http-observer.mjs',import.meta.url);
export function validateCanaryPlan(p){
 if(!p||p.source!==CANARY_SOURCE||p.project!==S2.project||p.team!==S2.team||p.alias!==new URL(S2.origin).hostname||p.fallback!==S2.fallback||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.runId)||!Array.isArray(p.preexistingIds)||!p.preexistingIds.includes(S2.fallback)||!p.preexistingIds.every(x=>/^dpl_[A-Za-z0-9]+$/.test(x))||
    !Number.isSafeInteger(p.startedAt)||!p.operatorPins||Object.keys(p.operatorPins).length<5)throw Error('Canary plan invalid');
 return p;
}
export function normalizeDeployment(raw,code,id){
 if(code===404&&!raw)return {kind:'not-found',httpStatus:404,deploymentId:id};
 if(code!==200||raw?.id!==id||raw.projectId!==S2.project||raw.ownerId!==S2.team)throw Error('Deployment evidence unavailable');
 return {kind:'found',id:raw.id,projectId:raw.projectId,ownerId:raw.ownerId,target:raw.target,readyState:raw.readyState,meta:raw.meta,alias:raw.alias,url:raw.url};
}
export function assertRemoval(d,plan){
 validateCanaryPlan(plan);
 if(d.kind!=='found'||d.projectId!==S2.project||d.ownerId!==S2.team||d.target!==null||d.meta?.githubCommitSha!==CANARY_SOURCE||d.meta?.s2RunId!==plan.runId||
    !/^dpl_[A-Za-z0-9]+$/.test(d.id)||plan.preexistingIds.includes(d.id)||d.id===S2.fallback||!Array.isArray(d.alias)||d.alias.length!==0)throw Error('Removal denied');
 return d.id;
}
export function checkedStatus(result,path){
 const status=result.statuses.filter(x=>x.type==='scoped-http-status'&&x.method==='GET'&&x.path===new URL(path,'https://api.vercel.com').pathname).map(x=>x.status);
 if(result.timedOut||!status.length||new Set(status).size!==1||![200,404].includes(status[0])||
    (status[0]===200&&result.code!==0)||(status[0]===404&&result.code!==1))throw Error('Structured HTTP evidence missing');
 return status[0];
}
export function assertApiRead(path){
 if(!['/v9/projects/'+S2.project,'/v2/teams/'+S2.team,'/v4/aliases/'+new URL(S2.origin).hostname,'/v6/deployments?projectId='+S2.project+'&limit=100'].includes(path)&&!/^\/v13\/deployments\/dpl_[A-Za-z0-9]+$/.test(path))throw Error('API read scope denied');
}
export function makeProvider(plan,dir){
 validateCanaryPlan(plan);
 const verifyPins=()=>{
  for(const[k,p]of Object.entries(paths))if(sha(readFileSync(p))!==pins[k])throw Error('Tool changed');
  for(const[p,h]of Object.entries(plan.operatorPins))if(sha(readFileSync(p))!==h)throw Error('Operator changed');
  if(['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','STRIPE_API_KEY','STRIPE_ACCOUNT','STRIPE_CONTEXT','VERCEL_TOKEN'].some(k=>process.env[k])||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Ambient override denied');
 };
 async function run(name,args,signal,observe=false,options={}){
  verifyPins();if(signal?.aborted)throw Error('Aborted');
  return new Promise((resolve,reject)=>{
   let stdout='',stderr='',size=0,timedOut=false;const statuses=[];
   const argv=name==='stripe'?args:[...(observe?['--import',observer.href]:[]),paths[name],...args];
   const c=spawn(name==='stripe'?paths.stripe:paths.node,argv,{shell:false,windowsHide:true,stdio:observe?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe'],...options});
   const abort=()=>{timedOut=true;c.kill();};const timer=setTimeout(abort,20000);signal?.addEventListener('abort',abort,{once:true});
   c.on('message',m=>{if(m?.type==='scoped-http-status'&&Object.keys(m).sort().join(',')==='method,path,status,type')statuses.push(m);});
   const collect=(which,b)=>{size+=b.length;if(size>2097152){abort();return;}if(which==='out')stdout+=b;else stderr+=b;};
   c.stdout.on('data',b=>collect('out',b));c.stderr.on('data',b=>collect('err',b));
   c.on('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('Private command failed'));});
   c.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({code,stdout,stderr,statuses,timedOut});});
  });
 }
 const json=async(name,args,signal,options)=>{const r=await run(name,args,signal,false,options);if(r.code!==0||r.timedOut)throw Error('Private command unavailable');return JSON.parse(r.stdout);};
 async function api(path,signal){assertApiRead(path);const r=await run('vercel',['api',path,'--scope',S2.scope,'--raw'],signal,true);const code=checkedStatus(r,path);return {code,body:code===200?JSON.parse(r.stdout):null};}
 const stripe=(args,signal)=>json('stripe',[...args,'--project-name','buyermatch-s2'],signal);
 const project=async signal=>{const p=(await api('/v9/projects/'+S2.project,signal)).body;if(p?.id!==S2.project||p.accountId!==S2.team||p.link||p.ssoProtection?.deploymentType!=='all'||Object.keys(p.protectionBypass||{}).length)throw Error('Project isolation failed');return p;};
 const endpoint=async signal=>{const e=await stripe(['webhook_endpoints','retrieve',S2.endpoint],signal);if(e.id!==S2.endpoint||e.livemode!==false||e.url!==`https://${S2.staging}.supabase.co/functions/v1/stripe-webhook`)throw Error('Stripe scope mismatch');return e;};
 const readDeployment=async(id,signal)=>{if(!/^dpl_[A-Za-z0-9]+$/.test(id))throw Error();const r=await api('/v13/deployments/'+id,signal);return normalizeDeployment(r.body,r.code,id);};
 const readAlias=async(alias,signal)=>{if(alias!==plan.alias)throw Error();const a=(await api('/v4/aliases/'+alias,signal)).body;return {projectId:a.projectId,deploymentId:a.deploymentId??a.deployment?.id};};
 return {
  api,readDeployment,readAlias,
  async verifyAuthority(signal){const[p,t,who,e]=await Promise.all([project(signal),api('/v2/teams/'+S2.team,signal),stripe(['whoami','--format','json'],signal),endpoint(signal)]);if(t.body?.id!==S2.team||t.body.membership?.role!=='OWNER'||who.account_id!==S2.account||e.status!=='disabled')throw Error('Authority unavailable');return {project:p.id,team:p.accountId,account:who.account_id,livemode:false};},
  async disableEndpoint(id,signal){if(id!==S2.endpoint)throw Error();await endpoint(signal);const e=await stripe(['webhook_endpoints','update',id,'--disabled=true','--confirm'],signal);if(e.id!==id||e.status!=='disabled'||e.livemode!==false)throw Error('Containment unverified');},
  async pauseReceiver(ref,signal){if(ref!==S2.staging)throw Error();const r=await run('supabase',['secrets','set','BM_S2_STRIPE_WEBHOOK_ENABLED=false','--project-ref',ref],signal);if(r.code!==0||r.timedOut)throw Error('Receiver pause failed');},
  async readSafetyState(signal){
   const cwd=dir+'/env-empty-'+randomUUID();mkdirSync(cwd);
   const names=['SYSTEMROOT','WINDIR','SYSTEMDRIVE','COMSPEC','PATHEXT','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH','USERNAME','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS'];
   const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>names.includes(k.toUpperCase())));
   const[p,e,secrets,pauses]=await Promise.all([project(signal),endpoint(signal),json('supabase',['secrets','list','--project-ref',S2.staging,'--output','json'],signal),json('vercel',['env','run','--project',S2.project,'--environment','preview','--scope',S2.scope,'--',paths.node,fileURLToPath(new URL('./s2-canary-pauses.mjs',import.meta.url))],signal,{cwd,env})]);
   if(pauses.stagingOnly!==true)throw Error('Wrong backend');
   return {...pauses,endpointDisabled:e.status==='disabled',receiverPaused:secrets.find(s=>s.name==='BM_S2_STRIPE_WEBHOOK_ENABLED')?.value===sha('false'),protectionEnabled:p.ssoProtection.deploymentType==='all'};
  },
  async removeDeployment(id,signal){const d=await readDeployment(id,signal);assertRemoval(d,plan);if(id!==d.id)throw Error();const r=await run('vercel',['remove',id,'--safe','--yes','--scope',S2.scope],signal);if(r.code!==0||r.timedOut)throw Error('Removal command failed');},
  async restoreAlias(){throw Error('Alias changes prohibited in this rehearsal');},
 };
}
