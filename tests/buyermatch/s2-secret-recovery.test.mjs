import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHmac, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { RECOVERY_SCOPE as S, SECRET_NAMES, parsePrivateSeed, requireCustody, verifyPrivateCohort, recoverExistingSecrets, requireExactOperatorPins, requireRecoveryPacketAllowsExecution, RECOVERY_OPERATOR_FILES } from '../../scripts/testing/s2-secret-recovery-core.mjs';
import { privateJsonChild, createBindingOnlyWriter } from '../../scripts/testing/s2-private-json-child.mjs';
import { encryptIdentity, identityHash } from '../../server/buyermatch/security.js';
import { readPrivateStagingCohort, executeApprovedSession } from '../../scripts/testing/s2-secret-recovery-session.mjs';
import { readPausedReceiver } from '../../scripts/testing/s2-receiver-pause-readback.mjs';
import { pins, verifyBindingMetadata } from '../../scripts/testing/s2-mvp-binding-metadata.mjs';
// Ephemeral SYNTHETIC fixtures only; no ambient environment/credential/provider access.
const key = randomBytes(32);
const values = { BUYERMATCH_IDENTITY_KEY: key.toString('base64'), BM_RESPONSE_SECRET: 'r'.repeat(48), BM_WORKER_SECRET: 'w'.repeat(48) };
const custody = { ownerSid: 'S-1-5-21-1-2-3-1000', physicalPath: 'C:\\SYNTHETIC\\seed', logicalResolvesToPhysical: true, sameFileId: true, reparseFree: true, hardLinkCount: 1, restrictiveReadWriteAcl: true, size: 1234, modified: '2026-10-25T00:00:00.000Z', handleStable: true, directoryChainVerified: true };
const approvedCustody = { ownerApprovedCustodianSid: custody.ownerSid, physicalPath: custody.physicalPath, size: custody.size, modified: custody.modified };
const cohort = () => Array.from({ length: S.count }, (_, i) => {
  const email = 'synthetic-' + i + '@example.invalid';
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([c.update(JSON.stringify({ email, name: 'SYNTHETIC' })), c.final()]);
  return { id: 'synthetic-' + i, synthetic: true, identity_ciphertext: [iv, encrypted, c.getAuthTag()].map((b) => b.toString('base64')).join('.'), identity_hash: createHmac('sha256', key).update(email).digest('hex') };
});
const rows = cohort();
const fakeCredential = (ref = S.ref, role = 'service_role') => [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ ref, role, iss: 'supabase' })).toString('base64url'), 'SYNTHETIC_NOT_A_VALID_SIGNATURE'].join('.');
const seed = () => [...Object.entries(values), ['SUPABASE_URL', S.url], ['SUPABASE_SERVICE_ROLE_KEY', fakeCredential()], ['IGNORED_TEST_PASSWORD', 'DUMMY-DO-NOT-TRANSFER']].map(([k, v]) => k + '=' + v).join('\n');
test('strict seed parser returns only bounded names, never mutates environment', () => {
  const before = { ...process.env }, result = parsePrivateSeed(seed());
  assert.deepEqual(Object.keys(result).sort(), [...SECRET_NAMES, 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].sort());
  // Boolean-only assertion: never let assertion formatting dump the environment.
  assert.equal(JSON.stringify({ ...process.env }) === JSON.stringify(before), true);
});
for (const [name, edit] of [
  ['Production URL', (s) => s.replace(S.url, 'https://aigvnbxiydbzzqbetlhl.supabase.co')],
  ['duplicate named secret', (s) => s + '\nBM_WORKER_SECRET=' + values.BM_WORKER_SECRET],
  ['shell expansion', (s) => s.replace('r'.repeat(48), '$(SYNTHETIC)')],
  ['bad identity length', (s) => s.replace(values.BUYERMATCH_IDENTITY_KEY, 'a'.repeat(44))],
  ['short response secret', (s) => s.replace('r'.repeat(48), 'short')],
  ['oversized file', () => 'a'.repeat(32769)],
]) test('seed denies ' + name, () => assert.throws(() => parsePrivateSeed(edit(seed())), /^Error: SEED_VALIDATION_FAILED$/));
test('exact custody passes', () => assert.equal(requireCustody(custody, approvedCustody), true));
for (const field of ['physicalPath', 'size', 'modified']) test('both missing custody ' + field + ' denied', () => {
  const a = { ...custody }, b = { ...approvedCustody }; delete a[field]; delete b[field];
  assert.throws(() => requireCustody(a, b), /CUSTODY_UNVERIFIED/);
});
test('existing application crypto encoding/HMAC contract with synthetic-only key', () => {
  const previous = process.env.BUYERMATCH_IDENTITY_KEY;
  try {
    process.env.BUYERMATCH_IDENTITY_KEY = values.BUYERMATCH_IDENTITY_KEY;
    const actual = Array.from({ length: 223 }, (_, i) => {
      const identity = { email: 'SYNTHETIC-' + i + '@example.invalid', name: 'SYNTHETIC' };
      return { id: 'app-' + i, synthetic: true, identity_ciphertext: encryptIdentity(identity), identity_hash: identityHash(identity.email) };
    });
    assert.equal(verifyPrivateCohort(actual, values).verified, true);
  } finally { if (previous === undefined) delete process.env.BUYERMATCH_IDENTITY_KEY; else process.env.BUYERMATCH_IDENTITY_KEY = previous; }
});
for (const [name, value] of Object.entries({ ownerSid: 'OTHER', physicalPath: 'C:\\OTHER', logicalResolvesToPhysical: false, sameFileId: false, reparseFree: false, hardLinkCount: 2, restrictiveReadWriteAcl: false, size: 1, modified: 'OTHER', handleStable: false, directoryChainVerified: false }))
  test('custody denies changed ' + name, () => assert.throws(() => requireCustody({ ...custody, [name]: value }, approvedCustody), /SOURCE_CUSTODY_UNVERIFIED/));
