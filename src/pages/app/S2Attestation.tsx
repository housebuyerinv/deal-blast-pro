import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

// Private operator view: no navigation link, credential fields, raw response dump,
// console output or token handoff. The server independently enforces owner access.
export default function S2Attestation() {
  const userId = useAppStore((s) => s.user?.id);
  const [status, setStatus] = useState('Not requested');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    source: string;
    deployment: string;
    build: string;
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    setStatus('Not requested');
    setSummary(null);
    setBusy(false);
    return () => active.current?.abort();
  }, [userId]);
  const available =
    import.meta.env.VITE_SUPABASE_URL ===
      'https://qxhhlprentrufobpcgna.supabase.co' &&
    window.location.hostname.startsWith('dbp-registration-s2-') &&
    window.location.hostname.endsWith('-housebuyerinv.vercel.app');
  async function verify() {
    const owner = useAppStore.getState().user?.id;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true);
    setSummary(null);
    setStatus('Checking');
    try {
      const { data } = await supabase.auth.getSession();
      if (
        !owner ||
        data.session?.user.id !== owner ||
        useAppStore.getState().user?.id !== owner ||
        !data.session.access_token
      )
        throw Error();
      const response = await fetch('/api/platform/s2-attestation', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) throw Error();
      const value = await response.json();
      const { data: latest } = await supabase.auth.getSession();
      if (
        controller.signal.aborted ||
        latest.session?.user.id !== owner ||
        useAppStore.getState().user?.id !== owner
      )
        throw Error();
      const keys = [
        'DBP_REQUIRE_VERSIONED_PLATFORM_AGREEMENTS',
        'DBP_REGISTRATION_PAUSED',
        'BM_CHECKOUT_ENABLED',
        'BM_ENVIRONMENT',
        'BM_STAGING_PROJECT_REF',
        'SUPABASE_URL',
        'VITE_SUPABASE_URL',
        'PUBLIC_APP_URL',
        'BM_APP_ORIGIN',
        'BM_STRIPE_PORTAL_CONFIGURATION_ID',
        'BM_LIVE_BILLING_ENABLED',
        'BM_BILLING_VERIFIED',
        'BM_LIVE_BILLING_VERIFIED',
        'BM_LIVE_DELIVERY_ENABLED',
        'BM_DELIVERY_MODE',
        'BM_RESPONSE_ENABLED',
        'BM_S2_CATALOG_DIAGNOSTIC',
      ];
      if (
        !value?.build?.settings ||
        !value?.runtime?.settings ||
        Object.keys(value.build.settings).length !== 17 ||
        Object.keys(value.runtime.settings).length !== 17 ||
        keys.some(
          (k) =>
            typeof value.build.settings[k] !== 'string' ||
            value.build.settings[k] !== value.runtime.settings[k],
        )
      )
        throw Error();
      if (
        value?.schema !== 1 ||
        value.qaOnly !== true ||
        !/^[a-f0-9]{40}$/.test(value.identity?.sourceSha) ||
        !/^dpl_[A-Za-z0-9]+$/.test(value.identity?.deploymentId) ||
        !/^[a-f0-9]{64}$/.test(value.build?.sha256)
      )
        throw Error();
      setSummary({
        source: value.identity.sourceSha,
        deployment: value.identity.deploymentId,
        build: value.build.sha256,
      });
      setStatus(
        'Verified 17 build and runtime settings. External provider checks are still required.',
      );
    } catch {
      if (!controller.signal.aborted) {
        setSummary(null);
        setStatus(
          'Unavailable. A confirmed platform-owner session and a valid paused S2 deployment are required.',
        );
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (!available) return <p>Not available.</p>;
  return (
    <section className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">S2 configuration verification</h1>
      <p>
        Read-only operator check. No registration, payment or delivery is
        enabled.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={verify}
        className="rounded border px-4 py-2 disabled:opacity-50"
      >
        Verify configuration
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
      {summary && (
        <dl className="space-y-2 break-all">
          <dt>Source pin</dt>
          <dd>{summary.source}</dd>
          <dt>Deployment</dt>
          <dd>{summary.deployment}</dd>
          <dt>Build snapshot checksum</dt>
          <dd>{summary.build}</dd>
        </dl>
      )}
    </section>
  );
}
