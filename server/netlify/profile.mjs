// Separate, private synthetic acceptance profile. Never a Production opt-in.
export const excludedProjects = new Set(['qxhhlprentrufobpcgna', 'aigvnbxiydbzzqbetlhl', 'bwlreupczckklrxdsdcj']);
export function syntheticProject(ref) {
  if (!/^[a-z]{20}$/.test(ref || '') || excludedProjects.has(ref)) throw Error('Independent synthetic project required');
  return `https://${ref}.supabase.co`;
}
export function netlifyStagingOrigin(env) {
  const supabase = syntheticProject(env.BM_NETLIFY_SUPABASE_REF);
  const origin = new URL(env.BM_APP_ORIGIN || '');
  if (env.BM_HOSTING_PROFILE !== 'netlify-private-v1' || env.BM_ENVIRONMENT !== 'staging' ||
      env.VERCEL || env.VERCEL_ENV || env.BM_STAGING_PROJECT_REF !== env.BM_NETLIFY_SUPABASE_REF ||
      env.SUPABASE_URL !== supabase || env.VITE_SUPABASE_URL !== supabase ||
      !/^[a-z0-9-]{2,63}$/.test(env.BM_NETLIFY_SITE_NAME || '') ||
      !new RegExp(`^[a-f0-9]{24}--${env.BM_NETLIFY_SITE_NAME}\\.netlify\\.app$`).test(origin.hostname) ||
      origin.protocol !== 'https:' || origin.origin !== env.BM_APP_ORIGIN || origin.origin !== env.PUBLIC_APP_URL) throw Error('Independent Netlify staging required');
  return origin.origin;
}
// Derive the immutable origin only from authenticated provider context, never
// Host/Forwarded headers. This avoids needing a deployment ID before uploading.
export function bindNetlifyOrigin(env, context) {
  if (env.BM_HOSTING_PROFILE !== 'netlify-private-v1' || env.BM_NETLIFY_TEAM_SLUG !== 'marcel-g-ovf4dew' ||
      !/^[a-z0-9-]{8,80}$/.test(env.BM_NETLIFY_ACCOUNT_ID || '') ||
      !/^[a-f0-9-]{36}$/.test(env.BM_NETLIFY_SITE_ID || '') || !/^[a-z0-9-]{2,63}$/.test(env.BM_NETLIFY_SITE_NAME || '') ||
      context?.account?.id !== env.BM_NETLIFY_ACCOUNT_ID || context?.site?.id !== env.BM_NETLIFY_SITE_ID ||
      context?.site?.name !== env.BM_NETLIFY_SITE_NAME || !/^[a-f0-9]{24}$/.test(context?.deploy?.id || '') ||
      context?.deploy?.published !== false || !['deploy-preview', 'branch-deploy'].includes(context?.deploy?.context)) throw Error('Netlify ownership unavailable');
  const origin = `https://${context.deploy.id}--${context.site.name}.netlify.app`;
  if ((env.BM_APP_ORIGIN && env.BM_APP_ORIGIN !== origin) || (env.PUBLIC_APP_URL && env.PUBLIC_APP_URL !== origin)) throw Error('Netlify origin mismatch');
  env.BM_APP_ORIGIN = origin; env.PUBLIC_APP_URL = origin;
  return origin;
}
export function netlifyProfile(env, context, now = Date.now()) {
  const bad = () => { throw Error('Private Netlify configuration unavailable'); };
  if (env.BM_HOSTING_PROFILE !== 'netlify-private-v1' || env.BM_ENVIRONMENT !== 'staging' ||
      env.BM_NETLIFY_TEAM_SLUG !== 'marcel-g-ovf4dew' || env.VERCEL || env.VERCEL_ENV ||
      env.BM_LOCAL_SYNTHETIC === 'true') bad();
  const supabase = syntheticProject(env.BM_NETLIFY_SUPABASE_REF);
  netlifyStagingOrigin(env);
  if (env.BM_STAGING_PROJECT_REF !== env.BM_NETLIFY_SUPABASE_REF || env.SUPABASE_URL !== supabase ||
      env.VITE_SUPABASE_URL !== supabase || !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.VITE_SUPABASE_ANON_KEY || !/^[a-f0-9]{64}$/i.test(env.BUYERMATCH_IDENTITY_KEY || '')) bad();
  if (!/^[a-z0-9-]{8,80}$/.test(env.BM_NETLIFY_ACCOUNT_ID || '') ||
      !/^[a-f0-9-]{36}$/.test(env.BM_NETLIFY_SITE_ID || '') ||
      !/^[a-z0-9-]{2,63}$/.test(env.BM_NETLIFY_SITE_NAME || '') ||
      !/^[a-f0-9]{24}$/.test(context?.deploy?.id || '') ||
      context?.site?.id !== env.BM_NETLIFY_SITE_ID || context?.site?.name !== env.BM_NETLIFY_SITE_NAME ||
      context?.account?.id !== env.BM_NETLIFY_ACCOUNT_ID || context?.deploy?.published !== false ||
      !['deploy-preview', 'branch-deploy'].includes(context?.deploy?.context)) bad();
  const origin = `https://${context.deploy.id}--${env.BM_NETLIFY_SITE_NAME}.netlify.app`;
  if (env.BM_APP_ORIGIN !== origin || env.PUBLIC_APP_URL !== origin ||
      (env.BM_NETLIFY_ACCESS_SECRET || '').length < 48 || (env.BM_RESPONSE_SECRET || '').length < 32) bad();
  for (const [name, value] of Object.entries({ DBP_REGISTRATION_PAUSED: 'true', BM_CHECKOUT_ENABLED: 'false',
    BM_LIVE_BILLING_ENABLED: 'false', BM_DELIVERY_MODE: 'disabled', BM_LIVE_DELIVERY_ENABLED: 'false', BM_RESPONSE_ENABLED: 'false' })) {
    if (env[name] !== value) bad();
  }
  if (Object.entries(env).some(([name, value]) => value && /STRIPE|RESEND|RENTCAST|GEOAPIFY|OPENAI|^BM_S2_|^BM_PRODUCTION_|^BM_ISOLATED_|^BM_WORKER_SECRET$/.test(name))) bad();
  const start = Date.parse(env.BM_NETLIFY_WINDOW_START), end = Date.parse(env.BM_NETLIFY_WINDOW_END);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 1800000 || now < start || now >= end) bad();
  return { origin, supabase, end, project: env.BM_NETLIFY_SUPABASE_REF };
}