test('223 real synthetic AES-GCM decryptions and HMAC matches pass', () => assert.deepEqual(verifyPrivateCohort(rows, values), { verified: true, count: 223, syntheticOnly: true, allDecryptAndHashMatch: true }));
for (const [name, edit] of [
  ['missing record', (r) => r.pop()],
  ['extra record', (r) => r.push(r[0])],
  ['duplicate id', (r) => r[1].id = r[0].id],
  ['non synthetic', (r) => r[2].synthetic = false],
  ['ciphertext corruption', (r) => r[3].identity_ciphertext = 'invalid'],
  ['identity hash mismatch', (r) => r[4].identity_hash = 'a'.repeat(64)],
  ['mixed keys', (r) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', randomBytes(32), iv); r[5].identity_ciphertext = [iv, Buffer.concat([c.update('{}'), c.final()]), c.getAuthTag()].map((b) => b.toString('base64')).join('.'); }],
]) test('cohort rejects ' + name, () => { const r = structuredClone(rows); edit(r); assert.throws(() => verifyPrivateCohort(r, values), /^Error: COHORT_KEY_MATCH_FAILED$/); });
function fixture(options = {}) {
  const envs = [], logs = [], calls = [];
  const state = () => ({ project: S.project, team: S.team, ref: S.ref, protected: true, freePlan: true, pausesVerified: true, fallbackVerified: true, unchangedExistingBindings: true, paginationComplete: true, envs: structuredClone(envs), ...options.state });
  const provider = {
    readScope: async () => state(),
    createOnly: async (body) => {
      calls.push({ key: body.key, type: body.type, target: body.target });
      if (options.failAt === calls.length) throw Error('SYNTHETIC_PROVIDER_ERROR_' + values.BM_RESPONSE_SECRET);
      const created = { key: body.key, id: 'synthetic-' + calls.length, type: body.type, target: body.target, updatedAt: 12345 };
      envs.push(created); return { created: { ...created, value: body.value, vsmValue: 'DUMMY_RAW_PRIVATE_RESPONSE' } };
    },
  };
  return { envs, calls, logs, args: { privateValues: values, rows, custody, approvedCustody, provider, journal: async (x) => { logs.push(structuredClone(x)); if (options.journalFail) throw Error('SYNTHETIC'); } } };
}
test('three create-only Preview writes; sanitized receipts/journal; runtime still pending', async () => {
  const f = fixture(), result = await recoverExistingSecrets(f.args);
  assert.equal(result.verified, true); assert.equal(result.runtimeVerificationPending, true);
  assert.deepEqual(f.calls.map((x) => x.key), SECRET_NAMES);
  for (const secret of Object.values(values)) assert.equal(JSON.stringify([result, f.logs, f.calls]).includes(secret), false);
});
for (const [name, value] of Object.entries({ project: 'OTHER', team: 'OTHER', ref: 'OTHER', protected: false, freePlan: false, pausesVerified: false, fallbackVerified: false, unchangedExistingBindings: false, paginationComplete: false }))
  test('no writes on failed scope ' + name, async () => { const f = fixture({ state: { [name]: value } }); assert.equal((await recoverExistingSecrets(f.args)).verified, false); assert.equal(f.calls.length, 0); });
test('existing named binding blocks all writes', async () => { const f = fixture({ state: { envs: [{ key: SECRET_NAMES[0], id: 'foreign' }] } }); assert.equal((await recoverExistingSecrets(f.args)).verified, false); assert.equal(f.calls.length, 0); });
for (const failAt of [1, 2, 3]) test('partial failure ' + failAt + ' stops without rollback/retry or raw error', async () => {
  const f = fixture({ failAt }), result = await recoverExistingSecrets(f.args);
  assert.equal(result.outcome, 'UNKNOWN'); assert.equal(f.calls.length, failAt); assert.equal(result.receipts.length, failAt - 1);
  assert.equal(JSON.stringify([result, f.logs]).includes(values.BM_RESPONSE_SECRET), false);
});
test('journal failure stops before any provider write', async () => { const f = fixture({ journalFail: true }); await recoverExistingSecrets(f.args); assert.equal(f.calls.length, 0); });
for (const contaminatedId of [values.BM_RESPONSE_SECRET, 'prefix-' + values.BM_WORKER_SECRET]) test('contaminated metadata ID is never journaled', async () => {
  const f = fixture();
  f.args.provider.createOnly = async (body) => ({ created: { ...body, id: contaminatedId, updatedAt: 123 } });
  const result = await recoverExistingSecrets(f.args);
  assert.equal(result.verified, false); assert.equal(result.outcome, 'UNKNOWN'); assert.equal(result.receipts.length, 0);
  assert.equal(JSON.stringify([result, f.logs]).includes(contaminatedId), false);
});
test('no scope read or write with unknown custody', async () => { const f = fixture(); f.args.custody = { ...custody, ownerSid: 'OTHER' }; f.args.provider.readScope = () => assert.fail('must not touch provider'); assert.equal((await recoverExistingSecrets(f.args)).verified, false); });
test('retry after partial write fails closed on existing binding', async () => { const f = fixture({ failAt: 2 }); await recoverExistingSecrets(f.args); const count = f.calls.length; assert.equal((await recoverExistingSecrets(f.args)).verified, false); assert.equal(f.calls.length, count); });
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
test('actual dummy child uses stdin, discards stderr, excludes secret environment and argv', async () => {
  const d = mkdtempSync(join(tmpdir(), 'bm-synthetic-stdin-'));
  try {
    const file = join(d, 'dummy.cjs');
    writeFileSync(file, `let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const x=JSON.parse(s);process.stderr.write(x.private);console.log(JSON.stringify({stdinReceived:x.private==='SYNTHETIC_PRIVATE',argvSafe:!process.argv.join(' ').includes(x.private),noInheritedSecret:!process.env.BM_SYNTHETIC_PRIVATE}));});`);
    const previous = process.env.BM_SYNTHETIC_PRIVATE; process.env.BM_SYNTHETIC_PRIVATE = 'SYNTHETIC_PRIVATE';
    try {
      assert.deepEqual(await privateJsonChild({ executable: process.execPath, executableHash: hash(process.execPath), script: file, scriptHash: hash(file), args: [], input: { private: 'SYNTHETIC_PRIVATE' }, cwd: d }), { stdinReceived: true, argvSafe: true, noInheritedSecret: true });
    } finally { if (previous === undefined) delete process.env.BM_SYNTHETIC_PRIVATE; else process.env.BM_SYNTHETIC_PRIVATE = previous; }
    for (const code of ["process.stderr.write('SYNTHETIC_PRIVATE');process.exit(2)", "console.log('SYNTHETIC_PRIVATE')", "setTimeout(()=>{},10000)"]) {
      writeFileSync(file, code);
      await assert.rejects(privateJsonChild({ executable: process.execPath, executableHash: hash(process.execPath), script: file, scriptHash: hash(file), args: [], input: {}, cwd: d, timeoutMs: 200 }), /^Error: PRIVATE_PROCESS_FAILED$/);
    }
    await assert.rejects(privateJsonChild({ executable: process.execPath, executableHash: 'bad', script: file, scriptHash: hash(file), args: [], input: {}, cwd: d }), /PREFLIGHT_FAILED/);
  } finally { rmSync(d, { recursive: true }); } // Only this test's resolved mkdtemp; synthetic public code only.
});
test('binding writer rejects broader target and keys before subprocess', async () => {
  const write = createBindingOnlyWriter({});
  for (const body of [{ key: 'STRIPE_SECRET_KEY', type: 'sensitive', value: 'DUMMY', target: ['preview'] }, { key: SECRET_NAMES[0], type: 'sensitive', value: 'DUMMY', target: ['production'] }])
    await assert.rejects(write(body), /CREATE_SCOPE_DENIED/);
});
test('actual cohort HTTP adapter fixed S2 GET, no redirect, exact count with private headers', async () => {
  const got = await readPrivateStagingCohort(parsePrivateSeed(seed()), async (url, options) => {
    assert.equal(url.startsWith(S.url + '/rest/v1/bm_buyers?'), true);
    assert.equal(url.includes('SYNTHETIC_ONLY_NOT_A_REAL_CREDENTIAL'), false);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-range': '0-222/223' } });
  });
  assert.equal(got.length, 223);
});
for (const credential of [fakeCredential('PRODUCTION'), fakeCredential(S.ref, 'anon'), 'SYNTHETIC_OPAQUE_OR_UNBOUND'])
  test('foreign or unbound credential denied before transport', async () => {
    const v = parsePrivateSeed(seed()); v.SUPABASE_SERVICE_ROLE_KEY = credential;
    await assert.rejects(readPrivateStagingCohort(v, async () => assert.fail('MUST NOT TRANSMIT')), /STAGING_COHORT_READ_UNVERIFIED/);
  });
for (const [status, range] of [[401,'0-222/223'],[206,'0-222/223'],[200,'0-222/224'],[200,'0-222/*'],[200,'']])
  test('cohort HTTP fails closed ' + status + ' ' + range, async () => {
    await assert.rejects(readPrivateStagingCohort(parsePrivateSeed(seed()), async () => new Response('SYNTHETIC_PRIVATE', { status, headers: { 'content-range': range } })), /^Error: STAGING_COHORT_READ_UNVERIFIED$/);
  });
test('paused receiver requires exact actual deployed guard response', async () => {
  assert.equal(await readPausedReceiver(async (url, options) => {
    assert.equal(url, S.url + '/functions/v1/stripe-webhook'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ ok: false, error: 'Staging webhook processing paused' }), { status: 503 });
  }), true);
});
for (const body of [{ ok: false, error: 'Service unavailable' }, { ok: true, error: 'Staging webhook processing paused' }, { ok: false, error: 'Staging webhook processing paused', extra: true }])
  test('generic or mismatched503 never proves pause', async () => assert.rejects(readPausedReceiver(async () => new Response(JSON.stringify(body), { status: 503 })), /PAUSE_UNVERIFIED/));
