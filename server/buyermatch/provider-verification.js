import process from 'node:process';
import { responseEnvironment } from './response-config.js';

// Read-only preflight: deliberately independent of delivery activation flags.
// A Sending-access key may deny domain reads; that denial is NOT verification.
export async function verifyProductionResend(env = process.env, readFetch = globalThis.fetch) {
  const result = { provider: 'resend', environment: 'production', authenticated: false, senderVerified: false };
  try {
    if (env.VERCEL_ENV !== 'production' || responseEnvironment(env) !== 'production')
      return { ...result, reason: 'production_required' };
    if (!env.RESEND_API_KEY) return { ...result, reason: 'credential_missing' };
    if (!/^(?:[^<>\r\n]+<)?[^<>\s@]+@housebuyerinvestments\.com>?$/.test(env.BM_RESEND_FROM || ''))
      return { ...result, reason: 'sender_configuration' };
    const response = await readFetch('https://api.resend.com/domains', {
      method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: globalThis.AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ...result, reason: response.status === 403 ? 'metadata_access_denied' : response.status === 401 ? 'credential_rejected' : 'provider_unavailable' };
    const body = await response.json();
    const verified = Array.isArray(body.data) && body.data.some(domain => domain.name === 'housebuyerinvestments.com' && domain.status === 'verified');
    return { ...result, authenticated: true, senderVerified: verified, reason: verified ? 'verified' : 'verified_sender_not_found' };
  } catch {
    // Provider errors may contain request headers. Never forward or log them.
    return { ...result, reason: 'verification_failed' };
  }
}

