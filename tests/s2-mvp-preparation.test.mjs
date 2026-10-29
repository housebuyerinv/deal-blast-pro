import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  pins,
  verifyBindingMetadata,
} from '../scripts/testing/s2-mvp-binding-metadata.mjs';

const valid = () => ({
  envs: Object.entries(pins).map(([key, p]) => ({
    key,
    ...p,
    target: ['preview'],
  })),
});
test('unchanged Preview-only binding identities pass without reading values', () => {
  const r = verifyBindingMetadata(valid());
  assert.equal(r.metadataContinuityVerified, true);
  assert.equal(r.secretValuesRead, false);
});
for (const [name, mutate] of [
  ['missing', (x) => x.envs.pop()],
  ['duplicate', (x) => x.envs.push(x.envs[0])],
  ['timestamp drift', (x) => x.envs[0].updatedAt++],
  ['identity drift', (x) => (x.envs[0].id = 'other')],
  ['type drift', (x) => (x.envs[0].type = 'plain')],
  ['Production scope', (x) => x.envs[0].target.push('production')],
  ['branch override', (x) => (x.envs[0].gitBranch = 'other')],
  ['unknown credential', (x) => x.envs.push({ key: 'RESEND_API_KEY' })],
  ['incomplete page', (x) => (x.pagination = { next: 2 })],
])
  test('binding metadata rejects ' + name, () => {
    const x = valid();
    mutate(x);
    assert.throws(() => verifyBindingMetadata(x));
  });

test('missing approval acknowledgement and consumed approval stop before workspace/provider operations', () => {
  const cwd = mkdtempSync(join(tmpdir(), 's2-preparation-no-approval-'));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) =>
        ['SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP'].includes(
          k.toUpperCase(),
        ),
      ),
    );
    for (const args of [
      [],
      ['--execute-after-owner-approval', '6399713964', 'a'.repeat(40)],
    ]) {
      const r = spawnSync(
        process.execPath,
        [resolve('scripts/testing/s2-mvp-preparer.mjs'), ...args],
        { cwd, env, encoding: 'utf8', timeout: 5000 },
      );
      assert.equal(r.status, 2);
      assert.equal(r.stdout, 'PENDING_OWNER_APPROVAL_NO_PROVIDER_OPERATIONS\n');
      assert.equal(r.stderr, '');
      assert.deepEqual(readdirSync(cwd), []);
    }
  } finally {
    rmdirSync(cwd);
  }
});
