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
    Object.entries(record || {}).filter(([dealId]) => dealId =ÛM<òÚ$z{-®éÜj×C¢ç’’ÓâFö72ç6öÖR‚†FC¢ç’’ÓâFBæ–BÓÓÒ6Bæ–B’•ÐÐ Ð¢6öç7B†÷Fô6÷VçBÒVffV7F—fTFö72æf–ÇFW"‚†C¢ç’’Óâ†Bæ6FVv÷'’ÇÂrr’æ–æ6ÇVFW2‚w†÷Fòr’ÇÂõÂâ‡æwÆ§SöwÆv–gÇvV'’Bö’çFW7B†BææÖRÇÂrr’’æÆVæwF€Ð Ð¢–b‚†VffV7F—fTFö72æÆVæwF‚ÇÂ’Â"bb†÷Fô6÷VçBÓÓÒ’—FV×2çW6‚‚u†÷F÷2ôFö7VÖVçG2rÐ¢–b‚FVÂç&–6–æsòæ6¶–æu&–6R’—FV×2çW6‚‚t6¶–ær&–6RrÐ¢–b‚FVÂç&–6–æsòæ'b’—FV×2çW6‚‚t%brÐ¢–b‚FVÂæFV'Còæ—4g&VT6ÆV"bbFVÂæFV'CòçF—FÆT6ö×ç’’—FV×2çW6‚‚uF—FÆRôFV'B6Æ&—G’rÐ¢–b‚FVÂç7V&Ö—GFW#òæ6öç6VçB’—FV×2çW6‚‚u7V&Ö—GFW"6öç6VçBrÐ¢–b†FVÂç7FGW2ÓÓÒt6Æ÷6–ærrbbFVÂæ6Æ÷6–æsòæ6Æ÷6–ætFFR’—FV×2çW6‚‚t6Æ÷6–ærFFRrÐ¢–b‚FVÂæ6öæF—F–öãòçvÆ·F‡&÷Vv„f–Æ&ÆRbbFVÂæ6öæF—F–öãòæÆö6¶&÷‚’—FV×2çW6‚‚t66W72–æfòrÐ Ð¢òòf–ÇFW"F—6Ö—76V@Ð¢6öç7BF—6Ö—76VBÒvWB‚’æF—6Ö—76VDGFVçF–öãòå¶FVÂæ–EÐÐ¢–b†F—6Ö—76VBbbF—6Ö—76VBæ—77VT¶W—2’°Ð¢&WGW&â—FV×2æf–ÇFW"†—BÓâF—6Ö—76VBæ—77VT¶W—2æ–æ6ÇVFW2†—B’Ð¢ÐÐ¢&WGW&â—FV×0Ð¢ÒÀÐ Ð¢F—6Ö—74FVÄGFVçF–öã¢†FVÄ–BÂ—77VT¶W—2ÒµÒ’Óâ°Ð¢6öç7Bæ÷rÒæWrFFR‚’çFô•4õ7G&–ær‚Ð¢6WB‡2Óâ‡°Ð¢F—6Ö—76VDGFVçF–öã¢°Ð¢ââç2æF—6Ö—76VDGFVçF–öâÀÐ¢¶FVÄ–EÓ¢²F—6Ö—76VDC¢æ÷rÂ—77VT¶W—2ÐÐ¢ÐÐ¢Ò’Ð¢ÒÀÐ Ð¢6ÆV$FVÄGFVçF–öã¢†FVÄ–B’Óâ°Ð¢6WB‡2Óâ°Ð¢6öç7B6÷’Ò²ââç2æF—6Ö—76VDGFVçF–öâÐÐ¢FVÆWFR6÷•¶FVÄ–EÐÐ¢&WGW&â²F—6Ö—76VDGFVçF–öã¢6÷’ÐÐ¢ÒÐ¢ÒÀÐ Ð¢òòf–WvVB&FvW0Ð¢Ö&´FVÅf–WvVC¢†–B’Óâ°Ð¢6WB‡2Óâ‡²f–WvVDFVÄ–G3¢²ââææWr6WB…²ââç2çf–WvVDFVÄ–G2Â–EÒ•ÒÒ’Ð¢ÒÀÐ¢Ö&´'W–W%f–WvVC¢†–B’Óâ°Ð¢6WB‡2Óâ‡²f–WvVD'W–W$–G3¢²ââææWr6WB…²ââç2çf–WvVD'W–W$–G2Â–EÒ•ÒÒ’Ð¢ÒÀÐ¢—4æWtFVÃ¢†–B’Óâ°Ð¢6öç7BBÒvWB‚’æFVÇ2æf–æB‡‚Óâ‚æ–BÓÓÒ–BÐ¢–b‚B’&WGW&âfÇ6PÐ¢6öç7Bf–WvVBÒvWB‚’çf–WvVDFVÄ–G2æ–æ6ÇVFW2†–BÐ¢6öç7B&V6VçBÒFFRææ÷r‚’ÒæWrFFR†Bæ7&VFVDB’ævWEF–ÖR‚’Â¢ƒcC¢2òò2F—0Ð¢&WGW&âf–WvVBbb&V6Vç@Ð¢ÒÀÐ¢—4æWt'W–W#¢†–B’Óâ°Ð¢6öç7B"ÒvWB‚’æ'W–W'2æf–æB‡‚Óâ‚æ–BÓÓÒ–BÐ¢–b‚"’&WGW&âfÇ6PÐ¢6öç7Bf–WvVBÒvWB‚’çf–WvVD'W–W$–G2æ–æ6ÇVFW2†–BÐ¢6öç7B&V6VçBÒFFRææ÷r‚’ÒæWrFFR†"æ7&VFVDB’ævWEF–ÖR‚’Â¢ƒcC¢ Ð¢&WGW&âf–WvVBbb&V6Vç@Ð¢ÒÀÐ Ð¢òò&Æ7@Ð¢&V6÷&D&Æ7C¢†FVÄ–BÂ'W–W$–G2’Óâ°Ð¢–b‚vWB‚’æ6ä&Æ7DFVÇ2‚’’°Ð¢Fö7BæW'&÷"‚u–÷RFòæ÷B†fRW&Ö—76–öâFò&Æ7BFVÇ2rÐ¢&WGW&àÐ¢ÐÐ Ð¢6öç7Bö²ÒvWB‚’çW6UG&–Ä7F–öâ‚v&Æ7G56VçBrÐ¢–b‚ö²’&WGW&àÐ¢ Ð¢vWB‚’çWFFTFVÂ†FVÄ–BÂ²7FGW3¢t&Æ7FVBrÒÐ¢vWB‚’æÆöt7F—f—G’†FVÄ–BÂtFVÂ&Æ7FVBrÂ&Æ7B6VçBFòG¶'W–W$–G2æÆVæwF‡Ò'W–W'6Ð¢ Ð¢òòÖ&²'W–W'26öçF7FV@Ð¢'W–W$–G2æf÷$V6‚†&–BÓâ°Ð¢6öç7B"ÒvWB‚’ævWD'W–W"†&–BÐ¢–b†"’vWB‚’çWFFT'W–W"†&–BÂ²Æ7D6öçF7FVC¢æWrFFR‚’çFô•4õ7G&–ær‚’Â7FGW3¢t6öçF7FVBrÒÐ¢ÒÐ¢ÒÀÐ Ð¢òò6WGF–æw0Ð¢WFFU6WGF–æw3¢‡WFFW2’Óâ°Ð¢6WB‡2Óâ‡²6WGF–æw3¢²ââç2ç6WGF–æw2ÂââçWFFW2ÒÒ’Ð¢ÒÀÐ Ð¢òòTÐ¢FövvÆU6–FV&#¢‚’Óâ6WB‡2Óâ‡²6–FV&$÷Vã¢2ç6–FV&$÷VâÒ’’ÀÐ Ð¢òòFFÐ¢W‡÷'DÆÄFF¢‚’Óâ°Ð¢–b‚vWB‚’æ6äW‡÷'DFF‚’’°Ð¢Fö7BæW'&÷"‚u–÷RFòæ÷B†fRW&Ö—76–öâFòW‡÷'BFFrÐ¢&WGW&â¥4ôâç7G&–æv–g’‡²W'&÷#¢uW&Ö—76–öâFVæ–VBrÒÂçVÆÂÂ"Ð¢ÐÐ Ð¢–b†—4”ÖöFR’°Ð¢òò–â’ÖöFRvRv÷VÆB6ÆÂ7F÷&vRæW‡÷'DÆÄFF‚Ð¢&WGW&â¥4ôâç7G&–æv–g’‡² Ð¢ÖöFS¢v’rÂ Ð¢ÖW76vS¢tW‡÷'Bf–&6¶VæBæ÷B–WB–×ÆVÖVçFVBrÀÐ¢W‡÷'FVDC¢æWrFFR‚’çFô•4õ7G&–ær‚’ Ð¢ÒÂçVÆÂÂ"Ð¢ÐÐ Ð¢6öç7B7FFRÒvWB‚Ð¢&WGW&â¥4ôâç7G&–æv–g’‡°Ð¢W6W#¢7FFRçW6W"ò°Ð¢–C¢7FFRçW6W"æ–BÀÐ¢VÖ–Ã¢7FFRçW6W"æVÖ–ÂÀÐ¢æÖS¢7FFRçW6W"ææÖRÀÐ¢Ò¢çVÆÂÀÐ¢v÷&·76T–ç7Fæ6T–C¢7FFRçv÷&·76T–ç7Fæ6T–BÀÐ¢v÷&·76T÷væW$–C¢7FFRçv÷&·76T÷væW$–BÀÐ¢v÷&·76T÷væW$VÖ–Ã¢7FFRçv÷&·76T÷væW$VÖ–ÂÀÐ¢v÷&·76TFF66÷T¶W“¢7FFRçv÷&·76TFF66÷T¶W’ÀÐ¢FVÇ3¢7FFRæFVÇ2ÀÐ¢'W–W'3¢7FFRæ'W–W'2ÀÐ¢öffW'3¢7FFRæöffW'2ÀÐ¢7F—f—F–W3¢7FFRæ7F—f—F–W2ÀÐ¢6WGF–æw3¢7G&—&Wf–Wu6WGF–æw2‡²6WGF–æw3¢7FFRç6WGF–æw2Ò’ç6WGF–æw2ÀÐ¢G&–Ã¢7FFRçG&–ÂÀÐ¢f–WvVDFVÄ–G3¢7FFRçf–WvVDFVÄ–G2ÀÐ¢f–WvVD'W–W$–G3¢7FFRçf–WvVD'W–W$–G2ÀÐ¢7W&W76–öäÆ—7C¢7FFRç7W&W76–öäÆ—7BÀÐ¢FVÔÖVÖ&W'3¢7FFRçFVÔÖVÖ&W'2ÀÐ¢W‡÷'FVDC¢æWrFFR‚’çFô•4õ7G&–ær‚Ð¢ÒÂçVÆÂÂ"Ð¢ÒÀÐ Ð¢–×÷'DÆÄFF¢7–æ2†§6öâ’Óâ°Ð¢–b‚vWB‚’æ†5W&Ö—76–öâ‚v–×÷'EöFFr’’°Ð¢Fö7BæW'&÷"‚u–÷RFòæ÷B†fRW&Ö—76–öâFò–×÷'BFFrÐ¢&WGW&àÐ¢ÐÐ Ð¢G'’°Ð¢6öç7BFFÒ¥4ôâç'6R†§6öâÐ Ð¢òò&6–26†RfÆ–FF–öàÐ¢–b‚FFÇÂG—VöbFFÓÒvö&¦V7Br’°Ð¢F‡&÷ræWrW'&÷"‚t–çfÆ–B&6·Wf÷&ÖBrÐ¢ÐÐ Ð¢–b†—4”ÖöFR’°Ð¢òògWGW&S¢v—B7F÷&vRæ–×÷'DÆÄFF†§6öâÐ¢6öç6öÆRçv&â‚uµ7F÷&vUÒ’–×÷'Bæ÷B–×ÆVÖVçFVB–WBrÐ¢&WGW&àÐ¢ÐÐ Ð¢òò&Wf–Wr6÷VçG2f÷"6fWG’‡vRvÆÂ7W&f6RF†—2–âT’ÆFW"Ð¢6öç7B&Wf–WrÒ°Ð¢FVÇ3¢†FFæFVÇ2ÇÂµÒ’æÆVæwF‚ÀÐ¢'W–W'3¢†FFæ'W–W'2ÇÂµÒ’æÆVæwF‚ÀÐ¢&Æ7DÆöw3¢ö&¦V7Bæ¶W—2†FFæ&Æ7DÆöw2ÇÂ·Ò’æÆVæwF‚ÀÐ¢föÆÆ÷uW3¢†FFæföÆÆ÷uW2ÇÂµÒ’æÆVæwF‚ÀÐ¢†56WGF–æw3¢FFç6WGF–æw0Ð¢ÐÐ Ð¢òòÇ’FF†7W'&VçBFVÖò&V†f–÷"Ð¢6öç7B7W'&VçEW6W"ÒvWB‚’çW6W Ð¢6öç7Bv÷&·76T–ç7Fæ6T–BÒ7W'&VçEW6W"òÖ¶Uv÷&·76T–ç7Fæ6T–B†7W'&VçEW6W"’¢vWB‚’çv÷&·76T–ç7Fæ6T–@Ð¢6WB‡°Ð¢FVÇ3¢FFæFVÇ2ÇÂµÒÀÐ¢'W–W'3¢FFæ'W–W'2ÇÂµÒÀÐ¢öffW'3¢FFæöffW'2ÇÂ·ÒÀÐ¢7F—f—F–W3¢FFæ7F—f—F–W2ÇÂ·ÒÀÐ¢6WGF–æw3¢FFç6WGF–æw2ÇÂDTdTÅEõ4UED”äu2ÀÐ¢G&–Ã¢†FFçG&–Âò²ââåE$”ÅôDTdTÅBÂââæFFçG&–ÂÂÆã¢FFçG&–ÂçÆâÓÓÒtg&VRFVÖòròtg&VRr¢FFçG&–ÂçÆâÇÂtg&VRrÒ¢E$”ÅôDTdTÅB’ÀÐ¢f–WvVDFVÄ–G3¢FFçf–WvVDFVÄ–G2ÇÂµÒÀÐ¢f–WvVD'W–W$–G3¢FFçf–WvVD'W–W$–G2ÇÂµÒÀÐ¢7W&W76–öäÆ—7C¢FFç7W&W76–öäÆ—7BÇÂµÒÀÐ¢&Æ7DÆöw3¢FFæ&Æ7DÆöw2ÇÂ·ÒÀÐ¢'W–W%&W7öç6W3¢FFæ'W–W%&W7öç6W2ÇÂ·ÒÀÐ¢FVÅ7W&W76–öç3¢FFæFVÅ7W&W76–öç2ÇÂ·ÒÀÐ¢F—6Ö—76VDGFVçF–öã¢FFæF—6Ö—76VDGFVçF–öâÇÂ·ÒÀÐ¢Fö7VÖVçG3¢FFæFö7VÖVçG2ÇÂ·ÒÀÐ¢föÆÆ÷uW3¢FFæföÆÆ÷uW2ÇÂµÒÀÐ¢FVÔÖVÖ&W'3¢FFçFVÔÖVÖ&W'2ÇÂµÒÀÐ¢v÷&·76T–ç7Fæ6T–BÀÐ¢ââævWEv÷&·76T÷væW%F6‚†7W'&VçEW6W"’ÀÐ¢v÷&·76TFF66÷T¶W“¢7W'&VçEW6W"òÖ¶Uv÷&·76TFF66÷T¶W’†7W'&VçEW6W"’¢çVÆÂÀÐ¢ÒÐ¢vWB‚’æ6ÆVçW÷'†æVDFVÄFF‚Ð Ð¢&WGW&â&Wf–WpÐ¢Ò6F6‚†R’°Ð¢6öç6öÆRæW'&÷"‚t–×÷'Bf–ÆVBrÂRÐ¢F‡&÷rPÐ¢ÐÐ¢ÒÀÐ¢6ÆV$ÆÄFF¢‚’Óâ°Ð¢6WB‡°Ð¢FVÇ3¢µÒÂ'W–W'3¢µÒÂöffW'3¢·ÒÂ7F—f—F–W3¢·ÒÂFö7VÖVçG3¢·ÒÀÐ¢f–WvVDFVÄ–G3¢µÒÂf–WvVD'W–W$–G3¢µÒÂ7W&W76–öäÆ—7C¢µÒÀÐ¢G&–Ã¢E$”ÅôDTdTÅBÀÐ¢&Æ7DÆöw3¢·ÒÂ'W–W%&W7öç6W3¢·ÒÂFVÅ7W&W76–öç3¢·ÒÂföÆÆ÷uW3¢µÒÀÐ¢F—6Ö—76VDGFVçF–öã¢·ÒÂFVÔÖVÖ&W'3¢µÒÂ7W'&VçDFVÄ–C¢çVÆÂÀÐ¢ââævWEv÷&·76T÷væW%F6‚†vWB‚’çW6W"Ð¢ÒÐ¢vWB‚’æ6ÆVçW÷'†æVDFVÄFF‚Ð¢ÒÀÐ¢&W6VVDFF¢‚’Óâ°Ð¢6öç7BFVÇ2Ò6VVDFVÇ2‚Ð¢6öç7B'W–W'2Ò6VVD'W–W'2‚Ð¢6öç7BöffW'2Ò6VVDöffW'2†FVÇ2Ð¢6öç7B7F—f—F–W3¢&V6÷&CÇ7G&–ærÂ7F—f—G•µÓâÒ·ÐÐ¢FVÇ2æf÷$V6‚†BÓâ²7F—f—F–W5¶Bæ–EÒÒ6VVD7F—f—F–W2†Bæ–B’ÒÐ¢ Ð¢6WB‡°Ð¢FVÇ2Â'W–W'2ÂöffW'2Â7F—f—F–W2ÂFö7VÖVçG3¢·ÒÀÐ¢f–WvVDFVÄ–G3¢µÒÂf–WvVD'W–W$–G3¢µÐÐ¢ÒÐ¢ÒÀÐ¢6ÆVçW÷'†æVDFVÄFF¢‚’Óâ°Ð¢6WB‡2Óâ6ÆVçW÷'†æVDFVÅ7FFR‡2’Ð¢ÐÐ¢Ò’ÀÐ¢°Ð¢æÖS¢5Dõ$tUô´U’ÀÐ¢7F÷&vS¢7&VFT¥4ôå7F÷&vR‚‚’Óâ6fTÆö6Å7F÷&vR’ÀÐ¢'F–Æ—¦S¢‡7FFR’Óâ°Ð¢6öç7B6åW'6—7E&—fFU7FFRÒ&—fFUv÷&·76U66÷TÖF6†W5W6W"‡7FFRÂ7FFRçW6W"Ð Ð¢&WGW&â°Ð¢W6W#¢•5õ$ôET5D”ôâòçVÆÂ¢7FFRçW6W"ÀÐ¢v÷&·76T–ç7Fæ6T–C¢7FFRçv÷&·76T–ç7Fæ6T–BÀÐ¢v÷&·76T÷væW$–C¢7FFRçv÷&·76T÷væW$–BÀÐ¢v÷&·76T÷væW$VÖ–Ã¢7FFRçv÷&·76T÷væW$VÖ–ÂÀÐ¢v÷&·76TFF66÷T¶W“¢7FFRçv÷&·76TFF66÷T¶W’ÀÐ¢G&–Ã¢7FFRçG&–ÂÀÐ¢FVÇ3¢6åW'6—7E&—fFU7FFRò7FFRæFVÇ2¢µÒÀÐ¢'W–W'3¢6åW'6—7E&—fFU7FFRbb6†÷VÆEW'6—7D'W–W'4Æö6ÆÇ’ò7FFRæ'W–W'2¢µÒÀÐ¢öffW'3¢6åW'6—7E&—fFU7FFRò7FFRæöffW'2¢·ÒÀÐ¢7F—f—F–W3¢6åW'6—7E&—fFU7FFRò7FFRæ7F—f—F–W2¢·ÒÀÐ¢Fö7VÖVçG3¢6åW'6—7E&—fFU7FFRò7FFRæFö7VÖVçG2¢·ÒÀÐ¢6WGF–æw3¢7FFRç6WGF–æw2ÀÐ¢f–WvVDFVÄ–G3¢6åW'6—7E&—fFU7FFRò7FFRçf–WvVDFVÄ–G2¢µÒÀÐ¢f–WvVD'W–W$–G3¢6åW'6—7E&—fFU7FFRbb6†÷VÆEW'6—7D'W–W'4Æö6ÆÇ’ò7FFRçf–WvVD'W–W$–G2¢µÒÀÐ¢7W&W76–öäÆ—7C¢6åW'6—7E&—fFU7FFRò7FFRç7W&W76–öäÆ—7B¢µÒÀÐ¢&Æ7DÆöw3¢6åW'6—7E&—fFU7FFRò7FFRæ&Æ7DÆöw2¢·ÒÀÐ¢'W–W%&W7öç6W3¢6åW'6—7E&—fFU7FFRò7FFRæ'W–W%&W7öç6W2¢·ÒÀÐ¢FVÅ7W&W76–öç3¢6åW'6—7E&—fFU7FFRò7FFRæFVÅ7W&W76–öç2¢·ÒÀÐ¢föÆÆ÷uW3¢6åW'6—7E&—fFU7FFRò7FFRæföÆÆ÷uW2¢µÒÀÐ¢F—6Ö—76VDGFVçF–öã¢6åW'6—7E&—fFU7FFRò7FFRæF—6Ö—76VDGFVçF–öâ¢·ÒÀÐ¢FVÔÖVÖ&W'3¢6åW'6—7E&—fFU7FFRò7FFRçFVÔÖVÖ&W'2¢µÒÀÐ¢ÐÐ¢ÐÐ¢ÐÐ¢Ð¢Ð Ð¢ò¢ Ð¢¢7&÷72×F"öÆö6Å7F÷&vR7–æ0Ð¢¢¶VW2F†R–çFW&æÂWFFVBv†VâF†RV&Æ–2÷'FÂ7V&Ö—G2FVÂ–âæ÷F†W"F"÷v–æF÷ràÐ¢¢§W7FæBW'6—7Bw&—FW2FòÆö6Å7F÷&vRÂ'WB&V7B7FFR–âæ÷F†W"÷VâF"v–ÆÂæ÷BWFFRVæÆW72vRÆ—7FVâf÷"—BàÐ¢¢ðÐ¦gVæ7F–öâ7–æ57F÷&Tg&öÕW'6—7FVE7F÷&vR‚’°Ð¢–b‡G—Vöbv–æF÷rÓÓÒwVæFVf–æVBr’&WGW&àÐ Ð¢G'’°Ð¢6öç7B&rÒv–æF÷ræÆö6Å7F÷&vRævWD—FVÒ…5Dõ$tUô´U’Ð¢–b‚&r’&WGW&àÐ Ð¢6öç7B'6VBÒ¥4ôâç'6R‡&rÐ¢6öç7BW'6—7FVE7FFRÒ'6VCòç7FFPÐ Ð¢–b‚W'6—7FVE7FFRÇÂG—VöbW'6—7FVE7FFRÓÒvö&¦V7Br’&WGW&àÐ Ð¢6öç7B7W'&VçE7FFRÒW6T7F÷&RævWE7FFR‚Ð¢6öç7BW'6—7FVEW6W"ÒW'6—7FVE7FFRçW6W Ð Ð¢–b†7W'&VçE7FFRçW6W"bbW'6—7FVEW6W"bbW6W'5&W&W6VçE6ÖT66÷VçB†7W'&VçE7FFRçW6W"ÂW'6—7FVEW6W"’’°Ð¢6öç6öÆRçv&â‚u´FVÂ&Æ7B&õÒ–væ÷&VBW'6—7FVBv÷&·76R7FFRf÷"F–ffW&VçB6–væVBÖ–â66÷VçBârÐ¢&WGW&àÐ¢ÐÐ Ð¢6öç7BæW‡EW6W"Ò•5õ$ôET5D”ôâò7W'&VçE7FFRçW6W"¢†7W'&VçE7FFRçW6W"óòW'6—7FVEW6W"Ð¢–b„•5õ$ôET5D”ôâbbæW‡EW6W"’&WGW&àÐ¢6öç7B6åW6UW'6—7FVE&—fFU7FFRÐÐ¢&ööÆVâ†æW‡EW6W"’b`Ð¢&—fFUv÷&·76U66÷TÖF6†W5W6W"‡W'6—7FVE7FFRÂæW‡EW6W"Ð¢6öç7B6åW6UW'6—7FVD'W–W'2ÐÐ¢6åW6UW'6—7FVE&—fFU7FFRb`Ð¢6†÷VÆEW'6—7D'W–W'4Æö6ÆÇ’b`Ð¢'&’æ—4'&’‡W'6—7FVE7FFRæ'W–W'2Ð Ð¢6öç7BæW‡E7FFRÒ°Ð¢W6W#¢æW‡EW6W"ÀÐ¢v÷&·76T–ç7Fæ6T–C¢W'6—7FVE7FFRçv÷&·76T–ç7Fæ6T–Bóò7W'&VçE7FFRçv÷&·76T–ç7Fæ6T–BÀÐ¢v÷&·76T÷væW$–C¢W'6—7FVE7FFRçv÷&·76T÷væW$–Bóò7W'&VçE7FFRçv÷&·76T÷væW$–BÀÐ¢v÷&·76T÷væW$VÖ–Ã¢W'6—7FVE7FFRçv÷&·76T÷væW$VÖ–Âóò7W'&VçE7FFRçv÷&·76T÷væW$VÖ–ÂÀÐ¢v÷&·76TFF66÷T¶W“¢W'6—7FVE7FFRçv÷&·76TFF66÷T¶W’óò7W'&VçE7FFRçv÷&·76TFF66÷T¶W’ÀÐ¢G&–Ã¢W'6—7FVE7FFRçG&–Âóò7W'&VçE7FFRçG&–ÂÀÐ¢FVÇ3¢6åW6UW'6—7FVE&—fFU7FFRbb'&’æ—4'&’‡W'6—7FVE7FFRæFVÇ2’òW'6—7FVE7FFRæFVÇ2¢7W'&VçE7FFRæFVÇ2ÀÐ¢'W–W'3¢6åW6UW'6—7FVD'W–W'2òW'6—7FVE7FFRæ'W–W'2¢µÒÀÐ¢öffW'3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæöffW'2óò7W'&VçE7FFRæöffW'2’¢7W'&VçE7FFRæöffW'2ÀÐ¢7F—f—F–W3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæ7F—f—F–W2óò7W'&VçE7FFRæ7F—f—F–W2’¢7W'&VçE7FFRæ7F—f—F–W2ÀÐ¢Fö7VÖVçG3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæFö7VÖVçG2óò7W'&VçE7FFRæFö7VÖVçG2’¢7W'&VçE7FFRæFö7VÖVçG2ÀÐ¢6WGF–æw3¢7G&—&Wf–Wu6WGF–æw2‡²6WGF–æw3¢W'6—7FVE7FFRç6WGF–æw2óò7W'&VçE7FFRç6WGF–æw2Ò’ç6WGF–æw2ÀÐ¢f–WvVDFVÄ–G3¢6åW6UW'6—7FVE&—fFU7FFRbb'&’æ—4'&’‡W'6—7FVE7FFRçf–WvVDFVÄ–G2’òW'6—7FVE7FFRçf–WvVDFVÄ–G2¢7W'&VçE7FFRçf–WvVDFVÄ–G2ÀÐ¢f–WvVD'W–W$–G3¢6åW6UW'6—7FVD'W–W'2bb'&’æ—4'&’‡W'6—7FVE7FFRçf–WvVD'W–W$–G2’òW'6—7FVE7FFRçf–WvVD'W–W$–G2¢µÒÀÐ¢7W&W76–öäÆ—7C¢6åW6UW'6—7FVE&—fFU7FFRbb'&’æ—4'&’‡W'6—7FVE7FFRç7W&W76–öäÆ—7B’òW'6—7FVE7FFRç7W&W76–öäÆ—7B¢7W'&VçE7FFRç7W&W76–öäÆ—7BÀÐ¢&Æ7DÆöw3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæ&Æ7DÆöw2óò7W'&VçE7FFRæ&Æ7DÆöw2’¢7W'&VçE7FFRæ&Æ7DÆöw2ÀÐ¢'W–W%&W7öç6W3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæ'W–W%&W7öç6W2óò7W'&VçE7FFRæ'W–W%&W7öç6W2’¢7W'&VçE7FFRæ'W–W%&W7öç6W2ÀÐ¢FVÅ7W&W76–öç3¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæFVÅ7W&W76–öç2óò7W'&VçE7FFRæFVÅ7W&W76–öç2’¢7W'&VçE7FFRæFVÅ7W&W76–öç2ÀÐ¢föÆÆ÷uW3¢6åW6UW'6—7FVE&—fFU7FFRbb'&’æ—4'&’‡W'6—7FVE7FFRæföÆÆ÷uW2’òW'6—7FVE7FFRæföÆÆ÷uW2¢7W'&VçE7FFRæföÆÆ÷uW2ÀÐ¢F—6Ö—76VDGFVçF–öã¢6åW6UW'6—7FVE&—fFU7FFRò‡W'6—7FVE7FFRæF—6Ö—76VDGFVçF–öâóò7W'&VçE7FFRæF—6Ö—76VDGFVçF–öâ’¢7W'&VçE7FFRæF—6Ö—76VDGFVçF–öâÀÐ¢FVÔÖVÖ&W'3¢6åW6UW'6—7FVE&—fFU7FFRbb'&’æ—4'&’‡W'6—7FVE7FFRçFVÔÖVÖ&W'2’òW'6—7FVE7FFRçFVÔÖVÖ&W'2¢7W'&VçE7FFRçFVÔÖVÖ&W'2ÀÐ¢ÐÐ Ð¢W6T7F÷&Rç6WE7FFR‡°Ð¢ââææW‡E7FFRÀÐ¢ââæ6ÆVçW÷'†æVDFVÅ7FFR†æW‡E7FFR’ÀÐ¢ÒÐ¢Ò6F6‚†W'&÷"’°Ð¢6öç6öÆRçv&â‚u´FVÂ&Æ7B&õÒf–ÆVBFò7–æ2W'6—7FVB7F÷&RrÂW'&÷"Ð¢ÐÐ§ÐÐ Ð¦–b‡G—Vöbv–æF÷rÓÒwVæFVf–æVBr’°Ð¢v–æF÷ræFDWfVçDÆ—7FVæW"‚w7F÷&vRrÂWfVçBÓâ°Ð¢–b†WfVçBæ¶W’ÓÓÒ5Dõ$tUô´U’’°Ð¢7–æ57F÷&Tg&öÕW'6—7FVE7F÷&vR‚Ð¢ÐÐ¢ÒÐ Ð¢v–æF÷ræFDWfVçDÆ—7FVæW"‚vFVÆ&Æ7G&ó§7F÷&vR×7–æ2rÂ‚’Óâ°Ð¢7–æ57F÷&Tg&öÕW'6—7FVE7F÷&vR‚Ð¢ÒÐ Ð¢–b‚‡v–æF÷r2ç’’åõöFVÄ&Æ7DÆö6Å7F÷&vU7–æ5F6†VB’°Ð¢6öç7B÷&–v–æÅ6WD—FVÒÒæF—fTÆö6Å7F÷&vSòç6WD—FVÒÇÂv–æF÷ræÆö6Å7F÷&vRç6WD—FVÒæ&–æB‡v–æF÷ræÆö6Å7F÷&vRÐ Ð¢v–æF÷ræÆö6Å7F÷&vRç6WD—FVÒÒ†¶W“¢7G&–ærÂfÇVS¢7G&–ær’Óâ°Ð¢÷&–v–æÅ6WD—FVÒ†¶W’ÂfÇVRÐ Ð¢–b†¶W’ÓÓÒ5Dõ$tUô´U’’°Ð¢v–æF÷ræF—7F6„WfVçB†æWrWfVçB‚vFVÆ&Æ7G&ó§7F÷&vR×7–æ2r’Ð¢ÐÐ¢ÐÐ Ð¢²‡v–æF÷r2ç’’åõöFVÄ&Æ7DÆö6Å7F÷&vU7–æ5F6†VBÒG'VPÐ¢ÐÐ§ÐÐ