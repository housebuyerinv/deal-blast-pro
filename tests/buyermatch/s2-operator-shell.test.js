import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

let pathname, counts;
const noWrite = () => {
  throw Error('Unexpected preference write');
};
const state = {
  deals: [],
  buyers: [],
  followUps: [],
  currentDealId: null,
  settings: {
    onboarding: { planSelectionCompleted: true },
    deletionRequest: { accountStatus: 'Active' },
  },
  user: { id: 'synthetic-owner' },
  trial: { plan: 'Free', billingStatus: 'Free Active' },
  setCurrentDeal: noWrite,
  activateManualPlan: noWrite,
  updateSettings: noWrite,
  logout: noWrite,
  workspaceInstanceId: 'synthetic-workspace',
};
const store = (selector) => (selector ? selector(state) : state);
store.getState = () => state;
globalThis.__operatorShell = {
  useAppStore: store,
  useLocation: () => ({ pathname }),
  useNavigate: () => noWrite,
  useBuyerMatchAccess: () => ({
    active: false,
    subscribed: false,
    pending: false,
  }),
  isBuyerMatchRoute: (p) =>
    p === '/app/buyermatch' || p.startsWith('/app/buyermatch/'),
  isBuyerMatchAccountRoute: (p) =>
    p === '/app/settings' || p.startsWith('/app/buyermatch'),
  isApiMode: false,
  DEFAULT_SETTINGS: {
    onboarding: {},
    deletionRequest: { accountStatus: 'Active' },
  },
  isInternalAdmin: () => true,
  isSuperAdmin: () => true,
  hasEffectiveOwnerAdminBypass: () => true,
  getEffectivePlan: () => 'Free',
  getOwnerPreviewPlan: () => 'Owner Admin',
  isOwnerPreviewActive: () => false,
  canAccessRoute: () => true,
  getRequiredPlanForRoute: () => 'Free',
  getPastDueStage: () => 'none',
  canUseLaunchedFeature: () => true,
  getFeatureLockedMessage: () => '',
  getPastDuePolicyMessage: () => '',
  buildStripeCheckoutUrl: noWrite,
  getBillingSetupWithLaunchDefaults: () => ({}),
  getPlanPaymentLink: () => '',
  isValidPaymentUrl: () => false,
  SectionErrorBoundary: ({ children }) => children,
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
  Navigate: () => null,
  supabase: { auth: { getSession: noWrite } },
  tour: () => {
    counts.tour++;
    return null;
  },
  promotion: () => {
    counts.promotion++;
    return null;
  },
};
const compiled = await build({
  entryPoints: ['src/components/layout/AppShell.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'synthetic-shell-boundaries',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          args.kind === 'entry-point'
            ? undefined
            : args.path === 'react'
              ? { path: import.meta.resolve('react'), external: true }
              : { path: args.path, namespace: 'shell-fixture' },
        );
        b.onLoad({ filter: /.*/, namespace: 'shell-fixture' }, (args) => ({
          loader: 'js',
          contents:
            'export const {' +
            Object.keys(globalThis.__operatorShell).join(',') +
            '}=globalThis.__operatorShell;export default ' +
            (args.path.endsWith('/OnboardingTour')
              ? 'globalThis.__operatorShell.tour'
              : args.path.endsWith('/ProTrialPromotionModal')
                ? 'globalThis.__operatorShell.promotion'
                : '()=>null') +
            ';',
        }));
      },
    },
  ],
});
const { default: Shell } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
test.after(() => {
  delete globalThis.__operatorShell;
});
for (const [path, tour, promotion] of [
  ['/app/s2-attestation', 0, 0],
  ['/app/dashboard', 1, 1],
  ['/app/buyermatch/plans', 0, 0],
])
  test('actual shell modal mounts for ' + path, () => {
    pathname = path;
    counts = { tour: 0, promotion: 0 };
    const html = renderToStaticMarkup(
      React.createElement(
        Shell,
        null,
        React.createElement('p', null, 'synthetic page content'),
      ),
    );
    assert.ok(html.includes('synthetic page content'));
    assert.deepEqual(counts, { tour, promotion });
  });
