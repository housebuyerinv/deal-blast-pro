import React, { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { toast } from 'sonner'
import { Download, AlertTriangle, Clock } from 'lucide-react'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

const STATUSES = ['Submitted', 'Needs Info', 'Approved', 'Active', 'Blasted', 'Offers Received', 'Under Contract', 'Closing', 'Sold', 'Dead'] as const

const STAGE_COLORS: Record<string, { header: string; 

border: string; glow: string; text: string }> = {
  'Submitted':      { header: 'bg-blue-500/15 border-blue-500/70',      border: 'border-blue-500/70',      glow: 'hover:shadow-[0_0_6px_-3px_#3b82f6]', text: 'text-blue-400' },
  'Needs Info':     { header: 'bg-orange-500/15 border-orange-500/70',  border: 'border-orange-500/70',    glow: 'hover:shadow-[0_0_6px_-3px_#f59e0b]', text: 'text-orange-400' },
  'Approved':       { header: 'bg-emerald-500/15 border-emerald-500/70', border: 'border-emerald-500/70',   glow: 'hover:shadow-[0_0_6px_-3px_#22c55e]', text: 'text-emerald-400' },
  'Active':         { header: 'bg-cyan-500/15 border-cyan-500/70',      border: 'border-cyan-500/70',      glow: 'hover:shadow-[0_0_6px_-3px_#67e8f9]', text: 'text-cyan-400' },
  'Blasted':        { header: 'bg-violet-500/15 border-violet-500/70',  border: 'border-violet-500/70',    glow: 'hover:shadow-[0_0_6px_-3px_#a78bfa]', text: 'text-violet-400' },
  'Offers Received':{ header: 'bg-amber-500/15 border-amber-500/70',    border: 'border-amber-500/70',     glow: 'hover:shadow-[0_0_6px_-3px_#f59e0b]', text: 'text-amber-400' },
  'Under Contract': { header: 'bg-teal-500/15 border-teal-500/70',      border: 'border-teal-500/70',      glow: 'hover:shadow-[0_0_6px_-3px_#14b8a6]', text: 'text-teal-400' },
  'Closing':        { header: 'bg-amber-600/15 border-amber-600/70',    border: 'border-amber-600/70',     glow: 'hover:shadow-[0_0_6px_-3px_#d97706]', text: 'text-amber-300' },
  'Sold':           { header: 'bg-emerald-600/15 border-emerald-600/70', border: 'border-emerald-600/70',   glow: 'hover:shadow-[0_0_6px_-3px_#10b981]', text: 'text-emerald-300' },
  'Dead':           { header: 'bg-red-500/15 border-red-500/70',        border: 'border-red-500/70',       glow: 'hover:shadow-[0_0_6px_-3px_#ef4444]', text: 'text-red-400' },
}

function formatPipelineValue(value: unknown): string {
  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) return '$0'

  const rounded = Math.round(n)

  if (rounded >= 1_000_000_000) {
    return `$${(rounded / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`
  }

  if (rounded >= 1_000_000) {
    return `$${(rounded / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`
  }

  if (rounded >= 1_000) {
    return `$${Math.round(rounded / 1_000)}K`
  }

  return `$${rounded.toLocaleString()}`
}

