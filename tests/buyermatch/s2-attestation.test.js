import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import {
  REQUIRED_S2_ENV,
  S2_RELEASE,
  s2AttestationDeploymentArgs,
} from '../../scripts/buyermatch-s2-release.mjs';
import {
  captureS2Build,
  attestS2Runtime,
  ATTESTATION_PATH,
} from '../../server/buyermatch/s2-attestation.js';
import { writeS2BuildArtifact } from '../../scripts/build-buyermatch-s2-attestation.mjs';
import { closeS2Run } from '../../scripts/buyermatch-s2-cleanup.mjs';

const when = new Date('2026-10-23T21:00:00.000Z');
const env = () => ({
  ...REQUIRED_S2_ENV,
  BM_S2_ATTESTATION_ENABLED: 'true',
  VERCEL_ENV: 'preview',
  VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: S2_RELEASE.project,
  VERCEL_DEPLOYMENT_ID: 'dpl_SyntheticAttestation',
  VERCEL_URL: 'dbp-registration-s2-synthetic-housebuyerinv.vercel.app',
  BM_S2_ATTESTATION_SOURCE_SHA: '1'.repeat(40),
  BM_S2_ATTESTATION_RUN_ID: '126dd0de-a2ae-499b-8f55-3cc1563e9537',
});
test('build capture and effective runtime are distinct observations of exactly17 canonical settings', () => {
  const e = env(),
    a = captureS2Build(e, when);
  const r = attestS2Runtime(e, a, when);
  assert.equal(Object.keys(r.build.settings).length, 17);
  assert.deepEqual(r.build.settings, REQUIRED_S2_ENV);
  assert.deepEqual(r.runtime.settings, REQUIRED_S2_ENV);
  assert.equal(r.build.observation, 'build-process-environment');
  assert.equal(r.runtime.observation, 'effective-function-process-environment');
  assert.match(r.sourceProvenance, /external-provider-record-required/);
  assert.ok(r.notObserved.includes('Vercel Authentication policy'));
});
test('every missing, false-default and malformed build/runtime setting fails without echoing values', () => {
  for (const key of Object.keys(REQUIRED_S2_ENV))
    for (const bad of [
      undefined,
      'false-default',
      ' DUMMY_PRIVATE_CREDENTIAL ',
    ]) {
      const e = env();
      if (bad === undefined) delete e[key];
      else e[key] = bad;
      assert.throws(
        () => captureS2Build(e, when),
        (x) => !x.message.includes('DUMMY'),
      );
      assert.throws(
        () => attestS2Runtime(e, captureS2Build(env(), when), when),
        (x) => !x.message.includes('DUMMY'),
      );
    }
});
test('unrelated provider credentials never enter the artifact, report or digest input', () => {
  const e = {
    ...env(),
    STRIPE_SECRET_KEY: 'DUMMY_SECRET_STRIPE',
    SUPABASE_SERVICE_ROLE_KEY: 'DUMMY_SECRET_DB',
    DATABASE_URL: 'DUMMY_PRIVATE_CONNECTION',
    VERCEL_OIDC_TOKEN: 'DUMMY_TOKEN',
  };
  const a = captureS2Build(e, when),
    r = attestS2Runtime(e, a, when);
  assert.equal(JSON.stringify([a, r]).includes('DUMMY'), false);
  assert.deepEqual(a, captureS2Build(env(), when));
});
test('unknown artifact fields and unknown settings are rejected rather than reflected', () => {
  for (const mutate of [
    (a) => (a.secret = 'DUMMY_SECRET'),
    (a) => (a.settings.STRIPE_SECRET_KEY = 'DUMMY_SECRET'),
    (a) => (a.identity.token = 'DUMMY_SECRET'),
  ]) {
    const a = captureS2Build(env(), when);
    mutate(a);
    assert.throws(
      () => attestS2Runtime(env(), a, when),
      (e) => !e.message.includes('DUMMY'),
    );
  }
});
test('stale, future, absent, disabled, wrong schema and tampered build artifacts fail closed', () => {
  const a = captureS2Build(env(), when);
  for (const bad of [
    null,
    {},
    { enabled: false },
    { ...a, schema: 2 },
    { ...a, sha256: '0'.repeat(64) },
  ])
    assert.throws(() => attestS2Runtime(env(), bad, when));
  assert.throws(() =>
    attestS2Runtime(env(), a, new Date(when.getTime() + 3600001)),
  );
  assert.throws(() =>
    attestS2Runtime(env(), a, new Date(when.getTime() - 60001)),
  );
});
test('artifact cannot cross deployment, hostname, source or run; provider Git mismatch denied', () => {
  const a = captureS2Build(env(), when);
  for (const change of [
    { VERCEL_DEPLOYMENT_ID: 'dpl_Other' },
    { VERCEL_URL: 'dbp-registration-s2-other-housebuyerinv.vercel.app' },
    { BM_S2_ATTESTATION_SOURCE_SHA: '2'.repeat(40) },
    { BM_S2_ATTESTATION_RUN_ID: '226dd0de-a2ae-499b-8f55-3cc1563e9537' },
    { VERCEL_GIT_COMMIT_SHA: '3'.repeat(40) },
  ])
    assert.throws(() => attestS2Runtime({ ...env(), ...change }, a, when));
  assert.match(
    attestS2Runtime(
      { ...env(), VERCEL_GIT_COMMIT_SHA: '1'.repeat(40) },
      a,
      when,
    ).sourceProvenance,
    /provider-git-variable/,
  );
});
test('non-Preview, non-S2, missing metadata, Production and disabled opt-in rejected', () => {
  for (const change of [
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'development' },
    { VERCEL_TARGET_ENV: 'production' },
    { VERCEL_PROJECT_ID: 'other' },
    { SUPABASE_URL: 'https://aigvnbxiydbzzqbetlhl.supabase.co' },
    { BM_S2_ATTESTATION_ENABLED: 'false' },
    { VERCEL_DEPLOYMENT_ID: undefined },
    { VERCEL_URL: 'deal-blast-pro.vercel.app' },
    { BM_S2_ATTESTATION_SOURCE_SHA: 'DUMMY_SECRET' },
    { BM_S2_ATTESTATION_RUN_ID: 'not-a-run' },
  ])
    assert.throws(() => captureS2Build({ ...env(), ...change }, when));
});
test('build hook invalidates prior staging snapshot on disabled, Production and interrupted/invalid builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-attestation-'));
  try {
    writeS2BuildArtifact(env(), root, when);
    const path = resolve(root, ATTESTATION_PATH);
    assert.equal(JSON.parse(readFileSync(path)).enabled, true);
    assert.throws(() =>
      writeS2BuildArtifact(
        { ...env(), BM_CHECKOUT_ENABLED: 'true' },
        root,
        when,
      ),
    );
    assert.deepEqual(JSON.parse(readFileSync(path)), { enabled: false });
    writeS2BuildArtifact(env(), root, when);
    assert.deepEqual(
      writeS2BuildArtifact({ VERCEL_ENV: 'production' }, root, when),
      { enabled: false },
    );
    assert.deepEqual(JSON.parse(readFileSync(path)), { enabled: false });
    assert.equal(existsSync(join(root, 'dist', ATTESTATION_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('new-candidate argv carries reviewed source/run/opt-in in both scopes and keeps all17 explicit', () => {
  const e = env(),
    argv = s2AttestationDeploymentArgs(
      'synthetic source',
      e.BM_S2_ATTESTATION_RUN_ID,
      e.BM_S2_ATTESTATION_SOURCE_SHA,
    );
  for (const [k, v] of Object.entries({
    ...REQUIRED_S2_ENV,
    BM_S2_ATTESTATION_ENABLED: 'true',
    BM_S2_ATTESTATION_SOURCE_SHA: e.BM_S2_ATTESTATION_SOURCE_SHA,
    BM_S2_ATTESTATION_RUN_ID: e.BM_S2_ATTESTATION_RUN_ID,
  }))
    assert.equal(argv.filter((x) => x === `${k}=${v}`).length, 2);
  assert.ok(argv.includes('githubCommitSha=' + '1'.repeat(40)));
  assert.equal(argv.includes('githubCommitSha=' + S2_RELEASE.source), false);
  assert.throws(() =>
    s2AttestationDeploymentArgs('source', e.BM_S2_ATTESTATION_RUN_ID, 'HEAD'),
  );
});
test('new candidate cleanup refuses an unapproved source before any provider operation', async () => {
  const e = env(),
    receipt = {
      runId: e.BM_S2_ATTESTATION_RUN_ID,
      deploymentId: e.VERCEL_DEPLOYMENT_ID,
      source: e.BM_S2_ATTESTATION_SOURCE_SHA,
      project: S2_RELEASE.project,
      team: S2_RELEASE.team,
      preexistingDeploymentIds: [S2_RELEASE.fallback],
      fallbackId: S2_RELEASE.fallback,
      alias: new URL(S2_RELEASE.origin).hostname,
    };
  let calls = 0;
  const adapter = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls++;
        };
      },
    },
  );
  await assert.rejects(closeS2Run(receipt, adapter));
  assert.equal(calls, 0);
  const result = await closeS2Run(receipt, adapter, {
    approvedSource: e.BM_S2_ATTESTATION_SOURCE_SHA,
  });
  assert.equal(result.verified, false);
  assert.equal(calls, 1);
});

