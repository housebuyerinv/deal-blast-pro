import { createHash } from 'node:crypto';
import { z } from 'zod';

// Public, reviewed identifiers only. Secrets stay in their provider stores.
export const S2_RELEASE = Object.freeze({
  fallback: 'dpl_nr5RVunmUGdryPUtWkRkVdsA96pT',
  project: 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',
  team: 'team_2ejXKYjjGXIFsIQTUMEqZ8Cf',
  scope: 'housebuyerinv',
  staging: 'qxhhlprentrufobpcgna',
  account: 'acct_1UTRcRL6efr9LhPI',
  endpoint: 'we_1UTTc1L6efr9LhPICbZjgCHA',
  source: '6a98cff667a452563a336b8ba175762029038ef5',
  origin: 'https://dbp-registration-s2-preview-housebuyerinv.vercel.app',
  portal: 'bpc_1UTRxYL6efr9LhPIA0rP1HOJ',
  starter: 'price_1UTRdfL6efr9LhPIchNeE7u1',
  pro: 'price_1UTRdrL6efr9LhPIpYKIYIyd',
});
export const QA_DOCUMENTS = Object.freeze([
  Object.freeze({
    id: 'b6e12fb1-3087-439a-a493-2cae3f73529c',
    kind: 'platform_terms',
    version: 'staging-fixture-v2',
    document_hash:
      'fdc470ec2a67efb482186cd273a4ede0a3c7955707a0850519e079bcdea322d1',
  }),
  Object.freeze({
    id: '1142c60e-65e0-442c-aeb9-134090a5c918',
    kind: 'privacy',
    version: 'staging-fixture-v2',
    document_hash:
      '63847efbbfba1c6bb468fd2598b8775bef2daa576cfed7290f32fc178ecce8c5',
  }),
]);
export const REQUIRED_S2_ENV = Object.freeze({
  DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS: 'true',
  DBP_REGISTRATION_PAUSED: 'true',
  BM_CHECKOUT_ENABLED: 'false',
  BM_ENVIRONMENT: 'staging',
  BM_STAGING_PROJECT_REF: S2_RELEASE.staging,
  SUPABASE_URL: `https://${S2_RELEASE.staging}.supabase.co`,
  VITE_SUPABASE_URL: `https://${S2_RELEASE.staging}.supabase.co`,
  PUBLIC_APP_URL: S2_RELEASE.origin,
  BM_APP_ORIGIN: S2_RELEASE.origin,
  BM_STRIPE_PORTAL_CONFIGURATION_ID: S2_RELEASE.portal,
  BM_LIVE_BILLING_ENABLED: 'false',
  BM_BILLING_VERIFIED: 'false',
  BM_LIVE_BILLING_VERIFIED: 'false',
  BM_LIVE_DELIVERY_ENABLED: 'false',
  BM_DELIVERY_MODE: 'mock',
  BM_RESPONSE_ENABLED: 'false',
  BM_S2_CATALOG_DIAGNOSTIC: 'false',
});
const envSchema = z
  .object(
    Object.fromEntries(
      Object.entries(REQUIRED_S2_ENV).map(([k, v]) => [k, z.literal(v)]),
    ),
  )
  .strict();
const manifestSchema = z
  .object({
    schema: z.literal(1),
    source: z.literal(S2_RELEASE.source),
    project: z.literal(S2_RELEASE.project),
    team: z.literal(S2_RELEASE.team),
    target: z.literal('preview'),
    runtime: envSchema,
    build: envSchema,
  })
  .strict();
