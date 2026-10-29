// Key-free preparation library. No filesystem, environment, network, provider or
// decryption operations. A separately authorized private invoker supplies rows.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const MAX_ROWS = 10000;
const MAX_CIPHERTEXT_BYTES = 65536;
const fail = () => { throw Error('RECOVERY_ENVELOPE_INPUT_INVALID'); };
function envelopeValid(value) {
  if (typeof value !== 'string' || value.length > 100000) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const decoded = [];
  try {
    for (const part of parts) {
      if (!part.length || part.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(part)) return false;
      const bytes = Buffer.from(part, 'base64');
      decoded.push(bytes);
      if (bytes.toString('base64') !== part) return false;
    }
    return decoded[0].length === 12 && decoded[1].length > 0 &&
      decoded[1].length <= MAX_CIPHERTEXT_BYTES && decoded[2].length === 16;
  } finally {
    // These are opaque ciphertext/IV/tag bytes, never decrypted identities.
    for (const bytes of decoded) bytes.fill(0);
  }
}

function auditEnvelopes(rows, { expectedIdentities = 223, expectedProvenance = 9 } = {}) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS ||
      ![expectedIdentities, expectedProvenance].every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_ROWS)) fail();
  const ids = new Set();
  const projection = [];
  let invalidIdentityEnvelopes = 0, invalidProvenanceEnvelopes = 0;
  let provenance = 0, nonstandardHashes = 0;
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 128 ||
        [...row.id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        ids.has(row.id) || typeof row.synthetic !== 'boolean' ||
        typeof row.identity_ciphertext !== 'string' || row.identity_ciphertext.length > 100000 ||
        typeof row.identity_hash !== 'string' || row.identity_hash.length > 1024 ||
        !(row.source_ciphertext === null || typeof row.source_ciphertext === 'string') ||
        (typeof row.source_ciphertext === 'string' && row.source_ciphertext.length > 100000)) fail();
    ids.add(row.id);
    if (!envelopeValid(row.identity_ciphertext)) invalidIdentityEnvelopes++;
    if (!/^[a-f0-9]{64}$/.test(row.identity_hash)) nonstandardHashes++;
    if (row.source_ciphertext !== null) {
      provenance++;
      if (!envelopeValid(row.source_ciphertext)) invalidProvenanceEnvelopes++;
    }
    // Preserve exact encodings and nonstandard hashes; never repair/normalize data.
    projection.push([row.id, row.synthetic, row.identity_hash, row.identity_ciphertext, row.source_ciphertext]);
  }
  projection.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const fingerprint = createHash('sha256').update(JSON.stringify(projection)).digest('hex');
  const countsMatch = rows.length === expectedIdentities && provenance === expectedProvenance;
  const formatsValid = invalidIdentityEnvelopes === 0 && invalidProvenanceEnvelopes === 0;
  return {
    schema: 'buyermatch-recovery-envelope-audit-v1', fingerprint,
    identities: rows.length, provenance, expectedIdentities, expectedProvenance,
    countsMatch, formatsValid, invalidIdentityEnvelopes, invalidProvenanceEnvelopes, nonstandardHashes,
    status: !countsMatch || !formatsValid ? 'BLOCKED_STRUCTURE_OR_COUNTS' :
      nonstandardHashes ? 'ORIGINAL_HASH_COMPATIBILITY_REVIEW_REQUIRED' : 'KEY_COMPATIBILITY_NOT_TESTED',
    keyCustodyVerified: false, decryptionVerified: false, originalHashCompatibilityVerified: false,
    restoreVerified: false, productionReady: false,
  };
}

export function auditRecoveryEnvelopes(rows, options) {
  try { return auditEnvelopes(rows, options); }
  catch { fail(); }
}

function requireUnchanged(before, after) {
  if (![before, after].every(x => x?.schema === 'buyermatch-recovery-envelope-audit-v1' &&
      /^[a-f0-9]{64}$/.test(x.fingerprint || '') && x.countsMatch === true && x.formatsValid === true) ||
      before.expectedIdentities !== after.expectedIdentities || before.expectedProvenance !== after.expectedProvenance ||
      before.identities !== after.identities || before.provenance !== after.provenance ||
      before.nonstandardHashes !== after.nonstandardHashes || before.fingerprint !== after.fingerprint) {
    throw Error('RECOVERY_ENVELOPE_PRESERVATION_UNVERIFIED');
  }
  return { unchanged: true, selectedEncryptedFieldsOnly: true, recoveryVerified: false };
}

export function requireUnchangedRecoveryEnvelopes(before, after) {
  try { return requireUnchanged(before, after); }
  catch { throw Error('RECOVERY_ENVELOPE_PRESERVATION_UNVERIFIED'); }
}
