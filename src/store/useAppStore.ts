import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { toast } from 'sonner'
import { 

  Deal, Buyer, Offer, Activity, Doc, User, AppSettings, TrialState, 
  MatchResult, AppState, BuyerResponse, BlastLog, DealSuppression 
} from '../lib/types'
import { DEFAULT_SETTINGS, TRIAL_DEFAULT } from '../lib/constants'
import { seedDeals, seedBuyers, seedOffers, seedActivities } from '../lib/mockData'
import { computeMatchScore, getTier } from '../lib/matchingEngine'
import { isApiMode } from '../services/storage'
import { hasOwnerAdminBypass } from '../lib/accessControl'
import { findInventoryDealBySubmission } from '../lib/submissionInventoryIdentity'
import { getOwnerPreviewPlan, hasEffectiveOwnerAdminBypass, isOwnerPreviewActive } from '../lib/planAccess'
import { getBuyerCapacity, getPlanEntitlement } from '../lib/planEntitlements'
import { getPastDuePolicyMessage, getPastDueStage } from '../lib/accountLifecycle'
import { listInventoryDeals } from '../lib/inventoryStorage'

// Module-level guard so initialize is truly one-shot even if called multiple times from effects or StrictMode
const safeLower = (value: any) => String(value ?? '').toLowerCase();

const nativeLocalStorage = typeof window !== 'undefined'
  ? {
      getItem: window.localStorage.getItem.bind(window.localStorage),
      setItem: window.localStorage.setItem.bind(window.localStorage),
      removeItem: window.localStorage.removeItem.bind(window.localStorage),
    }
  : null

const safeLocalStorage = {
  getItem: (name: string) => {
    try {
      return nativeLocalStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      nativeLocalStorage?.setItem(name, value);
    } catch (error: any) {
      if (
        error?.name === 'QuotaExceededError' ||
        String(error?.message || '').toLowerCase().includes('quota')
      ) {
        console.warn('[Deal Blast] localStorage quota exceeded for', name, '- skipping oversized persist write.');
        return;
      }

      throw error;
    }
  },
  removeItem: (name: string) => {
    try {
      nativeLocalStorage?.removeItem(name);
    } catch {}
  }
};


let hasInitialized = false

interface AppStore extends AppState {
  // Explicit operational state (align with actual persisted/used shape + referenced by pages)
  blastLogs: Record<string, BlastLog[]>
  buyerResponses: Record<string, Record<string, BuyerResponse>>
  dealSuppressions: Record<string, DealSuppression[]>
  dismissedAttention: Record<string, { dismissedAt: string; 

issueKeys: string[] }>
  teamMembers: TeamMember[]
  workspaceInstanceId: string | null
  workspaceOwnerId: string | null
  workspaceOwnerEmail: string | null
  workspaceDataScopeKey: string | null

  // Initialization
  initialize: () => void
  
