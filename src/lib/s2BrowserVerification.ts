export const S2_PRO_USER_ID = '368f5f93-acf7-4cc3-9805-a4c0817506c3';
const S2_PRO_EMAIL = 'dbp-s2-pro-1792721835370@example.com';
export const S2_AUTH_URL = 'https://qxhhlprentrufobpcgna.supabase.co';

export function isS2VerificationOrigin(origin: string, backend: string) {
  return backend === S2_AUTH_URL &&
    /^https:\/\/dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(origin);
}

type AuthResult = { error?: unknown; data?: { user?: {
  id?: string; email?: string; role?: string; is_anonymous?: boolean;
  email_confirmed_at?: string | null;
} | null } };

// Runs only inside the app. No session export, custom JWT, auth mutation or logging.
export async function verifyS2ProSession(input: {
  origin: string; backend: string; confirmed: boolean; currentUser: () => string | undefined;
  getUser: () => Promise<AuthResult>; stillCurrent: () => boolean; timeoutMs?: number;
}): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = input.timeoutMs ?? 10000;
  try {
    if (!input.confirmed || !isS2VerificationOrigin(input.origin, input.backend) ||
      input.currentUser() !== S2_PRO_USER_ID || !input.stillCurrent() ||
      !Number.isInteger(timeout) || timeout < 1 || timeout > 10000) return false;
    const result = await Promise.race([
      input.getUser(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), timeout); }),
    ]);
    const user = result.data?.user;
    return !result.error && input.stillCurrent() && input.currentUser() === S2_PRO_USER_ID &&
      user?.id === S2_PRO_USER_ID && user.email === S2_PRO_EMAIL &&
      user.role === 'authenticated' && user.is_anonymous !== true &&
      Number.isFinite(Date.parse(user.email_confirmed_at || ''));
  } catch { return false; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
