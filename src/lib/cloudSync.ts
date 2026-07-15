import { supabase } from './supabase'

const STORAGE_KEY = 'dealblastpro-v1'

function normalizeEmail(value: any) {
  return String(value || '').trim().toLowerCase()
}

function snapshotMatchesSignedInUser(snapshot: any, user: any) {
  const stateUser = snapshot?.state?.user
  if (!stateUser || !user) return false

  const snapshotId = String(stateUser?.id || '').trim()
  const signedInId = String(user?.id || '').trim()
  const snapshotEmail = normalizeEmail(stateUser?.email)
  const signedInEmail = normalizeEmail(user?.email)

  if (snapshotId && signedInId && snapshotId !== signedInId) return false
  if (snapshotEmail && signedInEmail && snapshotEmail !== signedInEmail) return false

  return Boolean((snapshotId && signedInId) || (snapshotEmail && signedInEmail))
}

function clearPrivateSnapshotSlices(snapshot: any, user: any) {
  const safeSnapshot = {
    ...(snapshot || {}),
    state: {
      ...((snapshot || {}).state || {}),
      user: {
        id: user.id,
        email: normalizeEmail(user.email),
        name: user.user_metadata?.full_name || user.user_metadata?.name || normalizeEmail(user.email).split('@')[0],
        role: 'Owner',
        company: '',
      },
      workspaceInstanceId: null,
      workspaceOwnerId: user.id,
      workspaceOwnerEmail: normalizeEmail(user.email),
      workspaceDataScopeKey: `${user.id || ''}:${normalizeEmail(user.email)}`,
      deals: [],
      buyers: [],
      offers: {},
      activities: {},
      documents: {},
      viewedDealIds: [],
      viewedBuyerIds: [],
      suppressionList: [],
      blastLogs: {},
      buyerResponses: {},
      dealSuppressions: {},
      followUps: [],
      dismissedAttention: {},
      teamMembers: [],
      currentDealId: null,
    },
  }

  return safeSnapshot
}

export async function uploadLocalAppDataToCloud() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError || !sessionData.user) throw new Error('You must be logged in first.')

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) throw new Error('No local Deal Blast Pro data found.')

  const snapshot = JSON.parse(raw)
  const safeSnapshot = snapshotMatchesSignedInUser(snapshot, sessionData.user)
    ? snapshot
    : clearPrivateSnapshotSlices(snapshot, sessionData.user)

  const { error } = await supabase
    .from('cloud_snapshots')
    .upsert({
      user_id: sessionData.user.id,
      storage_key: STORAGE_KEY,
      snapshot: safeSnapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,storage_key' })

  if (error) throw error
  return true
}

export async function loadCloudAppDataToLocal(options?: { reload?: boolean; silentMissing?: boolean }) {
  const reload = options?.reload ?? true
  const silentMissing = options?.silentMissing ?? false

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError || !sessionData.user) throw new Error('You must be logged in first.')

  const { data, error } = await supabase
    .from('cloud_snapshots')
    .select('snapshot')
    .eq('user_id', sessionData.user.id)
    .eq('storage_key', STORAGE_KEY)
    .maybeSingle()

  if (error) throw error

  if (!data?.snapshot) {
    if (silentMissing) return false
    throw new Error('No cloud backup found.')
  }

  const safeSnapshot = snapshotMatchesSignedInUser(data.snapshot, sessionData.user)
    ? data.snapshot
    : clearPrivateSnapshotSlices(data.snapshot, sessionData.user)

  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSnapshot))
  window.dispatchEvent(new Event('dealblastpro:storage-sync'))

  if (reload) window.location.reload()

  return true
}

export async function loadCloudTrialActivation() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError || !sessionData.user) return null

  const { data, error } = await supabase
    .from('cloud_snapshots')
    .select('snapshot')
    .eq('user_id', sessionData.user.id)
    .eq('storage_key', STORAGE_KEY)
    .maybeSingle()

  if (error || !data?.snapshot) return null

  const trial = (data.snapshot as any)?.state?.trial
  if (!trial || typeof trial !== 'object') return null

  const supportedBillingStatuses = ['Paid Active', 'Comped', 'Past Due', 'Cancelled', 'Payment Pending']
  if (!supportedBillingStatuses.includes(String(trial.billingStatus || ''))) return null

  return {
    plan: trial.plan,
    billingStatus: trial.billingStatus,
    billingFrequency: trial.billingFrequency,
    paymentProvider: trial.paymentProvider,
    billingPeriodStart: trial.billingPeriodStart || '',
    billingPeriodEnd: trial.billingPeriodEnd || '',
    billingAdminNote: trial.billingAdminNote || '',
  }
}


