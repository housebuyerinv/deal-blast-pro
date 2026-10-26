// Fixed public dummy bytes only. No real key generation, environment inventory,
// provider access, credential files, or application/database changes.
import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import {
  encryptIdentity,
  decryptIdentity,
  identityHash,
} from "../../server/buyermatch/security.js";
const ORIGINAL_DUMMY = Buffer.alloc(32, 17).toString("base64");
const DIFFERENT_DUMMY = Buffer.alloc(32, 34).toString("base64");
const identity = {
  name: "SYNTHETIC",
  email: "preservation@example.invalid",
  phone: "000",
  company: "QA",
};

test("actual identity helper encrypts both identity and source payload with the same configured key", () => {
  process.env.BUYERMATCH_IDENTITY_KEY = ORIGINAL_DUMMY;
  const source = {
    row: { email: identity.email },
    mapping: { email: "email" },
    notes: "SYNTHETIC",
    importedAt: "2026-10-26",
  };
  const encryptedIdentity = encryptIdentity(identity),
    encryptedSource = encryptIdentity(source);
  assert.equal(encryptedIdentity.split(".").length, 3);
  assert.deepEqual(decryptIdentity(encryptedIdentity), identity);
  assert.deepEqual(decryptIdentity(encryptedSource), source);
  process.env.BUYERMATCH_IDENTITY_KEY = DIFFERENT_DUMMY;
  assert.throws(() => decryptIdentity(encryptedIdentity));
  assert.throws(() => decryptIdentity(encryptedSource));
});

test("switching configured key changes identity HMAC but preserving ciphertext permits original-key restoration", () => {
  process.env.BUYERMATCH_IDENTITY_KEY = ORIGINAL_DUMMY;
  const stored = encryptIdentity(identity),
    snapshot = stored,
    originalHash = identityHash(identity.email);
  process.env.BUYERMATCH_IDENTITY_KEY = DIFFERENT_DUMMY;
  assert.notEqual(identityHash(identity.email), originalHash);
  assert.throws(() => decryptIdentity(stored));
  assert.equal(stored, snapshot);
  process.env.BUYERMATCH_IDENTITY_KEY = ORIGINAL_DUMMY;
  assert.deepEqual(decryptIdentity(stored), identity);
  assert.equal(identityHash(identity.email), originalHash);
});

test("three-part ciphertext and valid hash lengths do not prove one-key cohort compatibility", () => {
  process.env.BUYERMATCH_IDENTITY_KEY = ORIGINAL_DUMMY;
  const first = encryptIdentity(identity),
    firstHash = identityHash(identity.email);
  process.env.BUYERMATCH_IDENTITY_KEY = DIFFERENT_DUMMY;
  const second = encryptIdentity(identity),
    secondHash = identityHash(identity.email);
  assert.equal(first.split(".").length, second.split(".").length);
  assert.equal(firstHash.length, 64);
  assert.equal(secondHash.length, 64);
  assert.notEqual(firstHash, secondHash);
  assert.throws(() => decryptIdentity(first));
  assert.deepEqual(decryptIdentity(second), identity);
});

test.after(() => {
  delete process.env.BUYERMATCH_IDENTITY_KEY;
});
