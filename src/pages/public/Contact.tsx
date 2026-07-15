import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import PublicNav from '../../components/layout/PublicNav'
import { submitContactMessage, type ContactSubmissionPayload } from '../../lib/contactSubmissionStorage'
import { useAppStore } from '../../store/useAppStore'

export default function Contact() {
  const user = useAppStore(state => state.user)
  const trial = useAppStore(state => state.trial)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultMessage, setResultMessage] = useState('Thanks, your message has been received. We will follow up with the next step.')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    interest: 'Demo',
    message: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    const submittedAt = new Date().toISOString()
    const payload: ContactSubmissionPayload = {
      fullName: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      company: form.company.trim(),
      role: form.role.trim(),
      interestType: form.interest.trim(),
      message: form.message.trim(),
      submittedAt,
      sourcePage: 'Contact',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      currentUrl: typeof window !== 'undefined' ? window.location.href : '',
      accountEmail: user?.email || '',
      planStatus: [trial?.plan, trial?.billingStatus].filter(Boolean).join(' / '),
      status: 'New',
      ownerUserEmail: 'housebuyerinv@gmail.com',
    }

    try {
      const result = await submitContactMessage(payload)

      if (result.saved && result.notified) {
        setResultMessage('Message sent. We will follow up soon.')
        toast.success('Message sent. We will follow up soon.')
        setSubmitted(true)
        return
      }

      if (result.saved) {
        setResultMessage('Message received. We will follow up soon.')
        toast.success('Message received. We will follow up soon.')
        setSubmitted(true)
        return
      }

      if (result.notified) {
        setResultMessage('Message sent. We will follow up soon.')
        toast.success('Message sent. We will follow up soon.')
        setSubmitted(true)
        return
      }

      toast.error('Unable to send message right now. Please email housebuyerinv@gmail.com.')
    } catch {
      toast.error('Unable to send message right now. Please email housebuyerinv@gmail.com.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A0C12] flex items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Thank you!</h1>
          <p className="text-[#8B92A3] mb-6">{resultMessage}</p>
          <Link to="/" className="btn btn-primary">Return Home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0C12]">
      <PublicNav />
      <div className="max-w-lg mx-auto py-12 px-6">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-3xl font-semibold mt-4 mb-2">Contact Us</h1>
        <p className="text-[#8B92A3] mb-8">Want help seeing if Deal Blast Pro fits your workflow? Send a quick message and we will follow up with pricing info, sales details, or partnership options.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
              className="input" 
              placeholder="Full Name" 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})} 
              required 
            />
            <input 
              className="input" 
              type="email" 
              placeholder="Email" 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
              required 
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="input" placeholder="Company" value={form.company} onChange={e => setForm({...form, company: e.target.value})} />
            <input className="input" placeholder="Role" value={form.role} onChange={e => setForm({...form, role: e.target.value})} />
          </div>
          <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          <select className="select" value={form.interest} onChange={e => setForm({...form, interest: e.target.value})}>
            <option>Demo</option>
            <option>Pricing</option>
            <option>Partnership</option>
            <option>Support</option>
          </select>
          <textarea 
            className="input h-32" 
            placeholder="How can we help?" 
            value={form.message} 
            onChange={e => setForm({...form, message: e.target.value})} 
            required 
          />
          <button type="submit" disabled={submitting} className="btn btn-green w-full py-3 disabled:opacity-60">
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        <p className="text-xs text-center text-[#8B92A3] mt-6">We typically respond within 1-2 business days. If the form is unavailable, email housebuyerinv@gmail.com.</p>

        <footer className="border-t border-[#252A38] mt-12 py-8 text-center text-xs text-[#8B92A3]">
          Deal Blast Pro<br />
          <Link to="/pricing" className="hover:text-white">Pricing</Link> -{' '}
          <Link to="/portal" className="hover:text-white">Submit Deal</Link> -{' '}
          <Link to="/buyer-portal" className="hover:text-white">Buyer Portal</Link> -{' '}
          <Link to="/contact" className="hover:text-white">Contact</Link> -{' '}
          <Link to="/privacy" className="hover:text-white">Privacy</Link> -{' '}
          <Link to="/terms" className="hover:text-white">Terms</Link> -{' '}
          <Link to="/security" className="hover:text-white">Security</Link>
        </footer>
      </div>
    </div>
  )
}


