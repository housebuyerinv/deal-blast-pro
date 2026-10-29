import { makeS2AttestationHandler } from './s2-attestation.js';
import { readS2StripePermissions } from '../buyermatch/s2-stripe-readiness.js';

// Reuses the exact confirmed-owner, read-only profile/workspace, request framing,
// S2 project, build checksum, source identity and all17 paused-setting guards.
export default makeS2AttestationHandler(async (env, attestation) => ({
  attestation,
  permissions: await readS2StripePermissions(env),
}));
