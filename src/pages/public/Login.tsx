import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { loadCloudAppDataToLocal } from '../../lib/cloudSync'
import PublicFooter from '../../components/layout/PublicFooter'
import { useAppStore } from '../../store/useAppStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const login = useAppStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        toast.error(error.message || 'Login failed')
        return
      }

      const userEmail = data.user?.email || email
      const fullName =
        data.user?.user_metadata?.full_name ||
        data.user?.user_metadata?.name ||
        userEmail.split('@')[0]
      const token = data.session?.access_token
      if (token) {
        const statusResponse = await fetch('/api/account-status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const statusPayload = await statusResponse.json().catch(() => ({}))
        if (statusResponse.status === 403 || statusPayload?.deactivated) {
          await supabase.auth.signOut()
          toast.error('This Deal Blast Pro account has been deactivated.')
          return
        }
      }

      const startNewAccount = window.sessionStorage.getItem('dealblastpro:start-new-account') === 'true'
      login(userEmail, fullName, { id: data.user?.id, newWorkspace: startNewAccount })
      if (startNewAccount) {
        window.sessionStorage.removeItem('dealblastpro:start-new-account')
      }
      toast.success('Signed in successfully')
      const loadedCloud = startNewAccount ? false : await loadCloudAppDataToLocal({ reload: false, silentMissing: true })
      if (loadedCloud) {
        toast.success('Cloud data loaded')
        window.location.href = '/app/dashboard'
        return
      }
      navigate('/app/dashboard')
    } catch (err: any) {
      toast.error(err?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const useLocalDemo = import.meta.env.DEV
    ? () => {
        login('demo@dealblast.pro', 'Demo User', { preserveWorkspace: true })
        toast('Local demo login active. Data will only exist in this browser.')
        navigate('/app/dashboard')
      }
    : undefined

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#22C55E] rounded flex items-center justify-center text-black font-black text-2xl">D</div>
            <span className="font-semibold text-2xl tracking-[-1px]">DEAL BLAST PRO</span>
          </Link>
        </div>

        <div className="card p-8">
          <div className="text-2xl font-semibold mb-1">Welcome back</div>
          <div className="text-[#8B92A3] mb-6">Sign in to your Deal Blast Pro workspace</div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">EMAIL</div>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>

            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">PASSWORD</div>
              <div className="flex gap-2">
                <input className="input flex-1" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="btn btn-ghost px-3">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button disabled={loading} type="submit" className="btn btn-primary w-full py-3">
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Link to="/forgot-password" className="text-[#3B82F6]">Forgot password?</Link>
            <span className="mx-2 text-[#8B92A3]">-</span>
              <Link to="/register" className="text-[#3B82F6]">Create an account</Link>
            <span className="mx-2 text-[#8B92A3]">-</span>
            <Link to="/pricing" className="text-[#3B82F6]">Pricing</Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          {import.meta.env.DEV && useLocalDemo && (
            <>
              <button type="button" onClick={useLocalDemo} className="btn btn-ghost w-full mb-3">Use Local Demo Only</button>
              <div className="text-xs text-amber-400 mb-2">Local demo data does not sync across devices.</div>
            </>
          )}
          <Link to="/portal" className="text-sm text-[#3B82F6]">Submit a Deal Without Logging In</Link>
        </div>

        <PublicFooter />
      </div>
    </div>
  )
}



