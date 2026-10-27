// Preparation-only module. No CLI, credentials, storage access, login, or network
// client construction. A future reviewed browser adapter must supply the SAME
// application's existing Supabase client; do not inject/recover tokens to call it.
const REF = 'https://qxhhlprentrufobpcgna.supabase.co';
export const PRO_FIXTURE = Object.freeze({
  id: '368f5f93-acf7-4cc3-9805-a4c0817506c3',
  email: 'dbp-s2-pro-1792721835370@example.com',
});
export const EXISTING_LOGIN = 'https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app/admin-login';
const ORIGIN = 'https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app';

// Actual local IAB test: evaluate() is a read-only DOM scope, not application JS.
// Never emit the formerly proposed global-client expression or try another path
// around that restriction. Keep this entry point explicitly fail-closed.
export function prepareBrowserVerification() {
  throw new Error('UNSUPPORTED_BROWSER_APP_SCOPE; reviewed application-native verification UI required');
}

export async function verifyExistingBrowserHandoff({
  existingAppClient, browserOrigin, ownerConfirmedSignedIn = false,
  confirmedAt, now = Date.now, timeoutMs = 10000,
} = {}) {
  const denied = { status: 'UNVERIFIED', fixtureVerified: false };
  let timer;
  try {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 ||
        ownerConfirmedSignedIn !== true || browserOrigin !== ORIGIN ||
        !Number.isFinite(confirmedAt) || now() < confirmedAt ||
        now() - confirmedAt > 120000 || existingAppClient?.supabaseUrl !== REF ||
        typeof existingAppClient?.auth?.getUser !== 'function') return denied;
    // No getSession(), localStorage, cookie inspection, custom JWT or auth mutation.
    // Supabase validates the current browser session server-side. Raw results and
    // exceptions must stay here and must never be passed to tool/log output.
    const result = await Promise.race([
      existingAppClient.auth.getUser(),
      new Promise((_, reject) => { timer = globalThis.setTimeout(() => reject(new Error('UNVERIFIED')), timeoutMs); }),
    ]);
    const user = result?.data?.user;
    if (now() < confirmedAt || now() - confirmedAt > 120000 || result?.error ||
        user?.id !== PRO_FIXTURE.id || user?.email !== PRO_FIXTURE.email ||
        user.role !== 'authenticated' || user.is_anonymous === true ||
        !Number.isFinite(Date.parse(user.email_confirmed_at || '')))
      return denied;
    return { status: 'BROWSER_AUTH_VERIFIED', fixtureVerified: true };
  } catch { return denied; }
  finally { if (timer !== undefined) globalThis.clearTimeout(timer); }
}
