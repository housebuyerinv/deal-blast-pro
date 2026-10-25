// Closed owner-run coordinator. No public route, registration pause override or secret output.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OWNER = 'housebuyerinv@gmail.com';
export const REF = 'qxhhlprentrufobpcgna';
export const APPROVAL = '6391036826';
const origin = `https://${REF}.supabase.co`;
const cli = 'C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/supabase/dist/supabase.js';
const cliHash = '253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240';
const intentPath = new URL('../../api/_registrationIntent.ts', import.meta.url);
const intentHash = '88707bc9034a27ebdb75a6be7783439cb4d98682a9fa9e403e66e669d54e8a76';
const baselinePath = new URL('../../artifacts/buyermatch-1b/s2-owner-provision-baseline.json', import.meta.url);
const hash = x => createHash('sha256').update(x).digest('hex');
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
export const DOCS = Object.freeze([
  {id:'b6e12fb1-3087-439a-a493-2cae3f73529c',kind:'platform_terms',version:'staging-fixture-v2',document_hash:'fdc470ec2a67efb482186cd273a4ede0a3c7955707a0850519e079bcdea322d1'},
  {id:'1142c60e-65e0-442c-aeb9-134090a5c918',kind:'privacy',version:'staging-fixture-v2',document_hash:'63847efbbfba1c6bb468fd2598b8775bef2daa576cfed7290f32fc178ecce8c5'},
]);
const tables = {
  account_profiles:['user_id','user_id,email,full_name,company,role,account_status,deactivated_at'],
  workspaces:['owner_user_id','id,owner_user_id,owner_email,name,account_status,deactivated_at'],
  workspace_plan_assignments:['user_id','workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,access_status,stripe_customer_id,stripe_subscription_id'],
  bm_acceptances:['owner_id','owner_id,deal_id,document_id,version,document_hash,signature_evidence'],
  account_registration_events:['user_id','user_id,workspace_id,email,event_type,status,idempotency_key'],
};
const docsURL = `${origin}/rest/v1/bm_documents?select=id,kind,version,document_hash,content&current=eq.true&approved=eq.true&kind=in.(platform_terms,privacy)`;

