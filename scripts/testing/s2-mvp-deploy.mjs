import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha } from './s2-canary-provider.mjs';
import { validateMvpPlan, MVP_SOURCE } from './s2-mvp-routing.mjs';
import { s2AttestationDeploymentArgs } from '../buyermatch-s2-release.mjs';
const dir = resolve(process.argv[2] ?? 'MISSING'),
  hash = process.argv[3],
  save = (n, v) =>
    writeFileSync(resolve(dir, n), JSON.stringify(v, null, 2) + '\n', {
      flag: 'wx',
    });
let started = false;
try {
  const raw = readFileSync(resolve(dir, 'plan.json'));
  if (!/^[a-f0-9]{64}$/.test(hash ?? '') || sha(raw) !== hash) throw Error();
  const p = validateMvpPlan(JSON.parse(raw)),
    ready = JSON.parse(readFileSync(resolve(dir, 'routing-ready.json'))),
    pre = JSON.parse(readFileSync(resolve(dir, 'preflight.json')));
  if (
    ready.ready !== true ||
    ready.rollbackAuthorityVerified !== true ||
    ready.launcherExited !== true ||
    ready.freePlanVerified !== true ||
    ready.source !== MVP_SOURCE ||
    Date.now() - Date.parse(ready.at) > 120000 ||
    Date.now() >= p.discoveryDeadline ||
    existsSync(resolve(dir, 'deployment-attempt.json')) ||
    existsSync(resolve(dir, 'routing-result.json')) ||
    existsSync(resolve(dir, 'close.request')) ||
    pre.status !== 'PASS'
  )
    throw Error();
  process.kill(ready.pid, 0);
  for (const [f, h] of Object.entries(p.operatorPins))
    if (sha(readFileSync(f)) !== h) throw Error();
  const args = JSON.parse(readFileSync(resolve(dir, 'deployment-args.json')));
  if (
    JSON.stringify(args) !==
    JSON.stringify(
      s2AttestationDeploymentArgs(pre.sourceDirectory, p.runId, MVP_SOURCE),
    )
  )
    throw Error();
  save('deployment-attempt.json', {
    source: MVP_SOURCE,
    at: new Date().toISOString(),
    attempt: 1,
  });
  started = true;
  const out = execFileSync(
    process.execPath,
    [
      'C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js',
      ...args,
    ],
    {
      cwd: pre.sourceDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      maxBuffer: 2097152,
    },
  );
  const urls = [
    ...new Set(
      out.match(
        /https:\/\/dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app/g,
      ) ?? [],
    ),
  ];
  if (urls.length !== 1) throw Error();
  const result = {
    status: 'CLI_ACCEPTED_VERIFY_METADATA',
    source: MVP_SOURCE,
    origin: urls[0],
    at: new Date().toISOString(),
  };
  save('deployment-command-result.json', result);
  console.log(JSON.stringify(result));
} catch (e) {
  save('deployment-command-failure.json', {
    status: 'STOP_NO_RETRY',
    started,
    exitCode: Number.isInteger(e.status) ? e.status : null,
    signal: e.signal ?? null,
    stderrSha256: sha(typeof e.stderr === 'string' ? e.stderr : ''),
    at: new Date().toISOString(),
  });
  if (!existsSync(resolve(dir, 'close.request')))
    writeFileSync(resolve(dir, 'close.request'), 'stop\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'STOP_NO_RETRY', started }));
  process.exitCode = 1;
}
