import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

// Resolve/fingerprint node.exe and the CLI JS entrypoint before invoking. No shell,
// .cmd, PowerShell redirection, interpolated commands, tokens or secrets in argv.
export async function runPinnedCli({
  nodePath,
  nodeSha256,
  entryPath,
  entrySha256,
  args,
  timeoutMs = 10000,
  maxBytes = 1048576,
}) {
  const hash = (p) =>
    createHash('sha256').update(readFileSync(p)).digest('hex');
  if (
    !isAbsolute(nodePath) ||
    !isAbsolute(entryPath) ||
    hash(nodePath) !== nodeSha256 ||
    hash(entryPath) !== entrySha256 ||
    !Array.isArray(args) ||
    args.some(
      (a) =>
        typeof a !== 'string' ||
        /[\r\n\0]/.test(a) ||
        /(?:sk|rk)_(?:live|test)_|--token|Bearer /i.test(a),
    ) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1
  )
    throw Error('Pinned CLI invocation rejected');
  return new Promise((resolve) => {
    let child,
      settled = false,
      timer,
      size = 0,
      stdout = '',
      stderr = '';
    const finish = (status, exitCode = null, signal = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, exitCode, signal, stdout, stderr });
    };
    try {
      child = spawn(nodePath, [entryPath, ...args], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      finish('spawn-error');
      return;
    }
    const collect = (which, b) => {
      size += b.length;
      if (size > maxBytes) {
        child.kill();
        finish('output-limit');
        return;
      }
      if (which === 'out') stdout += b.toString('utf8');
      else stderr += b.toString('utf8');
    };
    child.stdout.on('data', (b) => collect('out', b));
    child.stderr.on('data', (b) => collect('err', b));
    child.once('error', () => finish('spawn-error'));
    child.once('close', (code, signal) => finish('exited', code, signal));
    timer = setTimeout(() => {
      child.kill();
      finish('timeout');
    }, timeoutMs);
  });
}
// Raw stdout/stderr remain private in memory. Durable evidence contains only status/length/digests.
export function commandEvidence(result) {
  const digest = (s) =>
    createHash('sha256')
      .update(s || '')
      .digest('hex');
  return {
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    stdoutBytes: Buffer.byteLength(result.stdout || ''),
    stderrBytes: Buffer.byteLength(result.stderr || ''),
    stdoutSha256: digest(result.stdout),
    stderrSha256: digest(result.stderr),
  };
}
export function cliJson(result) {
  if (
    result.status !== 'exited' ||
    result.exitCode !== 0 ||
    result.signal !== null
  )
    throw Error('CLI command did not complete successfully');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw Error('CLI JSON output invalid');
  }
}
