// Real multi-session staging verification. Only synthetic fixtures; never dispatches.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stagingOrigin } from '../server/buyermatch/staging.js';
import plans from '../supabase/functions/_shared/buyermatchPlans.json' with {type:'json'};
const env=process.env, origin=stagingOrigin(env);
if(env.BM_STAGING_CONFIRM!=='I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION') throw Error('Staging confirmation required');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=({data,error})=>{if(error) throw Error(`Synthetic fixture operation failed (${error.code || 'unknown'})`);return data;};
const checks=[];
function check(ok,label){if(!ok) throw Error(label);checks.push(label);}
check(checked(await db.from('dbp_staging_installation').select('project_ref').single()).project_ref===env.BM_STAGING_PROJECT_REF,'Verified staging installation');
const sessions=[];
for(const prefix of ['OTHER','USER']) {
 const email=env[`BM_TEST_${prefix}_EMAIL`];if(!email?.endsWith('@example.invalid')) throw Error('Synthetic account required');
 const client=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=checked(await client.auth.signInWithPassword({email,password:env[`BM_TEST_${prefix}_PASSWORD`]}));
 check(auth.user.user_metadata?.bm_staging_fixture===true,'Synthetic account marker');sessions.push({id:auth.user.id,token:auth.session.access_token});
}
const [account,other]=sessions,headers={};
if(env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass']=env.VERCEL_AUTOMATION_BYPASS_SECRET;
if(env.BM_PREVIEW_SHARE_URL){const share=new URL(env.BM_PREVIEW_SHARE_URL);check(share.origin===origin,'Preview access scoped');const r=await fetch(share,{redirect:'manual'});const cookie=r.headers.getSetCookie().find(x=>x.startsWith('_vercel_jwt='));if(!cookie) throw Error('Preview access unavailable');headers.Cookie=cookie.split(';')[0];}
async function api(who,action,body={}){const r=await fetch(origin+'/api/buyermatch',{method:'POST',headers:{...headers,Authorization:`Bearer ${who.token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...body})});return {status:r.status,body:await r.json()};}
const before=checked(await db.from('bm_entitlements').select('*').eq('owner_id',account.id).eq('product','buyermatch').single());
const initial=await api(account,'plans');check(initial.status===200&&!initial.body.checkoutEnabled&&!initial.body.successFeesEnabled&&initial.body.deliveryMode==='test','Only test delivery available; checkout and fees disabled');
const buyers=[],deals=[],results=[];let failure;
try {
 for(let i=0;i<100;i++) buyers.push({id:randomUUID(),identity_ciphertext:'SYNTHETIC NONDELIVERABLE',identity_hash:randomUUID(),criteria:{markets:['AK']},status:'active',consent_evidence:'SYNTHETIC COMMERCIAL CAP QA ONLY',synthetic:true});
 checked(await db.from('bm_buyers').insert(buyers));
 const matches=buyers.map((b,i)=>({buyerId:b.id,eligible:true,score:Math.floor(i/2),confidence:i%2?95:90}));
 for(const plan of plans) {
  checked(await db.from('bm_entitlements').update({plan_version:plan.version,allowance:plan.analysisAllowance}).eq('owner_id',account.id).eq('product','buyermatch'));
  const baseline=checked(await db.rpc('bm_account_usage',{p_owner:account.id}));check(baseline.softwareDistribution.remaining>0,'Synthetic account has remaining distribution units');
  const id=randomUUID(),key=randomUUID(),contract=`${account.id}/${id}/commercial-cap.pdf`;deals.push(id);
  checked(await db.storage.from('buyermatch-private').upload(contract,Buffer.from('%PDF-1.4\n% SYNTHETIC QA ONLY\n%%EOF'),{contentType:'application/pdf'}));
  const property={serviceType:'software',address:'100 SYNTHETIC CAP TEST',city:'Anchorage',state:'AK',zip:'99501',assetType:'sfh',price:60000};
  checked(await db.from('bm_deals').insert({id,owner_id:account.id,property,title:{company:'Synthetic',name:'Synthetic',email:'test@example.invalid',phone:'5555555555',eoc:'2099-01-01'},status:'approved_for_distribution',contract_verified:true,admin_approved:true,contract_key:contract}));
  const docs=checked(await db.from('bm_documents').select('id,kind,document_hash').in('kind',['network','deal_certification']).eq('current',true).eq('approved',true));
  check(docs.length===2,'Both current software agreements available');
  for(const doc of docs) checked(await db.rpc('bm_accept_document',{p_owner:account.id,p_deal:id,p_document:doc.id,p_hash:doc.document_hash,p_signature:'SYNTHETIC QA'}));
  checked(await db.from('bm_analyses').insert({owner_id:account.id,deal_id:id,operation_key:randomUUID(),private_result:{matches},public_result:{}}));
  const response=await Promise.all(Array.from({length:8},()=>api(account,'distribution',{id,operationKey:key,maxDistributionFanout:10000,distributionAllowance:10000,planVersion:'buyermatch-pro-v1',ownerId:other.id})));
  check(response.every(r=>r.status===200),`${plan.name}: eight concurrent HTTP requests accepted`);
  check(new Set(response.map(r=>r.body.requestId)).size===1,`${plan.name}: one immutable request across concurrent retries`);
  check((await api(account,'distribution',{id,operationKey:key})).status===200,`${plan.name}: sequential retry succeeds`);
  const exposed=checked(await db.from('bm_exposures').select('id,buyer_id,frozen_terms').eq('deal_id',id));
  const expected=matches.slice().sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.buyerId.localeCompare(b.buyerId)).slice(0,plan.maxDistributionFanout).map(x=>x.buyerId).sort();
  check(JSON.stringify(exposed.map(x=>x.buyer_id).sort())===JSON.stringify(expected),`${plan.name}: exactly top ${plan.maxDistributionFanout} of 100; spoofed cap ignored`);
  check(exposed.every(x=>x.frozen_terms.allowedFanout===plan.maxDistributionFanout&&x.frozen_terms.planVersion===plan.version),`${plan.name}: frozen exposure terms`);
  const request=checked(await db.from('bm_distribution_requests').select('plan_version,allowed_fanout,operation_key,service_type').eq('deal_id',id).single());
  check(request.plan_version===plan.version&&request.allowed_fanout===plan.maxDistributionFanout&&request.operation_key===key&&request.service_type==='software',`${plan.name}: frozen reservation scope`);
  const usage=checked(await db.rpc('bm_account_usage',{p_owner:account.id}));
  check(usage.softwareDistribution.used===baseline.softwareDistribution.used+1&&usage.softwareDistribution.invitations===baseline.softwareDistribution.invitations+plan.maxDistributionFanout,`${plan.name}: fanout consumes exactly one distribution unit`);
  check(usage.managedDispo.used===baseline.managedDispo.used,`${plan.name}: Managed Dispo counter unchanged`);
  const jobs=checked(await db.from('bm_outbox').select('state,attempts,accepted_at').in('exposure_id',exposed.map(x=>x.id)));
  check(jobs.length===plan.maxDistributionFanout&&jobs.every(x=>x.state==='pending'&&x.attempts===0&&!x.accepted_at),`${plan.name}: one job per exposure, no dispatch or provider send`);
  check((await api(other,'distribution',{id,operationKey:key,maxDistributionFanout:10000})).status===404,`${plan.name}: cross-owner denied`);
  const publicUsage=await api(account,'plans');check(buyers.every(b=>!JSON.stringify(publicUsage.body).includes(b.id))&&!('accounts' in publicUsage.body),`${plan.name}: usage exposes no buyer identities or admin accounts`);
  results.push({plan:plan.name,eligibleBuyers:100,exposures:exposed.length,concurrentRequests:8,unitsConsumed:1});
 }
} catch(e){failure=e;} finally {
 // Preserve all immutable evidence; suppress synthetic recipients and close test deals.
 if(buyers.length) checked(await db.from('bm_buyers').update({status:'suppressed',opted_out_at:new Date().toISOString()}).in('id',buyers.map(b=>b.id)));
 if(deals.length) checked(await db.from('bm_deals').update({status:'withdrawn'}).in('id',deals));
 checked(await db.from('bm_entitlements').update({plan_version:before.plan_version,allowance:before.allowance}).eq('owner_id',account.id).eq('product','buyermatch'));
}
mkdirSync('test-artifacts',{recursive:true});
const report={status:failure?'failed':'passed',origin,assertions:checks.length,results,checks,...(failure?{failure:failure.message}:{})};
writeFileSync('test-artifacts/buyermatch-commercial-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,assertions:checks.length,results,...(failure?{failure:failure.message}:{})}));
if(failure) process.exitCode=1;
