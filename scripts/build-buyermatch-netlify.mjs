// Offline packaging only: no CLI login, provider API, resource creation or deploy.
import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { syntheticProject } from '../server/netlify/profile.mjs';
import { legalReceipt } from '../server/netlify/production.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function bundleNetlifyFunction({ assets, ref, anonKey, verificationOnly, outfile, production = false, legal = null, sourceHead = '' }) {
  const imports = {
    buyermatch: 'server/http/buyermatch.ts', 'buyermatch-buyer': 'server/http/buyermatch-buyer.ts',
    'account-status': 'api/account-status.ts', 'register-account': 'api/register-account.ts',
  };
  // Absolute filesystem imports are understood on both Windows and Unix by esbuild.
  let source = `import {createGateway} from ${JSON.stringify(path.join(root, 'server/netlify/gateway.mjs'))};\n`;
  source += `import {bindNetlifyOrigin} from ${JSON.stringify(path.join(root, 'server/netlify/profile.mjs'))};\n`;
  source += `import {productionProfile,verifyProductionAgreements} from ${JSON.stringify(path.join(root, 'server/netlify/production.mjs'))};\n`;
  source += `import {getSupabaseAdminClient} from ${JSON.stringify(path.join(root, 'api/_accountAuth.ts'))};\n`;
  let i = 0; const mapping = [];
  for (const [name, file] of Object.entries(imports)) {
    source += `import h${i} from ${JSON.stringify(path.join(root, file))};\n`; mapping.push(`${JSON.stringify(name)}:h${i++}`);
  }
  source += `import process from 'node:process';\nconst assets=${JSON.stringify(assets)};\n`;
  source += `const gateway=createGateway({handlers:{${mapping.join(',')}},assets,env:process.env${production ? `,validateProfile:(env,context)=>productionProfile(env,context,${JSON.stringify(legal)},${JSON.stringify(sourceHead)}),accessCheck:()=>({allowed:true}),beforeDispatch:async(name,input)=>{if(name==='buyermatch'&&['onboarding','onboarding-accept'].includes(input.action))await verifyProductionAgreements(getSupabaseAdminClient(),${JSON.stringify(legal)})}` : ''}});\n`;
  source += `export default function(request,context){if(${verificationOnly}||process.env.BM_NETLIFY_SUPABASE_REF!==${JSON.stringify(ref)}||process.env.VITE_SUPABASE_ANON_KEY!==${JSON.stringify(anonKey)})return new Response('Build binding mismatch',{status:503,headers:{'Cache-Control':'no-store'}});${production ? '' : "try{bindNetlifyOrigin(process.env,context)}catch{return new Response('Private preview unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}"}return gateway(request,context)};\n`;
  await bundle({ stdin: { contents: source, resolveDir: root, sourcefile: 'netlify-entry.mjs' }, bundle: true,
    platform: 'node', target: 'node22', format: 'esm', outfile, sourcemap: false,
    banner: { js: "import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);" },
    plugins: [{ name: 'disabled-s2-attestation', setup(build) {
      build.onResolve({ filter: /s2-build-attestation\.json$/ }, () => ({ path: 'disabled', namespace: 'disabled-s2' }));
      build.onLoad({ filter: /.*/, namespace: 'disabled-s2' }, () => ({ contents: '{"enabled":false}', loader: 'json' }));
    } }] });
}
export async function buildNetlify({ ref, anonKey, verificationOnly = false, production = false }) {
  const publicUrl = syntheticProject(ref);
  if (!anonKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey)) throw Error('Synthetic project publishable key required');
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const paths = ['api', 'server', 'src', 'public', 'netlify.toml', 'package.json', 'package-lock.json',
    'vite.config.mjs', 'scripts/build-buyermatch-netlify.mjs', 'netlify.production.toml', 'docs/legal/buyermatch-review-v0.1'];
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim();
  if (!verificationOnly && dirty) throw Error('Commit executable source before creating a deployment package');
  let legal = null; const legalTexts = {};
  if (production && !verificationOnly) {
    const directory = path.join(root, 'docs/legal/buyermatch-review-v0.1');
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    for (const name of ['TERMS.md', 'PRIVACY.md', 'REFUNDS.md', 'RENEWAL_CANCELLATION.md']) legalTexts[name] = await readFile(path.join(directory, name), 'utf8');
    legal = legalReceipt(manifest, legalTexts);
  }
  const output = path.join(root, production ? '.netlify/buyermatch-production' : '.netlify/buyermatch');
  await mkdir(output, { recursive: true });
  const work = await mkdtemp(path.join(output, 'build-'));
  await viteBuild({ root, configFile: path.join(root, 'vite.config.mjs'), envDir: false, envPrefix: [], logLevel: 'warn',
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(publicUrl), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey), 'import.meta.env.VITE_BM_NETLIFY_PRODUCTION_PROFILE': JSON.stringify(production ? 'true' : 'false') },
    build: { outDir: path.join(work, 'static'), emptyOutDir: false, sourcemap: false } });
  const assets = {};
  async function collect(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Symlink rejected');
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await collect(path.join(dir, entry.name), name);
      else {
        if (/\.map$|\.env|\.pem$|\.sql$|\.sqlite|\.db$/i.test(name)) throw Error('Private artifact rejected');
        assets[name] = (await readFile(path.join(dir, entry.name))).toString('base64');
      }
    }
  }
  await collect(path.join(work, 'static'));
  if (production && legal) {
    for (const [name, file] of [['terms', 'TERMS.md'], ['privacy', 'PRIVACY.md'], ['refunds', 'REFUNDS.md'], ['renewal', 'RENEWAL_CANCELLATION.md']])
      assets[`/legal/${name}.txt`] = Buffer.from(legalTexts[file]).toString('base64');
    const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    for (const [route, file] of [['/terms', 'TERMS.md'], ['/privacy', 'PRIVACY.md'], ['/refund-policy', 'REFUNDS.md'], ['/renewal-cancellation', 'RENEWAL_CANCELLATION.md']])
      assets[route] = Buffer.from(`<!doctype html><meta charset="utf-8"><title>BuyerMatch legal document</title><pre style="white-space:pre-wrap">${escape(legalTexts[file])}</pre>`).toString('base64');
  }
  const functions = path.join(output, 'functions'); await mkdir(functions, { recursive: true });
  const outfile = path.join(functions, 'buyermatch.mjs');
  await bundleNetlifyFunction({ assets, ref, anonKey, verificationOnly, outfile, production, legal, sourceHead });
  const publish = path.join(output, 'publish'); await mkdir(publish, { recursive: true });
  await writeFile(path.join(publish, 'index.html'), '<!doctype html><title>Private preview unavailable</title>Private preview unavailable.');
  const bytes = await readFile(outfile);
  if (bytes.length > 40000000) throw Error('Function package exceeds local safety ceiling');
  const manifest = { schema: production ? 'buyermatch-netlify-production-v1' : 'buyermatch-netlify-private-v1', baseline: '46ec035e0c53c07723f54a424d39ad1b8522fa85',
    sourceHead, executableSourceDirty: Boolean(dirty),
    verificationOnly, hostedVerified: false, deploymentAuthorized: false, assets: Object.keys(assets).length,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    publishContainsApplication: false, billing: 'disabled', distribution: 'disabled', syntheticProject: ref };
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), verificationOnly = args.includes('--verify-local'), production = args.includes('--production-profile');
  if (new Set(args).size !== args.length || args.some(arg => !['--verify-local', '--production-profile'].includes(arg))) throw Error('Unsupported argument');
  const result = await buildNetlify({ verificationOnly, production,
    ref: verificationOnly ? 'abcdefghijklmnopqrst' : process.env.BM_NETLIFY_SUPABASE_REF,
    anonKey: verificationOnly ? 'sb_publishable_offline_verification_only' : process.env.VITE_SUPABASE_ANON_KEY });
  console.log(JSON.stringify(result));
}
