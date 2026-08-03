
﻿import React, { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Link } from 'react-router-dom'
import { DollarSign, AlertTriangle, TrendingUp, Clock, FileText, Target } from 'lucide-react'
import { listPendingDealSubmissions } from '../../lib/dealSubmissionStorage'
import { downloadInventoryExport } from '../../lib/inventoryDownload'
import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const safeLower = (value: any) => String(value ?? '').toLowerCase();
const CURRENT_INVENTORY_STATUSES = ['Approved', 'Active', 'Blasted', 'Offers Received', 'Under Contract', 'Closing']

function moneyValue(...values: any[]) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }

  return 0
}

function formatMoneyShort(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2).replace(/\.00$/, '')}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value).toLocaleString()}`
}

function getDealPortfolioValue(deal: any) {
  const pricing = deal?.pricing || {}
  return moneyValue(pricing.askingPrice, pricing.buyerPrice, pricing.contractPrice, pricing.arv)
}

function getDealPotentialFee(deal: any) {
  const pricing = deal?.pricing || {}
  const directFee = moneyValue(pricing.assignmentFee, pricing.fee, pricing.potentialFee, pricing.wholesaleFee)
  if (directFee) return directFee

  const askingPrice = moneyValue(pricing.askingPrice, pricing.buyerPrice, pricing.contractPrice)
  const arv = moneyValue(pricing.arv)

  if (arv && askingPrice && arv > askingPrice) return Math.round((arv - askingPrice) * 0.07)
  return askingPrice ? Math.round(askingPrice * 0.06) : 0
}

export default function Inventory() {
  const { getInventoryDeals, isNewDeal, hydrateInventory } = useAppStore()
  const allInventory = getInventoryDeals()
  const [inventoryLoading, setInventoryLoading] = useState(allInventory.length === 0)
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0)
  const [filter, setFilter] = useState<'All' | 'Active' | 'Under Contract' | 'Closing' | 'Closed/Sold' | 'Dead'>('All')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'All' | string>('All')
  const [viewMode, setViewMode] = useState<'grid' | 'pipeline'>('grid')
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<string[]>([])
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadMode, setDownloadMode] = useState<'selected' | 'all'>('all')
  const [downloadScope, setDownloadScope] = useState<'all' | 'filtered'>('all')
  const [downloadPreparing, setDownloadPreparing] = useState(false)
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'last-updated' | 'price-high' | 'price-low' | 'fee-high' | 'fee-low' | 'grade-a-f' | 'grade-f-a' | 'matches-most' | 'matches-least' | 'potential-most' | 'potential-least' | 'days-newest' | 'days-oldest' | 'needs-first' | 'closing-first' | 'under-first' | 'active-first' | 'type-az' | 'city-az' | 'state-az' | 'address-az' | 'address-za'>('newest')

  const verifyClosedDeal = async (deal: any, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!deal?.closing?.closingDate || !deal?.property?.city || !deal?.property?.state || !deal?.property?.zip) {
      window.alert('Add the closing date, city, state, and ZIP before verifying this closing.')
      return
    }
    if (!window.confirm('Verify that this deal actually closed? This creates a durable closing record for Analytics and Hot Zones.')) return
    const { data } = await supabase.auth.getSession()
    const response = await fetch('/api/property-intelligence/verified-closing', { method: 'POST', headers: {
      Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ inventoryDealId: deal.id, closedAt: deal.closing.closingDate,
      city: deal.property.city, state: deal.property.state, postalCode: deal.property.zip, county: deal.property.county,
      confirmVerified: true, verificationMethod: 'workspace_owner_confirmation' }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return window.alert(payload?.error || 'Closing verification failed.')
    useAppStore.getState().updateDeal(deal.id, { status: 'Sold' })
    window.alert(payload?.duplicate ? 'This closing was already verified.' : 'Closing verified. Hot Zones will update from durable closing data.')
  }

  const filtered = (filter === 'All' ? allInventory : allInventory.filter(d => {
    if (filter === 'Active') return ['Approved','Active','Blasted','Offers Received'].includes(d.status)
    if (filter === 'Under Contract') return d.status === 'Under Contract'
    if (filter === 'Closing') return d.status === 'Closing'
    if (filter === 'Closed/Sold') return d.status === 'Sold'
    if (filter === 'Dead') return d.status === 'Dead'
    return true
  })).filter(d => {
    const matchesSearch = !search || 
      safeLower(d.property.address).includes(safeLower(search)) ||
      safeLower(d.submitter?.name || '').includes(safeLower(search)) ||
      safeLower(d.property.city).includes(safeLower(search))
    const matchesType = typeFilter === 'All' || d.property.type === typeFilter
    const hasAttention = !needsAttentionOnly || (useAppStore.getState().getDealAttentionItems(d) || []).length > 0
    return matchesSearch && matchesType && hasAttention
  })

  const sortedDeals = [...filtered].sort((a, b) => {
    const qa = useAppStore.getState().getDealQualityScore(a.id);
    const qb = useAppStore.getState().getDealQualityScore(b.id);
    const ma = useAppStore.getState().getMatchesForDeal(a.id).length;
    const mb = useAppStore.getState().getMatchesForDeal(b.id).length;
    const pa = useAppStore.getState().getMatchesForDeal(a.id).filter((m: any) => (m.score || 0) >= 80).length;
    const pb = useAppStore.getState().getMatchesForDeal(b.id).filter((m: any) => (m.score || 0) >= 80).length;
    const feeA = getDealPotentialFee(a);
    const feeB = getDealPotentialFee(b);
    const daysA = a.createdAt ? Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 86400000) : 0;
    const daysB = b.createdAt ? Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 86400000) : 0;
    const hasAttA = (useAppStore.getState().getDealAttentionItems(a) || []).length > 0;
    const hasAttB = (useAppStore.getState().getDealAttentionItems(b) || []).length > 0;

    const gradeOrder: Record<string, number> = { 'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'C+': 8, 'C': 7, 'D+': 6, 'D': 5, 'F': 4 };

    switch (sortMode) {
      case 'newest': return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'oldest': return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case 'last-updated': return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      case 'price-high': return getDealPortfolioValue(b) - getDealPortfolioValue(a);
      case 'price-low': return getDealPortfolioValue(a) - getDealPortfolioValue(b);
      case 'fee-high': return feeB - feeA;
      case 'fee-low': return feeA - feeB;
      case 'grade-a-f': return (gradeOrder[qb.grade] || 0) - (gradeOrder[qa.grade] || 0);
      case 'grade-f-a': return (gradeOrder[qa.grade] || 0) - (gradeOrder[qb.grade] || 0);
      case 'matches-most': return mb - ma;
      case 'matches-least': return ma - mb;
      case 'potential-most': return pb - pa;
      case 'potential-least': return pa - pb;
      case 'days-newest': return daysB - daysA;
      case 'days-oldest': return daysA - daysB;
      case 'needs-first': return (hasAttB ? 1 : 0) - (hasAttA ? 1 : 0) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'closing-first': {
        const prio = (d: any) => d.status === 'Closing' ? 3 : d.status === 'Under Contract' ? 2 : 1;
        return prio(b) - prio(a) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      case 'under-first': {
        const prio = (d: any) => d.status === 'Under Contract' ? 3 : d.status === 'Closing' ? 2 : 1;
        return prio(b) - prio(a) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      case 'active-first': {
        const prio = (d: any) => ['Approved','Active','Blasted','Offers Received'].includes(d.status) ? 2 : 1;
        return prio(b) - prio(a) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      case 'type-az': return (a.property.type || '').localeCompare(b.property.type || '');
      case 'city-az': return (a.property.city || '').localeCompare(b.property.city || '');
      case 'state-az': return (a.property.state || '').localeCompare(b.property.state || '');
      case 'address-az': return (a.property.address || '').localeCompare(b.property.address || '');
      case 'address-za': return (b.property.address || '').localeCompare(a.property.address || '');
      default: return 0;
    }
  });

  const isClosingView = filter === 'Closing'
  const kpiDeals = filtered.filter((deal: any) => CURRENT_INVENTORY_STATUSES.includes(deal.status))
  const portfolioValue = kpiDeals.reduce((sum: number, deal: any) => sum + getDealPortfolioValue(deal), 0)
  const potentialFees = kpiDeals.reduce((sum: number, deal: any) => sum + getDealPotentialFee(deal), 0)

  useEffect(() => {
    let alive = true

    const refreshInventory = async () => {
      try {
        await hydrateInventory()
      } finally {
        if (alive) setInventoryLoading(false)
      }
    }

    const refreshPendingSubmissions = async () => {
      const result = await listPendingDealSubmissions()
      if (alive) setPendingSubmissionCount(result.ok ? (result.data || []).length : 0)
    }

    void Promise.all([refreshInventory(), refreshPendingSubmissions()])
    window.addEventListener('focus', refreshPendingSubmissions)
    window.addEventListener('focus', refreshInventory)
    window.addEventListener('dealblastpro:storage-sync', refreshPendingSubmissions)

    return () => {
      alive = false
      window.removeEventListener('focus', refreshPendingSubmissions)
      window.removeEventListener('focus', refreshInventory)
      window.removeEventListener('dealblastpro:storage-sync', refreshPendingSubmissions)
    }
  }, [hydrateInventory])

  const renderPropertySnapshot = (deal: any) => {
    const t = safeLower(deal.property.type || '');
    const p = deal.property || {};

    const safe = (val: any, suffix = '') => (val != null && val !== '' && val !== 0 ? `${val}${suffix}` : 'Not listed');

    if (t.includes('sfh') || t.includes('single')) {
      return (
        <>
          <div>Beds: {safe(p.beds)}</div>
          <div>Baths: {safe(p.baths)}</div>
          <div>SqFt: {safe(p.sqft)}</div>
          <div>{safe(p.occupancy || 'Occupancy')}: {safe(p.occupancyStatus || p.occupancy)}</div>
        </>
      );
    }

    if (t.includes('multi')) {
      const total = p.units ?? p.totalUnits;
      const occupied = p.occupiedUnits ?? p.occupied;
      const vacant = p.vacantUnits ?? p.vacant;
      const occPct = (total && occupied != null) ? Math.round((occupied / total) * 100) + '%' : 'Not listed';
      return (
        <>
          <div>Total Units: {safe(total)}</div>
          <div>Occupied: {safe(occupied)}</div>
          <div>Vacant: {safe(vacant)}</div>
          <div>Occupancy: {occPct}</div>
        </>
      );
    }

    if (t.includes('mhp') || t.includes('rv') || t.includes('park')) {
      const total = p.pads ?? p.totalPads ?? p.lots;
      const occupied = p.occupiedPads ?? p.occupied;
      const vacant = p.vacantPads ?? p.vacant;
      const occPct = (total && occupied != null) ? Math.round((occupied / total) * 100) + '%' : 'Not listed';
      return (
        <>
          <div>Total Pads/Lots: {safe(total)}</div>
          <div>Occupied: {safe(occupied)}</div>
          <div>Vacant: {safe(vacant)}</div>
          <div>Occupancy: {occPct}</div>
        </>
      );
    }

    if (t.includes('storage')) {
      const total = p.units ?? p.totalUnits;
      const occupied = p.occupiedUnits ?? p.occupied;
      const vacant = p.vacantUnits ?? p.vacant;
      const occPct = (total && occupied != null) ? Math.round((occupied / total) * 100) + '%' : 'Not listed';
      return (
        <>
          <div>Total Units: {safe(total)}</div>
          <div>Occupied: {safe(occupied)}</div>
          <div>Vacant: {safe(vacant)}</div>
          <div>Occupancy: {occPct}</div>
        </>
      );
    }

    if (t.includes('hotel')) {
      const rooms = p.rooms ?? p.roomCount ?? p.totalRooms;
      const occupied = p.occupiedRooms ?? p.occupied;
      const occPct = (rooms && occupied != null) ? Math.round((occupied / rooms) * 100) + '%' : 'Not listed';
      return (
        <>
          <div>Rooms: {safe(rooms)}</div>
          <div>Occupied: {safe(occupied)}</div>
          <div>Occupancy: {occPct}</div>
        </>
      );
    }

    if (t.includes('commercial') || t.includes('mixed') || t.includes('retail') || t.includes('office')) {
      const total = p.units ?? p.suites ?? p.totalUnits;
      const occupied = p.occupiedUnits ?? p.occupiedSuites ?? p.occupied;
      const vacant = p.vacantUnits ?? p.vacantSuites ?? p.vacant;
      const occPct = (total && occupied != null) ? Math.round((occupied / total) * 100) + '%' : 'Not listed';
      return (
        <>
          <div>Total Units/Suites: {safe(total)}</div>
          <div>Occupied: {safe(occupied)}</div>
          <div>Vacant: {safe(vacant)}</div>
          <div>Occupancy: {occPct}</div>
        </>
      );
    }

    // Land and fallback
    return (
      <>
        <div>Acres: {safe(p.acres)}</div>
        <div>Zoning: {safe(p.zoning)}</div>
        <div>Utilities: {safe(p.utilities)}</div>
      </>
    );
  }

  const toggleDealSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDeals(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const clearSelection = () => setSelectedDeals([])

  const selectedInventoryDeals = allInventory.filter(d => selectedDeals.includes(d.id))

  const openDownload = (mode: 'selected' | 'all') => {
    if (mode === 'selected' && !selectedDeals.length) return
    setDownloadMode(mode)
    setDownloadScope(mode === 'selected' ? 'filtered' : 'all')
    setDownloadOpen(true)
  }

  const downloadDealsForCurrentChoice = () => {
    if (downloadMode === 'selected') return selectedInventoryDeals
    return downloadScope === 'filtered' ? sortedDeals : allInventory
  }

  const runDownload = async (format: 'pdf' | 'xlsx' | 'csv' | 'json' | 'zip') => {
    if (downloadPreparing) return
    const deals = downloadDealsForCurrentChoice()
    if (!deals.length) {
      alert('No inventory deals are available for this download.')
      return
    }
    setDownloadPreparing(true)
    try {
      await downloadInventoryExport({
        format,
        scope: downloadMode === 'selected' ? 'selected' : downloadScope,
        deals,
        allDeals: allInventory,
        filteredDeals: sortedDeals,
        filters: { search, typeFilter, statusFilter: filter, needsAttentionOnly, sortMode },
      })
      alert('Download ready.')
      if (downloadMode === 'selected') clearSelection()
      setDownloadOpen(false)
    } catch (error) {
      console.warn('[Deal Blast Pro] Inventory download failed', error)
      alert("We couldn't prepare this download. Please try again.")
    } finally {
      setDownloadPreparing(false)
    }
  }

  const bulkUpdateStatus = (newStatus: string) => {
    selectedDeals.forEach(id => {
      useAppStore.getState().updateDeal(id, { status: newStatus as any })
    })
    clearSelection()
  }

  const bulkToggleNeedsAttention = (add: boolean) => {
    // For demo: toggle dismissedAttention for each
    selectedDeals.forEach(id => {
      const deal = allInventory.find(d => d.id === id)
      if (!deal) return
      // Simple demo: if add, clear some; else add a dummy
      if (add) {
        useAppStore.getState().updateDeal(id, { /* demo */ })
      }
    })
    clearSelection()
  }

  const deleteInventoryDealIds = (ids: string[]) => {
    const idsToDelete = Array.from(new Set((ids || []).filter(Boolean)))
    if (!idsToDelete.length) return

    const removeSet = new Set(idsToDelete)

    useAppStore.getState().deleteDeals(idsToDelete)

    setSelectedDeals(prev => prev.filter(id => !removeSet.has(id)))
  }

  const bulkDelete = () => {
    if (!selectedDeals.length) {
      alert('No deals selected.')
      return
    }

    if (!confirm(`Delete ${selectedDeals.length} selected deal(s)? This cannot be undone.`)) return

    deleteInventoryDealIds(selectedDeals)
    clearSelection()
  }

  const getDealBorderColor = (deal: any) => {
    const q = useAppStore.getState().getDealQualityScore(deal.id)
    const grade = q?.grade || 'C'
    const hasAttention = (useAppStore.getState().getDealAttentionItems(deal) || []).length > 0

    if (hasAttention) return '#ef4444' // red pulse handled separately if needed

    if (deal.status === 'Dead') return '#6b7280' // gray
    if (deal.status === 'Sold') return '#3b82f6' // blue
    if (deal.status === 'Closing') return '#f59e0b' // amber
    if (deal.status === 'Under Contract') return '#8b5cf6' // purple

    // Grade based
    if (grade === 'A' || grade === 'A+') return '#22c55e' // green
    if (grade === 'B' || grade === 'B+') return '#eab308' // gold/yellow
    if (grade === 'C' || grade === 'C+') return '#f97316' // orange
    if (grade === 'D' || grade === 'F') return '#ef4444' // red

    return '#3b82f6' // default blue/cyan
  }

  return (
    <div>
      <div className="flex justify-between mb-4 items-end">
        <div>
          <div className="uppercase tracking-widest text-xs text-[#8B92A3]">INVENTORY HUB</div>
          <div className="text-2xl font-semibold">
            {inventoryLoading && allInventory.length === 0 ? 'Loading inventory...' : `Active Portfolio — ${filtered.length} deals`}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => openDownload('selected')}
            disabled={!selectedDeals.length || downloadPreparing}
            className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download Selected
          </button>
          <button
            onClick={() => openDownload('all')}
            disabled={!allInventory.length || downloadPreparing}
            className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download All
          </button>
          <Link to="/app/submissions" className="btn btn-ghost">Review Submissions ({pendingSubmissionCount})</Link>
        </div>
      </div>

      {/* Portfolio KPI Bar - Command Center style */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4 text-sm">
        {[
          { 
            label: 'Portfolio Value', value: formatMoneyShort(portfolioValue), icon: DollarSign, 
            bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-[#22C55E]',
            filter: 'All'
          },
          { 
            label: 'Potential Fees', value: formatMoneyShort(potentialFees), icon: TrendingUp, 
            bg: 'bg-teal-500/15', border: 'border-teal-500/30', text: 'text-emerald-400',
            filter: 'All'
          },
          { 
            label: 'Active Deals', value: kpiDeals.length, icon: Target, 
            bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-[#3B82F6]',
            filter: 'Active'
          },
          { 
            label: 'Under Contract', value: kpiDeals.filter(d => d.status === 'Under Contract').length, icon: FileText, 
            bg: 'bg-purple-500/15', border: 'border-purple-500/30', text: 'text-purple-400',
            filter: 'Under Contract'
          },
          { 
            label: 'Closing', value: kpiDeals.filter(d => d.status === 'Closing').length, icon: Clock, 
            bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400',
            filter: 'Closing'
          },
          { 
            label: 'Needs Attention', value: kpiDeals.filter(d => (useAppStore.getState().getDealAttentionItems(d) || []).length > 0).length, icon: AlertTriangle, 
            bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400',
            filter: 'NeedsAttention'
          },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div 
              key={i} 
              onClick={() => {
                if (kpi.filter === 'NeedsAttention') {
                  setNeedsAttentionOnly(true);
                  setFilter('All');
                } else {
                  setNeedsAttentionOnly(false);
                  setFilter(kpi.filter as any);
                }
              }}
              className={`${kpi.bg} ${kpi.border} border rounded-2xl p-3.5 cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:ring-1 hover:ring-offset-1 hover:ring-offset-[#0A0C12] hover:ring-[#22C55E]/30 group`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={kpi.text} />
                <div className="text-xs text-[#CBD5E1] font-medium">{kpi.label}</div>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${kpi.text}`}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="mb-3 space-y-2">
        <input 
          className="input w-full" 
          placeholder="Search address, seller, city..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
        
        <div className="flex flex-wrap gap-1 text-xs">
          {['All','SFH','Multifamily','MHP','Storage','Hotel','Commercial','Land'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`btn btn-ghost px-2 py-0.5 ${typeFilter === t ? 'ring-1 ring-[#3B82F6]' : ''}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Status tabs + Needs Attention Filter */}
        <div className="flex flex-wrap gap-1 text-xs">
          {(['All','Active','Under Contract','Closing','Closed/Sold','Dead'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setNeedsAttentionOnly(false); }} className={`btn btn-ghost px-2 py-0.5 ${filter === f && !needsAttentionOnly ? 'ring-1 ring-[#22C55E]' : ''}`}>
              {f}
            </button>
          ))}

          <button 
            onClick={() => { setNeedsAttentionOnly(!needsAttentionOnly); setFilter('All'); }} 
            className={`btn btn-ghost px-2 py-0.5 flex items-center gap-1 ${needsAttentionOnly ? 'ring-1 ring-amber-500 text-amber-400' : ''}`}
          >
            <AlertTriangle size={12} /> Needs Attention
          </button>

          <div className="ml-auto flex gap-1 items-center">
            <select 
              value={sortMode} 
              onChange={e => setSortMode(e.target.value as any)} 
              className="select text-xs py-0.5 w-auto"
            >
              <option value="newest">Newest Added</option>
              <option value="oldest">Oldest Added</option>
              <option value="last-updated">Last Updated</option>
              <option value="price-high">Highest Asking Price</option>
              <option value="price-low">Lowest Asking Price</option>
              <option value="fee-high">Highest Est Fee</option>
              <option value="fee-low">Lowest Est Fee</option>
              <option value="grade-a-f">Deal Grade (A → F)</option>
              <option value="grade-f-a">Deal Grade (F → A)</option>
              <option value="matches-most">Most Buyer Matches</option>
              <option value="matches-least">Least Buyer Matches</option>
              <option value="potential-most">Most Potential Buyers</option>
              <option value="potential-least">Least Potential Buyers</option>
              <option value="days-newest">Days In Hub (Newest)</option>
              <option value="days-oldest">Days In Hub (Oldest)</option>
              <option value="needs-first">Needs Attention First</option>
              <option value="closing-first">Closing First</option>
              <option value="under-first">Under Contract First</option>
              <option value="active-first">Active First</option>
              <option value="type-az">Property Type (A-Z)</option>
              <option value="city-az">City (A-Z)</option>
              <option value="state-az">State (A-Z)</option>
              <option value="address-az">Address (A-Z)</option>
              <option value="address-za">Address (Z-A)</option>
            </select>
            <button onClick={() => setViewMode('grid')} className={`btn btn-ghost px-2 py-0.5 ${viewMode === 'grid' ? 'ring-1 ring-[#3B82F6]' : ''}`}>Grid</button>
            <button onClick={() => setViewMode('pipeline')} className={`btn btn-ghost px-2 py-0.5 ${viewMode === 'pipeline' ? 'ring-1 ring-[#3B82F6]' : ''}`}>Pipeline</button>
          </div>
        </div>
      </div>

      {downloadOpen && (
        <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4" onClick={() => !downloadPreparing && setDownloadOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-[#252A38] bg-[#12151F] p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[#E6E8EE]">
                  {downloadMode === 'selected' ? 'Download Selected Deals' : 'Download Inventory'}
                </div>
                <div className="text-sm text-[#8B92A3] mt-1">
                  {downloadMode === 'selected'
                    ? `${selectedInventoryDeals.length} selected deal${selectedInventoryDeals.length === 1 ? '' : 's'}`
                    : downloadScope === 'filtered'
                      ? `${sortedDeals.length} current filtered result${sortedDeals.length === 1 ? '' : 's'}`
                      : `${allInventory.length} inventory deal${allInventory.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <button disabled={downloadPreparing} onClick={() => setDownloadOpen(false)} className="btn btn-ghost text-xs disabled:opacity-50">Close</button>
            </div>

            {downloadMode === 'all' && (
              <div className="mt-4 rounded border border-[#252A38] bg-[#0A0C12] p-3">
                <div className="text-xs uppercase tracking-widest text-[#8B92A3] mb-2">Scope</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button onClick={() => setDownloadScope('all')} className={`btn btn-ghost text-xs ${downloadScope === 'all' ? 'ring-1 ring-[#22C55E]' : ''}`}>All Inventory</button>
                  <button onClick={() => setDownloadScope('filtered')} className={`btn btn-ghost text-xs ${downloadScope === 'filtered' ? 'ring-1 ring-[#22C55E]' : ''}`}>Current Filtered Results</button>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button disabled={downloadPreparing} onClick={() => runDownload('pdf')} className="btn btn-green text-xs disabled:opacity-50">Download as PDF</button>
              <button disabled={downloadPreparing} onClick={() => runDownload('xlsx')} className="btn btn-ghost text-xs disabled:opacity-50">Download as Excel</button>
              <button disabled={downloadPreparing} onClick={() => runDownload('csv')} className="btn btn-ghost text-xs disabled:opacity-50">Download as CSV</button>
              <button disabled={downloadPreparing} onClick={() => runDownload('json')} className="btn btn-ghost text-xs disabled:opacity-50">Download as JSON</button>
              {downloadMode === 'all' && (
                <button disabled={downloadPreparing} onClick={() => runDownload('zip')} className="btn btn-ghost text-xs sm:col-span-2 disabled:opacity-50">Download Complete Package</button>
              )}
            </div>

            <div className="mt-3 text-xs text-[#8B92A3]">
              {downloadPreparing ? 'Preparing your inventory export...' : 'Uploaded private file URLs are not included. Document and photo manifests are included instead.'}
            </div>
          </div>
        </div>
      )}

      {isClosingView ? (
        /* Dedicated Closing view with required fields */
        <div className="space-y-2">
          {filtered.length === 0 && <div className="text-[#8B92A3]">No deals in Closing status yet. Use "Move to Closing" from the drawer.</div>}
          {filtered.map(deal => (
            <div key={deal.id} onClick={() => useAppStore.getState().safeOpenDeal(deal.id)} className="card p-4 hover:border-[#22C55E]/40 cursor-pointer">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">{deal.property.address}</div>
                  <div className="text-xs text-[#8B92A3]">{deal.property.city}, {deal.property.state}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="badge status-approved">{deal.status}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-xs">
                <div><span className="text-[#8B92A3]">Buyer/Entity:</span> {deal.closing?.buyerEntity || deal.submitter.name}</div>
                <div><span className="text-[#8B92A3]">Title Company:</span> {deal.closing?.titleCompany || deal.debt?.titleCompany || 'Not Provided'}</div>
                <div><span className="text-[#8B92A3]">Closing Date:</span> {deal.closing?.closingDate || 'Not Provided'}</div>
                <div><span className="text-[#8B92A3]">Escrow Officer:</span> {deal.closing?.escrowOfficer || 'Not Provided'}</div>
                <div><span className="text-[#8B92A3]">EMD:</span> {deal.closing?.emdAmount ? '$' + deal.closing.emdAmount : 'Not Provided'} / {deal.closing?.emdDate || ''}</div>
                <div><span className="text-[#8B92A3]">Funding:</span> {deal.closing?.fundingStatus || 'Not Provided'}</div>
                <div><span className="text-[#8B92A3]">Commission (Exp/Paid):</span> {deal.closing?.commissionExpected || '—'} / {deal.closing?.commissionPaid || '—'}</div>
                <div><span className="text-[#8B92A3]">Checklist:</span> {deal.closing?.checklist ? Object.values(deal.closing.checklist).filter(Boolean).length + ' done' : 'Not Provided'}</div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[10px] text-[#8B92A3]">A status or closing date alone does not count. Verify only after the transaction actually closes.</div>
                <button onClick={(event) => void verifyClosedDeal(deal, event)} className="btn btn-green text-xs whitespace-nowrap">Verify & Mark Closed</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        viewMode === 'grid' ? (
          <div className="grid-view-wrap">
            {/* Bulk Action Bar */}
            {selectedDeals.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 bg-[#171B26] border border-[#252A38] rounded-xl p-3 text-sm">
                <span className="font-medium text-[#22C55E]">{selectedDeals.length} selected</span>
                <button onClick={() => bulkUpdateStatus('Active')} className="btn btn-ghost text-xs px-3 py-1">Mark Active</button>
                <button onClick={() => bulkUpdateStatus('Under Contract')} className="btn btn-ghost text-xs px-3 py-1">Mark Under Contract</button>
                <button onClick={() => bulkUpdateStatus('Closing')} className="btn btn-ghost text-xs px-3 py-1">Mark Closing</button>
                <button onClick={() => bulkUpdateStatus('Sold')} className="btn btn-ghost text-xs px-3 py-1">Mark Closed/Sold</button>
                <button onClick={() => bulkUpdateStatus('Dead')} className="btn btn-ghost text-xs px-3 py-1 text-red-400">Mark Dead</button>
                <button onClick={() => bulkToggleNeedsAttention(true)} className="btn btn-ghost text-xs px-3 py-1">Add Needs Attention</button>
                <button onClick={() => bulkToggleNeedsAttention(false)} className="btn btn-ghost text-xs px-3 py-1">Remove Needs Attention</button>
                <button onClick={() => openDownload('selected')} className="btn btn-ghost text-xs px-3 py-1">Download Selected</button>
                <button onClick={bulkDelete} className="btn btn-ghost text-xs px-3 py-1 text-red-400">Delete Selected</button>
                <button onClick={() => {
                  const ids = sortedDeals.map((d: any) => d.id)
                  if (!ids.length) return alert('No visible deals to delete.')
                  if (!confirm(`Delete all ${ids.length} visible/filtered deal(s)? This cannot be undone.`)) return
                  deleteInventoryDealIds(ids)
                  clearSelection()
                }} className="btn btn-ghost text-xs px-3 py-1 text-red-500">Delete All Visible</button>
                <button onClick={clearSelection} className="btn btn-ghost text-xs px-3 py-1 ml-auto">Clear Selection</button>
              </div>
            )}

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedDeals.map(deal => (
            <div key={deal.id} onClick={() => useAppStore.getState().safeOpenDeal(deal.id)} className={`deal-card interactive-border property relative group flex flex-col h-full ${selectedDeals.includes(deal.id) ? 'is-selected' : ''}`} style={{ '--border-color': getDealBorderColor(deal) } as any}>
              {isNewDeal(deal.id) && <div className="new-badge">NEW</div>}
              {/* Selection checkbox - clean top-left with spacing */}
              <div className="absolute top-3 left-3 z-20" onClick={(e) => toggleDealSelection(deal.id, e)}>
                <input
                  type="checkbox"
                  checked={selectedDeals.includes(deal.id)}
                  onChange={() => {}} // handled by parent div
                  className="w-4 h-4 accent-[#22C55E] cursor-pointer"
                />
              </div>
              <div className="flex justify-between items-start mb-1 pl-8">
                <div className="text-lg font-bold leading-tight">{deal.property.address}</div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const label = deal?.property?.address || 'this deal'
                    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return
                    deleteInventoryDealIds([deal.id])
                  }}
                  className="btn btn-ghost px-2 py-0.5 text-xs text-red-400 hover:text-red-300"
                  title="Delete inventory deal"
                >
                  Delete
                </button>
                {/* Property Type badge moved to header right side */}
                <div className="flex-shrink-0">
                  {(() => {
                    const t = deal.property.type;
                    const k = safeLower(t).replace(/[^a-z0-9]/g, '');
                    let color = 'bg-[#171B26] text-[#A5B4C8]';
                    if (k.includes('sfh') || k.includes('single')) color = 'bg-blue-500/15 text-blue-300';
                    else if (k.includes('multi')) color = 'bg-purple-500/15 text-purple-300';
                    else if (k.includes('mhp')) color = 'bg-teal-500/15 text-teal-300';
                    else if (k.includes('hotel')) color = 'bg-pink-500/15 text-pink-300';
                    else if (k.includes('retail')) color = 'bg-orange-500/15 text-orange-300';
                    else if (k.includes('storage')) color = 'bg-cyan-500/15 text-cyan-300';
                    else if (k.includes('land')) color = 'bg-emerald-500/15 text-emerald-300';
                    else if (k.includes('mixed')) color = 'bg-violet-500/15 text-violet-300';
                    else if (k.includes('commercial')) color = 'bg-slate-400/15 text-slate-300';
                    return <span className={`badge text-sm px-3 py-1 flex items-center gap-1 ${color}`}>{t}</span>;
                  })()}
              </div>
              </div>
              <div className="text-sm text-[#8B92A3] mb-2">{deal.property.city}, {deal.property.state}</div>

              {/* 6-panel organization (3x2 grid) for clean scannability */}
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">

                {/* 1. Property Snapshot */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-2.5 flex flex-col items-center text-center">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-0.5 text-xs font-semibold border-b border-[#67E8F9]/20 pb-px">Property Snapshot</div>
                  <div className="text-center">
                    {renderPropertySnapshot(deal)}
                  </div>
                </div>

                {/* 2. Deal Quality */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 flex flex-col items-center text-center">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-1 text-xs font-semibold border-b border-[#67E8F9]/20 pb-px">Deal Quality</div>
                  <div className="flex flex-wrap gap-1.5 justify-center items-center">
                    {(() => {
                      const issues = useAppStore.getState().getDealAttentionItems(deal)
                      if (issues.length === 0) return null
                      return (
                        <span className="badge bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 flex items-center gap-1 cursor-help" title={`Missing: ${issues.slice(0,3).join(', ')}${issues.length > 3 ? '...' : ''}`}>
                          Needs Attention ({issues.length})
                        </span>
                      )
                    })()}
                    {(() => {
                      const q = useAppStore.getState().getDealQualityScore(deal.id)
                      const matchList = useAppStore.getState().getMatchesForDeal(deal.id) || [];
                      const highQualityCount = matchList.filter((m: any) => (m.score || 0) >= 80).length;
                      const demand = highQualityCount >= 10 ? 'High' : highQualityCount >= 3 ? 'Moderate' : highQualityCount >= 1 ? 'Low' : 'No';
                      const getGradeLabel = (score: number) => {
                        if (score >= 97) return 'A+'
                        if (score >= 93) return 'A'
                        if (score >= 90) return 'A-'
                        if (score >= 87) return 'B+'
                        if (score >= 83) return 'B'
                        if (score >= 80) return 'B-'
                        if (score >= 77) return 'C+'
                        if (score >= 73) return 'C'
                        if (score >= 70) return 'C-'
                        if (score >= 67) return 'D+'
                        if (score >= 63) return 'D'
                        if (score >= 60) return 'D-'
                        return 'F'
                      }
                      const gradeLabel = getGradeLabel(q.score);
                      const gradeColor = gradeLabel.startsWith('A') ? 'bg-emerald-500/20 text-emerald-400' :
                                         gradeLabel.startsWith('B') ? 'bg-yellow-500/20 text-yellow-400' :
                                         gradeLabel.startsWith('C') ? 'bg-orange-500/20 text-orange-400' :
                                         (gradeLabel === 'D' || gradeLabel === 'F') ? 'bg-red-500/20 text-red-400' :
                                         'bg-[#171B26] text-[#A5B4C8]';
                      return (
                        <>
                          <span className={`badge text-xs px-1.5 py-0.5 ${gradeColor}`}>
                            {gradeLabel} • {q.score}%
                          </span>
                          <span className={`badge text-xs px-1.5 py-0.5 mt-0.5 ${demand === 'High' ? 'bg-emerald-500/20 text-emerald-400' : demand === 'Moderate' ? 'bg-amber-500/20 text-amber-400' : demand === 'Low' ? 'bg-[#171B26] text-[#8B92A3]' : 'bg-[#171B26] text-[#8B92A3]'}`}>
                            {demand === 'No' ? 'No Demand' : `${demand} Demand`}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* 3. Contact */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-2.5 flex flex-col items-center text-center">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-0.5 text-xs font-semibold border-b border-[#67E8F9]/20 pb-px">Contact</div>
                  <div className="text-sm font-medium text-white mb-0.5">{deal.submitter.name}</div>
                  <div className="text-[10px] text-[#8B92A3]">{deal.submitter.email || 'No email on file'}</div>
                  <div className="text-[10px] text-[#8B92A3]">{deal.submitter.phone || 'No phone on file'}</div>
                </div>

                {/* 4. Pricing */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-2.5 flex flex-col items-center text-center">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-0.5 text-xs font-semibold border-b border-[#67E8F9]/20 pb-px">Pricing</div>
                  <div>
                    <div className="text-[9px] text-[#8B92A3]">ASKING</div>
                    <div className="text-base font-bold tabular-nums text-[#22C55E]">{deal.pricing.askingPrice ? '$' + deal.pricing.askingPrice.toLocaleString() : '—'}</div>
                  </div>
                  {(() => {
                    const fee = deal.pricing.arv && deal.pricing.askingPrice 
                      ? Math.round((deal.pricing.arv - deal.pricing.askingPrice) * 0.07) 
                      : Math.round((deal.pricing.askingPrice || 0) * 0.06);
                    const offers = (useAppStore.getState().offers?.[deal.id] || []).length;
                    return (
                      <>
                        {fee > 0 && <div className="text-[10px] text-[#22C55E] mt-0.5">Est Fee ${fee.toLocaleString()}</div>}
                        {offers > 0 && <div className="text-[10px] text-emerald-400">+{offers} Offers</div>}
                      </>
                    );
                  })()}
                </div>

                {/* 5. Buyer Match */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-1 text-xs font-semibold text-center border-b border-[#67E8F9]/20 pb-px">Buyer Match</div>
                  {(() => {
                    const matches = useAppStore.getState().getMatchesForDeal(deal.id) || [];
                    const strong = matches.filter((m: any) => (m.score || 0) >= 90).length;
                    const potential = matches.filter((m: any) => (m.score || 0) >= 80).length;
                    const highQualityCount = matches.filter((m: any) => (m.score || 0) >= 80).length;
                    const demand = highQualityCount >= 10 ? 'High' : highQualityCount >= 3 ? 'Moderate' : highQualityCount >= 1 ? 'Low' : null;
                    return (
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="text-[#22C55E] font-medium">Strong: {strong}</div>
                        <div className="text-[#3B82F6] font-medium mt-0.5">Potential: {potential}</div>
                        {demand && <div className="text-[10px] text-[#8B92A3] mt-1">{demand} Demand</div>}
                      </div>
                    );
                  })()}
                </div>

                {/* 6. Activity */}
                <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-2.5 flex flex-col items-center text-center">
                  <div className="uppercase tracking-wider text-[#67E8F9] mb-0.5 text-xs font-semibold border-b border-[#67E8F9]/20 pb-px">Activity</div>
                  {(() => {
                    const docs = (deal.docs?.length || 0) + (useAppStore.getState().documents?.[deal.id]?.length || 0);
                    const photos = Math.max(0, Math.floor(docs * 0.6));
                    const activities = useAppStore.getState().getActivities?.(deal.id) || [];
                    const lastActivity = activities.length > 0 ? new Date(activities[activities.length-1].timestamp).toLocaleDateString() : null;
                    const created = deal.createdAt ? new Date(deal.createdAt) : null;
                    const days = created ? Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000)) : 0;
                    return (
                      <>
                        <div>{photos} Photos • {docs} Docs</div>
                        {lastActivity && <div className="mt-0.5">Last: {lastActivity}</div>}
                        <div>In Hub: {days}d</div>
                      </>
                    );
                  })()}
                </div>

              </div>

              <div className="flex-1"></div>

              {/* Bottom metadata footer row */}
              <div className="mt-auto pt-3 border-t border-[#252A38] flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#8B92A3] font-medium">
                {(() => {
                  const docs = (deal.docs?.length || 0) + (useAppStore.getState().documents?.[deal.id]?.length || 0);
                  const photos = Math.max(0, Math.floor(docs * 0.6));
                  const offers = (useAppStore.getState().offers?.[deal.id] || []).length;
                  const allMatches = useAppStore.getState().getMatchesForDeal(deal.id) || [];
                  const potential = allMatches.filter((m: any) => (m.score || 0) >= 80).length;
                  const fee = deal.pricing.arv && deal.pricing.askingPrice 
                    ? Math.round((deal.pricing.arv - deal.pricing.askingPrice) * 0.07) 
                    : Math.round((deal.pricing.askingPrice || 0) * 0.06);
                  const issues = useAppStore.getState().getDealAttentionItems(deal);
                  const activities = useAppStore.getState().getActivities?.(deal.id) || [];
                  const lastActivity = activities.length > 0 ? new Date(activities[activities.length-1].timestamp).toLocaleDateString() : null;
                  return (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171B26] text-xs">{photos} Photos</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171B26] text-xs">{docs} Docs</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171B26] text-xs text-[#3B82F6]">{potential} Potential Buyers</span>
                      {offers > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs">{offers} Offers</span>}
                      {fee > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E] text-xs">Est ${fee.toLocaleString()}</span>}
                      {issues.length > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs">Needs {issues.length}</span>}
                      {lastActivity && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171B26] text-xs">Last: {lastActivity}</span>}
                    </>
                  );
                })()}
              </div>

              {/* Hover Quick Actions (top-right, non-consuming per spec) */}
              <div className="absolute top-2 right-2 hidden group-hover:flex gap-1 text-[10px] bg-[#0A0C12]/90 px-1.5 py-0.5 rounded border border-[#252A38] z-10">
                <button onClick={(e) => { e.stopPropagation(); useAppStore.getState().safeOpenDeal(deal.id); }} className="hover:text-[#22C55E]">View</button>
                <button onClick={(e) => { e.stopPropagation(); useAppStore.getState().safeOpenDeal(deal.id); }} className="hover:text-[#3B82F6]">Edit</button>
                <button onClick={(e) => { e.stopPropagation(); /* open blast with this deal */ window.location.href = `/app/blast?deal=${deal.id}`; }} className="hover:text-purple-400">Blast</button>
                <button onClick={(e) => { e.stopPropagation(); window.location.href = `/app/blast?deal=${deal.id}`; }} className="hover:text-amber-400">Buyer Match</button>
              </div>
            </div>
          ))}
          </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            {['Approved','Active','Blasted','Offers Received','Under Contract','Closing','Closed/Sold','Dead'].map(stage => {
              const stageDeals = sortedDeals.filter(d => {
                if (stage === 'Approved') return ['Approved','Active'].includes(d.status);
                if (stage === 'Blasted') return d.status === 'Blasted';
                if (stage === 'Offers Received') return d.status === 'Offers Received';
                if (stage === 'Closed/Sold') return d.status === 'Sold';
                if (stage === 'Dead') return d.status === 'Dead';
                return d.status === stage;
              });
              if (stageDeals.length === 0) return null;
              return (
                <div key={stage}>
                  <div className="font-medium text-[#8B92A3] mb-1">{stage} ({stageDeals.length})</div>
                  {stageDeals.map(d => (
                    <div key={d.id} onClick={() => useAppStore.getState().safeOpenDeal(d.id)} className="card p-2 hover:border-[#3B82F6]/40 cursor-pointer flex justify-between">
                      <span>{d.property.address}</span>
                      <span className="text-[#8B92A3] text-xs">{d.pricing.askingPrice ? '$' + d.pricing.askingPrice.toLocaleString() : ''}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      )}

      {filtered.length === 0 && !isClosingView && (
        <div className="empty-state text-[#8B92A3]">
          <div className="text-[#E6E8EE] font-medium mb-1">No inventory yet.</div>
          <div className="text-sm">Approve a public submission from the Deal Submissions queue, or add a deal through manual intake, then active inventory KPIs will populate here.</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link to="/app/submissions" className="btn btn-green">Review Submissions</Link>
            <Link to="/app/intake" className="btn btn-ghost">Add Inventory</Link>
          </div>
        </div>
      )}
    </div>
  )
}
