import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  S2_RELEASE as S2,
  QA_DOCUMENTS,
  REQUIRED_S2_ENV,
  pausedS2Manifest,
  validateS2Manifest,
  s2DeploymentArgs,
  verifyQAAgreements,
  verifyS2Deployment,
} from '../../scripts/buyermatch-s2-release.mjs';
import {
  runPinnedCli,
  commandEvidence,
  cliJson,
} from '../../scripts/buyermatch-s2-process.mjs';
import {
  closeS2Run,
  armS2Cleanup,
} from '../../scripts/buyermatch-s2-cleanup.mjs';

const agreements = () => ({
  required: true,
  documents: QA_DOCUMENTS.map((d) => ({
    ...d,
    content: `SYNTHETIC QA FIXTURE ONLY — ${d.kind}. This is not a legal agreement, fee authorization, contract, or approval to contact real buyers. Used only to exercise version acceptance in isolated staging. No success fees are payable.`,
  })),
});
const runId = '126dd0de-a2ae-499b-8f55-3cc1563e9537';
function evidence() {
  return {
    deployment: {
      id: 'dpl_SyntheticRun',
      projectId: S2.project,
      ownerId: S2.team,
      readyState: 'READY',
      target: null,
      meta: { githubCommitSha: S2.source, s2RunId: runId },
      alias: [],
    },
    cliTarget: 'preview',
    project: {
      id: S2.project,
      accountId: S2.team,
      gitLinked: false,
      protection: 'all',
      bypassCount: 0,
    },
    actualEnv: {
      deploymentId: 'dpl_SyntheticRun',
      runtime: { ...REQUIRED_S2_ENV },
      build: { ...REQUIRED_S2_ENV },
    },
    services: {
      account: S2.account,
      livemode: false,
      endpoint: S2.endpoint,
      endpointDisabled: true,
      receiverPaused: true,
      credentialProvenanceVerified: true,
      unexpectedCredentialCount: 0,
      portal: S2.portal,
      callbackOrigin: S2.origin,
      prices: [
        { id: S2.starter, unit_amount: 5900 },
        { id: S2.pro, unit_amount: 11900 },
      ].map((p) => ({
        ...p,
        livemode: false,
        active: true,
        currency: 'usd',
        interval: 'month',
        quantity: 1,
      })),
    },
    agreements: agreements(),
    protectedGet: true,
    registrationPaused: true,
    checkoutPaused: true,
  };
}
test('manifest reproduces original omitted and false agreement override as rejection', () => {
  for (const v of [undefined, 'false']) {
    const m = pausedS2Manifest();
    if (v === undefined)
      delete m.runtime.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS;
    else m.runtime.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS = v;
    assert.throws(() => validateS2Manifest(m));
  }
});
for (const scope of ['runtime', 'build'])
  test(`manifest requires every ${scope} setting explicitly`, () => {
    for (const k of Object.keys(REQUIRED_S2_ENV)) {
      const m = pausedS2Manifest();
      delete m[scope][k];
      assert.throws(() => validateS2Manifest(m));
    }
  });
