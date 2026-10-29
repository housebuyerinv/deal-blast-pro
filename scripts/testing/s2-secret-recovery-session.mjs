// No command-line entrypoint and no work on import. Only a separately authorized,
// hash-verified private invoker may call executeApprovedSession. No raw private
// object or provider error leaves that boundary.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { makeMvpProvider } from './s2-mvp-provider.mjs';
import { Buffer } from 'node:buffer';
import { privateJsonChild, createBindingOnlyWriter } from './s2-private-json-child.mjs';
import { parsePrivateSeed, requireCustody, recoverExistingSecrets, requireExactOperatorPins, requireRecoveryPacketAllowsExecution, RECOVERY_SCOPE as S } from './s2-secret-recovery-core.mjs';
import { verifyBindingMetadata } from './s2-mvp-binding-metadata.mjs';
const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export async function readPrivateStagingCohort(values, fetcher = fetch) {
  try {
    if (values.SUPABASE_URL !== S.url) throw Error();
    const pieces = values.SUPABASE_SERVICE_ROLE_KEY?.split('.');
    if (pieces?.length !== 3 || !pieces.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) throw Error();
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    if (claims.ref !== S.ref || claims.role !== 'service_role' || claims.iss !== 'supabase') throw Error();
    // Claim inspection prevents accidental cross-project credential transfer;
    // acceptance by the exact HTTPS staging service is the authority check.
    const r = await fetcher(S.url + '/rest/v1/bm_buyers?select=id,synthetic,identity_ciphertext,identity_hash&order=id.asc&limit=224', {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { apikey: values.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + values.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'count=exact' },
    });
    if (r.status !== 200 || r.redirected || r.headers.get('content-range') !== '0-222/223') throw Error();
    const reader = r.body.getReader(); let bytes = 0; const buffers = [];
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 1048576) { await reader.cancel(); throw Error(); }
        buffers.push(Buffer.from(chunk.value));
      }
      const data = Buffer.concat(buffers);
      try { return JSON.parse(data.toString('utf8')); }
      finally { data.fill(0); }
    } finally { for (const b of buffers) b.fill(0); }
  } catch { throw Error('STAGING_COHORT_READ_UNVERIFIED'); }
}

