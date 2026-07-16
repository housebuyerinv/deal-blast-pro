import { useAppStore } from '../../store/useAppStore'
import { Menu, LogOut } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { isSuperAdmin } from '../../lib/accessControl'
import { getOwnerPreviewPlan, isOwnerPreviewActive } from '../../lib/planAccess'
import { PlanStatusBadge } from '../billing/PlanStatusBadge'
import { supabase } from '../../lib/supabase'

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, trial, logout, settings } = useAppStore()
  const navigate = useNavigate()

  const isPaidPlan = !!trial.plan && trial.plan !== 'Free Demo' || trial.isPaid
  const superAdmin = isSuperAdmin(user)
  const previewActive = isOwnerPreviewActive(user, settings)
  const previewPlan = getOwnerPreviewPlan(settings)
  const handleLogout = async () => {
    await supabase.auth.signOut().catch(() => {})
    logout()
    try {
      window.localStorage.removeItem('dealblastpro-v1')
      window.sessionStorage.removeItem('dealblastpro:start-new-account')
    } catch {}
    navigate('/admin-login')
  }

  // Shared live date/time (compact format for header, same live source style as Command Center)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000) // live like Command Center widget
    return () => clearInterval(id)
  }, [])
  const dateTimeStr = `${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} | ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`

  return (
    <header className="h-14 border-b border-[#252A38] bg-[#0A0C12]/95 backdrop-blur flex items-center justify-between px-4 lg:px-6 sticky top-0 z-[80]">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick} 
          className="lg:hidden btn btn-ghost p-2"
          aria-label="Toggle menu"
        >
          <Menu size={18} />
        </button>
        <div className="hidden lg:block text-sm text-[#8B92A3]">
          {user?.company || 'Deal Blast Pro Workspace'}
        </div>
        <div className="hidden md:block text-xs text-[#8B92A3] tabular-nums ml-3 pl-3 border-l border-[#252A38]">
          {dateTimeStr}
        </div>
        <Link to="/portal" className="text-xs text-[#3B82F6] hover:underline ml-2 hidden md:inline">Public Portal</Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <PlanStatusBadge trial={trial} onClick={isPaidPlan ? undefined : () => navigate('/app/upgrade')} />

        {(previewActive || superAdmin) && (
          <div className="bg-[#12151F] border border-[#252A38] text-xs rounded px-2 py-1 text-[#22C55E]">
            {previewActive ? `Previewing ${previewPlan}` : 'Owner Admin'}
          </div>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-[#252A38]">
          <div className="text-right">
            <div className="text-sm font-medium leading-none">{user?.name}</div>
            <div className="text-[10px] text-[#8B92A3]">{user?.email}</div>
          </div>
          <button type="button" onClick={handleLogout} className="btn btn-ghost p-2" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
