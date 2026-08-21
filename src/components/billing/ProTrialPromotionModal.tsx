import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

async function promotionRequest(method = 'GET', body?: object) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/property-intelligence/pro-trial-promotion', { method, headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Promotion preference could not be loaded.')
  return payload
}

export default function ProTrialPromotionModal() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { let active = true; void promotionRequest().then(payload => { if (active) setOpen(payload.eligible === true) }).catch(() => {}); return () => { active = false } }, [])
  if (!open) return null
  const dismissForever = async () => { setSaving(true); try { await promotionRequest('POST', { dismissPermanently: true }); setOpen(false) } finally { setSaving(false) } }
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="pro-trial-promotion-title">
    <div className="w-full max-w-lg rounded-xl border border-emerald-500/30 bg-[#0F111A] p-6 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-[2px] text-emerald-300">Limited launch offer</div>
      <h2 id="pro-trial-promotion-title" className="mt-2 text-2xl font-semibold">Try Pro Free for 14 Days</h2>
      <p className="mt-3 text-sm leading-6 text-[#C5CAD6]">Unlock advanced buyer matching, Deal Blast Builder, follow-up tools, calculators, Hot Zones, and more.</p>
      <p className="mt-3 rounded border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">Then get 20% off your first paid month with LAUNCH20.</p>
      <p className="mt-3 text-xs text-amber-200">The free trial does not include the 50 paid Pro Property Intelligence lookups. Purchased credits remain usable.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2"><button className="btn btn-green" onClick={() => { setOpen(false); navigate('/app/upgrade') }}>Start 14-Day Pro Trial</button><button className="btn btn-ghost" onClick={() => { setOpen(false); navigate('/pricing') }}>View Pro Features</button><button className="btn btn-ghost" onClick={() => setOpen(false)}>Not Now</button><button className="btn btn-ghost" disabled={saving} onClick={() => void dismissForever()}>{saving ? 'Saving…' : "Don't show this again"}</button></div>
    </div>
  </div>
}
