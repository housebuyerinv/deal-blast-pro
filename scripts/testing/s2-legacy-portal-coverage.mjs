// Read-only provider evidence, never a Portal request or a cached success receipt.
import { isDeepStrictEqual as equal } from 'node:util';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { S2_RELEASE as S2 } from '../buyermatch-s2-release.mjs';

export const LEGACY_S2 = Object.freeze([
  ['dpl_9N41ZRqvCoSMHimYkrK5gRuPZM7y', 'j7li96bz8', 'READY'],
  ['dpl_Fig7B1bWNEXKM762MEizAfUBfbsh', 'lmxzjv71v', 'READY'],
  ['dpl_Cp9qXVBXtSGozPRKQ7p3atTCF7Hi', '6qwn9shv2', 'READY'],
  ['dpl_nr5RVunmUGdryPUtWkRkVdsA96pT', '7zijlxtxh', 'READY'],
  ['dpl_4CwsjSj9qyjWT6v7VEM1mtyyaFc1', '2kf3mtjtg', 'CANCELED'],
  ['dpl_E3wyBiczZLGbCq7mwdpCmQAvEjnu', 'o5ey13tbg', 'READY'],
  ['dpl_Cu9Y6BKFZxsPfEfSocWoUuJPm4p1', '1qy3okdmm', 'READY'],
  ['dpl_5kvjDYa92Acg6od5DfJDEgEjtmGH', 'qkbuw0af9', 'STATIC'],
  ['dpl_GxgH1NRM94JocyRPvRmiApCriXfK', 'lo0x8jabu', 'CANCELED'],
].map(([id, slug, kind]) => Object.freeze({
  id, host: `dbp-registration-s2-${slug}-housebuyerinv.vercel.app`, kind,
})));
export const LEGACY_HOSTS = Object.freeze([
  ...LEGACY_S2.filter(d => d.kind === 'READY').map(d => d.host),
  new URL(S2.origin).hostname,
]);
export const PORTAL_PATH = '^/api/(create-billing-portal-session|(?:platform/)?buyermatch)(?:[/.]|$)';
export const PORTAL_PROBES = Object.freeze([
  '/api/create-billing-portal-session', '/api/buyermatch', '/api/platform/buyermatch',
].flatMap(p => ['', '/', '.json'].map(s => p + s)));
export function legacyPortalRule() {
  return {
    name: 'BuyerMatch legacy S2 Portal containment', active: true,
    conditionGroup: [{ conditions: [
      { type: 'host', op: 'inc', value: [...LEGACY_HOSTS] },
      { type: 'method', op: 'ninc', value: ['GET', 'HEAD'] },
      { type: 'path', op: 're', value: PORTAL_PATH },
    ] }], action: { mitigate: { action: 'deny' } },
  };
}
const deny = code => { throw Error(`S2 EDGE CONTAINMENT UNVERIFIED: ${code}`); };
const require = (ok, code) => { if (!ok) deny(code); };
const sorted = a => [...a].sort();
export function verifyLegacyPolicy(config, bypasses) {
  const a = config?.active;
  require(config?.draft === null, 'DRAFT');
  require(a?.firewallEnabled === true && a.ownerId === S2.team &&
    a.projectKey === `${S2.project}#active`, 'ACTIVE_SCOPE');
  require(Object.keys(a).every(k => ['id', 'version', 'createdAt', 'updatedAt', 'ownerId',
    'projectKey', 'rules', 'firewallEnabled', 'crs', 'ips', 'changes', 'managedRules'].includes(k)),
  'UNKNOWN_POLICY_FIELDS');
  require(Array.isArray(a.rules) && a.rules.length === 1, 'RULE_ORDER_OR_BYPASS');
  const r = a.rules[0], expected = legacyPortalRule();
  require(/^rule_[A-Za-z0-9_]+$/.test(r.id || '') && r.valid === true &&
    (r.validationErrors === null || equal(r.validationErrors, [])), 'INVALID_RULE');
  require(equal({ name: r.name, active: r.active, conditionGroup: r.conditionGroup,
    action: r.action }, expected), 'RULE_DRIFT');
  require(Array.isArray(a.ips) && a.ips.length === 0, 'EXTRA_IP_POLICY');
  // Initializing a config must not silently enable unrelated, possibly priced rulesets.
  require(a.crs && Object.values(a.crs).every(v => v.active === false), 'UNRELATED_CRS');
  require(!a.managedRules || Object.values(a.managedRules).every(v => !v.active), 'MANAGED_RULES');
  require(Array.isArray(bypasses?.rules) && bypasses.rules.length === 0 &&
    !bypasses.pagination?.next, 'BYPASS_EVIDENCE');
  return r.id;
}
export function verifyLegacyInventory(deployments, aliases) {
  require(Array.isArray(deployments) && deployments.length === LEGACY_S2.length &&
    equal(sorted(deployments.map(d => d.id)), sorted(LEGACY_S2.map(d => d.id))), 'INVENTORY');
  for (const expected of LEGACY_S2) {
    const d = deployments.find(x => x.id === expected.id);
    require(d.projectId === S2.project && d.ownerId === S2.team && d.url === expected.host &&
      d.readyState === (expected.kind === 'CANCELED' ? 'CANCELED' : 'READY'), 'DEPLOYMENT_DRIFT');
  }
  const expected = [
    { alias: new URL(S2.origin).hostname, deploymentId: S2.fallback, projectId: S2.project },
    { alias: 'dbp-registration-s2-housebuyerinv.vercel.app',
      deploymentId: 'dpl_5kvjDYa92Acg6od5DfJDEgEjtmGH', projectId: S2.project },
  ].sort((a,b) => a.alias.localeCompare(b.alias));
  require(Array.isArray(aliases) && equal([...aliases].sort((a,b) =>
    a.alias.localeCompare(b.alias)), expected), 'ALIAS_DRIFT');
}
function verifyStatic(d, tree, config) {
  const paths = [];
  const walk = (items, prefix = '') => {
    require(Array.isArray(items), 'STATIC_TREE');
    for (const x of items) {
      const p = `${prefix}${x.name}`;
      require(typeof x.name === 'string' && !x.name.includes('/'), 'STATIC_TREE');
      if (x.type === 'directory') walk(x.children, p + '/');
      else { require(x.type === 'file', 'STATIC_TREE'); paths.push(p); }
    }
  };
  walk(tree);
  require(d.isInstantStatic === true && d.functions && Object.keys(d.functions).length === 0 &&
    equal(sorted(paths), ['src/.vercel/output/config.json', 'src/.vercel/output/static/index.html']), 'STATIC_OUTPUT');
  require(equal(config, { version: 3, routes: [
    { src: '/.*', headers: {
      'Content-Security-Policy': "default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }, continue: true }, { handle: 'filesystem' },
  ] }), 'STATIC_ROUTING');
}
export async function readLegacyPortalCoverage({ api, http, inventory, baseline, evidence }, signal) {
  // These functions are connected only by the native owner-profile provider in HOSTED mode.
  require(!signal?.aborted, 'INTERRUPTED');
  require(equal(sorted(baseline.ids), sorted(LEGACY_S2.map(d => d.id))), 'BASELINE');
  const started = Date.now();
  const get = async p => {
    require(!signal?.aborted, 'INTERRUPTED');
    const r = await api(p, signal);
    require(r.status === 200, 'PROVIDER_READ');
    return r.body;
  };
  const policy = await get(`/v1/security/firewall/config?projectId=${S2.project}`);
  // Reject incomplete/extra draft before further runtime traffic.
  require(policy.draft === null && policy.active, 'UNPUBLISHED_POLICY');
  const bypasses = await get(`/v1/security/firewall/bypass/rules?projectId=${S2.project}`);
  const ruleId = verifyLegacyPolicy(policy, bypasses);
  const listed = await inventory(signal);
  const deployments = [];
  for (const item of listed) deployments.push(await get(`/v13/deployments/${item.uid ?? item.id}`));
  const a = await get(`/v4/aliases?projectId=${S2.project}&limit=100`);
  require(!a.pagination?.next && Array.isArray(a.aliases), 'ALIAS_PAGINATION');
  verifyLegacyInventory(deployments, a.aliases.map(x => ({ alias: x.alias,
    deploymentId: x.deploymentId ?? x.deployment?.id, projectId: x.projectId })));
  const observations = [];
  for (const d of LEGACY_S2) {
    const meta = deployments.find(x => x.id === d.id);
    if (d.kind === 'STATIC') {
      const tree = await get(`/v6/deployments/${d.id}/files`);
      let file;
      const find = xs => { for (const x of xs) { if (x.name === 'config.json') file = x;
        if (x.children) find(x.children); } };
      require(Array.isArray(tree), 'STATIC_TREE'); find(tree);
      require(typeof file?.uid === 'string' && /^[A-Za-z0-9_-]+$/.test(file.uid), 'STATIC_CONFIG_ID');
      let config = await get(`/v8/deployments/${d.id}/files/${file.uid}`);
      if (typeof config?.data === 'string') {
        try { config = JSON.parse(Buffer.from(config.data, 'base64').toString('utf8')); }
        catch { deny('STATIC_CONFIG'); }
      }
      verifyStatic(meta, tree, config);
    }
    const root = await http(d.host, '/', 'GET', signal);
    require(root.status === 200 && !root.redirect && !root.sso && root.code === 0, 'ROOT_ACCESS');
    if (d.kind === 'CANCELED') require(root.title === 'Deployment was cancelled', 'CANCELED_RUNTIME');
    else if (d.kind === 'STATIC') require(root.title === 'Initialization', 'STATIC_RUNTIME');
    else require(root.title === 'Deal Blast Pro • Real Estate Dispo Platform', 'APPLICATION_RUNTIME');
    observations.push({ id: d.id, kind: d.kind, rootStatus: root.status });
  }
  const checks = [];
  for (const host of LEGACY_HOSTS) {
    for (const path of PORTAL_PROBES) {
      const r = await http(host, path, 'OPTIONS', signal);
      // Generic app403, SSO, or a stale receipt is never provider denial evidence.
      require(r.code === 0 && r.status === 403 && r.firewallDenied === true &&
        !r.redirect && !r.sso && typeof r.requestId === 'string' && r.requestId.length > 0,
      'OPTIONS_DENIAL');
      checks.push({ host, path, method: 'OPTIONS', status: r.status, requestId: r.requestId });
    }
  }
  const fallback = await http(new URL(S2.origin).hostname, '/', 'GET', signal);
  require(fallback.code === 0 && fallback.status === 200 && !fallback.sso && !fallback.redirect &&
    fallback.title === 'Deal Blast Pro • Real Estate Dispo Platform', 'FALLBACK_GET');
  // Bound evidence to this observation and re-read policy/inventory after all probes.
  require(Date.now() - started <= 240000 && !signal?.aborted, 'EXPIRED_OR_INTERRUPTED');
  require(equal(await get(`/v1/security/firewall/config?projectId=${S2.project}`), policy), 'POLICY_CHANGED_DURING_READ');
  require(equal(await get(`/v1/security/firewall/bypass/rules?projectId=${S2.project}`), bypasses), 'BYPASSES_CHANGED_DURING_READ');
  const again = await inventory(signal);
  require(again.length === LEGACY_S2.length && LEGACY_S2.every(d =>
    again.some(x => (x.uid ?? x.id) === d.id && x.url === d.host &&
      (x.readyState ?? x.state) === (d.kind === 'CANCELED' ? 'CANCELED' : 'READY'))),
  'INVENTORY_CHANGED_DURING_READ');
  require(equal(await get(`/v4/aliases?projectId=${S2.project}&limit=100`), a), 'ALIASES_CHANGED_DURING_READ');
  await evidence.create(`portal-edge-${Date.now()}`, { startedAt: started,
    observedAt: Date.now(), ruleId, observations, checks, fallbackStatus: fallback.status });
  return { verified: true };
}
