// No live invocation on import. Used only by an independently reviewed invoker.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { RECOVERY_SCOPE, SECRET_NAMES, bindingReceipt } from './s2-secret-recovery-core.mjs';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export async function privateJsonChild({ executable, executableHash, script, scriptHash, args, input, cwd, timeoutMs = 20000, maxBytes = 1048576, leadingArgs = [] }) {
  if (sha(executable) !== executableHash || sha(script) !== scriptHash || !Array.isArray(args) ||
      args.some((x) => typeof x !== 'string') || !['[]', '["-NoProfile","-NonInteractive","-File"]'].includes(JSON.stringify(leadingArgs)) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576)
    throw Error('PRIVATE_PROCESS_PREFLIGHT_FAILED');
  const envNames = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'OS']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => envNames.has(k.toUpperCase())));
  return new Promise((resolve, reject) => {
    let child, output = '', bytes = 0, stopped = false;
    const stop = () => { stopped = true; child?.kill(); };
    let timer;
    try {
      child = spawn(executable, [...leadingArgs, script, ...args], { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      timer = setTimeout(stop, timeoutMs);
      child.stdin.on('error', stop);
      child.stdout.on('data', (b) => { bytes += b.length; if (bytes > maxBytes) stop(); else output += b; });
      child.stderr.on('data', (b) => { bytes += b.length; if (bytes > maxBytes) stop(); }); // Discard, never log.
      child.once('error', () => { clearTimeout(timer); reject(Error('PRIVATE_PROCESS_FAILED')); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (stopped || code !== 0) { output = ''; reject(Error('PRIVATE_PROCESS_FAILED')); return; }
        try { const result = JSON.parse(output); output = ''; resolve(result); }
        catch { output = ''; reject(Error('PRIVATE_PROCESS_FAILED')); }
      });
      child.stdin.end(JSON.stringify(input));
    } catch { clearTimeout(timer); stop(); reject(Error('PRIVATE_PROCESS_FAILED')); }
  });
}

export function createBindingOnlyWriter(pins) {
  return async (body) => {
    if (Object.keys(body ?? {}).sort().join(',') !== 'key,target,type,value' ||
        !SECRET_NAMES.includes(body.key) || body.type !== 'sensitive' ||
        JSON.stringify(body.target) !== '["preview"]' || typeof body.value !== 'string')
      throw Error('CREATE_SCOPE_DENIED');
    const args = ['api', '/v10/projects/' + RECOVERY_SCOPE.project + '/env?teamId=' + RECOVERY_SCOPE.team,
      '--method', 'POST', '--input', '-', '--scope', 'housebuyerinv', '--raw'];
    let result;
    try {
      result = await privateJsonChild({ ...pins, args, input: body });
      return { created: bindingReceipt(result, body.key, [body.value]) };
    } catch { throw Error('CREATE_RESULT_UNKNOWN'); }
    finally { result = undefined; }
  };
}
