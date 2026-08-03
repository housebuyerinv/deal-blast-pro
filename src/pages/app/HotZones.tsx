import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Zone = { rank: number; city: string; state: string; postalCode: string; count: number }

export default function HotZones() {
  const [period, setPeriod] = useState<'weekly'|'monthly'|'yearly'>('monthly')
  const [scope, setScope] = useState<'workspace'|'shared'>('workspace')
  const [zones, setZones] = useState<Zone[]>([])
  const [total, setTotal] = useState(0)
  const [minimum, setMinimum] = useState(3)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await supabase.auth.getSession()
        const response = await fetch(`/api/property-intelligence/hot-zones?period=${period}&scope=${scope}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Hot Zones unavailable.')
        if (!cancelled) { setZones(payload.zones || []); setTotal(payload.totalVerifiedClosings || 0); setMinimum(payload.minimumRequired || 3); setMessage(payload.message || '') }
      } catch (error: any) { if (!cancelled) { setZones([]); setMessage(error?.message || 'Hot Zones unavailable.') } }
      finally { if (!cancelled) setLoading(false) }
    }
    void load(); return () => { cancelled = true }
  }, [period, scope])

  const max = Math.max(1, ...zones.map(zone => zone.count))
  return <div className="space-y-4">
    <div>
      <div className="text-xs uppercase tracking-[2px] text-[#8B92A3]">Verified Market Intelligence</div>
      <h1 className="text-2xl font-semibold text-white">Hot Zones</h1>
      <p className="text-sm text-[#8B92A3]">Based only on durable, explicitly verified closed deals. Property searches and generic Sold statuses never count.</p>
    </div>
    <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div className="flex gap-2">{(['weekly','monthly','yearly'] as const).map(value => <button key={value} onClick={() => setPeriod(value)} className={`btn text-xs ${period===value?'btn-green':'btn-ghost'}`}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div>
      <div className="flex gap-2"><button onClick={() => setScope('workspace')} className={`btn text-xs ${scope==='workspace'?'btn-primary':'btn-ghost'}`}>My Workspace</button><button onClick={() => setScope('shared')} className={`btn text-xs ${scope==='shared'?'btn-primary':'btn-ghost'}`}>Shared Anonymized</button></div>
    </div>
    {loading ? <div className="card p-8 text-center text-[#8B92A3]">Loading verified closing aggregates…</div> : zones.length === 0 ?
      <div className="card p-10 text-center"><MapPin className="mx-auto mb-3 text-[#64748B]"/><div className="text-lg font-semibold text-white">No Hot Zones yet</div><p className="mx-auto mt-2 max-w-xl text-sm text-[#8B92A3]">{message || 'Hot Zones become more useful as verified closing records accumulate.'}</p><div className="mt-3 text-xs text-[#64748B]">{scope==='workspace' ? `${total} of ${minimum} verified closings available in this period.` : `Shared zones require at least ${minimum} verified closings and three contributing workspaces.`}</div></div> :
      <div className="card p-4"><div className="mb-3 text-sm text-[#8B92A3]">Ranked Hot Zones</div><div className="space-y-3">{zones.map(zone => <div key={`${zone.postalCode}-${zone.rank}`} className="rounded border border-[#252A38] bg-[#0F111A] p-3"><div className="flex justify-between gap-3"><div><span className="mr-2 text-[#64748B]">#{zone.rank}</span><span className="font-semibold text-white">{zone.city}, {zone.state} {zone.postalCode}</span></div><div className="text-sm text-[#22C55E]">{zone.count} verified</div></div><div className="mt-2 h-2 rounded bg-[#171B26]"><div className="h-2 rounded bg-[#22C55E]" style={{width:`${Math.max(8,zone.count/max*100)}%`}}/></div></div>)}</div></div>}
  </div>
}
