// Read-only provider-injected runtime inspection. Never prints raw environment,
// provider bodies, credentials, URLs containing tokens, or exception messages.
import { REQUIRED_S2_ENV } from '../buyermatch-s2-release.mjs';
import { readPausedReceiver } from './s2-receiver-pause-readback.mjs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
export async function inspectPrivateRuntime(e, { fetcher = globalThis.fetch, readReceiver = readPausedReceiver } = {}) {
const result = {
  operation: 'S2_PRIVATE_RUNTIME_READBACK',
  settings: Object.fromEntries(Object.entries(REQUIRED_S2_ENV).map(([k,v]) =>
    [k, e[k] === undefined ? 'UNSET' : e[k] === v ? 'MATCH' : 'MISMATCH'])),
  // Absence from this child does not mean absence from the deployed Secret store.
  credential: { availability: e.BM_STRIPE_TEST_SECRET_KEY ? 'AVAILABLE_TO_CHILD' : 'NOT_AVAILABLE_TO_CHILD', restrictedTestFormat: /^rk_test_/.test(e.BM_STRIPE_TEST_SECRET_KEY || '') },
  stripe: 'NOT_RUN', receiverPaused: 'UNKNOWN',
};
const isolated = e.SUPABASE_URL === REQUIRED_S2_ENV.SUPABASE_URL &&
  e.VITE_SUPABASE_URL === REQUIRED_S2_ENV.VITE_SUPABASE_URL &&
  e.BM_ENVIRONMENT === 'staging' && e.BM_STAGING_PROJECT_REF === REQUIRED_S2_ENV.BM_STAGING_PROJECT_REF;
if (isolated && result.credential.restrictedTestFormat) {
  try {
    const response = await fetcher('https://api.stripe.com/v1/prices/price_1UTRdfL6efr9LhPIchNeE7u1', {
      method: 'GET',
      headers: { Authorization: `Bearer ${e.BM_STRIPE_TEST_SECRET_KEY}` },
      redirect: 'error', signal: globalThis.AbortSignal.timeout(10000),
    });
    const body = await response.json();
    result.stripe = { httpStatus: response.status, exactTestStarter: response.ok &&
      body.id === 'price_1UTRdfL6efr9LhPIchNeE7u1' && body.livemode === false &&
      body.unit_amount === 5900 && body.currency === 'usd' && body.recurring?.interval === 'month' };
  } catch { result.stripe = 'READ_FAILED_UNKNOWN'; }
}
if (isolated) {
  try { result.receiverPaused = await readReceiver(); } catch { /* UNKNOWN */ }
}
return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await inspectPrivateRuntime(process.env)) + '\n'); }
  catch { process.stdout.write(JSON.stringify({ operation: 'S2_PRIVATE_RUNTIME_READBACK', status: 'UNKNOWN' }) + '\n'); process.exitCode = 2; }
}
