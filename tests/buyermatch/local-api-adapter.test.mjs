import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {localApiMiddleware} from '../../scripts/testing/buyermatch-local-api.mjs';
test('local adapter exposes only fixed handlers, preserves Auth headers and rejects duplicate query input',async()=>{
 let calls=0;const middleware=localApiMiddleware({'/api/buyermatch':async(req,res)=>{calls++;assert.equal(req.headers.authorization,'Bearer SYNTHETIC_ONLY');res.status(401).json({error:'Sign in required'});}});
 async function invoke(url){const req=Readable.from([]);req.url=url;req.headers={authorization:'Bearer SYNTHETIC_ONLY'};const res={statusCode:200,headersSent:false,setHeader(){},writeHead(status){this.statusCode=status;},end(body){this.body=body;}};await middleware(req,res,()=>{res.next=true;});return res;}
 assert.equal((await invoke('/api/buyermatch?action=list')).statusCode,401);assert.equal(calls,1);
 assert.equal((await invoke('/api/buyermatch?action=list&action=admin-list')).statusCode,400);assert.equal(calls,1);
 assert.equal((await invoke('/api/buyermatch-worker')).statusCode,404);assert.equal(calls,1);
 assert.equal((await invoke('/buyermatch')).next,true);
});
