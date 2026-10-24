import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  REQUIRED_S2_ENV,
  S2_RELEASE,
} from '../../scripts/buyermatch-s2-release.mjs';

export const ATTESTATION_PATH = 'server/generated/s2-build-attestation.json';
const ttlMs = 60 * 60 * 1000;
const settingsSchema = z
  .object(
    Object.fromEntries(
      Object.entries(REQUIRED_S2_ENV).map(([k, v]) => [k, z.literal(v)]),
    ),
  )
  .strict();
const identitySchema = z
  .object({
    projectId: z.literal(S2_RELEASE.project),
    deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/),
    target: z.literal('preview'),
    hostname: z
      .string()
      .regex(/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    runId: z.string().uuid(),
  })
  .strict();
const artifactSchema = z
  .object({
    schema: z.literal(1),
    enabled: z.literal(true),
    observedAt: z.string().datetime(),
    identity: identitySchema,
    settings: settingsSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const error = () => {
  throw Error('S2 configuration attestation unavailable');
};
export function s2AttestationScope(env) {
  return (
    env.BM_S2_ATTESTATION_ENABLED === 'true' &&
    env.VERCEL_ENV === 'preview' &&
    (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === 'preview') &&
    env.VERCEL_PROJECT_ID === S2_RELEASE.project &&
    env.BM_ENVIRONMENT === 'staging' &&
    env.BM_STAGING_PROJECT_REF === S2_RELEASE.staging &&
    env.SUPABASE_URL === `https://${S2_RELEASE.staging}.supabase.co` &&
    env.VITE_SUPABASE_URL === env.SUPABASE_URL
  );
}
function identity(env) {
  const result = identitySchema.safeParse({
    projectId: env.VERCEL_PROJECT_ID,
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    target: env.VERCEL_ENV,
    hostname: env.VERCEL_URL,
    sourceSha: env.BM_S2_ATTESTATION_SOURCE_SHA,
    runId: env.BM_S2_ATTESTATION_RUN_ID,
  });
  if (!result.success) error();
  return result.data;
}
function settings(env) {
  // Projection is intentional: provider environments also contain credentials.
  // Only exact approved public literals can enter artifacts/responses, never raw values.
  const result = settingsSchema.safeParse(
    Object.fromEntries(Object.keys(REQUIRED_S2_ENV).map((k) => [k, env[k]])),
  );
  if (!result.success) error();
  return result.data;
}
function digest(body) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
export function captureS2Build(env, now = new Date()) {
  if (!s2AttestationScope(env)) error();
  const body = {
    schema: 1,
    enabled: true,
    observedAt: now.toISOString(),
    identity: identity(env),
    settings: settings(env),
  };
  return { ...body, sha256: digest(body) };
}
export function attestS2Runtime(env, input, now = new Date()) {
  if (!s2AttestationScope(env)) error();
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) error();
  const { sha256, ...build } = parsed.data;
  const age = now.getTime() - Date.parse(build.observedAt);
  if (
    !Number.isFinite(age) ||
    age < -60000 ||
    age > ttlMs ||
    digest(build) !== sha256
  )
    error();
  const runtimeIdentity = identity(env),
    runtime = settings(env);
  if (
    JSON.stringify(build.identity) !== JSON.stringify(runtimeIdentity) ||
    JSON.stringify(build.settings) !== JSON.stringify(runtime)
  )
    error();
  // Provider Git SHA is not always available for unlinked CLI deployments.
  // A release-supplied SHA must still be compared with the independent provider record.
  if (
    env.VERCEL_GIT_COMMIT_SHA &&
    env.VERCEL_GIT_COMMIT_SHA !== runtimeIdentity.sourceSha
  )
    error();
  return {
    schema: 1,
    qaOnly: true,
    identity: runtimeIdentity,
    build: {
      observation: 'build-process-environment',
      observedAt: build.observedAt,
      sha256,
      settings: build.settings,
    },
    runtime: {
      observation: 'effective-function-process-environment',
      settings: runtime,
    },
    sourceProvenance: env.VERCEL_GIT_COMMIT_SHA
      ? 'provider-git-variable-and-release-pin-match'
      : 'release-supplied-pin-external-provider-record-required',
    notObserved: [
      'Vercel Authentication policy',
      'Stripe credential authority and webhook state',
      'Supabase receiver gate and database protections',
      'external delivery services',
    ],
  };
}
