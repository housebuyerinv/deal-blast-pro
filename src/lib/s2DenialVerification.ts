import { isS2VerificationOrigin, S2_PRO_USER_ID, verifyS2ProSession } from './s2BrowserVerification';

export type DenialPlan = { source: string; deploymentId: string; runId: string; expiresAt: number };
export type DenialCheck = { operation: string; httpStatus: number | null; verified: boolean };
export type DenialResult = { status: 'PASS' | 'UNVERIFIED'; checks: DenialCheck[];
  binding?: DenialPlan & { origin: string; startedAt: number; completedAt: number } };
const fallback = 'dpl_nr5RVunmUGdryPUtWkRkVdsA96pT';
export function validDenialPlan(plan: DenialPlan, origin: string, backend: string, now: number) {
  return isS2VerificationOrigin(origin, backend) &&
    !['https://dbp-registration-s2-preview-housebuyerinv.vercel.app', 'https://dbp-registration-s2-7zijlxtxh-housebuyerinv.vercel.app'].includes(origin) &&
    /^[a-f0-9]{40}$/.test(plan.source) && /^dpl_[A-Za-z0-9]+$/.test(plan.deploymentId) && plan.deploymentId !== fallback &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.runId) &&
    Number.isSafeInteger(plan.expiresAt) && plan.expiresAt - now >= 30000 && plan.expiresAt - now <= 1800000;
}
type Client = {
  auth: {
    getUser: Parameters<typeof verifyS2ProSession>[0]['getUser'];
    getSession: () => Promise<{ error?: unknown; data?: { session?: { user?: { id?: string }; access_token?: string } | null } }>;
  };
};

