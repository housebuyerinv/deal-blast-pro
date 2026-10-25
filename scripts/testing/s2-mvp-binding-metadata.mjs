// Public metadata continuity, not cryptographic credential validation.
export const pins = {
  BM_STRIPE_TEST_SECRET_KEY: {
    id: 'yVT4A3x3loJ9Y7Ks',
    type: 'sensitive',
    updatedAt: 1792715686989,
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    id: '3CGvIMxTkBN8UDnx',
    type: 'sensitive',
    updatedAt: 1792515530339,
  },
  SUPABASE_ANON_KEY: {
    id: 'SgzeIgDSpkwjEDys',
    type: 'sensitive',
    updatedAt: 1792515533646,
  },
  VITE_SUPABASE_ANON_KEY: {
    id: 'ysxW2K3luZiqmTrb',
    type: 'encrypted',
    updatedAt: 1792515536920,
  },
};
const allowed = new Set([
  ...Object.keys(pins),
  'DBP_REGISTRATION_PAUSED',
  'PUBLIC_APP_URL',
  'PROPERTY_INTELLIGENCE_ENABLED',
  'BM_LIVE_BILLING_ENABLED',
  'BM_LIVE_DELIVERY_ENABLED',
  'BM_CHECKOUT_ENABLED',
  'BM_DELIVERY_MODE',
  'BM_APP_ORIGIN',
  'BM_STAGING_PROJECT_REF',
  'BM_ENVIRONMENT',
  'DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS',
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
]);
export function verifyBindingMetadata(body) {
  const rows = body?.envs;
  if (
    !Array.isArray(rows) ||
    body.pagination?.next ||
    rows.some((x) => !allowed.has(x.key) || x.gitBranch)
  )
    throw Error('Unknown environment binding');
  const bindings = {};
  for (const [key, pin] of Object.entries(pins)) {
    const matches = rows.filter((x) => x.key === key);
    if (matches.length !== 1) throw Error('Missing or duplicate binding');
    const x = matches[0];
    if (
      x.id !== pin.id ||
      x.type !== pin.type ||
      x.updatedAt !== pin.updatedAt ||
      JSON.stringify(x.target) !== '["preview"]'
    )
      throw Error('Binding continuity changed');
    bindings[key] = { ...pin, target: ['preview'], branchSpecific: false };
  }
  return {
    metadataContinuityVerified: true,
    bindings,
    secretValuesRead: false,
    scope: 'S2 Preview only',
    limitation:
      'Unchanged provider bindings since prior hosted proofs; credential contents, account and permissions are not revalidated by metadata. New deployment must pass protected hosted verification before acceptance.',
  };
}
