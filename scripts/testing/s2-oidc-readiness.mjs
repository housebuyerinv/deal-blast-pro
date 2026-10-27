// Provider-injected environment only. No environment/file/token values leave here.
import process from 'node:process';
import { Buffer } from 'node:buffer';
const e=process.env;
let claims={};
try{claims=JSON.parse(Buffer.from((e.VERCEL_OIDC_TOKEN||'').split('.')[1],'base64url').toString('utf8'));}catch{/* Missing/unknown remains false. */}
const result={
  scope:'READ_ONLY_S2_TRANSPORT_DISCOVERY',
  backendMatches:e.SUPABASE_URL==='https://qxhhlprentrufobpcgna.supabase.co'&&e.VITE_SUPABASE_URL===e.SUPABASE_URL,
  oidcPresent:typeof e.VERCEL_OIDC_TOKEN==='string'&&e.VERCEL_OIDC_TOKEN.length>100,
  projectClaimMatches:claims.project_id==='prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',
  teamClaimMatches:claims.owner_id==='team_2ejXKYjjGXIFsIQTUMEqZ8Cf',
  tokenUnexpired:typeof claims.exp==='number'&&claims.exp*1000>Date.now()+300000,
  publicKeyAvailable:Boolean(e.VITE_SUPABASE_ANON_KEY||e.SUPABASE_ANON_KEY),
  signatureVerification:'NOT_CLAIMED_FROM_DECODING',
  noProviderMutation:true,
};
if(result.backendMatches&&result.oidcPresent&&result.projectClaimMatches&&result.teamClaimMatches&&result.tokenUnexpired){
  try{
    const r=await globalThis.fetch('https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app/api/buyermatch?action=billing-status',{
      method:'GET',redirect:'error',cache:'no-store',signal:globalThis.AbortSignal.timeout(10000),
      headers:{'x-vercel-trusted-oidc-idp-token':e.VERCEL_OIDC_TOKEN},
    });
    let body;try{body=await r.json();}catch{/* Non-application denial is not transport proof. */}
    result.protectedRequest={httpStatus:r.status,applicationAuthRequired:r.status===401&&body?.error==='Sign in required'};
  }catch{result.protectedRequest='UNVERIFIED';}
}
process.stdout.write(JSON.stringify(result)+'\n');
