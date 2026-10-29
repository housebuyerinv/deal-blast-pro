import { createHash } from 'node:crypto';
import { syntheticProject } from './profile.mjs';

// A separate compiled profile, never an environment switch on a private bundle.
export function approvedLegalReceipt(receipt) {
  return receipt?.approved === true && receipt.publicationAllowed === true &&
    typeof receipt.approvedBy === 'string' && receipt.approvedBy.trim().length > 0 &&
    Number.isFinite(Date.parse(receipt.approvedAt || '')) &&
    /^[a-f0-9]{64}$/.test(receipt.digest || '') &&
    Array.isArray(receipt.files) && receipt.files.length === 4 &&
    ['TERMS.md', 'PRIVACY.md', 'RENEWAL_CANCELLATION.md', 'REFUNDS.md'].every(name =>
      receipt.files.filter(file => file.path === name && typeof file.version === 'string' && file.version.length > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || '')).length === 1);
}
export async function verifyProductionAgreements(db, legal) {
  const result = await db.from('bm_documents').select('kind,version,document_hash,content')
    .eq('approved', true).eq('current', true).in('kind', ['platform_terms', 'privacy']);
  if (result.error || !Array.isArray(result.data) || result.data.length !== 2) throw Error('Approved agreements unavailable');
  for (const [kind, path] of [['platform_terms', 'TERMS.md'], ['privacy', 'PRIVACY.md']]) {
    const expected = legal.files.find(file => file.path === path);
    const rows = result.data.filter(row => row.kind === kind);
    if (rows.length !== 1 || !expected?.version || rows[0].version !== expected.version ||
        rows[0].document_hash !== expected.sha256 || createHash('sha256').update(rows[0].content).digest('hex') !== expected.sha256)
      throw Error('Published agreement mismatch');
  }
}
export function legalReceipt(manifest, texts) {
  const files = manifest.files || [];
  for (const item of files) {
    const text = texts[item.path];
    if (typeof text !== 'string' || /\[(?:OWNER|COUNSEL|VERIFY)|\bTBD\b/.test(text)) throw Error('Final legal text required');
    const digest = createHash('sha256').update(text.replace(/\r\n?/g, '\n')).digest('hex');
    if (digest !== item.sha256) throw Error('Legal text hash mismatch');
  }
  const result = { ...manifest, digest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
  if (!approvedLegalReceipt(result)) throw Error('Owner/counsel publication approval required');
  return result;
}
export function netlifyProductionOrigin(env) {
  syntheticProject(env.BM_NETLIFY_SUPABASE_REF); // Known protected projects remain excluded.
  const origin = new URL(env.BM_APP_ORIGIN || '');
  if (env.BM_HOSTING_PROFILE !== 'netlify-production-v1' || env.BM_ENVIRONMENT !== 'production' ||
      env.VERCEL || env.VERCEL_ENV || env.BM_LOCAL_SYNTHETIC || env.BM_STAGING_PROJECT_REF ||
      env.SUPABASE_URL !== `https://${env.BM_NETLIFY_SUPABASE_REF}.supabase.co` ||
      env.VITE_SUPABASE_URL !== env.SUPABASE_URL || origin.protocol !== 'https:' ||
      origin.origin !== env.BM_APP_ORIGIN || origin.origin !== env.PUBLIC_APP_URL ||
      !/^[a-z0-9-]{2,63}$/.test(env.BM_NETLIFY_SITE_NAME || '') ||
      origin.hostname !== `${env.BM_NETLIFY_SITE_NAME}.netlify.app`) throw Error('Netlify production binding unavailable');
  for (const [name, expected] of Object.entries({ DBP_REGISTRATION_PAUSED: 'true', BM_CHECKOUT_ENABLED: 'false',
    BM_LIVE_BILLING_ENABLED: 'false', BM_DELIVERY_MODE: 'disabled', BM_LIVE_DELIVERY_ENABLED: 'false', BM_RESPONSE_ENABLED: 'false' }))
    if (env[name] !== expected) throw Error('Disabled operations required');
  if (Object.entries(env).some(([name, value]) => value && /STRIPE|RESEND|RENTCAST|GEOAPIFY|OPENAI|^BM_S2_|^BM_PRODUCTION_|^BM_ISOLATED_|^BM_WORKER_SECRET$/.test(name))) throw Error('Unrelated provider binding denied');
  return origin.origin;
}
export function productionProfile(env, context, legal, source) {
  const origin = netlifyProductionOrigin(env);
  if (!approvedLegalReceipt(legal) || env.BM_NETLIFY_LEGAL_DIGEST !== legal.digest ||
      !/^[a-f0-9]{40}$/.test(source || '') || env.BM_NETLIFY_RELEASE_SOURCE !== source ||
      env.BM_NETLIFY_ACTIVATION_STATE !== 'owner-approved-cutover' ||
      env.BM_NETLIFY_TEAM_SLUG !== 'marcel-g-ovf4dew' ||
      !/^[a-z0-9-]{8,80}$/.test(env.BM_NETLIFY_ACCOUNT_ID || '') || !/^[a-f0-9-]{36}$/.test(env.BM_NETLIFY_SITE_ID || '') ||
      context?.account?.id !== env.BM_NETLIFY_ACCOUNT_ID || context?.site?.id !== env.BM_NETLIFY_SITE_ID ||
      context?.site?.name !== env.BM_NETLIFY_SITE_NAME || !/^[a-f0-9]{24}$/.test(context?.deploy?.id || '') ||
      context?.deploy?.context !== 'production' || context?.deploy?.published !== true ||
      !env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_ANON_KEY ||
      !/^[a-f0-9]{64}$/.test(env.BUYERMATCH_IDENTITY_KEY || '') || (env.BM_RESPONSE_SECRET || '').length < 32)
    throw Error('Production cutover unavailable');
  return { origin, supabase: env.SUPABASE_URL, project: env.BM_NETLIFY_SUPABASE_REF };
}
