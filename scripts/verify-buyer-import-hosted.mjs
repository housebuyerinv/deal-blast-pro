// Hosted synthetic-only acceptance. Stop at the first failed assertion.
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { parseBuyerRecord, consolidateImportRows } from '../src/lib/buyerImport.js';
import { importedMandateFit } from '../src/lib/importedBuyerMatching.js';
const env = process.env;
const dbOrigin = 'https://qxhhlprentrufobpcgna.supabase.co';
const origin = env.BM_IMPORT_PREVIEW_ORIGIN;
if (!/^https:\/\/deal-blast-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(origin || '') || !/^[a-f0-9]{40}$/.test(env.BM_IMPORT_CANDIDATE_SHA || '')) throw Error('Exact connector-verified Preview origin and commit are required');
const resume = process.argv.includes('--resume');
const previous = resume ? JSON.parse(fs.readFileSync('test-artifacts/buyer-import-hosted.json', 'utf8')) : null;
const run = previous?.run || `importqa-${Date.now()}`;
if (!/^importqa-\d+$/.test(run)) throw Error('Synthetic run identifier required');
const report = { origin, commit: env.BM_IMPORT_CANDIDATE_SHA, run, resumed: resume, checks: [], timings: {}, status: 'RUNNING' };
const save = () => fs.writeFileSync('test-artifacts/buyer-import-hosted.json', JSON.stringify(report, null, 2));
function check(ok, label) { report.checks.push({ label, passed: Boolean(ok) }); save(); if (!ok) throw Error(label); }
const dbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
let cookie = '';
async function rest(path, options = {}, token) {
  const headers = token === 'anon' ? { apikey: env.VITE_SUPABASE_ANON_KEY } : token ? { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } : dbHeaders;
  const r = await fetch(dbOrigin + '/rest/v1/' + path, { ...options, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers } });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, ok: r.ok, body, headers: r.headers };
}
async function login(prefix) {
  const email = env[`BM_TEST_${prefix}_EMAIL`];
  check(email?.endsWith('@example.invalid'), `${prefix} account is synthetic`);
  const r = await fetch(dbOrigin + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: env[`BM_TEST_${prefix}_PASSWORD`] }) });
  const b = await r.json(); check(r.ok && b.access_token, `${prefix} authentication`);
  return { token: b.access_token, id: b.user.id };
}
async function api(account, buyers, operation = 'import') {
  check(buyers.every(b => b.email?.endsWith('@example.invalid')), 'Request contains synthetic contacts only');
  const r = await fetch(origin + '/api/import-buyers', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(account ? { Authorization: `Bearer ${account.token}` } : {}) }, body: JSON.stringify({ buyers, operation }) });
  let body; try { body = await r.json(); } catch { body = {}; }
  return { status: r.status, body };
}
const record = (id, fields = {}) => parseBuyerRecord({ Name: `SYNTHETIC ${id}`, Email: `${run}-${id}@example.invalid`, Company: `Synthetic company ${id}`, Markets: 'Austin, TX', 'Property Criteria': 'SFH', 'Price / Formula': '$100K–$500K', Notes: '  SYNTHETIC exact\nnotes  ', ...fields }, id);
// Independent comparison: deep equality ignores object-key ordering without
// relying on the production merge's identity function. Array content is exact.
const sameMembers = (actual, expected) => actual?.length === expected.length && expected.every(item => actual.filter(value => isDeepStrictEqual(value, item)).length === 1);
async function workspace(account) {
  const result = await api(account, []);
  check(result.status === 400, 'Hosted auth reaches import validation with staging credentials');
  const r = await rest(`workspaces?select=id,owner_user_id&owner_user_id=eq.${account.id}`);
  check(r.ok && r.body.length === 1, 'Synthetic workspace exists');
  account.workspace = r.body[0].id;
  return account;
}
async function rowsFor(account) { return rest(`buyers?select=*&workspace_id=eq.${account.workspace}&email=like.${run}*`); }
async function sideEffectCounts() {
  const result = {};
  for (const table of ['bm_outbox', 'bm_responses', 'bm_checkouts', 'bm_billing_events']) {
    const r = await rest(`${table}?select=*&limit=0`, { headers: { Prefer: 'count=exact' } });
    check(r.ok && r.headers.get('content-range'), `${table} activity count readable`);
    result[table] = r.headers.get('content-range');
  }
  return result;
}
try {
  check(env.SUPABASE_URL === dbOrigin && env.VITE_SUPABASE_URL === dbOrigin, 'Both configured database URLs are isolated staging');
  const share = new URL(env.BM_PREVIEW_SHARE_URL);
  check(share.origin === origin, 'Preview access link targets exact deployment');
  const access = await fetch(share, { redirect: 'manual' });
  cookie = access.headers.getSetCookie().find(c => c.startsWith('_vercel_jwt='))?.split(';')[0] || '';
  check(Boolean(cookie), 'Protected Preview access');
  const page = await fetch(origin, { headers: { Cookie: cookie }, redirect: 'manual' });
  check(page.ok, 'Exact Preview application responds');
  const html = await page.text();
  let bundle = '';
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const url = new URL(match[1], origin);
    // Vercel injects its own feedback toolbar into protected Preview HTML. It is
    // not the application bundle; do not fetch or execute it in this runner.
    if (url.origin === 'https://vercel.live' && url.pathname === '/_next-live/feedback/feedback.js') continue;
    check(url.origin === origin, 'Application script stays on Preview');
    bundle += await (await fetch(url, { headers: { Cookie: cookie } })).text();
  }
  check(bundle.includes(dbOrigin) && bundle.includes(env.VITE_SUPABASE_ANON_KEY), 'Built frontend uses staging URL and public key');
  check(!bundle.includes('aigvnbxiydbzzqbetlhl'), 'No Production database reference in frontend');
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'BUYERMATCH_IDENTITY_KEY', 'BM_RESPONSE_SECRET', 'BM_WORKER_SECRET']) check(!env[key] || !bundle.includes(env[key]), `${key} absent from frontend`);
  report.beforeCounts = await sideEffectCounts();
  const user = await workspace(await login('USER'));
  const other = await workspace(await login('OTHER'));
  const admin = await workspace(await login('ADMIN'));
  check(user.workspace !== other.workspace && admin.workspace !== user.workspace, 'Distinct synthetic workspace ownership');
  check((await api(null, [record('unauth')])).status === 401, 'Unauthenticated import denied');
  const first = await api(user, [record('one', { 'Do Not Email': 'yes' })]);
  check(first.status === 200 && first.body.data?.length === 1, 'Hosted synthetic import persists');
  const saved = first.body.data[0];
  report.syntheticBuyerId = saved.id;
  const stored = await rest(`buyers?select=*&id=eq.${saved.id}`);
  check(stored.ok && stored.body[0]?.workspace_id === user.workspace && stored.body[0]?.owner_user_id === user.id, 'Database row has correct workspace and owner');
  check(saved.doNotEmail && saved.suppressed && !saved.blastEligible && !saved.distributionEligible, 'Suppressed import remains ineligible');
  check(saved.verificationStatus === 'Unverified' && importedMandateFit({}, saved).score === 0, 'Unverified import cannot automatically match for outreach');
  const own = await rest(`buyers?select=id&id=eq.${saved.id}`, {}, user.token);
  check(own.ok && own.body.length === 1, 'Owner RLS read succeeds');
  for (const token of [other.token, 'anon']) {
    const r = await rest(`buyers?select=id&id=eq.${saved.id}`, {}, token);
    check(r.ok && r.body.length === 0, 'Cross-workspace/anonymous RLS read denies known row');
  }
  const update = await rest(`buyers?id=eq.${saved.id}`, { method: 'PATCH', body: JSON.stringify({ company: 'FORBIDDEN SYNTHETIC CHANGE' }) }, other.token);
  check(update.ok && update.body.length === 0, 'Cross-workspace RLS update denied');
  const cross = await api(other, [{ ...saved, company: 'FORBIDDEN' }], 'reviewed-update');
  check(cross.status === 409, 'Cross-workspace API profile update denied');
  const inject = await rest('buyers', { method: 'POST', body: JSON.stringify({ id: `${run}-foreign`, workspace_id: user.workspace, owner_user_id: other.id, email: `${run}-foreign@example.invalid` }) }, other.token);
  check(!inject.ok, 'Cross-workspace direct insert denied');
  const replay = await api(user, [record('one', { Company: '', Notes: '' })]);
  check(replay.status === 200 && replay.body.data[0].id === saved.id && replay.body.data[0].company === saved.company && replay.body.data[0].notes === saved.notes, 'Reimport keeps one profile and nonblank values');
  const races = await Promise.all([
    api(user, [record('race', { Markets: 'Austin, TX', 'Do Not Email': 'yes' })]),
    api(user, [record('race', { Markets: 'Tampa, FL', Phone: '5550109876' })]),
  ]);
  check(races.every(r => r.status === 200), 'Concurrent first imports both succeed');
  const race = await rest(`buyers?select=*&workspace_id=eq.${user.workspace}&email=eq.${run}-race@example.invalid`);
  check(race.ok && race.body.length === 1 && race.body[0].data.buyingMandates.length === 2 && race.body[0].data.suppressed, 'Concurrent import retains two mandates and suppression on one profile');
  const raceInputs = [record('race', { Markets: 'Austin, TX', 'Do Not Email': 'yes' }), record('race', { Markets: 'Tampa, FL', Phone: '5550109876' })];
  const repeatedRace = await Promise.all(Array.from({ length: 4 }, (_, i) => api(user, [raceInputs[i % 2]])));
  check(repeatedRace.every(r => r.status === 200), 'Four concurrent reimports succeed');
  const raceAfter = await rest(`buyers?select=data&workspace_id=eq.${user.workspace}&email=eq.${run}-race@example.invalid`);
  check(raceAfter.ok && raceAfter.body.length === 1 && sameMembers(raceAfter.body[0].data.buyingMandates, raceInputs.flatMap(r => r.buyingMandates)) && raceAfter.body[0].data.suppressed, 'Concurrent replay preserves exact distinct mandate content and suppression');
  const edit = await api(user, [{ id: saved.id, email: saved.email, company: 'Reviewed synthetic replacement', notes: '', doNotEmail: false, suppressed: false, blastEligible: true }], 'reviewed-update');
  check(edit.status === 200 && edit.body.data[0].company === 'Reviewed synthetic replacement' && edit.body.data[0].notes === saved.notes && edit.body.data[0].suppressed, 'Explicit reviewed update preserves blank fields and suppression');
  const plan = await rest(`workspace_plan_assignments?select=buyer_capacity_mode,current_plan,effective_access_plan&workspace_id=eq.${user.workspace}`);
  check(plan.ok && plan.body[0]?.buyer_capacity_mode !== 'unlimited' && ['Free', 'Free Demo'].includes(plan.body[0]?.effective_access_plan || plan.body[0]?.current_plan), 'Capacity fixture uses ordinary free plan');
  const all = await rest(`buyers?select=id&workspace_id=eq.${user.workspace}`);
  check(all.ok && all.body.length <= 25, 'Free workspace begins within capacity');
  const fillers = Array.from({ length: 25 - all.body.length }, (_, i) => record(`capacity-${i}`));
  if (fillers.length) check((await api(user, fillers)).status === 200, 'API fills exactly remaining capacity');
  check((await api(user, [record('over-limit')])).status === 409, 'API rejects over-capacity insert');
  const direct = await rest('buyers', { method: 'POST', body: JSON.stringify({ id: `${run}-db-over`, workspace_id: user.workspace, owner_user_id: user.id, email: `${run}-db-over@example.invalid` }) });
  check(!direct.ok && direct.body?.message?.includes('buyer_plan_limit_exceeded'), 'Database trigger independently rejects service-role over-capacity insert');
  check((await api(user, [record('one', { Notes: '' })])).status === 200, 'Existing profile merge succeeds at full capacity');
  const detailed = [
    record('detailed', { Strategy: 'Fix & Flip', 'Price / Formula': '65% ARV minus repairs', 'Do Not Email': 'yes' }),
    record('detailed', { Markets: 'Tampa, FL', 'Property Criteria': 'Multifamily', Strategy: 'Buy and Hold', 'Price / Formula': '$100K–$500K' }),
  ];
  for (let pass = 0; pass < 3; pass++) {
    const results = await Promise.all(detailed.map(row => api(admin, [row])));
    check(results.every(r => r.status === 200), `Detailed concurrent mandate replay ${pass + 1}`);
    const persisted = await rest(`buyers?select=data&workspace_id=eq.${admin.workspace}&email=eq.${run}-detailed@example.invalid`);
    check(persisted.ok && persisted.body.length === 1 && sameMembers(persisted.body[0].data.buyingMandates, detailed.flatMap(r => r.buyingMandates)) && sameMembers(persisted.body[0].data.sourceRecords, detailed.flatMap(r => r.sourceRecords)) && persisted.body[0].data.suppressed, 'Exact ARV formula, purchase budget, distinct strategies, notes and suppression survive hosted JSONB concurrency');
  }
  const start = performance.now();
  const raw = Array.from({ length: 3049 }, (_, i) => record(`large-${i}`, { 'Do Not Email': i < 1511 ? 'yes' : 'no' }));
  for (let i = 0; i < 5; i++) raw.push(record(`large-${i}`, { Markets: 'Tampa, FL', 'Do Not Email': 'yes' }));
  const profiles = consolidateImportRows(raw);
  report.timings.parseMs = Math.round(performance.now() - start);
  check(profiles.length === 3049 && profiles.reduce((n, r) => n + r.buyingMandates.length, 0) === 3054, 'Synthetic workload has 3049 profiles and 3054 mandates');
  for (const pass of resume ? ['reimport', 'secondReplay'] : ['initialImport', 'reimport', 'secondReplay']) {
    const started = performance.now();
    for (let i = 0; i < profiles.length; i += 50) {
      const r = await api(admin, profiles.slice(i, i + 50));
      check(r.status === 200, `${pass} batch ${Math.floor(i / 50) + 1}`);
      if (i % 500 === 0) console.log(`${pass}: ${Math.min(i + 50, profiles.length)}/3049 synthetic profiles verified`);
    }
    report.timings[`${pass}Ms`] = Math.round(performance.now() - started); save();
  let large = [];
  for (let offset = 0; offset < 3049; offset += 500) {
    const r = await rest(`buyers?select=id,email,data&workspace_id=eq.${admin.workspace}&email=like.${run}-large-*&order=id&offset=${offset}&limit=500`);
    check(r.ok, 'Read persisted synthetic workload'); large.push(...r.body);
  }
  check(large.length === 3049 && new Set(large.map(r => r.email)).size === 3049, 'Database contains exactly 3049 unique workload profiles after reimport');
  check(large.reduce((n, r) => n + r.data.buyingMandates.length, 0) === 3054, 'Database retains all 3054 mandates after reimport');
  check(large.filter(r => r.data.suppressed).length === 1511 && large.every(r => !r.data.blastEligible && !r.data.distributionEligible), 'All synthetic suppression and outreach restrictions survive');
  const expectedByEmail = new Map(profiles.map(profile => [profile.email, profile]));
  check(large.every(row => {
    const expected = expectedByEmail.get(row.email);
    return expected && sameMembers(row.data.buyingMandates, expected.buyingMandates) && sameMembers(row.data.sourceRecords, expected.sourceRecords) && row.data.notes === expected.notes;
  }), `${pass}: every persisted mandate, original source field and exact note matches parsed input`);
  report[`${pass}Snapshot`] = { profiles: large.length, mandates: large.reduce((n, r) => n + r.data.buyingMandates.length, 0), suppressed: large.filter(r => r.data.suppressed).length, fullContentVerified: true };
  save();
  }
  report.afterCounts = await sideEffectCounts();
  check(JSON.stringify(report.beforeCounts) === JSON.stringify(report.afterCounts), 'BuyerMatch delivery/payment activity counts unchanged');
  report.status = 'PASSED';
} catch (error) { report.status = 'BLOCKED'; report.failure = error.message; process.exitCode = 1; }
finally { save(); console.log(JSON.stringify({ status: report.status, passed: report.checks.filter(c => c.passed).length, failed: report.checks.filter(c => !c.passed).length, failure: report.failure, timings: report.timings })); }
