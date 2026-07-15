import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    role: 'Admin' as const,
  })

  const [loading, setLoading] = useState(false)
  const login = useAppStore(s => s.login)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedPlan = (() => {
    const plan = String(searchParams.get('plan') || '').toLowerCase()
    if (plan === 'starter') return 'Starter'
    if (plan === 'pro') return 'Pro'
    return 'Free Demo'
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      window.sessionStorage.setItem('dealblastpro:start-new-account', 'true')

      const response = await fetch('/api/register-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          company: form.company,
          role: form.role,
          plan: requestedPlan,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.ok) {
        window.sessionStorage.removeItem('dealblastpro:start-new-account')
        toast.error(result?.error || 'Registration failed')
        return
      }

      if (result.session?.access_token && result.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })
      }

      if (result.session) {
        login(form.email, form.name || form.email.split('@')[0], { id: result.user?.id, newWorkspace: true })
        window.sessionStorage.removeItem('dealblastpro:start-new-account')
        toast.success('Account created and signed in')
        navigate('/app/dashboard')
      } else {
        toast.success('Account created. Check your email to confirm before signing in.')
        navigate('/admin-login')
      }
    } catch (err: any) {
      window.sessionStorage.removeItem('dealblastpro:start-new-account')
      toast.error(err?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

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
          <div className="text-2xl font-semibold mb-1">Create your account</div>
          <div className="text-[#8B92A3] mb-6">Create a real cloud login for Deal Blast Pro</div>
          <div className="mb-5 rounded border border-[#252A38] bg-[#0A0C12] px-3 py-2 text-sm text-[#C5CAD6]">
            Selected plan: <span className="font-semibold text-white">{requestedPlan}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">FULL NAME</div>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" required />
            </div>

            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">EMAIL</div>
              <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" required />
            </div>

            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">PASSWORD</div>
              <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimum 6 characters" required />
            </div>

            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">COMPANY</div>
              <input className="input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
            </div>

            <div>
              <div className="text-xs text-[#8B92A3] mb-1.5">YOUR ROLE</div>
              <select className="select w-full" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as any })}>
                <option>Admin</option>
                <option>Team Member / VA</option>
                <option>Buyer</option>
                <option>Seller / Submitter</option>
              </select>
            </div>

            <button disabled={loading} type="submit" className="btn btn-green w-full py-3">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="text-center text-sm mt-4">
          Already have an account? <Link to="/admin-login" className="text-[#3B82F6]">Sign in</Link>
          <span className="mx-2 text-[#8B92A3]">-</span>
          <Link to="/pricing" className="text-[#3B82F6]">Pricing</Link>
        </div>

        <footer className="border-t border-[#252A38] mt-8 py-6 text-center text-xs text-[#8B92A3]">
          House Buyer Investments - Deal Blast Pro<br />
          <Link to="/pricing" className="hover:text-white">Pricing</Link> -{' '}
          <Link to="/portal" className="hover:text-white">Submit Deal</Link> -{' '}
          <Link to="/contact" className="hover:text-white">Contact</Link> -{' '}
          <Link to="/privacy" className="hover:text-white">Privacy</Link> -{' '}
          <Link to="/terms" className="hover:text-white">Terms</Link> -{' '}
          <Link to="/security" className="hover:text-white">Security</Link>
        </footer>
      </div>
    </div>
  )
}


