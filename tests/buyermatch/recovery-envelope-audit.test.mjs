import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { auditRecoveryEnvelopes, requireUnchangedRecoveryEnvelopes } from '../../scripts/testing/recovery-envelope-audit.mjs';

// Disposable keys only in memory, never original keys or production/S2 payloads.
function fixture() {
  const key = randomBytes(32);
  const encrypt = value => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    return [iv, Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]), cipher.getAuthTag()]
      .map(bytes => bytes.toString('base64')).join('.');
  };
  try {
    return Array.from({ length: 223 }, (_, i) => ({
      id: 'SYNTHETIC-' + i, synthetic: true,
      identity_ciphertext: encrypt({ email: 'synthetic-' + i + '@example.invalid' }),
      identity_hash: i < 8 ? 'SYNTHETIC-LEGACY-HASH-' + i :
        createHmac('sha256', key).update('synthetic-' + i + '@example.invalid').digest('hex'),
      source_ciphertext: i < 9 ? encrypt({ synthetic: true, source: 'fixture' }) : null,
    }));
  } finally { key.fill(0); }
}

test('all synthetic envelopes/counts are inventoried, nonstandard hashes retained without recovery claims', () => {
  const rows = fixture(), before = structuredClone(rows), report = auditRecoveryEnvelopes(rows);
  assert.equal(report.identities, 223); assert.equal(report.provenance, 9);
  assert.equal(report.nonstandardHashes, 8); assert.equal(report.countsMatch, true);
  assert.equal(report.formatsValid, true); assert.equal(report.status, 'ORIGINAL_HASH_COMPATIBILITY_REVIEW_REQUIRED');
  for (const name of ['keyCustodyVerified','decryptionVerified','originalHashCompatibilityVerified','restoreVerified','productionReady'])
    assert.equal(report[name], false);
  assert.deepEqual(rows, before);
  const output = JSON.stringify(report);
  for (const value of [rows[0].id, rows[0].identity_hash, rows[0].identity_ciphertext, rows[0].source_ciphertext])
    assert.equal(output.includes(value), false);
});

test('fingerprint is order-independent and proves selected-field preservation only', () => {
  const rows = fixture();
  const report = auditRecoveryEnvelopes(rows), reordered = auditRecoveryEnvelopes([...rows].reverse());
  assert.deepEqual(requireUnchangedRecoveryEnvelopes(report, reordered),
    { unchanged: true, selectedEncryptedFieldsOnly: true, recoveryVerified: false });
});

test('validly shaped ciphertext tampering is preserved as evidence drift, not accepted as authenticated', () => {
  const rows = fixture(), before = auditRecoveryEnvelopes(rows);
  const parts = rows[0].identity_ciphertext.split('.');
  const data = Buffer.from(parts[1], 'base64'); data[0] ^= 1; parts[1] = data.toString('base64');
  rows[0].identity_ciphertext = parts.join('.');
  const after = auditRecoveryEnvelopes(rows);
  assert.equal(after.formatsValid, true); assert.equal(after.decryptionVerified, false);
  assert.throws(() => requireUnchangedRecoveryEnvelopes(before, after), /PRESERVATION_UNVERIFIED/);
});

test('source removal, key-free hash rewrites and synthetic-flag changes all fail preservation', () => {
  const original = fixture(), before = auditRecoveryEnvelopes(original);
  for (const edit of [rows => rows[0].source_ciphertext = null,
    rows => rows[0].identity_hash = 'a'.repeat(64), rows => rows[0].synthetic = false]) {
    const rows = structuredClone(original); edit(rows);
    assert.throws(() => requireUnchangedRecoveryEnvelopes(before, auditRecoveryEnvelopes(rows)), /PRESERVATION_UNVERIFIED/);
  }
});

test('missing/extra identity or provenance records never yield a valid preservation receipt', () => {
  const rows = fixture(), good = auditRecoveryEnvelopes(rows);
  for (const changed of [rows.slice(1), [...rows, { ...rows[0], id: 'SYNTHETIC-extra' }],
    rows.map((x, i) => i === 10 ? { ...x, source_ciphertext: rows[0].source_ciphertext } : x)]) {
    const report = auditRecoveryEnvelopes(changed); assert.equal(report.countsMatch, false);
    assert.throws(() => requireUnchangedRecoveryEnvelopes(good, report), /PRESERVATION_UNVERIFIED/);
  }
});

test('malformed, noncanonical, oversize IV/tag/data and empty provenance are classified without values', () => {
  const original = fixture();
  for (const edit of [row => row.identity_ciphertext += '.extra',
    row => row.identity_ciphertext = 'not-base64',
    row => row.identity_ciphertext = [Buffer.alloc(11),Buffer.alloc(1),Buffer.alloc(16)].map(x => x.toString('base64')).join('.'),
    row => row.identity_ciphertext = [Buffer.alloc(12),Buffer.alloc(1),Buffer.alloc(15)].map(x => x.toString('base64')).join('.'),
    row => row.identity_ciphertext = [Buffer.alloc(12),Buffer.alloc(65537),Buffer.alloc(16)].map(x => x.toString('base64')).join('.'),
    row => row.source_ciphertext = '']) {
    const rows = structuredClone(original); edit(rows[0]);
    const report = auditRecoveryEnvelopes(rows);
    assert.equal(report.formatsValid, false); assert.equal(report.status, 'BLOCKED_STRUCTURE_OR_COUNTS');
  }
  const rows = fixture(); rows[0].identity_ciphertext = 'AAAAAAAAAAAAAAAA.AB==.AAAAAAAAAAAAAAAAAAAAAA==';
  assert.equal(auditRecoveryEnvelopes(rows).formatsValid, false); // Nonzero base64 pad bits.
});

test('duplicate/missing/type-invalid inputs produce bounded generic diagnostics', () => {
  const original = fixture();
  for (const edit of [rows => rows[1].id = rows[0].id, rows => delete rows[0].source_ciphertext,
    rows => rows[0].identity_hash = null, rows => rows[0].synthetic = 'true',
    rows => rows[0].identity_ciphertext = 'x'.repeat(100001)]) {
    const rows = structuredClone(original); edit(rows);
    assert.throws(() => auditRecoveryEnvelopes(rows), /^Error: RECOVERY_ENVELOPE_INPUT_INVALID$/);
  }
  assert.throws(() => auditRecoveryEnvelopes(original, {expectedIdentities:-1}), /INPUT_INVALID/);
});

test('unexpected private-reader errors never escape with private diagnostic text', () => {
  const rows = fixture();
  Object.defineProperty(rows[0], 'identity_hash', {get() { throw Error('SYNTHETIC-PRIVATE-READER-DETAIL'); }});
  assert.throws(() => auditRecoveryEnvelopes(rows), /^Error: RECOVERY_ENVELOPE_INPUT_INVALID$/);
  const report = {get schema() { throw Error('SYNTHETIC-PRIVATE-READER-DETAIL'); }};
  assert.throws(() => requireUnchangedRecoveryEnvelopes(report, report), /^Error: RECOVERY_ENVELOPE_PRESERVATION_UNVERIFIED$/);
});
