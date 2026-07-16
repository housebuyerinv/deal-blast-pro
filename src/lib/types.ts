// Core domain types for Deal Blast Pro - schema safe

export type DealStatus =
  | 'Draft' | 'Submitted' | 'Needs Info' | 'Approved' | 'Active'
  | 'Blasted' | 'Offers Received' | 'Under Contract' | 'Closing' | 'Sold' | 'Dead'

export type PropertyType =
  | 'SFH' | 'Multifamily' | 'MHP' | 'Hotel' | 'Retail' | 'Storage' | 'Land' | 'Mixed-Use' | 'Other'

export type BuyerType =
  | 'Cash Buyer' | 'Hedge Fund' | 'JV Partner' | 'Lender' | 'Wholesaler' | 'Creative Buyer' | 'Agent'

export type BuyerStatus = 'New' | 'Active' | 'Hot' | 'Contacted' | 'Interested' | 'Do Not Contact' | 'Inactive'

export type OfferStatus = 'New' | 'Reviewing' | 'Accepted' | 'Rejected' | 'Countered'

export type UserRole =
  | 'Owner'
  | 'Admin'
  | 'Acquisition Manager'
  | 'Disposition Manager'
  | 'Transaction Coordinator'
  | 'VA'
  | 'Viewer'
  | 'Community Member'
  | 'Team Member / VA'
  | 'Buyer'
  | 'Seller / Submitter'

export type PermissionKey =
  | 'manageUsers'
  | 'manageSettings'
  | 'viewFinancials'
  | 'deleteDeals'
  | 'deleteBuyers'
  | 'deleteResources'
  | 'importBuyers'
  | 'importResources'
  | 'blastDeals'
  | 'exportData'
  | 'accessCommunity'
  | 'shareResources'
  | 'verifyResources'
  | 'manageAttribution'
  | 'editDeals'
  | 'editBuyers'
  | 'editResources'
  | 'viewOnly'

export type Visibility = 'private' | 'team' | 'shared' | 'community' | 'public'

export type CompensationType = 'None' | 'Flat Fee' | 'Percentage' | 'Custom'

export interface OwnershipMeta {
  ownerId?: string
  ownerName?: string
  createdBy?: string
  createdByName?: string
  sourceUserId?: string
  sourceUserName?: string
  sourceType?: 'Manual' | 'Import' | 'Community' | 'System' | 'Buyer DB' | 'Public Submission'
  visibility?: Visibility
  communityVisible?: boolean
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: string
  compensationOptIn?: boolean
  compensationType?: CompensationType
  compensationAmount?: string
  attributionNotes?: string
  timesUsed?: number
  closedTransactions?: number
  lastUsedDate?: string
}

export interface SubmitterInfo {
  name: string
  company?: string
  email: string
  phone: string
  role: string
  isOwner: boolean
  jvStructure?: string
  consent: boolean
}

export interface PropertyInfo {
  address: string
  city: string
  state: string
  zip: string
  county?: string
  type: PropertyType
  strategy: string
  beds?: number
  baths?: number
  units?: number
  sqft?: number
  lotSize?: number
  yearBuilt?: number
  occupancy: string
  description?: string
}

export interface PricingInfo {
  askingPrice?: number
  contractPrice?: number
  assignmentFee?: number
  buyerPrice?: number
  arv?: number
  rehab?: number
  currentRent?: number
  marketRent?: number
  grossMonthly?: number
  grossAnnual?: number
  noi?: number
  capRate?: number
  sellerFinance: boolean
  downPayment?: number
  monthlyPayment?: number
  interestRate?: number
  balloonTerm?: number
  amortization?: number
  pitiIncluded?: boolean
}

export interface DebtInfo {
  isFreeClear: boolean
  mortgageBalance?: number
  monthlyPayment?: number
  interestRate?: number
  arrears?: number
  taxesOwed?: number
  liens?: string
  helocBalance?: number
  otherDebt?: number
  titleCompany?: string
  titleContact?: string
  probate?: boolean
  foreclosure?: boolean
  codeViolations?: boolean
  eviction?: boolean
  ownershipIssues?: string
}

export interface ConditionInfo {
  roof?: string
  hvac?: string
  plumbing?: string
  electrical?: string
  foundation?: string
  majorRepairs?: string
  rehabNotes?: string
  occupancyStatus: string
  tenantDetails?: string
  leaseTerms?: string
  section8?: boolean
  walkthroughAvailable: boolean
  lockbox?: string
  photosVideosAvailable?: boolean
}

