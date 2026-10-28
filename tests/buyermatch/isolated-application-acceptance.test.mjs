import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {createIsolatedBuyerMatch,assertLocalAcceptanceTarget,assertIsolatedDatabase,LOCAL_ACCEPTANCE} from '../../scripts/testing/isolated-buyermatch-fixture.mjs';
import {assertStaging,stagingOrigin} from '../../server/buyermatch/staging.js';
import {analyzeDeal} from '../../server/buyermatch/matching.js';import {safeAnalysis} from '../../server/buyermatch/security.js';
const local={BM_LOCAL_SYNTHETIC:'true',NODE_ENV:'test',BM_ENVIRONMENT:'staging',BM_STAGING_PROJECT_REF:LOCAL_ACCEPTANCE.project,SUPABASE_URL:LOCAL_ACCEPTANCE.api,VITE_SUPABASE_URL:LOCAL_ACCEPTANCE.api,BM_APP_ORIGIN:LOCAL_ACCEPTANCE.app,DBP_REGISTRATION_PAUSED:'true',BM_CHECKOUT_ENABLED:'false',BM_DELIVERY_MODE:'disabled',BM_LIVE_DELIVERY_ENABLED:'false',BM_LIVE_BILLING_ENABLED:'false'};
test('explicit local profile is unavailable to hosted environments or remote endpoints',()=>{
 assert.equal(assertStaging(local),LOCAL_ACCEPTANCE.api);assert.equal(stagingOrigin(local),LOCAL_ACCEPTANCE.app);
 assert.equal(assertStaging({...local,DBP_REGISTRATION_PAUSED:'false',BM_LOCAL_SIGNUP_ALLOWED:'true',PUBLIC_APP_URL:LOCAL_ACCEPTANCE.app}),LOCAL_ACCEPTANCE.api);
 for(const patch of [{NODE_ENV:'production'},{VERCEL_ENV:'preview'},{VERCEL:'1'},{SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co'},{BM_STAGING_PROJECT_REF:'qxhhlprentrufobpcgna'},{BM_APP_ORIGIN:'https://evil.invalid'},{BM_CHECKOUT_ENABLED:'true'},{DBP_REGISTRATION_PAUSED:'false'},{STRIPE_SECRET_KEY:'SYNTHETIC_FORBIDDEN'},{RESEND_API_KEY:'SYNTHETIC_FORBIDDEN'}])assert.throws(()=>assertStaging({...local,...patch}),/Isolated/);
 assert.throws(()=>assertIsolatedDatabase({project:'qxhhlprentrufobpcgna'}));
 for(const api of ['https://qxhhlprentrufobpcgna.supabase.co','http://localhost:55321','http://2130706433:55321','http://127.0.0.1:55321/?target=remote','http://user@127.0.0.1:55321'])assert.throws(()=>assertLocalAcceptanceTarget({project:LOCAL_ACCEPTANCE.project,api}));
});
test('isolated real application/schema acceptance with no hosted clients',async t=>{
 const f=await createIsolatedBuyerMatch();try{
 assertIsolatedDatabase(f.db);
 await t.test('full fresh schema and six actors preserve separate Free CRM and commercial allowances',async()=>{
  assert.equal(f.metadata.originalDataImported,false);assert.equal(f.buyers.length,52);
  assert.deepEqual((await f.db.query("select allowance from bm_entitlements order by allowance")).rows.map(r=>r.allowance),[20,50]);
  assert.equal((await f.db.query("select count(*)::int n from workspace_plan_assignments where plan_name='Free'")).rows[0].n,4);
 });
 await t.test('actual matching and analysis commit enforce the hourly boundary without leaking identities',async()=>{
  const buyers=(await f.db.query('select id,status,criteria from bm_buyers')).rows.map(r=>({id:r.id,status:r.status,...r.criteria}));
  const analysis=analyzeDeal(f.property,buyers);assert.equal(analysis.totalMatches,52);
  const publicResult=safeAnalysis(analysis);assert.equal(JSON.stringify(publicResult).includes(f.buyers[0].id),false);
  for(let n=0;n<10;n++)await f.db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',[f.actors.pro.id,f.deals.pro,randomUUID(),analysis,publicResult,f.property]);
  await assert.rejects(f.db.query('select bm_commit_analysis($1,$2,$3,$4,$5,$6)',[f.actors.pro.id,f.deals.pro,randomUUID(),analysis,publicResult,f.property]),/Hourly/);
  assert.equal((await f.db.query('select count(*)::int n from bm_analyses')).rows[0].n,10);
 });
 await t.test('scoped buyer response replay and real history stay private to each buyer',async()=>{
  const args=[f.tokenHash,randomUUID(),'interested',null,'','staging'];
  await f.db.query('select bm_buyer_response_scoped($1,$2,$3,$4,$5,$6)',args);await f.db.query('select bm_buyer_response_scoped($1,$2,$3,$4,$5,$6)',args);
  const own=(await f.db.query('select bm_buyer_account_history($1,null,null) result',[f.actors.buyer.id])).rows[0].result;
  const other=(await f.db.query('select bm_buyer_account_history($1,null,null) result',[f.actors['other-buyer'].id])).rows[0].result;
  assert.equal(own.length,1);assert.equal(other.length,0);assert.match(JSON.stringify(own),/interested/);
  const activity=(await f.db.query('select bm_deal_activity($1,$2,0) result',[f.actors.pro.id,f.deals.pro])).rows[0].result;
  assert.equal(activity.summary.interests,1);assert.equal(activity.history.length,1);
  await assert.rejects(f.db.query('select bm_deal_activity($1,$2,0)',[f.actors.outsider.id,f.deals.pro]),/Deal not found/);
 });
 await t.test('private proof commit preserves bytes/checksum and rejects another buyer path',async()=>{
  assert.equal(createHash('sha256').update(f.proofBytes).digest('hex'),f.proof.sha256);
  await f.db.query('select bm_buyer_account_reserve_proof($1,$2,0,$3)',[f.actors.buyer.id,f.proof.id,f.proof]);
  await f.db.query("select bm_buyer_account_mutate($1,$2,0,'proof',$3)",[f.actors.buyer.id,f.proof.id,f.proof]);
  const foreign={...f.proof,id:randomUUID(),path:`${f.actors['other-buyer'].id}/${randomUUID()}`};
  await assert.rejects(f.db.query('select bm_buyer_account_reserve_proof($1,$2,1,$3)',[f.actors.buyer.id,foreign.id,foreign]));
  assert.equal((await f.db.query('select count(*)::int n from bm_buyer_proofs')).rows[0].n,1);
 });
 await t.test('criteria revision, consent preservation and unauthorized function execution fail closed',async()=>{
  const revision=(await f.db.query('select revision from bm_buyer_accounts where user_id=$1',[f.actors.buyer.id])).rows[0].revision;
  const payload={criteria:{markets:[{state:'TX'}],maxPrice:160000},consentVersion:'buyer-maintenance-v1',accurate:true,invitations:true};
  await f.db.query("select bm_buyer_account_mutate($1,$2,$3,'criteria',$4)",[f.actors.buyer.id,randomUUID(),revision,payload]);
  await assert.rejects(f.db.query("select bm_buyer_account_mutate($1,$2,$3,'criteria',$4)",[f.actors.buyer.id,randomUUID(),revision,payload]),/Profile changed/);
  await f.db.exec('set role authenticated');await assert.rejects(f.db.query('select bm_deal_activity($1,$2,0)',[f.actors.pro.id,f.deals.pro]),e=>e.code==='42501');await f.db.exec('reset role');
 });
 await t.test('actual owner proof review rejects ordinary admins and preserves immutable decisions',async()=>{
  await assert.rejects(f.db.query("select bm_buyer_proof_review($1,$2,'approved')",[f.actors.pro.id,f.proof.id]),/Owner review required/);
  // This in-memory Auth row uses the application's fixed public policy address.
  // It is not the real owner's identity/session and sends no verification email.
  await f.db.query("update auth.users set email='housebuyerinv@gmail.com' where id=$1",[f.actors.owner.id]);
  await f.db.query("select bm_buyer_proof_review($1,$2,'approved')",[f.actors.owner.id,f.proof.id]);
  await assert.rejects(f.db.query("select bm_buyer_proof_review($1,$2,'rejected')",[f.actors.owner.id,f.proof.id]),/immutable/);
  assert.equal((await f.db.query('select decision from bm_buyer_proof_reviews')).rows[0].decision,'approved');
 });
 await t.test('real billing SQL recognizes both synthetic tiers and duplicate events without Stripe calls',async()=>{
  for(const label of ['starter','pro']){
   const checkout=randomUUID(),price=`price_local_${label}`,sub=`sub_local_${label}`,event=`evt_local_${label}`;
   await f.db.query('update bm_plans set stripe_price_id=$1,approved=true where version=$2',[price,`buyermatch-${label}-v1`]);
   await f.db.query("insert into bm_checkouts(id,owner_id,product,plan_version,operation_key,email,session_id,state) values($1,$2,'buyermatch',$3,$4,$5,$6,'completed')",[checkout,f.actors[label].id,`buyermatch-${label}-v1`,randomUUID(),f.actors[label].email,`cs_local_${label}`]);
   const args=[checkout,event,Date.now(),f.actors[label].id,'buyermatch',price,sub,'active','2026-01-01','2099-01-01'];
   await f.db.query('select bm_apply_test_billing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);await f.db.query('select bm_apply_test_billing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);
  }
  assert.equal((await f.db.query('select count(*)::int n from bm_billing_events')).rows[0].n,2);
 });
 }finally{await f.close();}
});
test('two synthetic key domains cannot decrypt or identity-match each other',async()=>{
 const one=await createIsolatedBuyerMatch(),two=await createIsolatedBuyerMatch();try{
  const cipher=(await one.db.query('select identity_ciphertext from bm_buyers limit 1')).rows[0].identity_ciphertext;
  assert.match(one.decryptSynthetic(cipher).email,/@example.invalid$/);assert.throws(()=>two.decryptSynthetic(cipher));
  assert.notEqual(one.syntheticHash('fixture@example.invalid'),two.syntheticHash('fixture@example.invalid'));
 }finally{await one.close();await two.close();}
});