test('manifest rejects unknown secret, top-level field, scope mismatch and activated Checkout', () => {
  for (const mutate of [
    (m) => (m.runtime.STRIPE_SECRET_KEY = 'DUMMY_PRIVATE'),
    (m) => (m.extra = true),
    (m) => (m.build.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS = 'false'),
    (m) => (m.runtime.BM_CHECKOUT_ENABLED = 'true'),
    (m) => (m.target = 'production'),
    (m) => (m.runtime.PUBLIC_APP_URL += '/'),
    (m) =>
      (m.runtime.SUPABASE_URL = 'https://aigvnbxiydbzzqbetlhl.supabase.co'),
  ]) {
    const m = pausedS2Manifest();
    mutate(m);
    assert.throws(
      () => validateS2Manifest(m),
      (e) => !e.message.includes('DUMMY'),
    );
  }
});
test('deterministic argv overrides false defaults in both scopes without shell quoting', () => {
  const argv = s2DeploymentArgs(
    pausedS2Manifest(),
    'C:/synthetic source',
    runId,
  );
  assert.deepEqual(
    argv,
    s2DeploymentArgs(pausedS2Manifest(), 'C:/synthetic source', runId),
  );
  assert.equal(argv[1], 'C:/synthetic source');
  assert.equal(argv.includes('--prod'), false);
  assert.equal(
    argv.filter((v) => v === 'DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS=true')
      .length,
    2,
  );
  const effective = { DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS: 'false' };
  for (let i = 0; i < argv.length; i++)
    if (argv[i] === '--env') {
      const [k, v] = argv[i + 1].split('=');
      effective[k] = v;
    }
  assert.equal(effective.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS, 'true');
});
test('argv rejects option injection, newlines and malformed run identity', () => {
  for (const path of ['--prod', 'bad\npath', ''])
    assert.throws(() => s2DeploymentArgs(pausedS2Manifest(), path, runId));
  assert.throws(() =>
    s2DeploymentArgs(pausedS2Manifest(), 'source', 'not-a-uuid'),
  );
});
test('exact QA fixture versions and actual content hashes pass', () =>
  assert.equal(verifyQAAgreements(agreements()), true));
test('HTTP200-shaped discovery with guard false, missing, duplicate, changed or extra documents fails', () => {
  for (const mutate of [
    (x) => (x.required = false),
    (x) => x.documents.pop(),
    (x) => x.documents.push(x.documents[0]),
    (x) => (x.documents[0].version = 'unapproved'),
    (x) => (x.documents[0].content += 'altered'),
    (x) => (x.documents[0].id = x.documents[1].id),
    (x) => (x.documents[0].document_hash = '0'.repeat(64)),
  ]) {
    const x = agreements();
    mutate(x);
    assert.throws(() => verifyQAAgreements(x));
  }
});
test('actual deployment verification accepts complete independent evidence', () =>
  assert.equal(
    verifyS2Deployment(pausedS2Manifest(), evidence()).verified,
    true,
  ));
