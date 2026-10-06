// Authorized staging-only provider acceptance. Never prints capabilities or credentials.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { stagingOrigin } from '../server/buyermatch/staging.js';
const env=process.env,origin=stagingOrigin();
if(env.BM_STAGING_PROJECT_REF!=='qxhhlprentrufobpcgna'||env.BM_STAGING_CONFIRM!=='I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION')throw Error('Explicit staging identity required');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const checked=({data,error})=>{if(error)throw Error('Staging database operation failed');return data;};
const checks=[];function check(ok,label){checks.push({label,passed:!!ok});writeFileSync('test-artifacts/resend-staging-report.json',JSON.stringify({origin,checks}));console.log(JSON.stringify(checks.at(-1)));if(!ok)throw Error(label);}
check(checked(await db.from('dbp_staging_installation').select('project_ref').single()).project_ref===env.BM_STAGING_PROJECT_REF,'Staging installation marker');
const access=await fetch(env.BM_PREVIEW_SHARE_URL,{redirect:'manual'}),cookie=access.headers.getSetCookie().find(x=>x.startsWith('_vercel_jwt='))?.split(';')[0];
async function login(prefix){const client=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});const email=env[`BM_TEST_${prefix}_EMAIL`];if(!email?.endsWith('@example.invalid'))throw Error('Synthetic identity required');const a=checked(await client.auth.signInWithPassword({email,password:env[`BM_TEST_${prefix}_PASSWORD`]}));return{client,id:a.user.id,token:a.session.access_token};}
async function api(a,action,data={},expected=200){const r=await fetch(origin+'/api/buyermatch',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action,...data})});const body=await r.json();if(r.status!==expected)throw Error(action+' HTTP '+r.status);return body;}
const user=await login('OTHER'),admin=await login('ADMIN');
const pending=checked(await db.from('bm_outbox').select('id,exposure_id').in('state',['pending','processing']).is('accepted_at',null));
const pendingExposures=checked(await db.from('bm_exposures').select('id,deal_id,owner_id,buyer_id,frozen_terms').in('id',pending.map(x=>x.exposure_id)));
check(pendingExposures.length>0&&new Set(pendingExposures.map(x=>x.deal_id)).size===1,'One existing synthetic distribution isolated');
const id=pendingExposures[0].deal_id;check(pendingExposures.every(x=>x.owner_id===user.id),'Existing distribution belongs to synthetic regular user');
const request=checked(await db.from('bm_distribution_requests').select('id,operation_key').eq('deal_id',id).single()),key=request.operation_key;
const before=await api(user,'plans');check(before.distributionEnabled&&!before.successFeesEnabled,'Staging distribution enabled and fees disabled');
await api(user,'admin-test-dispatch',{},403);check(true,'Regular user cannot execute provider worker');
await Promise.all([1,2,3].map(()=>api(user,'distribution',{id,operationKey:key,to:'injection@example.invalid',providerMode:'resend'},403)));check(true,'Canceled analysis subscription cannot create another distribution');
const exposures=checked(await db.from('bm_exposures').select('id,buyer_id,frozen_terms').eq('deal_id',id));check(exposures.length===pendingExposures.length,'Immutable exposure wave unchanged');
const buyers=checked(await db.from('bm_buyers').select('id,synthetic').in('id',exposures.map(x=>x.buyer_id)));check(buyers.every(x=>x.synthetic),'Every exposure uses a synthetic buyer');
const usage=await api(user,'plans');check(JSON.stringify(usage.usage)===JSON.stringify(before.usage),'Distribution retry consumes no additional allowance');
writeFileSync('test-artifacts/resend-private.json',JSON.stringify({id,ownerId:user.id,exposures,key,usage}));
const sent=await api(admin,'admin-test-dispatch');console.log(JSON.stringify({providerWorker:sent}));
let outbox=checked(await db.from('bm_outbox').select('id,state,provider_message_id,accepted_at,attempts,last_error_code').in('exposure_id',exposures.map(x=>x.id)));
writeFileSync('test-artifacts/resend-outbox-private.json',JSON.stringify(outbox));
check(sent.sent===exposures.length&&sent.retry===0&&outbox.every(x=>x.accepted_at&&x.provider_message_id&&!x.provider_message_id.startsWith('mock-')),'Actual Resend acceptance and provider message IDs persisted');
const beforeRetry=JSON.stringify(outbox);const retries=await Promise.all([1,2,3].map(()=>api(admin,'admin-test-dispatch')));check(retries.every(x=>x.sent===0&&x.retry===0),'Concurrent worker replay creates no new sends');
outbox=checked(await db.from('bm_outbox').select('id,state,provider_message_id,accepted_at,attempts,last_error_code').in('exposure_id',exposures.map(x=>x.id)));check(JSON.stringify(outbox)===beforeRetry,'Accepted outbox receipts and attempts unchanged');
await api(user,'distribution',{id,operationKey:key},403);check(checked(await db.from('bm_exposures').select('id').eq('deal_id',id)).length===exposures.length,'Rejected distribution replay creates no exposure wave');
check((await api(user,'plans')).usage.softwareDistribution.used===usage.usage.softwareDistribution.used,'Retries consume no additional allowance');
const cfg=checked(await db.from('bm_configuration').select('distribution_enabled,provider_verified,permissions_verified,agreements_verified,success_fees_enabled').single()),billing=checked(await db.from('bm_live_billing_config').select('enabled,verified').single());console.log(JSON.stringify({passed:checks.length,configuration:cfg,liveBilling:billing,checkoutEnabled:before.checkoutEnabled,checkoutMode:before.checkoutMode}));
