import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { isS2VerificationOrigin, S2_AUTH_URL, S2_PRO_USER_ID, verifyS2ProSession } from '../../lib/s2BrowserVerification';

export default function S2SessionVerification() {
  const userId = useAppStore(s => s.user?.id);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<'NOT_REQUESTED' | 'CHECKING' | 'VERIFIED' | 'UNVERIFIED'>('NOT_REQUESTED');
  const attempted = useRef(false);
  const generation = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available = isS2VerificationOrigin(window.location.origin, import.meta.env.VITE_SUPABASE_URL || '') &&
    supabase.supabaseUrl === S2_AUTH_URL;
  useEffect(() => {
    if (!available) return;
    generation.current++;
    setConfirmed(false);
    setStatus(attempted.current ? 'UNVERIFIED' : 'NOT_REQUESTED');
    const cancel = () => {
      generation.current++;
      if (expiry.current !== undefined) clearTimeout(expiry.current);
    };
    const invalidate = () => {
      cancel();
      setConfirmed(false);
      setStatus('UNVERIFIED');
    };
    const { data } = supabase.auth.onAuthStateChange(invalidate);
    return () => {
      cancel();
      data.subscription.unsubscribe();
    };
  }, [userId, available]);

  async function verify() {
    if (!available || !confirmed || attempted.current || userId !== S2_PRO_USER_ID) return;
    attempted.current = true; // Synchronous lock: one attempt, including failure.
    const epoch = ++generation.current;
    setStatus('CHECKING');
    const passed = await verifyS2ProSession({
      origin: window.location.origin, backend: import.meta.env.VITE_SUPABASE_URL,
      confirmed, currentUser: () => useAppStore.getState().user?.id,
      getUser: () => supabase.auth.getUser(), stillCurrent: () => generation.current === epoch,
    });
    if (generation.current !== epoch) return;
    setStatus(passed ? 'VERIFIED' : 'UNVERIFIED');
    if (passed) expiry.current = setTimeout(() => {
      generation.current++;
      setConfirmed(false);
      setStatus('UNVERIFIED');
    }, 120000);
  }

  if (!available) return null;
  return <section aria-labelledby="s2-session-heading" className="space-y-3 rounded border p-4">
    <h2 id="s2-session-heading" className="text-lg font-semibold">S2 Pro browser authentication</h2>
    <p>Read-only verification of the existing Pro test identity. This does not authorize billing or run route-denial tests.</p>
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={confirmed} disabled={attempted.current || userId !== S2_PRO_USER_ID}
        onChange={event => setConfirmed(event.target.checked)} />
      I have signed in privately as the existing Pro test account and explicitly confirm sign-in succeeded.
    </label>
    <button type="button" disabled={!confirmed || attempted.current || userId !== S2_PRO_USER_ID}
      className="rounded border px-4 py-2 disabled:opacity-50" onClick={verify}>Verify this browser session</button>
    <p role="status" aria-live="polite" data-s2-session-status={userId === S2_PRO_USER_ID ? status : 'UNVERIFIED'}>
      {userId !== S2_PRO_USER_ID ? 'Unverified. The existing Pro test account is required.' :
        status === 'VERIFIED' ? 'Verified: the current S2 browser session belongs to the confirmed Pro fixture. No billing operation was performed.' :
        status === 'CHECKING' ? 'Checking this browser session.' :
        status === 'UNVERIFIED' ? 'Unverified. No retry was attempted. Stop and report this status.' :
        'Not requested. No authentication check has run.'}
    </p>
  </section>;
}