export interface ClosingInfo {
  closingDate?: string
  titleCompany?: string
  escrowOfficer?: string
  buyerEntity?: string
  emdAmount?: number
  emdDate?: string
  fundingStatus?: string
  commissionExpected?: number
  commissionPaid?: number
  closingNotes?: string
  checklist: Record<string, boolean>
}

export interface BuyerResponse {
  status: 'Interested' | 'Needs More Info' | 'Passed' | 'Made Offer' | 'NDA Requested' | 'BIO Sent' | 'No Response'
  date: string
  notes?: string
}

export interface BlastLog {
  id: string
  sentAt: string
  template: string
  subject: string
  recipientCount: number
  suppressedCount: number
  duplicateCount: number
  selectedDocNames: string[]
  ndaRequired: boolean
  sentBy: string
  status: 'Drafted' | 'Sent' | 'Follow-Up Needed' | 'Closed'
}

export interface DealSuppression {
  buyerId: string
  reason: string
  suppressedAt: string
}

export interface Doc extends Partial<OwnershipMeta> {
  id: string
  category: string
  name: string
  url: string
  size?: number
  uploadedAt: string
  isRequired?: boolean
  isBuyerFacing?: boolean
  requiresNDA?: boolean
}

export interface Activity {
  id: string
  timestamp: string
  type: string
  description: string
  user?: string
  dealId?: string
}

export interface Offer {
  id: string
  buyerId?: string
  buyerName: string
  buyerEmail: string
  amount: number
  emd?: number
  financingType: string
  closingTimeline: string
  contingencies?: string
  status: OfferStatus
  notes?: string
  counterAmount?: number
  proofOfFunds?: string
  createdAt: string
  history: Array<{ ts: string; note: string }>
}

export interface Deal extends Partial<OwnershipMeta> {
  id: string
  createdAt: string
  updatedAt: string
  status: DealStatus
  submitter: SubmitterInfo
  property: PropertyInfo
  pricing: PricingInfo
  debt: DebtInfo
  condition: ConditionInfo
  docs: Doc[]
  notes?: string
  closing?: ClosingInfo
  matchCount?: number
  source?: string
  assignmentOwner?: string
  assignmentOwnerId?: string
  dealVisibility?: Visibility
  communityEligible?: boolean
}

export interface Buyer extends Partial<OwnershipMeta> {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  type: BuyerType
  markets: string[]
  cities?: string[]
  assetTypes: PropertyType[]
  budgetMin?: number
  budgetMax?: number
  unitMin?: number
  unitMax?: number
  capRateMin?: number
  rehabTolerance?: string
  sellerFinance: boolean
  creativeFinance: boolean
  notes?: string
  tags: string[]
  lastContacted?: string
  status: BuyerStatus
  strengthScore?: number
  createdAt: string
  addedBy?: string
  addedByName?: string
  verifiedTransactions?: number
  buyersClosed?: number
}

export interface MatchResult {
  buyer: Buyer
  score: number
  tier: 'Strong Match' | 'Possible Match' | 'Weak Match'
  reasons: string[]
  missing: string[]
}

export interface User {
  id: string
  name: string
  email: string
  company?: string
  role: UserRole
  permissions?: PermissionKey[]
  avatar?: string
  isActive?: boolean
  invitedAt?: string
  joinedAt?: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: UserRole
  permissions?: PermissionKey[]
  status: 'Active' | 'Invited' | 'Disabled'
  createdAt: string
  updatedAt?: string
}

export interface AttributionRecord {
  id: string
  resourceId?: string
  buyerId?: string
  dealId?: string
  sourceUserId: string
  sourceUserName: string
  transactionId?: string
  transactionAmount?: number
  compensationType?: CompensationType
  compensationAmount?: string
  status: 'Pending' | 'Approved' | 'Paid' | 'Rejected'
  notes?: string
  createdAt: string
  updatedAt?: string
}

export interface TrialState {
  isActive: boolean
  daysLeft: number
  endDate: string
  usage: {
    dealsSubmitted: number
    buyersImported: number
    blastsSent: number
    exports: number
  }
  isPaid: boolean
  plan: 'Free' | 'Free Demo' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
  billingStatus?: 'Free Active' | 'Trial Active' | 'Payment Pending' | 'Paid Active' | 'Past Due' | 'Cancelled' | 'Comped'
  billingFrequency?: 'monthly' | 'annual'
  paymentProvider?: 'Stripe' | 'PayPal' | 'Cash App' | 'Square' | 'ACH / Bank Transfer' | 'Manual Invoice' | 'Other'
  billingPeriodStart?: string
  billingPeriodEnd?: string
  billingAdminNote?: string
  billingUpdatedAt?: string
}

