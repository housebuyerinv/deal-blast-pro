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

// Prepared browser evaluation, not executed here. Uses the application's existing
// SDK singleton (src/lib/supabase.ts), never a token/cookie/storage bridge.
// Tool access to same-tab evaluation must be verified before any future login.
export function prepareBrowserVerification({ ownerConfirmedSignedIn, confirmedAt }) {
  if (ownerConfirmedSignedIn !== true || !Number.isFinite(confirmedAt))
    throw new Error('EXPLICIT_OWNER_CONFIRMATION_REQUIRED');
  return `(async () => {
    const REF=${JSON.stringify(REF)}, ORIGIN=${JSON.stringify(ORIGIN)};
    const PRO_FIXTURE=${JSON.stringify(PRO_FIXTURE)};
    const verify=${verifyExistingBrowserHandoff.toString()};
    return await verify({ existingAppClient: globalThis.__dealBlastSupabaseClient,
      browserOrigin: globalThis.location.origin, ownerConfirmedSignedIn: true,
      confirmedAt: ${JSON.stringify(confirmedAt)} });
  })()`;
}

export async function verifyExistingBrowserHandoff({
  existingAppClient, browserOrigin, ownerConfirmedSignedIn = false,
  confirmedAt, now = Date.now,
} = {}) {
  const denied = { status: 'UNVERIFIED', fixtureVerified: false };
  try {
    if (ownerConfirmedSignedIn !== true || browserOrigin !== ORIGIN ||
        !Number.isFinite(confirmedAt) || now() < confirmedAt ||
        now() - confirmedAt > 120000 || existingAppClient?.supabaseUrl !== REF ||
        typeof existingAppClient?.auth?.getUser !== 'function') return denied;
    // No getSession(), localStorage, cookie inspection, custom JWT or auth mutation.
    // Supabase validates the current browser session server-side. Raw results and
    // exceptions must stay here and must never be passed to tool/log output.
    const result = await existingAppClient.auth.getUser();
    const user = result?.data?.user;
    if (now() - confirmedAt > 120000 || result?.error ||
        user?.id !== PRO_FIXTURE.id || user?.email !== PRO_FIXTURE.email ||
        user.role !== 'authenticated' || user.is_anonymous === true ||
        !Number.isFinite(Date.parse(user.email_confirmed_at || '')))
      return denied;
    return { status: 'BROWSER_AUTH_VERIFIED', fixtureVerified: true };
  } catch { return denied; }
}
