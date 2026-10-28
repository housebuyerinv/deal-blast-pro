import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const originalWindow = globalThis.window;
const fixture = { uid: '', calls: 0, callback: null, getUser: null, unsubscribed: 0 };
globalThis.__s2SessionUI = fixture;
async function compile(entry, mock = false) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'],
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qxhhlprentrufobpcgna.supabase.co') },
    plugins: mock ? [{ name: 'private-fixtures', setup(b) {
      b.onResolve({ filter: /lib\/supabase$|store\/useAppStore$/ }, a => ({ path: a.path, namespace: 'dummy' }));
      b.onLoad({ filter: /.*/, namespace: 'dummy' }, a => ({ contents: a.path.endsWith('supabase') ?
        `export const supabase={supabaseUrl:'https://qxhhlprentrufobpcgna.supabase.co',auth:{getUser:()=>globalThis.__s2SessionUI.getUser(),onAuthStateChange:cb=>{globalThis.__s2SessionUI.callback=cb;return {data:{subscription:{unsubscribe(){globalThis.__s2SessionUI.unsubscribed++}}}}}}};` :
        `export const useAppStore=s=>s({user:{id:globalThis.__s2SessionUI.uid}});useAppStore.getState=()=>({user:{id:globalThis.__s2SessionUI.uid}});` }));
    } }] : [] });
  const m = { exports: {} }; new Function('require', 'module', 'exports', r.outputFiles[0].text)(createRequire(import.meta.url), m, m.exports); return m.exports;
}
const { S2_PRO_USER_ID: UID, S2_AUTH_URL: BACKEND, isS2VerificationOrigin, verifyS2ProSession } = await compile('src/lib/s2BrowserVerification.ts');
const { default: Panel } = await compile('src/components/billing/S2SessionVerification.tsx', true);
const ORIGIN = 'https://dbp-registration-s2-localtest-housebuyerinv.vercel.app';
const goodUser = () => ({ id: UID, email: 'dbp-s2-pro-1792721835370@example.com', role: 'authenticated', email_confirmed_at: '2026-10-20T00:00:00Z' });
const args = change => ({ origin: ORIGIN, backend: BACKEND, confirmed: true, currentUser: () => UID, stillCurrent: () => true, getUser: async () => ({ data: { user: goodUser() } }), ...change });
test('strict S2 HTTPS origin and backend binding', () => {
  assert.equal(isS2VerificationOrigin(ORIGIN, BACKEND), true);
  for (const origin of [ORIGIN + '/', ORIGIN + '.evil.example', ORIGIN.replace('https:', 'http:'), ORIGIN + ':443', 'https://deal-blast-pro.vercel.app']) assert.equal(isS2VerificationOrigin(origin, BACKEND), false);
  assert.equal(isS2VerificationOrigin(ORIGIN, 'https://production.example'), false);
});
test('confirmation, environment, current identity and timeout gates precede Auth request', async () => {
  for (const change of [{ confirmed: false }, { origin: 'https://production.example' }, { backend: '' }, { currentUser: () => 'wrong' }, { stillCurrent: () => false }, { timeoutMs: 0 }]) {
    let calls = 0; assert.equal(await verifyS2ProSession(args({ ...change, getUser: async () => { calls++; throw Error(); } })), false); assert.equal(calls, 0);
  }
});
test('confirmed correct server identity passes; never returns raw user data', async () => {
  assert.equal(await verifyS2ProSession(args()), true);
  for (const change of [{ id: 'wrong' }, { email: 'wrong' }, { role: 'service_role' }, { is_anonymous: true }, { email_confirmed_at: null }])
    assert.equal(await verifyS2ProSession(args({ getUser: async () => ({ data: { user: { ...goodUser(), ...change } } }) })), false);
});
test('exceptions and provider errors fail closed', async () => {
  assert.equal(await verifyS2ProSession(args({ getUser: async () => { throw Error('DUMMY_PRIVATE'); } })), false);
  assert.equal(await verifyS2ProSession(args({ getUser: async () => ({ error: 'DUMMY_PRIVATE', data: { user: goodUser() } }) })), false);
});
test('account/auth-generation changes while request is pending discard result', async () => {
  for (const accountChange of [true, false]) {
    let current = true;
    assert.equal(await verifyS2ProSession(args({ currentUser: () => accountChange && !current ? 'wrong' : UID, stillCurrent: () => accountChange || current,
      getUser: async () => { current = false; return { data: { user: goodUser() } }; } })), false);
  }
});
test('timeout is bounded and does not retry', async () => {
  let calls = 0; assert.equal(await verifyS2ProSession(args({ timeoutMs: 5, getUser: () => { calls++; return new Promise(() => {}); } })), false); assert.equal(calls, 1);
});
async function mount(origin = ORIGIN) {
  fixture.uid = UID; fixture.calls = 0; fixture.callback = null; fixture.unsubscribed = 0;
  fixture.getUser = async () => { fixture.calls++; return { data: { user: goodUser() } }; };
  globalThis.window = { location: { origin } };
  let tree; await act(() => { tree = create(React.createElement(Panel)); }); return tree;
}
const checkbox = tree => tree.root.findAllByType('input')[0];
const button = tree => tree.root.findByProps({ 'data-s2-auth-check': true });
const status = tree => tree.root.findAllByProps({ role: 'status' }).find(node => 'data-s2-session-status' in node.props).props['data-s2-session-status'];
async function confirm(tree) { await act(() => checkbox(tree).props.onChange({ target: { checked: true } })); }
test('mount makes no Auth request; explicit confirmation required; one successful request', async () => {
  const tree = await mount(); assert.equal(fixture.calls, 0); assert.equal(button(tree).props.disabled, true);
  await act(() => button(tree).props.onClick()); assert.equal(fixture.calls, 0);
  await confirm(tree); await act(() => button(tree).props.onClick()); assert.equal(fixture.calls, 1); assert.equal(status(tree), 'VERIFIED');
  assert.ok(!JSON.stringify(tree.toJSON()).includes(UID)); await act(() => tree.unmount());
});
test('synchronous duplicate clicks cannot repeat the check', async () => {
  const tree = await mount(); await confirm(tree);
  await act(async () => { const click = button(tree).props.onClick; await Promise.all([click(), click()]); });
  assert.equal(fixture.calls, 1); await act(() => tree.unmount());
});
test('Auth event invalidates visible success without another request', async () => {
  const tree = await mount(); await confirm(tree); await act(() => button(tree).props.onClick());
  await act(() => fixture.callback('SIGNED_OUT')); assert.equal(status(tree), 'UNVERIFIED'); assert.equal(fixture.calls, 1); assert.equal(button(tree).props.disabled, true); await act(() => tree.unmount());
});
test('switching account invalidates success and confirmation', async () => {
  const tree = await mount(); await confirm(tree); await act(() => button(tree).props.onClick());
  fixture.uid = 'wrong'; await act(() => tree.update(React.createElement(Panel))); assert.equal(status(tree), 'UNVERIFIED'); assert.equal(checkbox(tree).props.checked, false); await act(() => tree.unmount());
});
test('unmounted request cannot publish a late success', async () => {
  const tree = await mount(); let resolve;
  fixture.getUser = () => new Promise(r => { resolve = r; }); await confirm(tree);
  let pending; await act(() => { pending = button(tree).props.onClick(); });
  await act(() => tree.unmount()); assert.equal(fixture.unsubscribed, 1);
  await act(async () => { resolve({ data: { user: goodUser() } }); await pending; });
});
test('Auth changes while checking prevent late success', async () => {
  const tree = await mount(); let resolve;
  fixture.getUser = () => new Promise(r => { resolve = r; }); await confirm(tree);
  let pending; await act(() => { pending = button(tree).props.onClick(); });
  await act(() => fixture.callback('SIGNED_OUT'));
  await act(async () => { resolve({ data: { user: goodUser() } }); await pending; });
  assert.equal(status(tree), 'UNVERIFIED'); await act(() => tree.unmount());
});
test('verified result expires without another provider request', async () => {
  const originalTimer = globalThis.setTimeout; let expire;
  const tree = await mount();
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 120000) { expire = fn; return originalTimer(() => {}, delay); }
    return originalTimer(fn, delay, ...args);
  };
  try {
    await confirm(tree); await act(() => button(tree).props.onClick()); assert.equal(status(tree), 'VERIFIED');
    await act(() => expire()); assert.equal(status(tree), 'UNVERIFIED'); assert.equal(fixture.calls, 1);
  } finally { globalThis.setTimeout = originalTimer; await act(() => tree.unmount()); }
});
test('wrong host has no control, subscription or Auth calls', async () => {
  const tree = await mount('https://deal-blast-pro.vercel.app'); assert.equal(tree.toJSON(), null); assert.equal(fixture.callback, null); assert.equal(fixture.calls, 0); await act(() => tree.unmount());
});
test('raw provider error never appears in UI and does not permit retry', async () => {
  const tree = await mount(); fixture.getUser = async () => { fixture.calls++; throw Error('DUMMY_PRIVATE'); };
  await confirm(tree); await act(() => button(tree).props.onClick()); assert.equal(status(tree), 'UNVERIFIED'); assert.ok(!JSON.stringify(tree.toJSON()).includes('DUMMY_PRIVATE')); assert.equal(button(tree).props.disabled, true); await act(() => tree.unmount());
});
test.after(() => { globalThis.window = originalWindow; delete globalThis.__s2SessionUI; });