export interface AppSettings {
  requiredFieldsByType: Record<PropertyType, string[]>
  requiredDocsByType: Record<PropertyType, string[]>
  matchingWeights: {
    state: number
    city: number
    assetType: number
    budget: number
    units: number
    capRate: number
    sellerFinance: number
    creative: number
    rehab: number
    tags: number
  }
  blastTemplates: Record<string, { subject: string; body: string }>
  pipelineStatuses: DealStatus[]
  teamPermissions: Record<string, string[]>
  ownerPreviewPlan?: 'Owner Admin' | 'Free' | 'Free Demo' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
  billingProviderSetup?: {
    provider: 'Stripe' | 'PayPal' | 'Cash App' | 'Square' | 'ACH / Bank Transfer' | 'Manual Invoice' | 'Other'
    billingMode: 'Stripe Checkout Links' | 'Payment link' | 'Autopay setup' | 'Invoice only' | 'Manual billing'
    autopayEnabled: boolean
    billingEmail: string
    billingName: string
    providerAccount: string
    paymentLink: string
    starterMonthlyPaymentLink: string
    starterAnnualPaymentLink: string
    proMonthlyPaymentLink: string
    proAnnualPaymentLink: string
    agencyMonthlyPaymentLink: string
    agencyAnnualPaymentLink: string
    enterpriseMonthlyPaymentLink: string
    enterpriseAnnualPaymentLink: string
    paymentHandle: string
    setupStatus: 'Not Started' | 'Setup Pending' | 'Payment Link Saved' | 'Ready for Manual Billing' | 'Ready for Payment Collection'
    notes: string
    updatedAt: string
  }
  onboarding?: {
    planSelectionCompleted: boolean
    selectedPlan?: TrialState['plan']
    tourCompleted: boolean
    tourSkipped: boolean
    tourCompletedAt?: string
    agencyEnterpriseEnabled: boolean
    promoNoticeVisible: boolean
    updatedAt?: string
  }
  deletionRequest?: {
    status: 'None' | 'Deletion Requested'
    workspaceInstanceId?: string
    accountStatus?: 'Active' | 'Deletion Requested' | 'Cancellation Scheduled' | 'Deactivated' | 'Deleted'
    requestedAt?: string
    requestedBy?: string
    cancellationRequestedAt?: string
    scheduledDeletionAt?: string
    cancelAtPeriodEnd?: boolean
    note?: string
  }
  billingCenter?: {
    paymentCollectionStatus?: 'Not Started' | 'Pending' | 'Active / Paid' | 'Past Due' | 'Cancelled' | 'Comped' | 'Needs Review'
    lastStripeSyncAt?: string
    stripeWebhookStatus?: 'Configured' | 'Missing' | 'Needs Review'
    autoActivationStatus?: 'Ready' | 'Needs Review'
    unmatchedStripePaymentCount?: number
    paymentHistory?: Array<{
      id: string
      paymentDate: string
      plan: TrialState['plan']
      billingFrequency: 'monthly' | 'annual'
      amount: string
      status: 'Paid' | 'Pending' | 'Failed' | 'Refunded' | 'Comped' | 'Cancelled'
      provider: 'Stripe'
      providerReference?: string
      receiptLink?: string
      adminNote?: string
      createdAt: string
      billingPeriodStart?: string
      billingPeriodEnd?: string
    }>
  }
}

export interface AppState {
  user: User | null
  trial: TrialState
  deals: Deal[]
  buyers: Buyer[]
  offers: Record<string, Offer[]>
  activities: Record<string, Activity[]>
  documents: Record<string, Doc[]>
  settings: AppSettings
  viewedDealIds: string[]
  viewedBuyerIds: string[]
  suppressionList: string[]
  sidebarOpen: boolean
  currentDealId: string | null

  blastLogs: Record<string, BlastLog[]>
  buyerResponses: Record<string, Record<string, BuyerResponse>>
  dealSuppressions: Record<string, DealSuppression[]>
  followUps: any[]
  dismissedAttention: Record<string, { dismissedAt: string; issueKeys: string[] }>

  teamMembers?: TeamMember[]
  attributionRecords?: AttributionRecord[]
}

