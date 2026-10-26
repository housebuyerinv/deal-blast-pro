import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { verifyBindingMetadata } from './s2-mvp-binding-metadata.mjs';
import { sha } from './s2-canary-provider.mjs';
import { makeMvpProvider } from './s2-mvp-provider.mjs';
import {
  MVP_SOURCE,
  MVP_ALIAS,
  WINDOW_MS,
  requirePaused,
  requireFallback,
} from './s2-mvp-routing.mjs';
import {
  S2_RELEASE as S2,
  s2AttestationDeploymentArgs,
  REQUIRED_S2_ENV,
} from '../buyermatch-s2-release.mjs';
// This flag is an operator acknowledgement, NOT a source of authorization.
// Independently verify actual owner approval of the exact packet before invocation.
const [acknowledgement, approvalComment, packetSha, recoveryPath, recoveryHash] = process.argv.slice(2);
if (
  process.argv.length !== 7 ||
  acknowledgement !== '--execute-after-owner-approval' ||
  !/^\d+$/.test(approvalComment ?? '') ||
  Number(approvalComment) <= 6403897425 ||
  !/^[a-f0-9]{40}$/.test(packetSha ?? '') || !recoveryPath || !/^[a-f0-9]{64}$/.test(recoveryHash ?? '')
) {
  process.stdout.write('PENDING_OWNER_APPROVAL_NO_PROVIDER_OPERATIONS\n');
  process.exit(2);
}
const requiredOperatorFiles = [
  'scripts/testing/s2-mvp-routing.mjs',
  'scripts/testing/s2-mvp-provider.mjs',
  'scripts/testing/s2-mvp-watchdog.mjs',
  'scripts/testing/s2-mvp-launcher.mjs',
  'scripts/testing/s2-canary-provider.mjs',
  'scripts/testing/s2-canary-http-observer.mjs',
  'scripts/testing/s2-canary-pauses.mjs',
  'scripts/buyermatch-s2-release.mjs',
  'scripts/testing/s2-mvp-bindings.mjs',
  'scripts/testing/s2-mvp-binding-metadata.mjs',
  'scripts/testing/s2-mvp-preparer.mjs',
  'scripts/testing/s2-mvp-deploy.mjs',
  'scripts/testing/s2-secret-recovery-core.mjs',
  'scripts/testing/s2-private-json-child.mjs',
  'scripts/testing/s2-private-seed-source.ps1',
  'scripts/testing/s2-secret-recovery-session.mjs',
  'scripts/testing/s2-receiver-pause-readback.mjs',
];
const runId = randomUUID(),
  dir = resolve('artifacts/buyermatch-1b/mvp-acceptance-' + runId);
mkdirSync(dir);
const save = (n, v) =>
  writeFileSync(resolve(dir, n), JSON.stringify(v, null, 2) + '\n', {
    flag: 'wx',
  });
