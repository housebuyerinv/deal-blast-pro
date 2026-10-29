import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../../.netlify/buyermatch-production/', import.meta.url);
test('production verification package is isolated, hashed and never deployment approval', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const bundle = await readFile(new URL('functions/buyermatch.mjs', base));
  assert.equal(manifest.schema, 'buyermatch-netlify-production-v1');
  assert.equal(manifest.sha256, createHash('sha256').update(bundle).digest('hex'));
  assert.equal(manifest.verificationOnly, true); assert.equal(manifest.deploymentAuthorized, false);
});
test('production verification publish folder exposes no application or legal drafts', async () => {
  assert.deepEqual(await readdir(new URL('publish/', base)), ['index.html']);
  assert.doesNotMatch(await readFile(new URL('publish/index.html', base), 'utf8'), /<script|OWNER|COUNSEL|supabase/);
});
test('built production verification entry refuses all execution', async () => {
  const { default: handler } = await import(new URL('functions/buyermatch.mjs', base));
  assert.equal((await handler(new Request('https://example.invalid/'), {})).status, 503);
});
