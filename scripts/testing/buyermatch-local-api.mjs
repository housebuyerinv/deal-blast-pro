// Local Vite adapter only. Real handlers retain normal Auth/ownership gates.
export function localApiMiddleware(handlers){
 return async(req,res,next)=>{
  const url=new URL(req.url,'http://127.0.0.1:5189');
  if(!url.pathname.startsWith('/api/'))return next();
  const handler=handlers[url.pathname];
  if(!handler){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Local route unavailable"}');return;}
  try{
   const query={};for(const [key,value]of url.searchParams){if(Object.hasOwn(query,key))throw Error();query[key]=value;}
   let bytes=0;const chunks=[];
   for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)throw Error();chunks.push(chunk);}
   req.query=query;req.body=Buffer.concat(chunks).toString('utf8');
   res.status=status=>{res.statusCode=status;return res;};
   res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
   await handler(req,res);
  }catch{if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":"Local request failed"}');}
 };
}
