// Offline packaging only: no CLI login, provider API, resource creation or deploy.
import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { syntheticProject } from '../server/netlify/profile.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function bundleNetlifyFunction({ assets, ref, anonKey, verificationOnly, outfile }) {
  const imports = {
    buyermatch: 'server/http/buyermatch.ts', 'buyermatch-buyer': 'server/http/buyermatch-buyer.ts',
    'account-status': 'api/account-status.ts', 'register-account': 'api/register-account.ts',
  };
  // Absolute filesystem imports are understood on both Windows and Unix by esbuild.
  let source = `import {createGateway} from ${JSON.stringify(path.join(root, 'server/netlify/gateway.mjs'))};\n`;
  source += `import {bindNetlifyOrigin} from ${JSON.stringify(path.join(root, 'server/netlify/profile.mjs'))};\n`;
  let i = 0; const mapping = [];
  for (const [name, file] of Object.entries(imports)) {
    source += `import h${i} from ${JSON.stringify(path.join(root, file))};\n`; mapping.push(`${JSON.stringify(name)}:h${i++}`);
  }
  source += `import process from 'node:process';\nconst assets=${JSON.stringify(assets)};\n`;
  source += `const gateway=createGateway({handlers:{${mapping.join(',')}},assets,env:process.env});\n`;
  source += `export default function(request,context){if(${verificationOnly}||process.env.BM_NETLIFY_SUPABASE_REF!==${JSON.stringify(ref)}||process.env.VITE_SUPABASE_ANON_KEY!==${JSON.stringify(anonKey)})return new Response('Build binding mismatch',{status:503,headers:{'Cache-Control':'no-store'}});try{bindNetlifyOrigin(process.env,context)}catch{return new Response('Private preview unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}return gateway(request,context)};\n`;
  await bundle({ stdin: { contents: source, resolveDir: root, sourcefile: 'netlify-entry.mjs' }, bundle: true,
    platform: 'node', target: 'node22', format: 'esm', outfile, sourcemap: false,
    banner: { js: "import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);" },
    plugins: [{ name: 'disabled-s2-attestation', setup(build) {
      build.onResolve({ filter: /s2-build-attestation\.json$/ }, () => ({ path: 'disabled', namespace: 'disabled-s2' }));
      build.onLoad({ filter: /.*/, namespace: 'disabled-s2' }, () => ({ contents: '{"enabled":false}', loader: 'json' }));
    } }] });
}
export async function buildNetlify({ ref, anonKey, verificationOnly = false }) {
  const publicUrl = syntheticProject(ref);
  if (!anonKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey)) throw Error('Synthetic project publishable key required');
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const paths = ['api', 'server', 'src', 'public', 'netlify.toml', 'package.json', 'package-lock.json',
    'vite.config.mjs', 'scripts/build-buyermatch-netlify.mjs'];
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim();
  if (!verificationOnly && dirty) throw Error('Commit executable source before creating a deployment package');
  const output = path.join(root, '.netlify/buyermatch');
  await mkdir(output, { recursive: true });
  const work = await mkdtemp(path.join(output, 'build-'));
  await viteBuild({ root, configFile: path.join(root, 'vite.config.mjs'), envDir: false, envPrefix: [], logLevel: 'warn',
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(publicUrl), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey) },
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
  const functions = path.join(output, 'functions'); await mkdir(functions, { recursive: true });
  const outfile = path.join(functions, 'buyermatch.mjs');
  await bundleNetlifyFunction({ assets, ref, anonKey, verificationOnly, outfile });
  const publish = path.join(output, 'publish'); await mkdir(publish, { recursive: true });
  await writeFile(path.join(publish, 'index.html'), '<!doctype html><title>Private preview unavailable</title>Private preview unavailable.');
  const bytes = await readFile(outfile);
  if (bytes.length > 40000000) throw Error('Function package exceeds local safety ceiling');
  const manifest = { schema: 'buyermatch-netlify-private-v1', baseline: '46ec035e0c53c07723f54a424d39ad1b8522fa85',
    sourceHead, executableSourceDirty: Boolean(dirty),
    verificationOnly, hostedVerified: false, deploymentAuthorized: false, assets: Object.keys(assets).length,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    publishContainsApplication: false, billing: 'disabled', distribution: 'disabled', syntheticProject: ref };
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const verificationOnly = process.argv[2] === '--verify-local';
  if (process.argv.length > (verificationOnly ? 3 : 2)) throw Error('Unsupported argument');
  const result = await buildNetlify({ verificationOnly,
    ref: verificationOnly ? 'abcdefghijklmnopqrst' : process.env.BM_NETLIFY_SUPABASE_REF,
    anonKey: verificationOnly ? 'sb_publishable_offline_verification_only' : process.env.VITE_SUPABASE_ANON_KEY });
  console.log(JSON.stringify(result));
}
