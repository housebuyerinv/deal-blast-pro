// Preparation library only: importing this file reads no files or credentials and
// performs no provider operations. The reviewed invoker supplies private adapters
// only after independent verification of explicit owner authorization.
import { Buffer } from 'node:buffer';
import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
export const RECOVERY_SCOPE = Object.freeze({
  project: 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl',
  team: 'team_2ejXKYjjGXIFsIQTUMEqZ8Cf',
  ref: 'qxhhlprentrufobpcgna',
  url: 'https://qxhhlprentrufobpcgna.supabase.co',
  count: 223,
});
export const SECRET_NAMES = Object.freeze([
  'BUYERMATCH_IDENTITY_KEY', 'BM_RESPONSE_SECRET', 'BM_WORKER_SECRET',
]);
export const RECOVERY_OPERATOR_FILES = Object.freeze([
  'scripts/testing/s2-mvp-routing.mjs', 'scripts/testing/s2-mvp-provider.mjs',
  'scripts/testing/s2-mvp-watchdog.mjs', 'scripts/testing/s2-mvp-launcher.mjs',
  'scripts/testing/s2-canary-provider.mjs', 'scripts/testing/s2-canary-http-observer.mjs',
  'scripts/testing/s2-canary-pauses.mjs', 'scripts/buyermatch-s2-release.mjs',
  'scripts/testing/s2-mvp-bindings.mjs', 'scripts/testing/s2-mvp-binding-metadata.mjs',
  'scripts/testing/s2-mvp-preparer.mjs', 'scripts/testing/s2-mvp-deploy.mjs',
  'scripts/testing/s2-secret-recovery-core.mjs', 'scripts/testing/s2-private-json-child.mjs',
  'scripts/testing/s2-private-seed-source.ps1', 'scripts/testing/s2-secret-recovery-session.mjs',
  'scripts/testing/s2-receiver-pause-readback.mjs',
]);
export function requireExactOperatorPins(pins) {
  if (!pins || Object.keys(pins).sort().join('|') !== [...RECOVERY_OPERATOR_FILES].sort().join('|') ||
      !Object.values(pins).every((h) => /^[a-f0-9]{64}$/.test(h))) fail('OPERATOR_SET_UNVERIFIED');
}
export function requireRecoveryPacketAllowsExecution(packet) {
  if (packet?.executionReady !== true || packet.status !== 'PENDING_OWNER_APPROVAL_NO_EXECUTION' ||
      packet.executionAllowedWithoutOwnerApproval !== false) fail('PACKET_EXECUTION_BLOCKED');
}
export function validatePrivateValues(values) {
  try {
    const key = b64(values?.BUYERMATCH_IDENTITY_KEY);
    const valid = key.length === 32; key.fill(0);
    if (!valid) fail('INVALID_KEY');
    for (const name of SECRET_NAMES.slice(1)) {
      if (!/^[A-Za-z0-9_+\-/=]{32,256}$/.test(values[name] ?? '')) fail('INVALID_SECRET');
    }
    if (new Set(SECRET_NAMES.map((name) => values[name])).size !== 3) fail('INVALID_SECRET');
    return true;
  } catch { fail('SECRET_FORMAT_INVALID'); }
}
const fail = (code) => { throw new Error(code); };
const b64 = (text) => {
  if (typeof text !== 'string' || !text.length || text.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail('INVALID_ENCODING');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.toString('base64') !== text) fail('INVALID_ENCODING');
  return bytes;
};

