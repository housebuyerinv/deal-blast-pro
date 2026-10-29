import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const f = { calls: [], run: null };
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const listeners = new Map();
globalThis.__denialUI = f;
const compiled = await build({ entryPoints: ['src/components/billing/S2DenialVerification.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qxhhlprentrufobpcgna.supabase.co') },
  plugins: [{ name: 'synthetic-ui', setup(b) {
    b.onResolve({ filter: /lib\/supabase$|store\/useAppStore$|lib\/s2DenialVerification$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path.endsWith('s2DenialVerification') ? 'export const runS2Denials=async input=>{globalThis.__denialUI.calls.push(input);return globalThis.__denialUI.run(input)};' :
      a.path.endsWith('supabase') ? 'export const supabase={};' : 'export const useAppStore={getState:()=>({user:{id:"368f5f93-acf7-4cc3-9805-a4c0817506c3"}})};' }));
  } }] });
const module = { exports: {} }; new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Panel = module.exports.default;
const props = () => ({ authenticated: true, authEpoch: 1, isCurrentAuth: () => true });
async function mount(input = props()) {
  f.calls = []; listeners.clear(); f.run = async input => ({ status: 'PASS', binding: { ...input.plan, origin: input.origin, startedAt: Date.now(), completedAt: Date.now() }, checks: [{ operation: 'synthetic', httpStatus: 503, verified: true }] });
  globalThis.window = { location: { origin: 'https://dbp-registration-s2-synthetic-housebuyerinv.vercel.app' }, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  globalThis.document = { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  let tree; await act(() => { tree = create(React.createElement(Panel, input)); }); return tree;
}
const button = tree => tree.root.findByType('button');
const state = tree => tree.root.findByProps({ role: 'status' }).props['data-s2-denial-status'];
async function prepare(tree) {
  const values = ['a'.repeat(40), 'dpl_SyntheticOnly', '5bab24c5-e50c-4854-a051-610f4334943b', new Date(Date.now() + 60000).toISOString()];
  for (let i = 0; i < values.length; i++) await act(() => tree.root.findAllByType('input')[i].props.onChange({ target: { value: values[i] } }));
  await act(() => tree.root.findAllByType('input')[4].props.onChange({ target: { checked: true } }));
}
test('no execution on mount; confirmation and fresh authentication are required', async () => {
  const tree = await mount({ ...props(), authenticated: false }); assert.equal(f.calls.length, 0); assert.equal(button(tree).props.disabled, true);
  await act(() => button(tree).props.onClick()); assert.equal(f.calls.length, 0); await act(() => tree.unmount());
  const fresh = await mount(); assert.equal(button(fresh).props.disabled, true); await act(() => button(fresh).props.onClick()); assert.equal(f.calls.length, 0); await act(() => fresh.unmount());
});
test('approved public plan is passed once; controls lock and evidence projects only verified binding', async () => {
  const tree = await mount(); await prepare(tree);
  await act(async () => { const run = button(tree).props.onClick; await Promise.all([run(), run()]); });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].plan.source, 'a'.repeat(40)); assert.equal(state(tree), 'PASS'); assert.equal(button(tree).props.disabled, true);
  const evidence = JSON.parse(tree.root.findByType('pre').children.join('')); assert.equal(evidence.binding.deploymentId, 'dpl_SyntheticOnly'); assert.equal(evidence.checks[0].httpStatus, 503); await act(() => tree.unmount());
});
test('Auth invalidation aborts in-flight run and rejects late pass', async () => {
  const tree = await mount(); let resolve; f.run = () => new Promise(r => { resolve = r; }); await prepare(tree);
  let pending; await act(() => { pending = button(tree).props.onClick(); });
  await act(() => tree.update(React.createElement(Panel, { ...props(), authenticated: false, authEpoch: 2 })));
  assert.equal(f.calls[0].signal.aborted, true);
  await act(async () => { resolve({ status: 'PASS', checks: [] }); await pending; }); assert.equal(state(tree), 'UNVERIFIED'); await act(() => tree.unmount());
});
test('unmount aborts run; no automatic retry', async () => {
  const tree = await mount(); let resolve; f.run = () => new Promise(r => { resolve = r; }); await prepare(tree);
  let pending; await act(() => { pending = button(tree).props.onClick(); }); await act(() => tree.unmount());
  assert.equal(f.calls[0].signal.aborted, true); resolve({ status: 'UNVERIFIED', checks: [] }); await pending; assert.equal(f.calls.length, 1);
});
for (const event of ['focus', 'visibilitychange']) test('run deadline invalidates visible PASS on ' + event + ' without an Auth event', async () => {
  const tree = await mount(); await prepare(tree); await act(() => button(tree).props.onClick()); assert.equal(state(tree), 'PASS');
  const originalNow = Date.now;
  Date.now = () => f.calls[0].plan.expiresAt + 1;
  try {
    await act(() => listeners.get(event)()); assert.equal(state(tree), 'UNVERIFIED');
    const receipt = JSON.parse(tree.root.findByType('pre').children.join(''));
    assert.equal(receipt.completedOutcome, 'PASS'); assert.equal(f.calls.length, 1);
  } finally { Date.now = originalNow; await act(() => tree.unmount()); }
});
test('deadline timer invalidates PASS without owner interaction; timers/listeners cleaned up', async () => {
  const originalTimer = globalThis.setTimeout, originalNow = Date.now; let expire;
  const tree = await mount(); await prepare(tree);
  globalThis.setTimeout = (fn, delay, ...args) => { if (delay > 50000) expire = fn; return originalTimer(fn, delay, ...args); };
  try {
    await act(() => button(tree).props.onClick()); assert.equal(state(tree), 'PASS');
    Date.now = () => f.calls[0].plan.expiresAt;
    await act(() => expire()); assert.equal(state(tree), 'UNVERIFIED'); assert.equal(f.calls.length, 1);
  } finally { globalThis.setTimeout = originalTimer; Date.now = originalNow; await act(() => tree.unmount()); }
  assert.equal(listeners.size, 0);
});
test('missing run binding cannot display PASS', async () => {
  const tree = await mount(); f.run = async () => ({ status: 'PASS', checks: [] });
  await prepare(tree); await act(() => button(tree).props.onClick()); assert.equal(state(tree), 'UNVERIFIED'); await act(() => tree.unmount());
});
test.after(() => { globalThis.window = originalWindow; globalThis.document = originalDocument; delete globalThis.__denialUI; });
