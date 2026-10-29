// Exercise the actual application handlers through the new transport. Provider
// responses below are synthetic; no hosted Auth, database or Storage is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { fixture, instant } from './fixture.mjs';
import { createGateway } from '../../server/netlify/gateway.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(path.join(root, '.netlify/test'), { recursive: true });
const output = path.join(await mkdtemp(path.join(root, '.netlify/test/handlers-')), 'handlers.mjs');
await build({ stdin: { contents: "export {default as buyermatch} from './server/http/buyermatch.ts';export {default as buyer} from './server/http/buyermatch-buyer.ts'", resolveDir: root },
  bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: output,
  banner: { js: "import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);" } });
const actual = await import(pathToFileURL(output).href);
async function run(action, { valid = true, confirmed = true, buyer = false } = {}) {
  const f = fixture(), savedEnv = { ...process.env }, savedFetch = globalThis.fetch; const calls = [];
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, f.env);
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.origin, f.env.SUPABASE_URL); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify(valid ? {
        id: '22222222-2222-4222-8222-222222222222', email: 'synthetic@example.invalid',
        email_confirmed_at: confirmed ? '2026-10-29T00:00:00Z' : null, is_anonymous: false,
      } : { message: 'Invalid JWT', error_code: 'bad_jwt' }), { status: valid ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/account_profiles') || url.pathname.endsWith('/workspaces')) return Response.json([{ account_status: 'Active' }]);
      if (url.pathname.endsWith('/workspace_plan_assignments')) return Response.json([{ access_status: 'Active' }]);
      if (url.pathname.endsWith('/bm_entitlements')) return Response.json([]);
      if (url.pathname.endsWith('/rpc/bm_buyer_account_authorized')) return Response.json(false);
      assert.fail('Unexpected provider call: ' + url.pathname);
    };
    const gateway = createGateway({ env: process.env, now: () => instant, handlers: { buyermatch: actual.buyermatch, 'buyermatch-buyer': actual.buyer },
      assets: { '/index.html': Buffer.from('app').toString('base64') } });
    const basic = 'Basic ' + Buffer.from('buyermatch:' + f.env.BM_NETLIFY_ACCESS_SECRET).toString('base64');
    const access = await gateway(new Request(f.origin, { headers: { authorization: basic } }), f.context);
    const cookie = access.headers.get('set-cookie').split(';')[0];
    const request = buyer ? new Request(f.origin + '/api/buyermatch-buyer', { method: 'POST', headers: { authorization: 'Bearer synthetic-session', cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      : new Request(f.origin + '/api/buyermatch?action=' + action, { headers: { authorization: 'Bearer synthetic-session', cookie } });
    const response = await gateway(request, f.context);
    return { response, data: await response.json(), calls };
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
test('actual Supabase handler rejects invalid session through Netlify adapter', async () => {
  const result = await run('access', { valid: false }); assert.equal(result.response.status, 401);
  assert.deepEqual(result.calls, ['/auth/v1/user']);
});
test('authenticated Free account receives no BuyerMatch paid entitlement', async () => {
  const result = await run('access'); assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, { active: false, subscribed: false });
});
test('actual admin handler denies ordinary authenticated account', async () => {
  const result = await run('admin-list'); assert.equal(result.response.status, 403);
  assert.ok(!result.calls.some(value => value.endsWith('/bm_buyers')));
});
test('actual buyer handler rejects unconfirmed session before private Storage access', async () => {
  const result = await run('proof-link', { buyer: true, confirmed: false }); assert.equal(result.response.status, 401);
  assert.deepEqual(result.calls, ['/auth/v1/user']);
});
test('confirmed but unlinked buyer cannot reach private Storage', async () => {
  const result = await run('proof-link', { buyer: true }); assert.equal(result.response.status, 403);
  assert.ok(result.calls.some(value => value.endsWith('/rpc/bm_buyer_account_authorized')));
  assert.ok(!result.calls.some(value => value.startsWith('/storage/')));
});
test('actual paid workflow denies Free account before deal access', async () => {
  const result = await run('list'); assert.equal(result.response.status, 403);
  assert.ok(!result.calls.some(value => value.endsWith('/bm_deals')));
});
