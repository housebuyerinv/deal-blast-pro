import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { runS2Denials, type DenialCheck, type DenialPlan, type DenialResult } from '../../lib/s2DenialVerification';

export default function S2DenialVerification({ authenticated, authEpoch, isCurrentAuth }: {
  authenticated: boolean; authEpoch: number; isCurrentAuth: () => boolean;
}) {
  const [source, setSource] = useState(''), [deploymentId, setDeployment] = useState('');
  const [runId, setRun] = useState(''), [deadline, setDeadline] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DenialResult | null>(null), [checks, setChecks] = useState<DenialCheck[]>([]);
  const attempted = useRef(false), active = useRef<AbortController | null>(null);
  useEffect(() => {
    setConfirmed(false);
    return () => active.current?.abort();
  }, [authenticated, authEpoch]);
  async function run() {
    if (!authenticated || !confirmed || attempted.current || !isCurrentAuth()) return;
    attempted.current = true;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setResult(null);
    const expiresAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(deadline) ? Date.parse(deadline) : NaN;
    const plan: DenialPlan = { source, deploymentId, runId, expiresAt };
    const receipt = await runS2Denials({ plan, origin: window.location.origin,
      backend: import.meta.env.VITE_SUPABASE_URL, confirmed: true, client: supabase,
      currentUser: () => useAppStore.getState().user?.id,
      isCurrent: () => isCurrentAuth() && active.current === controller,
      signal: controller.signal,
      progress: value => { if (!controller.signal.aborted) setChecks(value); },
    });
    if (!controller.signal.aborted) { setResult(receipt); setChecks(receipt.checks); setBusy(false); }
  }
  const visibleStatus = !authenticated && attempted.current ? 'UNVERIFIED' : busy ? 'CHECKING' : result?.status ?? 'NOT_TESTED';
  const locked = !authenticated || attempted.current;
  return <section aria-labelledby="s2-denial-heading" className="space-y-3 rounded border p-4">
    <h2 id="s2-denial-heading" className="text-lg font-semibold">Bounded S2 payment-free denial tests</h2>
    <p>Operator use only after separate hosted-test authorization and independent watchdog verification. Use the approved public run identifiers below—never credentials. Authentication alone does not authorize these tests.</p>
    <label className="block">Approved source SHA<input className="block w-full rounded border bg-transparent p-2" value={source} maxLength={40} disabled={locked} onChange={e => setSource(e.target.value)} /></label>
    <label className="block">Temporary deployment ID<input className="block w-full rounded border bg-transparent p-2" value={deploymentId} maxLength={100} disabled={locked} onChange={e => setDeployment(e.target.value)} /></label>
    <label className="block">Approved run ID<input className="block w-full rounded border bg-transparent p-2" value={runId} maxLength={36} disabled={locked} onChange={e => setRun(e.target.value)} /></label>
    <label className="block">Approved expiry (UTC ISO timestamp)<input className="block w-full rounded border bg-transparent p-2" value={deadline} maxLength={24} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" disabled={locked} onChange={e => setDeadline(e.target.value)} /></label>
    <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e => setConfirmed(e.target.checked)} />This exact bounded payment-free run is authorized; deployment protection, all 17 pauses, exclusive run claim and independent cleanup authority have been verified.</label>
    <button type="button" data-s2-denial-check disabled={locked || !confirmed} className="rounded border px-4 py-2 disabled:opacity-50" onClick={run}>Run approved denial checks once</button>
    <p role="status" aria-live="polite" data-s2-denial-status={visibleStatus}>{visibleStatus === 'PASS' ? 'PASS: exact expected denials and paused-runtime readbacks verified. Save the sanitized evidence before cleanup.' :
      visibleStatus === 'CHECKING' ? 'Checking fixed S2 routes; stop on first unexpected result.' :
      visibleStatus === 'UNVERIFIED' ? 'UNVERIFIED: stop, preserve evidence and invoke approved cleanup. No retry was attempted.' : 'NOT TESTED. No request has been made by this control.'}</p>
    <pre data-s2-denial-evidence className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify({ status: visibleStatus, binding: result?.binding, checks }, null, 2)}</pre>
    <p>Results do not activate billing or prove cleanup. Capture this allowlisted evidence into the independent local run journal; if it is lost, the outcome remains UNKNOWN. An unexpected successful response requires review, never automatic expiration or cancellation.</p>
  </section>;
}
