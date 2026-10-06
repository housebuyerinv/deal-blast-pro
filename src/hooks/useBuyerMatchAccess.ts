import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

type Access = { owner: string; workspace: string | null | undefined; active: boolean; subscribed: boolean; pending: boolean; failed: boolean };
export function useBuyerMatchAccess(owner: string | undefined, workspace: string | null | undefined) {
  const [state, setState] = useState<Access | null>(null);
  useEffect(() => {
    if (!owner) return;
    let generation = 0;
    let cancelled = false;
    const refresh = async () => {
      const current = ++generation;
      const next: Access = { owner, workspace, active: false, subscribed: false, pending: false, failed: true };
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== owner) return;
        const response = await fetch('/api/buyermatch?action=access', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (response.ok) Object.assign(next, {
          active: result.active === true, subscribed: result.subscribed === true, failed: false,
        });
      } catch { /* Access fails closed; ordinary DBP access is evaluated separately. */ }
      if (!cancelled && current === generation && useAppStore.getState().user?.id === owner &&
        useAppStore.getState().workspaceInstanceId === workspace) setState(next);
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.removeEventListener('focus', refresh); };
  }, [owner, workspace]);
  return state && state.owner === owner && state.workspace === workspace ? state : { active: false, subscribed: false, pending: Boolean(owner), failed: false };
}
