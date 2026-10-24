import test from 'node:test';
import assert from 'node:assert/strict';
import {portalConsentEvidence} from '../../server/buyermatch/portal-consent.js';
const id='f77da31c-7a89-4bf8-ac60-bbb02ed79fa0';
function fixture(){
 const row={id,status:'pending_review',buyer_data:{email:'buyer@example.invalid',consent:{version:'buyer-intake-consent-v1',accuracy:true,dealInvitations:true,recordedAt:'2026-10-23T12:00:00Z'}}};
 const result={data:row,error:null},calls=[];
 const db={from(table){calls.push(table);return{select(){return this},eq(k,v){calls.push([k,v]);return this},maybeSingle:async()=>result}}};
 return{row,result,calls,run:(source=id,email='buyer@example.invalid')=>portalConsentEvidence(db,source,email,Date.parse('2026-10-23T13:00:00Z'))};
}
test('review activation uses the saved consent for the exact buyer, with no identity disclosure or writes',async()=>{
 const f=fixture(),r=JSON.parse(await f.run());assert.equal(r.dealInvitations,true);assert.equal(r.submissionId,id);
 assert.ok(!JSON.stringify(r).includes('@'));assert.deepEqual(f.calls,['buyer_portal_submissions',['id',id]]);
});
for(const [name,mutate] of Object.entries({missing:f=>{f.result.data=null},foreign:f=>{f.row.buyer_data.email='foreign@example.invalid'},noConsent:f=>{delete f.row.buyer_data.consent},accuracyOnly:f=>{f.row.buyer_data.consent.dealInvitations=false},forgedString:f=>{f.row.buyer_data.consent.dealInvitations='true'},oldVersion:f=>{f.row.buyer_data.consent.version='old'},missingTime:f=>{delete f.row.buyer_data.consent.recordedAt},future:f=>{f.row.buyer_data.consent.recordedAt='2099-01-01'},rejected:f=>{f.row.status='rejected'}}))test(`portal activation rejects ${name}`,async()=>{
 const f=fixture();mutate(f);await assert.rejects(f.run(),e=>e.status===409);
});
test('missing source and failed reads cannot create an activation',async()=>{
 const f=fixture();await assert.rejects(f.run(''),e=>e.status===409);assert.equal(f.calls.length,0);
 f.result.error={message:'PRIVATE_DATABASE_DETAIL'};await assert.rejects(f.run(),e=>e.status===503&&!e.message.includes('PRIVATE'));
});
