// Offline release preparation only. Local committed Git bytes are the sole input.
// No provider, dotenv, credential, migration execution, deployment or publication.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';

export const APPLICATION_SOURCE = '68c5cf9f4d8fcd590e45dd536eab1eb29edecccc';
export const ISOLATED_DERIVATIVE = 'f88503f78c105ccc3d39d4d2b7ed8263f128e85b';
const repository = fileURLToPath(new URL('../../', import.meta.url));
export const LATER_MIGRATIONS = Object.freeze([
  'supabase/migrations/20261026175709_buyermatch_authenticated_buyer_self_service.sql',
  'supabase/migrations/20261028025423_buyermatch_deal_activity.sql',
  'supabase/migrations/20261028025900_buyermatch_explicit_criteria_version.sql',
  'supabase/migrations/20261028031838_buyermatch_service_function_permissions.sql',
]);
const applicationPaths = ['api', 'server', 'src', 'public', 'supabase/functions',
  'supabase/migrations', 'package.json', 'package-lock.json', 'index.html',
  'vite.config.mjs', 'vercel.json', 'tsconfig.json', 'tsconfig.app.json',
  'tsconfig.node.json', 'tailwind.config.js', 'postcss.config.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function createApplicationSourceEnvelope({ repo = repository, source = APPLICATION_SOURCE } = {}) {
  if (source !== APPLICATION_SOURCE || !path.isAbsolute(repo))
    throw Error('Exact approved application source and absolute repository required');
  const git = args => execFileSync('git', ['--no-pager', '--no-optional-locks', ...args], {
    cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 33554432,
  });
  const read = file => git(['show', `${source}:${file}`]);
  git(['cat-file', '-e', `${source}^{commit}`]);
  git(['merge-base', '--is-ancestor', source, ISOLATED_DERIVATIVE]);
  const changedApplication = git(['diff', '--name-only', source, ISOLATED_DERIVATIVE,
    '--', 'api', 'server', 'src', 'public', 'supabase/functions', 'supabase/migrations']).toString().trim();
  if (changedApplication) throw Error('Derivative changed application source; separate review required');
  const names = git(['ls-tree', '-r', '--name-only', source, '--', ...applicationPaths])
    .toString().trim().split('\n').filter(Boolean).sort();
  if (!names.includes('server/buyermatch/staging.js') || !names.includes('vercel.json') ||
      names.some(name => /(^|\/)(?:\.env(?:\.|$)|test-artifacts|\.git|\.vercel)(?:\/|$)/.test(name)))
    throw Error('Application source allowlist incomplete or contains private runtime files');
  const files = names.map(file => {
    const bytes = read(file);
    return { path: file, gitBlob: git(['rev-parse', `${source}:${file}`]).toString().trim(),
      sha256: sha256(bytes), bytes: bytes.length };
  });
  const route = JSON.parse(read('vercel.json'));
  const staging = read('server/buyermatch/staging.js').toString();
  if (!staging.includes('env.VERCEL_ENV === "production"') ||
      !staging.includes('ref === PRODUCTION_SUPABASE_REF') ||
      !staging.includes('"Explicit Vercel preview origin required"'))
    throw Error('Reviewed staging-only runtime boundary changed');
  const billing = read('server/buyermatch/billing-config.js').toString();
  const delivery = read('server/buyermatch/production-delivery.js').toString();
  const response = read('server/buyermatch/response-config.js').toString();
  if (!billing.includes("env.BM_ENVIRONMENT !== 'production'") ||
      !billing.includes("env.BM_LIVE_BILLING_ENABLED !== 'true'") ||
      !delivery.includes('env.BM_LIVE_DELIVERY_ENABLED !== "true"') ||
      !response.includes('env.BM_PRODUCTION_PROJECT_REF !== PRODUCTION_SUPABASE_REF'))
    throw Error('Reviewed independent Production activation gates changed');
  for (const name of LATER_MIGRATIONS) if (!files.some(file => file.path === name))
    throw Error('Current migration inventory incomplete');
  return {
    schema: 'buyermatch-application-source-envelope-v1',
    state: 'LOCAL_SOURCE_PREPARED_NOT_DEPLOYMENT_AUTHORIZED',
    source, tree: git(['rev-parse', `${source}^{tree}`]).toString().trim(),
    isolatedDerivative: ISOLATED_DERIVATIVE, derivativeApplicationDelta: [],
    sourceHashEncoding: 'SHA256 exact committed Git blob bytes, not Windows checkout bytes',
    executionAllowed: false, pushAllowed: false, spendingUsd: 0,
    compiledArtifact: false, hostedEvidence: false, credentialsIncluded: false,
    files, sourceInventoryDigest: sha256(JSON.stringify(files)),
    pendingS2Inventory: LATER_MIGRATIONS.map(name => ({ ...files.find(file => file.path === name),
      hostedApplicationStatus: 'NOT_VERIFIED_NOW', applyAuthorized: false })),
    productionMigrationDisposition: {
      ready: false, freshLedgerAndDependenciesRequired: true, blanketDbPushAllowed: false,
      unrelatedForwardManifestUsed: false,
      supersededDoNotReplay: '20261022141326_buyermatch_owned_subscription_plan_changes.sql',
      finalGuardCandidate: '20261023153356_buyermatch_completed_checkout_guards.sql',
      existingS2PrivateIntakeMustNotReplay: '20261024000845_buyermatch_private_buyer_intake.sql',
      historyRepairIsNotExecutionEvidence: true,
    },
    publication: {
      integrationBranchGuard: route.git?.deploymentEnabled?.['codex/buyermatch-1b-integration'] === false,
      anyOtherBranchSafeToPublish: false, separateAuthorizationRequired: true,
    },
    runtime: {
      stagingHelperRejectsProductionEnvironment: true,
      stagingHelperRejectsProductionDatabase: true,
      stagingHelperRequiresExplicitPreviewOrigin: true,
      independentProductionBillingDeliveryResponseGatesImplemented: true,
      productionRuntimeState: 'IMPLEMENTED_GUARDED_NOT_HOSTED_VERIFIED_UNBOUND',
      productionRuntimeVerified: false,
      productionGateEvidence: 'STATIC_COMMITTED_SOURCE_INSPECTION_NOT_RUNTIME_ACCEPTANCE',
      productionBindings: 'UNBOUND_REQUIRES_EXACT_OWNER_APPROVED_RELEASE_SCOPE',
      authRedirects: 'VERIFY_AGAINST_ACTUAL_APPROVED_ORIGIN_BEFORE_HOSTED_EXECUTION',
      mandatoryPausedOverrides: {
        DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS: 'true', DBP_REGISTRATION_PAUSED: 'true',
        BM_CHECKOUT_ENABLED: 'false', BM_LIVE_BILLING_ENABLED: 'false',
        BM_BILLING_VERIFIED: 'false', BM_LIVE_BILLING_VERIFIED: 'false',
        BM_LIVE_DELIVERY_ENABLED: 'false', BM_DELIVERY_MODE: 'disabled', BM_RESPONSE_ENABLED: 'false',
      },
    },
    retainedEvidence: [
      'docs/release-evidence/2026-10-28/LOCAL_FULL_STACK_ACCEPTANCE.md',
      'docs/release-evidence/2026-10-28/LOCAL_FULL_STACK_RESULTS.json',
      'docs/BUYERMATCH_FINAL_INDEPENDENT_ACCEPTANCE.md',
      'docs/BUYERMATCH_ISOLATED_IMPLEMENTATION_CHECKPOINT.md',
    ],
    rollback: {
      executableNow: false, application: 'ONLY_SEPARATELY_APPROVED_CONTAINMENT_ROUTE',
      schema: 'RETAIN_ADDITIVE_GUARDS_EVIDENCE_AND_PAUSES_NO_WEAKER_SQL',
      deleteBuyerData: false, replaceKeys: false,
    },
    blockers: [
      'HOSTED_BILLING_ACCEPTANCE_BLOCKED_NO_CURRENT_AUTHORIZED_CAMPAIGN',
      'ORIGINAL_KEY_CUSTODY_AND_INDEPENDENT_ENCRYPTED_RECOVERY_UNVERIFIED',
      'LEGAL_APPROVAL_PENDING',
      'PRODUCTION_BINDINGS_SCHEMA_AND_EFFECTIVE_PAUSES_REQUIRE_SEPARATE_REVIEW_AND_AUTHORITY',
      'HOSTED_MIGRATION_DEPLOYMENT_CUTOVER_AND_PUBLIC_ACTIVATION_NOT_AUTHORIZED',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('No target, provider or execution arguments accepted');
  const envelope = createApplicationSourceEnvelope();
  const directory = path.join(repository, 'docs/release-evidence/2026-10-29');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'APPLICATION_SOURCE_ENVELOPE.json'),
    JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
  console.log('Offline application source envelope prepared; no provider execution authorized.');
}
