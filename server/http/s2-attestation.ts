import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getBearerToken,
  getSupabaseAdminClient,
  isOwnerAdminEmail,
} from '../../api/_accountAuth.js';
import {
  ATTESTATION_PATH,
  attestS2Runtime,
  s2AttestationScope,
} from '../buyermatch/s2-attestation.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // No Auth/database operation can occur against a non-S2 backend.
  if (!s2AttestationScope(process.env))
    return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const db = getSupabaseAdminClient();
    const auth = await db.auth.getUser(token);
    const user = auth.data?.user;
    if (auth.error || !user || !user.email_confirmed_at)
      return res.status(401).json({ error: 'Invalid session' });
    if (!isOwnerAdminEmail(user.email || ''))
      return res.status(403).json({ error: 'Owner access required' });
    // Do not use getAuthenticatedAccount: its repair paths can write profiles/workspaces.
    const profile = await db
      .from('account_profiles')
      .select('account_status,role')
      .eq('user_id', user.id)
      .maybeSingle();
    const workspace = await db
      .from('workspaces')
      .select('account_status')
      .eq('owner_user_id', user.id)
      .maybeSingle();
    if (profile.error || workspace.error)
      return res
        .status(503)
        .json({ error: 'S2 configuration attestation unavailable' });
    if (
      profile.data?.account_status !== 'Active' ||
      profile.data?.role !== 'Admin' ||
      workspace.data?.account_status !== 'Active'
    )
      return res.status(403).json({ error: 'Owner access required' });
    // Fixed classifications only, after confirmed platform-owner authorization.
    // Never reflect/log URL, query, framing values, credentials or provider errors.
    const reasons: string[] = [];
    if (new URL(req.url, 'https://internal.invalid').search)
      reasons.push('QUERY_NOT_SUPPORTED');
    if (
      req.headers?.['content-length'] &&
      req.headers['content-length'] !== '0'
    )
      reasons.push('CONTENT_LENGTH_NOT_SUPPORTED');
    if (req.headers?.['transfer-encoding'])
      reasons.push('TRANSFER_ENCODING_NOT_SUPPORTED');
    if (reasons.length)
      return res.status(400).json({ error: 'Unsupported request', reasons });
    const build = JSON.parse(
      readFileSync(resolve(process.cwd(), ATTESTATION_PATH), 'utf8'),
    );
    return res.status(200).json(attestS2Runtime(process.env, build));
  } catch {
    return res
      .status(503)
      .json({ error: 'S2 configuration attestation unavailable' });
  }
}
