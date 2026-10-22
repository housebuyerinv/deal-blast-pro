import { supabase } from './supabase'

export async function completeRegistration() {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Sign in to complete registration.')
  const response = await fetch('/api/register-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ action: 'complete' }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'Account setup could not be completed. Please retry.')
}
