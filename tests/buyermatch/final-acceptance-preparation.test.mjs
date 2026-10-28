import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {prepareS2Migrations,PENDING_MIGRATIONS,S2_PROJECT,assessAcceptanceEvidence} from '../../scripts/testing/buyermatch-final-acceptance.mjs';
import {verifyRecoveryCoverage,REQUIRED_COVERAGE} from '../../scripts/testing/recovery-coverage.mjs';
const metadata=JSON.parse(readFileSync('docs/release-evidence/2026-10-26/supabase-migration-readiness.json'));
const input=()=>({project:S2_PROJECT,history:structuredClone(metadata.metadata.migration_history),sources:PENDING_MIGRATIONS.map(name=>({name,sql:readFileSync('supabase/migrations/'+name,'utf8')}))});
test('historical S2 metadata produces exact four-source order without replaying recorded intake',()=>{
 const result=prepareS2Migrations(input());assert.deepEqual(result.pending.map(r=>r.name),PENDING_MIGRATIONS);assert.equal(result.replayIntake,false);assert.equal(result.executionAllowed,false);
});
test('wrong project, missing intake, duplicate history and unverified recorded source fail closed',()=>{
 for(const mutate of [x=>x.project='production',x=>x.history=x.history.filter(r=>r.name!=='buyermatch_private_buyer_intake'),x=>x.history.push(x.history[0]),x=>x.sources.push(x.sources[0]),x=>x.history.push({version:PENDING_MIGRATIONS[0].slice(0,14),name:'unverified'})]){const x=input();mutate(x);assert.throws(()=>prepareS2Migrations(x));}
});
test('local or historical passes never become current hosted verification or launch approval',()=>{
 for(const origin of ['LOCAL','HISTORICAL_HOSTED']){const result=assessAcceptanceEvidence([{id:'identity',status:'PASS',origin,source:'a'.repeat(40),independentlyVerified:true}]);assert.equal(result.cases[0].status,'NOT_VERIFIED');assert.equal(result.allCasesReported,false);assert.equal(result.launchReady,false);}
 assert.throws(()=>assessAcceptanceEvidence([{id:'identity'},{id:'identity'}]),/AMBIGUOUS/);
});
const fixture=()=>{const files=new Map();const manifest={version:1,files:REQUIRED_COVERAGE.map(coverage=>{const path=coverage+'/synthetic.bin',data=Buffer.from('SYNTHETIC ONLY '+coverage);files.set(path,data);return {path,coverage,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};})};return {files,manifest};};
test('coverage independently rereads all bytes and does not fabricate encryption, isolation or restore proof',()=>{
 const {files,manifest}=fixture();const result=verifyRecoveryCoverage(manifest,path=>files.get(path));assert.equal(result.files,8);assert.equal(result.coverageComplete,true);
 for(const key of ['archiveEncryptionVerified','networkIsolationVerified','restoreVerified','keyCustodyVerified','productionReady'])assert.equal(result[key],false);
});
test('missing coverage, corrupt bytes, traversal, drive paths and case collisions are rejected',()=>{
 for(const mutate of [x=>x.manifest.files.pop(),x=>x.files.set(x.manifest.files[0].path,Buffer.from('CORRUPT')),x=>x.manifest.files[0].path='../escape',x=>x.manifest.files[0].path='C:/outside',x=>x.manifest.files.push({...x.manifest.files[0],path:x.manifest.files[0].path.toUpperCase()})]){const x=fixture();mutate(x);assert.throws(()=>verifyRecoveryCoverage(x.manifest,path=>x.files.get(path)));}
});
