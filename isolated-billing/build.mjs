// @ts-check
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir,copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { BASE, OPERATOR_BASE, ID, validateProfile, demand, digest } from './profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
// No existing application file is edited. The derivative is an explicitly labeled build overlay.
/** @param {unknown} input @param {string} output @param {{frontendKey?:string}} [options] */
export async function buildIsolated(input, output, {frontendKey}={}) {
  const p=validateProfile(input);output=path.resolve(output);
  demand(output.startsWith(root) && !output.startsWith(path.join(root,'.git')),'OUTPUT_LOCATION');
  const changed=execFileSync('git',['diff',BASE,'--name-only','--','api','server','src','supabase/functions'],{cwd:root,encoding:'utf8'}).trim();
  demand(!changed,'ORIGINAL_APPLICATION_MODIFIED');
  if(p.mode==='HOSTED'){
    demand(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()===p.source,'EXACT_DERIVATIVE_SHA');
    demand(!execFileSync('git',['status','--porcelain','--','isolated-billing'],{cwd:root,encoding:'utf8'}).trim(),'DIRTY_DERIVATIVE');
  }
  await mkdir(output,{recursive:true});
  const aliases={S2_RELEASE:{project:p.project,team:p.team,staging:p.database,account:p.account,
    endpoint:p.endpoint,pro:p.pro,origin:p.origin,fallback:'NO_LEGACY_FALLBACK'},REQUIRED_S2_ENV:{}};
  const original=(file,ref=BASE)=>execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});
  const evidence=[];
  const plugin={name:'explicit-isolated-derivative',setup(b){
    b.onResolve({filter:/^isolated:binding$/},()=>({path:'binding',namespace:'isolated'}));
    b.onLoad({filter:/.*/,namespace:'isolated'},()=>({contents:`export const binding=${JSON.stringify(p)};`,loader:'js'}));
    b.onResolve({filter:/buyermatch-s2-release\.mjs$/},()=>({path:'release',namespace:'release'}));
    b.onLoad({filter:/.*/,namespace:'release'},()=>({contents:`export const S2_RELEASE=${JSON.stringify(aliases.S2_RELEASE)};export const REQUIRED_S2_ENV={};`,loader:'js'}));
    b.onResolve({filter:/\/(staging|s2-billing-window)\.js$/},args=>{
      if(!['staging.js','s2-billing-window.js'].some(name=>path.resolve(args.resolveDir,args.path)===path.join(root,'server/buyermatch',name)))return;
      return {path:args.path.endsWith('/staging.js')?'staging':'window',namespace:'guard'};
    });
    b.onLoad({filter:/.*/,namespace:'guard'},()=>({contents:`
      import process from 'node:process';
      import {binding as p} from 'isolated:binding';
      import {runtime,digest,ID,demand} from ${JSON.stringify(path.join(root,'isolated-billing/profile.mjs'))};
      export const PRODUCTION_SUPABASE_REF='aigvnbxiydbzzqbetlhl';
      export const S2_BILLING_REF=p.database;export const S2_PRO_OWNER=p.owner;
      export function assertStaging(env=process.env){runtime(p,env);return 'https://'+p.database+'.supabase.co';}
      export function stagingOrigin(env=process.env){runtime(p,env);return p.origin;}
      export function isDedicatedS2Runtime(env=process.env){runtime(p,env);return true;}
      export function isS2LegacyCheckout(action,method,env=process.env){runtime(p,env);return method==='POST'&&['credit-packs','pro-trial-checkout'].includes(action);}
      export function requireS2BillingWindow(owner,operation,env=process.env,now=Date.now()){
        demand(operation==='checkout','PORTAL_OR_LIFECYCLE_DENIED');runtime(p,env,{issuance:true,owner,now});return {runId:p.runId,expiresAt:p.expiresAt};}
      export function s2BillingWindowStatus(user,env=process.env){runtime(p,env,{owner:user.id});
        demand(user.email_confirmed_at,'CONFIRMED_OWNER');return {schema:ID,source:p.source,baseSource:p.baseSource,
        profileDigest:digest(p),projectId:p.project,deploymentId:env.VERCEL_DEPLOYMENT_ID||p.project,
        registrationPaused:true,liveBillingDisabled:true,deliveryDisabled:true,
        BM_S2_BILLING_OPERATIONS:'checkout',BM_S2_BILLING_EXPIRES_AT:new Date(p.expiresAt).toISOString()};}
    `,loader:'js',resolveDir:root}));
    b.onLoad({filter:/\.(ts|js|mjs)$/},async args=>{
      const rel=path.relative(root,args.path).replaceAll('\\','/');
      let ref=rel.startsWith('scripts/testing/')?OPERATOR_BASE:BASE;
      if(!/^(api|server|src|supabase\/functions|scripts\/testing)\//.test(rel))return;
      let contents=original(rel,ref);
      evidence.push({file:rel,base:ref,blob:execFileSync('git',['rev-parse',`${ref}:${rel}`],{cwd:root,encoding:'utf8'}).trim()});
      if(rel==='scripts/testing/s2-stripe-native-watchdog.mjs'){
        const cli=contents.indexOf('if (\n  process.argv[1]');
        demand(cli>0,'CUSTODY_LIBRARY_ANCHOR');
        // Bundling changes import.meta.url. Include the custody library, never its old probe CLI.
        contents=contents.slice(0,cli);
      }
      if(rel==='supabase/functions/stripe-webhook/index.ts'){
        demand(contents.includes("const s2Ref = 'qxhhlprentrufobpcgna'") && contents.trimEnd().endsWith('})'),'RECEIVER_OVERLAY_ANCHOR');
        contents=contents.replace('Deno.serve(async req => {','export default async function originalWebhook(req: Request) {')
          .replace("const s2Ref = 'qxhhlprentrufobpcgna'",`const s2Ref = '${p.database}'`)
          .replaceAll("Deno.env.get('STRIPE_SECRET_KEY')","Deno.env.get('BM_STRIPE_TEST_SECRET_KEY')")
          .replaceAll('Deno.env.get("STRIPE_SECRET_KEY")','Deno.env.get("BM_STRIPE_TEST_SECRET_KEY")');
        contents=contents.trimEnd().slice(0,-2)+'}';
        contents=`import process from 'node:process';const Deno=globalThis.Deno??{env:{get:(k:string)=>process.env[k]}};\n`+contents;
      }
      return {contents,loader:rel.endsWith('.ts')?'ts':'js',resolveDir:path.dirname(args.path)};
    });
  }};
  const jobs=[['application',`export {default as buyermatch} from './server/http/buyermatch.ts';export {default as accountStatus} from './api/account-status.ts';export {createCheckout} from './server/buyermatch/checkout.js';export {stagingOrigin,assertStaging} from './server/buyermatch/staging.js';export {requireS2BillingWindow,s2BillingWindowStatus} from './server/buyermatch/s2-billing-window.js';`],
    ['receiver',`export {default} from './supabase/functions/stripe-webhook/index.ts';`],
    ['operator',`export * from './isolated-billing/operator.mjs';`]];
  for(const [name,contents] of jobs)await build({stdin:{contents,resolveDir:root,sourcefile:`isolated-${name}-entry.mjs`},
    bundle:true,platform:'node',target:'node22',format:'esm',outfile:path.join(output,name+'.mjs'),plugins:[plugin],
    banner:{js:`// ${ID}; derivative ${p.source}; base ${BASE}. NOT the approved S2 deployment.\nimport {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);`}});
  await writeFile(path.join(output,'profile.json'),JSON.stringify(p,null,2));
  await writeFile(path.join(output,'derivative.json'),JSON.stringify({profile:ID,source:p.source,baseSource:BASE,
    operatorBase:OPERATOR_BASE,profileDigest:digest(p),localOnly:p.mode==='LOCAL_SYNTHETIC',sources:evidence},null,2));
  // This API artifact contains only the bounded billing wrapper; legacy routes are not deployed.
  const entry=`import process from 'node:process';import {binding as p} from 'isolated:binding';
    import {createIsolatedApi} from './isolated-billing/api.mjs';import {nativePorts} from './isolated-billing/native.mjs';
    import handler from './server/http/buyermatch.ts';import accountStatus from './api/account-status.ts';
    const env=process.env;const ports=nativePorts(p,async()=>({profileDigest:env.BM_ISOLATED_PROFILE_DIGEST,
      account:p.account,database:p.database,stripeKey:env.BM_STRIPE_TEST_SECRET_KEY,
      serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,signingSecret:env.STRIPE_WEBHOOK_SECRET}));
    export default createIsolatedApi(p,{buyermatch:handler,accountStatus,authenticate:ports.authenticate,
      authority:ports.authority,permitCheckout:(run,owner,operation)=>ports.db('bm_isolated_permit',{p_owner:owner,p_operation:operation}),env});`;
  await build({stdin:{contents:entry,resolveDir:root},bundle:true,platform:'node',target:'node22',format:'esm',
    outfile:path.join(output,'api.mjs'),plugins:[plugin],banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}});
  const receiver=`import process from 'node:process';import {binding as p} from 'isolated:binding';
    import {createIsolatedWebhook} from './isolated-billing/webhook.mjs';import {nativePorts} from './isolated-billing/native.mjs';
    import delegate from './supabase/functions/stripe-webhook/index.ts';const env=globalThis.Deno?.env?.toObject()||process.env;
    const ports=nativePorts(p,async()=>({profileDigest:env.BM_ISOLATED_PROFILE_DIGEST,account:p.account,database:p.database,
      stripeKey:env.BM_STRIPE_TEST_SECRET_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,signingSecret:env.STRIPE_WEBHOOK_SECRET}));
    export default createIsolatedWebhook(p,{env,signingSecret:env.STRIPE_WEBHOOK_SECRET,authority:ports.authority,
      reconcile:ports.reconcile,countDelivery:(event)=>ports.db('bm_isolated_event',{p_event:event}),delegate});`;
  await build({stdin:{contents:receiver,resolveDir:root},bundle:true,platform:'node',target:'node22',format:'esm',
    outfile:path.join(output,'webhook.mjs'),plugins:[plugin]});
  await writeFile(path.join(output,'edge-index.ts'),"import handler from './webhook.mjs'; Deno.serve(handler);\n");
  if(frontendKey){
    demand((p.mode==='LOCAL_SYNTHETIC' && frontendKey==='sb_publishable_synthetic') ||
      (frontendKey.startsWith('sb_publishable_') && frontendKey.length>35),'NEW_PUBLIC_KEY_REQUIRED');
    const {build:viteBuild}=await import('vite');
    await viteBuild({configFile:path.join(root,'vite.config.mjs'),envDir:false,envPrefix:[],
      plugins:[{name:'isolated-single-checkout-key',enforce:'pre',transform(code,id){
        if(id.replaceAll('\\','/').endsWith('/src/pages/app/BuyerMatch.tsx')){
          demand(code.includes('operationKey: key'),'FRONTEND_CHECKOUT_ANCHOR');
          return code.replace('operationKey: key',`operationKey: ${JSON.stringify(p.runId)}`);
        }
      }}],
      define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(`https://${p.database}.supabase.co`),
        'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(frontendKey)},
      build:{outDir:path.join(output,'.vercel/output/static'),emptyOutDir:false},logLevel:'warn'});
    const index=path.join(output,'.vercel/output/static/index.html');
    let html=await readFile(index,'utf8');
    html=html.replace('<head>',`<head><meta name="buyermatch-artifact" content="${ID}:${p.source}">`)
      .replace(/<body([^>]*)>/,`<body$1><div role="status" style="background:#ffe08a;color:#111;padding:8px;text-align:center">ISOLATED SYNTHETIC BILLING TEST — NOT PRODUCTION</div>`);
    await writeFile(index,html);
    const func=path.join(output,'.vercel/output/functions/isolated.func');await mkdir(func,{recursive:true});
    await copyFile(path.join(output,'api.mjs'),path.join(func,'index.mjs'));
    await writeFile(path.join(func,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs'}));
    await writeFile(path.join(output,'.vercel/project.json'),JSON.stringify({projectId:p.project,orgId:p.team}));
    await writeFile(path.join(output,'.vercel/output/config.json'),JSON.stringify({version:3,routes:[
      {src:'^/api/(?:buyermatch|platform/buyermatch|account-status|isolated-attestation)$',dest:'/isolated'},
      {src:'^/api/.*',status:403},{handle:'filesystem'},{src:'/.*',dest:'/index.html'},
    ]}));
  }
  const edge=path.join(output,'supabase/functions/isolated-billing-webhook');await mkdir(edge,{recursive:true});
  await copyFile(path.join(output,'webhook.mjs'),path.join(edge,'webhook.mjs'));
  await copyFile(path.join(output,'edge-index.ts'),path.join(edge,'index.ts'));
  await writeFile(path.join(output,'supabase/config.toml'),'[functions.isolated-billing-webhook]\nverify_jwt = false\n');
  return {profile:ID,source:p.source,profileDigest:digest(p),output};
}
// Explicit invocation is local build only; it cannot provision, deploy or open issuance.
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const p=JSON.parse(await readFile(process.argv[2],'utf8'));console.log(JSON.stringify(await buildIsolated(p,process.argv[3])));
}
