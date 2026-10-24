// Local UI fixture only; CSP blocks external connections and all mutations.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from './src/pages/public/BuyerPortal';createRoot(document.getElementById('root')).render(<BrowserRouter><aside role='note'>LOCAL SYNTHETIC UI — no provider access or email</aside><Page product='buyermatch'/></BrowserRouter>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'non-delivering-fixture',setup(b){
 b.onResolve({filter:/buyerProofStorage$|supabaseClient$|submissionNotifications$|store\/useAppStore$|layout\/PublicNav$|layout\/PublicFooter$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('useAppStore')?"export const useAppStore=s=>s({trial:{plan:'Pro',billingStatus:'Past Due'}});":a.path.endsWith('buyerProofStorage')?"export async function uploadBuyerProofBatch(){throw Error('Synthetic fixture has no upload provider')} ":a.path.endsWith('supabaseClient')?"export const supabase={rpc:async()=>new URLSearchParams(location.search).get('mode')==='paused'?{data:null,error:{code:'42501',message:'PRIVATE_FIXTURE_DETAIL'}}:{data:{id:'synthetic-receipt',recorded:true},error:null}};":a.path.endsWith('submissionNotifications')?"export async function notifySubmission(){throw Error('Fixture notification forbidden')} ":"export default function Stub(){return null}"}));
}}]});
const css=readFileSync('dist/assets/'+readdirSync('dist/assets').find(x=>x.endsWith('.css')));
const server=createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'none';script-src 'self';style-src 'self' 'unsafe-inline';connect-src 'none';img-src 'self' data:;font-src 'self';base-uri 'none';form-action 'none';frame-ancestors 'none'");
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'){res.writeHead(405);res.end('No writes');return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return;}
 if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local synthetic BuyerMatch UI</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
server.listen(5179,'127.0.0.1',()=>console.log('Synthetic-only fixture ready: http://127.0.0.1:5179/buyermatch/buyers'));
