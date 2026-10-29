import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { bundleNetlifyFunction } from '../../scripts/build-buyermatch-netlify.mjs';
import { fixture } from './fixture.mjs';
import { createHash } from 'node:crypto';

test('compiled production entry requires legal/source approval and retains actual Auth denial', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(path.join(root, '.netlify/test'), { recursive: true });
  const outfile = path.join(await mkdtemp(path.join(root, '.netlify/test/production-')), 'buyermatch.mjs');
  const f = fixture(), sourceHead = 'b'.repeat(40), origin = 'https://bm-synthetic.netlify.app';
  const legal = { approved: true, publicationAllowed: true, approvedBy: 'Synthetic reviewer', approvedAt: '2026-10-29T00:00:00Z', digest: 'a'.repeat(64),
    files: ['TERMS.md', 'PRIVACY.md', 'REFUNDS.md', 'RENEWAL_CANCELLATION.md'].map(path => ({ path, version: 'fixture-v1', sha256: createHash('sha256').update(path).digest('hex') })) };
  Object.assign(f.env, { BM_HOSTING_PROFILE: 'netlify-production-v1', BM_ENVIRONMENT: 'production', BM_APP_ORIGIN: origin, PUBLIC_APP_URL: origin,
    BM_NETLIFY_RELEASE_SOURCE: sourceHead, BM_NETLIFY_LEGAL_DIGEST: legal.digest, BM_NETLIFY_ACTIVATION_STATE: 'owner-approved-cutover' });
  delete f.env.BM_STAGING_PROJECT_REF;
  f.context.deploy = { ...f.context.deploy, context: 'production', published: true };
  await bundleNetlifyFunction({ outfile, ref: f.env.BM_NETLIFY_SUPABASE_REF, anonKey: f.env.VITE_SUPABASE_ANON_KEY,
    verificationOnly: false, production: true, legal, sourceHead, assets: { '/index.html': Buffer.from('production fixture').toString('base64') } });
  const saved = { ...process.env }, savedFetch = globalThis.fetch; let calls = 0;
  try {
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, f.env);
    globalThis.fetch = async input => { assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, f.env.SUPABASE_URL); calls++; return Response.json({ message: 'Invalid JWT' }, { status: 401 }); };
    const { default: handler } = await import(pathToFileURL(outfile));
    assert.equal((await handler(new Request(origin), f.context)).status, 200);
    const denied = await handler(new Request(origin + '/api/buyermatch?action=access', { headers: { authorization: 'Bearer invalid-fixture' } }), f.context);
    assert.equal(denied.status, 401); assert.equal(calls, 1);
    process.env.BM_NETLIFY_ACTIVATION_STATE = 'pending';
    assert.equal((await handler(new Request(origin), f.context)).status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = savedFetch; for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, saved);
  }
});

test('normal non-verification bundle executes private login and actual session denial end to end', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await mkdir(path.join(root, '.netlify/test'), { recursive: true });
  const outfile = path.join(await mkdtemp(path.join(root, '.netlify/test/runtime-')), 'buyermatch.mjs');
  const f = fixture();
  f.env.BM_NETLIFY_WINDOW_START = new Date(Date.now() - 1000).toISOString();
  f.env.BM_NETLIFY_WINDOW_END = new Date(Date.now() + 1740000).toISOString();
  await bundleNetlifyFunction({ outfile, ref: f.env.BM_NETLIFY_SUPABASE_REF,
    anonKey: f.env.VITE_SUPABASE_ANON_KEY, verificationOnly: false,
    assets: { '/index.html': Buffer.from('<html>private runtime</html>').toString('base64') } });
  const savedEnv = { ...process.env }, savedFetch = globalThis.fetch; let calls = 0;
  try {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, f.env); delete process.env.BM_APP_ORIGIN; delete process.env.PUBLIC_APP_URL;
    globalThis.fetch = async input => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.href, f.env.SUPABASE_URL + '/auth/v1/user'); calls++;
      return Response.json({ message: 'Invalid JWT' }, { status: 401 });
    };
    const { default: handler } = await import(pathToFileURL(outfile));
    assert.equal((await handler(new Request(f.origin), { ...f.context, account: { id: 'other' } })).status, 503);
    assert.equal(process.env.BM_APP_ORIGIN, undefined);
    assert.equal((await handler(new Request(f.origin), f.context)).status, 401);
    const basic = 'Basic ' + Buffer.from('buyermatch:' + f.env.BM_NETLIFY_ACCESS_SECRET).toString('base64');
    const page = await handler(new Request(f.origin, { headers: { authorization: basic } }), f.context);
    assert.equal(page.status, 200); assert.match(await page.text(), /private runtime/);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const denied = await handler(new Request(f.origin + '/api/buyermatch?action=access', { headers: { cookie, authorization: 'Bearer invalid-synthetic' } }), f.context);
    assert.equal(denied.status, 401); assert.equal(calls, 1);
    process.env.BM_CHECKOUT_ENABLED = 'true';
    assert.equal((await handler(new Request(f.origin, { headers: { cookie } }), f.context)).status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, savedEnv);
  }
});
