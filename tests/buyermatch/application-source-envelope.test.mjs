import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APPLICATION_SOURCE, ISOLATED_DERIVATIVE, LATER_MIGRATIONS,
  createApplicationSourceEnvelope } from '../../scripts/testing/buyermatch-source-envelope.mjs';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const envelope = createApplicationSourceEnvelope({ repo });

test('envelope hashes exact approved blobs and distinguishes app from isolated derivative', () => {
  assert.equal(envelope.source, APPLICATION_SOURCE);
  assert.equal(envelope.isolatedDerivative, ISOLATED_DERIVATIVE);
  assert.notEqual(envelope.source, envelope.isolatedDerivative);
  const file = envelope.files.find(file => file.path === 'server/buyermatch/staging.js');
  const bytes = execFileSync('git', ['show', `${APPLICATION_SOURCE}:${file.path}`], { cwd: repo });
  assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(file.bytes, bytes.length);
  assert.equal(envelope.sourceInventoryDigest,
    createHash('sha256').update(JSON.stringify(envelope.files)).digest('hex'));
  assert.deepEqual(envelope.derivativeApplicationDelta, []);
});
test('inventories all four later migrations without importing mutable forward-manifest authority', () => {
  assert.deepEqual(envelope.pendingS2Inventory.map(file => file.path), [...LATER_MIGRATIONS]);
  assert(envelope.pendingS2Inventory.every(file => file.applyAuthorized === false && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.equal(envelope.productionMigrationDisposition.unrelatedForwardManifestUsed, false);
  assert.equal(envelope.productionMigrationDisposition.blanketDbPushAllowed, false);
  assert.equal(envelope.productionMigrationDisposition.historyRepairIsNotExecutionEvidence, true);
});
test('no source preparation result permits production execution, activation or publication', () => {
  assert.equal(envelope.executionAllowed, false); assert.equal(envelope.pushAllowed, false);
  assert.equal(envelope.compiledArtifact, false); assert.equal(envelope.credentialsIncluded, false);
  assert.equal(envelope.runtime.productionRuntimeVerified, false);
  assert.equal(envelope.runtime.independentProductionBillingDeliveryResponseGatesImplemented, true);
  assert.equal(envelope.runtime.productionRuntimeState, 'IMPLEMENTED_GUARDED_NOT_HOSTED_VERIFIED_UNBOUND');
  assert.equal(envelope.runtime.stagingHelperRejectsProductionEnvironment, true);
  assert.equal(envelope.runtime.mandatoryPausedOverrides.BM_CHECKOUT_ENABLED, 'false');
  assert.equal(envelope.runtime.mandatoryPausedOverrides.BM_LIVE_DELIVERY_ENABLED, 'false');
  assert.equal(envelope.runtime.mandatoryPausedOverrides.BM_DELIVERY_MODE, 'disabled');
  assert.equal(envelope.runtime.mandatoryPausedOverrides.DBP_REGISTRATION_PAUSED, 'true');
  assert.equal(envelope.publication.anyOtherBranchSafeToPublish, false);
  assert(!Object.hasOwn(envelope, 'commands'));
  assert(!envelope.files.some(file => file.path.startsWith('isolated-billing/') || file.path.includes('.env')));
});
test('rejects moving HEAD, derivative substitution and relative repository input', () => {
  for (const source of ['HEAD', ISOLATED_DERIVATIVE, 'a'.repeat(40)])
    assert.throws(() => createApplicationSourceEnvelope({ repo, source }));
  assert.throws(() => createApplicationSourceEnvelope({ repo: '.' }));
});
