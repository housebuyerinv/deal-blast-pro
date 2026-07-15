import { supabase, isSupabaseConfigured } from './supabase'

export type WaitlistInput = {
  fullName: string
  email: string
  phone?: string
  primaryMarket?: string
  businessType?: string
  notes?: string
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

export async function submitWaitlistEntry(input: WaitlistInput) {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Waitlist storage is not configured yet.' }
  }

  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)

  if (fullName.length < 2) {
    return { ok: false, error: 'Enter your full name.' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const { error } = await supabase
    .from('waitlist_entries')
    .insert({
      full_name: fullName,
      email,
      phone: input.phone?.trim() || null,
      primary_market: input.primaryMarket?.trim() || null,
      business_type: input.businessType?.trim() || null,
      notes: input.notes?.trim() || null,
    })

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '23505' || message.includes('duplicate')) {
      return { ok: false, duplicate: true, error: 'That email is already on the waitlist.' }
    }
    return { ok: false, error: error.message || 'Waitlist submission failed.' }
  }

  try {
    await supabase.functions.invoke('notify-submission', {
      body: {
        eventType: 'waitlist_entry_created',
        workspaceId: 'default',
        relatedRecordId: email,
        idempotencyKey: `waitlist:${email}`,
        data: {
          fullName,
          email,
          phone: input.phone?.trim() || '',
          primaryMarket: input.primaryMarket?.trim() || '',
          businessType: input.businessType?.trim() || '',
          notes: input.notes?.trim() || '',
        },
      },
    })
  } catch (notifyError) {
    console.warn('[Deal Blast Pro] Waitlist notification failed', notifyError)
  }

  return { ok: true }
}
