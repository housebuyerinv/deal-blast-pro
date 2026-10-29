export const instant = Date.parse('2026-10-29T18:00:00Z');
export function fixture() {
  const context = { account: { id: 'synthetic-account' }, site: { id: '11111111-1111-4111-8111-111111111111', name: 'bm-synthetic' },
    deploy: { id: '1234567890abcdef12345678', context: 'deploy-preview', published: false }, ip: '127.0.0.1' };
  const origin = `https://${context.deploy.id}--bm-synthetic.netlify.app`;
  const env = { BM_HOSTING_PROFILE: 'netlify-private-v1', BM_ENVIRONMENT: 'staging', BM_NETLIFY_TEAM_SLUG: 'marcel-g-ovf4dew',
    BM_NETLIFY_ACCOUNT_ID: context.account.id, BM_NETLIFY_SITE_ID: context.site.id, BM_NETLIFY_SITE_NAME: context.site.name,
    BM_NETLIFY_SUPABASE_REF: 'abcdefghijklmnopqrst', BM_STAGING_PROJECT_REF: 'abcdefghijklmnopqrst',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-not-a-credential', VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic',
    BUYERMATCH_IDENTITY_KEY: 'a'.repeat(64), BM_RESPONSE_SECRET: 'synthetic-response-'.repeat(4),
    BM_APP_ORIGIN: origin, PUBLIC_APP_URL: origin, BM_NETLIFY_ACCESS_SECRET: 'synthetic-access-'.repeat(4),
    BM_NETLIFY_WINDOW_START: new Date(instant).toISOString(), BM_NETLIFY_WINDOW_END: new Date(instant + 1800000).toISOString(),
    DBP_REGISTRATION_PAUSED: 'true', BM_CHECKOUT_ENABLED: 'false', BM_LIVE_BILLING_ENABLED: 'false',
    BM_DELIVERY_MODE: 'disabled', BM_LIVE_DELIVERY_ENABLED: 'false', BM_RESPONSE_ENABLED: 'false' };
  return { env, context, origin };
}
