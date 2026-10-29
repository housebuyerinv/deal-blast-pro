// Passive standard diagnostics. No credentials, headers, bodies, interception or mutation.
import dc from 'node:diagnostics_channel';
const at=process.argv.indexOf('api');
let expected;
try{if(at>0)expected=new URL(process.argv[at+1],'https://api.vercel.com').pathname;}catch{/* No observation scope. */}
export function statusObservation(origin,path,method,status,expectedPath=expected){
 try{
  if(origin!=='https://api.vercel.com'||!expectedPath||new URL(path,origin).pathname!==expectedPath||
     !['GET','DELETE'].includes(method)||!Number.isInteger(status)||status<100||status>599)return null;
  return {type:'scoped-http-status',method,path:expectedPath,status};
 }catch{return null;}
}
function emit(...args){try{const m=statusObservation(...args);if(m&&typeof process.send==='function')process.send(m);}catch{/* Missing evidence is UNKNOWN. */}}
dc.subscribe('undici:request:headers',m=>{try{emit(String(m.request.origin),m.request.path,m.request.method,m.response.statusCode);}catch{/* Missing evidence remains UNKNOWN. */}});
dc.subscribe('http.client.response.finish',m=>{try{const r=m.request;emit(`${r.protocol}//${r.host}`,r.path,r.method,m.response.statusCode);}catch{/* Missing evidence remains UNKNOWN. */}});
