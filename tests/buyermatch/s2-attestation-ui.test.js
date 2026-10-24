import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { REQUIRED_S2_ENV } from '../../scripts/buyermatch-s2-release.mjs';

let states, ownerId, requests, mode;
const originalFetch = globalThis.fetch,
  originalWindow = globalThis.window;
const store = (selector) => selector({ user: { id: ownerId } });
store.getState = () => ({ user: { id: ownerId } });
globalThis.__s2Ui = {
  h: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (value) => [value, (v) => states.push(v)],
  useEffect: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useAppStore: store,
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: ownerId },
            access_token: 'DUMMY_PRIVATE_SESSION',
          },
        },
      }),
    },
  },
};
const compiled = await build({
  entryPoints: ['src/pages/app/S2Attestation.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsxFactory: 'globalThis.__s2Ui.h',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      'https://qxhhlprentrufobpcgna.supabase.co',
    ),
  },
  plugins: [
    {
      name: 'local-ui-dependencies',
      setup(b) {
        b.onResolve(
          { filter: /^react$|lib\/supabase$|store\/useAppStore$/ },
          (args) => ({ path: args.path, namespace: 'ui-dummy' }),
        );
        b.onLoad({ filter: /.*/, namespace: 'ui-dummy' }, (args) => ({
          contents:
            args.path === 'react'
              ? 'export const {useState,useEffect,useRef}=globalThis.__s2Ui;'
              : args.path.endsWith('supabase')
                ? 'export const {supabase}=globalThis.__s2Ui;'
                : 'export const {useAppStore}=globalThis.__s2Ui;',
          loader: 'js',
        }));
      },
    },
  ],
});
const { default: Page } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const button = (value) =>
  value?.type === 'button'
    ? value
    : Array.isArray(value)
      ? value.map(button).find(Boolean)
      : value?.children?.map(button).find(Boolean);
function reset() {
  states = [];
  ownerId = 'synthetic-ui-owner';
  requests = [];
  mode = 'ok';
  globalThis.window = {
    location: {
      hostname: 'dbp-registration-s2-synthetic-housebuyerinv.vercel.app',
    },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (mode === 'switch') ownerId = 'different-owner';
    return {
      ok: mode !== 'denied',
      json: async () =>
        mode === 'malformed'
          ? { error: 'DUMMY_PRIVATE_RESPONSE' }
          : {
              schema: 1,
              qaOnly: true,
              identity: {
                sourceSha: '1'.repeat(40),
                deploymentId: 'dpl_SyntheticUI',
              },
              build: {
                sha256: '2'.repeat(64),
                settings: { ...REQUIRED_S2_ENV },
              },
              runtime: { settings: { ...REQUIRED_S2_ENV } },
            },
    };
  };
}
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  delete globalThis.__s2Ui;
});
test('owner view uses normal same-origin GET auth internally and renders only public summary', async () => {
  reset();
  const control = button(Page());
  assert.equal(control.props.type, 'button');
  await control.props.onClick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/platform/s2-attestation');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(
    requests[0].options.headers.Authorization,
    'Bearer DUMMY_PRIVATE_SESSION',
  );
  assert.equal(JSON.stringify(states).includes('DUMMY'), false);
  assert.ok(
    states.some((x) => typeof x === 'string' && x.startsWith('Verified 17')),
  );
});
for (const failure of ['denied', 'malformed', 'switch'])
  test('owner view suppresses private output for ' + failure, async () => {
    reset();
    mode = failure;
    await button(Page()).props.onClick();
    assert.equal(JSON.stringify(states).includes('DUMMY'), false);
    assert.equal(
      states.some((x) => typeof x === 'string' && x.startsWith('Verified')),
      false,
    );
  });
test('Production host exposes no diagnostic button and source contains no raw config or session serialization', () => {
  reset();
  globalThis.window.location.hostname = 'deal-blast-pro.vercel.app';
  assert.equal(button(Page()), undefined);
  assert.equal(requests.length, 0);
  const text = readFileSync('src/pages/app/S2Attestation.tsx', 'utf8');
  for (const pattern of [
    'console.',
    'JSON.stringify',
    'localStorage',
    'sessionStorage',
    'access_token}</',
  ])
    assert.equal(text.includes(pattern), false);
});