let calls, owner, profile, workspace, authError, readError, artifactText;
const client = {
  auth: {
    getUser: async (token) => {
      calls.push('auth.getUser');
      return {
        data: { user: token === 'dummy-valid' ? owner : null },
        error: authError,
      };
    },
  },
  from(table) {
    calls.push('select:' + table);
    return {
      select() {
        return this;
      },
      eq(_, id) {
        assert.equal(id, owner.id);
        return this;
      },
      async maybeSingle() {
        return {
          data: table === 'account_profiles' ? profile : workspace,
          error: readError,
        };
      },
    };
  },
};
globalThis.__s2AttestationMocks = {
  getSupabaseAdminClient: () => {
    calls.push('admin');
    return client;
  },
  getBearerToken: (req) =>
    req.headers?.authorization?.replace(/^Bearer /, '') || '',
  readFileSync: () => {
    calls.push('read-artifact');
    return artifactText;
  },
};
const compiled = await build({
  entryPoints: ['server/http/s2-attestation.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 's2-local-auth-only',
      setup(b) {
        b.onResolve({ filter: /^\.\.\/\.\.\/api\/_accountAuth\.js$/ }, () => ({
          path: 'auth',
          namespace: 's2-test',
        }));
        b.onResolve({ filter: /^real-s2-auth$/ }, () => ({
          path: resolve('api/_accountAuth.ts'),
        }));
        b.onResolve({ filter: /^node:fs$/ }, () => ({
          path: 'fs',
          namespace: 's2-test',
        }));
        b.onLoad({ filter: /.*/, namespace: 's2-test' }, (args) => ({
          contents:
            args.path === 'fs'
              ? 'export const {readFileSync}=globalThis.__s2AttestationMocks;'
              : `import {isOwnerAdminEmail} from 'real-s2-auth';export {isOwnerAdminEmail};export const {getSupabaseAdminClient,getBearerToken}=globalThis.__s2AttestationMocks;`,
          loader: 'js',
        }));
      },
    },
  ],
});
const { default: handler } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const originalEnv = { ...process.env };
test.after(() => {
  for (const k of Object.keys(process.env))
    if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
  delete globalThis.__s2AttestationMocks;
});
function reset() {
  calls = [];
  owner = {
    id: 'owner-fixture',
    email: 'housebuyerinv@gmail.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
  };
  profile = { role: 'Admin', account_status: 'Active' };
  workspace = { account_status: 'Active' };
  authError = null;
  readError = null;
  Object.assign(process.env, env());
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.DEALBLAST_OWNER_ADMIN_EMAILS;
  delete process.env.SUPER_ADMIN_EMAILS;
  artifactText = JSON.stringify(captureS2Build(env(), new Date()));
}
async function invoke(overrides = {}) {
  const response = {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(v) {
      this.statusCode = v;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
  };
  const request = {
    method: 'GET',
    url: '/api/platform/s2-attestation',
    headers: { authorization: 'Bearer dummy-valid' },
  };
  Object.defineProperties(request, Object.getOwnPropertyDescriptors(overrides));
  await handler(request, response);
  return response;
}
test('actual handler authorizes server-verified confirmed owner and performs reads only', async () => {
  reset();
  const r = await invoke();
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.schema, 1);
  assert.deepEqual(calls, [
    'admin',
    'auth.getUser',
    'select:account_profiles',
    'select:workspaces',
    'read-artifact',
  ]);
  assert.equal(r.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(r.headers.Vary, 'Authorization');
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(JSON.stringify(r.body).includes('owner-fixture'), false);
});
test('anonymous, forged token and forged internal headers do not expose diagnostics', async () => {
  for (const headers of [
    {},
    { authorization: 'Bearer forged', 'x-internal-owner': 'true' },
    {
      'x-vercel-trusted-oidc-idp-token': 'DUMMY_TOKEN',
      'x-owner-email': 'housebuyerinv@gmail.com',
    },
  ]) {
    reset();
    const r = await invoke({ headers });
    assert.equal(r.statusCode, 401);
    assert.equal(calls.includes('read-artifact'), false);
    assert.equal(JSON.stringify(r.body).includes('DUMMY'), false);
  }
});
test('ordinary Admin/workspace owner and self-asserted user metadata cannot become platform owner', async () => {
  reset();
  owner.email = 'fixture@example.com';
  owner.user_metadata = { role: 'Owner', email: 'housebuyerinv@gmail.com' };
  const r = await invoke();
  assert.equal(r.statusCode, 403);
  assert.deepEqual(calls, ['admin', 'auth.getUser']);
});
test('unconfirmed, deactivated, missing workspace/profile and wrong role fail closed', async () => {
  for (const mutate of [
    () => (owner.email_confirmed_at = null),
    () => (profile.account_status = 'Deactivated'),
    () => (profile.role = 'Member'),
    () => (profile = null),
    () => (workspace = null),
    () => (workspace.account_status = 'Deactivated'),
  ]) {
    reset();
    mutate();
    assert.ok([401, 403].includes((await invoke()).statusCode));
    assert.equal(calls.includes('read-artifact'), false);
  }
});
test('Production/wrong project/disabled endpoint never reaches Auth, database or artifact reads', async () => {
  for (const change of [
    { VERCEL_ENV: 'production' },
    { VERCEL_PROJECT_ID: 'other' },
    { BM_S2_ATTESTATION_ENABLED: 'false' },
    { SUPABASE_URL: 'https://aigvnbxiydbzzqbetlhl.supabase.co' },
  ]) {
    reset();
    Object.assign(process.env, change);
    assert.equal((await invoke()).statusCode, 404);
    assert.deepEqual(calls, []);
  }
});
test('POST and malformed body cannot invoke writes or artifact operations', async () => {
  reset();
  const req = {
    method: 'POST',
    get body() {
      throw Error('Body must not be processed');
    },
  };
  assert.equal((await invoke(req)).statusCode, 405);
  assert.deepEqual(calls, []);
});
test('query/environment selectors and GET bodies are refused without reflecting their input', async () => {
  for (const change of [
    {
      url: '/api/platform/s2-attestation?key=STRIPE_SECRET_KEY&value=DUMMY_PRIVATE',
    },
    { headers: { authorization: 'Bearer dummy-valid', 'content-length': '2' } },
  ]) {
    reset();
    const r = await invoke(change);
    assert.equal(r.statusCode, 400);
    assert.equal(calls.includes('read-artifact'), false);
    assert.equal(JSON.stringify(r.body).includes('DUMMY'), false);
  }
});
test('missing, stale, conflicting and credential-injected runtime evidence returns generic503 with no logs', async () => {
  for (const mutate of [
    () => (artifactText = 'invalid DUMMY_PRIVATE'),
    () =>
      (artifactText = JSON.stringify(
        captureS2Build(env(), new Date(Date.now() - 7200000)),
      )),
    () => (process.env.BM_CHECKOUT_ENABLED = 'true'),
    () => (process.env.BM_APP_ORIGIN = 'DUMMY_PRIVATE_CREDENTIAL'),
    () => (readError = Error('DUMMY_PRIVATE_DB_ERROR')),
  ]) {
    reset();
    mutate();
    let logged = false;
    const old = console.error;
    console.error = () => {
      logged = true;
    };
    try {
      const r = await invoke();
      assert.equal(r.statusCode, 503);
      assert.equal(JSON.stringify(r.body).includes('DUMMY'), false);
      assert.equal(logged, false);
    } finally {
      console.error = old;
    }
  }
});
test('build artifact remains a server-only include and API slot routing preserves existing handlers', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(
    cfg.functions['api/platform/*.ts'].includeFiles,
    ATTESTATION_PATH,
  );
  const api = readFileSync('api/platform/[endpoint].ts', 'utf8');
  for (const name of [
    'buyermatch',
    'buyermatch-response',
    'buyermatch-worker',
    'email-operations',
    's2-attestation',
  ])
    assert.ok(api.includes(name));
  assert.equal(ATTESTATION_PATH.startsWith('public/'), false);
  assert.equal(ATTESTATION_PATH.startsWith('dist/'), false);
  assert.ok(readFileSync('.gitignore', 'utf8').includes(ATTESTATION_PATH));
  assert.ok(
    readFileSync('package.json', 'utf8').includes(
      'node scripts/build-buyermatch-s2-attestation.mjs && tsc',
    ),
  );
});
test('actual platform dispatcher preserves existing route targets and rejects diagnostic lookalikes', async () => {
  const result = await build({
    entryPoints: ['api/platform/[endpoint].ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'dispatch-only',
        setup(b) {
          b.onResolve({ filter: /server\/http\/.*\.js$/ }, (args) => ({
            path: args.path,
            namespace: 'routes',
          }));
          b.onLoad({ filter: /.*/, namespace: 'routes' }, (args) => ({
            contents: `export default (req,res)=>res.status(200).json({handler:${JSON.stringify(args.path)},method:req.method});`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const { default: route } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
  for (const name of [
    'buyermatch',
    'buyermatch-response',
    'buyermatch-worker',
    'email-operations',
    's2-attestation',
  ]) {
    const res = {
      code: 0,
      value: null,
      status(code) {
        this.code = code;
        return this;
      },
      json(value) {
        this.value = value;
        return this;
      },
    };
    await route({ url: '/api/platform/' + name, method: 'GET' }, res);
    assert.equal(res.code, 200);
    assert.ok(res.value.handler.endsWith('/' + name + '.js'));
  }
  for (const path of [
    '/api/platform/s2-attestation-extra',
    '/api/platform/not-a-route',
  ]) {
    const res = {
      code: 0,
      status(code) {
        this.code = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await route({ url: path, method: 'GET' }, res);
    assert.equal(res.code, 404);
  }
});
