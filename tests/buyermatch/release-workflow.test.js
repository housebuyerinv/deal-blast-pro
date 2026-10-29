// Local-only composed workflow; provider callback, Auth and delivery are not hosted.
import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyzeDeal} from '../../server/buyermatch/matching.js';
import {safeAnalysis} from '../../server/buyermatch/security.js';
import {testProvider} from '../../server/buyermatch/provider.js';
import {responseToken,responseOperationKey} from '../../server/buyermatch/tokens.js';
import {requireSubscriberAgreements} from '../../server/buyermatch/onboarding.js';
test('workflow delta: analysis-to-mock-invitation keeps identities private and makes no external call',async()=>{
 const env={BM_ENVIRONMENT:'staging',BM_STAGING_PROJECT_REF:'fixture',SUPABASE_URL:'https://fixture.supabase.co',BM_APP_ORIGIN:'https://fixture.vercel.app',BM_DELIVERY_MODE:'mock',BM_RESPONSE_SECRET:'dummy-only-'.repeat(4)};
 const property={address:'123 QA Street',city:'Memphis',state:'TN',zip:'38111',assetType:'sfh',price:60000};
 const buyers=Array.from({length:6},(_,i)=>({id:'private-buyer-'+i,email:'private'+i+'@example.invalid',status:'active',markets:[{state:'TN'}],assetTypes:['sfh'],maxPrice:100000}));
 const result=analyzeDeal(property,buyers,new Date('2026-10-23'));
 assert.equal(result.totalMatches,6);const publicResult=JSON.stringify(safeAnalysis(result));
 for(const buyer of buyers){assert.equal(publicResult.includes(buyer.id),false);assert.equal(publicResult.includes(buyer.email),false);}
 assert.equal(publicResult.includes('buyerId'),false);
 const token=responseToken('owned-exposure',env);const provider=testProvider(env,()=>{throw Error('External network forbidden');});
 const invitation=await provider.send({property,idempotencyKey:'owned-exposure',synthetic:true,responseUrl:env.BM_APP_ORIGIN+'/buyer-response#'+token});
 assert.equal(invitation.id,'mock-owned-exposure');
 assert.equal(responseOperationKey({token,kind:'interested'}),responseOperationKey({token,kind:'interested',terms:'ignored'}));
 await assert.rejects(provider.send({property,idempotencyKey:'foreign',synthetic:false,responseUrl:env.BM_APP_ORIGIN+'/buyer-response#'+token}));
});
test('workflow delta: another owners matching document acceptance cannot satisfy consent',async()=>{
 const docs=['platform_terms','privacy'].map((kind,i)=>({id:'doc'+i,kind,version:'review-v1',content:kind,document_hash:createHash('sha256').update(kind).digest('hex')}));
 const rows=docs.map(d=>({owner_id:'other',document_id:d.id,document_hash:d.document_hash,version:d.version,deal_id:null}));
 const db={from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},is(k,v){filters.push([k,v]);return this;},in(){return this;},then(resolve){return Promise.resolve({data:table==='bm_documents'?docs:rows.filter(r=>filters.every(([k,v])=>r[k]===v))}).then(resolve);}};}};
 await assert.rejects(requireSubscriberAgreements(db,'owner'),/Review and sign/);
 rows.push(...docs.map(d=>({owner_id:'owner',document_id:d.id,document_hash:d.document_hash,version:d.version,deal_id:'other-deal'})));
 await assert.rejects(requireSubscriberAgreements(db,'owner'),/Review and sign/);
 rows.push(...docs.map(d=>({owner_id:'owner',document_id:d.id,document_hash:d.document_hash,version:d.version,deal_id:null})));
 await requireSubscriberAgreements(db,'owner');
});
