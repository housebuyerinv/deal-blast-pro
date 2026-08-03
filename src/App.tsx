import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { supabase } from './lib/supabase'
import { loadPaymentPendingAccountStatus, profileToUserNames } from './lib/accountProfile'
import { getWorkspaceDisplayName } from './lib/workspaceName'
import { DEFAULT_SETTINGS } from './lib/constants'
import type { TrialState } from './lib/types'

import Portal from './pages/public/Portal'
import BuyerPortal from './pages/public/BuyerPortal'
import Landing from './pages/public/Landing'
import Pricing from './pages/public/Pricing'
import Contact from './pages/public/Contact'
import Privacy from './pages/public/Privacy'
import Terms from './pages/public/Terms'
import Security from './pages/public/Security'
import RefundPolicy from './pages/public/RefundPolicy'
import AcceptableUse from './pages/public/AcceptableUse'
import Waitlist from './pages/public/Waitlist'
import Login from './pages/public/Login'
import Register from './pages/public/Register'
import ForgotPassword from './pages/public/ForgotPassword'
import AuthCallback from './pages/public/AuthCallback'
import AppShell from './components/layout/AppShell'

import Dashboard from './pages/app/Dashboard'
import Submissions from './pages/app/Submissions'
import Inventory from './pages/app/Inventory'
import Buyers from './pages/app/Buyers'
import Resources from './pages/app/Resources'
import Blast from './pages/app/Blast'
import DealCalculator from './pages/app/DealCalculator'
import Settings from './pages/app/Settings'
import ManualIntake from './pages/app/ManualIntake'
import FollowUps from './pages/app/FollowUps'
import Analytics from './pages/app/Analytics'
import Pipeline from './pages/app/Pipeline'
import Upgrade from './pages/app/Upgrade'