// This deliberately does not implement dotenv expansion, exports, executable
// expressions, generic environment installation, or process.env mutation.
export function parsePrivateSeed(text) {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 32768) fail('BAD_SEED');
    const accepted = new Set([...SECRET_NAMES, 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const values = Object.create(null);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (!match) fail('BAD_SEED');
      if (!accepted.has(match[1])) continue; // Unrelated values never leave parser.
      if (Object.hasOwn(values, match[1])) fail('BAD_SEED');
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!value || /[\s\x00-\x1f\x7f`$\\]/.test(value)) fail('BAD_SEED');
      values[match[1]] = value;
    }
    if (values.SUPABASE_URL !== RECOVERY_SCOPE.url) fail('BAD_SEED');
    if (!values.SUPABASE_SERVICE_ROLE_KEY) fail('BAD_SEED');
    validatePrivateValues(values);
    return values;
  } catch { fail('SEED_VALIDATION_FAILED'); }
}

// All fields must come from an independently verified Windows handle/path/ACL
// adapter, NOT from seed text or a caller-supplied self-attestation file.
export function requireCustody(observed, approved) {
  const pathValid = (p) => typeof p === 'string' && /^[A-Z]:\\[^\x00-\x1f]+$/.test(p) &&
    !p.includes('/') && !p.includes('..') && !p.slice(2).includes(':') && !p.endsWith('\\');
  const stampValid = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && !Number.isNaN(Date.parse(s));
  if (!observed || !approved || !/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(approved.ownerApprovedCustodianSid ?? '') ||
      !pathValid(approved.physicalPath) || !pathValid(observed.physicalPath) ||
      !Number.isSafeInteger(approved.size) || approved.size < 1 || approved.size > 32768 ||
      !Number.isSafeInteger(observed.size) || !stampValid(approved.modified) || !stampValid(observed.modified) ||
      observed.ownerSid !== approved.ownerApprovedCustodianSid ||
      observed.physicalPath !== approved.physicalPath ||
      observed.logicalResolvesToPhysical !== true ||
      observed.sameFileId !== true || observed.reparseFree !== true ||
      observed.hardLinkCount !== 1 || observed.restrictiveReadWriteAcl !== true ||
      observed.size !== approved.size || observed.modified !== approved.modified ||
      observed.handleStable !== true || observed.directoryChainVerified !== true)
    fail('SOURCE_CUSTODY_UNVERIFIED');
  return true;
}

export function verifyPrivateCohort(rows, privateValues) {
  let key;
  try {
    key = b64(privateValues.BUYERMATCH_IDENTITY_KEY);
    if (key.length !== 32 || !Array.isArray(rows) || rows.length !== RECOVERY_SCOPE.count)
      fail('COHORT');
    const ids = new Set();
    for (const row of rows) {
      if (!row || row.synthetic !== true || typeof row.id !== 'string' ||
          !row.id || ids.has(row.id) || !/^[a-f0-9]{64}$/.test(row.identity_hash ?? '')) fail('COHORT');
      ids.add(row.id);
      const parts = row.identity_ciphertext?.split('.');
      if (parts?.length !== 3) fail('COHORT');
      const [iv, data, tag] = parts.map(b64);
      if (iv.length !== 12 || tag.length !== 16 || !data.length || data.length > 65536) fail('COHORT');
      const cipher = createDecipheriv('aes-256-gcm', key, iv);
      cipher.setAuthTag(tag);
      const clear = Buffer.concat([cipher.update(data), cipher.final()]);
      let identity;
      try { identity = JSON.parse(clear.toString('utf8')); }
      finally { clear.fill(0); }
      if (!identity || typeof identity.email !== 'string' || !identity.email.trim()) fail('COHORT');
      const expected = createHmac('sha256', key).update(identity.email.trim().toLowerCase()).digest();
      if (!timingSafeEqual(expected, Buffer.from(row.identity_hash, 'hex'))) fail('COHORT');
      identity = undefined;
    }
    return { verified: true, count: rows.length, syntheticOnly: true, allDecryptAndHashMatch: true };
  } catch { fail('COHORT_KEY_MATCH_FAILED'); }
  finally { key?.fill(0); }
}

export function requireScopeAndAbsentBindings(state) {
  if (!state || state.project !== RECOVERY_SCOPE.project || state.team !== RECOVERY_SCOPE.team ||
      state.ref !== RECOVERY_SCOPE.ref || state.protected !== true || state.freePlan !== true ||
      state.pausesVerified !== true || state.fallbackVerified !== true ||
      state.unchangedExistingBindings !== true || state.paginationComplete !== true ||
      !Array.isArray(state.envs) || state.envs.some((x) => SECRET_NAMES.includes(x.key)))
    fail('SCOPE_OR_BINDING_CONFLICT');
}

export function bindingReceipt(body, key, privateStrings = []) {
  const x = body?.created;
  if (body?.failed?.length || !x || x.key !== key || !/^[A-Za-z0-9_-]{1,100}$/.test(x.id ?? '') ||
      x.type !== 'sensitive' || JSON.stringify(x.target) !== '["preview"]' ||
      x.gitBranch || x.customEnvironmentIds?.length || !Number.isSafeInteger(x.updatedAt) || x.updatedAt <= 0)
    fail('CREATE_RESULT_UNKNOWN');
  const result = { key, id: x.id, type: x.type, target: ['preview'], updatedAt: x.updatedAt };
  const encoded = JSON.stringify(result);
  if (privateStrings.some((v) => typeof v === 'string' && v.length >= 16 && encoded.includes(v))) fail('CREATE_RESULT_UNKNOWN');
  return result;
}

// Provider adapter must use a pinned executable, fixed S2 endpoint and private
// JSON stdin. It may not print, log or return raw provider errors/responses.
// No rollback-delete or upsert is available here: any partial/unknown result stops.
export async function recoverExistingSecrets({ privateValues, rows, custody, approvedCustody, provider, journal }) {
  const receipts = [];
  let phase = 'custody';
  const privateStrings = Object.values(privateValues ?? {}).filter((v) => typeof v === 'string');
  try {
    requireCustody(custody, approvedCustody);
    validatePrivateValues(privateValues);
    phase = 'scope'; requireScopeAndAbsentBindings(await provider.readScope());
    phase = 'cohort'; const cohort = verifyPrivateCohort(rows, privateValues);
    phase = 'validated'; await journal({ phase, cohort, writesAttempted: 0 });
    for (const key of SECRET_NAMES) {
      phase = 'pre-create-' + key;
      // Fresh complete metadata and safeguards before EVERY create. Existing own
      // receipts may exist; all other named bindings are conflicts.
      const state = await provider.readScope();
      const ownIds = new Set(receipts.map((r) => r.id));
      for (const receipt of receipts) {
        const found = state.envs?.filter((e) => e.key === receipt.key);
        if (found?.length !== 1 || JSON.stringify(bindingReceipt({ created: found[0] }, receipt.key, privateStrings)) !== JSON.stringify(receipt))
          fail('BINDING_DRIFT');
      }
      requireScopeAndAbsentBindings({ ...state, envs: state.envs?.filter((e) => !ownIds.has(e.id)) });
      phase = 'create-' + key;
      await journal({ phase, outcome: 'PENDING_OR_UNKNOWN', receipts });
      const response = await provider.createOnly({ key, value: privateValues[key], type: 'sensitive', target: ['preview'] });
      const receipt = bindingReceipt(response, key, privateStrings);
      if (receipts.some((r) => r.id === receipt.id)) fail('CREATE_RESULT_UNKNOWN');
      receipts.push(receipt);
      phase = 'readback-' + key;
      const stateAfter = await provider.readScope();
      const matches = stateAfter.envs?.filter((e) => e.key === key);
      if (matches?.length !== 1 || JSON.stringify(bindingReceipt({ created: matches[0] }, key, privateStrings)) !== JSON.stringify(receipt))
        fail('CREATE_RESULT_UNKNOWN');
      await journal({ phase, outcome: 'VERIFIED_METADATA_ONLY', receipts });
    }
    phase = 'final-scope';
    const final = await provider.readScope();
    for (const receipt of receipts) {
      const matches = final.envs?.filter((e) => e.key === receipt.key);
      if (matches?.length !== 1 || JSON.stringify(bindingReceipt({ created: matches[0] }, receipt.key, privateStrings)) !== JSON.stringify(receipt)) fail('BINDING_DRIFT');
    }
    requireScopeAndAbsentBindings({ ...final, envs: final.envs?.filter((e) => !receipts.some((r) => r.id === e.id)) });
    await journal({ phase: 'complete', outcome: 'VERIFIED_METADATA_ONLY', receipts });
    return { verified: true, cohort, receipts, runtimeVerificationPending: true };
  } catch {
    const result = { verified: false, phase, outcome: phase.startsWith('create-') || phase.startsWith('readback-') ? 'UNKNOWN' : 'STOP', receipts, noAutomaticRetry: true };
    try { await journal(result); } catch { /* No new operations if evidence cannot persist. */ }
    return result;
  }
}
