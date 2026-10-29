import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create, act} from 'react-test-renderer';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {criteriaSchema} from '../../server/buyermatch/security.js';

for (const [minimum, maximum] of [['minPrice','maxPrice'],['minSqft','maxSqft'],['minUnits','maxUnits']]) {
  test(`criteria reject inverted ${minimum}/${maximum} without changing valid/open ranges`, () => {
    const invalid=criteriaSchema.safeParse({[minimum]:10,[maximum]:2});
    assert.equal(invalid.success,false);
    assert.deepEqual(invalid.error.issues[0].path,[maximum]);
    for (const value of [{},{[minimum]:10},{[maximum]:2},{[minimum]:2,[maximum]:2},{[minimum]:0,[maximum]:10}])
      assert.equal(criteriaSchema.safeParse(value).success,true);
  });
}

// Actual React component with deferred, non-delivering fetch. No browser/provider access.
const built=await build({entryPoints:['src/pages/public/BuyerMatchResponse.tsx'],bundle:true,write:false,
  platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom']});
const module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const Page=module.exports.default;
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
function fixture(){
  const originalWindow=globalThis.window, originalFetch=globalThis.fetch;
  const listeners=new Map(), requests=[];
  globalThis.window={location:{hash:'#'+'a'.repeat(43),pathname:'/buyermatch/respond'},
    history:{replaceState(){}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  globalThis.fetch=async(url,options)=>new Promise(resolve=>requests.push({url,body:JSON.parse(options.body),resolve}));
  let view; act(()=>{view=create(React.createElement(Page));});
  return {view,requests,listeners,submit:()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}),
    async resolve(index,data={recorded:true},ok=true){await act(async()=>{requests[index].resolve({ok,json:async()=>data});});},
    close(){act(()=>view.unmount());globalThis.window=originalWindow;globalThis.fetch=originalFetch;}};
}

test('response locks edits and duplicate submit/conversation calls while pending; reports recorded operation',async()=>{
  const f=fixture();try{
    act(()=>{f.submit();f.submit();f.view.root.findAllByType('button').find(n=>text(n)==='View deal & conversation').props.onClick();});
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.kind,'interested');
    assert.equal(f.view.root.findByType('fieldset').props.disabled,true);
    assert.equal(f.view.root.findByType('form').props['aria-busy'],true);
    // Even a direct synthetic handler invocation cannot mislabel the old operation.
    act(()=>f.view.root.findByType('select').props.onChange({target:{value:'unsubscribe'}}));
    await f.resolve(0);
    assert.equal(text(f.view.root.findByProps({role:'status'})),'Your response has been recorded.');
    assert.equal(f.view.root.findByType('fieldset').props.disabled,false);
  }finally{f.close();}
});

test('failed response releases lock and retry keeps the operation key',async()=>{
  const f=fixture();try{
    act(()=>f.submit());const key=f.requests[0].body.operationKey;
    await f.resolve(0,{error:'Response link unavailable.'},false);
    assert.equal(f.view.root.findByType('fieldset').props.disabled,false);
    act(()=>f.submit());assert.equal(f.requests[1].body.operationKey,key);
    await f.resolve(1);assert.match(text(f.view.root.findByProps({role:'status'})),/recorded/);
  }finally{f.close();}
});

test('invitation change isolates pending results and cannot unlock a newer request',async()=>{
  const f=fixture();try{
    act(()=>f.submit());
    act(()=>{window.location.hash='#'+'b'.repeat(43);f.listeners.get('hashchange')();});
    act(()=>f.submit());assert.equal(f.requests[1].body.token,'b'.repeat(43));
    await f.resolve(0);
    assert.equal(f.view.root.findByType('fieldset').props.disabled,true);
    assert.equal(f.view.root.findAllByProps({role:'status'}).length,0);
    await f.resolve(1);assert.equal(f.view.root.findByType('fieldset').props.disabled,false);
  }finally{f.close();}
});

test('conversation load holds the same lock and releases it on safe failure',async()=>{
  const f=fixture();try{
    act(()=>f.view.root.findAllByType('button').find(n=>text(n)==='View deal & conversation').props.onClick());
    act(()=>f.submit());assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.kind,'conversation');
    await f.resolve(0,{error:'PRIVATE_PROVIDER_DETAIL'},false);
    assert.doesNotMatch(text(f.view.root.findByProps({role:'status'})),/PRIVATE_PROVIDER/);
    act(()=>f.submit());assert.equal(f.requests.length,2);await f.resolve(1);
  }finally{f.close();}
});
