import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const result = await build({ entryPoints: ['src/lib/cloudAutoSave.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], plugins: [{ name: 'no-provider-access', setup(b) {
  b.onResolve({ filter: /^\.\/cloudSync$|^\.\/supabase$/ }, a => ({ path: a.path, namespace: 'blocked' }));
  b.onLoad({ filter: /.*/, namespace: 'blocked' }, () => ({ contents: 'export const supabase={auth:{getSession:()=>globalThis.__autosaveSession.getSession()}};export function uploadLocalAppDataToCloud(){globalThis.__autosaveSession.uploads++}' }));
} }] });
const module = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { useCloudAutoSave, scheduleCloudAutoSave } = module.exports;
function Harness({ enabled }) { useCloudAutoSave(enabled); return null; }
test('disabled read-only hook registers no save events or interval', async () => {
  const original = globalThis.window;
  globalThis.window = { addEventListener() { assert.fail('Unexpected listener'); }, setInterval() { assert.fail('Unexpected interval'); } };
  try { let tree; await act(() => { tree = create(React.createElement(Harness, { enabled: false })); }); await act(() => tree.unmount()); }
  finally { globalThis.window = original; }
});
test('default autosave remains enabled; entering read-only page cancels pending save and listeners', async () => {
  const original = { window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const events = new Set(), cleared = []; let interval = 0, scheduled;
  globalThis.window = { addEventListener: name => events.add(name), removeEventListener: name => events.delete(name), setInterval: () => ++interval, clearInterval: id => cleared.push(id) };
  globalThis.setTimeout = () => { scheduled = { synthetic: true }; return scheduled; };
  globalThis.clearTimeout = id => cleared.push(id);
  let tree;
  try {
    await act(() => { tree = create(React.createElement(Harness)); });
    assert.equal(interval, 1); assert.equal(events.size, 1);
    scheduleCloudAutoSave();
    await act(() => tree.update(React.createElement(Harness, { enabled: false })));
    assert.equal(events.size, 0); assert.ok(cleared.includes(scheduled)); assert.ok(cleared.includes(1)); assert.equal(interval, 1);
  } finally { if (tree) await act(() => tree.unmount()); Object.assign(globalThis, original); }
});
test('already-fired callback awaiting Auth cannot upload after read-only transition', async () => {
  const original = { window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let callback, resolveSession, tree;
  globalThis.__autosaveSession = { getSession: () => new Promise(resolve => { resolveSession = resolve; }), uploads: 0 };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, localStorage: { getItem() { assert.fail('Disabled callback must not inspect storage'); } } };
  globalThis.setTimeout = fn => { callback = fn; return 1; }; globalThis.clearTimeout = () => {};
  try {
    await act(() => { tree = create(React.createElement(Harness)); });
    scheduleCloudAutoSave(); const pending = callback();
    await act(() => tree.update(React.createElement(Harness, { enabled: false })));
    resolveSession({ data: { session: { user: { id: 'synthetic' } } } }); await pending;
    assert.equal(globalThis.__autosaveSession.uploads, 0);
    callback = null; scheduleCloudAutoSave(); assert.equal(callback, null);
  } finally { if (tree) await act(() => tree.unmount()); Object.assign(globalThis, original); delete globalThis.__autosaveSession; }
});
