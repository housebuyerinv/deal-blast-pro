import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checking, setChecking] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!mounted) return
      const recoveryCallbackCompleted = window.sessionStorage.getItem('dealblastpro:password-recovery') === 'true'
      setHasRecoverySession(Boolean(data.session) && recoveryCallbackCompleted)
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        if (event === 'PASSWORD_RECOVERY') {
          window.sessionStorage.setItem('dealblastpro:password-recovery', 'true')
        }
        setHasRecoverySession(event === 'PASSWORD_RECOVERY' || window.sessionStorage.getItem('dealblastpro:password-recovery') === 'true')
        setChecking(false)
      }
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) return void toast.error('Password must be at least 8 characters.')
    if (password !== confirmPassword) return void toast.error('Passwords do not match.')
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      window.sessionStorage.removeItem('dealblastpro:password-recovery')
      await supabase.auth.signOut()
      toast.success('Password updated. Sign in with your new password.')
      navigate('/admin-login?password=updated', { replace: true })
    } catch (error: any) {
      toast.error(error?.message || 'Unable to update your password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] p-6 text-[#E6E8EE]">
      <div className="card w-full max-w-md p-8">
        <div className="text-2xl font-semibold mb-1">Choose a new password</div>
        <p className="text-[#8B92A3] mb-6">Enter and confirm the password you want to use for Deal Blast Pro.</p>
        {checking ? <p className="text-sm text-[#8B92A3]">Checking your secure recovery session...</p> : !hasRecoverySession ? (
          <div><p className="text-sm text-red-400 mb-5">This recovery link is missing, invalid, or expired.</p><Link to="/forgot-password" className="btn btn-primary inline-block">Request another link</Link></div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm mb-2" htmlFor="new-password">New password</label>
            <input id="new-password" className="input mb-4" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} />
            <label className="block text-sm mb-2" htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" className="input mb-5" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} />
            <button className="btn btn-primary w-full" disabled={saving}>{saving ? 'Updating...' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
