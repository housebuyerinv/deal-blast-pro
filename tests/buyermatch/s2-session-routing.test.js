import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const originalWindow = globalThis.window, originalFetch = globalThis.fetch, originalLocation = globalThis.location;
const UID = '368f5f93-acf7-4cc3-9805-a4c0817506c3';
const fixture = { state: null, session: null, deactivated: false, shell: 0, autosave: [], authReads: 0, requests: [] };
const noop = () => {};
const store = selector => selector(fixture.state); store.getState = () => fixture.state;
globalThis.__s2Route = {
  useAppStore: store,
  supabase: { supabaseUrl: 'https://qxhhlprentrufobpcgna.supabase.co', auth: {
    getSession: async () => ({ data: { session: fixture.session } }),
    signOut: async () => {},
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getUser: async () => { fixture.authReads++; return { data: { user: fixture.session?.user } }; },
  } },
  loadPaymentPendingAccountStatus: async () => { throw Error('Unexpected activation read'); },
  profileToUserNames: () => ({ name: 'Synthetic', fullName: '', displayName: '', businessName: '' }),
  getWorkspaceDisplayName: () => 'Synthetic', DEFAULT_SETTINGS: { onboarding: {} },
  ErrorBoundary: ({ children }) => children,
  useCloudAutoSave: enabled => { fixture.autosave.push(enabled); },
  shell: () => { fixture.shell++; return React.createElement('p', null, 'CRM plan boundary'); },
  loginPage: () => React.createElement('p', null, 'Normal login'),
};
const result = await build({ entryPoints: ['src/App.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-router-dom'],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qxhhlprentrufobpcgna.supabase.co') },
  plugins: [{ name: 'routing-fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      if (a.kind === 'entry-point' || /^(react(?:\/.*)?|react-router-dom)$/.test(a.path) || /S2SessionVerification$|S2DenialVerification$|s2BrowserVerification$|s2DenialVerification$/.test(a.path)) return;
      return { path: a.path, namespace: 'fixture' };
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents:
      'export const {' + Object.keys(globalThis.__s2Route).join(',') + '}=globalThis.__s2Route; export default ' +
      (a.path.endsWith('/AppShell') ? 'globalThis.__s2Route.shell' : a.path.endsWith('/Login') ? 'globalThis.__s2Route.loginPage' : '()=>null') + ';' }));
  } }] });
const module = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const App = module.exports.default;
async function mount({ uid = UID, subscribed = false, origin = 'https://dbp-registration-s2-localtest-housebuyerinv.vercel.app', anonymous = false, deactivated = false } = {}) {
  fixture.state = { user: { id: uid, email: 'dbp-s2-pro-1792721835370@example.com' }, trial: { plan: 'Free', billingStatus: 'Free Active' }, settings: { onboarding: {} },
    initialize: noop, login: noop, logout: noop, updateUserProfile: noop, activateManualPlan: noop, updateSettings: noop, buyerMatchSubscribed: subscribed };
  fixture.session = anonymous ? null : { user: { id: uid, email: fixture.state.user.email }, access_token: 'DUMMY_PRIVATE' };
  fixture.deactivated = deactivated; fixture.shell = 0; fixture.autosave = []; fixture.authReads = 0; fixture.requests = [];
  globalThis.window = { location: { origin } };
  globalThis.location = { pathname: '/s2/session-verification' };
  globalThis.fetch = async (url, options) => { fixture.requests.push({ url, options }); return { ok: !fixture.deactivated, status: fixture.deactivated ? 403 : 200, json: async () => ({ ok: !fixture.deactivated, deactivated: fixture.deactivated }) }; };
  let tree; await act(async () => { tree = create(React.createElement(MemoryRouter, { initialEntries: ['/s2/session-verification'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(App))); }); return tree;
}
for (const subscribed of [false, true]) test('actual root route reaches Pro control with Free CRM; BuyerMatch subscribed=' + subscribed, async () => {
  const tree = await mount({ subscribed });
  assert.equal(fixture.shell, 0); assert.equal(tree.root.findByProps({ 'data-s2-auth-check': true }).children[0], 'Verify this browser session');
  assert.ok(fixture.autosave.length > 0 && fixture.autosave.every(enabled => enabled === false));
  assert.equal(fixture.authReads, 0); assert.ok(fixture.requests.length > 0 && fixture.requests.every(r => r.url === '/api/account-status'));
  await act(() => tree.unmount());
});
for (const uid of ['synthetic-owner', 'wrong-user']) test('non-fixture account cannot trigger Pro check: ' + uid, async () => {
  const tree = await mount({ uid }); assert.equal(tree.root.findByProps({ 'data-s2-auth-check': true }).props.disabled, true); assert.equal(fixture.authReads, 0); assert.equal(fixture.shell, 0); await act(() => tree.unmount());
});
test('Production host rejects route before protected account requests', async () => {
  const tree = await mount({ origin: 'https://deal-blast-pro.vercel.app' }); assert.ok(JSON.stringify(tree.toJSON()).includes('Not available.')); assert.equal(fixture.requests.length, 0); assert.equal(fixture.authReads, 0); assert.equal(fixture.shell, 0); await act(() => tree.unmount());
});
for (const change of [{ anonymous: true }, { deactivated: true }]) test('existing auth/account guard retained: ' + JSON.stringify(change), async () => {
  const tree = await mount(change); assert.ok(JSON.stringify(tree.toJSON()).includes('Normal login')); assert.equal(tree.root.findAllByType('button').length, 0); assert.equal(fixture.authReads, 0); await act(() => tree.unmount());
});
test.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; globalThis.location = originalLocation; delete globalThis.__s2Route; });
