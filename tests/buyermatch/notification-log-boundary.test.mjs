import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const source=await readFile('supabase/functions/notify-submission/index.ts','utf8');
const compiled=await build({stdin:{contents:source+'\nexport {writeLog};',loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'no-provider',setup(b){b.onResolve({filter:/^https:/},()=>({path:'supabase',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=(...args)=>globalThis.__notificationLogClient(...args);'}));}}]});
test('actual notification logger refuses anonymous fallback and preserves supported service RPC',async()=>{
 const previous=globalThis.__notificationLogClient,calls=[];let service=false;
 globalThis.__notificationLogClient=(url,key)=>{assert.equal(key,'SYNTHETIC_SERVICE');return {rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};};
 try{
 const module={exports:{}};new Function('module','exports','Deno',compiled.outputFiles[0].text)(module,module.exports,{serve(){},env:{get:name=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'SYNTHETIC_ANON',SUPABASE_SERVICE_ROLE_KEY:service?'SYNTHETIC_SERVICE':undefined})[name]}});
 const input={workspaceId:'synthetic',eventType:'synthetic',recipient:'synthetic@example.invalid',status:'skipped'};
 const denied=await module.exports.writeLog(input);assert.equal(denied.ok,false);assert.equal(calls.length,0);
 service=true;assert.equal((await module.exports.writeLog(input)).ok,true);assert.equal(calls[0].name,'insert_email_notification_log');
 }finally{if(previous===undefined)delete globalThis.__notificationLogClient;else globalThis.__notificationLogClient=previous;}
});
