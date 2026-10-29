import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const r=await build({entryPoints:['src/lib/buyerProofStorage.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'no-provider',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'dummy',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=null,isSupabaseConfigured=false;'}));}}]});
const {validateBuyerReviewDocument,uploadBuyerProofBatch}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
for(const [name,type] of [['proof.pdf','application/pdf'],['proof.png','image/png'],['proof.docx','application/octet-stream']])test(`accepts bounded ${name}`,()=>{
 assert.doesNotThrow(()=>validateBuyerReviewDocument(new File(['dummy'],name,{type})));
});
for(const [name,type,size] of [['payload.exe','image/png',4],['payload.svg','image/svg+xml',4],['proof.png','image/svg+xml',4],['proof.pdf','text/html',4],['proof.pdf','application/pdf',0],['proof.pdf','application/pdf',25]])test(`rejects unsafe ${name}/${type}/${size}`,()=>{
 assert.throws(()=>validateBuyerReviewDocument(new File(['x'.repeat(size)],name,{type}),20));
});
test('batch validates every file before any upload starts',async()=>{
 let calls=0;await assert.rejects(uploadBuyerProofBatch([new File(['valid'],'ok.pdf',{type:'application/pdf'}),new File(['unsafe'],'bad.exe',{type:'image/png'})],'Proof','',async()=>{calls++;return{}}));
 assert.equal(calls,0);
});
test('partial failure retains successful proof metadata instead of silently losing it',async()=>{
 const files=['one.pdf','two.pdf','three.pdf'].map(n=>new File(['dummy'],n,{type:'application/pdf'}));
 const r=await uploadBuyerProofBatch(files,'Proof','',async file=>{if(file.name==='two.pdf')throw Error('dummy failure');return{id:file.name}});
 assert.equal(r.failedCount,1);assert.deepEqual(r.uploaded.map(f=>f.id),['one.pdf','three.pdf']);
});
