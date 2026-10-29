import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

// The actual component + receipt client run in memory; providers/toasts are replaced.
// This does not emulate browser layout, native validation or an accessibility tree.
const fixture={calls:[],toasts:[],focused:[],billing:'Paid Active',rpc:null,upload:null};
globalThis.__intakeInteraction=fixture;
const built=await build({entryPoints:['src/pages/public/BuyerPortal.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','react-router-dom'],plugins:[{name:'no-provider-access',setup(b){
 b.onResolve({filter:/buyerProofStorage$|supabaseClient$|submissionNotifications$|store\/useAppStore$|layout\/PublicNav$|layout\/PublicFooter$|^sonner$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='sonner'?
  "export const toast={error:m=>globalThis.__intakeInteraction.toasts.push(m),success:m=>globalThis.__intakeInteraction.toasts.push(m)};":a.path.endsWith('useAppStore')?
  "export const useAppStore=s=>s({trial:{plan:'Pro',billingStatus:globalThis.__intakeInteraction.billing}});":a.path.endsWith('buyerProofStorage')?
  "export const uploadBuyerProofBatch=(...args)=>globalThis.__intakeInteraction.upload(...args);":a.path.endsWith('supabaseClient')?
  "export const supabase={rpc:async(name,args)=>{const f=globalThis.__intakeInteraction;f.calls.push({name,args});return f.rpc(name,args)}};":a.path.endsWith('submissionNotifications')?
  "export function notifySubmission(){throw Error('Unexpected delivery in UI test')} ":"export default function Stub(){return null}"}));
}}]});
const module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const Page=module.exports.default;
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
function mount(product='buyermatch'){
 fixture.calls=[];fixture.toasts=[];fixture.focused=[];fixture.billing='Paid Active';
 fixture.rpc=async()=>({data:{id:'synthetic-receipt',recorded:true},error:null});
 fixture.upload=async()=>({uploaded:[],failedCount:0});
 let view;
 act(()=>{view=create(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Page,{product})),{createNodeMock:element=>({focus(){fixture.focused.push(element.type)}})});});
 return view;
}
function control(view,label){const match=view.root.findAllByType('label').find(n=>text(n)===label);assert.ok(match,`label ${label}`);return view.root.findByProps({id:match.props.htmlFor});}
function change(view,label,value){act(()=>control(view,label).props.onChange({target:{value}}));}
function chip(view,group,value){act(()=>view.root.findByProps({role:'group','aria-label':group}).findAllByType('button').find(n=>text(n)===value).props.onClick());}
function valid(view){
 for(const [label,value] of [['Full Name *','Synthetic Buyer'],['Email *','buyer@example.invalid'],['Phone *','555-0100'],['Company / Entity *','Synthetic S2']])change(view,label,value);
 chip(view,'Buyer types','Cash Buyer');chip(view,'Target markets','AL');chip(view,'Asset types','SFH');
 act(()=>view.root.findAllByType('input').find(n=>n.props.type==='checkbox'&&n.props.required).props.onChange({target:{checked:true}}));
}
const submit=view=>view.root.findByType('form').props.onSubmit({preventDefault(){}});
const jsonText=view=>JSON.stringify(view.toJSON());