// scopeProvider is the reviewed existing provider, using the new live GET503
// readback instead of any secrets-list operation. It must have a pinned valid
// MVP plan with the CURRENT nine deployments, no controller launched yet.
export async function executeApprovedSession({ approval, directory }) {
  let phase = 'authorization'; let seed, privateValues, rows;
  let journal;
  try {
    if (approval?.actualHumanApprovalIndependentlyVerified !== true || !/^\d+$/.test(approval.commentId ?? '') ||
        !/^[a-f0-9]{40}$/.test(approval.packetCommit ?? '')) throw Error();
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 1048576 });
    if (git(['status','--porcelain']).trim()) throw Error();
    git(['merge-base','--is-ancestor',approval.packetCommit,'HEAD']);
    const packet = JSON.parse(git(['show',approval.packetCommit + ':docs/BUYERMATCH_S2_SECRET_RECOVERY_REQUEST.json']));
    const sourceRequest = packet.custody, toolPins = packet.toolPins;
    requireRecoveryPacketAllowsExecution(packet);
    if (packet.executionAllowedWithoutOwnerApproval !== false ||
        packet.source !== 'b99830596080eef2b24472e71bdcb061c855bf57' || packet.project !== S.project || packet.team !== S.team ||
        packet.additionalBudgetUsd !== 0) throw Error();
    if (JSON.stringify(packet.secretNames) !== '["BUYERMATCH_IDENTITY_KEY","BM_RESPONSE_SECRET","BM_WORKER_SECRET"]' ||
        !packet.operatorPins) throw Error();
    requireExactOperatorPins(packet.operatorPins);
    for (const [path, hash] of Object.entries(packet.operatorPins)) if (digest(path) !== hash) throw Error();
    if (dirname(resolve(directory)) !== resolve('artifacts/buyermatch-1b') || !/^s2-secret-recovery-[a-f0-9-]{36}$/.test(basename(directory))) throw Error();
    phase = 'private-journal';
    mkdirSync(directory); // Fails closed on an existing run; never overwrite evidence.
    const journalPath = resolve(directory, 'journal.jsonl');
    writeFileSync(journalPath, '', { flag: 'wx' });
    journal = async (v) => appendFileSync(journalPath, JSON.stringify(v) + '\n');
    const now = Date.now();
    const plan = { schema: 1, source: packet.source, project: packet.project, team: packet.team, alias: packet.alias,
      fallback: packet.rollbackDeployment, windowMs: 1800000, startedAt: now, discoveryDeadline: now + 600000,
      preexistingIds: packet.protectedDeploymentIds, runId: randomUUID(),
      operatorPins: Object.fromEntries(Object.entries(packet.operatorPins).map(([p,h]) => [resolve(p),h])) };
    const scopeProvider = makeMvpProvider(plan, directory); // No controller or routing mutation.
    const api = async (path) => privateJsonChild({ ...toolPins.vercel, args: ['api', path, '--scope', 'housebuyerinv', '--raw'], cwd: directory });
    const readScope = async () => {
      const [authority, pauses, fallback, free, body, inventory, domains, production] = await Promise.all([
        scopeProvider.verifyScopeAuthority(), scopeProvider.readSafetyState(), scopeProvider.readAlias(packet.alias),
        scopeProvider.readFreePlan(), api('/v10/projects/' + S.project + '/env?decrypt=false'),
        scopeProvider.readInventory(), scopeProvider.readProjectDomains(), api('/v4/aliases/deal-blast-pro.vercel.app'),
      ]);
      if (inventory.map((d) => d.uid ?? d.id).sort().join('|') !== [...packet.protectedDeploymentIds].sort().join('|') ||
          domains.length !== 0 || (production.deploymentId ?? production.deployment?.id) !== 'dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE')
        throw Error('ROUTING_OR_INVENTORY_DRIFT');
      // Preserve base allowlist; only the three separately checked recovery names
      // may be added. Their exact IDs/types/targets are verified by recovery core.
      verifyBindingMetadata({ ...body, envs: body.envs?.filter((e) => !packet.secretNames.includes(e.key)) });
      return {
        project: authority.project, team: authority.team, ref: S.ref,
        protected: pauses.protectionEnabled === true, freePlan: free.hobby === true && free.planKnown === true,
        pausesVerified: ['registrationPaused','checkoutPaused','liveBillingPaused','deliveryDisabled','stagingOnly','endpointDisabled','receiverPaused','protectionEnabled'].every((k) => pauses[k] === true),
        fallbackVerified: fallback.projectId === S.project && fallback.deploymentId === packet.rollbackDeployment,
        unchangedExistingBindings: true, paginationComplete: !body.pagination?.next, envs: body.envs,
      };
    };
    const { requireScopeAndAbsentBindings } = await import('./s2-secret-recovery-core.mjs');
    phase = 'scope-before-private-read'; requireScopeAndAbsentBindings(await readScope());
    phase = 'native-private-source';
    seed = await privateJsonChild({ ...toolPins.powershell, leadingArgs: ['-NoProfile','-NonInteractive','-File'], args: ['-PrivateApprovedRead'],
      input: { actualOwnerApprovalVerified: true, project: S.project, ownerSid: packet.ownerSid, custody: sourceRequest }, cwd: directory });
    requireCustody(seed.custody, sourceRequest);
    privateValues = parsePrivateSeed(seed.seedText); seed.seedText = undefined;
    phase = 'private-staging-cohort'; rows = await readPrivateStagingCohort(privateValues);
    phase = 'recovery-core';
    const result = await recoverExistingSecrets({ privateValues, rows, custody: seed.custody, approvedCustody: sourceRequest,
      provider: { readScope, createOnly: createBindingOnlyWriter({ ...toolPins.vercel, cwd: directory }) }, journal });
    if (result.verified) writeFileSync(resolve(directory, 'receipts.json'), JSON.stringify({ ...result, project: S.project, team: S.team,
      source: packet.source, approvalComment: approval.commentId, packetCommit: approval.packetCommit }) + '\n', { flag: 'wx' });
    return result;
  } catch {
    const result = { verified: false, phase, outcome: 'STOP_OR_UNKNOWN', noAutomaticRetry: true };
    try { await journal?.(result); } catch { /* Never continue after lost evidence. */ }
    return result;
  } finally { seed = undefined; privateValues = undefined; rows = undefined; }
}
