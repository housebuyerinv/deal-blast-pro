import { supabase } from './supabaseClient'

// Check current auth after asynchronous work, before publishing its result.
// Names, labels and cached profile fields are not account identities.
export async function assertAuthenticatedAccount(expectedUserId: string) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !expectedUserId || data.user?.id !== expectedUserId) {
    throw new Error('Account changed. Reload before continuing.')
  }
}
