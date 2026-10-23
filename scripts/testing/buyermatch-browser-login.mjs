// LOCAL TEST HARNESS ONLY. No Auth URLs, injected storage, cookies or token bridge.
const stagingOrigin = 'https://dbp-registration-s2-preview-housebuyerinv.vercel.app';
const retiredIdentity = 'dbp-s2-billing-1792713543427@example.com';
const safeQuery = '?product=buyermatch';

function originAllowed(origin, localFixture) {
  if (origin === stagingOrigin) return true;
  const u = new URL(origin);
  return localFixture === true && u.protocol === 'http:' && u.hostname === '127.0.0.1' &&
    u.origin === origin && Boolean(u.port);
}
function safePage(raw, origin, path, search) {
  const u = new URL(raw);
  return u.origin === origin && u.pathname === path && u.search === search &&
    !u.hash && !u.username && !u.password;
}

// Driver operations must not emit AX trees, screenshots, network logs, raw URLs,
// values, exceptions or redirects. readURL returns privately; close emits nothing.
// Use an in-memory synthetic password; never pass credentials via argv/env/files.
export async function loginSyntheticSubscriber(driver, { origin = stagingOrigin,
  email, password, localFixture = false } = {}) {
  let stage = 'input_validation';
  try {
    if (!originAllowed(origin, localFixture) || email === retiredIdentity ||
        !/^dbp-s2-[a-z0-9._+-]+@example\.com$/.test(email || '') ||
        typeof password !== 'string' || password.length < 12) throw new Error();
    stage = 'login_navigation';
    await driver.navigate(`${origin}/admin-login${safeQuery}`);
    if (!safePage(await driver.readURL(), origin, '/admin-login', safeQuery)) throw new Error();
    stage = 'credential_entry';
    if (!await driver.passwordIsMasked()) throw new Error();
    await driver.fillEmail(email);
    if (!safePage(await driver.readURL(), origin, '/admin-login', safeQuery)) throw new Error();
    await driver.fillPassword(password);
    if (!safePage(await driver.readURL(), origin, '/admin-login', safeQuery)) throw new Error();
    stage = 'login_submission';
    await driver.submit();
    stage = 'safe_route_wait';
    await driver.waitForReady();
    if (!safePage(await driver.readURL(), origin, '/app/buyermatch/plans', '')) throw new Error();
    return { ok: true, stage: 'ready', route: '/app/buyermatch/plans', observationAllowed: true };
  } catch {
    // Deliberately discard browser/provider error messages and stacks: they can
    // include current URL, password fields, redirect headers or tokens.
    let closed = false;
    try { await driver.close(); closed = true; } catch { /* Still prohibit observations. */ }
    return { ok: false, stage, closed, observationAllowed: false };
  }
}

// Adapter for documented cua_repl Tab APIs. No observation method is called here.
// Do not rebind or inspect a populated/failed tab. A failure closes it once.
export const cuaLoginDriver = (tab, { listTabs, browserId }) => ({
  navigate: url => tab.goto(url),
  // DOM snapshots omit documentURI. Use supported, non-emitting tab metadata;
  // never print the inventory or pass it to an observer.
  readURL: async () => (await listTabs({ browser: browserId, emit: false })).find(item => item.id === tab.id)?.url,
  passwordIsMasked: async () => (await tab.playwright.getByLabel('PASSWORD', { exact: true }).getAttribute('type')) === 'password',
  fillEmail: value => tab.playwright.getByLabel('EMAIL', { exact: true }).fill(value),
  fillPassword: value => tab.playwright.getByLabel('PASSWORD', { exact: true }).fill(value),
  submit: () => tab.playwright.getByRole('button', { name: 'Sign In', exact: true }).click(),
  waitForReady: () => tab.playwright.getByRole('heading', { name: 'Get started with BuyerMatch', exact: true }).waitFor({ state: 'visible', timeoutMs: 20000 }),
  close: () => tab.close(),
});
