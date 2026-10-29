// Stage the fixed owner-approved source and launch only its cleanup monitor.
// This script never pushes, deploys, activates a route or reads credentials.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { SCOPE, requireCanonicalDirectory } from './s2-payment-free-controller.mjs';
import { REQUIRED_S2_ENV } from '../buyermatch-s2-release.mjs';
const base='C:/Users/CTL Katastrophic/DBPBuyerMatchS2';
const cli='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
const node='C:/Program Files/nodejs/node.exe';
const sha=b=>createHash('sha256').update(b).digest('hex');
let stage='PRIVATE_ROOT';
try {
  await requireCanonicalDirectory(base);
  if(fs.existsSync(path.join(base,'dbp-s2-billing.lock.json')))throw Error();
  const runId=randomUUID(),root=path.join(base,runId),directory=path.join(root,'source');
  fs.mkdirSync(root);fs.mkdirSync(directory);await requireCanonicalDirectory(root);
  stage='EXACT_GIT_ARCHIVE';
  execFileSync('git',['-c','core.autocrlf=false','archive','--format=tar','--output',path.join(root,'source.tar'),SCOPE.source],{stdio:'pipe',windowsHide:true});
  execFileSync('tar.exe',['-xf',path.join(root,'source.tar'),'-C',directory],{stdio:'pipe',windowsHide:true});
  const entries=execFileSync('git',['ls-tree','-r','-z',SCOPE.source],{encoding:'utf8'}).split('\0').filter(Boolean);
  for(const line of entries){
    const m=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);if(!m)throw Error();
    const file=path.resolve(directory,m[3]);if(!file.startsWith(path.resolve(directory)+path.sep)||fs.lstatSync(file).isSymbolicLink())throw Error();
    const b=fs.readFileSync(file),hash=createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');if(hash!==m[2])throw Error();
  }
  const v=JSON.parse(fs.readFileSync(path.join(directory,'vercel.json')));
  if(v.git?.deploymentEnabled?.['codex/buyermatch-1b-integration']!==false)throw Error();
  stage='PAUSED_ARGUMENTS';
  const packet=JSON.parse(fs.readFileSync('docs/release-evidence/2026-10-27/payment-free-preflight-packet.json'));
  const args=packet.commands.deploy.slice(1).map(v=>v.includes('DBP-S2-APPROVAL-REQUIRED')?directory:v.replaceAll(packet.source,SCOPE.source).replaceAll(packet.runId,runId));
  const values={runtime:{},build:{}};
  for(let i=0;i<args.length;i++)if(args[i]==='--env'||args[i]==='--build-env'){
    const item=args[i+1],at=item.indexOf('='),key=item.slice(0,at),value=item.slice(at+1),scope=args[i]==='--env'?'runtime':'build';
    if(key in values[scope])throw Error();values[scope][key]=value;
  }
  for(const scope of Object.values(values))for(const[k,v]of Object.entries(REQUIRED_S2_ENV))if(scope[k]!==v)throw Error();
  if(args.includes('--prod')||args.includes('--force')||args[args.indexOf('--project')+1]!==SCOPE.project||args[args.indexOf('--target')+1]!=='preview')throw Error();
  stage='CURRENT_INVENTORY';
  const raw=execFileSync(node,[cli,'api',`/v6/deployments?teamId=${SCOPE.team}&projectId=${SCOPE.project}&limit=100`,'--method','GET','--scope','housebuyerinv','--raw'],{encoding:'utf8',timeout:25000,maxBuffer:4194304,stdio:'pipe',windowsHide:true});
  const inventory=JSON.parse(raw);if(!Array.isArray(inventory.deployments)||inventory.pagination?.next)throw Error();
  const preexistingIds=inventory.deployments.map(d=>d.uid??d.id);if(!preexistingIds.includes(SCOPE.fallback))throw Error();
  fs.copyFileSync('scripts/testing/s2-payment-free-controller.mjs',path.join(root,'controller.mjs'));
  fs.copyFileSync('scripts/testing/s2-canary-http-observer.mjs',path.join(root,'observer.mjs'));
  const startedAt=Date.now();
  const plan={...SCOPE,mode:'HOSTED',scope:'payment-free-preflight',approved:true,runId,root,coordinationRoot:base,launcherPid:process.pid,startedAt,expiresAt:startedAt+1800000,preexistingIds,controllerHash:sha(fs.readFileSync(path.join(root,'controller.mjs'))),observerHash:sha(fs.readFileSync(path.join(root,'observer.mjs')))};
  const write=(name,value)=>fs.writeFileSync(path.join(root,name),JSON.stringify(value)+'\n',{flag:'wx'});
  write('source-verification.json',{source:SCOPE.source,tree:execFileSync('git',['rev-parse',SCOPE.source+'^{tree}'],{encoding:'utf8'}).trim(),fileCount:entries.length,allGitBlobHashesVerified:true,pairedSettings:values,physicalPath:await fsp.realpath(root)});
  write('deploy-argv.json',args);write('plan.json',plan);
  stage='DETACHED_MONITOR';
  const stdout=fs.openSync(path.join(root,'worker.stdout'),'wx'),stderr=fs.openSync(path.join(root,'worker.stderr'),'wx');
  const child=spawn(node,[path.join(root,'controller.mjs'),path.join(root,'plan.json'),sha(fs.readFileSync(path.join(root,'plan.json')))],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',stdout,stderr]});
  child.unref();fs.closeSync(stdout);fs.closeSync(stderr);
  process.stdout.write(JSON.stringify({source:SCOPE.source,root,runId,fileCount:entries.length,allGitBlobHashesVerified:true,settingsVerified:17,watchdogPid:child.pid,deadline:new Date(plan.expiresAt).toISOString()})+'\n');
}catch{process.stderr.write(JSON.stringify({stage,status:'UNVERIFIED',push:false,deploy:false})+'\n');process.exitCode=2;}
