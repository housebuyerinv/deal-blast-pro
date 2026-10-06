// Staging-only checkout preparation. This never completes payment or simulates a webhook.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stagingOrigin } from '../server/buyermatch/staging.js';
import plans from '../supabase/functions/_shared/buyermatchPlans.json' with {type:'json'};
const env=process.env,origin=stagingOrigin();
if(env.BM_STAGING_CONFIRM!=='I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION') throw Error('Staging confirmation required');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const checks=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
const checked=({data,error})=>{if(error)throw Error('Staging verification database operation failed');return data;};
check(checked(await db.from('dbp_staging_installation').select('project_ref').single()).project_ref===env.BM_STAGING_PROJECT_REF,'Staging installation marker');
const share=new URL(env.BM_PREVIEW_SHARE_URL);check(share.origin===origin,'Preview access scope');
const access=await fetch(share,{redirect:'manual'}),cookie=access.headers.getSetCookie().find(x=>x.startsWith('_vercel_jwt='))?.split(';')[0];
const page=await fetch(origin,{headers:{Cookie:cookie}}),html=await page.text();
const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>new URL(m[1],origin)).filter(u=>u.origin===origin);
check(page.ok&&scripts.length>0,'Preview application bundle available');
let bundle='';for(const url of scripts)bundle+=await (await fetch(url,{headers:{Cookie:cookie}})).text();
for(const name of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])if(env[name])check(!bundle.includes(env[name]),`${name} absent from frontend bundle`);
const prepared=[];
for(const [index,prefix] of ['OTHER','USER'].entries()) {
 const email=env[`BM_TEST_${prefix}_EMAIL`];if(!email?.endsWith('@example.invalid'))throw Error('Synthetic account required');
 const authClient=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 const auth=checked(await authClient.auth.signInWithPassword({email,password:env[`BM_TEST_${prefix}_PASSWORD`]}));
 check(auth.user.user_metadata?.bm_staging_fixture===true,'Synthetic account marker');
 async function api(action,data={}){const r=await fetch(origin+'/api/buyermatch',{method:'POST',headers:{Authorization:'Bearer '+auth.session.access_token,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action,...data})});return {status:r.status,body:await r.json()};}
 const plan=plans[index],availability=await api('plans');
 check(availability.status===200&&availability.body.checkoutMode==='test'&&availability.body.checkoutEnabled,'Test checkout enabled');
 check(availability.body.catalog.some(x=>x.version===plan.version&&x.amount===plan.amountCents&&x.currency==='usd'),`${plan.name}: runtime test-price/account mapping`);
 check(!availability.body.successFeesEnabled&&availability.body.deliveryMode==='test','Success fees/live delivery disabled');
 const before=checked(await db.from('bm_entitlements').select('*').eq('owner_id',auth.user.id));
 const key=randomUUID(),body={planVersion:plan.version,operationKey:key,priceId:'price_unauthorized',allowance:10000,ownerId:randomUUID()};
 const first=await api('checkout',body),retry=await api('checkout',body);
 check(first.status===200&&first.body.testMode===true&&first.body.url?.startsWith('https://checkout.stripe.com/'),`${plan.name}: test Checkout Session created`);
  check(retry.status===200&&retry.body.url===first.body.url,`${plan.name}: retry returns same Checkout Session`);
 const returned=await fetch(origin+'/app/buyermatch/plans?checkout=returned',{headers:{Cookie:cookie}});
 check(returned.ok,`${plan.name}: return URL loads without payment`);
 const after=checked(await db.from('bm_entitlements').select('*').eq('owner_id',auth.user.id));
 check(JSON.stringify(before)===JSON.stringify(after),`${plan.name}: checkout creation grants no entitlement`);
 const reservation=checked(await db.from('bm_checkouts').select('id,owner_id,product,plan_version,session_id,state').eq('owner_id',auth.user.id).eq('state','pending').eq('product','buyermatch').single());
 check(reservation.plan_version===plan.version&&reservation.owner_id===auth.user.id,`${plan.name}: browser price/allowance/owner overrides ignored`);
 const denied=await api('checkout',{planVersion:'unsupported-plan',operationKey:randomUUID()});
 check(denied.status>=400,'Unsupported plan rejected');
 prepared.push({prefix,plan:plan.version,ownerId:auth.user.id,checkoutId:reservation.id,sessionId:reservation.session_id,url:first.body.url});
}
mkdirSync('test-artifacts',{recursive:true});
writeFileSync('test-artifacts/stripe-checkouts-private.json',JSON.stringify(prepared,null,2));
writeFileSync('test-artifacts/stripe-preflight-report.json',JSON.stringify({origin,checks,paymentCompleted:false},null,2));
console.log(JSON.stringify({passed:checks.length,prepared:prepared.map(x=>x.plan),paymentCompleted:false,entitlementsUnchanged:true}));
