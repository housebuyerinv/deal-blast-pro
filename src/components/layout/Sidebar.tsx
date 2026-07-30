import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Building2, Users, Send, Settings, Briefcase,
  FileText, Target, Calendar, Calculator
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { countPendingDealSubmissions } from '../../lib/dealSubmissionStorage'
import { countPendingBuyerPortalSubmissions } from '../../lib/buyerPortalSubmissionStorage'
import { hasOwnerAdminBypass, isInternalAdmin } from '../../lib/accessControl'
import { canAccessRoute } from '../../lib/planAccess'
import { getEffectivePlan } from '../../lib/planAccess'
import { canUseBuyerPortalReview } from '../../lib/planEntitlements'
import { canUseLaunchedFeature } from '../../lib/featureLaunch'

const navGroups = [
  {
    label: 'CORE CONTROL',
    items: [
      { to: '/app/dashboard', label: 'Command Center', icon: LayoutDashboard },
      { to: '/app/submissions', label: 'Deal Submissions', icon: FileText, badgeKey: 'submissions' },
      { to: '/app/inventory', label: 'Inventory Hub', icon: Building2 },
    ]
  },
  {
    label: 'DEAL FLOW',
    items: [
      { to: '/app/buyers', label: 'Buyer Database', icon: Users, badgeKey: 'buyerPortal' },
      { to: '/app/resources', label: 'Resource Hub', icon: Briefcase },
      { to: '/app/blast', label: 'Deal Blast Builder', icon: Send },
      { to: '/app/calculator', label: 'Deal Calculator', icon: Calculator },
    ]
  },
  {
    label: 'OPERATIONS',
    items: [
      { to: '/app/followups', label: 'Follow-Up Task Center', icon: Calendar, badgeKey: 'followups' },
      { to: '/app/pipeline', label: 'Pipeline Board', icon: Target },
    ]
  },
  {
    label: 'ANALYTICS',
    items: [
      { to: '/app/analytics', label: 'Analytics', icon: Target },
    ]
  },
  {
    label: 'ADMIN',
    items: [
      { to: '/app/settings', label: 'Settings & Trial', icon: Settings },
    ]
  }
]

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { sidebarOpen, getPendingFollowUps, trial, user, settings } = useAppStore()
  const [submissions, setSubmissions] = useState(0)
  const [buyerPortalQueueCount, setBuyerPortalQueueCount] = useState(0)
  const pendingFollowups = getPendingFollowUps().length
  const hasInternalAdminAccess = isInternalAdmin(user)
  const ownerAdminBypass = hasOwnerAdminBypass(user)
  const effectivePlan = getEffectivePlan(trial, user, settings)
  const buyerPortalReviewAllowed = canUseBuyerPortalReview(effectivePlan) && canUseLaunchedFeature('buyerPortalReviewCenter', effectivePlan, hasInternalAdminAccess)
  const dealSubmissionReviewAllowed = canUseLaunchedFeature('dealSubmissionReviewCenter', effectivePlan, hasInternalAdminAccess)

  const isOpen = mobileOpen !== undefined ? mobileOpen : sidebarOpen

  useEffect(() => {
    let cancelled = false

    const refreshSubmissionBadge = async () => {
      const result = await countPendingDealSubmissions()
      if (cancelled) return
      setSubmissions(result.ok ? result.count : 0)
    }

    refreshSubmissionBadge()
    window.addEventListener('focus', refreshSubmissionBadge)
    window.addEventListener('dealblastpro:deal-submission-queue-changed', refreshSubmissionBadge)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshSubmissionBadge)
      window.removeEventListener('dealblastpro:deal-submission-queue-changed', refreshSubmissionBadge)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const refreshBuyerPortalBadge = async () => {
      try {
        const count = await countPendingBuyerPortalSubmissions()
        if (!cancelled) setBuyerPortalQueueCount(count)
      } catch (error) {
        console.warn('[Deal Blast Pro] Failed to refresh buyer portal badge count', error)
        if (!cancelled) setBuyerPortalQueueCount(0)
      }
    }

    void refreshBuyerPortalBadge()
    window.addEventListener('focus', refreshBuyerPortalBadge)
    window.addEventListener('dealblastpro:buyer-portal-queue-changed', refreshBuyerPortalBadge)

    const interval = window.setInterval(refreshBuyerPortalBadge, 60000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshBuyerPortalBadge)
      window.removeEventListener('dealblastpro:buyer-portal-queue-changed', refreshBuyerPortalBadge)
      window.clearInterval(interval)
    }
  }, [])

  const formatBadgeCount = (count: number) => count > 99 ? '99+' : String(count)

  return (
    <aside
      className={`sidebar-mobile ${isOpen ? 'open' : ''} fixed lg:static inset-y-0 left-0 z-[90] w-64 bg-[#0A0C12] border-r border-[#252A38] flex flex-col overflow-y-auto`}
    >
      <div className="px-4 pt-5 pb-4 border-b border-[#252A38] flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[#22C55E] flex items-center justify-center text-black font-bold text-xl">D</div>
        <div>
          <div className="font-semibold tracking-[-0.5px] text-lg">DEAL BLAST PRO</div>
          <div className="text-[10px] text-[#8B92A3] -mt-1">DISPO & BUYER MATCHING</div>
        </div>
      </div>

      <div className="flex-1 py-3">
        {navGroups.map(group => {
          const visibleItems = ownerAdminBypass || hasInternalAdminAccess ? group.items : group.items.filter(item => {
            if (item.to === '/app/submissions') return dealSubmissionReviewAllowed
            return canAccessRoute(item.to, trial, user, settings)
          })
          if (!visibleItems.length) return null
          return (
          <div key={group.label} className="mb-4">
            <div className="px-4 text-[10px] font-semibold tracking-[1px] text-[#8B92A3] mb-1.5">{group.label}</div>
            {visibleItems.map(item => {
              const Icon = item.icon
              let showBadge = false
              let badgeCount = 0
              if (item.badgeKey === 'submissions') {
                showBadge = submissions > 0
                badgeCount = submissions
              } else if (item.badgeKey === 'buyerPortal') {
                showBadge = buyerPortalReviewAllowed && buyerPortalQueueCount > 0
                badgeCount = buyerPortalQueueCount
              } else if (item.badgeKey === 'followups') {
                showBadge = pendingFollowups > 0
                badgeCount = pendingFollowups
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.badgeKey === 'buyerPortal' && buyerPortalReviewAllowed && buyerPortalQueueCount > 0 ? '/app/buyers?review=pending' : item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-[9px] text-sm mx-1.5 rounded-lg transition-colors ${
                      isActive ? 'bg-[#171B26] text-white' : 'text-[#C5CAD6] hover:bg-[#171B26]/60'
                    }`
                  }
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className="ml-auto bg-[#3B82F6] text-white text-[10px] font-bold px-1.5 rounded">{formatBadgeCount(badgeCount)}</span>
                  )}
                </NavLink>
              )
            })}
          </div>
        )})}
      </div>

      <div className="p-4 border-t border-[#252A38] text-[11px] text-[#8B92A3]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#22C55E] rounded-full animate-pulse" />
          LIVE - {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="mt-1">v1.0.4 - {user ? 'Workspace Mode' : 'Demo Mode'}</div>
      </div>
    </aside>
  )
}
