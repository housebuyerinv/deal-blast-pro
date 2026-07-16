import { useState } from 'react'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'
import { submitWaitlistEntry } from '../../lib/waitlistStorage'

const businessTypes = [
  'Wholesaler',
  'Investor',
  'Agent',
  'Lender',
  'Transaction coordinator',
  'Dispositions manager',
  'Acquisitions manager',
  'Other',
]

export default function Waitlist() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    primaryMarket: '',
    businessType: '',
    notes: '',
    website: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const update = (key: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    const result = await submitWaitlistEntry(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error || 'Waitlist submission failed.')
      return
    }

    if (result.duplicate) {
      setMessage('This email is already on the Deal Blast Pro waitlist. We will notify you when early access becomes available.')
      return
    }

    setMessage('You are on the waitlist! Thanks for registering. We will notify you when Deal Blast Pro early access becomes available. Check your inbox for a confirmation email.')
    setForm({ fullName: '', email: '', phone: '', primaryMarket: '', businessType: '', notes: '', website: '' })
  }

  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <div className="text-sm font-semibold tracking-[1px] text-[#22C55E]">PRERELEASE ACCESS</div>
          <h1 className="mt-2 text-4xl font-semibold">Join the Deal Blast Pro Waitlist</h1>
          <p className="mt-3 text-[#8B92A3]">
            We&apos;re preparing Deal Blast Pro for early access. Join the waitlist and we&apos;ll notify you when access becomes available.
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          {message && <div className="rounded border border-[#22C55E]/30 bg-[#22C55E]/10 p-3 text-sm text-[#86EFAC]">{message}</div>}
          {error && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          <label className="hidden" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={e => update('website', e.target.value)}
            />
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-[#8B92A3]">Full name *</span>
              <input className="input mt-1" value={form.fullName} onChange={e => update('fullName', e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-xs text-[#8B92A3]">Email address *</span>
              <input className="input mt-1" type="email" value={form.email} onChange={e => update('email', e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-xs text-[#8B92A3]">Phone number</span>
              <input className="input mt-1" value={form.phone} onChange={e => update('phone', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-[#8B92A3]">Primary market</span>
              <input className="input mt-1" placeholder="City, state, or region" value={form.primaryMarket} onChange={e => update('primaryMarket', e.target.value)} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-[#8B92A3]">Business type or role</span>
            <select className="input mt-1" value={form.businessType} onChange={e => update('businessType', e.target.value)}>
              <option value="">Select one</option>
              {businessTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-[#8B92A3]">Optional notes</span>
            <textarea className="input mt-1 min-h-[110px]" value={form.notes} onChange={e => update('notes', e.target.value)} />
          </label>

          <button type="submit" disabled={loading} className="btn btn-green w-full py-3">
            {loading ? 'Joining Waitlist...' : 'Join the Deal Blast Pro Waitlist'}
          </button>
        </form>
      </main>
      <PublicFooter />
    </div>
  )
}