import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { useCloudAutoSave } from './lib/cloudAutoSave'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAppStore(s => s.user)
  const login = useAppStore(s => s.login)
  const logout = useAppStore(s => s.logout)
  const updateUserProfile = useAppStore(s => s.updateUserProfile)
  const location = useLocation()
  const currentUserId = user?.id
  const currentUserEmail = user?.email
  const [checkingSession, setCheckingSession] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [deactivated, setDeactivated] = useState(false)

  useEffect(() => {
    let cancelled = false

    const verifySession = async () => {
      setCheckingSession(true)
      setAuthorized(false)
      setDeactivated(false)

      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const token = session?.access_token

        if (!token || !session?.user) {
          await supabase.auth.signOut().catch(() => {})
          logout()
          if (!cancelled) setCheckingSession(false)
          return
        }

        const response = await fetch('/api/account-status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = await response.json().catch(() => ({}))

        if (response.status === 403 || payload?.deactivated) {
          await supabase.auth.signOut().catch(() => {})
          logout()
          if (!cancelled) {
            setDeactivated(true)
            setCheckingSession(false)
          }
          return
        }

        if (!response.ok || payload?.ok === false) {
          await supabase.auth.signOut().catch(() => {})
          logout()
          if (!cancelled) setCheckingSession(false)
          return
        }

        const serverPlan = (payload?.planName === 'Free Demo' ? 'Free' : payload?.planName) as TrialState['plan'] | undefined
        if (serverPlan) {
          const state = useAppStore.getState()
          const billingStatus = (payload?.billingStatus || (serverPlan === 'Free' ? 'Free Active' : 'Trial Active')) as NonNullable<TrialState['billingStatus']>
          state.activateManualPlan({
            plan: serverPlan,
            billingStatus,
            billingFrequency: payload?.billingInterval || 'monthly',
            paymentProvider: 'Stripe',
            billingPeriodStart: state.trial.billingPeriodStart || '',
            billingPeriodEnd: payload?.currentPeriodEnd || state.trial.billingPeriodEnd || '',
            billingAdminNote: 'Synced from authenticated account status.',
          })
          const onboarding = {
            ...DEFAULT_SETTINGS.onboarding!,
            ...(state.settings.onboarding || {}),
          }
          if (!onboarding.planSelectionCompleted || onboarding.selectedPlan !== serverPlan) {
            state.updateSettings({
              onboarding: {
                ...onboarding,
                planSelectionCompleted: true,
                selectedPlan: serverPlan,
                updatedAt: new Date().toISOString(),
              },
            })
          }
        }

        const email = session.user.email || ''
        const profileNames = profileToUserNames({
          full_name: payload?.profile?.fullName || session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
          display_name: payload?.profile?.displayName || '',
          business_name: getWorkspaceDisplayName(payload?.profile?.businessName, payload?.workspace?.name),
        }, email)
        const fullName = profileNames.name

        if (!currentUserId || currentUserId !== session.user.id || currentUserEmail !== email.toLowerCase()) {
          login(email, fullName, {
            id: session.user.id,
            preserveWorkspace: true,
            fullName: profileNames.fullName,
            displayName: profileNames.displayName,
            businessName: getWorkspaceDisplayName(payload?.profile?.businessName, payload?.workspace?.name),
          })
        } else {
          updateUserProfile({
            fullName: profileNames.fullName,
            displayName: profileNames.displayName,
            businessName: getWorkspaceDisplayName(payload?.profile?.businessName, payload?.workspace?.name),
            company: getWorkspaceDisplayName(payload?.profile?.businessName, payload?.workspace?.name),
            name: profileNames.name,
          })
        }

        if (!cancelled) {
          setAuthorized(true)
          setCheckingSession(false)
        }
      } catch {
        await supabase.auth.signOut().catch(() => {})
        logout()
        if (!cancelled) setCheckingSession(false)
      }
    }

    void verifySession()

    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, login, logout, updateUserProfile, currentUserId, currentUserEmail])

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] text-[#E6E8EE]">
        <div className="rounded border border-[#252A38] bg-[#0F111A] px-4 py-3 text-sm text-[#8B92A3]">
          Verifying secure session...
        </div>
      </div>
    )
  }

  if (deactivated) {
    return <Navigate to="/admin-login?account=deactivated" state={{ from: location }} replace />
  }

  if (!authorized) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function App() {
  useCloudAutoSave()
  const initializeStore = useAppStore(s => s.initialize)
  const billingStatus = useAppStore(s => s.trial.billingStatus)
  const activateManualPlan = useAppStore(s => s.activateManualPlan)

  useEffect(() => {
    initializeStore()
  }, [])

  useEffect(() => {
    if (billingStatus !== 'Payment Pending') return

    let cancelled = false
    let inFlight = false
    let lastRefreshStartedAt = 0
    let activeController: AbortController | null = null
    const checkActivation = async () => {
      if (
        cancelled ||
        inFlight ||
        useAppStore.getState().trial.billingStatus !== 'Payment Pending' ||
        Date.now() - lastRefreshStartedAt < 1000
      ) return

      inFlight = true
      lastRefreshStartedAt = Date.now()
      activeController = new AbortController()
      try {
        const activation = await loadPaymentPendingAccountStatus(activeController.signal)
        if (
          cancelled ||
          !activation?.plan ||
          !activation.billingStatus ||
          activation.billingStatus === 'Payment Pending'
        ) return

        activateManualPlan({
          plan: activation.plan,
          billingStatus: activation.billingStatus,
          billingFrequency: activation.billingFrequency,
          paymentProvider: 'Stripe',
          billingPeriodStart: '',
          billingPeriodEnd: activation.billingPeriodEnd,
          billingAdminNote: 'Activated automatically from authoritative account status.',
        })
      } catch (error: any) {
        if (!cancelled && error?.name !== 'AbortError') {
          console.warn('[Deal Blast Pro] Payment Pending account-status refresh failed', error)
        }
      } finally {
        inFlight = false
        activeController = null
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkActivation()
    }

    void checkActivation()
    const interval = window.setInterval(() => { void checkActivation() }, 60000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      cancelled = true
      activeController?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [billingStatus, activateManualPlan])

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/acceptable-use" element={<AcceptableUse />} />
        <Route path="/security" element={<Security />} />
        <Route path="/waitlist" element={<Waitlist />} />
        <Route path="/portal" element={<Portal />} />
        <Route path="/buyer-portal" element={<BuyerPortal />} />
        <Route path="/admin-login" element={<Login />} />
        <Route path="/refunds" element={<Navigate to="/refund-policy" replace />} />
        <Route path="/admin-register" element={import.meta.env.PROD ? <Navigate to="/waitlist" replace /> : <Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<Navigate to="/admin-login" replace />} />
        <Route path="/register" element={<Navigate to={import.meta.env.PROD ? '/waitlist' : '/admin-register'} replace />} />
        <Route path="/upgrade" element={<Navigate to="/pricing" replace />} />

        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="submissions" element={<Submissions />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="buyers" element={<Buyers />} />
                  <Route path="resources" element={<Resources />} />
                  <Route path="blast" element={<Blast />} />
                  <Route path="calculator" element={<DealCalculator />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="upgrade" element={<Upgrade />} />
                  <Route path="intake" element={<ManualIntake />} />
                  <Route path="followups" element={<FollowUps />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="pipeline" element={<Pipeline />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App