  // Auth
  login: (email: string, name?: string, options?: {
    id?: string
    preserveWorkspace?: boolean
    newWorkspace?: boolean
    fullName?: string
    displayName?: string
    businessName?: string
    company?: string
  }) => void
  logout: () => void
  updateUserProfile: (updates: Partial<Pick<User, 'name' | 'fullName' | 'displayName' | 'businessName' | 'company' | 'email'>>) => void
  setRole: (role: User['role']) => void
  setUserRole: (role: AppRole) => void
  getCurrentRole: () => AppRole
  hasPermission: (permission: AppPermission) => boolean
  canManageUsers: () => boolean
  canDeleteDeals: () => boolean
  canDeleteBuyers: () => boolean
  canImportBuyers: () => boolean
  canBlastDeals: () => boolean
  canAccessCommunity: () => boolean
  canExportData: () => boolean
  canShareResources: () => boolean
  addTeamMember: (member: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt'>) => TeamMember
  updateTeamMember: (id: string, updates: Partial<TeamMember>) => void
  removeTeamMember: (id: string) => void
  
  // Trial
  useTrialAction: (action: keyof TrialState['usage']) => boolean // returns false if blocked
  upgradeToPaid: () => void
  upgradeToPlan: (plan: TrialState['plan']) => void
  activateManualPlan: (updates: {
    plan: TrialState['plan']
    billingStatus: NonNullable<TrialState['billingStatus']>
    billingFrequency?: TrialState['billingFrequency']
    paymentProvider?: TrialState['paymentProvider']
    billingPeriodStart?: string
    billingPeriodEnd?: string
    billingAdminNote?: string
  }) => void
  resetTrial: () => void
  
  // Deals
  hydrateInventory: () => Promise<{ ok: boolean; error?: unknown }>
  cacheInventoryDeal: (deal: Deal) => Deal
  addDeal: (deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>) => Deal
  updateDeal: (id: string, updates: Partial<Deal>) => void
  deleteDeal: (id: string) => void
  deleteDeals: (ids: string[]) => void
  approveDeal: (id: string) => void
  setCurrentDeal: (id: string | null) => void
  safeOpenDeal: (id: string) => void
  getDeal: (id: string) => Deal | undefined
  getInventoryDeals: () => Deal[]
  getSubmissionsQueue: () => Deal[]
  // Convenience section updaters (preserve existing data)
  updateDealProperty: (id: string, updates: Partial<Deal['property']>) => void
  updateDealPricing: (id: string, updates: Partial<Deal['pricing']>) => void
  updateDealDebt: (id: string, updates: Partial<Deal['debt']>) => void
  updateDealCondition: (id: string, updates: Partial<Deal['condition']>) => void
  updateSubmitter: (id: string, updates: Partial<Deal['submitter']>) => void
  addNote: (dealId: string, note: string) => void
  updateDealClosing: (id: string, updates: Partial<Deal['closing']>) => void
  updateClosingChecklist: (id: string, key: string, value: boolean) => void
  
  // Buyers
  addBuyer: (buyer: Omit<Buyer, 'id' | 'createdAt'>) => Buyer
  updateBuyer: (id: string, updates: Partial<Buyer>) => void
  deleteBuyer: (id: string) => void
  importBuyers: (newBuyers: Omit<Buyer, 'id' | 'createdAt'>[]) => { added: number; dups: number; suppressed: number }
  mergeBuyers: (primaryId: string, toMergeIds: string[]) => void
  getBuyer: (id: string) => Buyer | undefined
  addToSuppression: (email: string) => void
  
  // Matching
  getMatchesForDeal: (dealId: string) => MatchResult[]
  excludeBuyerFromDeal: (dealId: string, buyerId: string, reason: string) => void
  
  // Offers
  addOffer: (dealId: string, offer: Omit<Offer, 'id' | 'createdAt' | 'history'>) => void
  updateOfferStatus: (dealId: string, offerId: string, status: Offer['status'], counter?: number) => void
  
  // Documents
  addDocument: (dealId: string, doc: Partial<Doc> & { name: string; url: string; category: string }) => void
  removeDocument: (dealId: string, docId: string) => void
  toggleDocFlag: (dealId: string, docId: string, flag: 'isBuyerFacing' | 'requiresNDA' | 'isRequired') => void
  
  // Activity
  logActivity: (dealId: string | null, type: string, description: string) => void
  getActivities: (dealId: string) => Activity[]
  
  // Viewed / New badges
  markDealViewed: (id: string) => void
  markBuyerViewed: (id: string) => void
  isNewDeal: (id: string) => boolean
  isNewBuyer: (id: string) => boolean
  
  // Blast
  recordBlast: (dealId: string, buyerIds: string[]) => void
  
  // Settings
  updateSettings: (updates: Partial<AppSettings>) => void
  
  // UI
  toggleSidebar: () => void
  
  // Data ops
  exportAllData: () => string
  importAllData: (json: string) => Promise<{ deals: number; buyers: number; blastLogs: number; followUps: number; hasSettings: boolean } | void>
  clearAllData: () => void
  reseedData: () => void
  cleanupOrphanedDealData: () => void

  // Buyer Match History & Response Tracking
  setBuyerResponse: (buyerId: string, dealId: string, status: BuyerResponse['status'], notes?: string) => void
  getBuyerMatchHistory: (buyerId: string) => Array<{
    deal: Deal
    score: number
    reasons: string[]
    blasted: boolean
    response?: BuyerResponse
    offer?: Offer
  }>

  // Deal-specific Suppression
  suppressBuyerFromDeal: (dealId: string, buyerId: string, reason: string) => void
  removeDealSuppression: (dealId: string, buyerId: string) => void
  isBuyerSuppressedForDeal: (dealId: string, buyerId: string) => boolean

  // Blast History
  recordBlastLog: (dealId: string, log: Omit<BlastLog, 'id' | 'sentAt' | 'sentBy'>) => void
  getBlastLogs: (dealId: string) => BlastLog[]

  // Follow-ups (enhanced Disposition CRM)
  followUps: any[]
  scheduleFollowUp: (dealId: string, buyerId: string | undefined, delayDays: number, type: string) => void
  completeFollowUp: (id: string) => void
  getPendingFollowUps: () => Array<any>
  createTask: (task: any) => void
  generateAutoFollowUpsFromInventory: () => number
  generateAutoFollowUpsFromBuyers: () => number
  getFollowUpStats: () => { pending: number; dueToday: number; overdue: number; completedThisWeek: number; autoGenerated: number }
  prioritizeFollowUps: (followUps: any[]) => any[]

  // Attention / Needs Attention
  getDealAttentionItems: (deal: any) => string[]
  dismissDealAttention: (dealId: string, issueKeys?: string[]) => void
  clearDealAttention: (dealId: string) => void

  // Scores
  getBuyerHeatScore: (buyerId: string) => number
  getDealQualityScore: (dealId: string) => { score: number; grade: string; strengths: string[]; weaknesses: string[] }

  // Sales / Demo helpers
  runSampleWorkflow: () => { dealId: string }
}

const STORAGE_KEY = 'dealblastpro-v1'

const IS_PRODUCTION = import.meta.env.PROD
const shouldPersistBuyersLocally = !IS_PRODUCTION
const isLegacyDemoEmail = (email: string) => {
  const [name, domain] = email.split('@')
  return name === 'demo' && domain === 'dealblast.pro'
}

const normalizeWorkspaceEmail = (email: any) => String(email || '').trim().toLowerCase()
const makeWorkspaceDataScopeKey = (user?: any) => {
  const id = String(user?.id || '').trim()
  const email = normalizeWorkspaceEmail(user?.email)
  return id || email ? `${id}:${email}` : ''
}
const usersRepresentSameAccount = (a?: any, b?: any) => {
  if (!a || !b) return false
  const aId = String(a?.id || '').trim()
  const bId = String(b?.id || '').trim()
  const aEmail = normalizeWorkspaceEmail(a?.email)
  const bEmail = normalizeWorkspaceEmail(b?.email)

  if (aId && bId && aId !== bId) return false
  if (aEmail && bEmail && aEmail !== bEmail) return false

  return Boolean((aId && bId) || (aEmail && bEmail))
}
const makeWorkspaceInstanceId = (user?: any) => {
  const owner = user?.id || normalizeWorkspaceEmail(user?.email) || 'workspace'
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `ws_${owner}_${random}`
}

const getDefaultDeletionRequest = (workspaceInstanceId = '') => ({
  ...DEFAULT_SETTINGS.deletionRequest!,
  workspaceInstanceId,
  status: 'None' as const,
  accountStatus: 'Active' as const,
  requestedAt: '',
  requestedBy: '',
  cancellationRequestedAt: '',
  scheduledDeletionAt: '',
  cancelAtPeriodEnd: false,
  note: '',
})

const resetLifecycleSettings = (settings: AppSettings | undefined, workspaceInstanceId: string) => ({
  ...(settings || DEFAULT_SETTINGS),
  deletionRequest: getDefaultDeletionRequest(workspaceInstanceId),
})

const getWorkspaceOwnerPatch = (user: any) => ({
  workspaceOwnerId: user?.id || null,
  workspaceOwnerEmail: normalizeWorkspaceEmail(user?.email),
})

const buyerScopeMatchesUser = (state: any, user: any) => {
  if (!user) return false

  const ownerId = state?.workspaceOwnerId || null
  const ownerEmail = normalizeWorkspaceEmail(state?.workspaceOwnerEmail)
  const userId = user?.id || null
  const userEmail = normalizeWorkspaceEmail(user?.email)
  const persistedUser = state?.user
  const persistedScopeKey = String(state?.workspaceDataScopeKey || '').trim()
  const currentScopeKey = makeWorkspaceDataScopeKey(user)

  if (!ownerId && !ownerEmail) return false
  if (ownerId && userId && ownerId !== userId) return false
  if (ownerEmail && userEmail && ownerEmail !== userEmail) return false
  if (persistedUser && !usersRepresentSameAccount(persistedUser, user)) return false
  if (persistedScopeKey && currentScopeKey && persistedScopeKey !== currentScopeKey) return false

  return true
}

const privateWorkspaceScopeMatchesUser = buyerScopeMatchesUser

const cleanWorkspaceState = () => ({
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
})

const removeDealScopedState = (state: any, ids: string[]) => {
  const removeSet = new Set((ids || []).filter(Boolean))
  if (!removeSet.size) return {}

  const nextActivities = { ...(state.activities || {}) }
  const nextOffers = { ...(state.offers || {}) }
  const nextDocuments = { ...(state.documents || {}) }
  const nextBlastLogs = { ...(state.blastLogs || {}) }
  const nextDealSuppressions = { ...(state.dealSuppressions || {}) }
  const nextDismissedAttention = { ...(state.dismissedAttention || {}) }
  const nextBuyerResponses = { ...(state.buyerResponses || {}) }

  removeSet.forEach(id => {
    delete nextActivities[id]
    delete nextOffers[id]
    delete nextDocuments[id]
    delete nextBlastLogs[id]
    delete nextDealSuppressions[id]
    delete nextDismissedAttention[id]
    delete nextBuyerResponses[id]
  })

  Object.keys(nextBuyerResponses).forEach(buyerId => {
    const responsesForBuyer = { ...(nextBuyerResponses[buyerId] || {}) }
    removeSet.forEach(dealId => delete responsesForBuyer[dealId])

    if (Object.keys(responsesForBuyer).length) {
      nextBuyerResponses[buyerId] = responsesForBuyer
    } else {
      delete nextBuyerResponses[buyerId]
    }
  })

  return {
    activities: nextActivities,
    offers: nextOffers,
    documents: nextDocuments,
    blastLogs: nextBlastLogs,
    dealSuppressions: nextDealSuppressions,
    dismissedAttention: nextDismissedAttention,
    buyerResponses: nextBuyerResponses,
    followUps: (state.followUps || []).filter((f: any) => !removeSet.has(f?.dealId)),
    viewedDealIds: (state.viewedDealIds || []).filter((id: string) => !removeSet.has(id)),
    currentDealId: removeSet.has(state.currentDealId || '') ? null : state.currentDealId,
  }
}

const cleanupOrphanedDealState = (state: any) => {
  const liveDealIds = new Set((state.deals || []).map((deal: any) => deal?.id).filter(Boolean))
  const filterRecordByLiveDeal = (record: Record<string, any> = {}) => Object.fromEntries(
    Object.entries(record || {}).filter(([dealId]) => dealId === '__global' || liveDealIds.has(dealId))
  )

  const nextBuyerResponses: Record<string, any> = {}
  Object.entries(state.buyerResponses || {}).forEach(([buyerId, responsesByDeal]: any) => {
    if (liveDealIds.has(buyerId)) return

    const filtered = Object.fromEntries(
      Object.entries(responsesByDeal || {}).filter(([dealId]) => liveDealIds.has(dealId))
    )
    if (Object.keys(filtered).length) nextBuyerResponses[buyerId] = filtered
  })

  return {
    activities: filterRecordByLiveDeal(state.activities),
    offers: filterRecordByLiveDeal(state.offers),
    documents: filterRecordByLiveDeal(state.documents),
    blastLogs: filterRecordByLiveDeal(state.blastLogs),
    dealSuppressions: filterRecordByLiveDeal(state.dealSuppressions),
    dismissedAttention: filterRecordByLiveDeal(state.dismissedAttention),
    buyerResponses: nextBuyerResponses,
    followUps: (state.followUps || []).filter((f: any) => !f?.dealId || liveDealIds.has(f.dealId)),
    viewedDealIds: (state.viewedDealIds || []).filter((id: string) => liveDealIds.has(id)),
    currentDealId: state.currentDealId && !liveDealIds.has(state.currentDealId) ? null : state.currentDealId,
  }
}

type AppRole =
  | 'Owner'
  | 'Admin'
  | 'Acquisition Manager'
  | 'Disposition Manager'
  | 'Transaction Coordinator'
  | 'VA'
  | 'Viewer'
  | 'Community Member'

type AppPermission =
  | 'manage_users'
  | 'manage_settings'
  | 'view_dashboard'
  | 'view_financials'
  | 'view_deals'
  | 'create_deals'
  | 'edit_deals'
  | 'delete_deals'
  | 'approve_deals'
  | 'blast_deals'
  | 'view_buyers'
  | 'import_buyers'
  | 'edit_buyers'
  | 'delete_buyers'
  | 'view_resources'
  | 'import_resources'
  | 'edit_resources'
  | 'delete_resources'
  | 'share_resources'
  | 'access_community'
  | 'approve_community_uploads'
  | 'export_data'
  | 'import_data'

type TeamMember = {
  id: string
  name: string
  email: string
  role: AppRole
  status: 'Active' | 'Invited' | 'Disabled'
  createdAt: string
  updatedAt: string
}

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  Owner: [
    'manage_users',
    'manage_settings',
    'view_dashboard',
    'view_financials',
    'view_deals',
    'create_deals',
    'edit_deals',
    'delete_deals',
    'approve_deals',
    'blast_deals',
    'view_buyers',
    'import_buyers',
    'edit_buyers',
    'delete_buyers',
    'view_resources',
    'import_resources',
    'edit_resources',
    'delete_resources',
    'share_resources',
    'access_community',
    'approve_community_uploads',
    'export_data',
    'import_data',
  ],
  Admin: [
    'manage_settings',
    'view_dashboard',
    'view_financials',
    'view_deals',
    'create_deals',
    'edit_deals',
    'delete_deals',
    'approve_deals',
    'blast_deals',
    'view_buyers',
    'import_buyers',
    'edit_buyers',
    'delete_buyers',
    'view_resources',
    'import_resources',
    'edit_resources',
    'delete_resources',
    'share_resources',
    'access_community',
    'export_data',
    'import_data',
  ],
  'Acquisition Manager': [
    'view_dashboard',
    'view_deals',
    'create_deals',
    'edit_deals',
    'approve_deals',
    'view_buyers',
    'view_resources',
    'import_resources',
    'edit_resources',
  ],
  'Disposition Manager': [
    'view_dashboard',
    'view_financials',
    'view_deals',
    'edit_deals',
    'blast_deals',
    'view_buyers',
    'import_buyers',
    'edit_buyers',
    'view_resources',
    'import_resources',
    'edit_resources',
    'share_resources',
    'export_data',
  ],
  'Transaction Coordinator': [
    'view_dashboard',
    'view_deals',
    'edit_deals',
    'view_buyers',
    'view_resources',
    'edit_resources',
  ],
  VA: [
    'view_dashboard',
    'view_deals',
    'create_deals',
    'edit_deals',
    'view_buyers',
    'import_buyers',
    'view_resources',
    'import_resources',
  ],
  Viewer: [
    'view_dashboard',
    'view_deals',
    'view_buyers',
    'view_resources',
  ],
  'Community Member': [
    'view_dashboard',
    'view_deals',
    'create_deals',
    'view_buyers',
    'view_resources',
    'import_resources',
    'access_community',
  ],
}

function normalizeAppRole(role?: string | null): AppRole {
  const value = String(role || '').trim()

  if (value === 'Owner') return 'Owner'
  if (value === 'Admin') return 'Admin'
  if (value === 'Acquisition Manager') return 'Acquisition Manager'
  if (value === 'Disposition Manager') return 'Disposition Manager'
  if (value === 'Transaction Coordinator') return 'Transaction Coordinator'
  if (value === 'VA') return 'VA'
  if (value === 'Community Member') return 'Community Member'
  if (value === 'Viewer') return 'Viewer'

  return 'Viewer'
}

