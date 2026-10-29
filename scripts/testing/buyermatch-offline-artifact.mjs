// Exact-source, credential-free verification artifact. This never deploys.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { APPLICATION_SOURCE } from './buyermatch-source-envelope.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function cleanBuildEnvironment(input = {}) {
  const names = ['PATH', 'SystemRoot', 'SYSTEMROOT', 'USERPROFILE', 'TEMP', 'TMP',
    'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ComSpec', 'PATHEXT'];
  return { ...Object.fromEntries(names.filter(name => typeof input[name] === 'string')
    .map(name => [name, input[name]])), NODE_ENV: 'production' };
}

export async function buildOfflineArtifact(directory) {
  const cache = path.join(repository, 'node_modules/.cache');
  directory = path.resolve(directory);
  if (!directory.startsWith(cache + path.sep)) throw Error('New ignored artifact directory required');
  const source = path.join(directory, 'source'); await mkdir(source);
  const allowed = ['api', 'server', 'src', 'public', 'supabase/functions', 'supabase/migrations',
    'scripts/buyermatch-s2-release.mjs', 'package.json', 'package-lock.json', 'index.html',
    'vite.config.mjs', 'vercel.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
    'tailwind.config.js', 'postcss.config.js'];
  const archive = execFileSync('git', ['archive', '--format=tar', APPLICATION_SOURCE, '--', ...allowed],
    { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 67108864 });
  execFileSync('tar', ['-xf', '-', '-C', source], { input: archive, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  const generated = path.join(source, 'server/generated'); await mkdir(generated, { recursive: true });
  await writeFile(path.join(generated, 's2-build-attestation.json'), '{"enabled":false}\n', { flag: 'wx' });
  const output = path.join(directory, 'artifact'); await mkdir(output);
  await viteBuild({ root: source, configFile: path.join(source, 'vite.config.mjs'),
    envDir: false, envPrefix: [], logLevel: 'warn',
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://build-only.invalid'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_build_verification_only') },
    build: { outDir: path.join(output, 'static'), emptyOutDir: false },
  });
  for (const entry of ['server/http/buyermatch.ts', 'server/http/buyermatch-buyer.ts',
    'server/http/buyermatch-response.ts', 'server/http/buyermatch-worker.ts', 'api/platform/[endpoint].ts']) {
    await esbuild({ entryPoints: [path.join(source, entry)], bundle: true, platform: 'node',
      target: 'node22', format: 'esm', outfile: path.join(output, entry.replace(/\.ts$/, '.mjs')),
      banner: { js: "import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);" } });
  }
  const files = [];
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('Artifact symlink rejected');
      if (entry.isDirectory()) await inspect(absolute);
      else { const bytes = await readFile(absolute); files.push({ path: path.relative(output, absolute).replaceAll('\\', '/'),
        bytes: bytes.length, sha256: hash(bytes) }); }
    }
  }
  await inspect(output); files.sort((a, b) => a.path.localeCompare(b.path));
  const result = { schema: 'buyermatch-offline-build-artifact-v1', source: APPLICATION_SOURCE,
    tree: execFileSync('git', ['rev-parse', `${APPLICATION_SOURCE}^{tree}`], { cwd: repository, encoding: 'utf8' }).trim(),
    state: 'BUILD_VERIFIED_SYNTHETIC_UNBOUND_NOT_DEPLOYMENT_APPROVAL', compiledArtifact: true,
    syntheticPublicBindings: true, dotenvLoaded: false, hostedCalls: false,
    disabledBuildAttestation: true, deployableWithTheseBindings: false,
    nodeTarget: '22', sourceArchiveSha256: hash(archive), files, artifactDigest: hash(JSON.stringify(files)),
    outputDirectory: path.relative(repository, output).replaceAll('\\', '/'),
    originalSourceModified: false, executionAllowed: false };
  await writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--clean-child' && process.argv.length === 4) {
    const result = await buildOfflineArtifact(process.argv[3]);
    const evidence = path.join(repository, 'docs/release-evidence/2026-10-29');
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, 'APPLICATION_OFFLINE_BUILD.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('Exact-source offline artifact built and hashed; no deployment authorized.');
  } else {
    if (process.argv.length !== 2) throw Error('No hosted execution or provider arguments accepted');
    const cache = path.join(repository, 'node_modules/.cache'); await mkdir(cache, { recursive: true });
    const directory = await mkdtemp(path.join(cache, 'buyermatch-app-release-'));
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--clean-child', directory], {
      cwd: repository, env: cleanBuildEnvironment(process.env), timeout: 180000, stdio: 'inherit',
    });
  }
}
