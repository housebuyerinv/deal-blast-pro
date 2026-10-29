// Run after the offline build; checks the produced deployment package, not a
// second application acceptance run or a hosted provider simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../../.netlify/buyermatch/', import.meta.url);
test('built function digest and self-contained packaging match manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const bytes = await readFile(new URL('functions/buyermatch.mjs', base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  assert.equal(bytes.length, manifest.bytes); assert.ok(bytes.length < 40000000);
  assert.equal(manifest.verificationOnly, true); assert.equal(manifest.hostedVerified, false);
  assert.equal(manifest.publishContainsApplication, false);
  assert.deepEqual(await readdir(new URL('functions/', base)), ['buyermatch.mjs']);
});
test('publish directory contains only unavailable notice, no assets or source', async () => {
  assert.deepEqual(await readdir(new URL('publish/', base)), ['index.html']);
  const html = await readFile(new URL('publish/index.html', base), 'utf8');
  assert.doesNotMatch(html, /<script|supabase|token|password/i);
});
test('bundled verification entry imports and refuses runtime execution', async () => {
  const { default: handler } = await import(new URL('functions/buyermatch.mjs', base));
  const response = await handler(new Request('https://test.invalid/'), {});
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
});
