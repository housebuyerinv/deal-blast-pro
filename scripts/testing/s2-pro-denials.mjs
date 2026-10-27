// Supported password authentication + fixed denied requests. No browser-token
// bridge, admin authority, secret files, signup, reset, Stripe calls or retries.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { pathToFileURL, URL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const REF='qxhhlprentrufobpcgna',PROJECT='prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',TEAM='team_2ejXKYjjGXIFsIQTUMEqZ8Cf';
const SOURCE='4e79c99ac98d13bb030076aaf55a8289934d9ae4';
const UID='368f5f93-acf7-4cc3-9805-a4c0817506c3',EMAIL='dbp-s2-pro-1792721835370@example.com';
const backend='https://'+REF+'.supabase.co';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validateDenialPlan(p,now=Date.now()) {
  const u=new URL(p?.origin||'https://invalid.invalid');
  if(p?.source!==SOURCE||p.project!==PROJECT||p.team!==TEAM||p.database!==REF||p.scope!=='payment-free-preflight'||
    !/^dpl_[A-Za-z0-9]+$/.test(p.deploymentId||'')||!/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(u.hostname)||
    u.protocol!=='https:'||u.origin!==p.origin||u.username||u.password||u.hash||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.runId||'')||
    path.resolve(p.root||'.')!==path.join(path.resolve('C:/Users/CTL Katastrophic/DBPBuyerMatchS2'),p.runId)||
    !Number.isSafeInteger(p.expiresAt)||p.expiresAt-now<180000||p.expiresAt-now>1800000)throw Error();
  return p;
}
export async function executeProDenials(p,{env,password,fetcher=globalThis.fetch,now=Date.now}={}) {
  const checks=[];let token=null,stage='configuration',loggedOut=false;
  const record=(operation,httpStatus,verified)=>checks.push({operation,httpStatus,verified});
  const outcome={source:SOURCE,runId:p?.runId,deploymentId:p?.deploymentId,status:'FAILED_OR_UNKNOWN',fixtureVerified:false,normalPasswordAuthentication:false,checks};
  let claims;
  try{
    validateDenialPlan(p,now());
    claims=JSON.parse(Buffer.from((env.VERCEL_OIDC_TOKEN||'').split('.')[1],'base64url').toString('utf8'));
    if(env.SUPABASE_URL!==backend||env.VITE_SUPABASE_URL!==backend||claims.project_id!==PROJECT||claims.owner_id!==TEAM||typeof claims.exp!=='number'||claims.exp*1000-now()<180000||
      !env.VERCEL_OIDC_TOKEN||!String(env.VITE_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY||'')||typeof password!=='string'||password.length<1||password.length>1024||
      env.NODE_OPTIONS||env.NODE_EXTRA_CA_CERTS||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error();
    const key=env.VITE_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY;
    if(!key.startsWith('sb_publishable_')){
      const publicClaims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));
      if(publicClaims.role!=='anon'||publicClaims.ref!==REF)throw Error();
    }
    const request=async(url,method='GET',body,authenticated=false)=>{
      if(now()>=p.expiresAt-10000)throw Error();
      const isApp=url.startsWith(p.origin+'/api/'),isAuth=url.startsWith(backend+'/auth/v1/');
      if(!isApp&&!isAuth)throw Error();
      const headers=isApp?{'x-vercel-trusted-oidc-idp-token':env.VERCEL_OIDC_TOKEN}:{apikey:key};
      if(authenticated){if(!token)throw Error();headers.Authorization='Bearer '+token;}
      if(body!==undefined)headers['Content-Type']='application/json';
      const r=await fetcher(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',cache:'no-store',signal:globalThis.AbortSignal.timeout(10000)});
      let bytes=0;const chunks=[];
      for await(const c of r.body||[]){bytes+=c.byteLength;if(bytes>65536)throw Error();chunks.push(c);}
      const text=Buffer.concat(chunks).toString('utf8');return {httpStatus:r.status,body:text?JSON.parse(text):null};
    };
    stage='protected-transport-positive-control';
    const anonymous=await request(p.origin+'/api/buyermatch?action=billing-status');
    record(stage,anonymous.httpStatus,anonymous.httpStatus===401&&anonymous.body?.error==='Sign in required');if(!checks.at(-1).verified)throw Error();
    stage='normal-pro-password-login';
    const login=await request(backend+'/auth/v1/token?grant_type=password','POST',{email:EMAIL,password});password='';
    record(stage,login.httpStatus,login.httpStatus===200&&typeof login.body?.access_token==='string'&&login.body?.user?.id===UID);
    // Retain/revoke only this newly created local Auth session, even on mismatch.
    if(typeof login.body?.access_token==='string'&&login.body?.user?.id===UID)token=login.body.access_token;
    if(!checks.at(-1).verified)throw Error();outcome.normalPasswordAuthentication=true;
    stage='authoritative-pro-identity';const user=await request(backend+'/auth/v1/user','GET',undefined,true);
    const identity=user.httpStatus===200&&user.body?.id===UID&&user.body.email===EMAIL&&user.body.role==='authenticated'&&Number.isFinite(Date.parse(user.body.email_confirmed_at||''));
    record(stage,user.httpStatus,identity);if(!identity)throw Error();outcome.fixtureVerified=true;
    stage='pro-runtime-authority';const status=await request(p.origin+'/api/buyermatch?action=billing-status','GET',undefined,true),s=status.body;
    const paused=status.httpStatus===200&&s?.source===SOURCE&&s.projectId===PROJECT&&s.deploymentId===p.deploymentId&&s.registrationPaused===true&&s.checkoutEnabled===false&&s.liveBillingDisabled===true&&s.deliveryDisabled===true&&
      ['OWNER_ID','RUN_ID','STARTED_AT','EXPIRES_AT','OPERATIONS'].every(k=>s['BM_S2_BILLING_'+k]==='');
    record(stage,status.httpStatus,paused);if(!paused)throw Error();
    for(const endpoint of ['s2-attestation','s2-stripe-readiness']){
      stage='pro-denied-owner-'+endpoint;const r=await request(p.origin+'/api/platform/'+endpoint,'GET',undefined,true);
      record(stage,r.httpStatus,r.httpStatus===403&&r.body?.error==='Owner access required');if(!checks.at(-1).verified)throw Error();
    }
    const routes=[
      ['legacy-portal','/api/create-billing-portal-session',{},'s2_legacy_portal_disabled'],
      ['legacy-credit-pack','/api/property-intelligence/credit-packs',{},'s2_legacy_checkout_disabled'],
      ['legacy-pro-trial','/api/property-intelligence/pro-trial-checkout',{},'s2_legacy_checkout_disabled'],
      ['buyermatch-checkout','/api/buyermatch',{action:'checkout',planVersion:'buyermatch-pro-v1',operationKey:p.runId},null],
      ['buyermatch-portal','/api/buyermatch',{action:'billing-portal',operation:'payment'},null],
    ];
    for(const [name,route,body,code]of routes){
      stage=name;const r=await request(p.origin+route,'POST',body,true);
      const allowedKeys=r.body&&Object.keys(r.body).every(k=>['ok','error','code'].includes(k));
      const denied=allowedKeys&&(code?r.httpStatus===503&&r.body.code===code:
        (r.httpStatus===503&&r.body.error==='S2 billing test window is closed or this operation is not approved.')||
        (name==='buyermatch-checkout'&&r.httpStatus===409&&r.body.error==='Review and sign the current platform terms and privacy policy before checkout.'));
      record(name,r.httpStatus,Boolean(denied));if(!denied)throw Error();
    }
    outcome.status='HOSTED_PAYMENT_FREE_CHECKS_PASS';
  }catch{outcome.failedStage=stage;}
  finally{
    password='';
    if(token)try{
      const r=await fetcher(backend+'/auth/v1/logout?scope=local',{method:'POST',redirect:'error',headers:{apikey:env.VITE_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},signal:globalThis.AbortSignal.timeout(10000)});
      loggedOut=r.status===204;
    }catch{/* Session closure cannot be assumed. */}
    token=null;outcome.localAuthSessionClosed=loggedOut;
    if(outcome.normalPasswordAuthentication&&!loggedOut)outcome.status='FAILED_OR_UNKNOWN';
  }
  return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let root,plan;const failure={status:'FAILED_OR_UNKNOWN',stage:'private-entry'};
  try{
    const raw=await fs.readFile(process.argv[2]);if(sha(raw)!==process.argv[3])throw Error();plan=validateDenialPlan(JSON.parse(raw));root=plan.root;
    const claim=await fs.open(path.join(root,'pro-denial-attempt.json'),'wx',0o600);try{await claim.writeFile(JSON.stringify({source:SOURCE,runId:plan.runId,stage:'ONE_AUTH_ATTEMPT'}));await claim.sync();}finally{await claim.close();}
    let bytes=0;const chunks=[];for await(const c of process.stdin){bytes+=c.length;if(bytes>8192)throw Error();chunks.push(c);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(Object.keys(input).join(',')!=='password')throw Error();
    const result=await executeProDenials(plan,{env:process.env,password:input.password});input.password='';
    await fs.writeFile(path.join(root,'pro-denial-result.json'),JSON.stringify(result)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='HOSTED_PAYMENT_FREE_CHECKS_PASS')process.exitCode=2;
  }catch{process.stdout.write(JSON.stringify(failure)+'\n');process.exitCode=2;}
  finally{if(root&&plan)try{await fs.writeFile(path.join(root,'close.request'),JSON.stringify({source:plan.source,runId:plan.runId}),{flag:'wx'});}catch{/* Existing close request is never replaced. */}}
}
