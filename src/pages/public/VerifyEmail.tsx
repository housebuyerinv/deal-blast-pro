import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import PublicFooter from '../../components/layout/PublicFooter'

const EMAIL_KEY = 'dealblastpro:pending-verification-email'

export default function VerifyEmail() {
  const [email, setEmail] = useState(() => {
    try { return window.sessionStorage.getItem(EMAIL_KEY) || '' } catch { return '' }
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const resend = async () => {
    const normalized = email.trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) {
      toast.error('Enter the email address used to create your account.')
      return
    }
    setSending(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalized,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      window.sessionStorage.setItem(EMAIL_KEY, normalized)
      setSent(true)
      toast.success('Verification email requested. Check your inbox and spam folder.')
    } catch (error: any) {
      toast.error(error?.message || 'Verification email could not be requested. Please try again later.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] p-6 text-[#E6E8EE]">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#22C55E] rounded flex items-center justify-center text-black font-black text-2xl">D</div>
            <span className="font-semibold text-2xl tracking-[-1px]">DEAL BLAST PRO</span>
          </Link>
        </div>
        <div className="card p-8">
          <div className="text-2xl font-semibold mb-2">Verify your email</div>
          <p className="text-[#8B92A3] mb-6">We created your account. Confirm your email before signing in. Delivery can take a few minutes, and spam filtering may apply.</p>
          <label className="block text-xs text-[#8B92A3] mb-1.5" htmlFor="verification-email">EMAIL</label>
          <input id="verification-email" className="input mb-4" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          <button type="button" onClick={() => void resend()} disabled={sending} className="btn btn-green w-full py-3">
            {sending ? 'Requesting...' : sent ? 'Resend Verification Email' : 'Resend Verification Email'}
          </button>
          {sent && <p className="text-xs text-[#8B92A3] mt-3">A new verification message was requested. Check your inbox and spam folder.</p>}
          <Link to="/admin-login" className="btn btn-ghost w-full py-3 mt-3">Return to Sign In</Link>
        </div>
        <PublicFooter />
      </div>
    </div>
  )
}
