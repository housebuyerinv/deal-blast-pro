import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { supabase } from './lib/supabase'

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
import { loadCloudTrialActivation } from './lib/cloudSync'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAppStore(s => s.user)
  const login = useAppStore(s => s.login)
  const logout = useAppStore(s => s.logout)
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

        const email = session.user.email || ''
        const fullName =
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          email.split('@')[0] ||
          'User'

        if (!currentUserId || currentUserId !== session.user.id || currentUserEmail !== email.toLowerCase()) {
          login(email, fullName, { id: session.user.id, preserveWorkspace: true })
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
  }, [location.pathname, location.search, login, logout, currentUserId, currentUserEmail])

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
    const checkActivation = async () => {
      const activation = await loadCloudTrialActivation()
      if (cancelled || !activation?.plan || !activation.billingStatus) return

      activateManualPlan({
        plan: activation.plan,
        billingStatus: activation.billingStatus,
        billingFrequency: activation.billingFrequency || 'monthly',
        paymentProvider: activation.paymentProvider || 'Stripe',
        billingPeriodStart: activation.billingPeriodStart,
        billingPeriodEnd: activation.billingPeriodEnd,
        billingAdminNote: activation.billingAdminNote || 'Activated automatically from Stripe webhook',
      })
    }

    checkActivation()
    const interval = window.setInterval(checkActivation, 15000)
    window.addEventListener('focus', checkActivation)
    document.addEventListener('visibilitychange', checkActivation)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', checkActivation)
      document.removeEventListener('visibilitychange', checkActivation)
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