function stripPreviewSettings<T extends { settings?: AppSettings }>(state: T): T {
  const settings = state?.settings
  if (!settings || !Object.prototype.hasOwnProperty.call(settings, 'ownerPreviewPlan')) return state
  const { ownerPreviewPlan: _ownerPreviewPlan, ...safeSettings } = settings
  return {
    ...state,
    settings: {
      ...safeSettings,
      ownerPreviewPlan: 'Owner Admin',
    },
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      trial: TRIAL_DEFAULT,
      deals: [],
      buyers: [],
      offers: {},
      activities: {},
      documents: {},
      settings: DEFAULT_SETTINGS,
      viewedDealIds: [],
      viewedBuyerIds: [],
      suppressionList: [],
      sidebarOpen: true,
      currentDealId: null,
      workspaceInstanceId: null,
      workspaceOwnerId: null,
      workspaceOwnerEmail: null,
      workspaceDataScopeKey: null,

      // Operational blast & buyer tracking
      blastLogs: {},
      buyerResponses: {},
      dealSuppressions: {},
      followUps: [],

      // Needs Attention dismissals (explicit only)
      dismissedAttention: {},
      teamMembers: [],

      initialize: () => {
        if (hasInitialized) return
        hasInitialized = true

        // Recover from corrupt or partial storage without creating demo/sample records.
        const current = get()
        const persistedEmail = normalizeWorkspaceEmail(current.user?.email)
        if (IS_PRODUCTION && (!current.user?.id || isLegacyDemoEmail(persistedEmail))) {
          set({
            ...cleanWorkspaceState(),
            user: null,
            workspaceInstanceId: null,
            workspaceOwnerId: null,
            workspaceOwnerEmail: null,
            workspaceDataScopeKey: null,
            trial: TRIAL_DEFAULT,
            settings: DEFAULT_SETTINGS,
          })
          safeLocalStorage.removeItem(STORAGE_KEY)
          return
        }
        if (!Array.isArray(current.deals)) set({ deals: [] })
        if (!Array.isArray(current.buyers)) set({ buyers: [] })
        if (current.user && !privateWorkspaceScopeMatchesUser(current, current.user)) {
          set({
            ...cleanWorkspaceState(),
            ...getWorkspaceOwnerPatch(current.user),
            workspaceDataScopeKey: makeWorkspaceDataScopeKey(current.user),
          })
        } else if (current.user && !current.workspaceOwnerId && !current.workspaceOwnerEmail) {
          set({
            ...getWorkspaceOwnerPatch(current.user),
            workspaceDataScopeKey: makeWorkspaceDataScopeKey(current.user),
          })
        }
        if (!current.offers || typeof current.offers !== 'object') set({ offers: {} })
        if (!current.activities || typeof current.activities !== 'object') set({ activities: {} })
        if (!current.documents || typeof current.documents !== 'object') set({ documents: {} })
        if (!current.blastLogs || typeof current.blastLogs !== 'object') set({ blastLogs: {} })
        if (!current.buyerResponses || typeof current.buyerResponses !== 'object') set({ buyerResponses: {} })
        if (!current.dealSuppressions || typeof current.dealSuppressions !== 'object') set({ dealSuppressions: {} })
        if (!Array.isArray(current.followUps)) set({ followUps: [] })
        if (!current.dismissedAttention || typeof current.dismissedAttention !== 'object') set({ dismissedAttention: {} })
        if (!Array.isArray(current.teamMembers)) set({ teamMembers: [] })
        if (!Array.isArray(current.viewedDealIds)) set({ viewedDealIds: [] })
        if (!Array.isArray(current.viewedBuyerIds)) set({ viewedBuyerIds: [] })
        if (!Array.isArray(current.suppressionList)) set({ suppressionList: [] })
        if (current.currentDealId && !get().deals.some(d => d.id === current.currentDealId)) set({ currentDealId: null })
        if (!current.settings) set({ settings: DEFAULT_SETTINGS })
        if (current.user && !current.workspaceInstanceId) {
          const workspaceInstanceId = makeWorkspaceInstanceId(current.user)
          const currentSettings = get().settings || DEFAULT_SETTINGS
          const existingDeletion = currentSettings.deletionRequest || DEFAULT_SETTINGS.deletionRequest!
          const hasBlockingLifecycle =
            ['Deletion Requested', 'Cancellation Scheduled', 'Deactivated', 'Deleted'].includes(String(existingDeletion.accountStatus || '')) ||
            existingDeletion.status === 'Deletion Requested'
          set({
            workspaceInstanceId,
            workspaceDataScopeKey: makeWorkspaceDataScopeKey(current.user),
            settings: hasBlockingLifecycle
              ? {
                  ...currentSettings,
                  deletionRequest: {
                    ...existingDeletion,
                    workspaceInstanceId,
                  },
                }
              : resetLifecycleSettings(currentSettings, workspaceInstanceId),
          })
        }
        get().cleanupOrphanedDealData()
        if (get().user) void get().hydrateInventory()
      },

      // Auth
      login: (email, name, options) => {
        const currentUser = get().user
        const normalizedEmail = email.trim().toLowerCase()
        const isSameUser = currentUser?.email?.trim().toLowerCase() === normalizedEmail
        const currentDeletion = get().settings?.deletionRequest
        const currentDeletedOrDeactivated = ['Deleted', 'Deactivated'].includes(String(currentDeletion?.accountStatus || ''))
        const shouldPreserveWorkspace = options?.newWorkspace ? false : (options?.preserveWorkspace ?? (isSameUser && !currentDeletedOrDeactivated))
        const fullName = String(options?.fullName || name || currentUser?.fullName || '').trim()
        const displayName = String(options?.displayName || currentUser?.displayName || '').trim()
        const businessName = String(options?.businessName || options?.company || currentUser?.businessName || currentUser?.company || '').trim()
        const nextUser = {
          id: options?.id || (isSameUser ? currentUser?.id : undefined) || 'u_' + Date.now(),
          name: displayName || fullName || name || email.split('@')[0],
          email: normalizedEmail,
          role: 'Owner' as User['role'],
          fullName,
          displayName,
          businessName,
          company: businessName || currentUser?.company || ''
        }
        const workspaceInstanceId = shouldPreserveWorkspace
          ? (get().workspaceInstanceId || makeWorkspaceInstanceId(nextUser))
          : makeWorkspaceInstanceId(nextUser)

        if (!shouldPreserveWorkspace || currentUser?.id !== nextUser.id) {
          void import('../lib/buyerSupabaseSync').then(m => m.invalidateBuyerHydrationCache())
        }
        set({
          ...(shouldPreserveWorkspace ? {} : cleanWorkspaceState()),
          workspaceInstanceId,
          ...getWorkspaceOwnerPatch(nextUser),
          workspaceDataScopeKey: makeWorkspaceDataScopeKey(nextUser),
          settings: shouldPreserveWorkspace ? get().settings : resetLifecycleSettings(DEFAULT_SETTINGS, workspaceInstanceId),
          user: nextUser
        })
        void get().hydrateInventory()
      },
      logout: () => {
        void import('../lib/buyerSupabaseSync').then(m => m.invalidateBuyerHydrationCache())
        set({
          ...cleanWorkspaceState(),
          user: null,
          trial: TRIAL_DEFAULT,
          workspaceInstanceId: null,
          workspaceOwnerId: null,
          workspaceOwnerEmail: null,
          workspaceDataScopeKey: null,
        })
      },
      updateUserProfile: (updates) => {
        const u = get().user
        if (!u) return
        const next = {
          ...u,
          ...updates,
        }
        next.name = String(updates.displayName || updates.name || next.displayName || next.fullName || next.name || '').trim() || 'User'
        next.company = String(updates.businessName || updates.company || next.businessName || next.company || '').trim()
        set({ user: next })
      },
      setRole: (role) => {
        const u = get().user
        if (u) set({ user: { ...u, role } })
      },
      setUserRole: (role) => {
        const u = get().user
        if (u) set({ user: { ...u, role: role as User['role'] } })
      },
      getCurrentRole: () => {
        return normalizeAppRole(String(get().user?.role || 'Viewer'))
      },
      hasPermission: (permission) => {
        if (hasOwnerAdminBypass(get().user)) return true
        const role = normalizeAppRole(String(get().user?.role || 'Viewer'))
        return ROLE_PERMISSIONS[role].includes(permission)
      },
      canManageUsers: () => get().hasPermission('manage_users'),
      canDeleteDeals: () => get().hasPermission('delete_deals'),
      canDeleteBuyers: () => get().hasPermission('delete_buyers'),
      canImportBuyers: () => get().hasPermission('import_buyers'),
      canBlastDeals: () => get().hasPermission('blast_deals'),
      canAccessCommunity: () => get().hasPermission('access_community'),
      canExportData: () => get().hasPermission('export_data'),
      canShareResources: () => get().hasPermission('share_resources'),
      addTeamMember: (member) => {
        if (!get().canManageUsers()) {
          toast.error('You do not have permission to manage users')
          return {
            ...member,
            id: 'blocked',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }

        const now = new Date().toISOString()
        const teamMember: TeamMember = {
          ...member,
          id: 'TM' + Date.now().toString(36).toUpperCase(),
          createdAt: now,
          updatedAt: now,
        }

        set(s => ({ teamMembers: [...s.teamMembers, teamMember] }))
        toast.success(`${teamMember.name || teamMember.email} added as ${teamMember.role}`)
        return teamMember
      },
      updateTeamMember: (id, updates) => {
        if (!get().canManageUsers()) {
          toast.error('You do not have permission to manage users')
          return
        }

        set(s => ({
          teamMembers: s.teamMembers.map(member =>
            member.id === id
              ? { ...member, ...updates, updatedAt: new Date().toISOString() }
              : member
          )
        }))
      },
      removeTeamMember: (id) => {
        if (!get().canManageUsers()) {
          toast.error('You do not have permission to manage users')
          return
        }

        set(s => ({ teamMembers: s.teamMembers.filter(member => member.id !== id) }))
        toast.success('Team member removed')
      },

      // Trial gating
      useTrialAction: (action) => {
        const ownerPreviewActive = isOwnerPreviewActive(get().user, get().settings)
        if (hasEffectiveOwnerAdminBypass(get().user, get().settings)) return true
        const { trial } = get()
        const previewPlan = getOwnerPreviewPlan(get().settings)
        const effectiveTrial = ownerPreviewActive
          ? {
            ...trial,
            plan: previewPlan === 'Owner Admin' ? trial.plan : previewPlan,
            isPaid: !['Free', 'Free Demo'].includes(previewPlan),
            billingStatus: ['Free', 'Free Demo'].includes(previewPlan) ? 'Free Active' as const : 'Paid Active' as const,
          }
          : trial
        const billingStatus = effectiveTrial.billingStatus || (effectiveTrial.isPaid ? 'Paid Active' : 'Free Active')
        if (billingStatus === 'Payment Pending') {
          toast.error('Payment is pending. Please wait for Stripe payment confirmation before starting new public or paid activity.')
          return false
        }
        if (billingStatus === 'Past Due') {
          const stage = getPastDueStage(effectiveTrial)
          toast.error(getPastDuePolicyMessage(stage))
          return false
        }
        if (billingStatus === 'Cancelled') {
          toast.error('This plan is cancelled. Contact admin to reactivate billing, or return to Free if available.')
          return false
        }
        if (!effectiveTrial.isActive || effectiveTrial.isPaid || (effectiveTrial.plan && !['Free', 'Free Demo', 'Starter'].includes(effectiveTrial.plan))) return true
        
        const buyerLimit = getPlanEntitlement(effectiveTrial.plan || 'Free Demo').buyerLimit ?? 999999
        const PLAN_LIMITS: Record<string, Record<keyof TrialState['usage'], number>> = {
          Free: { dealsSubmitted: 3, buyersImported: buyerLimit, blastsSent: 0, exports: 20 },
          'Free Demo': { dealsSubmitted: 3, buyersImported: buyerLimit, blastsSent: 0, exports: 20 },
          'Starter': { dealsSubmitted: 25, buyersImported: buyerLimit, blastsSent: 20, exports: 50 },
          'Pro': { dealsSubmitted: 999, buyersImported: buyerLimit, blastsSent: 999, exports: 999 },
          'Agency': { dealsSubmitted: 999, buyersImported: buyerLimit, blastsSent: 999, exports: 999 },
          'Enterprise': { dealsSubmitted: 999, buyersImported: buyerLimit, blastsSent: 999, exports: 999 }
        }
        const normalizedPlan = effectiveTrial.plan === 'Free Demo' ? 'Free' : effectiveTrial.plan || 'Free'
        const limits = PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.Free
        
        const current = effectiveTrial.usage[action]
        if (current >= limits[action]) {
          toast.error('Free plan limit reached. Upgrade when you are ready to continue creating new activity.')
          return false // blocked
        }

        if (ownerPreviewActive) return true
        
        set({
          trial: {
            ...trial,
            usage: { ...trial.usage, [action]: current + 1 }
          }
        })
        return true
      },
      upgradeToPaid: () => {
        // backward compat: treat as Pro
        set(s => ({
          trial: { ...s.trial, plan: 'Pro', isPaid: true, isActive: true, daysLeft: 999, billingStatus: 'Paid Active', billingUpdatedAt: new Date().toISOString() }
        }))
      },
      upgradeToPlan: (plan) => {
        const normalizedPlan = plan === 'Free Demo' ? 'Free' : plan
        const isPaidPlan = normalizedPlan !== 'Free'
        set(s => ({
          trial: {
            ...s.trial,
            plan: normalizedPlan,
            isPaid: isPaidPlan,
            isActive: true,
            daysLeft: isPaidPlan ? 999 : 999,
            endDate: isPaidPlan ? s.trial.endDate : '',
            billingStatus: isPaidPlan ? 'Paid Active' : 'Free Active',
            billingUpdatedAt: new Date().toISOString()
          }
        }))
      },
      activateManualPlan: (updates) => {
        const normalizedPlan = updates.plan === 'Free Demo' ? 'Free' : updates.plan
        const isPaidPlan = normalizedPlan !== 'Free'
        const isActiveBilling = updates.billingStatus === 'Paid Active' || updates.billingStatus === 'Comped'
        const isTrial = updates.billingStatus === 'Trial Active'
        const isFree = normalizedPlan === 'Free'

        set(s => ({
          trial: {
            ...s.trial,
            plan: normalizedPlan,
            isPaid: isPaidPlan && isActiveBilling,
            isActive: isActiveBilling || isTrial || isFree,
            daysLeft: isPaidPlan && isActiveBilling ? 999 : isFree ? 999 : isTrial ? Math.max(s.trial.daysLeft || 0, 7) : 0,
            endDate: isFree ? '' : s.trial.endDate,
            billingStatus: isFree ? 'Free Active' : updates.billingStatus,
            billingFrequency: updates.billingFrequency || s.trial.billingFrequency || 'monthly',
            paymentProvider: updates.paymentProvider || s.trial.paymentProvider || 'Stripe',
            billingPeriodStart: updates.billingPeriodStart || '',
            billingPeriodEnd: updates.billingPeriodEnd || '',
            billingAdminNote: updates.billingAdminNote || '',
            billingUpdatedAt: new Date().toISOString(),
          }
        }))
      },
      resetTrial: () => set({ trial: TRIAL_DEFAULT }),

      // Deals
      hydrateInventory: async () => {
        const result = await listInventoryDeals()
        if (!result.ok) return { ok: false, error: result.error }
        set({ deals: result.data })
        get().cleanupOrphanedDealData()
        return { ok: true }
      },
      cacheInventoryDeal: (deal) => {
        set(s => ({
          deals: s.deals.some(item => item.id === deal.id)
            ? s.deals.map(item => item.id === deal.id ? deal : item)
            : [deal, ...s.deals],
        }))
        return deal
      },
      addDeal: (partial) => {
        const sourceSubmissionId = String(
          (partial as any)?.sourceSubmissionId ||
          (partial as any)?.originalSubmissionId ||
          (partial as any)?.originalSubmission?.id ||
          ''
        ).trim()
        if (sourceSubmissionId) {
          const existing = findInventoryDealBySubmission(get().deals, sourceSubmissionId)
          if (existing) return existing
        }

        const requestedId = sourceSubmissionId ? String((partial as any)?.id || '').trim() : ''
        const id = requestedId || ('D' + Date.now().toString(36).toUpperCase())
        const idCollision = get().deals.find((deal: any) => deal?.id === id)
        if (idCollision) return idCollision
        const now = new Date().toISOString()
        const deal: Deal = {
          ...partial,
          id,
          createdAt: now,
          updatedAt: now,
          docs: partial.docs || [],
        } as Deal
        
        set(s => ({ deals: [...s.deals, deal] }))
        get().logActivity(id, 'Submission Created', `New deal submitted: ${deal.property.address}`)
        return deal
      },
      updateDeal: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d)
        }))
      },
      deleteDeal: (id) => {
        get().deleteDeals([id])
      },
      deleteDeals: (ids) => {
        const idsToDelete = Array.from(new Set((ids || []).filter(Boolean)))
        if (!idsToDelete.length) return

        const removeSet = new Set(idsToDelete)
        set(s => ({
          deals: (s.deals || []).filter((deal: any) => !removeSet.has(deal.id)),
          ...removeDealScopedState(s, idsToDelete),
        }))
      },
      approveDeal: (id) => {
        get().updateDeal(id, { status: 'Approved' })
        get().logActivity(id, 'Deal Approved', 'Deal moved from submissions to active inventory')
      },
      setCurrentDeal: (id) => {
        set({ currentDealId: id })
        if (id) get().markDealViewed(id)
      },
      // Safe open for drawers to avoid any side effects that could cause update loops
      safeOpenDeal: (id: string) => {
        set({ currentDealId: id })
        // No markViewed, no logging, no other writes during open
      },
      getDeal: (id) => get().deals.find(d => d.id === id),
      getInventoryDeals: () => {
        const approved = ['Approved', 'Active', 'Blasted', 'Offers Received', 'Under Contract', 'Closing', 'Sold']
        return get().deals.filter(d => approved.includes(d.status))
      },
      getSubmissionsQueue: () => {
        return get().deals.filter(d => ['Submitted', 'Needs Info', 'Draft'].includes(d.status))
      },

      // Convenience section updaters
      updateDealProperty: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? {
            ...d,
            property: { ...d.property, ...updates },
            updatedAt: new Date().toISOString()
          } : d)
        }))
      },
      updateDealPricing: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? {
            ...d,
            pricing: { ...d.pricing, ...updates },
            updatedAt: new Date().toISOString()
          } : d)
        }))
      },
      updateDealDebt: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? {
            ...d,
            debt: { ...d.debt, ...updates },
            updatedAt: new Date().toISOString()
          } : d)
        }))
      },
      updateDealCondition: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? {
            ...d,
            condition: { ...d.condition, ...updates },
            updatedAt: new Date().toISOString()
          } : d)
        }))
      },
      updateSubmitter: (id, updates) => {
        set(s => ({
          deals: s.deals.map(d => d.id === id ? {
            ...d,
            submitter: { ...d.submitter, ...updates },
            updatedAt: new Date().toISOString()
          } : d)
        }))
      },
      addNote: (dealId, note) => {
        get().logActivity(dealId, 'Note Added', note)
      },
      updateDealClosing: (id, updates = {}) => {
        set(s => ({
          deals: s.deals.map(d => {
            if (d.id !== id) return d
            const currentClosing = d.closing || { checklist: {} }
            return {
              ...d,
              closing: {
                ...currentClosing,
                ...updates,
                checklist: {
                  ...currentClosing.checklist,
                  ...(updates.checklist || {})
                }
              },
              updatedAt: new Date().toISOString()
            }
          })
        }))
      },
      updateClosingChecklist: (id, key, value) => {
        set(s => ({
          deals: s.deals.map(d => {
            if (d.id !== id) return d
            const currentClosing = d.closing || { checklist: {} }
            return {
              ...d,
              closing: {
                ...currentClosing,
                checklist: {
                  ...currentClosing.checklist,
                  [key]: value
                }
              },
              updatedAt: new Date().toISOString()
            }
          })
        }))
        get().logActivity(id, 'Closing Update', `Checklist item "${key}" set to ${value}`)
      },

      // === New Operational Features ===

      setBuyerResponse: (buyerId, dealId, status, notes) => {
        set(s => {
          const current = s.buyerResponses[buyerId] || {}
          return {
            buyerResponses: {
              ...s.buyerResponses,
              [buyerId]: {
                ...current,
                [dealId]: {
                  status,
                  date: new Date().toISOString(),
                  notes
                }
              }
            }
          }
        })
        get().logActivity(dealId, 'Buyer Response', `Buyer ${buyerId} marked as ${status}`)
      },

      getBuyerMatchHistory: (buyerId) => {
        const buyer = get().buyers.find(b => b.id === buyerId)
        if (!buyer) return []

        const responses = get().buyerResponses[buyerId] || {}
        const allDeals = get().deals

        return allDeals
          .map(deal => {
            const matchResults = get().getMatchesForDeal(deal.id)
            const match = matchResults.find(m => m.buyer.id === buyerId)
            if (!match) return null

            const blasted = deal.status === 'Blasted' || deal.status === 'Offers Received'
            const response = responses[deal.id]
            const offer = (get().offers[deal.id] || []).find(o => o.buyerId === buyerId || o.buyerEmail === buyer.email)

            return {
              deal,
              score: match.score,
              reasons: match.reasons,
              blasted,
              response,
              offer
            }
          })
          .filter(Boolean) as any
      },

      suppressBuyerFromDeal: (dealId, buyerId, reason) => {
        set(s => {
          const current = s.dealSuppressions[dealId] || []
          const exists = current.some(s => s.buyerId === buyerId)
          if (exists) return s

          return {
            dealSuppressions: {
              ...s.dealSuppressions,
              [dealId]: [...current, {
                buyerId,
                reason,
                suppressedAt: new Date().toISOString()
              }]
            }
          }
        })
        get().logActivity(dealId, 'Buyer Suppressed', `Buyer ${buyerId} suppressed from this deal: ${reason}`)
      },

      removeDealSuppression: (dealId, buyerId) => {
        set(s => {
          const current = s.dealSuppressions[dealId] || []
          return {
            dealSuppressions: {
              ...s.dealSuppressions,
              [dealId]: current.filter(s => s.buyerId !== buyerId)
            }
          }
        })
        get().logActivity(dealId, 'Suppression Removed', `Buyer ${buyerId} re-enabled for this deal`)
      },

      isBuyerSuppressedForDeal: (dealId, buyerId) => {
        const list = get().dealSuppressions[dealId] || []
        return list.some(s => s.buyerId === buyerId)
      },

      recordBlastLog: (dealId, logData) => {
        const id = 'BL' + Date.now().toString(36)
        const fullLog: BlastLog = {
          ...logData,
          id,
          sentAt: new Date().toISOString(),
          sentBy: get().user?.name || 'System'
        }

        set(s => ({
          blastLogs: {
            ...s.blastLogs,
            [dealId]: [...(s.blastLogs[dealId] || []), fullLog]
          }
        }))

        get().logActivity(dealId, 'Blast Sent', `Blast sent to ${logData.recipientCount} buyers using ${logData.template}`)
      },

      getBlastLogs: (dealId) => {
        return get().blastLogs[dealId] || []
      },

      scheduleFollowUp: (dealId, buyerId, delayDays, type) => {
        const due = new Date(Date.now() + delayDays * 86400000).toISOString()
        const id = 'FU' + Date.now().toString(36)

        set(s => ({
          followUps: [
            ...s.followUps,
            { id, dealId, buyerId, dueDate: due, type, completed: false }
          ]
        }))

        get().logActivity(dealId, 'Follow-Up Scheduled', `${type} follow-up scheduled for ${delayDays} days`)
      },

      completeFollowUp: (id) => {
        set(s => ({
          followUps: s.followUps.map(f => f.id === id ? { ...f, completed: true } : f)
        }))
      },

      getPendingFollowUps: () => {
        return get().followUps.filter(f => !f.completed && new Date(f.dueDate) <= new Date())
      },

      // === Enhanced Disposition CRM / Task Center ===
      createTask: (task) => {
        const id = 'FU' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        const dueDate = task.dueDate || new Date(Date.now() + (task.delayDays || 1) * 86400000).toISOString()

        const newTask = {
          id,
          dealId: task.dealId || '',
          buyerId: task.buyerId,
          sellerId: task.sellerId,
          dueDate,
          type: task.type || 'Buyer Follow-Up',
          priority: task.priority || 'Medium',
          notes: task.notes || '',
          completed: false,
          recurring: task.recurring || null, // { intervalDays: 3, until: 'replied' | 'sold' | null }
          history: task.history || [],
          createdAt: new Date().toISOString(),
          ...task
        }

        set(s => ({ followUps: [...s.followUps, newTask] }))

        if (newTask.dealId) {
          get().logActivity(newTask.dealId, 'Task Created', `${newTask.type}: ${newTask.notes?.slice(0, 60) || 'New task'}`)
        }
      },

      generateAutoFollowUpsFromInventory: () => {
        const deals = get().deals || []
        let created = 0
        const now = Date.now()

        deals.forEach(deal => {
          if (['Dead', 'Sold'].includes(deal.status)) return

          const existing = get().followUps.some(f => f.dealId === deal.id && !f.completed)
          if (existing) return

          const issues = get().getDealAttentionItems?.(deal) || []

          // Urgent / Needs Attention
          if (deal.status === 'Needs Info' || issues.length > 2) {
            get().createTask({
              dealId: deal.id,
              type: 'Urgent',
              priority: 'High',
              notes: `Deal needs attention: ${issues.slice(0,3).join(', ')}`,
              dueDate: new Date(now + 1 * 86400000).toISOString()
            })
            created++
          }
          // New approved deal - seller follow-up
          if (['Approved', 'Active'].includes(deal.status) && !deal.pricing?.contractPrice) {
            get().createTask({
              dealId: deal.id,
              type: 'Seller Follow-Up',
              priority: 'Medium',
              notes: 'New deal approved - follow up with seller in 24 hrs',
              dueDate: new Date(now + 1 * 86400000).toISOString()
            })
            created++
          }

          // Missing docs
          const docCount = (deal.docs?.length || 0) + (get().documents?.[deal.id]?.length || 0)
          if (docCount < 3 && ['Active', 'Blasted'].includes(deal.status)) {
            get().createTask({
              dealId: deal.id,
              type: 'Document Request',
              priority: 'Medium',
              notes: 'Request missing documents / photos / OM',
              dueDate: new Date(now + 2 * 86400000).toISOString()
            })
            created++
          }

          // Closing related
          if (deal.status === 'Closing' || deal.status === 'Under Contract') {
            get().createTask({
              dealId: deal.id,
              type: 'Title / Closing',
              priority: 'High',
              notes: 'Confirm closing details, title, EMD, funding',
              dueDate: new Date(now + 1 * 86400000).toISOString()
            })
            created++
          }
        })

        return created
      },

      generateAutoFollowUpsFromBuyers: () => {
        const deals = get().deals || []
        const buyers = get().buyers || []
        let created = 0
        const now = Date.now()

        // Simple heuristic: active deals with buyer interest but no recent follow-up
        const activeDeals = deals.filter(d => ['Active', 'Blasted', 'Offers Received'].includes(d.status))

        activeDeals.forEach(deal => {
          const matches = get().getMatchesForDeal?.(deal.id) || []
          const strong = matches.filter((m: any) => (m.score || 0) >= 90)

          strong.slice(0, 3).forEach((match: any) => {
            const buyer = buyers.find(b => b.id === match.buyerId)
            if (!buyer) return

            const hasRecent = get().followUps.some(f => 
              f.dealId === deal.id && f.buyerId === buyer.id && !f.completed && 
              new Date(f.dueDate).getTime() > now - 5*86400000
            )
            if (hasRecent) return

            get().createTask({
              dealId: deal.id,
              buyerId: buyer.id,
              type: 'Buyer Follow-Up',
              priority: match.score >= 95 ? 'High' : 'Medium',
              notes: `Strong match (${match.score}%) — follow up on ${deal.property.address}`,
              dueDate: new Date(now + 2 * 86400000).toISOString()
            })
            created++
          })
        })

        return created
      },

      getFollowUpStats: () => {
        const now = new Date()
        const startOfWeek = new Date(now.getTime() - 7 * 86400000)
        const fups = get().followUps || []

        const pending = fups.filter(f => !f.completed).length
        const overdue = fups.filter(f => !f.completed && new Date(f.dueDate) <= now).length
        const dueToday = fups.filter(f => !f.completed && new Date(f.dueDate).toDateString() === now.toDateString()).length
        const completedThisWeek = fups.filter(f => f.completed && new Date(f.dueDate) >= startOfWeek).length
        const autoGenerated = fups.filter((f: any) => (f.notes || '').includes('auto') || f.type === 'Urgent' || f.type === 'Document Request').length

        return { pending, dueToday, overdue, completedThisWeek, autoGenerated }
      },

      prioritizeFollowUps: (followUps) => {
        // AI-like priority scoring (simulated)
        return [...followUps].sort((a, b) => {
          const score = (f: any) => {
            let s = 0
            const due = new Date(f.dueDate).getTime()
            const now = Date.now()
            if (due < now) s += 100 // Overdue
            if (due < now + 86400000) s += 60 // Due today
            if (f.priority === 'High') s += 40
            if (f.type === 'Urgent' || f.type === 'Title / Closing') s += 35
            if (f.type === 'Seller Follow-Up' || f.type === 'Buyer Follow-Up') s += 20
            if ((f.notes || '').includes('closing') || (f.notes || '').includes('financials')) s += 25
            return s
          }
          return score(b) - score(a)
        })
      },

      getBuyerHeatScore: (buyerId) => {
        if (!buyerId || !get().buyers?.length) return 50
        const buyer = get().buyers.find(b => b.id === buyerId)
        if (!buyer) return 50

        let score = 50
        if (buyer.status === 'Hot') score += 20
        if (buyer.strengthScore) score += Math.min(15, buyer.strengthScore / 6)

        const responses = get().buyerResponses[buyerId] || {}
        const interested = Object.values(responses).filter(r => r.status === 'Interested' || r.status === 'Made Offer').length
        score += Math.min(15, interested * 5)

        const offers = Object.values(get().offers).flat().filter(o => o.buyerId === buyerId || o.buyerEmail === buyer.email).length
        score += Math.min(10, offers * 3)

        const suppressions = Object.values(get().dealSuppressions).flat().filter(s => s.buyerId === buyerId).length
        score -= Math.min(15, suppressions * 4)

        return Math.max(20, Math.min(100, Math.round(score)))
      },

      getDealQualityScore: (dealId) => {
        const incompleteScore = { score: 25, grade: 'D', strengths: [], weaknesses: ['Incomplete deal data'] }
        if (!dealId || !get().deals?.length) return incompleteScore
        const deal = get().deals.find(d => d.id === dealId)
        if (!deal || typeof deal !== 'object') return incompleteScore

        const debt = deal?.debt || {}
        const pricing = deal?.pricing || {}
        const condition = deal?.condition || {}
        const property = deal?.property || {}
        const submitter = deal?.submitter || {}
        const docs = Array.isArray(deal?.docs) ? deal.docs : []
        const hasCoreData = [debt, pricing, condition, property, submitter].some(value => Object.keys(value).length > 0) || docs.length > 0

        if (!deal.id || !hasCoreData) {
          return incompleteScore
        }

        let score = 40
        const strengths: string[] = []
        const weaknesses: string[] = []

        // Completeness
        const hasDocs = docs.length >= 2
        if (hasDocs) { score += 12; strengths.push('Good documentation') } else { weaknesses.push('Few documents') }

        if ((submitter as any).consent) { score += 8; strengths.push('Consent recorded') } else { weaknesses.push('No consent') }

        if ((debt as any).isFreeClear || (debt as any).titleCompany) { score += 8; strengths.push('Title clarity') } else { weaknesses.push('Title/Debt unclear') }

        // Matches
        const matches = (() => {
          try {
            return get().getMatchesForDeal(dealId).length
          } catch {
            return 0
          }
        })()
        if (matches >= 8) { score += 12; strengths.push('Strong buyer interest') } 
        else if (matches < 3) { weaknesses.push('Low buyer matches') }

        // Financials
        if ((pricing as any).capRate && (pricing as any).capRate > 7) { score += 8; strengths.push('Solid cap rate') }
        if ((pricing as any).arv && (pricing as any).askingPrice && ((pricing as any).arv / (pricing as any).askingPrice) > 1.4) { score += 8; strengths.push('Good equity spread') }

        // Risk
        if ((debt as any).foreclosure || (debt as any).codeViolations) { score -= 10; weaknesses.push('Title/condition risk') }

        const final = Math.max(25, Math.min(100, Math.round(score)))
        const grade = final >= 85 ? 'A' : final >= 70 ? 'B' : final >= 55 ? 'C' : 'D'

        return { score: final, grade, strengths, weaknesses }
      },

      runSampleWorkflow: () => {
        // Create a realistic sample submitted deal
        const sampleDeal = get().addDeal({
          status: 'Submitted',
          submitter: { name: 'Demo Submitter', email: 'demo@submitter.com', phone: '(555) 123-4567', role: 'Wholesaler', isOwner: false, consent: true },
          property: { address: '456 Demo Lane', city: 'Birmingham', state: 'AL', zip: '35203', county: 'Jefferson', type: 'Multifamily', strategy: 'Value-Add', units: 8, sqft: 6200, occupancy: 'Tenant Occupied' },
          pricing: { askingPrice: 485000, arv: 720000, rehab: 95000, noi: 68000, capRate: 9.2, sellerFinance: false },
          debt: { isFreeClear: false, mortgageBalance: 265000, titleCompany: 'First Title Co' },
          condition: { occupancyStatus: 'Tenant Occupied', walkthroughAvailable: true },
          docs: []
        })

        // Approve it
        get().approveDeal(sampleDeal.id)

        // Simulate buyer matches and a blast
        const topMatches = get().getMatchesForDeal(sampleDeal.id).slice(0, 6)
        const buyerIds = topMatches.map(m => m.buyer.id)
        get().recordBlast(sampleDeal.id, buyerIds)

        get().recordBlastLog(sampleDeal.id, {
          template: 'Multifamily',
          subject: `8-Unit Value-Add in Birmingham — ${sampleDeal.pricing.askingPrice}`,
          recipientCount: buyerIds.length,
          suppressedCount: 0,
          duplicateCount: 0,
          selectedDocNames: ['Photos', 'Rent Roll'],
          ndaRequired: true,
          status: 'Sent'
        })

        // Add mock responses and an offer
        if (topMatches[0]) {
          get().setBuyerResponse(topMatches[0].buyer.id, sampleDeal.id, 'Interested')
        }
        if (topMatches[1]) {
          get().setBuyerResponse(topMatches[1].buyer.id, sampleDeal.id, 'Made Offer')
          get().addOffer(sampleDeal.id, {
            buyerName: topMatches[1].buyer.name,
            buyerEmail: topMatches[1].buyer.email,
            amount: 452000,
            emd: 15000,
            financingType: 'Conventional',
            closingTimeline: '30 days',
            status: 'Reviewing'
          })
        }

        // Schedule follow-up
        get().scheduleFollowUp(sampleDeal.id, undefined, 2, 'Buyer response follow-up')

        // Update status
        get().updateDeal(sampleDeal.id, { status: 'Offers Received' })

        get().logActivity(sampleDeal.id, 'Sample Workflow', 'Auto-generated full demo workflow')

        toast.success('Sample workflow created! Opening the deal...')
        return { dealId: sampleDeal.id }
      },

      // Buyers
      addBuyer: (partial) => {
        const id = 'B' + Date.now().toString(36).toUpperCase()
        const buyer: Buyer = {
          ...partial,
          id,
          createdAt: new Date().toISOString(),
          tags: partial.tags || [],
          assetTypes: partial.assetTypes || [],
          markets: partial.markets || []
        }
        void import('../lib/buyerSupabaseSync')
          .then(m => m.insertBuyerToSupabase(buyer))
          .then(result => {
            if (!result.ok || !result.data) {
              console.warn('[Deal Blast Pro] Buyer Supabase insert failed:', result.error)
              return
            }
            const savedBuyer = { ...buyer, ...result.data, id: result.data.id || buyer.id }
            set(s => ({
              buyers: s.buyers.some(existing =>
                existing.id === savedBuyer.id || safeLower(existing.email) === safeLower(savedBuyer.email)
              )
                ? s.buyers.map(existing =>
                    existing.id === savedBuyer.id || safeLower(existing.email) === safeLower(savedBuyer.email)
                      ? { ...existing, ...savedBuyer }
                      : existing
                  )
                : [...s.buyers, savedBuyer],
            }))
            const savedBuyerAny = savedBuyer as any
            if (
              savedBuyerAny.buyerPortalSubmission ||
              savedBuyerAny.verificationStatus === 'Submitted / Pending Review' ||
              String(savedBuyerAny.status || '') === 'Submitted / Pending Review'
            ) {
              get().logActivity(null, 'Buyer Verification Submitted', 'New buyer verification submitted: ' + (savedBuyer.name || savedBuyer.email))
            } else {
              get().logActivity(null, 'Buyer Added', 'Buyer added: ' + (savedBuyer.name || savedBuyer.email))
            }
          })
          .catch(error => console.warn('[Deal Blast Pro] Buyer Supabase insert crashed:', error))

        return buyer
      },
      updateBuyer: (id, updates) => {
        const cleanUpdates: any = {
          ...updates,
          ...(updates.email ? { email: updates.email.trim() } : {}),
          ...(updates.name ? { name: updates.name.trim() } : {}),
          ...(updates.markets ? { markets: Array.isArray(updates.markets) ? updates.markets : String(updates.markets).split(/[,.|]/).map(x => x.trim()).filter(Boolean) } : {}),
          ...(updates.assetTypes ? { assetTypes: Array.isArray(updates.assetTypes) ? updates.assetTypes : String(updates.assetTypes).split(/[,.|]/).map(x => x.trim()).filter(Boolean) } : {}),
          ...(updates.tags ? { tags: Array.isArray(updates.tags) ? updates.tags : String(updates.tags).split(/[,.|]/).map(x => x.trim()).filter(Boolean) } : {}),
          updatedAt: new Date().toISOString(),
        }

        const currentBuyer = get().buyers.find(b => b.id === id)
        const updatedBuyer: any = currentBuyer ? { ...currentBuyer, ...cleanUpdates } : null

        if (updatedBuyer) {
          void import('../lib/buyerSupabaseSync')
            .then(m => m.updateBuyerInSupabase(id, updatedBuyer))
            .then(result => {
              if (!result.ok) {
                console.warn('[Deal Blast Pro] Buyer Supabase update failed:', result.error)
                return
              }
              if (result.data) {
                set(s => ({
                  buyers: s.buyers.map(existing =>
                    existing.id === id ? { ...existing, ...updatedBuyer, ...result.data, id: existing.id } : existing
                  ),
                }))
              }
            })
            .catch(error => console.warn('[Deal Blast Pro] Buyer Supabase update crashed:', error))
        }
      },
      deleteBuyer: (id) => {
        void import('../lib/buyerSupabaseSync')
          .then(m => m.deleteBuyersFromSupabase([id]))
          .then(result => {
            if (!result.ok) {
              console.warn('[Deal Blast Pro] Buyer Supabase delete failed:', result.error)
              return
            }
            set(s => {
              const nextBuyerResponses = { ...(s.buyerResponses || {}) }
              delete nextBuyerResponses[id]
              const nextDealSuppressions: any = {}
              Object.entries(s.dealSuppressions || {}).forEach(([dealId, rows]: any) => {
                nextDealSuppressions[dealId] = Array.isArray(rows)
                  ? rows.filter((row: any) => row.buyerId !== id)
                  : rows
              })
              return {
                buyers: s.buyers.filter(b => b.id !== id),
                viewedBuyerIds: s.viewedBuyerIds.filter(x => x !== id),
                buyerResponses: nextBuyerResponses,
                dealSuppressions: nextDealSuppressions,
                followUps: (s.followUps || []).filter((f: any) => f.buyerId !== id),
              }
            })
          })
          .catch(error => console.warn('[Deal Blast Pro] Buyer Supabase delete crashed:', error))
      },
      importBuyers: (incoming) => {
        if (!get().canImportBuyers()) {
          toast.error('You do not have permission to import buyers')
          return { added: 0, dups: 0, suppressed: incoming.length }
        }

        const state = get()
        const previewPlan = isOwnerPreviewActive(state.user, state.settings)
          ? getOwnerPreviewPlan(state.settings)
          : state.trial.plan
        const capacity = getBuyerCapacity(hasEffectiveOwnerAdminBypass(state.user, state.settings) ? 'Owner Admin' : previewPlan, state.buyers.length)
        let added = 0, dups = 0, suppressed = 0
        const toAdd: Buyer[] = []
        const updatesByEmail: Record<string, Partial<Buyer>> = {}

        const normalizeArray = (value: any) => Array.isArray(value)
          ? value.map(x => String(x).trim()).filter(Boolean)
          : String(value || '').split(/[,.|]/).map(x => x.trim()).filter(Boolean)

        incoming.forEach((raw: any) => {
          const emailNorm = String(raw.email || '').trim()
          if (!emailNorm) {
            suppressed++
            return
          }

          if (state.suppressionList.includes(emailNorm)) {
            suppressed++
            return
          }

          const markets = normalizeArray(raw.markets)
          const assetTypes = normalizeArray(raw.assetTypes)
          const tags = normalizeArray(raw.tags)

          const b: any = {
            ...raw,
            email: emailNorm,
            name: String(raw.name || emailNorm.split('@')[0] || 'Unknown Buyer').trim(),
            phone: raw.phone || '',
            company: raw.company || '',
            type: raw.type || 'Cash Buyer',
            markets: markets.length ? markets : ['Any'],
            assetTypes: assetTypes.length ? assetTypes : ['SFH'],
            tags,
            budgetMin: Number(raw.budgetMin || 0),
            budgetMax: Number(raw.budgetMax || 0),
            status: raw.status || 'Active',
            notes: raw.notes || ''
          }

          const existing = state.buyers.find(x => safeLower(x.email).trim() === emailNorm)
          if (existing) {
            dups++
            updatesByEmail[emailNorm] = {
              ...Object.fromEntries(Object.entries(b).filter(([_, value]) => {
                if (Array.isArray(value)) return value.length > 0
                return value !== undefined && value !== null && value !== ''
              })),
              id: existing.id,
              createdAt: existing.createdAt,
              markets: Array.from(new Set([...(existing.markets || []), ...(b.markets || [])])),
              assetTypes: Array.from(new Set([...(existing.assetTypes || []), ...(b.assetTypes || [])])),
              tags: Array.from(new Set([...(existing.tags || []), ...(b.tags || [])])),
              notes: [existing.notes, b.notes].filter(Boolean).join(existing.notes && b.notes ? ' | ' : '')
            } as Partial<Buyer>
          } else {
            if (!capacity.isUnlimited && added >= capacity.remaining) {
              suppressed++
              return
            }
            toAdd.push({
              ...b,
              id: 'B' + Date.now().toString(36).toUpperCase() + added,
              createdAt: new Date().toISOString()
            } as Buyer)
            added++
          }
        })

        set(s => ({
          buyers: [
            ...s.buyers.map(existing => {
              const update = updatesByEmail[safeLower(existing.email).trim()]
              return update ? { ...existing, ...update } : existing
            }),
            ...toAdd
          ]
        }))

        
          // BUYER_IMPORT_SUPABASE_SYNC
          const buyersToSync = [...toAdd, ...Object.values(updatesByEmail)]

          void import('../lib/buyerSupabaseSync')
            .then(m => m.upsertBuyersToSupabase(buyersToSync))
            .then(result => {
              if (!result.ok) console.warn('[Deal Blast Pro] Buyer Supabase bulk sync failed:', result.error)
            })
            .catch(error => console.warn('[Deal Blast Pro] Buyer Supabase bulk sync crashed:', error))

          return { added, dups, suppressed }
      },
      mergeBuyers: (primaryId, toMergeIds) => {
        const state = get()
        const primary = state.buyers.find(b => b.id === primaryId)
        if (!primary) return
        
        const mergedTags = new Set(primary.tags)
        let mergedNotes = primary.notes || ''
        
        toMergeIds.forEach(id => {
          const victim = state.buyers.find(b => b.id === id)
          if (victim) {
            victim.tags.forEach(t => mergedTags.add(t))
            if (victim.notes) mergedNotes += ` | ${victim.notes}`
          }
        })
        
        const mergedPrimary: any = { ...primary, tags: Array.from(mergedTags), notes: mergedNotes, updatedAt: new Date().toISOString() }

        set(s => ({
          buyers: s.buyers
            .map(b => b.id === primaryId ? mergedPrimary : b)
            .filter(b => !toMergeIds.includes(b.id)),
          viewedBuyerIds: s.viewedBuyerIds.filter(id => !toMergeIds.includes(id)),
          followUps: (s.followUps || []).filter((f: any) => !toMergeIds.includes(f.buyerId)),
        }))

        void import('../lib/buyerSupabaseSync')
          .then(async m => {
            const updateResult = await m.updateBuyerInSupabase(primaryId, mergedPrimary)
            if (!updateResult.ok) console.warn('[Deal Blast Pro] Buyer Supabase merge update failed:', updateResult.error)

            const deleteResult = await m.deleteBuyersFromSupabase(toMergeIds)
            if (!deleteResult.ok) console.warn('[Deal Blast Pro] Buyer Supabase merge delete failed:', deleteResult.error)
          })
          .catch(error => console.warn('[Deal Blast Pro] Buyer Supabase merge crashed:', error))
      },
      getBuyer: (id) => get().buyers.find(b => b.id === id),
      addToSuppression: (email) => {
        const norm = safeLower(email).trim()
        set(s => ({ suppressionList: [...new Set([...s.suppressionList, norm])] }))
      },

      // Matching
      getMatchesForDeal: (dealId) => {
        const deal = get().deals.find(d => d.id === dealId)
        if (!deal) return []
        
        const weights = get().settings.matchingWeights
        const suppressed = get().suppressionList
        
        const results: MatchResult[] = get().buyers
          .filter(b => !suppressed.includes(safeLower(b.email)))
          .map(buyer => {
            const { score, reasons, missing } = computeMatchScore(deal, buyer, weights)
            return {
              buyer,
              score,
              tier: getTier(score),
              reasons,
              missing
            }
          })
          .sort((a, b) => b.score - a.score)
        
        return results
      },
      excludeBuyerFromDeal: (dealId, buyerId, reason) => {
        // For demo we just log; real impl could store per-deal exclusions
        get().logActivity(dealId, 'Buyer Excluded', `Buyer ${buyerId} excluded: ${reason}`)
      },

      // Offers
      addOffer: (dealId, offer) => {
        const id = 'O' + Date.now().toString(36)
        const fullOffer: Offer = {
          ...offer,
          id,
          createdAt: new Date().toISOString(),
          history: [{ ts: new Date().toISOString(), note: 'Offer recorded' }]
        }
        set(s => ({
          offers: {
            ...s.offers,
            [dealId]: [...(s.offers[dealId] || []), fullOffer]
          }
        }))
        get().logActivity(dealId, 'Offer Received', `${offer.buyerName} offered $${offer.amount.toLocaleString()}`)
        get().updateDeal(dealId, { status: 'Offers Received' })
      },
      updateOfferStatus: (dealId, offerId, status, counter) => {
        set(s => ({
          offers: {
            ...s.offers,
            [dealId]: (s.offers[dealId] || []).map(o =>
              o.id === offerId
                ? { 
                    ...o, 
                    status, 
                    counterAmount: counter, 
                    history: [...o.history, { ts: new Date().toISOString(), note: `Status → ${status}${counter ? ` (counter $${counter})` : ''}` }]
                  }
                : o
            )
          }
        }))
      },

      // Documents
      addDocument: (dealId, doc) => {
        const full: Doc = { ...doc, id: 'doc_' + Date.now(), uploadedAt: new Date().toISOString() }
        set(s => ({
          documents: {
            ...s.documents,
            [dealId]: [...(s.documents[dealId] || []), full]
          }
        }))
        get().logActivity(dealId, 'Document Uploaded', `${doc.category}: ${doc.name}`)
      },
      removeDocument: (dealId, docId) => {
        set(s => ({
          documents: {
            ...s.documents,
            [dealId]: (s.documents[dealId] || []).filter(d => d.id !== docId)
          }
        }))
      },
      toggleDocFlag: (dealId, docId, flag) => {
        set(s => ({
          documents: {
            ...s.documents,
            [dealId]: (s.documents[dealId] || []).map(d =>
              d.id === docId ? { ...d, [flag]: !d[flag] } : d
            )
          }
        }))
      },

      // Activity
      logActivity: (dealId, type, description) => {
        const act: Activity = {
          id: 'a' + Date.now(),
          timestamp: new Date().toISOString(),
          type,
          description,
          user: get().user?.name || 'System'
        }

        const activityKey = dealId || '__global'

        set(s => ({
          activities: {
            ...s.activities,
            [activityKey]: [act, ...(s.activities[activityKey] || [])]
          }
        }))
      },
      getActivities: (dealId) => get().activities[dealId] || [],

      // Single source of truth for Needs Attention (pure + respects dismissals)
      getDealAttentionItems: (deal) => {
        if (!deal?.id) return []
        if (!get().deals.some((d: any) => d.id === deal.id)) return []
        if (String(deal.status || '').toLowerCase() === 'dead') return []
        const items: string[] = []
        const docs = deal.docs || []
        const storeDocs = (get().documents?.[deal.id] || [])
        const effectiveDocs = [...docs, ...storeDocs.filter((sd: any) => !docs.some((dd: any) => dd.id === sd.id))]

        const photoCount = effectiveDocs.filter((d: any) => (d.category || '').includes('photo') || /\.(png|jpe?g|gif|webp)$/i.test(d.name || '')).length

        if ((effectiveDocs.length || 0) < 2 && photoCount === 0) items.push('Photos/Documents')
        if (!deal.pricing?.askingPrice) items.push('Asking Price')
        if (!deal.pricing?.arv) items.push('ARV')
        if (!deal.debt?.isFreeClear && !deal.debt?.titleCompany) items.push('Title/Debt clarity')
        if (!deal.submitter?.consent) items.push('Submitter consent')
        if (deal.status === 'Closing' && !deal.closing?.closingDate) items.push('Closing date')
        if (!deal.condition?.walkthroughAvailable && !deal.condition?.lockbox) items.push('Access info')

        // Filter dismissed
        const dismissed = get().dismissedAttention?.[deal.id]
        if (dismissed && dismissed.issueKeys) {
          return items.filter(it => !dismissed.issueKeys.includes(it))
        }
        return items
      },

      dismissDealAttention: (dealId, issueKeys = []) => {
        const now = new Date().toISOString()
        set(s => ({
          dismissedAttention: {
            ...s.dismissedAttention,
            [dealId]: { dismissedAt: now, issueKeys }
          }
        }))
      },

      clearDealAttention: (dealId) => {
        set(s => {
          const copy = { ...s.dismissedAttention }
          delete copy[dealId]
          return { dismissedAttention: copy }
        })
      },

      // Viewed badges
      markDealViewed: (id) => {
        set(s => ({ viewedDealIds: [...new Set([...s.viewedDealIds, id])] }))
      },
      markBuyerViewed: (id) => {
        set(s => ({ viewedBuyerIds: [...new Set([...s.viewedBuyerIds, id])] }))
      },
      isNewDeal: (id) => {
        const d = get().deals.find(x => x.id === id)
        if (!d) return false
        const viewed = get().viewedDealIds.includes(id)
        const recent = Date.now() - new Date(d.createdAt).getTime() < 1000 * 86400 * 3 // 3 days
        return !viewed && recent
      },
      isNewBuyer: (id) => {
        const b = get().buyers.find(x => x.id === id)
        if (!b) return false
        const viewed = get().viewedBuyerIds.includes(id)
        const recent = Date.now() - new Date(b.createdAt).getTime() < 1000 * 86400 * 2
        return !viewed && recent
      },

      // Blast
      recordBlast: (dealId, buyerIds) => {
        if (!get().canBlastDeals()) {
          toast.error('You do not have permission to blast deals')
          return
        }

        const ok = get().useTrialAction('blastsSent')
        if (!ok) return
        
        get().updateDeal(dealId, { status: 'Blasted' })
        get().logActivity(dealId, 'Deal Blasted', `Blast sent to ${buyerIds.length} buyers`)
        
        // Mark buyers contacted
        buyerIds.forEach(bid => {
          const b = get().getBuyer(bid)
          if (b) get().updateBuyer(bid, { lastContacted: new Date().toISOString(), status: 'Contacted' })
        })
      },

      // Settings
      updateSettings: (updates) => {
        set(s => ({ settings: { ...s.settings, ...updates } }))
      },

      // UI
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

      // Data
      exportAllData: () => {
        if (!get().canExportData()) {
          toast.error('You do not have permission to export data')
          return JSON.stringify({ error: 'Permission denied' }, null, 2)
        }

        if (isApiMode) {
          // In API mode we would call storage.exportAllData()
          return JSON.stringify({ 
            mode: 'api', 
            message: 'Export via backend not yet implemented',
            exportedAt: new Date().toISOString() 
          }, null, 2)
        }

        const state = get()
        return JSON.stringify({
          user: state.user ? {
            id: state.user.id,
            email: state.user.email,
            name: state.user.name,
          } : null,
          workspaceInstanceId: state.workspaceInstanceId,
          workspaceOwnerId: state.workspaceOwnerId,
          workspaceOwnerEmail: state.workspaceOwnerEmail,
          workspaceDataScopeKey: state.workspaceDataScopeKey,
          deals: state.deals,
          buyers: state.buyers,
          offers: state.offers,
          activities: state.activities,
          settings: stripPreviewSettings({ settings: state.settings }).settings,
          trial: state.trial,
          viewedDealIds: state.viewedDealIds,
          viewedBuyerIds: state.viewedBuyerIds,
          suppressionList: state.suppressionList,
          teamMembers: state.teamMembers,
          exportedAt: new Date().toISOString()
        }, null, 2)
      },

      importAllData: async (json) => {
        if (!get().hasPermission('import_data')) {
          toast.error('You do not have permission to import data')
          return
        }

        try {
          const data = JSON.parse(json)

          // Basic shape validation
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid backup format')
          }

          if (isApiMode) {
            // Future: await storage.importAllData(json)
            console.warn('[Storage] API import not implemented yet')
            return
          }

          // Preview counts for safety (we'll surface this in UI later)
          const preview = {
            deals: (data.deals || []).length,
            buyers: (data.buyers || []).length,
            blastLogs: Object.keys(data.blastLogs || {}).length,
            followUps: (data.followUps || []).length,
            hasSettings: !!data.settings
          }

          // Apply data (current demo behavior)
          const currentUser = get().user
          const workspaceInstanceId = currentUser ? makeWorkspaceInstanceId(currentUser) : get().workspaceInstanceId
          set({
            deals: data.deals || [],
            buyers: data.buyers || [],
            offers: data.offers || {},
            activities: data.activities || {},
            settings: data.settings || DEFAULT_SETTINGS,
            trial: (data.trial ? { ...TRIAL_DEFAULT, ...data.trial, plan: data.trial.plan === 'Free Demo' ? 'Free' : data.trial.plan || 'Free' } : TRIAL_DEFAULT),
            viewedDealIds: data.viewedDealIds || [],
            viewedBuyerIds: data.viewedBuyerIds || [],
            suppressionList: data.suppressionList || [],
            blastLogs: data.blastLogs || {},
            buyerResponses: data.buyerResponses || {},
            dealSuppressions: data.dealSuppressions || {},
            dismissedAttention: data.dismissedAttention || {},
            documents: data.documents || {},
            followUps: data.followUps || [],
            teamMembers: data.teamMembers || [],
            workspaceInstanceId,
            ...getWorkspaceOwnerPatch(currentUser),
            workspaceDataScopeKey: currentUser ? makeWorkspaceDataScopeKey(currentUser) : null,
          })
          get().cleanupOrphanedDealData()

          return preview
        } catch (e) {
          console.error('Import failed', e)
          throw e
        }
      },
      clearAllData: () => {
        set({
          deals: [], buyers: [], offers: {}, activities: {}, documents: {},
          viewedDealIds: [], viewedBuyerIds: [], suppressionList: [],
          trial: TRIAL_DEFAULT,
          blastLogs: {}, buyerResponses: {}, dealSuppressions: {}, followUps: [],
          dismissedAttention: {}, teamMembers: [], currentDealId: null,
          ...getWorkspaceOwnerPatch(get().user)
        })
        get().cleanupOrphanedDealData()
      },
      reseedData: () => {
        const deals = seedDeals()
        const buyers = seedBuyers()
        const offers = seedOffers(deals)
        const activities: Record<string, Activity[]> = {}
        deals.forEach(d => { activities[d.id] = seedActivities(d.id) })
        
        set({
          deals, buyers, offers, activities, documents: {},
          viewedDealIds: [], viewedBuyerIds: []
        })
      },
      cleanupOrphanedDealData: () => {
        set(s => cleanupOrphanedDealState(s))
      }
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => {
        const canPersistPrivateState = privateWorkspaceScopeMatchesUser(state, state.user)

        return {
          user: IS_PRODUCTION ? null : state.user,
          workspaceInstanceId: state.workspaceInstanceId,
          workspaceOwnerId: state.workspaceOwnerId,
          workspaceOwnerEmail: state.workspaceOwnerEmail,
          workspaceDataScopeKey: state.workspaceDataScopeKey,
          trial: state.trial,
          deals: canPersistPrivateState ? state.deals : [],
          buyers: canPersistPrivateState && shouldPersistBuyersLocally ? state.buyers : [],
          offers: canPersistPrivateState ? state.offers : {},
          activities: canPersistPrivateState ? state.activities : {},
          documents: canPersistPrivateState ? state.documents : {},
          settings: state.settings,
          viewedDealIds: canPersistPrivateState ? state.viewedDealIds : [],
          viewedBuyerIds: canPersistPrivateState && shouldPersistBuyersLocally ? state.viewedBuyerIds : [],
          suppressionList: canPersistPrivateState ? state.suppressionList : [],
          blastLogs: canPersistPrivateState ? state.blastLogs : {},
          buyerResponses: canPersistPrivateState ? state.buyerResponses : {},
          dealSuppressions: canPersistPrivateState ? state.dealSuppressions : {},
          followUps: canPersistPrivateState ? state.followUps : [],
          dismissedAttention: canPersistPrivateState ? state.dismissedAttention : {},
          teamMembers: canPersistPrivateState ? state.teamMembers : [],
        }
      }
    }
  )
)

