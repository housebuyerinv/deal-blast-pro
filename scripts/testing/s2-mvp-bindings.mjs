// Sensitive Vercel variables are intentionally unavailable to env run. Never request decryption.
import { createHash } from 'node:crypto';
import process from 'node:process';
const e = process.env,
  url = 'https://qxhhlprentrufobpcgna.supabase.co';
const result = {
  stagingUrls: e.SUPABASE_URL === url && e.VITE_SUPABASE_URL === url,
  stagingPublicKeyMatchesProvider:
    createHash('sha256')
      .update(e.VITE_SUPABASE_ANON_KEY ?? '')
      .digest('hex') ===
    'b430dc00c22283bb081fe8661fef5008051e4695b7f44518ff77b22db9ce0175',
  sensitiveValuesNotExported: [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'BM_STRIPE_TEST_SECRET_KEY',
  ].every((k) => !e[k]),
  noLiveStripeCredential: !Object.values(e).some((v) =>
    /^(?:sk|rk)_live_/.test(v ?? ''),
  ),
  noStandardStripeCredential: !Object.values(e).some((v) =>
    /^sk_(?:test|live)_/.test(v ?? ''),
  ),
  noClerkCredential: !e.CLERK_SECRET_KEY,
  noResendCredential: !e.RESEND_API_KEY,
};
process.stdout.write(JSON.stringify(result) + '\n');
