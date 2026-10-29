import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const bundle=async(options)=>{
 const result=await build({bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',...options});
 const module={exports:{}};
 new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 return module.exports;
};
const plugins=[{name:'non-delivering-local-dependencies',setup(b){
 b.onResolve({filter:/buyerProofStorage$|buyerPortalSubmissionStorage$|store\/useAppStore$|layout\/PublicNav$|layout\/PublicFooter$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('useAppStore')?
  "export const useAppStore=s=>s({trial:{plan:'Pro',billingStatus:'Past Due'}});":a.path.endsWith('buyerProofStorage')?
  "export async function uploadBuyerProofBatch(){throw Error('No fixture upload')} ":a.path.endsWith('buyerPortalSubmissionStorage')?
  "export async function createBuyerPortalSubmission(){throw Error('No SSR mutation')} ":"export default function Stub(){return null}"}));
}}];
const {render}=await bundle({stdin:{contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {StaticRouter} from 'react-router-dom/server';import Page from './src/pages/public/BuyerPortal';export const render=product=>renderToStaticMarkup(<StaticRouter location='/buyermatch/buyers'><Page product={product}/></StaticRouter>);",resolveDir:process.cwd(),loader:'tsx'},plugins});
test('standalone buyer intake is discoverable and independent of CRM arrears',()=>{
 const html=render('buyermatch');
 assert.match(html,/Join the BuyerMatch buyer network/);assert.match(html,/without purchasing a CRM/);
 assert.match(html,/href="\/buyermatch"/);assert.doesNotMatch(html,/Buyer Signup Paused/);
 assert.match(html,/Submit Buyer Verification/);assert.match(html,/does not automatically verify you/);
});
test('legacy DBP intake retains its existing billing pause',()=>{
 const html=render('crm');assert.match(html,/Buyer Signup Paused/);assert.match(html,/disabled=""/);
});
test('buyer accuracy and optional invitation consent are distinct, unchecked controls',()=>{
 const html=render('buyermatch');
 assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
 assert.doesNotMatch(html,/checked=""/);assert.match(html,/This is optional/);
 assert.match(html,/private deal invitations/);assert.match(html,/secure signed-in upload/);
});
let rpcCalls=[],notifications=0,mode='ok';
globalThis.__buyerIntake={rpc:async(name,args)=>{rpcCalls.push({name,args});return mode==='ok'?{data:{id:'receipt',recorded:true},error:null}:mode==='malformed'?{data:{id:'receipt'},error:null}:{data:null,error:{message:'PRIVATE_DATABASE_DETAIL',code:mode}}}};
globalThis.__buyerNotify=async()=>{notifications++;return{ok:true}};
const {createBuyerPortalSubmission,listPendingBuyerPortalSubmissions,countPendingBuyerPortalSubmissions}=await bundle({entryPoints:['src/lib/buyerPortalSubmissionStorage.ts'],plugins:[{name:'receipt-client',setup(b){
 b.onResolve({filter:/^\.\/supabaseClient$|^\.\/submissionNotifications$/},a=>({path:a.path,namespace:'client'}));
 b.onLoad({filter:/.*/,namespace:'client'},a=>({contents:a.path.endsWith('supabaseClient')?'export const supabase=globalThis.__buyerIntake;':'export const notifySubmission=globalThis.__buyerNotify;'}));
}}]});
test('standalone intake uses receipt RPC/key and never requests notification or a private row read',async()=>{
 rpcCalls=[];notifications=0;mode='ok';const r=await createBuyerPortalSubmission({name:'Synthetic'}, {operationKey:'dummy-key',notify:false});
 assert.equal(r.id,'receipt');assert.equal(notifications,0);assert.equal(rpcCalls.length,1);
 assert.equal(rpcCalls[0].name,'bm_submit_buyer_intake');assert.equal(rpcCalls[0].args.p_key,'dummy-key');
});
test('missing migration or malformed receipt fails without fallback/notification/private errors',async()=>{
 for(mode of ['error','malformed']){rpcCalls=[];notifications=0;
  await assert.rejects(createBuyerPortalSubmission({}, {operationKey:'dummy-key',notify:false}),e=>!e.message.includes('PRIVATE'));
  assert.equal(rpcCalls.length,1);assert.equal(notifications,0);
 }
});

test('contained or not-yet-installed intake reports an outage without a fallback or confirmed-success claim',async()=>{
 for(mode of ['42501','42883','PGRST202']){
  rpcCalls=[];notifications=0;
  await assert.rejects(createBuyerPortalSubmission({}, {operationKey:'dummy-key',notify:false}),e=>/temporarily unavailable/.test(e.message)&&/No submission was confirmed/.test(e.message)&&!e.message.includes('PRIVATE'));
  assert.equal(rpcCalls.length,1);assert.equal(notifications,0);
 }
});

test('contained owner review and queue counts report preserved submissions without private provider details',async()=>{
 const result={data:null,error:{code:'42501',message:'PRIVATE_DATABASE_DETAIL'}};
 const blocked={select(){return this},in(){return this},order(){return Promise.resolve(result)},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
 globalThis.__buyerIntake.from=()=>blocked;
 for(const read of [listPendingBuyerPortalSubmissions,countPendingBuyerPortalSubmissions]){
  await assert.rejects(read(),e=>/temporarily unavailable/.test(e.message)&&/preserved/.test(e.message)&&!e.message.includes('PRIVATE'));
 }
});
const {hasRecordedBuyerInvitationConsent}=await bundle({entryPoints:['src/lib/buyerInvitationConsent.ts']});
test('CRM approval does not imply blast eligibility without explicit recorded invitation consent',()=>{
 assert.equal(hasRecordedBuyerInvitationConsent({portalForm:{consent:true}}),false);
 const consent={version:'buyer-intake-consent-v1',accuracy:true,dealInvitations:true,recordedAt:'2026-10-23T12:00:00Z'};
 assert.equal(hasRecordedBuyerInvitationConsent({consent},Date.parse('2026-10-23T13:00:00Z')),true);
 for(const change of [{dealInvitations:false},{dealInvitations:'true'},{version:'old'},{recordedAt:'invalid'}])assert.equal(hasRecordedBuyerInvitationConsent({consent:{...consent,...change}}),false);
});
globalThis.__buyerRoute={owner:'synthetic-a',path:'/app/buyermatch/deals/one'};
const {default: Workspace}=await bundle({entryPoints:['src/pages/app/BuyerMatch.tsx'],plugins:[{name:'isolated-workspace',setup(b){
 b.onResolve({filter:/^react-router-dom$|store\/useAppStore$|lib\/supabase$/},a=>({path:a.path,namespace:'scope'}));
 b.onLoad({filter:/.*/,namespace:'scope'},a=>({contents:a.path==='react-router-dom'?
 "export const useLocation=()=>({pathname:globalThis.__buyerRoute.path});export const useParams=()=>({});export const useNavigate=()=>()=>{};export function Link(){return null};export const NavLink=Link":a.path.endsWith('useAppStore')?
 "export const useAppStore=s=>s({user:{id:globalThis.__buyerRoute.owner}});":'export const supabase={};'}));
}}]});
test('workspace state is remounted on account/deal change but stable within the same scope',()=>{
 const a=Workspace();assert.equal(a.key,Workspace().key);
 globalThis.__buyerRoute.path='/app/buyermatch/deals/two';const b=Workspace();assert.notEqual(a.key,b.key);
 globalThis.__buyerRoute.owner='synthetic-b';const c=Workspace();assert.notEqual(b.key,c.key);
 assert.equal(a.type,b.type);assert.equal(b.type,c.type);
});
test.after(()=>{delete globalThis.__buyerIntake;delete globalThis.__buyerNotify;delete globalThis.__buyerRoute});
