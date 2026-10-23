import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runPinnedCli, cliJson } from '../../scripts/buyermatch-s2-process.mjs';
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const path = fileURLToPath(new URL('./s2-native-stderr.mjs', import.meta.url));
const r = await runPinnedCli({
  nodePath: process.execPath,
  nodeSha256: hash(process.execPath),
  entryPath: path,
  entrySha256: hash(path),
  args: [],
});
if (cliJson(r).synthetic !== true || r.stderr.length === 0) process.exit(2);
process.stdout.write('CORRECTED_STREAM_HANDLING_PASS');
