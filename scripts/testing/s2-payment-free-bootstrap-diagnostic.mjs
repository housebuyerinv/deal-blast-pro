// Host-only startup diagnostic. No provider imports, commands or network calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { validateControllerPlan } from './s2-payment-free-controller.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
let stage='PLAN';
try {
  const p=validateControllerPlan(JSON.parse(await fs.readFile(process.argv[2],'utf8')));
  stage='CANONICAL_ROOTS';
  for(const dir of [p.root,p.coordinationRoot])if((await fs.realpath(dir)).toLowerCase()!==path.resolve(dir).toLowerCase()||(await fs.lstat(dir)).isSymbolicLink())throw Error();
  stage='PRESERVED_OPERATOR_HASHES';
  if(sha(await fs.readFile(path.join(p.root,'controller.mjs')))!==p.controllerHash||sha(await fs.readFile(path.join(p.root,'observer.mjs')))!==p.observerHash)throw Error();
  stage='TOOL_READABILITY';
  for(const file of ['C:/Program Files/nodejs/node.exe','C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/supabase/dist/supabase.js','C:/Users/CTL Katastrophic/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe'])await fs.readFile(file);
  stage='EXITED_LAUNCHER';
  try{process.kill(p.launcherPid,0);throw Error();}catch(e){if(e.code!=='ESRCH')throw e;}
  stage='NEW_SYNTHETIC_MARKER';
  const h=await fs.open(path.join(p.coordinationRoot,'bootstrap-probe-'+randomUUID()+'.json'),'wx',0o600);
  try{await h.writeFile(JSON.stringify({syntheticOnly:true,providerCalls:0}));await h.sync();}finally{await h.close();}
  process.stdout.write(JSON.stringify({stage,status:'PASS',providerCalls:0})+'\n');
}catch(e){process.stdout.write(JSON.stringify({stage,status:'FAILED_OR_UNKNOWN',code:['ENOENT','EACCES','EPERM','ESRCH','EINVAL','EEXIST'].includes(e.code)?e.code:'ASSERTION_OR_OTHER',errno:Number.isInteger(e.errno)?e.errno:null,providerCalls:0})+'\n');process.exitCode=2;}