export function validateBaseline(b, now = Date.now()) {
  if (!b || b.approval !== APPROVAL || b.project !== REF || b.email !== OWNER || !uuid(b.ownerId) || !uuid(b.runId) ||
      b.functionHash !== '360ec632abd40692cee1683b30de3bd0' || b.serviceOnly !== true || b.pausesVerified !== true ||
      !Number.isSafeInteger(b.createdAt) || b.createdAt > now || now-b.createdAt > 3600000) throw Error('Preflight unavailable');
  return b;
}
export function validateDocuments(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) throw Error('Agreement configuration unavailable');
  return DOCS.map(expected => {
    const found=rows.filter(x=>x.id===expected.id);
    const d=found[0];
    if(found.length!==1 || Object.entries(expected).some(([k,v])=>d[k]!==v) || typeof d.content!=='string' ||
       d.content.length>10000 || [...d.content].some(c=>{const n=c.charCodeAt(0);return (n<32&&![9,10,13].includes(n))||n===127;}) || hash(d.content)!==expected.document_hash) throw Error('Agreement configuration unavailable');
    return {...expected,content:d.content};
  });
}
export function validateInput(x, now = Date.now()) {
  if(!x || Object.keys(x).sort().join(',')!=='acceptedAt,acceptedBoth,company,documents,name,password' || x.acceptedBoth!==true ||
     typeof x.password!=='string' || x.password.length<16 || x.password.length>1024 ||
     typeof x.name!=='string' || x.name.trim()!==x.name || x.name.length<2 || x.name.length>200 ||
     typeof x.company!=='string' || x.company.trim()!==x.company || x.company.length>200 ||
     !Number.isSafeInteger(x.acceptedAt) || x.acceptedAt>now || now-x.acceptedAt>900000 ||
     !Array.isArray(x.documents) || x.documents.length!==2 || DOCS.some(d=>x.documents.filter(v=>v.id===d.id&&v.hash===d.document_hash&&Object.keys(v).sort().join(',')==='hash,id').length!==1)) throw Error('Private prerequisites incomplete');
  return x;
}
export function assertProvisionRequest(method, url, body) {
  const u=new URL(url);
  if(u.origin!==origin||u.username||u.password||u.hash)throw Error('Request denied');
  if(method==='POST'&&u.href===`${origin}/auth/v1/token?grant_type=password`&&body&&Object.keys(body).sort().join(',')==='email,password'&&body.email===OWNER&&typeof body.password==='string')return;
  if(method==='GET'&&!body&&(u.href===`${origin}/auth/v1/user`||u.href===docsURL))return;
  if(method==='POST'&&u.href===`${origin}/auth/v1/logout?scope=local`&&body===undefined)return;
  if(method==='GET'&&!body)for(const[t,[field,select]]of Object.entries(tables)) {
    if(u.pathname===`/rest/v1/${t}`&&[...u.searchParams.keys()].sort().join(',')===[field,'select'].sort().join(',')&&
       u.searchParams.get('select')===select&&uuid(u.searchParams.get(field)?.replace(/^eq\./,''))&&u.searchParams.get(field)?.startsWith('eq.'))return;
  }
  if(method==='POST'&&u.href===`${origin}/rest/v1/rpc/dbp_provision_registration`&&body&&
     Object.keys(body).sort().join(',')==='p_company,p_documents,p_email,p_name,p_plan,p_require_documents,p_role,p_user'&&uuid(body.p_user)&&
     body.p_email===OWNER&&body.p_role==='Admin'&&body.p_plan==='Free'&&body.p_require_documents===true&&
     typeof body.p_name==='string'&&body.p_name.trim()===body.p_name&&body.p_name.length>=2&&body.p_name.length<=200&&
     typeof body.p_company==='string'&&body.p_company.trim()===body.p_company&&body.p_company.length<=200&&Array.isArray(body.p_documents)&&body.p_documents.length===2&&
     DOCS.every(d=>body.p_documents.filter(v=>v.id===d.id&&v.hash===d.document_hash&&Object.keys(v).sort().join(',')==='hash,id').length===1))return;
  throw Error('Request denied');
}
async function snapshot(uid, request, key) {
  const result={};
  for(const[t,[field,select]]of Object.entries(tables)) {
    const rows=await request('GET',`${origin}/rest/v1/${t}?select=${select}&${field}=eq.${uid}`,key);
    if(!Array.isArray(rows))throw Error();result[t]=rows;
  }
  return result;
}
export function completeState(s, uid, input) {
  if(Object.entries(tables).some(([t])=>s[t]?.length!==(t==='bm_acceptances'?2:1)))return false;
  const p=s.account_profiles[0],w=s.workspaces[0],b=s.workspace_plan_assignments[0],e=s.account_registration_events[0];
  return p.user_id===uid&&p.email===OWNER&&p.full_name===input.name&&(p.company||'')===input.company&&p.role==='Admin'&&p.account_status==='Active'&&!p.deactivated_at&&
    uuid(w.id)&&w.owner_user_id===uid&&w.owner_email===OWNER&&w.account_status==='Active'&&!w.deactivated_at&&w.name===(input.company||`${input.name}'s Workspace`)&&
    b.user_id===uid&&b.workspace_id===w.id&&b.plan_name==='Free'&&b.billing_status==='Free Active'&&b.trial_status==='Free Active'&&b.payment_status==='No payment required'&&b.access_status==='Active'&&!b.stripe_customer_id&&!b.stripe_subscription_id&&
    e.user_id===uid&&e.workspace_id===w.id&&e.email===OWNER&&e.event_type==='new_account_created'&&e.status==='created'&&e.idempotency_key===`new_account_created:${uid}`&&
    DOCS.every(d=>s.bm_acceptances.filter(a=>a.owner_id===uid&&a.deal_id===null&&a.document_id===d.id&&a.document_hash===d.document_hash&&a.version===d.version&&
      a.signature_evidence?.typedName===input.name&&a.signature_evidence?.method==='authenticated_typed_signature'&&a.signature_evidence?.userId===uid).length===1);
}
export async function provisionOwner(input, io, baseline, now=Date.now()) {
  const r={ok:false,stage:'private-prerequisites',rpcAttempted:false,verified:false,localSessionClosed:false};
  let token,anon;
  try{
    validateBaseline(baseline,now);validateInput(input,now);
    const keys=await io.getKeys();anon=keys.anon;
    for(const[role,key]of [['anon',keys.anon],['service_role',keys.service]]) {
      const c=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(c.ref!==REF||c.role!==role)throw Error();
    }
    r.stage='password-authentication';
    const login=await io.request('POST',`${origin}/auth/v1/token?grant_type=password`,anon,{email:OWNER,password:input.password});
    if(typeof login.access_token!=='string'||!login.access_token)throw Error();token=login.access_token;
    const u=await io.request('GET',`${origin}/auth/v1/user`,token,undefined,{apikey:anon});
    if(u.id!==baseline.ownerId||u.email!==OWNER||!u.email_confirmed_at||u.is_anonymous||u.banned_until||u.id!==login.user?.id)throw Error();
    r.stage='documents-and-state';
    validateDocuments(await io.request('GET',docsURL,keys.service));
    const before=await snapshot(u.id,io.request,keys.service);
    if(Object.values(before).some(a=>a.length)) {
      if(!completeState(before,u.id,input))throw Error();
      r.ok=true;r.verified=true;r.stage='already-exact-no-write';
    }else{
      const intent=io.signRegistrationIntent({version:1,email:OWNER,name:input.name,company:input.company,role:'Admin',plan:'Free',product:'crm',documents:input.documents,expires:now+900000},keys.service,now);
      const verified=io.verifyRegistrationIntent(intent,OWNER,keys.service,now);
      if(verified.role!=='Admin'||verified.plan!=='Free'||verified.product!=='crm'||verified.name!==input.name||verified.company!==input.company||JSON.stringify(verified.documents)!==JSON.stringify(input.documents))throw Error();
      r.stage='atomic-provisioning';r.rpcAttempted=true;
      const done=await io.request('POST',`${origin}/rest/v1/rpc/dbp_provision_registration`,keys.service,{p_user:u.id,p_email:OWNER,p_name:verified.name,p_company:verified.company,p_role:verified.role,p_plan:verified.plan,p_documents:verified.documents,p_require_documents:true});
      if(typeof done.created!=='boolean')throw Error();
      r.stage='post-commit-verification';
      const after=await snapshot(u.id,io.request,keys.service);
      if(!completeState(after,u.id,input)||(done.created&&done.workspaceId!==after.workspaces[0].id))throw Error();
      r.ok=true;r.verified=true;r.stage='provisioned-and-verified';
    }
  }catch{/* Never reflect provider responses, credentials, typed name or signed intent. */}
  finally{
    if(token)try{await io.request('POST',`${origin}/auth/v1/logout?scope=local`,token,undefined,{apikey:anon});r.localSessionClosed=true;}catch{/* No retry or broader logout. */}
  }
  if(!r.localSessionClosed&&r.ok){r.ok=false;r.stage='session-cleanup-unverified';}
  return {...r,requiresReview:!r.ok,retryAttempted:false};
}

