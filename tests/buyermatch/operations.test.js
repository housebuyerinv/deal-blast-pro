import test from 'node:test';
import assert from 'node:assert/strict';
import { networkOperations, confirmedNetworkOwner, activityPage } from '../../server/buyermatch/operations.js';
const allowed = email => email === 'owner@example.invalid';
test('network owner requires confirmed, nonanonymous provider identity',()=>{
  const user={email:'owner@example.invalid',email_confirmed_at:'2026-01-01'};
  assert.equal(confirmedNetworkOwner(user,allowed),true);
  for(const patch of [{email_confirmed_at:null},{email_confirmed_at:'invalid'},{is_anonymous:true},{email:'foreign@example.invalid'}]) assert.equal(confirmedNetworkOwner({...user,...patch},allowed),false);
  assert.equal(confirmedNetworkOwner(null,allowed),false);
});
test('pagination fails closed for coercion, decimals, negatives and excessive pages',()=>{
  for(const page of ['',null,'01',1.5,-1,100001,Infinity,{},'1e2']) assert.throws(()=>activityPage(page),/Invalid page/);
  assert.equal(activityPage(undefined),0);assert.equal(activityPage('2'),2);
});
function fixture(fail=false) {
  const calls=[];
  const db={from(table){
    calls.push({table});const call=calls.at(-1);
    return {select(fields){call.fields=fields;return this;},eq(key,value){call.eq=[key,value];return this;},not(...args){call.not=args;return this;},order(){return this;},range(...args){call.range=args;return this;},then(resolve){resolve({error:fail?{message:'SECRET ERROR'}:null,data:Array.from({length:26},(_,index)=>({id:String(index),owner_id:'synthetic',product:'buyermatch',kind:'analyzed',state:'failed',last_error_code:'PRIVATE PROVIDER PAYLOAD',secret:'NEVER EXPOSE',subscription_id:'PRIVATE-SUBSCRIPTION'}))});}};
  }};return {db,calls};
}
test('ordinary workspace admin is denied before database access',async()=>{
  const {db,calls}=fixture();await assert.rejects(networkOperations(db,{isOwnerAdmin:false}),/Network administrator/);assert.equal(calls.length,0);
});
test('owner operations are paginated and explicitly projected without private payloads',async()=>{
  const {db,calls}=fixture();const result=await networkOperations(db,{isOwnerAdmin:true},1);
  assert.equal(result.hasMore,true);assert.equal(result.audit.length,25);
  assert.equal(result.deliveryErrors[0].last_error_code,'unclassified_failure');
  for(const call of calls){assert.deepEqual(call.range,[25,50]);assert.equal(call.fields.includes('*'),false);}
  assert.deepEqual(calls.slice(0,2).map(call=>call.eq),[['product','buyermatch'],['product','buyermatch']]);
  assert.equal(calls.some(call=>call.table==='stripe_event_receipts'),false);
  for(const secret of ['PRIVATE','NEVER EXPOSE','subscription_id']) assert.equal(JSON.stringify(result).includes(secret),false);
});
test('provider errors are replaced with a fixed, non-sensitive failure',async()=>{
  await assert.rejects(networkOperations(fixture(true).db,{isOwnerAdmin:true}),error=>error.message==='Operating records unavailable');
});
