// Local-only acceptance harness: actual Buyers UI and import API, disposable
// Postgres, synthetic account, no environment loading or external requests.
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import Papa from 'papaparse';
import { createBuyerImportFixture } from '../tests/helpers/buyerImportFixture.mjs';

const fixture = await createBuyerImportFixture();
const result = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {MemoryRouter} from 'react-router-dom'; import {Toaster} from 'sonner';
    import Buyers from './src/pages/app/Buyers.tsx'; import {useAppStore} from './src/store/useAppStore.ts';
    useAppStore.setState({user:{id:'synthetic-user',email:'qa@example.invalid',name:'Synthetic QA',isOwnerAdmin:true},buyers:[]});
    async function loadSample(large=false){const input=document.querySelector('#csv-upload');if(!input)return;const text=await fetch(large?'/large-sample.csv':'/sample.csv').then(r=>r.text());const transfer=new DataTransfer();transfer.items.add(new File([text],'synthetic-sample.csv',{type:'text/csv'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
    createRoot(document.getElementById('root')).render(<MemoryRouter><p>LOCAL DISPOSABLE QA — no Production connection</p><div style={{position:'fixed',bottom:0,left:0,zIndex:9999,background:'#222'}}><button onClick={()=>loadSample()}>QA: load 8</button> · <button onClick={()=>loadSample(true)}>QA: load 60</button></div><Buyers/><Toaster/></MemoryRouter>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'isolated-supabase', setup(builder) {
    builder.onLoad({ filter: /[/\\]lib[/\\]supabase\.ts$/ }, () => ({ contents: `
      export const isSupabaseConfigured=true;
      const session={access_token:'local-fixture-only',user:{id:'synthetic-user',email:'qa@example.invalid'}};
      export const supabase={auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}})},from(table){
        const steps=[]; const chain={then(resolve,reject){return fetch('/fixture-query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,steps})}).then(r=>r.json()).then(resolve,reject)}};
        for(const name of ['select','eq','order','range','limit','maybeSingle','in']) chain[name]=(...args)=>{steps.push([name,args]);return chain};return chain;
      }};`, loader: 'js' }));
  } }],
});
const bundle = result.outputFiles[0].text;
const cssFile = readdirSync('dist/assets').find(name => name.endsWith('.css'));
const css = readFileSync(`dist/assets/${cssFile}`);
const server = createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'");
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle); }
  if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
  if (req.url === '/sample.csv') { res.setHeader('Content-Type', 'text/csv'); return res.end(readFileSync('tests/fixtures/buyer-import-master.csv')); }
  if (req.url === '/large-sample.csv') {
    const template = Papa.parse(readFileSync('tests/fixtures/buyer-import-master.csv', 'utf8'), { header: true }).data[0];
    res.setHeader('Content-Type', 'text/csv');
    return res.end(Papa.unparse(Array.from({ length: 60 }, (_, i) => ({ ...template, Name: `Synthetic Buyer ${i + 1}`, Email: `synthetic${i + 1}@example.invalid`, Phone: `5550101${String(i).padStart(3, '0')}` }))));
  }
  if (req.method === 'POST') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/import-buyers') {
      const result = await fixture.invoke(body.buyers, body.operation); res.statusCode = result.status; return res.end(JSON.stringify(result.body));
    }
    if (req.url === '/fixture-query') {
      if (body.table === 'workspace_plan_assignments') return res.end(JSON.stringify({ data: { workspace_id: 'synthetic-workspace', plan_name: 'Owner Admin' } }));
      if (body.table !== 'buyers') return res.end(JSON.stringify({ data: [], count: 0 }));
      let query = fixture.adminClient.from('buyers');
      for (const [method, args] of body.steps) if (typeof query[method] === 'function') query = query[method](...args);
      return res.end(JSON.stringify(await query));
    }
    res.statusCode = 404; return res.end('{}');
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="color:#e5e7eb;background:#070a0f"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
});
server.listen(5187, '127.0.0.1', () => console.log('Disposable buyer import QA: http://127.0.0.1:5187'));
