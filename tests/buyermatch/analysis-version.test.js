import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {ENGINE_VERSION,analyzeDeal} from '../../server/buyermatch/matching.js';
test('new analyses carry corrected engine version',()=>{
 assert.equal(ENGINE_VERSION,'1.0.2');
 assert.equal(analyzeDeal({state:'TX',city:'Austin',assetType:'sfh',price:1},[]).engineVersion,ENGINE_VERSION);
});
test('atomic queue guard blocks historical or missing versions before writes',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create table bm_distribution_requests(id uuid default gen_random_uuid(),owner_id uuid,deal_id uuid,operation_key uuid);
   create table fixture(private_result jsonb); insert into fixture values('{}');
   create function bm_queue_distribution(p_owner uuid,p_deal uuid,p_key uuid) returns jsonb language plpgsql as $$
   declare a record;request_id uuid;begin select * into a from fixture;
   insert into bm_distribution_requests(owner_id,deal_id,operation_key) values(p_owner,p_deal,p_key) returning id into request_id;
   return jsonb_build_object('requestId',request_id);end $$;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261018165041_buyermatch_analysis_version_guard.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261028025900_buyermatch_explicit_criteria_version.sql',import.meta.url),'utf8'));
  for(const version of [undefined,'1.0.0','1.0.1','future']) {
   await db.query('update fixture set private_result=$1',[{engineVersion:version,matches:[{eligible:true,unknown:['ARV formula']}]}]);
   await assert.rejects(db.query('select bm_queue_distribution(null,null,null)'),/Matching safety revalidation required/);
   assert.equal((await db.query('select count(*)::int n from bm_distribution_requests')).rows[0].n,0);
  }
  await db.query('update fixture set private_result=$1',[{engineVersion:ENGINE_VERSION}]);
  await db.query('select bm_queue_distribution(null,null,null)');
  assert.equal((await db.query('select count(*)::int n from bm_distribution_requests')).rows[0].n,1);
 } finally {await db.close();}
});
