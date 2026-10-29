// Explicit local developer profile. Never enabled by a hosted/Vercel environment.
export function localSyntheticOrigin(env) {
  if (env.BM_LOCAL_SYNTHETIC !== 'true') return null;
  const registrationSafe = env.DBP_REGISTRATION_PAUSED === 'true' ||
    (env.DBP_REGISTRATION_PAUSED === 'false' && env.BM_LOCAL_SIGNUP_ALLOWED === 'true' && env.PUBLIC_APP_URL === 'http://127.0.0.1:5189');
  if (!['development','test'].includes(env.NODE_ENV) || env.VERCEL_ENV || env.VERCEL ||
    env.BM_ENVIRONMENT !== 'staging' || env.BM_STAGING_PROJECT_REF !== 'buyermatch-local-synthetic' ||
    env.SUPABASE_URL !== 'http://127.0.0.1:55321' ||
    env.VITE_SUPABASE_URL !== env.SUPABASE_URL || env.BM_APP_ORIGIN !== 'http://127.0.0.1:5189' ||
    !registrationSafe || env.BM_CHECKOUT_ENABLED !== 'false' ||
    env.BM_DELIVERY_MODE !== 'disabled' || env.BM_LIVE_DELIVERY_ENABLED !== 'false' ||
    env.BM_LIVE_BILLING_ENABLED !== 'false' ||
    Object.keys(env).some(name=>/STRIPE|RESEND|RENTCAST|GEOAPIFY|OPENAI/.test(name) && !!env[name]))
    throw new Error('Isolated local synthetic configuration required');
  return env.SUPABASE_URL;
}