test('session without real independently verified approval does not touch files/providers', async () => {
  const result = await executeApprovedSession({ approval: {}, packet: {}, toolPins: {}, sourceRequest: {}, directory: 'NEVER_CREATED' });
  assert.equal(result.verified, false); assert.equal(result.phase, 'authorization');
});
const recoveryFixture = () => ({ verified: true, project: S.project, team: S.team, source: 'b99830596080eef2b24472e71bdcb061c855bf57', cohort: { verified: true, count: 223, syntheticOnly: true, allDecryptAndHashMatch: true }, receipts: SECRET_NAMES.map((key,i) => ({ key, id:'synthetic-'+i, type:'sensitive', target:['preview'], updatedAt:123 })) });
const envFixture = (receipt) => ({ envs: [...Object.entries(pins).map(([key,value]) => ({ key, ...value, target:['preview'] })), ...structuredClone(receipt.receipts)] });
test('only exact recovered bindings extend original metadata pins', () => {
  const recovery = recoveryFixture(); assert.equal(verifyBindingMetadata(envFixture(recovery), recovery).metadataContinuityVerified, true);
  assert.throws(() => verifyBindingMetadata(envFixture(recovery)), /Unknown environment binding/);
});
test('prototype property is not an allowed environment binding', () => {
  const r = recoveryFixture(), env = envFixture(r); env.envs.push({ key:'constructor' });
  assert.throws(()=>verifyBindingMetadata(env,r),/Unknown environment binding/);
});
test('exact17 operator pins required, same-count substitution cannot pass', () => {
  const p = Object.fromEntries(RECOVERY_OPERATOR_FILES.map((n) => [n,'a'.repeat(64)]));
  requireExactOperatorPins(p);
  delete p['scripts/testing/s2-private-seed-source.ps1']; p['unrelated-file'] = 'a'.repeat(64);
  assert.throws(()=>requireExactOperatorPins(p),/OPERATOR_SET_UNVERIFIED/);
});
test('actual blocked public packet cannot pass execution guard', () => {
  const packet=JSON.parse(readFileSync(new URL('../../docs/BUYERMATCH_S2_SECRET_RECOVERY_REQUEST.json',import.meta.url),'utf8'));
  assert.throws(()=>requireRecoveryPacketAllowsExecution(packet),/PACKET_EXECUTION_BLOCKED/);
});
for (const [name, change] of [
  ['wrong project', (r) => r.project='OTHER'], ['wrong source', (r) => r.source='OTHER'],
  ['unverified cohort', (r) => r.cohort.verified=false], ['extra receipt', (r) => r.receipts.push(r.receipts[0])],
  ['Production target', (r) => r.receipts[0].target=['production']], ['secret value field', (r) => r.receipts[0].value='SYNTHETIC'],
  ['duplicate receipt ID', (r) => r.receipts[0].id=r.receipts[1].id],
]) test('recovery manifest denies '+name, () => { const r=recoveryFixture(); change(r); assert.throws(()=>verifyBindingMetadata(envFixture(r),r)); });
