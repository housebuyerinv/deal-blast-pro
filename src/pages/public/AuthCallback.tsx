import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { loadCloudAppDataToLocal } from '../../lib/cloudSync'
import { useAppStore } from '../../store/useAppStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const login = useAppStore(s => s.login)
  const settings = useAppStore(s => s.settings)

  useEffect(() => {
    let cancelled = false

    const completeAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            const message = error.message || ''
            if (!message.toLowerCase().includes('already')) throw error
          }
        } else if (window.location.hash.includes('access_token')) {
          await supabase.auth.getSession()
        }

        const { data, error } = await supabase.auth.getUser()
        if (error || !data.user?.email) {
          throw error || new Error('Email verified. Please sign in to continue.')
        }

        const userEmail = data.user.email
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          userEmail.split('@')[0]
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (token) {
          const statusResponse = await fetch('/api/account-status', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const statusPayload = await statusResponse.json().catch(() => ({}))
          if (statusResponse.status === 403 || statusPayload?.deactivated) {
            await supabase.auth.signOut()
            throw new Error('This Deal Blast Pro account has been deactivated.')
          }
        }

        const startNewAccount = window.sessionStorage.getItem('dealblastpro:start-new-account') === 'true'
        const previousAccountStatus = settings?.deletionRequest?.accountStatus
        const newWorkspace = startNewAccount || ['Deleted', 'Deactivated'].includes(String(previousAccountStatus || ''))
        login(userEmail, fullName, { id: data.user.id, newWorkspace })
        if (startNewAccount) {
          window.sessionStorage.removeItem('dealblastpro:start-new-account')
        } else {
          await loadCloudAppDataToLocal({ reload: false, silentMissing: true })
        }

        if (!cancelled) {
          toast.success('Email verified. Welcome back.')
          navigate('/app/dashboard', { replace: true })
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err?.message || 'Email verified. Please sign in to continue.')
          navigate('/admin-login', { replace: true })
        }
      }
    }

    completeAuth()

    return () => {
      cancelled = true
    }
  }, [login, navigate, settings?.deletionRequest?.accountStatus])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] p-6 text-[#E6E8EE]">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="text-2xl font-semibold mb-2">Finishing sign in...</div>
        <p className="text-sm text-[#8B92A3] mb-6">
          We are confirming your email and sending you to the right workspace.
        </p>
        <Link to="/admin-login" className="text-sm text-[#3B82F6]">Return to admin login</Link>
      </div>
    </div>
  )
}
