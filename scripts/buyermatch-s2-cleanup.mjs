import { z } from 'zod';
import { S2_RELEASE as S2 } from './buyermatch-s2-release.mjs';

const protectedIds = new Set([
  'dpl_nr5RVunmUGdryPUtWkRkVdsA96pT',
  'dpl_Cp9qXVBXtSGozPRKQ7p3atTCF7Hi',
  'dpl_EBYBJZS7Q9Gqmvwdk8Ay3RM6C1PE',
]);
const inflight = new Map();
const id = z.string().regex(/^dpl_[A-Za-z0-9]+$/);
const receiptSchema = z
  .object({
    runId: z.string().uuid(),
    deploymentId: id,
    source: z.literal(S2.source),
    project: z.literal(S2.project),
    team: z.literal(S2.team),
    preexistingDeploymentIds: z.array(id).min(1),
    fallbackId: z.literal(S2.fallback),
    alias: z.literal(new URL(S2.origin).hostname),
  })
  .strict();
function receipt(input, approvedSource = S2.source) {
  if (!/^[a-f0-9]{40}$/.test(approvedSource || ''))
    throw Error('Reviewed cleanup source pin required; no operations');
  const p = receiptSchema
    .extend({ source: z.literal(approvedSource) })
    .safeParse(input);
  if (
    !p.success ||
    p.data.preexistingDeploymentIds.includes(p.data.deploymentId) ||
    protectedIds.has(p.data.deploymentId) ||
    p.data.deploymentId === p.data.fallbackId ||
    !p.data.preexistingDeploymentIds.includes(p.data.fallbackId)
  )
    throw Error('Cleanup ownership receipt invalid; no operations');
  return p.data;
}
function exact(d, r) {
  return (
    d?.id === r.deploymentId &&
    d.projectId === r.project &&
    d.ownerId === r.team &&
    d.target === null &&
    d.meta?.githubCommitSha === r.source &&
    d.meta?.s2RunId === r.runId
  );
}
function absent(d, r) {
  return (
    d?.kind === 'not-found' &&
    d.httpStatus === 404 &&
    d.deploymentId === r.deploymentId
  );
}
async function bounded(fn, ms) {
  const abort = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => fn(abort.signal))
        .then(
          (value) => ({ status: 'ok', value }),
          () => ({ status: 'error' }),
        ),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          abort.abort();
          resolve({ status: 'timeout' });
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
// Adapters must enforce the fixed provider scope, use structured status (not CLI
// prose), honor AbortSignal, and never reopen a gate. No default/private adapters.
export async function closeS2Run(
  input,
  adapter,
  {
    timeoutMs = 10000,
    journal = async () => {},
    approvedSource = S2.source,
  } = {},
) {
  const r = receipt(input, approvedSource);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw Error('Cleanup deadline invalid');
  for (const k of [
    'verifyAuthority',
    'disableEndpoint',
    'pauseReceiver',
    'readSafetyState',
    'readAlias',
    'readDeployment',
    'restoreAlias',
    'removeDeployment',
  ])
    if (typeof adapter?.[k] !== 'function')
      throw Error('Cleanup adapter missing; no operations');
  const key = r.deploymentId;
  if (inflight.has(key)) {
    const active = inflight.get(key);
    if (active.runId !== r.runId) throw Error('Conflicting cleanup run');
    return active.promise;
  }
  const work = async () => {
    const steps = [];
    let journalFailed = false;
    const record = async (stage, status) => {
      steps.push({ stage, status });
      try {
        const j = await bounded(
          () =>
            journal({
              runId: r.runId,
              deploymentId: r.deploymentId,
              stage,
              status,
            }),
          timeoutMs,
        );
        if (j.status !== 'ok') journalFailed = true;
      } catch {
        journalFailed = true;
      }
    };
    const op = async (stage, fn) => {
      await record(stage, 'started');
      const result = await bounded(fn, timeoutMs);
      await record(stage, result.status);
      return result;
    };
    const authority = await op('authority', (s) => adapter.verifyAuthority(s));
    if (
      authority.status !== 'ok' ||
      authority.value?.project !== r.project ||
      authority.value?.team !== r.team ||
      authority.value?.account !== S2.account ||
      authority.value?.livemode !== false
    )
      return { verified: false, operatorRequired: true, steps };
    // Neither failure nor timeout suppresses the other containment operation.
    await Promise.all([
      op('endpoint-disable', (s) => adapter.disableEndpoint(S2.endpoint, s)),
      op('receiver-pause', (s) => adapter.pauseReceiver(S2.staging, s)),
    ]);
    const alias = await op('alias-read', (s) => adapter.readAlias(r.alias, s));
    let routingSafe = false;
    if (alias.status === 'ok' && alias.value?.projectId === r.project) {
      if (alias.value.deploymentId === r.fallbackId) routingSafe = true;
      else if (alias.value.deploymentId === r.deploymentId) {
        const fallback = await op('fallback-read', (s) =>
          adapter.readDeployment(r.fallbackId, s),
        );
        const f = fallback.value;
        if (
          fallback.status === 'ok' &&
          f?.kind === 'found' &&
          f.id === r.fallbackId &&
          f.projectId === r.project &&
          f.ownerId === r.team &&
          f.target === null &&
          f.readyState === 'READY' &&
          f.registrationPaused === true &&
          f.checkoutPaused === true &&
          f.protectionEnabled === true
        ) {
          await op('alias-restore', (s) =>
            adapter.restoreAlias(r.alias, r.fallbackId, r.deploymentId, s),
          );
          const reread = await op('alias-verify', (s) =>
            adapter.readAlias(r.alias, s),
          );
          routingSafe =
            reread.status === 'ok' &&
            reread.value?.projectId === r.project &&
            reread.value.deploymentId === r.fallbackId;
        }
      }
    }
    const before = await op('deployment-read', (s) =>
      adapter.readDeployment(r.deploymentId, s),
    );
    let removed = before.status === 'ok' && absent(before.value, r);
    if (
      !removed &&
      routingSafe &&
      before.status === 'ok' &&
      before.value?.kind === 'found' &&
      exact(before.value, r) &&
      Array.isArray(before.value.alias) &&
      before.value.alias.length === 0
    ) {
      await op('deployment-remove', (s) =>
        adapter.removeDeployment(r.deploymentId, s),
      );
      const after = await op('deployment-verify', (s) =>
        adapter.readDeployment(r.deploymentId, s),
      );
      removed = after.status === 'ok' && absent(after.value, r);
    }
    const safety = await op('safety-read', (s) => adapter.readSafetyState(s));
    const fields = [
      'endpointDisabled',
      'receiverPaused',
      'registrationPaused',
      'checkoutPaused',
      'liveBillingPaused',
      'deliveryDisabled',
      'protectionEnabled',
    ];
    const safe =
      safety.status === 'ok' && fields.every((k) => safety.value?.[k] === true);
    // A late/failed mutation remains an error even if a read happens to be safe.
    const operationsClean = steps.every(
      (s) => s.status === 'started' || s.status === 'ok',
    );
    const verified =
      safe && removed && routingSafe && operationsClean && !journalFailed;
    await record('complete', verified ? 'verified' : 'operator-required');
    return {
      verified: verified && !journalFailed,
      operatorRequired: !verified || journalFailed,
      receiverPaused: safety.value?.receiverPaused === true,
      endpointDisabled: safety.value?.endpointDisabled === true,
      routingSafe,
      temporaryDeploymentGone: removed,
      journalFailed,
      steps,
    };
  };
  const promise = work();
  inflight.set(key, { runId: r.runId, promise });
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// Run in an independently supervised process with private provider adapters.
// Resolves on deadline or explicit close. Process death itself is not success.
export function armS2Cleanup(
  input,
  adapter,
  { deadlineMs = 900000, ...options } = {},
) {
  receipt(input, options.approvedSource);
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 900000)
    throw Error('Watchdog deadline invalid');
  let finish;
  const trigger = new Promise((resolve) => {
    finish = resolve;
  });
  const timer = setTimeout(finish, deadlineMs);
  const completion = trigger
    .then(() => closeS2Run(input, adapter, options))
    .finally(() => clearTimeout(timer));
  return { completion, close: () => finish() };
}