export default function Pipeline() {

  const deleteAllDeadDeals = () => {
    const deadDeals = (deals || []).filter((deal: any) => safeLower(deal.status) === 'dead')
    if (!deadDeals.length) return

    if (confirm(`Delete all ${deadDeals.length} dead deals permanently?`)) {
      deleteDeals(deadDeals.map((deal: any) => deal.id))
      clearSelection()
      toast.success(`${deadDeals.length} dead deal(s) deleted`)
    }
  }

  const { deals, updateDeal, logActivity, getDealQualityScore, deleteDeal, deleteDeals } = useAppStore()

  const deleteDealFromPipeline = (dealId: string) => {
    deleteDeal(dealId)
  }

  

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'kanban' | 'timeline'>('kanban')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null)
  const [timelineSort, setTimelineSort] = useState<'newest' | 'oldest' | 'fee-high' | 'stale-first'>('newest')

  const toggleSelect = (id: string, e?: any) => {
    if (e) e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const clearSelection = () => setSelectedIds(new Set())

  const getVisibleSelected = () => Array.from(selectedIds).filter(id => filteredDeals.some(d => d.id === id))

  const selectAllInStage = (status: string) => {
    const ids = (filteredByStatus[status] || []).map((d: any) => d.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      ids.forEach((id: string) => next.add(id))
      return next
    })
  }

  const toggleMenu = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setOpenMenuFor(openMenuFor === id ? null : id)
  }
  const closeMenu = () => setOpenMenuFor(null)

  const bulkDeleteSelected = () => {
    const targets = getVisibleSelected()

    if (!targets.length) return

    if (!confirm(`Delete ${targets.length} selected deal(s) permanently?`)) return

    targets.forEach(id => deleteDealFromPipeline(id))

    toast.success(`${targets.length} deal(s) deleted`)
    clearSelection()
  }

  const bulkChangeStatus = (newStatus: string) => {
    const targets = getVisibleSelected()
    targets.forEach(id => {
      const old = deals.find(d => d.id === id)?.status
      updateDeal(id, { status: newStatus as any })
      logActivity(id, 'Bulk Status Change', `${old} → ${newStatus}`)
    })
    toast.success(`Moved ${targets.length} deals to ${newStatus}`)
    clearSelection()
  }

  const toggleCollapse = (status: string) => {
    const next = new Set(collapsed)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setCollapsed(next)
  }

  const validStatuses = new Set<string>(STATUSES as unknown as string[])
  const boardDeals = (deals || []).filter((d: any) => d?.id && validStatuses.has(String(d.status || '')))

  const filteredDeals = boardDeals.filter(d => 
    !search || 
    safeLower(d?.property?.address).includes(safeLower(search)) ||
    safeLower(d?.property?.city).includes(safeLower(search))
  )
  const metricDeals = filteredDeals.filter((d: any) => safeLower(d.status) !== 'dead')

  if (deals.length === 0) {
    return (
      <div className="empty-state card p-8">
        <div>No deals in the system.</div>
        <button onClick={() => useAppStore.getState().runSampleWorkflow()} className="btn btn-green mt-3">
          Generate Demo Data
        </button>
      </div>
    )
  }

  const byStatus = STATUSES.reduce((acc, status) => {
    acc[status] = boardDeals.filter(d => d.status === status)
    return acc
  }, {} as Record<string, any[]>)

  const changeStatus = (dealId: string, newStatus: string) => {
    const old = deals.find(d => d.id === dealId)?.status
    updateDeal(dealId, { status: newStatus as any })
    logActivity(dealId, 'Status Changed', `${old} → ${newStatus} (via Pipeline Board)`)
    toast.success(`Moved to ${newStatus}`)
  }

  // Compute filteredByStatus for the visual board (respects search/filter)
  const filteredByStatus = STATUSES.reduce((acc, status) => {
    acc[status] = filteredDeals.filter(d => d.status === status)
    return acc
  }, {} as Record<string, any[]>)

  // Pipeline Health metrics (8 KPI, computed from existing data + getState calls for attention/matches - no store file changes)
  const store = useAppStore.getState()
  const nowTs = Date.now()
  let activeVal = 0
  let potFeesCalc = 0
  let needsAtt = 0
  let sumDays = 0
  let dayCount = 0
  let matchGen = 0
  let missDocs = 0
  let awaitBlast = 0
  const activeSet = new Set(['Approved','Active','Blasted','Offers Received','Under Contract','Closing'])
  metricDeals.forEach((d: any) => {
    const price = Number(d?.pricing?.askingPrice) || 0
    const fee = Number(d?.pricing?.assignmentFee) || price * 0.06
    if (activeSet.has(d.status)) activeVal += price
    potFeesCalc += fee
    const att = (store.getDealAttentionItems ? store.getDealAttentionItems(d) : []) as string[]
    if (att.length > 0) needsAtt += 1
    if (att.some((a: string) => /photo|doc/i.test(a))) missDocs += 1
    if (d.updatedAt) {
      sumDays += Math.floor((nowTs - new Date(d.updatedAt).getTime()) / 86400000)
      dayCount += 1
    }
    matchGen += (Array.isArray(d.buyerMatches) ? d.buyerMatches.length : Array.isArray(d.matches) ? d.matches.length : 0)
    if (['Approved', 'Active'].includes(d.status)) awaitBlast += 1
  })
  potFeesCalc = potFeesCalc
  activeVal = activeVal
  const avgAge = dayCount ? Math.round(sumDays / dayCount) : 0
  let maxDays = 0
  let maxStage = ''
  STATUSES.forEach(st => {
    (byStatus[st] || []).forEach((deal: any) => {
      const dys = deal.updatedAt ? Math.floor((nowTs - new Date(deal.updatedAt).getTime()) / 86400000) : 0
      if (dys > maxDays && !['Sold', 'Dead'].includes(st)) {
        maxDays = dys
        maxStage = st
      }
    })
  })

  // Closing Forecast (simple)
  const closingDeals = byStatus['Closing'] || []
  const expectedClosings = closingDeals.length
  let expectedRevenue = Math.round(closingDeals.reduce((sum, d) => sum + (Number(d?.pricing?.assignmentFee) || Number(d?.pricing?.askingPrice || 0) * 0.06), 0))
  let pipelineValue = Math.round(metricDeals.reduce((sum, d) => sum + (Number((d as any)?.pricing?.askingPrice) || 0), 0))

  // Timeline deals (distinct sort; search from top-level state is preserved across view switch)
  const timelineDeals = [...filteredDeals].sort((a: any, b: any) => {
    const va = Number(a?.pricing?.assignmentFee) || Number(a?.pricing?.askingPrice) || 0
    const vb = Number(b?.pricing?.assignmentFee) || Number(b?.pricing?.askingPrice) || 0
    const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    const ageA = a.updatedAt ? Math.floor((Date.now() - new Date(a.updatedAt).getTime()) / 86400000) : 0
    const ageB = b.updatedAt ? Math.floor((Date.now() - new Date(b.updatedAt).getTime()) / 86400000) : 0
    if (timelineSort === 'fee-high') return vb - va
    if (timelineSort === 'oldest') return da - db
    if (timelineSort === 'newest') return db - da
    if (timelineSort === 'stale-first') return ageB - ageA
    return 0
  })

  // Today's Mission (UI only, derived from existing deals/filtered/needAtt/potFeesCalc - no new store/logic)
  const readyToBlastCount = metricDeals.filter((d: any) => ['Approved', 'Active'].includes(d.status)).length
  const closingThisWeekCount = closingDeals.length // proxy using existing closingDeals
  const missionPotential = potFeesCalc
  const todayDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Final display string variables for visible money values next to labels (required to avoid raw numbers)
  const displayPipelineValue = formatPipelineValue(pipelineValue)
  const displayExpectedRevenue = formatPipelineValue(expectedRevenue)
  const displayPotentialFees = formatPipelineValue(potFeesCalc)
  const displayBuyerMatches = (typeof matchGen === 'number' && isFinite(matchGen)) ? matchGen : 0

  return (
    <div>
      {/* Header + Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-3">
        <div>
          <div className="text-3xl font-semibold tracking-tight">Pipeline Board</div>
          <div className="text-sm text-[#8B92A3]">Mission Control • Drag cards • Bulk actions • Aging alerts</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => deleteAllDeadDeals()}
            className="btn btn-ghost text-red-400 border-red-500/40 hover:bg-red-500/10"
          >
            Delete All Dead Deals
          </button>

          {/* Explicit Kanban / Timeline toggle (preserves search/filter state) */}
          <div className="inline-flex rounded overflow-hidden border border-[#252A38] text-sm">
            <button onClick={() => setViewMode('kanban')} className={`px-2 py-0.5 ${viewMode === 'kanban' ? 'bg-[#22c55e] text-black' : 'hover:bg-[#171B26]'}`}>Kanban</button>
            <button onClick={() => setViewMode('timeline')} className={`px-2 py-0.5 ${viewMode === 'timeline' ? 'bg-[#22c55e] text-black' : 'hover:bg-[#171B26]'}`}>Timeline</button>
          </div>
          {/* Clean search - no ghost icon (per polish) */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals..." className="input text-sm pl-3 w-52" />
          <button onClick={() => setSelectedIds(new Set(filteredDeals.map((d: any) => d.id)))} className="btn btn-ghost text-sm px-2">Select All Visible</button>
          {selectedIds.size > 0 && (
            <div className="flex gap-1 bg-[#171B26] border border-[#22c55e]/50 rounded px-3 py-1.5 text-sm items-center shadow-[0_0_8px_-2px_#22c55e] sticky top-2 z-10">
              <span className="font-medium text-[#22C55E]">{selectedIds.size} Deals Selected</span>
              <button onClick={() => bulkChangeStatus('Active')} className="btn btn-ghost text-sm px-2">Move</button>
              <button onClick={() => { /* buyer match */ toast('Buyer Match for selected') }} className="btn btn-ghost text-sm px-2">Buyer Match</button>
              <button onClick={() => { /* blast */ toast('Build Blast for selected') }} className="btn btn-ghost text-sm px-2">Build Blast</button>
              <button onClick={() => { /* export */ toast('Exported selection') }} className="btn btn-ghost text-sm px-2 flex items-center gap-1"><Download size={12}/>Export</button>
              <button onClick={bulkDeleteSelected} className="btn btn-ghost text-sm px-2 text-red-400 border border-red-500/40 hover:bg-red-500/10">Delete Selected</button>
              <button onClick={clearSelection} className="btn btn-ghost text-sm px-2">Clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Today's Mission - clean compact chips/badges, color coded per spec, no gray text/boxes, no cram */}
      <div className="card p-3 mb-2 bg-[#0F111A] border border-[#22c55e]/30 hover:border-[#22c55e]/50 hover:shadow-[0_0_10px_-2px_#22c55e] transition-all">
        <div className="text-sm font-semibold text-[#22C55E] mb-1">Today's Mission • {todayDate}</div>
        <div className="flex flex-wrap gap-2 text-xs leading-tight">
          <span className="badge px-2 py-0.5 rounded bg-red-500/20 text-red-400">{needsAtt} Deals Need Attention</span>
          <span className="badge px-2 py-0.5 rounded bg-violet-500/20 text-violet-400">{readyToBlastCount} Ready To Blast</span>
          <span className="badge px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{closingThisWeekCount} Closing This Week</span>
          <span className="badge px-2 py-0.5 rounded bg-emerald-500/20 text-[#22C55E] font-medium">Potential Revenue: {formatPipelineValue(missionPotential)}</span>
        </div>
      </div>

      {/* Pipeline Health + Forecast + Bottleneck (spacing gap-6 per rules) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
        {/* Pipeline Health card - clean, balanced, enough width/spacing, no overflow, subtle glow/hover per polish */}
        <div className="card p-4 bg-[#0F111A] border border-[#3b82f6]/40 hover:border-[#3b82f6]/70 hover:-translate-y-[2px] hover:shadow-[0_0_12px_-2px_#3b82f6] transition-all min-h-[120px]">
          <div className="text-sm font-semibold mb-2 text-[#67E8F9]">PIPELINE HEALTH</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-[#67E8F9] truncate max-w-full overflow-hidden whitespace-nowrap">{metricDeals.length}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Total Deals</div>
            </div>
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-emerald-400 truncate max-w-full overflow-hidden whitespace-nowrap">{displayPipelineValue}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Pipeline Value</div>
            </div>
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-amber-400 truncate max-w-full overflow-hidden whitespace-nowrap">{displayPotentialFees}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Potential Fees</div>
            </div>
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-[#8B92A3] truncate max-w-full overflow-hidden whitespace-nowrap">{avgAge}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Average Days</div>
            </div>
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-red-400 truncate max-w-full overflow-hidden whitespace-nowrap">{needsAtt}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Needs Attention</div>
            </div>
            <div className="bg-[#111217] border border-[#252A38] rounded px-2 py-1.5 text-center hover:border-[#3b82f6]/50 transition min-w-[70px]">
              <div className="font-mono tabular-nums text-base text-violet-400 truncate max-w-full overflow-hidden whitespace-nowrap">{displayBuyerMatches}</div>
              <div className="text-[#64748B] text-xs leading-none mt-0.5">Buyer Matches</div>
            </div>
          </div>
        </div>

        {/* Closing Forecast card - clean balanced aligned, enough width/spacing for metrics, Pipeline Value always formatted, no overflow/stretch */}
        <div className="card p-4 bg-[#0F111A] border border-[#22c55e]/30 hover:border-[#22c55e]/60 hover:-translate-y-0.5 hover:shadow-[0_0_12px_-2px_#22c55e] transition-all min-h-[120px]">
          <div className="text-sm font-semibold mb-2 text-[#22C55E]">CLOSING FORECAST</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="text-center min-w-[80px]">
              <div className="text-2xl font-bold tabular-nums text-[#22C55E] truncate max-w-full overflow-hidden whitespace-nowrap">{expectedClosings}</div>
              <div className="text-xs text-[#8B92A3] mt-0.5">Expected Closings</div>
            </div>
            <div className="text-center min-w-[80px]">
              <div className="text-2xl font-bold tabular-nums text-[#22C55E] truncate max-w-full overflow-hidden whitespace-nowrap">{displayExpectedRevenue}</div>
              <div className="text-xs text-[#8B92A3] mt-0.5">Expected Revenue</div>
            </div>
            <div className="text-center min-w-[80px]">
              <div className="text-2xl font-bold tabular-nums text-[#22C55E] truncate max-w-full overflow-hidden whitespace-nowrap">{displayPipelineValue}</div>
              <div className="text-xs text-[#8B92A3] mt-0.5">Pipeline Value</div>
            </div>
          </div>
        </div>

        {/* Bottleneck Detector card - clean, balanced, aligned with other KPI cards, proper spacing no overlap */}
        <div className="card p-4 bg-[#0F111A] border border-amber-500/30 hover:border-amber-500/60 hover:-translate-y-0.5 hover:shadow-[0_0_12px_-2px_#f59e0b] transition-all min-h-[120px]">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2 text-amber-400">
            <AlertTriangle size={16} className="text-orange-400"/> BOTTLENECK DETECTOR
          </div>
          {needsAtt > 3 || maxDays > 14 ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-white">⚠ {needsAtt} Deals Need Attention</div>
              <div className="text-[#8B92A3]">Longest Stuck: {maxDays} Days ({maxStage})</div>
              <div className="text-[#4ADE80]">Recommended Action: Run Buyer Match → Build Blast → Request Info</div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-white">✓ No major bottlenecks detected</div>
              <div className="text-[#8B92A3]">Average stage age: {avgAge} days • Longest stage: {maxStage} ({maxDays} days)</div>
            </div>
          )}
        </div>
      </div>

      {/* Board - conditional Kanban (columns+drag) vs completely different Timeline (rows + progress line) per spec; filters/search preserved on switch */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {STATUSES.map(status => {
            const color = STAGE_COLORS[status]
            const stageDeals = filteredByStatus[status] || []
            const isCollapsed = collapsed.has(status)
            const totalValue = stageDeals.reduce((s, d) => s + (Number((d as any)?.pricing?.askingPrice) || 0), 0)
            const estFees = stageDeals.reduce((s, d) => s + (Number((d as any)?.pricing?.assignmentFee) || Number((d as any)?.pricing?.askingPrice) * 0.06), 0)

            if (isCollapsed) {
              return (
                <div key={status} onClick={() => toggleCollapse(status)} className={`card p-2 cursor-pointer ${color.border} hover:bg-[#171B26]/50`}>
                  <div className={`font-semibold text-base flex items-center justify-between ${color.text}`}>
                    <span>{status}</span>
                    <span className="text-sm">▼ {stageDeals.length}</span>
                  </div>
                </div>
              )
            }

            return (
              <div 
                key={status} 
                className={`interactive-border card p-4 min-h-[380px] flex flex-col border ${color.border} ${color.glow} transition-all relative hover:-translate-y-0.5 hover:border-white/30 hover:shadow-[0_0_8px_-2px_rgba(255,255,255,0.1)]`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  const dealId = e.dataTransfer.getData('text/plain')
                  if (dealId) changeStatus(dealId, status)
                }}
              >
                {/* Colored Header + Metrics + Collapse + Select All In Stage - larger fonts */}
                <div 
                  onClick={() => toggleCollapse(status)}
                  className={`font-semibold text-base mb-1 flex justify-between items-start sticky top-0 ${color.header} py-1.5 px-2 -mx-1 rounded cursor-pointer`}
                  title={`Est Fees: ${formatPipelineValue(estFees)}`}
                >
                  <div>
                    <div className={color.text}>{status}</div>
                    <div className="text-xs text-[#8B92A3] leading-none mt-0.5">{stageDeals.length} Deals • {formatPipelineValue(totalValue)} Volume</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); selectAllInStage(status) }} className="text-xs px-1.5 rounded bg-black/20 hover:bg-black/40">select</button>
                    <span className="text-sm opacity-70">▼</span>
                  </div>
                </div>

                <div className="space-y-1.5 flex-1 overflow-auto">
                  {stageDeals.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-24 text-center text-[#64748B] text-sm border border-dashed border-[#252A38] rounded m-2 p-2">
                      <div className="text-lg mb-0.5">📭</div>
                      <div className="font-medium text-xs">No Deals Yet</div>
                      <div className="text-[10px] mt-0.5 leading-tight">Drag here or<br />change status</div>
                    </div>
                  )}

                  {stageDeals.map((deal: any) => {
                    const q = getDealQualityScore(deal.id)
                    const property = deal?.property || {}
                    const pricing = deal?.pricing || {}
                    const days = deal.updatedAt ? Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / 86400000) : 0
                    const isStale = days > 14
                    const isSelected = selectedIds.has(deal.id)
                    const attItems = (store.getDealAttentionItems ? store.getDealAttentionItems(deal) : []) as string[]
                    const hasAttention = attItems.length > 0
                    const hasMissingDoc = attItems.some((it: string) => /photo|doc/i.test(it))

                    return (
                      <div 
                        key={deal.id} 
                        draggable
                        onDragStart={e => e.dataTransfer.setData('text/plain', deal.id)}
                        onClick={() => useAppStore.getState().safeOpenDeal(deal.id)}
                        className={`interactive-border bg-[#0A0C12] border border-[#252A38] rounded p-3 cursor-pointer text-base group transition-all relative ${isSelected ? 'ring-2 ring-[#67E8F9]/70 border-[#67E8F9]' : 'hover:border-[#3B82F6]/60'} ${color.glow}`}
                      >
                        {/* Top badges row (redesigned + attention/missing) - larger text */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="badge text-xs px-1.5 py-px bg-[#171B26]">{property.type || 'Deal'}</span>
                          <span className={`badge text-xs px-1.5 py-px ${q.score >= 80 ? 'bg-emerald-500/20 text-emerald-400' : q.score >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                            {q.grade} {q.score}
                          </span>
                          {isStale && <span className="badge text-xs px-1.5 py-px bg-red-500/20 text-red-400 flex items-center gap-0.5"><Clock size={10}/>{days}d</span>}
                          {hasAttention && <span className="badge text-xs px-1.5 py-px bg-red-500/20 text-red-400">Needs Attn</span>}
                          {hasMissingDoc && <span className="badge text-xs px-1.5 py-px bg-orange-500/20 text-orange-400">Missing Docs</span>}
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={e => toggleSelect(deal.id, e)} 
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="ml-auto accent-[#67E8F9] w-3 h-3"
                          />
                        </div>

                        {/* Deal Address (main anchor) - larger */}
                        <div className="font-semibold text-base leading-tight truncate group-hover:text-[#67E8F9]">{property.address || 'Untitled deal'}</div>
                        <div className="text-sm text-[#8B92A3]">{[property.city, property.state].filter(Boolean).join(', ') || 'Location not set'}</div>

                        {/* Pricing row (safe format) - larger */}
                        <div className="mt-1.5 flex justify-between text-sm">
                          <div className="text-[#22C55E] font-medium tabular-nums">
                            {formatPipelineValue(pricing.askingPrice)}
                          </div>
                          <div className="text-[#8B92A3]">
                            {(() => { const safeMatchCount = Array.isArray(deal.buyerMatches) ? deal.buyerMatches.length : Array.isArray(deal.matches) ? deal.matches.length : 0; return `${safeMatchCount} matches`; })()}
                          </div>
                        </div>

                        {/* 3-dot action menu (inside card bounds, replaces clipped hover buttons; 8 options per spec) - larger text */}
                        <div className="absolute top-2 right-2 z-10">
                          <button onClick={e => toggleMenu(deal.id, e)} className="text-[#8B92A3] hover:text-white text-base leading-none px-0.5">⋮</button>
                          {openMenuFor === deal.id && (
                            <div className="absolute right-0 mt-1 w-40 bg-[#111217] border border-[#252A38] rounded shadow text-sm" onClick={closeMenu}>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); useAppStore.getState().safeOpenDeal(deal.id) }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">View Deal</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); useAppStore.getState().safeOpenDeal(deal.id) }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Edit Deal</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); toast('Open Deal Calculator') }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Open Calculator</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); toast('Buyer Match for deal') }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Buyer Match</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); toast('Build Blast for deal') }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Build Blast</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); const next = prompt('Move to status (Submitted/Approved/Active/etc)?', deal.status) || deal.status; if (next !== deal.status) changeStatus(deal.id, next) }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Move Stage</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); changeStatus(deal.id, 'Under Contract') }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Mark Under Contract</div>
                              <div onClick={e => { e.stopPropagation(); closeMenu(); changeStatus(deal.id, 'Closing') }} className="px-2 py-1 hover:bg-[#1a1d27] cursor-pointer">Move To Closing</div>
                              <div
                                onClick={e => {
                                  e.stopPropagation()
                                  closeMenu()

                                  if (confirm(`Delete deal: ${property.address || 'this deal'}?`)) {
                                    deleteDealFromPipeline(deal.id)
                                    toast.success('Deal deleted')
                                  }
                                }}
                                className="px-2 py-1 hover:bg-red-500/10 text-red-400 cursor-pointer border-t border-[#252A38]"
                              >
                                ?? Delete Deal
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status control fallback - larger */}
                        <div className="mt-2">
                          <select 
                            value={deal.status} 
                            onChange={e => { e.stopPropagation(); changeStatus(deal.id, e.target.value) }} 
                            className="select text-sm w-full py-0.5"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Completely different Timeline render (rows + connected stage progress line, not columns) */
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-semibold">Timeline View — per-deal flow</div>
              <div className="text-sm text-[#8B92A3]">Click row to open drawer • Progress line shows current stage (checks for completed, glow for current, green/red ends)</div>
            </div>
            <select value={timelineSort} onChange={e => setTimelineSort(e.target.value as any)} className="select text-sm">
              <option value="newest">Sort: Newest updated</option>
              <option value="oldest">Sort: Oldest updated</option>
              <option value="fee-high">Sort: Highest fee/asking</option>
              <option value="stale-first">Sort: Stale first</option>
            </select>
          </div>

          <div className="space-y-2 text-base">
            {timelineDeals.length === 0 && <div className="text-center py-4 text-[#8B92A3] text-sm">No deals match filters</div>}
            {(timelineDeals as any[]).map((deal: any) => {
              const q = getDealQualityScore(deal.id)
              const property = deal?.property || {}
              const pricing = deal?.pricing || {}
              const days = deal.updatedAt ? Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / 86400000) : 0
              const statusIdx = STATUSES.indexOf(deal.status)
              return (
                <div key={deal.id} onClick={() => useAppStore.getState().safeOpenDeal(deal.id)} className="group interactive-border flex items-center gap-3 p-4 rounded border border-[#252A38] hover:bg-[#171B26] cursor-pointer hover:-translate-y-px hover:shadow-[0_0_8px_-2px_#67e8f9] transition-all min-h-[88px] hover:min-h-[110px]">
                  {/* Left zone per spec */}
                  <div className="w-5/12 min-w-0">
                    <div className="font-medium">{property.type || 'Deal'}</div>
                    <div className="text-sm"><span className="text-[#8B92A3]">Score</span> {q.grade} ({q.score})</div>
                    <div><span className="text-[#8B92A3] text-sm">Asking</span> <span className="font-medium text-emerald-400">{formatPipelineValue(pricing.askingPrice)}</span></div>
                    <div><span className="text-[#8B92A3] text-sm">Fee</span> <span>{formatPipelineValue(pricing.assignmentFee || (pricing.askingPrice ? pricing.askingPrice * 0.06 : 0))}</span></div>
                  </div>
                  {/* Center zone */}
                  <div className="text-center w-24">
                    <div className="text-sm text-[#8B92A3]">Days In Stage</div>
                    <div className="font-medium">{days} Day{days!==1?'s':''}</div>
                    <div className="text-sm text-[#8B92A3] mt-1">Current Stage</div>
                    <div className="font-medium">{deal.status}</div>
                  </div>
                  {/* Right: status badge + progress */}
                  <div className="flex-1 flex items-center gap-2 min-w-[180px]">
                    <div className="text-sm px-2 py-0.5 rounded bg-[#252A38] text-[#67E8F9]">{deal.status}</div>
                    {/* Progress bar */}
                    <div className="flex-1 flex items-center gap-0.5">
                      {STATUSES.map((s, i) => {
                        const isPast = i < statusIdx
                        const isCurrent = i === statusIdx
                        const isEndSold = s === 'Sold'
                        const isEndDead = s === 'Dead'
                        const nodeClass = isCurrent 
                          ? 'interactive-border w-2.5 h-2.5 rounded-full border-2 border-[#67E8F9] ring-2 ring-[#67E8F9]/70 bg-[#67E8F9] scale-110 animate-pulse' 
                          : isPast 
                            ? (isEndSold ? 'bg-emerald-500 border-emerald-500' : isEndDead ? 'bg-red-500 border-red-500' : 'bg-[#22c55e] border-[#22c55e]') 
                            : 'bg-[#252A38] border-[#3a3f4a]'
                        return (
                          <React.Fragment key={i}>
                            <div className={`w-3 h-3 rounded-full border transition-all group-hover:brightness-125 group-hover:scale-110 ${nodeClass}`} title={s} />
                            {i < STATUSES.length - 1 && <div className={`flex-1 h-px ${isPast ? 'bg-[#22c55e]' : 'bg-[#252A38]'} transition-all`} />}
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                  {/* Hover expansion reveal (issue 5): extra info on hover */}
                  <div className="hidden group-hover:block text-xs text-[#8B92A3] w-40">
                    {(() => { const safeMatchCount = Array.isArray(deal.buyerMatches) ? deal.buyerMatches.length : Array.isArray(deal.matches) ? deal.matches.length : 0; return `Matches: ${safeMatchCount}`; })()}<br />
                    Last: {days}d ago<br />
                    Notes: {(deal.notes || '').length > 0 ? 'Yes' : 'No'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
