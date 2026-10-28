import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const local={BM_LOCAL_SYNTHETIC:'true',NODE_ENV:'test',BM_ENVIRONMENT:'staging',BM_STAGING_PROJECT_REF:'buyermatch-local-synthetic',SUPABASE_URL:'http://127.0.0.1:55321',VITE_SUPABASE_URL:'http://127.0.0.1:55321',BM_APP_ORIGIN:'http://127.0.0.1:5189',DBP_REGISTRATION_PAUSED:'true',BM_CHECKOUT_ENABLED:'false',BM_DELIVERY_MODE:'disabled',BM_LIVE_DELIVERY_ENABLED:'false',BM_LIVE_BILLING_ENABLED:'false',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_LOCAL_ONLY'};
test('actual admin-client factory rejects mixed S2/Production/local configurations before client creation',async()=>{
 const previous=globalThis.__isolatedClientCalls;globalThis.__isolatedClientCalls=[];
 try{for(const patch of [{},{SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co',VITE_SUPABASE_URL:'https://qxhhlprentrufobpcgna.supabase.co'},{VITE_SUPABASE_URL:'https://aigvnbxiydbzzqbetlhl.supabase.co'},{NODE_ENV:'production'},{VERCEL_ENV:'preview'},{STRIPE_SECRET_KEY:'SYNTHETIC_FORBIDDEN'}]){
  globalThis.__isolatedClientCalls=[];
  const result=await build({entryPoints:['api/_accountAuth.ts'],bundle:true,write:false,platform:'node',format:'cjs',define:{'process.env':JSON.stringify({...local,...patch})},plugins:[{name:'no-network-client',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture',namespace:'local'}));b.onLoad({filter:/.*/,namespace:'local'},()=>({contents:'export const createClient=(...args)=>{globalThis.__isolatedClientCalls.push(args);return {local:true}};'}));}}]});
  const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
  if(Object.keys(patch).length){assert.throws(()=>module.exports.getSupabaseAdminClient(),/Isolated/);assert.equal(globalThis.__isolatedClientCalls.length,0);}
  else{assert.equal(module.exports.getSupabaseAdminClient().local,true);assert.equal(globalThis.__isolatedClientCalls[0][0],local.SUPABASE_URL);}
 }}finally{if(previous===undefined)delete globalThis.__isolatedClientCalls;else globalThis.__isolatedClientCalls=previous;}
});
