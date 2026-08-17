import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type WorkspaceResult = { id: string; name: string; owner_email: string }

async function requestCreditOperations(query: string) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`/api/property-intelligence/admin-credit-adjustment?${query}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Credit Operations could not be loaded.')
  return payload
}

export default function AdminCreditOperations({ simulated = false }: { simulated?: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WorkspaceResult[]>([])
  const [detail, setDetail] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [bucket, setBucket] = useState<'purchased' | 'included'>('purchased')
  const [entryType, setEntryType] = useState<'promotion' | 'admin_correction' | 'refund'>('promotion')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const search = async () => {
    if (simulated) return
    setLoading(true); setError('')
    try {
      const payload = await requestCreditOperations(`q=${encodeURIComponent(query.trim())}`)
      setResults(payload.workspaces || [])
    } catch (err: any) { setError(err?.message || 'Search failed.') }
    finally { setLoading(false) }
  }

  const loadWorkspace = async (workspaceId: string) => {
    if (simulated) return
    setLoading(true); setError('')
    try { setDetail(await requestCreditOperations(`workspaceId=${encodeURIComponent(workspaceId)}`)) }
    catch (err: any) { setError(err?.message || 'Workspace credits could not be loaded.') }
    finally { setLoading(false) }
  }

  const submitAdjustment = async () => {
    if (simulated || !detail?.workspace?.id || !reason.trim() || !confirmed) return
    const parsedAmount = Number(amount)
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) { setError('Enter a non-zero whole-credit adjustment.'); return }
    setLoading(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const response = await fetch('/api/property-intelligence/admin-credit-adjustment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: detail.workspace.id, amount: parsedAmount, bucket, entryType, reason: reason.trim(), correctionId: crypto.randomUUID() }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Adjustment failed.')
      setAmount(''); setReason(''); setConfirmed(false)
      await loadWorkspace(detail.workspace.id)
    } catch (err: any) { setError(err?.message || 'Adjustment failed.') }
    finally { setLoading(false) }
  }

  const balance = detail?.balance || {}
  return (
    <section className="card p-4 border border-sky-500/25 bg-[#0F111A]" aria-labelledby="admin-credit-operations-title">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3]">Owner Admin Only</div>
          <h2 id="admin-credit-operations-title" className="text-lg font-semibold text-[#E6E8EE]">Admin Credit Operations</h2>
          <p className="mt-1 text-sm text-[#8B92A3]">Balances are derived from immutable ledger entries. Adjustments never overwrite counters.</p>
        </div>
        {simulated && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">Simulated — adjustments disabled</span>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input flex-1" value={query} onChange={event => setQuery(event.target.value)} placeholder="Workspace name, email, or workspace ID" disabled={simulated} />
        <button type="button" className="btn btn-primary" onClick={() => void search()} disabled={simulated || loading}>{loading ? 'Loading…' : 'Search Workspaces'}</button>
      </div>
      {error && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{error}</div>}
      {results.length > 0 && <div className="mt-3 grid gap-2">{results.map(workspace => (
        <button key={workspace.id} type="button" className="rounded border border-[#252A38] bg-[#0A0C12] p-3 text-left hover:border-sky-500/50" onClick={() => void loadWorkspace(workspace.id)}>
          <div className="font-medium text-[#E6E8EE]">{workspace.name || 'My Workspace'}</div>
          <div className="text-xs text-[#8B92A3]">{workspace.owner_email} · {workspace.id}</div>
        </button>
      ))}</div>}

      {detail?.workspace && <div className="mt-5 space-y-4">
        <div>
          <div className="font-semibold text-[#E6E8EE]">{detail.workspace.name}</div>
          <div className="text-xs text-[#8B92A3]">{detail.workspace.owner_email} · {detail.workspace.id}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Included remaining', balance.includedRemaining ?? 0], ['Purchased remaining', balance.purchasedRemaining ?? 0],
            ['Reserved credits', balance.reservedCredits ?? 0], ['Total available', balance.totalRemaining ?? 0],
            ['Current plan', detail.plan?.plan_name || 'Not available'], ['Billing cycle', detail.plan?.billing_interval || 'Not available'],
            ['Cycle end', detail.plan?.current_period_end ? new Date(detail.plan.current_period_end).toLocaleDateString() : 'Not available'],
            ['Last included grant', detail.lastIncludedGrant?.created_at ? new Date(detail.lastIncludedGrant.created_at).toLocaleString() : 'None'],
          ].map(([label, value]) => <div key={String(label)} className="panel p-3"><div className="text-xs text-[#8B92A3]">{label}</div><div className="break-words text-sm text-[#E6E8EE]">{value}</div></div>)}
        </div>

        <div className="overflow-x-auto rounded border border-[#252A38]">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-[#171B26] text-[#8B92A3]"><tr>{['Timestamp','Type','Amount','Bucket','Source / actor','Reason','Reference'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{(detail.ledger || []).map((entry: any) => <tr key={entry.id} className="border-t border-[#252A38] text-[#C5CAD6]">
              <td className="p-2">{new Date(entry.created_at).toLocaleString()}</td><td className="p-2">{entry.entry_type}</td><td className="p-2">{entry.amount}</td><td className="p-2">{entry.credit_bucket}</td>
              <td className="p-2">{entry.metadata?.source || 'system'}{entry.created_by_user_id ? ` · ${entry.created_by_user_id}` : ''}</td><td className="p-2">{entry.audit_reason}</td><td className="p-2">{entry.operation_id || entry.purchase_id || entry.stripe_event_id || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <div>
          <div className="mb-2 font-semibold text-[#E6E8EE]">Property Intelligence Diagnostics</div>
          <div className="mb-2 text-xs text-[#8B92A3]">Read-only operational evidence. Credit amounts remain authoritative in the immutable ledger above.</div>
          <div className="overflow-x-auto rounded border border-[#252A38]">
            <table className="min-w-[1350px] w-full text-left text-xs">
              <thead className="bg-[#171B26] text-[#8B92A3]"><tr>{['Timestamp','Address','Mode','Provider','Outcome','Credits','Reservation','Finalization','Release','Cache reference','Status','Correlation'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{(detail.propertyIntelligenceAudit || []).map((entry: any) => <tr key={entry.id} className="border-t border-[#252A38] text-[#C5CAD6]">
                <td className="p-2">{new Date(entry.created_at).toLocaleString()}</td><td className="p-2">{entry.display_address || entry.normalized_address}</td><td className="p-2">{entry.cache_hit ? 'Cache' : 'Live'}</td>
                <td className="p-2">{entry.provider_called ? `${entry.provider_name} · called` : 'Not called'}</td><td className="p-2">{entry.provider_succeeded === null ? 'N/A' : entry.provider_succeeded ? 'Success' : entry.error_code || 'Failed'}</td>
                <td className="p-2">{entry.credits_consumed}</td><td className="p-2">{entry.credit_reservation_reference || '—'}</td><td className="p-2">{entry.credit_finalization_reference || '—'}</td><td className="p-2">{entry.credit_release_reference || '—'}</td>
                <td className="p-2 break-all">{entry.cache_reference || '—'}</td><td className="p-2">{entry.result_status}</td><td className="p-2">{entry.request_correlation_id || entry.lookup_id}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="rounded border border-[#252A38] bg-[#0A0C12] p-3">
          <div className="mb-3 font-semibold text-[#E6E8EE]">Append Credit Adjustment</div>
          <div className="grid gap-2 md:grid-cols-3">
            <select className="select" value={entryType} onChange={event => setEntryType(event.target.value as any)} disabled={simulated}><option value="promotion">Promotional grant</option><option value="admin_correction">Operational correction</option><option value="refund">Refund adjustment</option></select>
            <select className="select" value={bucket} onChange={event => setBucket(event.target.value as any)} disabled={simulated}><option value="purchased">Purchased credits</option><option value="included">Included credits</option></select>
            <input className="input" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Whole credits (+ or -)" disabled={simulated} />
          </div>
          <textarea className="input mt-2 min-h-20" value={reason} onChange={event => setReason(event.target.value)} placeholder="Required operational reason" disabled={simulated} />
          <label className="mt-2 flex items-start gap-2 text-sm text-[#C5CAD6]"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={simulated} /><span>I confirm this appends an immutable audited ledger entry and does not directly overwrite a balance.</span></label>
          <button type="button" className="btn btn-primary mt-3" onClick={() => void submitAdjustment()} disabled={simulated || loading || !confirmed || !reason.trim()}>Append Adjustment</button>
        </div>
      </div>}
    </section>
  )
}
