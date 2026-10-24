import { supabase } from './supabase'

export async function completeRegistration() {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Sign in to complete registration.')
  // Read-only, server-verified status avoids provisioning on ordinary login,
  // including while registration is paused. Never use the account-repair helper here.
  const status = await fetch('/api/register-account?action=status', {
    headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
  })
  const current = await status.json().catch(() => ({}))
  if (!status.ok || !current.ok) throw new Error(current.error || 'Account verification unavailable.')
  if (current.provisioned) return current.destination as string
  const response = await fetch('/api/register-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ action: 'complete' }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'Account setup could not be completed. Please retry.')
  return result.destination as string
}
