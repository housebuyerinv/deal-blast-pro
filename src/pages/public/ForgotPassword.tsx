import React, { useState } from 'react'
import { Link } from 'react-router-dom'

export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')

  const handle = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0C12] p-6">
      <div className="w-full max-w-md card p-8">
        <Link to="/admin-login" className="text-sm text-[#3B82F6]">Back to login</Link>
        <div className="text-2xl font-semibold mt-4 mb-1">Reset your password</div>
        <p className="text-[#8B92A3] mb-6">We will email you a reset link.</p>

        {sent ? (
          <div className="text-center py-8">
            <div className="text-[#22C55E] text-xl mb-2">Check your inbox</div>
            <p className="text-sm">A reset link has been sent to {email || 'your email'}.</p>
            <Link to="/admin-login" className="btn btn-ghost mt-6 inline-block">Return to login</Link>
          </div>
        ) : (
          <form onSubmit={handle}>
            <input className="input mb-4" placeholder="you@company.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <button className="btn btn-primary w-full">Send Reset Link</button>
          </form>
        )}
      </div>
    </div>
  )
}