export function pausedS2Manifest() {
  return {
    schema: 1,
    source: S2_RELEASE.source,
    project: S2_RELEASE.project,
    team: S2_RELEASE.team,
    target: 'preview',
    runtime: { ...REQUIRED_S2_ENV },
    build: { ...REQUIRED_S2_ENV },
  };
}
export function validateS2Manifest(input) {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success)
    throw Error(
      'Invalid S2 manifest; missing, unknown, conflicting or unsafe configuration',
    );
  return parsed.data;
}
// Returns argv, never a shell command and never invokes deployment. Initial Checkout must be false.
export function s2DeploymentArgs(input, sourceDirectory, runId) {
  const m = validateS2Manifest(input);
  if (
    typeof sourceDirectory !== 'string' ||
    !sourceDirectory ||
    sourceDirectory.startsWith('-') ||
    /[\r\n\0]/.test(sourceDirectory) ||
    !z.string().uuid().safeParse(runId).success
  )
    throw Error('Invalid source directory/run identity');
  return [
    'deploy',
    sourceDirectory,
    '--target',
    'preview',
    '--project',
    m.project,
    '--scope',
    S2_RELEASE.scope,
    '--yes',
    '--no-wait',
    '--meta',
    `githubCommitSha=${m.source}`,
    '--meta',
    `s2RunId=${runId}`,
    ...Object.keys(REQUIRED_S2_ENV)
      .sort()
      .flatMap((k) => [
        '--env',
        `${k}=${m.runtime[k]}`,
        '--build-env',
        `${k}=${m.build[k]}`,
      ]),
  ];
}
export function verifyQAAgreements(payload) {
  if (
    payload?.required !== true ||
    !Array.isArray(payload.documents) ||
    payload.documents.length !== 2
  )
    throw Error('Versioned QA agreement guard unavailable');
  for (const expected of QA_DOCUMENTS) {
    const found = payload.documents.filter((d) => d.id === expected.id);
    if (
      found.length !== 1 ||
      Object.entries(expected).some(([k, v]) => found[0][k] !== v) ||
      typeof found[0].content !== 'string' ||
      createHash('sha256').update(found[0].content).digest('hex') !==
        expected.document_hash
    )
      throw Error('Exact QA agreement identity/version/content mismatch');
  }
  return true;
}
// Adapter evidence must come from the actual deployment, not env-run/project defaults.
export function verifyS2Deployment(input, evidence) {
  const m = validateS2Manifest(input),
    d = evidence?.deployment,
    p = evidence?.project;
  if (
    d?.projectId !== m.project ||
    d.ownerId !== m.team ||
    d.readyState !== 'READY' ||
    d.meta?.githubCommitSha !== m.source ||
    d.target !== null ||
    evidence.cliTarget !== 'preview' ||
    p?.id !== m.project ||
    p.accountId !== m.team ||
    p.gitLinked !== false ||
    p.protection !== 'all' ||
    p.bypassCount !== 0
  )
    throw Error('S2 deployment identity/protection mismatch');
  if (
    !z.string().uuid().safeParse(d.meta?.s2RunId).success ||
    !Array.isArray(d.alias) ||
    d.alias.length !== 0
  )
    throw Error('S2 deployment run/routing mismatch');
  for (const scope of ['runtime', 'build']) {
    if (
      evidence.actualEnv?.deploymentId !== d.id ||
      !envSchema.safeParse(evidence.actualEnv?.[scope]).success
    )
      throw Error('Actual deployment environment unverified');
  }
  const s = evidence.services;
  if (
    s?.account !== S2_RELEASE.account ||
    s.livemode !== false ||
    s.endpoint !== S2_RELEASE.endpoint ||
    s.endpointDisabled !== true ||
    s.receiverPaused !== true ||
    s.credentialProvenanceVerified !== true ||
    s.unexpectedCredentialCount !== 0 ||
    s.portal !== S2_RELEASE.portal ||
    s.callbackOrigin !== S2_RELEASE.origin
  )
    throw Error('S2 service isolation unverified');
  for (const [id, amount] of [
    [S2_RELEASE.starter, 5900],
    [S2_RELEASE.pro, 11900],
  ]) {
    const price = s.prices?.filter((p) => p.id === id);
    if (
      price?.length !== 1 ||
      price[0].livemode !== false ||
      price[0].active !== true ||
      price[0].currency !== 'usd' ||
      price[0].unit_amount !== amount ||
      price[0].interval !== 'month' ||
      price[0].quantity !== 1
    )
      throw Error('S2 price mismatch');
  }
  verifyQAAgreements(evidence.agreements);
  if (
    evidence.protectedGet !== true ||
    evidence.registrationPaused !== true ||
    evidence.checkoutPaused !== true
  )
    throw Error('Actual runtime guards unverified');
  return { verified: true, deployment: d.id, source: m.source, qaOnly: true };
}
