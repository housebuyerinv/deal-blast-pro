import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fixture } from './fixture.mjs';
import { productionProfile, legalReceipt, verifyProductionAgreements } from '../../server/netlify/production.mjs';
import { createGateway } from '../../server/netlify/gateway.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function ready() {
  const f = fixture(); f.origin = 'https://bm-synthetic.netlify.app';
  Object.assign(f.env, { BM_HOSTING_PROFILE: 'netlify-production-v1', BM_ENVIRONMENT: 'production', BM_APP_ORIGIN: f.origin,
    PUBLIC_APP_URL: f.origin, BM_NETLIFY_ACTIVATION_STATE: 'owner-approved-cutover', BM_NETLIFY_RELEASE_SOURCE: 'b'.repeat(40) });
  delete f.env.BM_STAGING_PROJECT_REF;
  f.context.deploy = { ...f.context.deploy, context: 'production', published: true };
  const texts = Object.fromEntries(['TERMS.md', 'PRIVACY.md', 'REFUNDS.md', 'RENEWAL_CANCELLATION.md'].map(name => [name, 'SYNTHETIC REVIEW FIXTURE: ' + name]));
  const manifest = { approved: true, publicationAllowed: true, approvedBy: 'Synthetic reviewer fixture', approvedAt: '2026-10-29T00:00:00Z',
    files: Object.entries(texts).map(([path, text]) => ({ path, version: 'synthetic-v1', sha256: hash(text) })) };
  const legal = legalReceipt(manifest, texts); f.env.BM_NETLIFY_LEGAL_DIGEST = legal.digest;
  return { ...f, texts, manifest, legal, source: f.env.BM_NETLIFY_RELEASE_SOURCE };
}
test('separate production profile requires exact legal/source/cutover/provider bindings', () => {
  const f = ready(); assert.equal(productionProfile(f.env, f.context, f.legal, f.source).origin, f.origin);
  for (const patch of [{ BM_NETLIFY_ACTIVATION_STATE: '' }, { BM_NETLIFY_RELEASE_SOURCE: 'c'.repeat(40) },
    { BM_NETLIFY_LEGAL_DIGEST: '0'.repeat(64) }, { BM_CHECKOUT_ENABLED: 'true' }, { DBP_REGISTRATION_PAUSED: 'false' },
    { BM_DELIVERY_MODE: 'resend' }, { STRIPE_SECRET_KEY: 'synthetic-forbidden' }, { BM_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst' },
    { BM_NETLIFY_SUPABASE_REF: 'qxhhlprentrufobpcgna' }])
    assert.throws(() => productionProfile({ ...f.env, ...patch }, f.context, f.legal, f.source));
  assert.throws(() => productionProfile(f.env, { ...f.context, account: { id: 'other' } }, f.legal, f.source));
  assert.throws(() => productionProfile(f.env, { ...f.context, deploy: { ...f.context.deploy, published: false } }, f.legal, f.source));
});
test('unapproved, tampered, incomplete and placeholder legal documents cannot enable release', () => {
  const f = ready();
  assert.throws(() => legalReceipt({ ...f.manifest, approved: false }, f.texts));
  assert.throws(() => legalReceipt({ ...f.manifest, publicationAllowed: false }, f.texts));
  assert.throws(() => legalReceipt(f.manifest, { ...f.texts, 'TERMS.md': 'changed' }));
  assert.throws(() => legalReceipt(f.manifest, { ...f.texts, 'PRIVACY.md': '[OWNER DECISION]' }));
  assert.throws(() => legalReceipt({ ...f.manifest, files: [] }, f.texts));
});
test('public production pages remain unavailable without legal/cutover approval', async () => {
  const f = ready(); const env = { ...f.env, BM_NETLIFY_ACTIVATION_STATE: 'pending' };
  const gateway = createGateway({ env, assets: {}, handlers: {}, validateProfile: (e, c) => productionProfile(e, c, f.legal, f.source), accessCheck: () => ({ allowed: true }) });
  assert.equal((await gateway(new Request(f.origin), f.context)).status, 503);
});
test('explicit production selection preserves protected API and disabled billing boundaries', async () => {
  const f = ready(); let calls = 0;
  const gateway = createGateway({ env: f.env, assets: { '/index.html': Buffer.from('production fixture').toString('base64') },
    handlers: { buyermatch: () => { calls++; } }, validateProfile: (e, c) => productionProfile(e, c, f.legal, f.source), accessCheck: () => ({ allowed: true }) });
  assert.equal((await gateway(new Request(f.origin), f.context)).status, 200);
  assert.equal((await gateway(new Request(f.origin + '/api/buyermatch?action=admin-list'), f.context)).status, 401);
  assert.equal((await gateway(new Request(f.origin + '/api/buyermatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"checkout"}' }), f.context)).status, 503);
  assert.equal(calls, 0);
});
test('production environment cannot unlock a private compiled gateway', async () => {
  const f = ready(); const gateway = createGateway({ env: f.env, assets: {}, handlers: {} });
  assert.equal((await gateway(new Request(f.origin), f.context)).status, 503);
});
function database(rows) {
  const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: rows, error: null }) };
  return { from: name => { assert.equal(name, 'bm_documents'); return chain; } };
}
test('database legal versions/hashes must match bundled approved texts before consent', async () => {
  const f = ready(); const rows = [['platform_terms', 'TERMS.md'], ['privacy', 'PRIVACY.md']].map(([kind, path]) => ({ kind, version: 'synthetic-v1', document_hash: hash(f.texts[path]), content: f.texts[path] }));
  await verifyProductionAgreements(database(rows), f.legal);
  await assert.rejects(verifyProductionAgreements(database([{ ...rows[0], version: 'stale' }, rows[1]]), f.legal));
  await assert.rejects(verifyProductionAgreements(database([{ ...rows[0], content: 'tampered' }, rows[1]]), f.legal));
});
test('agreement drift blocks acceptance before the handler can write', async () => {
  const f = ready(); let writes = 0;
  const gateway = createGateway({ env: f.env, assets: {}, handlers: { buyermatch: () => { writes++; } },
    validateProfile: (e, c) => productionProfile(e, c, f.legal, f.source), accessCheck: () => ({ allowed: true }),
    beforeDispatch: async () => verifyProductionAgreements(database([]), f.legal) });
  const response = await gateway(new Request(f.origin + '/api/buyermatch', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: '{"action":"onboarding-accept"}' }), f.context);
  assert.equal(response.status, 503); assert.equal(writes, 0);
});
test('production legal assets use plain text and direct legal visits use HTML', async () => {
  const f = ready(); const gateway = createGateway({ env: f.env, handlers: {},
    validateProfile: (e, c) => productionProfile(e, c, f.legal, f.source), accessCheck: () => ({ allowed: true }),
    assets: { '/terms': Buffer.from('<pre>approved fixture</pre>').toString('base64'), '/legal/terms.txt': Buffer.from('approved fixture').toString('base64') } });
  assert.match((await gateway(new Request(f.origin + '/terms'), f.context)).headers.get('content-type'), /^text\/html/);
  assert.match((await gateway(new Request(f.origin + '/legal/terms.txt'), f.context)).headers.get('content-type'), /^text\/plain/);
});
