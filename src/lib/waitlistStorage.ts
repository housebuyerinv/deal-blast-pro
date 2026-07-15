export type WaitlistInput = {
  fullName: string
  email: string
  phone?: string
  primaryMarket?: string
  businessType?: string
  notes?: string
  website?: string
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

export async function submitWaitlistEntry(input: WaitlistInput) {
  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)

  if (fullName.length < 2) {
    return { ok: false, error: 'Enter your full name.' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const response = await fetch('/api/waitlist-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email,
      phone: input.phone?.trim() || '',
      primaryMarket: input.primaryMarket?.trim() || '',
      businessType: input.businessType?.trim() || '',
      notes: input.notes?.trim() || null,
      website: input.website || '',
      sourcePage: typeof window !== 'undefined' ? window.location.href : 'public_waitlist',
      referralData: typeof document !== 'undefined' ? document.referrer : '',
    }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.ok === false) {
    return { ok: false, error: payload?.error || 'Waitlist submission failed.' }
  }

  return {
    ok: true,
    duplicate: Boolean(payload.duplicate),
    message: payload.message,
  }
}
