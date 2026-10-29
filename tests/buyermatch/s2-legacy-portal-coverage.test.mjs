import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S2_RELEASE as S2 } from '../../scripts/buyermatch-s2-release.mjs';
import { LEGACY_S2, LEGACY_HOSTS, PORTAL_PROBES, PORTAL_PATH, legacyPortalRule,
  verifyLegacyPolicy, verifyLegacyInventory, readLegacyPortalCoverage,
} from '../../scripts/testing/s2-legacy-portal-coverage.mjs';
const clone = x => structuredClone(x);
const policy = () => ({ draft: null, active: { ownerId: S2.team,
  projectKey: `${S2.project}#active`, firewallEnabled: true, ips: [],
  crs: { gen: { active: false, action: 'log' } }, rules: [
    { ...legacyPortalRule(), id: 'rule_Approved', valid: true, validationErrors: null },
  ],
} });
const deployments = () => LEGACY_S2.map(d => ({ id: d.id, url: d.host,
  projectId: S2.project, ownerId: S2.team, readyState: d.kind === 'CANCELED' ? 'CANCELED' : 'READY',
  isInstantStatic: d.kind === 'STATIC', functions: {},
}));
const aliases = () => [
  { alias: new URL(S2.origin).hostname, deploymentId: S2.fallback, projectId: S2.project },
  { alias: 'dbp-registration-s2-housebuyerinv.vercel.app',
    deploymentId: 'dpl_5kvjDYa92Acg6od5DfJDEgEjtmGH', projectId: S2.project },
];
test('the exact approved matcher covers base/slash/dot paths and excludes neighboring routes', () => {
  const re = new RegExp(PORTAL_PATH, 'i');
  for (const p of PORTAL_PROBES) assert(re.test(p));
  for (const p of ['/', '/api/buyermatch-worker', '/api/buyermatch-response', '/api/email-operations']) assert(!re.test(p));
  assert.equal(LEGACY_HOSTS.length, 7);
  assert.equal(verifyLegacyPolicy(policy(), { rules: [] }), 'rule_Approved');
  verifyLegacyInventory(deployments(), aliases());
});
for (const [name, change] of [
  ['unpublished draft', p => p.draft = {}],
  ['disabled firewall', p => p.active.firewallEnabled = false],
  ['wrong account', p => p.active.ownerId = 'foreign'],
  ['wrong project', p => p.active.projectKey = 'foreign#active'],
  ['earlier bypass or extra rule', p => p.active.rules.unshift({ action: { mitigate: { action: 'bypass' } } })],
  ['enabled managed CRS defaults', p => p.active.crs.gen.active = true],
  ['unknown active policy field', p => p.active.unknownBypass = true],
  ['host coverage omitted', p => p.active.rules[0].conditionGroup[0].conditions[0].value.pop()],
  ['unrelated host added', p => p.active.rules[0].conditionGroup[0].conditions[0].value.push('foreign.vercel.app')],
  ['GET browsing blocked', p => p.active.rules[0].conditionGroup[0].conditions[1].value = ['HEAD']],
  ['path suffix coverage omitted', p => p.active.rules[0].conditionGroup[0].conditions[2].value = '^/api/buyermatch$'],
  ['persistent action', p => p.active.rules[0].action.mitigate.duration = 60],
  ['provider-invalid rule', p => p.active.rules[0].valid = false],
]) test(`policy rejects ${name}`, () => {
  const p = policy(); change(p); assert.throws(() => verifyLegacyPolicy(p, { rules: [] }));
});
test('conditional bypasses and missing or paginated evidence fail closed', () => {
  for (const b of [null, {}, { rules: [{}] }, { rules: [], pagination: { next: 'more' } }])
    assert.throws(() => verifyLegacyPolicy(policy(), b));
});
for (const [name, change] of [
  ['unknown deployment', ds => ds.push({ id: 'unknown' })],
  ['missing historical deployment', ds => ds.pop()],
  ['resumed canceled artifact', ds => ds.find(d => d.readyState === 'CANCELED').readyState = 'READY'],
  ['changed immutable URL', ds => ds[0].url = 'foreign.vercel.app'],
  ['foreign deployment owner', ds => ds[0].ownerId = 'foreign'],
]) test(`inventory rejects ${name}`, () => {
  const ds = deployments(); change(ds); assert.throws(() => verifyLegacyInventory(ds, aliases()));
});
test('alias reassignment and unexpected aliases fail closed', () => {
  const a = aliases(); a[0].deploymentId = 'unknown';
  assert.throws(() => verifyLegacyInventory(deployments(), a));
  assert.throws(() => verifyLegacyInventory(deployments(), [...aliases(), clone(aliases()[0])]));
});
function runtime(change = {}) {
  const p = policy(), ds = deployments(), calls = [], receipts = [];
  const config = { version: 3, routes: [{ src: '/.*', headers: {
    'Content-Security-Policy': "default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, continue: true }, { handle: 'filesystem' }] };
  const tree = [{ name: 'src', type: 'directory', children: [{ name: '.vercel', type: 'directory', children: [
    { name: 'output', type: 'directory', children: [{ name: 'config.json', type: 'file', uid: 'file_config' },
      { name: 'static', type: 'directory', children: [{ name: 'index.html', type: 'file' }] }] },
  ] }] }];
  const dependencies = {
    baseline: { ids: ds.map(d => d.id) },
    inventory: async () => ds,
    evidence: { create: async (_name, value) => receipts.push(value) },
    api: async path => {
      calls.push({ api: path });
      let body;
      if (path.startsWith('/v1/security/firewall/config?')) body = clone(p);
      else if (path.startsWith('/v1/security/firewall/bypass/rules?')) body = { rules: [] };
      else if (path.startsWith('/v4/aliases?')) body = { aliases: aliases(), pagination: { next: null } };
      else if (path.startsWith('/v13/deployments/')) body = ds.find(d => path.endsWith(d.id));
      else if (path.startsWith('/v6/deployments/')) body = tree;
      else if (path.startsWith('/v8/deployments/')) body = config;
      else throw Error('UNEXPECTED_API');
      if (change.api) body = change.api(path, body, calls);
      return { status: 200, body };
    },
    http: async (host, path, method) => {
      calls.push({ host, path, method });
      assert(['GET', 'OPTIONS'].includes(method));
      const d = LEGACY_S2.find(x => x.host === host);
      const result = method === 'OPTIONS'
        ? { code: 0, status: 403, firewallDenied: true, requestId: 'iad1::provider-id', sso: false, redirect: false }
        : { code: 0, status: 200, sso: false, redirect: false,
          title: d?.kind === 'CANCELED' ? 'Deployment was cancelled' :
            d?.kind === 'STATIC' ? 'Initialization' : 'Deal Blast Pro • Real Estate Dispo Platform' };
      return change.http ? change.http(result, { host, path, method }) : result;
    },
  };
  return { dependencies, calls, receipts, config, p };
}
test('connected reader reconciles nine artifacts, 63 OPTIONS probes, fresh policy and durable evidence', async () => {
  const r = runtime(); assert.deepEqual(await readLegacyPortalCoverage(r.dependencies), { verified: true });
  assert.equal(r.calls.filter(c => c.method === 'OPTIONS').length, 63);
  assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].observations.length, 9);
});
for (const [name, transform] of [
  ['generic application403', r => ({ ...r, firewallDenied: false })],
  ['SSO response', r => ({ ...r, sso: true })],
  ['redirect', r => ({ ...r, redirect: true })],
  ['missing provider request ID', r => ({ ...r, requestId: null })],
  ['partial CLI failure', r => ({ ...r, code: 1 })],
]) test(`connected reader rejects ${name} without a success receipt`, async () => {
  const r = runtime({ http: (result, request) => request.method === 'OPTIONS' ? transform(result) : result });
  await assert.rejects(readLegacyPortalCoverage(r.dependencies)); assert.equal(r.receipts.length, 0);
});
test('interruption cannot produce a success receipt', async () => {
  const r = runtime(), signal = AbortSignal.abort();
  await assert.rejects(readLegacyPortalCoverage(r.dependencies, signal)); assert.equal(r.receipts.length, 0);
  assert.equal(r.calls.length, 0);
});
test('static forwarding is rejected', async () => {
  const r = runtime(); r.config.routes.push({ src: '/api/(.*)', dest: 'https://foreign.example/$1' });
  await assert.rejects(readLegacyPortalCoverage(r.dependencies)); assert.equal(r.receipts.length, 0);
});
test('static function additions are rejected', async () => {
  const r = runtime({ api: (path, body) => {
    if (path.includes('/v13/deployments/dpl_5kvjDYa92Acg6od5DfJDEgEjtmGH'))
      body.functions = { 'api/new': {} };
    return body;
  } });
  await assert.rejects(readLegacyPortalCoverage(r.dependencies)); assert.equal(r.receipts.length, 0);
});
test('a canceled artifact serving an application is rejected', async () => {
  const r = runtime({ http: result => result.title === 'Deployment was cancelled'
    ? { ...result, title: 'Deal Blast Pro • Real Estate Dispo Platform' } : result });
  await assert.rejects(readLegacyPortalCoverage(r.dependencies)); assert.equal(r.receipts.length, 0);
});
test('policy changes during observation are rejected', async () => {
  let count = 0;
  const r = runtime({ api: (path, body) => {
    if (path.startsWith('/v1/security/firewall/config?') && ++count === 2) body.active.firewallEnabled = false;
    return body;
  } });
  await assert.rejects(readLegacyPortalCoverage(r.dependencies)); assert.equal(r.receipts.length, 0);
});
test('native runtime and exact-source manifest connect the new reader', () => {
  const provider = readFileSync(new URL('../../scripts/testing/s2-billing-native-provider.mjs', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../../scripts/testing/s2-billing-execution.mjs', import.meta.url), 'utf8');
  assert(provider.includes('return readLegacyPortalCoverage({ api, http, inventory, baseline: b, evidence }, signal)'));
  assert(manifest.includes('"s2-legacy-portal-coverage.mjs"'));
});