async function realRequest(method,url,key,body,extra={}) {
  assertProvisionRequest(method,url,body);
  const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${key}`,apikey:key,...extra,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error();
  if(new URL(url).pathname==='/auth/v1/logout')return {};
  return response.json();
}
function dependencies() {
  if(hash(readFileSync(process.execPath))!=='b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3'||hash(readFileSync(cli))!==cliHash||hash(readFileSync(intentPath))!==intentHash)throw Error();
  return {
    getKeys(){const rows=JSON.parse(execFileSync(process.execPath,[cli,'projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:1048576}));
      const key=n=>{const found=rows.filter(x=>x.name===n);if(found.length!==1||!found[0].api_key)throw Error();return found[0].api_key;};
      return {anon:key('anon'),service:key('service_role')};},request:realRequest,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let result={ok:false,stage:'preflight',rpcAttempted:false,requiresReview:true};
  try{
    if(process.argv.length!==4||!['--review','--provision'].includes(process.argv[2])||!/^[a-f0-9]{64}$/.test(process.argv[3])||
       ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','STRIPE_API_KEY','NODE_OPTIONS','NODE_EXTRA_CA_CERTS'].some(k=>process.env[k]))throw Error();
    const raw=readFileSync(baselinePath);if(hash(raw)!==process.argv[3])throw Error();
    const baseline=validateBaseline(JSON.parse(raw));
    const io=dependencies();
    if(process.argv[2]==='--review') {
      const keys=io.getKeys();
      result={ok:true,stage:'review-only-no-write',documents:validateDocuments(await io.request('GET',docsURL,keys.service))};
    }else{
      let size=0;const chunks=[];
      for await(const c of process.stdin){size+=c.length;if(size>8192)throw Error();chunks.push(c);}
      const input=validateInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      // The same run cannot be submitted twice, including after a timeout.
      writeFileSync(new URL(`../../artifacts/buyermatch-1b/owner-provision-attempt-${baseline.runId}.json`,import.meta.url),JSON.stringify({approval:APPROVAL,stage:'attempt-started',time:new Date().toISOString()}),{flag:'wx'});
      const intent=await import(intentPath.href);
      result=await provisionOwner(input,{...io,...intent},baseline);
    }
  }catch{/* Fixed sanitized result only. No automatic retry. */}
  process.stdout.write(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