/**
 * Cross-tab/localStorage sync
 * Keeps the internal app updated when the public portal submits a deal in another tab/window.
 * Zustand persist writes to localStorage, but React state in another open tab will not update unless we listen for it.
 */
function syncStoreFromPersistedStorage() {
  if (typeof window === 'undefined') return

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw)
    const persistedState = parsed?.state

    if (!persistedState || typeof persistedState !== 'object') return

    const currentState = useAppStore.getState()
    const persistedUser = persistedState.user

    if (currentState.user && persistedUser && !usersRepresentSameAccount(currentState.user, persistedUser)) {
      console.warn('[Deal Blast Pro] Ignored persisted workspace state for a different signed-in account.')
      return
    }

    const nextUser = IS_PRODUCTION ? currentState.user : (currentState.user ?? persistedUser)
    if (IS_PRODUCTION && !nextUser) return
    const canUsePersistedPrivateState =
      Boolean(nextUser) &&
      privateWorkspaceScopeMatchesUser(persistedState, nextUser)
    const canUsePersistedBuyers =
      canUsePersistedPrivateState &&
      shouldPersistBuyersLocally &&
      Array.isArray(persistedState.buyers)

    const nextState = {
      user: nextUser,
      workspaceInstanceId: persistedState.workspaceInstanceId ?? currentState.workspaceInstanceId,
      workspaceOwnerId: persistedState.workspaceOwnerId ?? currentState.workspaceOwnerId,
      workspaceOwnerEmail: persistedState.workspaceOwnerEmail ?? currentState.workspaceOwnerEmail,
      workspaceDataScopeKey: persistedState.workspaceDataScopeKey ?? currentState.workspaceDataScopeKey,
      trial: persistedState.trial ?? currentState.trial,
      deals: canUsePersistedPrivateState && Array.isArray(persistedState.deals) ? persistedState.deals : currentState.deals,
      buyers: canUsePersistedBuyers ? persistedState.buyers : [],
      offers: canUsePersistedPrivateState ? (persistedState.offers ?? currentState.offers) : currentState.offers,
      activities: canUsePersistedPrivateState ? (persistedState.activities ?? currentState.activities) : currentState.activities,
      documents: canUsePersistedPrivateState ? (persistedState.documents ?? currentState.documents) : currentState.documents,
      settings: stripPreviewSettings({ settings: persistedState.settings ?? currentState.settings }).settings,
      viewedDealIds: canUsePersistedPrivateState && Array.isArray(persistedState.viewedDealIds) ? persistedState.viewedDealIds : currentState.viewedDealIds,
      viewedBuyerIds: canUsePersistedBuyers && Array.isArray(persistedState.viewedBuyerIds) ? persistedState.viewedBuyerIds : [],
      suppressionList: canUsePersistedPrivateState && Array.isArray(persistedState.suppressionList) ? persistedState.suppressionList : currentState.suppressionList,
      blastLogs: canUsePersistedPrivateState ? (persistedState.blastLogs ?? currentState.blastLogs) : currentState.blastLogs,
      buyerResponses: canUsePersistedPrivateState ? (persistedState.buyerResponses ?? currentState.buyerResponses) : currentState.buyerResponses,
      dealSuppressions: canUsePersistedPrivateState ? (persistedState.dealSuppressions ?? currentState.dealSuppressions) : currentState.dealSuppressions,
      followUps: canUsePersistedPrivateState && Array.isArray(persistedState.followUps) ? persistedState.followUps : currentState.followUps,
      dismissedAttention: canUsePersistedPrivateState ? (persistedState.dismissedAttention ?? currentState.dismissedAttention) : currentState.dismissedAttention,
      teamMembers: canUsePersistedPrivateState && Array.isArray(persistedState.teamMembers) ? persistedState.teamMembers : currentState.teamMembers,
    }

    useAppStore.setState({
      ...nextState,
      ...cleanupOrphanedDealState(nextState),
    })
  } catch (error) {
    console.warn('[Deal Blast Pro] Failed to sync persisted store', error)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      syncStoreFromPersistedStorage()
    }
  })

  window.addEventListener('dealblastpro:storage-sync', () => {
    syncStoreFromPersistedStorage()
  })

  if (!(window as any).__dealBlastLocalStorageSyncPatched) {
    const originalSetItem = nativeLocalStorage?.setItem || window.localStorage.setItem.bind(window.localStorage)

    window.localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value)

      if (key === STORAGE_KEY) {
        window.dispatchEvent(new Event('dealblastpro:storage-sync'))
      }
    }

    ;(window as any).__dealBlastLocalStorageSyncPatched = true
  }
}