test('READY/source metadata or project defaults alone cannot establish runtime guards', () => {
  for (const mutate of [
    (e) => delete e.actualEnv,
    (e) => (e.actualEnv.deploymentId = 'other'),
    (e) =>
      (e.actualEnv.runtime.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS = 'false'),
    (e) =>
      (e.actualEnv.build.DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS = 'false'),
    (e) => (e.agreements.required = false),
    (e) => (e.cliTarget = 'production'),
    (e) => (e.deployment.target = 'production'),
    (e) => (e.project.bypassCount = 1),
    (e) => (e.services.receiverPaused = false),
    (e) => (e.services.prices[1].quantity = 2),
    (e) => (e.services.credentialProvenanceVerified = false),
    (e) => (e.deployment.alias = ['existing']),
  ]) {
    const e = evidence();
    mutate(e);
    assert.throws(() => verifyS2Deployment(pausedS2Manifest(), e));
  }
});

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const fixture = resolve('tests/fixtures/s2-native-stderr.mjs');
const pinned = (entryPath = fixture) => ({
  nodePath: process.execPath,
  nodeSha256: sha(process.execPath),
  entryPath,
  entrySha256: sha(entryPath),
  args: [],
});
test('actual native process accepts informational stderr with exit0 and keeps streams separate', async () => {
  const r = await runPinnedCli(pinned());
  assert.equal(r.status, 'exited');
  assert.equal(r.exitCode, 0);
  assert.ok(r.stderr.includes('Synthetic CLI progress'));
  assert.deepEqual(cliJson(r), { synthetic: true });
  const report = JSON.stringify(commandEvidence(r));
  assert.equal(report.includes('Synthetic CLI progress'), false);
});
test(
  'actual Windows PowerShell5 reproduces legacy failure and corrected pinned-process success (no provider calls)',
  { skip: process.platform !== 'win32' },
  () => {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        resolve('tests/fixtures/s2-native-stderr.ps1'),
        '-Node',
        process.execPath,
        '-Fixture',
        fixture,
        '-Corrected',
        resolve('tests/fixtures/s2-process-wrapper.mjs'),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.ok(out.includes('LEGACY_CAUGHT_NATIVE_STDERR'));
    assert.equal(out.includes('LEGACY_COMPLETED'), false);
    assert.ok(out.includes('CORRECTED_STREAM_HANDLING_PASS'));
  },
);
test('substitution and secret argv rejected before launch', async () => {
  await assert.rejects(
    runPinnedCli({ ...pinned(), entrySha256: '0'.repeat(64) }),
  );
  await assert.rejects(
    runPinnedCli({ ...pinned(), args: ['--token', 'DUMMY_PRIVATE'] }),
  );
});
test('actual nonzero exit, malformed output, timeout and output overflow stay failures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dbp-s2-dummy-'));
  try {
    for (const [body, expected] of [
      ["process.stdout.write('not-json');process.exit(0)", 'invalid-json'],
      ["process.stderr.write('DUMMY_PRIVATE');process.exit(7)", 'nonzero'],
      ['setInterval(()=>{},1000)', 'timeout'],
      ["process.stdout.write('x'.repeat(1024))", 'output-limit'],
    ]) {
      const path = join(dir, randomUUID() + '.mjs');
      writeFileSync(path, body);
      const r = await runPinnedCli({
        ...pinned(path),
        timeoutMs: expected === 'timeout' ? 150 : 3000,
        maxBytes: expected === 'output-limit' ? 32 : 4096,
      });
      if (expected === 'invalid-json' || expected === 'nonzero')
        assert.throws(() => cliJson(r));
      else assert.equal(r.status, expected);
      assert.equal(
        JSON.stringify(commandEvidence(r)).includes('DUMMY_PRIVATE'),
        false,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function cleanupFixture() {
  const r = {
    runId,
    deploymentId: 'dpl_SyntheticRun',
    source: S2.source,
    project: S2.project,
    team: S2.team,
    preexistingDeploymentIds: [S2.fallback],
    fallbackId: S2.fallback,
    alias: new URL(S2.origin).hostname,
  };
  const state = { ...evidence().deployment, kind: 'found' },
    calls = [],
    journal = [];
  let gone = false,
    aliasId = r.fallbackId;
  const safe = {
    endpointDisabled: true,
    receiverPaused: true,
    registrationPaused: true,
    checkoutPaused: true,
    liveBillingPaused: true,
    deliveryDisabled: true,
    protectionEnabled: true,
  };
  const adapter = {
    verifyAuthority: async () => ({
      project: S2.project,
      team: S2.team,
      account: S2.account,
      livemode: false,
    }),
    disableEndpoint: async () => calls.push('endpoint'),
    pauseReceiver: async () => calls.push('receiver'),
    readSafetyState: async () => ({ ...safe }),
    readAlias: async () => ({ projectId: S2.project, deploymentId: aliasId }),
    readDeployment: async (id) =>
      id === r.fallbackId
        ? {
            kind: 'found',
            id,
            projectId: S2.project,
            ownerId: S2.team,
            target: null,
            readyState: 'READY',
            registrationPaused: true,
            checkoutPaused: true,
            protectionEnabled: true,
          }
        : gone
          ? { kind: 'not-found', httpStatus: 404, deploymentId: id }
          : { ...state },
    restoreAlias: async () => {
      calls.push('alias');
      aliasId = r.fallbackId;
    },
    removeDeployment: async () => {
      calls.push('remove');
      gone = true;
    },
  };
  return {
    r,
    adapter,
    calls,
    journal,
    state,
    safe,
    options: { timeoutMs: 30, journal: async (e) => journal.push(e) },
    setGone: () => {
      gone = true;
    },
    setAlias: (id) => {
      aliasId = id;
    },
  };
}
test('cleanup requires independent404, both gates, exact identity and durable completion', async () => {
  const f = cleanupFixture();
  const r = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(r.verified, true);
  assert.equal(r.temporaryDeploymentGone, true);
  assert.deepEqual(f.calls, ['endpoint', 'receiver', 'remove']);
  assert.deepEqual(f.journal.at(-1), {
    runId,
    deploymentId: f.r.deploymentId,
    stage: 'complete',
    status: 'verified',
  });
});
test('successful command with deployment still present is UNKNOWN/failure', async () => {
  const f = cleanupFixture();
  f.adapter.removeDeployment = async () => {};
  const r = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(r.verified, false);
  assert.equal(r.temporaryDeploymentGone, false);
});
test('idempotent operator/watchdog close accepts verified prior deletion without deleting anything', async () => {
  const f = cleanupFixture();
  f.setGone();
  const r = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(r.verified, true);
  assert.equal(f.calls.includes('remove'), false);
});
test('simultaneous same-run cleanup coalesces; only one removal', async () => {
  const f = cleanupFixture();
  const [a, b] = await Promise.all([
    closeS2Run(f.r, f.adapter, f.options),
    closeS2Run(f.r, f.adapter, f.options),
  ]);
  assert.equal(a.verified, true);
  assert.equal(b.verified, true);
  assert.equal(f.calls.filter((x) => x === 'remove').length, 1);
});
test('alias moved by this run restored only to verified fallback before removal', async () => {
  const f = cleanupFixture();
  f.setAlias(f.r.deploymentId);
  const r = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(r.verified, true);
  assert.deepEqual(f.calls, ['endpoint', 'receiver', 'alias', 'remove']);
});
for (const mode of ['error', 'timeout'])
  test(`partial ${mode} still attempts other closure, rereads and reports operator required`, async () => {
    const f = cleanupFixture();
    f.adapter.disableEndpoint = async () => {
      throw Error('DUMMY_PRIVATE');
    };
    if (mode === 'timeout')
      f.adapter.disableEndpoint = () => new Promise(() => {});
    const r = await closeS2Run(f.r, f.adapter, f.options);
    assert.equal(r.verified, false);
    assert.ok(f.calls.includes('receiver'));
    assert.ok(r.steps.some((x) => x.stage === 'safety-read'));
    assert.equal(JSON.stringify(r).includes('DUMMY_PRIVATE'), false);
  });
test('delete permission denial and unknown lookup are not interpreted as not-found', async () => {
  for (const failRead of [false, true]) {
    const f = cleanupFixture();
    if (failRead)
      f.adapter.readDeployment = async () => {
        throw Error('permission denied');
      };
    else
      f.adapter.removeDeployment = async () => {
        throw Error('permission denied');
      };
    const r = await closeS2Run(f.r, f.adapter, f.options);
    assert.equal(r.verified, false);
    assert.equal(r.temporaryDeploymentGone, false);
  }
});
test('untrusted404 or wrong object cannot establish removal', async () => {
  for (const response of [
    { kind: 'not-found', httpStatus: 403, deploymentId: 'dpl_SyntheticRun' },
    { kind: 'not-found', httpStatus: 404, deploymentId: 'dpl_Other' },
    null,
  ]) {
    const f = cleanupFixture();
    f.adapter.readDeployment = async () => response;
    assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
  }
});
test('unsafe, unknown or failed final state cannot pass even after removal', async () => {
  for (const k of Object.keys(cleanupFixture().safe)) {
    const f = cleanupFixture();
    f.safe[k] = false;
    assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
  }
  const f = cleanupFixture();
  f.adapter.readSafetyState = async () => {
    throw Error('private');
  };
  assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
});
test('journal failure preserves cleanup attempts and remains unverified', async () => {
  const f = cleanupFixture();
  const r = await closeS2Run(f.r, f.adapter, {
    ...f.options,
    journal: async () => {
      throw Error('disk unavailable');
    },
  });
  assert.equal(r.verified, false);
  assert.equal(r.journalFailed, true);
  assert.ok(f.calls.includes('remove'));
});
test('unknown alias, extra alias, changed source/run/project never deletes', async () => {
  for (const mutate of [
    (f) => f.setAlias('dpl_Other'),
    (f) => (f.state.alias = ['unrelated']),
    (f) => (f.state.projectId = 'other'),
    (f) => (f.state.meta = { ...f.state.meta, s2RunId: randomUUID() }),
    (f) => (f.state.meta = { ...f.state.meta, githubCommitSha: 'other' }),
  ]) {
    const f = cleanupFixture();
    mutate(f);
    assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
    assert.equal(f.calls.includes('remove'), false);
  }
});
test('prior, protected, foreign and incomplete receipts cause zero provider operations', async () => {
  for (const mutate of [
    (r) => (r.deploymentId = r.fallbackId),
    (r) => (r.deploymentId = 'dpl_Cp9qXVBXtSGozPRKQ7p3atTCF7Hi'),
    (r) => (r.project = 'other'),
    (r) => delete r.runId,
    (r) => (r.extra = 'value'),
  ]) {
    const f = cleanupFixture();
    mutate(f.r);
    await assert.rejects(closeS2Run(f.r, f.adapter, f.options));
    assert.deepEqual(f.calls, []);
  }
});
test('wrong provider authority causes no mutations', async () => {
  const f = cleanupFixture();
  f.adapter.verifyAuthority = async () => ({
    project: S2.project,
    team: S2.team,
    account: 'wrong',
    livemode: false,
  });
  assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
  assert.deepEqual(f.calls, []);
});
test('watchdog deadline and explicit operator close run same closure without activation', async () => {
  for (const explicit of [false, true]) {
    const f = cleanupFixture();
    const w = armS2Cleanup(f.r, f.adapter, { ...f.options, deadlineMs: 10 });
    if (explicit) w.close();
    assert.equal((await w.completion).verified, true);
    assert.deepEqual(f.calls, ['endpoint', 'receiver', 'remove']);
  }
});
test('interrupted remove with later verified deletion needs a separate idempotent close, retaining failed evidence', async () => {
  const f = cleanupFixture();
  f.adapter.removeDeployment = async () => {
    f.setGone();
    throw Error('transport interrupted');
  };
  const first = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(first.temporaryDeploymentGone, true);
  assert.equal(first.verified, false);
  const second = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(second.verified, true);
  assert.ok(
    f.journal.some(
      (e) => e.stage === 'complete' && e.status === 'operator-required',
    ),
  );
});
test('failed fallback and missing adapter never count as watchdog success', async () => {
  const f = cleanupFixture();
  f.setAlias(f.r.deploymentId);
  const original = f.adapter.readDeployment;
  f.adapter.readDeployment = async (id) =>
    id === f.r.fallbackId ? null : original(id);
  const result = await closeS2Run(f.r, f.adapter, f.options);
  assert.equal(result.verified, false);
  assert.equal(f.calls.includes('remove'), false);
  delete f.adapter.disableEndpoint;
  await assert.rejects(closeS2Run(f.r, f.adapter, f.options));
  assert.equal(
    result.steps.some((e) => e.stage === 'complete' && e.status === 'verified'),
    false,
  );
});
test('fallback without actual paused/protected evidence cannot be assigned', async () => {
  for (const key of [
    'registrationPaused',
    'checkoutPaused',
    'protectionEnabled',
  ]) {
    const f = cleanupFixture();
    f.setAlias(f.r.deploymentId);
    const read = f.adapter.readDeployment;
    f.adapter.readDeployment = async (id) => {
      const value = await read(id);
      if (id === f.r.fallbackId) delete value[key];
      return value;
    };
    assert.equal((await closeS2Run(f.r, f.adapter, f.options)).verified, false);
    assert.equal(f.calls.includes('alias'), false);
    assert.equal(f.calls.includes('remove'), false);
  }
});

test('actual watchdog child termination leaves incomplete durable evidence, never cleanup PASS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dbp-s2-death-'));
  try {
    const journal = join(dir, 'dummy-journal.jsonl');
    const entry = resolve('tests/fixtures/s2-watchdog-process.mjs');
    const result = await runPinnedCli({
      ...pinned(entry),
      args: [journal],
      timeoutMs: 1500,
    });
    assert.equal(result.status, 'timeout');
    assert.ok(result.stdout.includes('SYNTHETIC_WATCHDOG_PROCESS_STARTED'));
    const events = readFileSync(journal, 'utf8')
      .trim()
      .split('\n')
      .map((x) => JSON.parse(x));
    assert.equal(
      events.some((e) => e.stage === 'complete' && e.status === 'verified'),
      false,
    );
    assert.equal(events[0].stage, 'process-started');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