// Browser-native only. Fixed same-origin operations; bearer never leaves this
// closure. No Stripe URL, credential entry, auth mutation, retries or DB writes.
export async function runS2Denials(input: {
  plan: DenialPlan; origin: string; backend: string; confirmed: boolean;
  client: Client; currentUser: () => string | undefined; isCurrent: () => boolean;
  signal: AbortSignal; fetcher?: typeof fetch; now?: () => number;
  progress?: (checks: DenialCheck[]) => void; timeoutMs?: number;
}): Promise<DenialResult> {
  const checks: DenialCheck[] = [];
  const plan = { source: input.plan.source, deploymentId: input.plan.deploymentId,
    runId: input.plan.runId, expiresAt: input.plan.expiresAt };
  let binding: DenialResult['binding'];
  let token = '', operation = 'scope', lastTime = 0;
  const now = input.now ?? Date.now, timeout = input.timeoutMs ?? 10000;
  const start = now();
  const guard = () => {
    const time = now();
    if (input.signal.aborted || !input.isCurrent() || input.currentUser() !== S2_PRO_USER_ID ||
      time < start || time < lastTime || time >= plan.expiresAt) throw Error();
    lastTime = time;
  };
  const record = (httpStatus: number | null, verified: boolean) => {
    checks.push({ operation, httpStatus, verified });
    input.progress?.(checks.map(check => ({ ...check })));
    if (!verified) throw Error();
  };
  const bounded = async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    guard();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      abort = () => { controller.abort(); reject(Error()); };
      input.signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, Math.min(timeout, plan.expiresAt - now()));
    });
    try { guard(); const value = await Promise.race([work(controller.signal), stopped]); guard(); return value; }
    finally { if (timer !== undefined) clearTimeout(timer); input.signal.removeEventListener('abort', abort); }
  };
  const request = (path: string, method: 'GET' | 'POST' = 'GET', body?: object, anonymous = false) => bounded(async signal => {
    const headers: Record<string, string> = anonymous ? {} : { Authorization: `Bearer ${token}` };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await (input.fetcher ?? fetch)(path, { method, headers, body: body ? JSON.stringify(body) : undefined,
      signal, redirect: 'error', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
    const reader = response.body?.getReader(); if (!reader) throw Error();
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { guard(); const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 65536) throw Error(); chunks.push(part.value); }
    } finally { void reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { code: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) };
  });
  const paused = async () => {
    const r = await request('/api/buyermatch?action=billing-status'), s = r.body;
    record(r.code, r.code === 200 && s?.schema === 1 && s.source === plan.source && s.deploymentId === plan.deploymentId &&
      s.projectId === 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl' && s.attestationRunId === plan.runId && s.pausedSettingsVerified === true &&
      s.registrationPaused === true && s.checkoutEnabled === false && s.liveBillingDisabled === true && s.deliveryDisabled === true &&
      ['OWNER_ID', 'RUN_ID', 'STARTED_AT', 'EXPIRES_AT', 'OPERATIONS'].every(key => s['BM_S2_BILLING_' + key] === ''));
    // Only project identifiers after matching an authenticated runtime readback;
    // syntactically valid but unverified form input is never copied into output.
    if (!binding) binding = { source: s.source, deploymentId: s.deploymentId, runId: s.attestationRunId,
      expiresAt: plan.expiresAt, origin: input.origin, startedAt: start, completedAt: start };
  };
  try {
    if (!input.confirmed || !validDenialPlan(plan, input.origin, input.backend, start) || !Number.isInteger(timeout) || timeout < 1 || timeout > 10000) throw Error();
    guard(); operation = 'fresh-pro-authentication';
    const auth = await verifyS2ProSession({ origin: input.origin, backend: input.backend, confirmed: true,
      currentUser: input.currentUser, stillCurrent: () => !input.signal.aborted && input.isCurrent(), getUser: () => input.client.auth.getUser(), timeoutMs: timeout });
    record(null, auth); guard();
    operation = 'same-browser-session';
    const session = await bounded(() => input.client.auth.getSession());
    if (session.error || session.data?.session?.user?.id !== S2_PRO_USER_ID || typeof session.data.session.access_token !== 'string' || !session.data.session.access_token || session.data.session.access_token.length > 16384) throw Error();
    token = session.data.session.access_token;
    operation = 'anonymous-app-control';
    const anonymous = await request('/api/buyermatch?action=billing-status', 'GET', undefined, true);
    record(anonymous.code, anonymous.code === 401 && anonymous.body?.error === 'Sign in required');
    operation = 'initial-paused-runtime'; await paused();
    for (const endpoint of ['s2-attestation', 's2-stripe-readiness']) {
      operation = 'pro-denied-' + endpoint;
      const r = await request('/api/platform/' + endpoint);
      record(r.code, r.code === 403 && r.body?.error === 'Owner access required');
    }
    const routes: [string, string, object, string | null][] = [
      ['legacy-portal', '/api/create-billing-portal-session', {}, 's2_legacy_portal_disabled'],
      ['legacy-credit-pack', '/api/property-intelligence/credit-packs', {}, 's2_legacy_checkout_disabled'],
      ['legacy-pro-trial', '/api/property-intelligence/pro-trial-checkout', {}, 's2_legacy_checkout_disabled'],
      ['buyermatch-checkout', '/api/buyermatch', { action: 'checkout', planVersion: 'buyermatch-pro-v1', operationKey: plan.runId }, null],
      ['buyermatch-portal', '/api/buyermatch', { action: 'billing-portal', operation: 'payment' }, null],
    ];
    for (const [name, path, body, code] of routes) {
      operation = name + '-paused-runtime'; await paused(); operation = name;
      const r = await request(path, 'POST', body), value = r.body;
      const shape = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['ok', 'error', 'code'].includes(key));
      record(r.code, Boolean(shape && (code ? r.code === 503 && value.code === code :
        r.code === 503 && value.error === 'S2 billing test window is closed or this operation is not approved.' ||
        name === 'buyermatch-checkout' && r.code === 409 && value.error === 'Review and sign the current platform terms and privacy policy before checkout.')));
    }
    operation = 'final-paused-runtime'; await paused(); guard();
    if (!binding) throw Error();
    return { status: 'PASS', checks, binding: { ...binding, completedAt: now() } };
  } catch {
    if (checks[checks.length - 1]?.operation !== operation || checks[checks.length - 1]?.verified !== false)
      checks.push({ operation, httpStatus: null, verified: false });
    return { status: 'UNVERIFIED', checks, ...(binding ? { binding: { ...binding, completedAt: now() } } : {}) };
  } finally { token = ''; }
}
