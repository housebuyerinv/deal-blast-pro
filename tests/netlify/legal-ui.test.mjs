import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function component(production) {
  await mkdir(path.join(root, '.netlify/test'), { recursive: true });
  const outfile = path.join(await mkdtemp(path.join(root, '.netlify/test/legal-')), 'component.mjs');
  await build({ entryPoints: [path.join(root, 'src/pages/public/NetlifyLegalDocument.tsx')], outfile, bundle: true, format: 'esm',
    platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], define: { 'import.meta.env.VITE_BM_NETLIFY_PRODUCTION_PROFILE': JSON.stringify(production ? 'true' : 'false') } });
  return (await import(pathToFileURL(outfile))).default;
}
test('legacy profile retains its legal page without fetching production text', async () => {
  const Component = await component(false), saved = globalThis.fetch; let view;
  try {
    globalThis.fetch = () => assert.fail('Legacy page must not fetch Netlify legal assets');
    await act(async () => { view = renderer.create(React.createElement(Component, { name: 'terms', fallback: React.createElement('p', null, 'legacy fixture') })); });
    assert.match(JSON.stringify(view.toJSON()), /legacy fixture/);
  } finally { view?.unmount(); globalThis.fetch = saved; }
});
test('production legal page renders approved plain text and refuses HTML fallback', async () => {
  const Component = await component(true), saved = globalThis.fetch; let view;
  try {
    globalThis.fetch = async url => { assert.equal(url, '/legal/terms.txt'); return new Response('Approved synthetic terms <script>text only</script>', { headers: { 'Content-Type': 'text/plain' } }); };
    await act(async () => { view = renderer.create(React.createElement(Component, { name: 'terms', fallback: 'UNAPPROVED FALLBACK' })); });
    assert.match(JSON.stringify(view.toJSON()), /Approved synthetic terms/);
    assert.doesNotMatch(JSON.stringify(view.toJSON()), /UNAPPROVED FALLBACK/);
    globalThis.fetch = async () => new Response('<html>wrong SPA</html>', { headers: { 'Content-Type': 'text/html' } });
    await act(async () => { view.update(React.createElement(Component, { name: 'privacy', fallback: 'UNAPPROVED FALLBACK' })); });
    assert.match(JSON.stringify(view.toJSON()), /Approved document unavailable/);
    assert.doesNotMatch(JSON.stringify(view.toJSON()), /wrong SPA|UNAPPROVED FALLBACK/);
  } finally { view?.unmount(); globalThis.fetch = saved; }
});
