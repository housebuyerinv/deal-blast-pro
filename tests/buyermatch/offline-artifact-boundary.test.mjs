import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBuildEnvironment, buildOfflineArtifact } from '../../scripts/testing/buyermatch-offline-artifact.mjs';

test('offline build child cannot inherit provider keys or Vite environment bindings', () => {
  const env = cleanBuildEnvironment({ PATH: 'fixture', SystemRoot: 'fixture', HOME: 'private',
    SUPABASE_SERVICE_ROLE_KEY: 'secret', VITE_SUPABASE_URL: 'https://original.invalid',
    BM_STRIPE_LIVE_SECRET_KEY: 'secret', NODE_OPTIONS: '--require private-module',
    VERCEL_TOKEN: 'secret', NODE_ENV: 'development' });
  assert.deepEqual(env, { PATH: 'fixture', SystemRoot: 'fixture', NODE_ENV: 'production' });
});
test('offline builder rejects output outside its ignored cache before reading source', async () => {
  await assert.rejects(buildOfflineArtifact('not-an-ignored-output-directory'), /New ignored artifact directory/);
});
