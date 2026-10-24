import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTESTATION_PATH,
  captureS2Build,
} from '../server/buyermatch/s2-attestation.js';

export function writeS2BuildArtifact(env, root, now = new Date()) {
  const path = resolve(root, ATTESTATION_PATH);
  // Invalidate any old snapshot before validation; a failed/disabled build cannot
  // leave a valid snapshot from an earlier staging build behind.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ enabled: false }) + '\n');
  if (env.BM_S2_ATTESTATION_ENABLED !== 'true') return { enabled: false };
  const artifact = captureS2Build(env, now);
  writeFileSync(path, JSON.stringify(artifact) + '\n');
  return { enabled: true };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    writeS2BuildArtifact(
      process.env,
      resolve(fileURLToPath(new URL('..', import.meta.url))),
    );
  } catch {
    console.error(
      'S2 build attestation failed; no configuration values logged',
    );
    process.exitCode = 1;
  }
}
