import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBuyerRecord} from '../src/lib/buyerImport.js';
import {importedMandateFit} from '../src/lib/importedBuyerMatching.js';
import {matchBuyer} from '../server/buyermatch/matching.js';
const deal={property:{state:'TX',city:'Austin',type:'SFH'},pricing:{askingPrice:100000,arv:300000,rehab:30000}};
const reviewed=fields=>({...parseBuyerRecord({Email:'restrictions@example.invalid',Markets:'Austin, TX','Property Criteria':'SFH','Price / Formula':'65% ARV minus repairs',...fields}),status:'Active',verificationStatus:'Verified Buyer',consentStatus:'granted',blastEligible:true});
for(const text of ['no flood zones','no busy roads','no structural damage','cosmetic rehab only','no full kitchen remodels or gut jobs','seller financing required','cash flowing only','avoid floodplains','without foundation damage','heavy rehab if numbers work']){
 test(`unsupported restriction fails closed: ${text}`,()=>{
   const row=reviewed({'Property Criteria':`SFH; ${text}`});
   assert.equal(importedMandateFit(deal,row).score,0);
   assert(importedMandateFit(deal,row).missing.includes('Unsupported restrictions require review'));
   assert.equal(row.originalCriteria,`SFH; ${text}`);
 });
}
test('notes and existing records without review flag cannot bypass restrictions',()=>{
 const row=reviewed({Notes:'  No busy roads\nexact original  '});delete row.buyingMandates[0].requiresReview;
 assert.equal(importedMandateFit(deal,row).score,0);assert.equal(row.originalNotes,'  No busy roads\nexact original  ');
});
test('formula deduction alone is supported and still enforced',()=>{
 assert.equal(importedMandateFit(deal,reviewed({})).score,100);
 assert.equal(importedMandateFit({...deal,pricing:{...deal.pricing,askingPrice:165001}},reviewed({})).score,0);
});
test('separate synthetic mandates never combine one market with another budget',()=>{
 const row=reviewed({'Buying Mandates':'Mandate: Texas; Markets Raw: Austin, TX; Property Criteria Raw: SFH; Price / Formula Raw: 65% ARV minus repairs || Mandate: Florida; Markets Raw: Miami, FL; Property Criteria Raw: Multifamily; Price / Formula Raw: up to $2M'});
 row.buyingMandates=row.buyingMandates.map(m=>({...m,requiresReview:false}));
 assert.equal(importedMandateFit(deal,row).score,100);
 assert.equal(importedMandateFit({...deal,pricing:{...deal.pricing,askingPrice:500000}},row).score,0);
});
for(const [field,dealField] of [['excludedConditions','condition'],['excludedOccupancies','occupancy'],['financingPreferences','financing']])test(`network ${field} needs known deal fact`,()=>{
 const buyer={id:'synthetic',status:'active',markets:[{state:'TX',city:'Austin'}],assetTypes:['sfh'],maxPrice:200000,[field]:['restricted'],criteriaVerifiedAt:new Date().toISOString()};
 const d={state:'TX',city:'Austin',assetType:'sfh',price:100000};
 assert.equal(matchBuyer(d,buyer).eligible,false);
 assert.equal(matchBuyer({...d,[dealField]:field.startsWith('excluded')?'allowed':'restricted'},buyer).eligible,true);
});