const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
let phase = 'source-and-pins';
try {
  if (git(['status', '--porcelain']).trim()) throw Error();
  git(['merge-base', '--is-ancestor', packetSha, 'HEAD']);
  const request = JSON.parse(
    git(['show', packetSha + ':docs/BUYERMATCH_S2_SECRET_RECOVERY_REQUEST.json']),
  );
  if (
    request.status !== 'PENDING_OWNER_APPROVAL_NO_EXECUTION' || request.executionReady !== true ||
    request.source !== MVP_SOURCE ||
    request.project !== S2.project ||
    request.team !== S2.team ||
    request.target !== 'preview' ||
    request.alias !== MVP_ALIAS ||
    request.rollbackDeployment !== S2.fallback ||
    request.maxReadOnlyWindowMinutes !== 30 ||
    request.additionalBudgetUsd !== 0
  )
    throw Error();
  if (
    !Array.isArray(request.protectedDeploymentIds) ||
    request.protectedDeploymentIds.length !== 9 ||
    new Set(request.protectedDeploymentIds).size !== 9 ||
    !request.protectedDeploymentIds.includes(S2.fallback) ||
    !request.protectedDeploymentIds.every((id) => /^dpl_[A-Za-z0-9]+$/.test(id))
  )
    throw Error();
  for (const scope of ['runtime', 'build'])
    if (
      Object.keys(request[scope] ?? {}).length !== 17 ||
      Object.entries(REQUIRED_S2_ENV).some(([k, v]) => request[scope][k] !== v)
    )
      throw Error();
  const expectedPins = request.operatorPins;
  if (
    !expectedPins ||
    Object.keys(expectedPins).sort().join('|') !==
      requiredOperatorFiles.sort().join('|') ||
    !Object.values(expectedPins).every((h) => /^[a-f0-9]{64}$/.test(h))
  )
    throw Error();
  for (const [f, h] of Object.entries(expectedPins))
    if (sha(readFileSync(f)) !== h) throw Error();
  const operatorPins = Object.fromEntries(
    Object.entries(expectedPins).map(([f, h]) => [resolve(f), h]),
  );
  const sourceDirectory = realpathSync(
      mkdtempSync(join(tmpdir(), 'dbp-s2-mvp-b998-')),
    ),
    archive = resolve(dir, 'approved-source.tar');
  git([
    '-c',
    'core.autocrlf=false',
    'archive',
    '--format=tar',
    '--output',
    archive,
    MVP_SOURCE,
  ]);
  execFileSync('tar.exe', ['-xf', archive, '-C', sourceDirectory], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let inGit = false;
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: sourceDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    inGit = true;
  } catch {
    // A fresh source export must be outside any linked Git checkout.
  }
  if (inGit) throw Error();
  const tree = git(['ls-tree', '-r', '-z', MVP_SOURCE])
    .split('\0')
    .filter(Boolean);
  for (const e of tree) {
    const [h, f] = e.split('\t'),
      [mode, type, hash] = h.split(' ');
    if (
      type !== 'blob' ||
      !['100644', '100755'].includes(mode) ||
      f.startsWith('/') ||
      f.split('/').includes('..')
    )
      throw Error();
    const b = readFileSync(resolve(sourceDirectory, f));
    if (
      createHash('sha1')
        .update(Buffer.from('blob ' + b.length + '\0'))
        .update(b)
        .digest('hex') !== hash
    )
      throw Error();
  }
  const config = JSON.parse(
    readFileSync(resolve(sourceDirectory, 'vercel.json')),
  );
  if (
    config.git?.deploymentEnabled?.['codex/buyermatch-1b-integration'] !==
      false ||
    config.functions?.['api/platform/*.ts']?.includeFiles !==
      'server/generated/s2-build-attestation.json'
  )
    throw Error();
  const args = s2AttestationDeploymentArgs(sourceDirectory, runId, MVP_SOURCE),
    cli =
      'C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
  for (const [k, v] of Object.entries(REQUIRED_S2_ENV))
    for (const flag of ['--env', '--build-env'])
      if (!args.some((x, i) => x === flag && args[i + 1] === k + '=' + v))
        throw Error();
  phase = 'supported-dry-inspection';
  const dry = JSON.parse(
    execFileSync(process.execPath, [cli, ...args, '--dry'], {
      cwd: sourceDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45000,
      maxBuffer: 4194304,
    }),
  );
  if (!Array.isArray(dry.files)) throw Error();
  save('dry-inspection.json', {
    passed: true,
    fileCount: dry.fileCount,
    totalSize: dry.totalSize,
    noDeploymentCreated: true,
  });
  const initialTime = Date.now();
  const p = {
    schema: 1,
    source: MVP_SOURCE,
    project: S2.project,
    team: S2.team,
    alias: MVP_ALIAS,
    fallback: S2.fallback,
    windowMs: WINDOW_MS,
    runId,
    startedAt: initialTime,
    discoveryDeadline: initialTime + 600000,
    operatorPins,
    preexistingIds: [S2.fallback],
    approvalComment,
    approvedPacket: packetSha,
  };
  const a = makeMvpProvider(p, dir);
  phase = 'read-only-provider-preflight';
  await a.verifyScopeAuthority();
  await a.verifyRoutingAuthority();
  const safety = requirePaused(await a.readSafetyState());
  requireFallback(await a.readDeployment(p.fallback), p);
  const before = await a.readAlias(p.alias);
  if (
    before.projectId !== p.project ||
    before.deploymentId !== p.fallback ||
    (await a.readProjectDomains()).length
  )
    throw Error();
  const budget = await a.readFreePlan();
  if (!budget.hobby) throw Error();
  p.preexistingIds = (await a.readInventory()).map((x) => x.uid ?? x.id);
  if (
    p.preexistingIds.slice().sort().join('|') !==
    request.protectedDeploymentIds.slice().sort().join('|')
  )
    throw Error();
  const api = (path) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [cli, 'api', path, '--scope', S2.scope, '--raw'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000,
          maxBuffer: 2097152,
        },
      ),
    );
  const project = api('/v9/projects/' + p.project);
  if (project.autoExposeSystemEnvs !== true) throw Error();
  const live = api('/v4/aliases/deal-blast-pro.vercel.app');
  if (
    (live.deploymentId ?? live.deployment?.id) !==
    'dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE'
  )
    throw Error();
  phase = 'private-credential-provenance';
  const recoveryRaw = readFileSync(recoveryPath);
  if (sha(recoveryRaw) !== recoveryHash) throw Error();
  const recovery = JSON.parse(recoveryRaw);
  if (recovery.approvalComment !== approvalComment || recovery.packetCommit !== packetSha) throw Error();
  const bindingMetadata = verifyBindingMetadata(
    api('/v10/projects/' + p.project + '/env?decrypt=false&target=preview'),
    recovery,
  );
  const empty = resolve(dir, 'private-env-cwd');
  mkdirSync(empty);
  const osKeys = [
    'SYSTEMROOT',
    'WINDIR',
    'SYSTEMDRIVE',
    'COMSPEC',
    'PATHEXT',
    'PATH',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'HOMEDRIVE',
    'HOMEPATH',
    'USERNAME',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'NUMBER_OF_PROCESSORS',
  ];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      osKeys.includes(k.toUpperCase()),
    ),
  );
  const bindings = JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        'env',
        'run',
        '--project',
        p.project,
        '--environment',
        'preview',
        '--scope',
        S2.scope,
        '--',
        process.execPath,
        resolve('scripts/testing/s2-mvp-bindings.mjs'),
      ],
      {
        cwd: empty,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 45000,
        maxBuffer: 2097152,
      },
    ),
  );
  if (Object.values(bindings).some((v) => v !== true)) throw Error();
  save('preflight.json', {
    status: 'PASS',
    source: MVP_SOURCE,
    sourceDirectory,
    sourceFiles: tree.length,
    dryPassed: true,
    stagingBindings: bindings,
    bindingMetadata,
    safety,
    freePlanVerified: true,
    noProjectDomains: true,
    productionContainmentUnchanged: true,
  });
  save('deployment-args.json', args);
  p.startedAt = Date.now();
  p.discoveryDeadline = p.startedAt + 600000;
  save('plan.json', p);
  const planPath = resolve(dir, 'plan.json'),
    hash = sha(readFileSync(planPath));
  phase = 'start-independent-routing-controller';
  const launched = JSON.parse(
    execFileSync(
      process.execPath,
      ['scripts/testing/s2-mvp-launcher.mjs', planPath, hash],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 },
    ),
  );
  save('launcher-result.json', launched);
  console.log(
    JSON.stringify({
      status: 'PREPARED_CONTROLLER_STARTED',
      dir,
      planHash: hash,
      source: MVP_SOURCE,
      sourceFiles: tree.length,
    }),
  );
} catch {
  save('preparation-failure.json', {
    status: 'STOP_NO_DEPLOYMENT',
    phase,
    at: new Date().toISOString(),
  });
  console.log(JSON.stringify({ status: 'STOP_NO_DEPLOYMENT', phase, dir }));
  process.exitCode = 1;
}
