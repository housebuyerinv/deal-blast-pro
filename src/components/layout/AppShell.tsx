
﻿import React, { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAppStore } from '../../store/useAppStore'
import { SectionErrorBoundary } from '../ui/ErrorBoundary'
import { useLocation, useNavigate } from 'react-router-dom'
import { isApiMode } from '../../services/storage'
import { DEFAULT_SETTINGS } from '../../lib/constants'
import FirstLoginSetup from '../FirstLoginSetup'
import OnboardingTour from '../OnboardingTour'
import { buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency, type PaidPlan } from '../../lib/billingLinks'
import { isInternalAdmin, isSuperAdmin } from '../../lib/accessControl'
import { canAccessRoute, getEffectivePlan, getOwnerPreviewPlan, getRequiredPlanForRoute, hasEffectiveOwnerAdminBypass, isOwnerPreviewActive } from '../../lib/planAccess'
import { getPastDuePolicyMessage, getPastDueStage } from '../../lib/accountLifecycle'
import { canUseLaunchedFeature, getFeatureLockedMessage } from '../../lib/featureLaunch'
import { supabase } from '../../lib/supabase'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')

  const { deals, buyers, followUps, setCurrentDeal, settings, user, trial, activateManualPlan, updateSettings, logout, workspaceInstanceId } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  const currentDealId = useAppStore(s => s.currentDealId)

  // Command palette hotkey (Cmd/Ctrl + K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && safeLower(e.key) === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
        setCmdQuery('')
      }
      if (e.key === 'Escape') setCmdOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    const verifyDurableAccountStatus = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const response = await fetch('/api/account-status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled || (response.status !== 403 && !payload?.deactivated)) return
        await supabase.auth.signOut()
        logout()
        navigate('/login?account=deactivated', { replace: true })
      } catch (error) {
        console.warn('[Deal Blast Pro] Account status check failed', error)
      }
    }

    void verifyDurableAccountStatus()
    return () => { cancelled = true }
  }, [user?.id, logout, navigate])

  const q = safeLower(cmdQuery).trim()

  const dealResults = deals.filter(d => 
    safeLower(d.property.address).includes(q) || 
    safeLower(d.property.city).includes(q) ||
    safeLower(d.status).includes(q)
  ).slice(0, 5).map(d => ({ 
    group: "Deals", 
    label: `${d.property.address} (${d.status})`, 
    action: () => { useAppStore.getState().safeOpenDeal(d.id); setCmdOpen(false) } 
  }))

  const buyerResults = buyers.filter(b => 
    safeLower(b.name).includes(q) || 
    safeLower(b.email).includes(q) ||
    b.markets?.some(m => safeLower(m).includes(q))
  ).slice(0, 5).map(b => ({ 
    group: "Buyers", 
    label: `${b.name} — ${b.email}`, 
    action: () => { navigate('/app/buyers'); setCmdOpen(false) } 
  }))

  const followupResults = followUps.filter(f => !f.completed).slice(0, 3).map(f => ({
    group: "Follow-Ups",
    label: `Follow-up on Deal ${f.dealId}`,
    action: () => { navigate('/app/followups'); setCmdOpen(false) }
  }))

  const pageResults = [
    { group: 'Pages', label: "Dashboard", action: () => { navigate('/app/dashboard'); setCmdOpen(false) } },
    { group: 'Pages', label: "Pipeline Board", action: () => { navigate('/app/pipeline'); setCmdOpen(false) } },
    { group: 'Pages', label: "Analytics", action: () => { navigate('/app/analytics'); setCmdOpen(false) } },
    { group: 'Pages', label: "Blast Builder", action: () => { navigate('/app/blast'); setCmdOpen(false) } },
    { group: 'Pages', label: "Follow-Up Center", action: () => { navigate('/app/followups'); setCmdOpen(false) } },
  ].filter(p => safeLower(p.label).includes(q))

  const filteredCommands = [...dealResults, ...buyerResults, ...followupResults, ...pageResults]
    .filter(c => !q || safeLower(c.label).includes(q))

  const onboarding = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }

  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : 'Trial Active')
  const hasOwnerAdminAccess = isSuperAdmin(user)
  const ownerPreviewActive = isOwnerPreviewActive(user, settings)
  const ownerPreviewPlan = getOwnerPreviewPlan(settings)
  const effectiveOwnerAdminAccess = hasEffectiveOwnerAdminBypass(user, settings)
  const deletionRequest = settings.deletionRequest || DEFAULT_SETTINGS.deletionRequest!
  const deletionMatchesCurrentWorkspace = deletionRequest.workspaceInstanceId
    ? deletionRequest.workspaceInstanceId === workspaceInstanceId
    : !workspaceInstanceId
  const accountStatus = deletionMatchesCurrentWorkspace
    ? (deletionRequest.accountStatus || (deletionRequest.status === 'Deletion Requested' ? 'Deletion Requested' : 'Active'))
    : 'Active'
  const billingPeriodEndMs = deletionRequest.scheduledDeletionAt || trial.billingPeriodEnd
    ? new Date(deletionRequest.scheduledDeletionAt || trial.billingPeriodEnd || '').getTime()
    : NaN
  const scheduledPeriodEnded = accountStatus === 'Cancellation Scheduled' && Number.isFinite(billingPeriodEndMs) && Date.now() > billingPeriodEndMs
  const scheduledWithoutActiveAccess =
    accountStatus === 'Cancellation Scheduled' &&
    !['Paid Active', 'Comped'].includes(String(billingStatus))
  const deletionBlocksAccess =
    accountStatus === 'Deactivated' ||
    accountStatus === 'Deleted' ||
    billingStatus === 'Cancelled' ||
    scheduledPeriodEnded ||
    scheduledWithoutActiveAccess ||
    (accountStatus === 'Deletion Requested' && ['Trial Active', 'Payment Pending', 'Past Due', 'Cancelled'].includes(String(billingStatus)))

  if (user && !hasOwnerAdminAccess && deletionBlocksAccess) {
    const startNewAccount = () => {
      try {
        window.sessionStorage.setItem('dealblastpro:start-new-account', 'true')
      } catch {
        // Session storage is best-effort; logout still clears the local deleted workspace state.
      }
      updateSettings({
        deletionRequest: {
          ...DEFAULT_SETTINGS.deletionRequest!,
          status: 'None',
          accountStatus: 'Active',
          workspaceInstanceId: '',
        }
      })
      logout()
      navigate('/admin-register')
    }

    return (
      <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded border border-[#252A38] bg-[#0F111A] p-6 text-center shadow-xl">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-2">Account Deactivated</div>
          <h1 className="text-2xl font-semibold mb-3">Your Deal Blast Pro account has been deactivated.</h1>
          <p className="text-sm text-[#C5CAD6] mb-5">You can create a new account anytime.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => navigate('/')} className="btn btn-green">Return to Deal Blast Pro</button>
            <button onClick={startNewAccount} className="btn btn-ghost">Start New Account</button>
          </div>
        </div>
      </div>
    )
  }

  if (user && !hasOwnerAdminAccess && !onboarding.planSelectionCompleted) {
    return <FirstLoginSetup />
  }

  const isPaymentPending = billingStatus === 'Payment Pending'
  const pastDueStage = getPastDueStage(trial)
  const billingStatusBlocksAccess = isPaymentPending || pastDueStage === 'restricted'

  if (user && !hasOwnerAdminAccess && billingStatusBlocksAccess) {
    const selectedPlan = trial.plan && !['Free', 'Free Demo'].includes(trial.plan) ? trial.plan as PaidPlan : 'Pro'
    const billingFrequency = (trial.billingFrequency || 'monthly') as BillingFrequency
    const billingSetup = getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || DEFAULT_SETTINGS.billingProviderSetup!)
    const paymentLink = getPlanPaymentLink(billingSetup, selectedPlan, billingFrequency)
    const paymentSetupReady =
      ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || '')) &&
      isValidPaymentUrl(paymentLink)

    const completePayment = () => {
      if (!paymentSetupReady) {
        alert('Payment Setup Not Active. Free is available now. Paid plans require support to finish billing setup first.')
        return
      }

      const checkoutUrl = buildStripeCheckoutUrl(paymentLink, {
        userId: user?.id,
        email: user?.email,
        plan: selectedPlan,
        billingFrequency,
      })
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
    }

    const chooseFreeDemo = () => {
      activateManualPlan({
        plan: 'Free',
        billingStatus: 'Free Active',
        billingFrequency: 'monthly',
        paymentProvider: 'Stripe',
        billingPeriodStart: '',
        billingPeriodEnd: '',
        billingAdminNote: 'User chose Free from billing status screen.',
      })
      navigate('/app/dashboard')
    }

    return (
      <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded border border-amber-500/30 bg-[#0F111A] p-6 shadow-xl">
          <div className="text-xs uppercase tracking-[2px] text-amber-300 mb-2">{billingStatus}</div>
          <h1 className="text-2xl font-semibold mb-3">
            {isPaymentPending ? 'Your payment is pending confirmation.' : 'Your account needs billing attention.'}
          </h1>
          <p className="text-sm leading-6 text-[#C5CAD6]">
            {isPaymentPending
              ? 'If you completed payment, Stripe will confirm your access after the webhook is verified. If you closed checkout before paying, complete payment or choose Free.'
              : getPastDuePolicyMessage(pastDueStage)}
          </p>

          <div className="mt-4 rounded border border-[#252A38] bg-[#0A0C12] p-3 text-sm text-[#8B92A3]">
            <div>Selected plan: <span className="text-[#E6E8EE]">{selectedPlan}</span></div>
            <div>Billing frequency: <span className="text-[#E6E8EE] capitalize">{billingFrequency}</span></div>
            <div>Status: <span className="text-amber-300">{billingStatus}</span></div>
            <div>Billing center: <span className="text-[#E6E8EE]">Limited status view</span></div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button onClick={completePayment} className="btn btn-green">Complete Payment</button>
            <button onClick={chooseFreeDemo} className="btn btn-ghost">Choose Free</button>
            <button onClick={() => navigate('/contact')} className="btn btn-ghost">Contact Support</button>
          </div>
        </div>
      </div>
    )
  }

  const effectivePlan = getEffectivePlan(trial, user, settings)
  const isFreePlan = ['Free', 'Free Demo'].includes(String(effectivePlan))
  const restrictedFeature =
    location.pathname === '/app/submissions'
      ? 'dealSubmissionReviewCenter'
      : null

  if (
    user &&
    restrictedFeature &&
    !canUseLaunchedFeature(restrictedFeature, effectivePlan, effectiveOwnerAdminAccess)
  ) {
    const message = getFeatureLockedMessage(restrictedFeature, effectivePlan)
    return (
      <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded border border-[#252A38] bg-[#0F111A] p-6 text-center shadow-xl">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-2">Coming Soon</div>
          <h1 className="text-2xl font-semibold mb-3">{message}</h1>
          <p className="text-sm text-[#C5CAD6] mb-5">
            The public Deal Submission Form remains available. The private Deal Submission Review Center is not launched for customer workspaces yet.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => navigate('/app/dashboard')} className="btn btn-green">Return to Command Center</button>
            <button onClick={() => navigate('/app/upgrade')} className="btn btn-ghost">View Pricing</button>
          </div>
        </div>
      </div>
    )
  }

  if (user && isFreePlan && !canAccessRoute(location.pathname, trial, user, settings)) {
    const requiredPlan = getRequiredPlanForRoute(location.pathname)
    return (
      <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded border border-[#252A38] bg-[#0F111A] p-6 text-center shadow-xl">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-2">Free Plan Limit</div>
          <h1 className="text-2xl font-semibold mb-3">This feature is included with {requiredPlan}.</h1>
          <p className="text-sm text-[#C5CAD6] mb-5">
            Free includes limited command center, inventory, buyer records, ARV calculator access, billing, and upgrade options.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => navigate('/app/upgrade')} className="btn btn-green">Upgrade to {requiredPlan}</button>
            <button onClick={() => navigate('/app/dashboard')} className="btn btn-ghost">Return to Command Center</button>
            <button onClick={() => navigate('/contact')} className="btn btn-ghost">Contact Support</button>
          </div>
        </div>
      </div>
    )
  }

  const isPaidAccess = ['Paid Active', 'Comped'].includes(String(billingStatus))
  const hasInternalAdminAccess = isInternalAdmin(user) && !ownerPreviewActive

  if (user && (isPaidAccess || ownerPreviewActive) && !hasInternalAdminAccess && !canAccessRoute(location.pathname, trial, user, settings)) {
    const requiredPlan = getRequiredPlanForRoute(location.pathname)
    return (
      <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE] flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded border border-[#252A38] bg-[#0F111A] p-6 text-center shadow-xl">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-2">Plan Feature</div>
          <h1 className="text-2xl font-semibold mb-3">This feature is included with {requiredPlan}.</h1>
          <p className="text-sm text-[#C5CAD6] mb-5">Upgrade when you are ready to unlock more Deal Blast Pro workflows.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => navigate('/app/upgrade')} className="btn btn-green">View Upgrade Options</button>
            <button onClick={() => navigate('/app/dashboard')} className="btn btn-ghost">Return to Command Center</button>
            <button onClick={() => navigate('/contact')} className="btn btn-ghost">Contact Support</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[#0A0C12] text-[#E6E8EE]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {ownerPreviewActive && (
          <div className="sticky top-0 z-[95] border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-semibold">Owner Preview Mode:</span> Viewing as {ownerPreviewPlan}. This does not change your owner account or billing.
              </div>
              <button onClick={() => updateSettings({ ownerPreviewPlan: 'Owner Admin' })} className="btn btn-ghost text-xs">Exit Preview Mode</button>
            </div>
          </div>
        )}
        {isApiMode && (
          <div className="bg-amber-500/10 text-amber-400 text-xs text-center py-1 border-b border-amber-500/30">
            API mode active — backend not connected (using stub). All data is in demo mode.
          </div>
        )}
        <Topbar onMenuClick={() => setMobileOpen(!mobileOpen)} />
        
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <SectionErrorBoundary>
            {children}
          </SectionErrorBoundary>
        </main>
      </div>

      <OnboardingTour />

      {/* Global Deal Terminal Drawer */}
      {currentDealId && (
        <DealTerminalDrawer dealId={currentDealId} onClose={() => setCurrentDeal(null)} />
      )}

      {/* Command Palette */}
      {cmdOpen && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center pt-24 bg-black/60" onClick={() => setCmdOpen(false)}>
          <div className="card w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <input 
              autoFocus 
              className="input rounded-b-none border-b-0 text-lg" 
              placeholder="Type to search deals, buyers, pages... (Esc to close)" 
              value={cmdQuery} 
              onChange={e => setCmdQuery(e.target.value)} 
            />
            <div className="max-h-80 overflow-auto p-1 text-sm">
              {filteredCommands.length === 0 && <div className="p-4 text-[#8B92A3]">No matches</div>}
              {filteredCommands.map((cmd, i) => (
                <div key={i} onClick={cmd.action} className="px-3 py-2 hover:bg-[#171B26] rounded cursor-pointer">
                  {cmd.group && <span className="text-[#8B92A3] text-[10px] mr-2">[{cmd.group}]</span>}
                  {cmd.label}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[#8B92A3] p-2 border-t border-[#252A38]">Cmd/Ctrl+K to toggle • Esc to close</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Lazy import to avoid circular issues during early scaffold
import DealTerminalDrawer from '../inventory/DealTerminalDrawer'
