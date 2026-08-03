import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { loadCloudAppDataToLocal } from '../../lib/cloudSync'
import { useAppStore } from '../../store/useAppStore'
import {
  auditEmailChangeEvent,
  getFriendlyEmailChangeError,
  profileToUserNames,
  syncVerifiedAuthEmailToProfile,
} from '../../lib/accountProfile'
import { getWorkspaceDisplayName } from '../../lib/workspaceName'

function readCallbackError() {
  const params = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const errorCode = params.get('error_code') || hashParams.get('error_code')
  const errorDescription = params.get('error_description') || hashParams.get('error_description')
  const error = params.get('error') || hashParams.get('error')
  if (!error && !errorCode && !errorDescription) return null
  return new Error(errorDescription || errorCode || error || 'Authentication callback failed.')
}

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
        const callbackType = params.get('type')
        const isEmailChangeCallback = callbackType === 'email_change'
        const callbackError = readCallbackError()
        if (callbackError) throw callbackError

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
        let syncedEmailResult: Awaited<ReturnType<typeof syncVerifiedAuthEmailToProfile>> | null = null
        if (isEmailChangeCallback) {
          syncedEmailResult = await syncVerifiedAuthEmailToProfile()
        }

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        let statusPayload: any = {}
        if (token) {
          const statusResponse = await fetch('/api/account-status', {
            headers: { Authorization: `Bearer ${token}` },
          })
          statusPayload = await statusResponse.json().catch(() => ({}))
          if (statusResponse.status === 403 || statusPayload?.deactivated) {
            await supabase.auth.signOut()
            throw new Error('This Deal Blast Pro account has been deactivated.')
          }
        }

        const profileNames = profileToUserNames({
          full_name: statusPayload?.profile?.fullName || data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
          display_name: statusPayload?.profile?.displayName || '',
          business_name: getWorkspaceDisplayName(statusPayload?.profile?.businessName, statusPayload?.workspace?.name),
        }, userEmail)
        const fullName = profileNames.name

        const startNewAccount = window.sessionStorage.getItem('dealblastpro:start-new-account') === 'true'
        const previousAccountStatus = settings?.deletionRequest?.accountStatus
        const newWorkspace = startNewAccount || ['Deleted', 'Deactivated'].includes(String(previousAccountStatus || ''))
        login(userEmail, fullName, {
          id: data.user.id,
          newWorkspace,
          fullName: profileNames.fullName,
          displayName: profileNames.displayName,
          businessName: getWorkspaceDisplayName(statusPayload?.profile?.businessName, statusPayload?.workspace?.name),
        })
        if (startNewAccount) {
          window.sessionStorage.removeItem('dealblastpro:start-new-account')
        } else {
          await loadCloudAppDataToLocal({ reload: false, silentMissing: true })
        }

        if (!cancelled) {
          if (isEmailChangeCallback) {
            if (syncedEmailResult?.completed) {
              try {
                localStorage.removeItem(`dbp:pending-email-change:${data.user.id}`)
              } catch {}
              toast.success('Email address updated successfully.')
              navigate('/app/settings', { replace: true })
              return
            }

            if (syncedEmailResult?.pendingEmail) {
              try {
                localStorage.setItem(`dbp:pending-email-change:${data.user.id}`, syncedEmailResult.pendingEmail)
              } catch {}
              toast.info('Email change pending. Confirmation is required from both your current email and your new email.')
              navigate('/app/settings?emailChange=pending', { replace: true })
              return
            }

            toast.info('Email confirmation processed. Sign in again if the email change has not completed.')
            navigate('/app/settings', { replace: true })
          } else {
            toast.success('Email verified. Welcome back.')
            navigate('/app/dashboard', { replace: true })
          }
        }
      } catch (err: any) {
        const params = new URLSearchParams(window.location.search)
        const isEmailChangeCallback = params.get('type') === 'email_change'
        if (isEmailChangeCallback) {
          try {
            const { data } = await supabase.auth.getUser()
            const authUser = data.user
            if (authUser?.id) {
              await auditEmailChangeEvent({
                userId: authUser.id,
                currentEmail: authUser.email || '',
                requestedEmail: authUser.email || '',
                status: 'email_change_failed',
                metadata: { failure_category: getFriendlyEmailChangeError(err) },
              })
            }
          } catch {}
        }
        if (!cancelled) {
          toast.error(getFriendlyEmailChangeError(err))
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
