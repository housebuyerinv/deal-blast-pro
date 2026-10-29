import test from 'node:test';import assert from 'node:assert/strict';import {setupLocalAcceptance} from '../../scripts/setup-local-buyermatch-acceptance.mjs';
const env={BM_LOCAL_SYNTHETIC:'true',NODE_ENV:'test',BM_ENVIRONMENT:'staging',BM_STAGING_PROJECT_REF:'buyermatch-local-synthetic',SUPABASE_URL:'http://127.0.0.1:55321',VITE_SUPABASE_URL:'http://127.0.0.1:55321',BM_APP_ORIGIN:'http://127.0.0.1:5189',DBP_REGISTRATION_PAUSED:'true',BM_CHECKOUT_ENABLED:'false',BM_DELIVERY_MODE:'disabled',BM_LIVE_DELIVERY_ENABLED:'false',BM_LIVE_BILLING_ENABLED:'false',BM_LOCAL_DATABASE_PASSWORD:'SYNTHETIC_LOCAL_ONLY'};
test('setup binds only literal local DB and rejects nonempty databases without DDL',async()=>{
 const calls=[];await assert.rejects(setupLocalAcceptance(env,options=>{assert.equal(options.host,'127.0.0.1');assert.equal(options.port,55322);assert.equal(options.ssl,false);return {connect:async()=>{},end:async()=>{},query:async sql=>{calls.push(sql);return {rows:[{public_tables:31,service_roles:3}]};}};}),/SETUP_FAILED/);
 assert.equal(calls.some(sql=>sql.startsWith('create')),false);assert.equal(calls.at(-1),'rollback');
 await assert.rejects(setupLocalAcceptance({...env,SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co'},()=>assert.fail('must not create a client')));
});
test('fresh local bootstrap uses actual source inventory and transactionally rolls back a failed source',async()=>{
 const calls=[];const client=fail=>({connect:async()=>{},end:async()=>{},query:async(sql,args)=>{calls.push({sql,args});if(fail&&sql.includes('create table public.bm_deals'))throw Error('SYNTHETIC_FAILURE');return {rows:[{public_tables:0,service_roles:3}]};}});
 const success=await setupLocalAcceptance(env,()=>client(false));assert.ok(success.schemaSources>=76);assert.equal(calls.at(-1).sql,'commit');
 assert.equal(calls.filter(c=>c.sql.startsWith('insert into public.dbp_staging_migrations')).length,success.schemaSources);
 calls.length=0;await assert.rejects(setupLocalAcceptance(env,()=>client(true)),/SETUP_FAILED/);assert.equal(calls.at(-1).sql,'rollback');
});
