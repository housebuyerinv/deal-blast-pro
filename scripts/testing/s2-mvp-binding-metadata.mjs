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
export function verifyBindingMetadata(body, recovery) {
  const recovered = Object.create(null);
  if (recovery !== undefined) {
    const names = ['BUYERMATCH_IDENTITY_KEY', 'BM_RESPONSE_SECRET', 'BM_WORKER_SECRET'];
    if (recovery?.verified !== true || recovery.project !== 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl' ||
        recovery.team !== 'team_2ejXKYjjGXIFsIQTUMEqZ8Cf' || recovery.source !== 'b99830596080eef2b24472e71bdcb061c855bf57' ||
        recovery.cohort?.verified !== true || recovery.cohort.count !== 223 || recovery.cohort.syntheticOnly !== true ||
        recovery.cohort.allDecryptAndHashMatch !== true || !Array.isArray(recovery.receipts) || recovery.receipts.length !== 3)
      throw Error('Recovery receipt unavailable');
    for (const r of recovery.receipts) {
      if (Object.keys(r).sort().join(',') !== 'id,key,target,type,updatedAt' || !names.includes(r.key) || recovered[r.key] ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(r.id ?? '') || r.type !== 'sensitive' || JSON.stringify(r.target) !== '["preview"]' || !Number.isSafeInteger(r.updatedAt) || r.updatedAt <= 0)
        throw Error('Recovery receipt unavailable');
      recovered[r.key] = { id: r.id, type: r.type, updatedAt: r.updatedAt };
    }
    if (new Set(Object.values(recovered).map((r) => r.id)).size !== 3) throw Error('Recovery receipt unavailable');
  }
  const rows = body?.envs;
  if (
    !Array.isArray(rows) ||
    body.pagination?.next ||
    rows.some((x) => (!allowed.has(x.key) && !recovered[x.key]) || x.gitBranch)
  )
    throw Error('Unknown environment binding');
  const bindings = {};
  for (const [key, pin] of Object.entries({ ...pins, ...recovered })) {
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
