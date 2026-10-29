// @ts-check
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
export const BASE = '68c5cf9f4d8fcd590e45dd536eab1eb29edecccc';
export const OPERATOR_BASE = 'ce3bc2f25402e918289ee857441f2175fdf64a1c';
export const ID = 'buyermatch-isolated-billing-v1';
export const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const stop = reason => { throw Object.assign(Error(`ISOLATED_BILLING_STOP:${reason}`), { status: 503 }); };
export const demand = (condition, reason) => { if (!condition) stop(reason); };
const schema = z.object({
  schema: z.literal(ID), baseSource: z.literal(BASE),
  source: z.string().regex(/^[a-f0-9]{40}$/), mode: z.enum(['LOCAL_SYNTHETIC','HOSTED']),
  runId: z.string().uuid(), owner: z.string().uuid(), team: z.string().regex(/^team_[A-Za-z0-9]+$/),
  project: z.string().regex(/^prj_[A-Za-z0-9]+$/), database: z.string().regex(/^[a-z]{20}$/),
  account: z.string().regex(/^acct_[A-Za-z0-9]+$/), endpoint: z.string().regex(/^we_[A-Za-z0-9]+$/),
  pro: z.string().regex(/^price_[A-Za-z0-9]+$/), origin: z.string().url(),
  startedAt: z.number().int(), expiresAt: z.number().int(),
  provisioningStartedAt: z.number().int(), hosting: z.enum(['vercel','node']),
  baseline: z.object({ projects: z.array(z.string()).min(1), databases: z.array(z.string()).min(2),
    accounts: z.array(z.string()).min(1), owners: z.array(z.string()).min(1) }).strict(),
}).strict();
export function validateProfile(input) {
  const p = schema.parse(input), url = new URL(p.origin);
  demand(url.protocol === 'https:' && url.origin === p.origin && !url.username && !url.password &&
    /^[a-z0-9.-]+$/.test(url.hostname) &&
    !/localhost|127\.0\.0\.1|dbp-registration-s2|deal-blast-pro|moneymap/i.test(url.hostname), 'ORIGIN');
  demand(p.hosting !== 'vercel' || url.hostname.endsWith('.vercel.app'), 'VERCEL_ORIGIN');
  demand(p.source !== BASE && p.source !== OPERATOR_BASE &&
    p.startedAt > p.provisioningStartedAt && p.expiresAt > p.startedAt &&
    p.expiresAt - p.startedAt <= 1800000, 'SOURCE_OR_WINDOW');
  const fixed = ['qxhhlprentrufobpcgna','aigvnbxiydbzzqbetlhl',
    'acct_1UTRcRL6efr9LhPI','prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',
    '368f5f93-acf7-4cc3-9805-a4c0817506c3','we_1UTTc1L6efr9LhPICbZjgCHA',
    'price_1UTRdrL6efr9LhPIpYKIYIyd'];
  for (const value of [p.project,p.database,p.account,p.owner,p.endpoint,p.pro])
    demand(!fixed.includes(value), 'ORIGINAL_BINDING');
  demand(!p.baseline.projects.includes(p.project) && !p.baseline.databases.includes(p.database) &&
    !p.baseline.accounts.includes(p.account) && !p.baseline.owners.includes(p.owner), 'PREEXISTING_RESOURCE');
  return Object.freeze(p);
}
export function runtime(p, env, { issuance = false, owner = p.owner, now = Date.now(), receiver = false } = {}) {
  p = validateProfile(p);
  const required = { BM_ISOLATED_PROFILE: ID, BM_ISOLATED_PROFILE_DIGEST: digest(p),
    BM_ISOLATED_SOURCE: p.source, BM_ENVIRONMENT: 'staging',
    BM_STAGING_PROJECT_REF: p.database, SUPABASE_URL: `https://${p.database}.supabase.co`,
    VITE_SUPABASE_URL: `https://${p.database}.supabase.co`, BM_APP_ORIGIN: p.origin,
    PUBLIC_APP_URL: p.origin, DBP_REGISTRATION_PAUSED: 'true',
    BM_LIVE_BILLING_ENABLED: 'false', BM_LIVE_DELIVERY_ENABLED: 'false',
    BM_DELIVERY_MODE: 'mock', BM_RESPONSE_ENABLED: 'false',
    BM_S2_BILLING_RUN_ID: p.runId, BM_S2_BILLING_OWNER_ID: p.owner,
    BM_S2_BILLING_STARTED_AT: new Date(p.startedAt).toISOString(),
    BM_S2_BILLING_EXPIRES_AT: new Date(p.expiresAt).toISOString(), BM_S2_BILLING_OPERATIONS: 'checkout',
  };
  demand(Object.entries(required).every(([k,v]) => env[k] === v), 'RUNTIME_BINDINGS');
  demand(receiver ? env.BM_ISOLATED_RECEIVER_PROJECT===p.database : p.hosting === 'vercel'
    ? env.VERCEL_PROJECT_ID === p.project && env.VERCEL_ENV === 'preview'
    : env.BM_ISOLATED_HOSTING_ID === p.project && !env.VERCEL && !env.VERCEL_ENV, 'HOSTING_SCOPE');
  demand(!['STRIPE_SECRET_KEY','BM_STRIPE_LIVE_SECRET_KEY','BUYERMATCH_IDENTITY_KEY',
    'RESEND_API_KEY','RENTCAST_API_KEY','BM_RESPONSE_SECRET','BM_WORKER_SECRET'].some(k => env[k]), 'UNRELATED_CREDENTIAL');
  demand(owner === p.owner, 'OWNER');
  if (issuance) demand(env.BM_CHECKOUT_ENABLED === 'true' && now >= p.startedAt &&
    now < p.expiresAt - 60000, 'ISSUANCE_WINDOW');
  return required;
}
export function fixtureEnvironment(p) {
  const env = { BM_ISOLATED_PROFILE: ID, BM_ISOLATED_PROFILE_DIGEST: digest(p),
    BM_ISOLATED_SOURCE: p.source, BM_ENVIRONMENT:'staging', BM_STAGING_PROJECT_REF:p.database,
    SUPABASE_URL:`https://${p.database}.supabase.co`,VITE_SUPABASE_URL:`https://${p.database}.supabase.co`,
    BM_APP_ORIGIN:p.origin,PUBLIC_APP_URL:p.origin,DBP_REGISTRATION_PAUSED:'true',
    BM_ISOLATED_RECEIVER_PROJECT:p.database,
    BM_LIVE_BILLING_ENABLED:'false',BM_LIVE_DELIVERY_ENABLED:'false',BM_DELIVERY_MODE:'mock',BM_RESPONSE_ENABLED:'false',
    BM_S2_BILLING_RUN_ID:p.runId,BM_S2_BILLING_OWNER_ID:p.owner,
    BM_S2_BILLING_STARTED_AT:new Date(p.startedAt).toISOString(),BM_S2_BILLING_EXPIRES_AT:new Date(p.expiresAt).toISOString(),
    BM_S2_BILLING_OPERATIONS:'checkout',BM_CHECKOUT_ENABLED:'false' };
  if(p.hosting==='vercel')Object.assign(env,{VERCEL_PROJECT_ID:p.project,VERCEL_ENV:'preview'});
  else env.BM_ISOLATED_HOSTING_ID=p.project;
  return env;
}
export function ownership(p, session, subscription, customer, checkoutId) {
  validateProfile(p);
  demand(/^cs_test_[A-Za-z0-9]+$/.test(session?.id || '') &&
    /^sub_[A-Za-z0-9]+$/.test(subscription?.id || '') && /^cus_[A-Za-z0-9]+$/.test(customer?.id || ''), 'OBJECT_IDS');
  demand(session.livemode === false && subscription.livemode === false && customer.livemode === false &&
    !customer.deleted && session.mode === 'subscription' && session.status === 'complete' &&
    session.payment_status === 'paid' && session.amount_total === 11900 && session.currency === 'usd' &&
    session.client_reference_id === p.owner && session.customer === customer.id &&
    session.subscription === subscription.id && subscription.customer === customer.id, 'OBJECT_GRAPH');
  for(const object of [session,subscription]) demand(object.metadata?.dealBlastUserId === p.owner &&
    object.metadata?.dbpProduct === 'buyermatch' && object.metadata?.dbpCheckoutId === checkoutId &&
    object.metadata?.dbpS2RunId === p.runId, 'OBJECT_PROVENANCE');
  for(const object of [session,subscription,customer])demand(Number.isSafeInteger(object.created) &&
    object.created*1000 >= p.startedAt && object.created*1000 <= p.expiresAt, 'OBJECT_TIME');
  demand(subscription.items?.has_more === false && subscription.items.data?.length === 1 &&
    subscription.items.data[0].quantity === 1 && subscription.items.data[0].price?.id === p.pro, 'PRO_PRICE');
}