test('all visible form controls have associated labels; chips expose selected state and named groups',()=>{
 const view=mount();try{
  for(const group of ['Buyer types','Target markets','Asset types','Exit strategies'])chip(view,group,'Other');
  change(view,'Document Type','Other');
  const controls=view.root.findAll(n=>['input','select','textarea'].includes(n.type));
  const labels=view.root.findAllByType('label');
  const ids=controls.map(n=>n.props.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  for(const n of controls)assert.ok(n.parent.type==='label'||(n.props.id&&labels.some(l=>l.props.htmlFor===n.props.id)),`unlabelled ${n.type}`);
  for(const group of ['Buyer types','Target markets','Asset types','Exit strategies'])assert.equal(view.root.findByProps({role:'group','aria-label':group}).findAllByType('button').find(n=>text(n)==='Other').props['aria-pressed'],true);
  assert.ok(view.root.findAllByType('div').some(n=>/grid-cols-1 md:grid-cols-/.test(n.props.className??'')));
 }finally{act(()=>view.unmount());}
});
test('confirmed receipt is a support reference, not a public lookup/edit link or live approval claim',async()=>{
 const view=mount();try{
  valid(view);await act(async()=>submit(view));
  assert.match(jsonText(view),/synthetic-receipt/);
  assert.match(jsonText(view),/not a live approval-status lookup/);
  const links=view.root.findAllByType('a').map(n=>n.props.href);
  assert(links.includes('/buyermatch/buyers/help'));
  assert(!links.some(url=>String(url).includes('synthetic-receipt')));
  assert.equal(fixture.calls.length,1);
 }finally{act(()=>view.unmount());}
});

test('validation announces a focusable summary without a request and leaves invitation consent optional',async()=>{
 const view=mount();try{
  await act(async()=>submit(view));
  const alert=view.root.findByProps({role:'alert'});assert.equal(alert.props.tabIndex,-1);assert.match(text(alert),/Buyer name is required/);
  assert.equal(fixture.calls.length,0);assert.ok(fixture.focused.includes('div'));
  const checks=view.root.findAllByType('input').filter(n=>n.props.type==='checkbox');
  assert.equal(checks.length,2);assert.equal(checks[1].props.checked,false);assert.equal(checks[1].props.required,undefined);
 }finally{act(()=>view.unmount());}
});

test('invalid unit range, unsafe website and missing Other details cannot reach intake',async()=>{
 const view=mount();try{
  valid(view);change(view,'Min Units','5');change(view,'Max Units','2');change(view,'Website / LinkedIn / Company Profile','javascript:unsafe');chip(view,'Exit strategies','Other');
  await act(async()=>submit(view));
  const summary=text(view.root.findByProps({role:'alert'}));
  assert.match(summary,/whole-number/);assert.match(summary,/full http or https/);assert.match(summary,/Other exit strategy/);assert.equal(fixture.calls.length,0);
 }finally{act(()=>view.unmount());}
});

test('actual receipt-client outage reaches page and toast; retry preserves data/key and criteria-only success is honest',async()=>{
 const view=mount();try{
  valid(view);fixture.rpc=async()=>({data:null,error:{code:'42501',message:'PRIVATE_PROVIDER_DETAIL'}});
  await act(async()=>submit(view));
  const alert=text(view.root.findByProps({role:'alert'}));assert.match(alert,/temporarily unavailable/);assert.match(alert,/No submission was confirmed/);assert.doesNotMatch(alert,/PRIVATE/);
  assert.equal(fixture.toasts.at(-1),alert.replace('Submission not confirmed',''));
  assert.equal(control(view,'Email *').props.value,'buyer@example.invalid');
  fixture.rpc=async()=>({data:{id:'synthetic-receipt',recorded:true},error:null});
  await act(async()=>submit(view));
  assert.equal(fixture.calls.length,2);assert.equal(fixture.calls[0].args.p_key,fixture.calls[1].args.p_key);
  assert.equal(fixture.calls[1].args.p_value.portalForm.dealConsent,false);
  assert.match(jsonText(view),/No proof documents were attached/);assert.match(jsonText(view),/does not automatically verify/);assert.ok(fixture.focused.includes('h1'));
 }finally{act(()=>view.unmount());}
});

test('unexpected provider exception is not reflected or mistaken for success',async()=>{
 const view=mount();try{
  valid(view);fixture.rpc=async()=>{throw Error('PRIVATE_PROVIDER_TOKEN_DUMMY');};
  await act(async()=>submit(view));
  assert.match(text(view.root.findByProps({role:'alert'})),/could not confirm/);assert.doesNotMatch(jsonText(view),/PRIVATE_PROVIDER/);assert.equal(view.root.findAllByType('form').length,1);
 }finally{act(()=>view.unmount());}
});

test('pending submission disables edits and duplicate submits; success occurs only after receipt',async()=>{
 const view=mount();try{
  valid(view);let resolve;fixture.rpc=()=>new Promise(r=>{resolve=r;});let first,second;
  act(()=>{first=submit(view);second=submit(view);});
  assert.equal(fixture.calls.length,1);assert.equal(view.root.findByType('fieldset').props.disabled,true);assert.equal(view.root.findByType('form').props['aria-busy'],true);
  assert.equal(view.root.findAllByType('h1').some(n=>text(n)==='Buyer profile received'),false);
  await act(async()=>{resolve({data:{id:'synthetic-receipt',recorded:true},error:null});await Promise.all([first,second]);});
  assert.equal(view.root.findAllByType('form').length,0);
 }finally{act(()=>view.unmount());}
});

test('proof upload blocks submission and announces progress; long filenames wrap and remove control is named',async()=>{
 const view=mount();try{
  valid(view);let resolve;fixture.upload=()=>new Promise(r=>{resolve=r;});
  act(()=>control(view,'Attach File (optional)').props.onChange({target:{files:[{}]},currentTarget:{value:'synthetic'}}));
  await act(async()=>submit(view));assert.equal(fixture.calls.length,0);assert.equal(view.root.findByType('fieldset').props.disabled,true);assert.match(text(view.root.findByProps({role:'status'})),/Uploading/);
  const fileName='synthetic-'.repeat(24)+'.pdf';
  await act(async()=>{resolve({uploaded:[{id:'owned',storageProvider:'supabase',fileName,proofType:'Proof of Funds'}],failedCount:0});});
  const file=view.root.findAllByType('div').find(n=>n.children.includes(fileName));assert.match(file.props.className,/break-all/);
  const remove=view.root.findByProps({'aria-label':`Remove ${fileName}`});assert.equal(remove.props.disabled,false);act(()=>remove.props.onClick());
  assert.match(text(view.root.findByProps({role:'status'})),/0 proof files/);
 }finally{act(()=>view.unmount());}
});

test('CRM billing pause remains enforced and never calls receipt RPC',async()=>{
 const view=mount('crm');try{
  fixture.billing='Past Due';act(()=>view.update(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Page,{product:'crm'}))));
  assert.equal(view.root.findByProps({type:'submit'}).props.disabled,true);
  await act(async()=>submit(view));assert.equal(fixture.calls.length,0);
 }finally{act(()=>view.unmount());}
});
test.after(()=>{delete globalThis.__intakeInteraction;});
