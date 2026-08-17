import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { Plus, Users, Upload, Send, Building2, Clock, FileText, DollarSign, AlertTriangle } from 'lucide-react'
import { countPendingBuyerPortalSubmissions, listRecentBuyerPortalSubmissionActivity } from '../../lib/buyerPortalSubmissionStorage'
import { countPendingDealSubmissionDocs, countPendingDealSubmissions, getDealSubmissionConversionMeta, listRecentDealSubmissionActivity } from '../../lib/dealSubmissionStorage'
import { isSuperAdmin } from '../../lib/accessControl'
import { getBillingNotice, hasEffectiveOwnerAdminBypass, isOwnerPreviewActive } from '../../lib/planAccess'


export default function Dashboard() {

  // DASHBOARD_PENDING_PORTAL_COUNT_FIX
  const [pendingBuyerPortalCount, setPendingBuyerPortalCount] = useState(0)
  const [pendingDealSubmissionCount, setPendingDealSubmissionCount] = useState(0)
  const [pendingDocsCount, setPendingDocsCount] = useState(0)
  const { getInventoryDeals, getSubmissionsQueue, deals, buyers, trial, settings, user } = useAppStore()
  const ownerAdminToolsVisible = hasEffectiveOwnerAdminBypass(user, settings)

  const refreshPendingBuyerPortalCount = async () => {
    try {
      setPendingBuyerPortalCount(await countPendingBuyerPortalSubmissions())
    } catch (error) {
      console.warn('[Deal Blast Pro] Failed to refresh buyer portal pending count', error)
      setPendingBuyerPortalCount(0)
    }
  }

  const refreshPendingDealSubmissionCount = async () => {
    try {
      const [pendingResult, pendingDocsResult] = await Promise.all([
        countPendingDealSubmissions(),
        countPendingDealSubmissionDocs(),
      ])
      setPendingDealSubmissionCount(pendingResult.ok ? pendingResult.count : 0)
      setPendingDocsCount(pendingDocsResult.ok ? pendingDocsResult.count : 0)
    } catch (error) {
      console.warn('[Deal Blast Pro] Failed to refresh deal submission pending count', error)
      setPendingDealSubmissionCount(0)
      setPendingDocsCount(0)
    }
  }

  useEffect(() => {
    if (!ownerAdminToolsVisible) return
    refreshPendingBuyerPortalCount()
    refreshPendingDealSubmissionCount()

    const refresh = () => {
      refreshPendingBuyerPortalCount()
      refreshPendingDealSubmissionCount()
    }

    window.addEventListener('focus', refresh)
    window.addEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
    window.addEventListener('dealblastpro:deal-submission-queue-changed', refresh)

    const interval = window.setInterval(refresh, 60000)

    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
      window.removeEventListener('dealblastpro:deal-submission-queue-changed', refresh)
      window.clearInterval(interval)
    }
  }, [ownerAdminToolsVisible])

  const navigate = useNavigate()
  const billingNotice = getBillingNotice(trial, settings.deletionRequest)
  const ownerPreviewActive = isOwnerPreviewActive(user, settings)
  const showBillingNotice = (!isSuperAdmin(user) || ownerPreviewActive) && billingNotice.kind !== 'none'
  const displayName = String(user?.displayName || '').trim()
  const fullName = String(user?.fullName || user?.name || '').trim()
  const firstName = fullName.split(/\s+/)[0]
  const commandCenterTitle = displayName
    ? `${displayName} Command Center`
    : firstName
      ? `${firstName} Command Center`
      : 'Command Center'
  const inventory = getInventoryDeals()
  const submissions = getSubmissionsQueue()
  const totalDealSubmissionNotifications = Math.max(submissions.length, pendingDealSubmissionCount)

  const liveDeals = (deals || []).filter((d: any) => d?.id)
  const currentDeals = liveDeals.filter((d: any) => String(d.status || '').toLowerCase() !== 'dead')
  const liveDealIds = new Set(currentDeals.map((d: any) => d.id))
  const liveOffers = Object.entries(useAppStore.getState().offers || {})
    .filter(([dealId]) => liveDealIds.has(dealId))
    .flatMap(([, offs]) => Array.isArray(offs) ? offs : [])
  const pendingLiveOffers = liveOffers.filter((o: any) => o.status === 'New' || o.status === 'Reviewing')

  const buyerResponses = useAppStore.getState().buyerResponses || {}
  const responseList = Object.values(buyerResponses).flatMap((responsesByDeal: any) =>
    Object.entries(responsesByDeal || {})
      .filter(([dealId]) => liveDealIds.has(dealId))
      .map(([, response]) => response)
  ) as any[]

  const responseAnalytics = {
    interested: responseList.filter((r: any) => r.status === 'Interested').length,
    passed: responseList.filter((r: any) => r.status === 'Passed').length,
    noResponse: responseList.filter((r: any) => r.status === 'No Response').length,
    offers: liveOffers.length,
    responseRate: buyers.length > 0 ? Math.round((responseList.length / buyers.length) * 100) : 0,
    conversionRate: responseList.length > 0 ? Math.round((liveOffers.length / responseList.length) * 100) : 0,
  }

  const kpis = [
    { label: 'Total / Active Deals', value: inventory.length, link: '/app/inventory', color: 'text-[#22C55E]' },
    ...(ownerAdminToolsVisible ? [{ label: 'Submissions', value: totalDealSubmissionNotifications, link: '/app/submissions', color: 'text-[#3B82F6]' }] : []),
    { label: 'Buyer Matches', value: buyers.length, link: '/app/buyers', color: 'text-[#22C55E]' },
    { label: 'Offers Received', value: pendingLiveOffers.length, link: '/app/pipeline', color: 'text-amber-400' },
    ...(ownerAdminToolsVisible ? [{ label: 'Pending Docs', value: pendingDocsCount, link: '/app/submissions?filter=pending-docs', color: 'text-[#F59E0B]' }] : []),
  ]

  const totalBuyerReviewNotifications = pendingBuyerPortalCount

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3]">COMMAND CENTER</div>
          <div className="text-3xl font-semibold tracking-tight">{commandCenterTitle}</div>
        </div>
        <div className="flex gap-2">
          <Link to="/app/intake" className="btn btn-ghost flex items-center gap-2"><Plus size={16} /> Manual Intake</Link>
          <Link to="/app/buyers" className="btn btn-ghost flex items-center gap-2"><Users size={16} /> Import Buyers</Link>
          <Link to="/app/inventory" className="btn btn-primary flex items-center gap-2"><Building2 size={16} /> View Inventory</Link>
          <button 
            onClick={() => {
              const result = useAppStore.getState().runSampleWorkflow()
              setTimeout(() => useAppStore.getState().safeOpenDeal(result.dealId), 600)
            }} 
            className="btn btn-green flex items-center gap-2"
          >
            Run Sample Workflow
          </button>
        </div>
      </div>

      {showBillingNotice && (
        <div className={`card p-4 mb-6 border ${billingNotice.kind.includes('past-due') ? 'border-rose-500/30 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing Notice</div>
              <div className="text-lg font-semibold">{billingNotice.title}</div>
              <div className="text-sm text-[#C5CAD6] mt-1">{billingNotice.message}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(billingNotice.kind === 'payment-pending' || billingNotice.kind.includes('past-due')) && (
                <button onClick={() => navigate('/app/upgrade')} className="btn btn-green text-sm">Complete Payment</button>
              )}
              <button onClick={() => navigate('/app/settings')} className="btn btn-ghost text-sm">View Billing Center</button>
              {(billingNotice.kind === 'payment-pending' || billingNotice.kind.includes('past-due')) && (
                <button onClick={() => navigate('/contact')} className="btn btn-ghost text-sm">Contact Support</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map((k, i) => {
          // Stronger dark premium SaaS color identity (tinted bg + heavy border + subtle glow)
          // Icons and inner structure unchanged
          const accent = [
            // Total / Active Deals - Dark blue filled gradient
            { 
              bg: 'bg-gradient-to-br from-[#0B1120] to-[#1E3A5F]', 
              border: 'border border-[#3B82F6]/60 border-l-[3px] border-l-[#3B82F6]', 
              glow: 'shadow-[0_0_14px_rgba(59,130,246,0.15)]', 
              hover: 'hover:scale-[1.03] hover:shadow-xl hover:ring-1 hover:ring-offset-1 hover:ring-[#3B82F6]/40', 
              icon: Building2, 
              iconColor: 'text-[#3B82F6]/80' 
            },
            // Submissions - Dark amber/gold filled gradient
            { 
              bg: 'bg-gradient-to-br from-[#1C1917] to-[#78350F]', 
              border: 'border border-[#F59E0B]/60 border-l-[3px] border-l-[#F59E0B]', 
              glow: 'shadow-[0_0_14px_rgba(245,158,11,0.15)]', 
              hover: 'hover:scale-[1.03] hover:shadow-xl hover:ring-1 hover:ring-offset-1 hover:ring-[#F59E0B]/40', 
              icon: FileText, 
              iconColor: 'text-[#F59E0B]/80' 
            },
            // Buyer Matches - Dark green filled gradient
            { 
              bg: 'bg-gradient-to-br from-[#0F172A] to-[#14532D]', 
              border: 'border border-[#22C55E]/60 border-l-[3px] border-l-[#22C55E]', 
              glow: 'shadow-[0_0_14px_rgba(34,197,94,0.15)]', 
              hover: 'hover:scale-[1.03] hover:shadow-xl hover:ring-1 hover:ring-offset-1 hover:ring-[#22C55E]/40', 
              icon: Users, 
              iconColor: 'text-[#22C55E]/80' 
            },
            // Offers Received - Dark purple filled gradient
            { 
              bg: 'bg-gradient-to-br from-[#1E1135] to-[#3B0764]', 
              border: 'border border-[#A855F7]/60 border-l-[3px] border-l-[#A855F7]', 
              glow: 'shadow-[0_0_14px_rgba(168,85,247,0.15)]', 
              hover: 'hover:scale-[1.03] hover:shadow-xl hover:ring-1 hover:ring-offset-1 hover:ring-[#A855F7]/40', 
              icon: DollarSign, 
              iconColor: 'text-[#A855F7]/80' 
            },
            // Pending Docs - Dark red/orange filled gradient
            { 
              bg: 'bg-gradient-to-br from-[#1C1917] to-[#431407]', 
              border: 'border border-[#EF4444]/60 border-l-[3px] border-l-[#EF4444]', 
              glow: 'shadow-[0_0_14px_rgba(239,68,68,0.15)]', 
              hover: 'hover:scale-[1.03] hover:shadow-xl hover:ring-1 hover:ring-offset-1 hover:ring-[#EF4444]/40', 
              icon: AlertTriangle, 
              iconColor: 'text-[#EF4444]/80' 
            },
          ][i] || { bg: 'bg-[#0A0C12]', border: 'border-l-[#3B82F6]/40', glow: '', hover: '', icon: Building2, iconColor: 'text-[#3B82F6]/60' };

          const Icon = accent.icon;

          return (
            <Link
              key={i}
              to={k.link || '#'}
              className={`card p-4 transition-all duration-200 cursor-pointer ${accent.bg} ${accent.border} ${accent.glow} ${accent.hover || ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="text-3xl font-semibold tabular-nums mb-0.5">{k.value}</div>
                <Icon size={15} className={accent.iconColor} />
              </div>
              <div className="text-sm text-[#8B92A3]">{k.label}</div>
            </Link>
          );
        })}
        {!ownerAdminToolsVisible && (
          <div className="card p-4 lg:col-span-3 border border-[#252A38] bg-[#0F111A] flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-[1.5px] text-[#8B92A3]">Workspace Snapshot</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {[
                  ['Active Deals', inventory.length],
                  ['Buyers', buyers.length],
                  ['Buyer Matches', buyers.length],
                  ['Offers Received', pendingLiveOffers.length],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="text-2xl font-semibold tabular-nums">{value}</div>
                    <div className="text-[11px] text-[#8B92A3]">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[#8B92A3]">Next step: Add a deal or import buyers to start matching.</span>
              <div className="flex gap-2">
                <Link to="/app/intake" className="btn btn-ghost text-xs">Add Deal</Link>
                <Link to="/app/buyers" className="btn btn-ghost text-xs">Import Buyers</Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Navigation Links (kept as useful top navigation, not part of the main widget rows) */}
      <div className="mb-6">
        <div className="text-sm font-medium mb-2 text-[#8B92A3]">Quick Links</div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/intake" className="btn btn-ghost text-sm">Internal Intake Center</Link>
          {ownerAdminToolsVisible && <>
            <Link to="/portal" className="btn btn-ghost text-sm">Public Submission Portal</Link>
            <Link to="/buyer-portal" target="_blank" className="btn btn-ghost text-sm">Verified Buyer Portal</Link>
          </>}
          <Link to="/app/inventory" className="btn btn-ghost text-sm">Inventory Hub</Link>
          {ownerAdminToolsVisible && <Link to="/app/submissions" className="btn btn-ghost text-sm">Deal Submissions Queue</Link>}
          <Link to="/app/blast" className="btn btn-ghost text-sm">Blast Builder</Link>
        </div>
      </div>

      {/* Command Center - Exact required 4-row balanced layout (no duplicates, no empty space) */}
      <div className="space-y-6">

        {/* Top Row: KPI cards only (already rendered above, kept for balance) */}
        {/* (The KPI grid at lines ~44 is the Top Row) */}

        {ownerAdminToolsVisible && totalBuyerReviewNotifications > 0 && (
          <div
            data-testid="command-center-buyer-review-alert"
            className="card p-4 mb-4 border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:border-amber-400/70"
            onClick={() => navigate('/app/buyers?review=pending')}
          >
            <div>
              <div className="text-amber-300 font-semibold">Buyer submissions need review</div>
              <div className="text-xs text-[#8B92A3] mt-1">
                {pendingBuyerPortalCount > 0 && (
                  <span>{pendingBuyerPortalCount} buyer portal submission{pendingBuyerPortalCount === 1 ? '' : 's'} waiting for review</span>
                )}
              </div>
            </div>
            <button className="btn btn-primary text-xs" onClick={(e) => { e.stopPropagation(); navigate('/app/buyers?review=pending') }}>
              Review Buyer Submissions
            </button>
          </div>
        )}

        {/* Second Row: System Status + Live Operational Stream (wider) + Needs Attention */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
          {/* System Status / Time Date (near top as required) */}
          <div className="card p-4 lg:col-span-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Clock size={16} className="text-[#22C55E]" /> System Status
            </div>
            <TimeDateWidget />
            <div className="mt-2 pt-2 border-t border-[#252A38] text-[10px] text-[#8B92A3] space-y-0.5">
              <div>Workspace: <span className="text-[#22C55E]">Authenticated</span></div>
              <div>LocalStorage: <span className="text-[#22C55E]">Healthy</span></div>
              <div>Public Portal: <Link to="/portal" className="text-[#3B82F6] hover:underline">Active</Link></div>
            </div>
          </div>

          {/* Live Operational Stream - wider and readable */}
          <div className="card p-4 lg:col-span-6">
            <div className="font-medium text-sm mb-2">Live Operational Stream</div>
          <LiveOperationalStream ownerAdminToolsVisible={ownerAdminToolsVisible} />
          </div>

          {/* Needs Attention */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40 lg:col-span-3" onClick={() => navigate('/app/inventory')}>
            <div className="font-medium text-sm mb-2 flex items-center justify-between text-amber-400">
              <span>Needs Attention</span>
              <button onClick={(e) => { 
                e.stopPropagation(); 
                currentDeals.forEach(d => {
                  const issues = useAppStore.getState().getDealAttentionItems(d)
                  if (issues.length > 0) useAppStore.getState().dismissDealAttention(d.id, issues)
                })
                alert('Needs Attention cleared (session)');
              }} className="text-[10px] btn btn-ghost px-1 py-0">Clear All</button>
            </div>
            <div className="space-y-1 text-sm">
              {currentDeals.filter(d => useAppStore.getState().getDealAttentionItems(d).length > 0).slice(0, 3).map(d => {
                const issues = useAppStore.getState().getDealAttentionItems(d)
                return (
                  <div key={d.id} className="cursor-pointer hover:text-[#3B82F6] flex justify-between items-center text-xs" onClick={(e) => { e.stopPropagation(); useAppStore.getState().safeOpenDeal(d.id); }}>
                    <span>{d?.property?.address || 'Untitled deal'} <span className="text-[#8B92A3]">({d.status})</span></span>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] text-amber-400">{issues.length}</span>
                      <button onClick={(e) => { e.stopPropagation(); useAppStore.getState().dismissDealAttention(d.id, issues); }} className="btn btn-ghost text-[9px] px-1 py-0">Clear</button>
                    </span>
                  </div>
                )
              })}
              {currentDeals.filter(d => useAppStore.getState().getDealAttentionItems(d).length > 0).length === 0 && <div className="text-xs text-[#8B92A3]">All clear. No deals need attention.</div>}
            </div>
          </div>
        </div>

        {/* Third Row: Hot Buyers, Recent Blasts, Offers, Closing, Follow-Up */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Hot Buyers */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40" onClick={() => navigate('/app/buyers')}>
            <div className="font-medium text-sm mb-2 text-red-400"> Hot Buyers</div>
            <div className="space-y-1 text-sm">
              {buyers.filter(b => b.status === 'Hot').slice(0, 4).map(b => (
                <div key={b.id} onClick={(e) => { e.stopPropagation(); navigate(`/app/buyers?buyer=${b.id}`); }} className="flex justify-between hover:text-[#3B82F6]">
                  <span>{b.name}</span><span className="text-xs text-[#8B92A3]">{b.markets?.[0]}</span>
                </div>
              ))}
              {buyers.filter(b => b.status === 'Hot').length === 0 && <div className="text-xs text-[#8B92A3]">No hot buyers</div>}
            </div>
          </div>

          {/* Recent Blasts */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40" onClick={() => navigate('/app/blast')}>
            <div className="font-medium text-sm mb-2">Recent Blasts</div>
            <div className="space-y-1 text-sm text-[#8B92A3]">
              {currentDeals.filter(d => d.status === 'Blasted' || d.status === 'Offers Received').slice(0, 3).map(d => (
                <div key={d.id} onClick={(e) => { e.stopPropagation(); useAppStore.getState().safeOpenDeal(d.id); }} className="cursor-pointer hover:text-white">{d?.property?.address || 'Untitled deal'}</div>
              ))}
              {currentDeals.filter(d => d.status === 'Blasted' || d.status === 'Offers Received').length === 0 && <div className="text-xs">No recent blasts</div>}
            </div>
          </div>

          {/* Offers Needing Response */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40" onClick={() => navigate('/app/pipeline')}>
            <div className="font-medium text-sm mb-2">Offers Needing Response</div>
            {Object.entries(useAppStore.getState().offers || {}).flatMap(([did, offs]: any) => liveDealIds.has(did) && Array.isArray(offs) ? offs.filter((o: any) => o.status === 'New' || o.status === 'Reviewing').map((o: any) => ({did, o})) : []).slice(0, 3).map(({did, o}: any) => (
              <div key={o.id} onClick={(e) => { e.stopPropagation(); useAppStore.getState().safeOpenDeal(did); }} className="text-sm cursor-pointer hover:text-[#3B82F6]">{o.buyerName} — {o.amount.toLocaleString()}</div>
            ))}
            {pendingLiveOffers.length === 0 && <div className="text-xs text-[#8B92A3]">No pending offers</div>}
          </div>

          {/* Closing Pipeline */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40" onClick={() => navigate('/app/inventory')}>
            <div className="font-medium text-sm mb-2 text-[#22C55E]">Closing Pipeline</div>
            <div className="text-sm">
              {currentDeals.filter(d => d.status === 'Closing' || d.status === 'Under Contract').length} deals in flight
              <div className="text-xs text-[#8B92A3] mt-1">Open terminal from Closing tab</div>
            </div>
          </div>

          {/* Follow-Up Needed */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40" onClick={() => navigate('/app/followups')}>
            <div className="font-medium text-sm mb-2 text-amber-400">Follow-Up Needed</div>
            <div className="text-sm">
              {useAppStore.getState().getPendingFollowUps().length} pending
              <div className="text-xs text-[#8B92A3] mt-1">Schedule after blasts</div>
            </div>
          </div>
        </div>

        {/* Fourth Row: Response Analytics + Quick Actions + Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-4">
          {/* Response Analytics */}
          <div className="card p-4 cursor-pointer hover:border-[#3B82F6]/40 lg:col-span-4" onClick={() => navigate('/app/analytics')}>
            <div className="font-medium text-sm mb-1">Response Analytics</div>
            <div className="grid grid-cols-2 gap-x-3 text-[11px]">
              <div>Interested: <span className="text-[#22C55E]">{responseAnalytics.interested}</span></div>
              <div>Offers: <span className="text-[#22C55E]">{responseAnalytics.offers}</span></div>
              <div>Passed: {responseAnalytics.passed}</div>
              <div>No Response: {responseAnalytics.noResponse}</div>
              <div className="col-span-2 mt-1 text-xs text-[#8B92A3]">
                Response Rate {responseAnalytics.responseRate}% - Conversion {responseAnalytics.conversionRate}%
              </div>
            </div>
          </div>

          {/* Quick Actions (only one) */}
          <div className="lg:col-span-4 card p-5">
            <div className="font-medium mb-3">Quick Actions</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link to="/portal" className="btn btn-ghost justify-start"><Plus size={15} /> Add New Deal</Link>
              <Link to="/app/buyers" className="btn btn-ghost justify-start"><Upload size={15} /> Import Buyers CSV</Link>
              <Link to="/app/blast" className="btn btn-ghost justify-start"><Send size={15} /> Send Deal Blast</Link>
              <Link to="/app/inventory" className="btn btn-ghost justify-start"><Building2 size={15} /> Open Inventory Hub</Link>
            </div>
            <div className="text-[11px] text-[#8B92A3] mt-4">Pro tip: Use the Public Portal link in Inventory Hub to let external submitters self-serve.</div>
          </div>

          {/* Recent Activity (only one) */}
          <div className="lg:col-span-4 card p-5">
            <div className="font-medium mb-3 flex justify-between">Recent Activity <Link to="/app/settings" className="text-xs text-[#3B82F6]">View all</Link></div>
            <RecentActivity />
          </div>
        </div>

      </div>

      {/* Alerts */}
      <div className="mt-4 panel p-4 text-sm border-l-4 border-[#F59E0B]">
        <span className="font-semibold text-[#FBBF24]">ALERT:</span>{' '}
        {totalDealSubmissionNotifications > 0
          ? `${totalDealSubmissionNotifications} deal${totalDealSubmissionNotifications === 1 ? '' : 's'} in submissions queue need review before they can be blasted.`
          : 'No submissions currently require review.'}
        {totalDealSubmissionNotifications > 0 && (
          <Link to="/app/submissions" className="ml-2 underline">Review now</Link>
        )}
      </div>
    </div>
  )
}

/* Time + Date Widget with Timezone (persisted to localStorage) */
function TimeDateWidget() {
  const [tz, setTz] = useState(() => {
    try { return localStorage.getItem('dbp_timezone') || 'America/New_York' } catch { return 'America/New_York' }
  })
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000) // every second for live seconds
    return () => clearInterval(id)
  }, [])

  const tzOptions = [
    { label: 'Eastern', value: 'America/New_York' },
    { label: 'Central', value: 'America/Chicago' },
    { label: 'Mountain', value: 'America/Denver' },
    { label: 'Pacific', value: 'America/Los_Angeles' },
    { label: 'UTC', value: 'UTC' },
  ]

  const handleTzChange = (newTz: string) => {
    setTz(newTz)
    try { localStorage.setItem('dbp_timezone', newTz) } catch {}
  }

  const timeStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="text-sm">
      <div className="text-2xl font-semibold tabular-nums tracking-tighter">{timeStr}</div>
      <div className="text-[#8B92A3] text-xs">{dateStr}</div>

      <select
        className="select text-xs mt-2 w-full"
        value={tz}
        onChange={(e) => handleTzChange(e.target.value)}
      >
        {tzOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function RecentActivity() {
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    let active = true

    const load = async () => {
      const store = useAppStore.getState()
      const canReadSubmissionActivity = isSuperAdmin(store.user) && !isOwnerPreviewActive(store.user, store.settings)
      const liveDealIds = new Set((store.deals || []).filter((deal: any) =>
        deal?.id && String(deal.status || '').toLowerCase() !== 'dead'
      ).map((deal: any) => deal.id))
      const rows: any[] = []

      Object.entries(store.activities || {}).forEach(([dealId, entries]) => {
        if (dealId !== '__global' && !liveDealIds.has(dealId)) return
        ;(entries as any[]).forEach(entry => rows.push({
          ...entry,
          dealId: dealId === '__global' ? null : dealId,
          timestamp: entry.timestamp,
        }))
      })

      if (canReadSubmissionActivity) try {
        const result = await listRecentDealSubmissionActivity(4)
        if (result.ok) {
          ;(result.data || []).forEach((submission: any) => {
            const data = submission.deal_data || {}
            const address = data?.property?.address || data.address || 'New deal submission'
            rows.push({
              id: `deal-submission-${submission.id}`,
              type: 'New deal submission',
              description: address,
              timestamp: data.submittedAt || submission.created_at,
            })

            const conversion = getDealSubmissionConversionMeta(submission)
            if (conversion.convertedAt) {
              rows.push({
                id: `deal-conversion-${submission.id}`,
                type: 'Submission approved',
                description: `${address} converted to Inventory Hub`,
                timestamp: conversion.convertedAt,
                dealId: conversion.inventoryDealId || null,
              })
            }
          })
        }
      } catch {}

      if (canReadSubmissionActivity) try {
        const submissions = await listRecentBuyerPortalSubmissionActivity(4)
        submissions.forEach((submission: any) => {
          const data = submission.buyer_data || {}
          rows.push({
            id: `buyer-submission-${submission.id}`,
            type: 'New buyer portal submission',
            description: data.name || data.fullName || data.email || 'Buyer waiting for review',
            timestamp: data.submittedAt || submission.created_at,
          })
        })
      } catch {}

      const seen = new Set<string>()
      const sorted = rows
        .filter(row => row.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .filter(row => {
          const key = row.id || `${row.type}|${row.description}|${row.timestamp}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(0, 4)

      if (active) setActivities(sorted)
    }

    const refresh = () => { void load() }
    void load()
    window.addEventListener('focus', refresh)
    window.addEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
    window.addEventListener('dealblastpro:deal-submission-queue-changed', refresh)

    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
      window.removeEventListener('dealblastpro:deal-submission-queue-changed', refresh)
    }
  }, [])

  if (!activities.length) {
    return <div className="text-sm text-[#8B92A3]">No recent activity yet.</div>
  }

  return (
    <div className="space-y-2 text-sm">
      {activities.map(activity => (
        <div
          key={activity.id || `${activity.type}-${activity.timestamp}`}
          onClick={() => activity.dealId && useAppStore.getState().safeOpenDeal(activity.dealId)}
          className={`flex justify-between gap-3 p-2 -mx-2 rounded ${activity.dealId ? 'hover:bg-[#171B26] cursor-pointer' : ''}`}
        >
          <div>{activity.type} <span className="text-[#8B92A3]">— {activity.description}</span></div>
          <div className="text-xs text-[#8B92A3] whitespace-nowrap">{new Date(activity.timestamp).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  )
}

/* Live Operational Stream Widget - pulls from store activities + key events */
function LiveOperationalStream({ ownerAdminToolsVisible = false }: { ownerAdminToolsVisible?: boolean }) {
  const [activities, setActivities] = useState<any[]>([])

  // Collect recent global activity (surgical: read from store on mount + poll lightly)
  useEffect(() => {
    const load = async () => {
      try {
        const store = useAppStore.getState()
        const allActs: any[] = []
        const currentDeals = (store.deals || []).filter((deal: any) => deal?.id && String(deal.status || '').toLowerCase() !== 'dead')
        const liveDealIds = new Set(currentDeals.map((deal: any) => deal.id))
        Object.entries(store.activities || {}).forEach(([dealId, acts]) => {
          if (dealId !== '__global' && !liveDealIds.has(dealId)) return

          (acts as any[]).slice(0, 5).forEach(a => {
            const activityDealId = a?.dealId || (dealId === '__global' ? null : dealId)
            if (activityDealId && !liveDealIds.has(activityDealId)) return
            allActs.push({ ...a, dealId: activityDealId })
          })
        })
        // Also synthesize buyer portal queue items waiting for review
        try {
          if (!ownerAdminToolsVisible) throw new Error('admin-only activity')
          const queueRaw = localStorage.getItem('dealblastpro-buyer-portal-queue')
          const buyerQueue = queueRaw ? JSON.parse(queueRaw) : []
          if (Array.isArray(buyerQueue)) {
            buyerQueue.slice(0, 10).forEach((b: any) => {
              allActs.push({
                type: 'Buyer Verification Pending',
                desc: (b.name || b.email || 'New buyer') + ' waiting for review',
                ts: b.createdAt || b.submittedAt || new Date().toISOString(),
                dealId: null
              })
            })
          }
        } catch {}

        // Also synthesize from recent deals for key events
        const deals = currentDeals
        deals.slice(0, 10).forEach((d: any) => {
          const address = d?.property?.address || 'Untitled deal'
          if (d.status === 'Submitted') allActs.push({ type: 'New deal submitted', desc: address, ts: d.createdAt, dealId: d.id })
          if (d.status === 'Approved') allActs.push({ type: 'Deal approved', desc: address, ts: d.updatedAt, dealId: d.id })
          if (d.status === 'Closing') allActs.push({ type: 'Deal moved to closing', desc: address, ts: d.updatedAt, dealId: d.id })
        })
        // Sort by time desc, take latest 12
        const sorted = allActs
          .sort((a,b) => new Date(b.ts || b.timestamp || 0).getTime() - new Date(a.ts || a.timestamp || 0).getTime())
          .slice(0, 12)
        setActivities(sorted)
      } catch {}
    }
    load()
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    window.addEventListener('dealblastpro:storage-sync', refresh)
    window.addEventListener('dealblastpro:deal-submission-queue-changed', refresh)
    window.addEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('dealblastpro:storage-sync', refresh)
      window.removeEventListener('dealblastpro:deal-submission-queue-changed', refresh)
      window.removeEventListener('dealblastpro:buyer-portal-queue-changed', refresh)
    }
  }, [ownerAdminToolsVisible])

  const getIcon = (_type?: string) => {
    return ''
  }

  if (activities.length === 0) {
    return (
      <div className="card p-4 hidden lg:block text-xs">
        <div className="font-medium mb-1">Live Operational Stream</div>
        <div className="text-[#8B92A3]">No recent activity yet. Run Sample Workflow or add a deal to populate the stream.</div>
      </div>
    )
  }

  return (
    <div className="card p-4 hidden lg:block text-xs max-h-[220px] overflow-auto">
      <div className="font-medium mb-2">Live Operational Stream</div>
      <div className="space-y-1">
        {activities.map((a, i) => (
          <div key={i} 
               className="flex items-start gap-2 p-1 -mx-1 rounded hover:bg-[#171B26] cursor-pointer"
               onClick={() => a.dealId && useAppStore.getState().safeOpenDeal(a.dealId)}>
            <span>{getIcon(a.type || a.description || '')}</span>
            <div className="flex-1 min-w-0">
              <div className="truncate">{a.type || a.description || 'Activity'}</div>
              <div className="text-[10px] text-[#8B92A3] truncate">{a.desc || a.description} - {a.ts ? new Date(a.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}






