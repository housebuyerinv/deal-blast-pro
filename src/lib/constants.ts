import { PropertyType, DealStatus, BuyerType, AppSettings } from './types'

export const SUPER_ADMIN_EMAILS = ['housebuyerinv@gmail.com'] as const

export const PROPERTY_TYPES: PropertyType[] = [
  'SFH', 'Multifamily', 'MHP', 'Hotel', 'Retail', 'Storage', 'Land', 'Mixed-Use', 'Other'
]

export const DEAL_STATUSES: DealStatus[] = [
  'Draft', 'Submitted', 'Needs Info', 'Approved', 'Active', 'Blasted',
  'Offers Received', 'Under Contract', 'Closing', 'Sold', 'Dead'
]

export const BUYER_TYPES: BuyerType[] = [
  'Cash Buyer', 'Hedge Fund', 'JV Partner', 'Lender', 'Wholesaler', 'Creative Buyer', 'Agent'
]

export const OCCUPANCY_OPTIONS = ['Vacant', 'Owner Occupied', 'Tenant Occupied', 'Unknown']
export const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Unknown']

export const ASSET_STRATEGIES = [
  'Flip', 'Buy and Hold', 'BRRRR', 'Seller Finance', 'Subject-To', 'Value-Add', 'Turnkey', 'Development'
]

export const SUBMITTER_ROLES = [
  'Owner', 'Wholesaler', 'Agent', 'JV Partner', 'Direct to Seller', 'Other'
]

export const DEFAULT_SETTINGS: AppSettings = {
  requiredFieldsByType: {
    SFH: ['address', 'city', 'state', 'zip', 'askingPrice', 'property.type'],
    Multifamily: ['address', 'city', 'state', 'zip', 'units', 'noi', 'askingPrice', 'property.type'],
    MHP: ['address', 'city', 'state', 'zip', 'units', 'askingPrice'],
    Hotel: ['address', 'city', 'state', 'zip', 'units', 'arv', 'askingPrice'],
    Retail: ['address', 'city', 'state', 'zip', 'sqft', 'askingPrice'],
    Storage: ['address', 'city', 'state', 'zip', 'units', 'askingPrice'],
    Land: ['address', 'city', 'state', 'zip', 'lotSize', 'askingPrice'],
    'Mixed-Use': ['address', 'city', 'state', 'zip', 'units', 'askingPrice'],
    Other: ['address', 'city', 'state', 'zip', 'askingPrice']
  },
  requiredDocsByType: {
    SFH: ['Photos', 'PSA/Contract'],
    Multifamily: ['Photos', 'Rent Roll', 'T12', 'PSA/Contract'],
    MHP: ['Photos', 'Rent Roll', 'T12'],
    Hotel: ['Photos', 'OM', 'T12'],
    Retail: ['Photos', 'OM', 'Rent Roll'],
    Storage: ['Photos', 'Rent Roll'],
    Land: ['Photos', 'Comps'],
    'Mixed-Use': ['Photos', 'OM', 'Rent Roll', 'T12'],
    Other: ['Photos']
  },
  matchingWeights: {
    state: 25,
    city: 15,
    assetType: 20,
    budget: 15,
    units: 5,
    capRate: 5,
    sellerFinance: 10,
    creative: 5,
    rehab: 5,
    tags: 5
  },
  blastTemplates: {
    'Strong Buyer': {
      subject: 'Off-Market {{property.type}} in {{property.city}}, {{property.state}} - {{pricing.buyerPrice}}',
      body: `Hi {{buyer.name}},\n\nWe have a strong off-market opportunity in {{property.city}}.\n\nAddress: {{property.address}}\nAsking: {{pricing.askingPrice}}\n\nKey highlights:\n- {{property.beds}}/{{property.baths}} {{property.type}}\n- ARV: {{pricing.arv}}\n- Rehab: {{pricing.rehab}}\n\nFull package + access instructions attached.\n\nReply for OM / walkthrough.\n\nBest,\nDeal Blast Pro Team`
    },
    'Soft Buyer': {
      subject: 'New {{property.type}} Opportunity - {{property.city}}',
      body: `Hello,\n\nNew inventory just hit our desk in {{property.city}}, {{property.state}}.\n\nPlease see attached for details and let me know if you have any interest.\n\nThanks`
    },
    'Creative Finance': {
      subject: 'Seller Finance / Creative Deal - {{property.address}}',
      body: `Creative terms available on this {{property.type}}.\n\nDown: {{pricing.downPayment}}\nMonthly: {{pricing.monthlyPayment}}\nRate: {{pricing.interestRate}}%\n\nPerfect for buyers seeking flexible structures.`
    },
    'Multifamily': {
      subject: '{{property.units}} Unit {{property.type}} | {{property.city}} | Cap {{pricing.capRate}}%',
      body: `Stabilized or value-add multifamily opportunity.\n\nGross Monthly: {{pricing.grossMonthly}}\nNOI: {{pricing.noi}}\n\nFull T12 + rent roll in docs.`
    },
    'Portfolio': {
      subject: 'Portfolio Opportunity - {{property.city}} {{property.type}}s',
      body: `Bundled assets available. Contact for full tape.`
    },
    'Follow-up': {
      subject: 'Follow-up: {{property.address}} - Still Available',
      body: `Just checking in on the {{property.address}} opportunity. Still available and ready for a quick close.`
    }
  },
  pipelineStatuses: DEAL_STATUSES,
  teamPermissions: {
    Admin: ['all'],
    'Team Member / VA': ['intake', 'submissions', 'inventory_view', 'buyers_view'],
    Viewer: ['inventory_view', 'buyers_view']
  },
  ownerPreviewPlan: 'Owner Admin',
  billingProviderSetup: {
    provider: 'Stripe',
    billingMode: 'Stripe Checkout Links',
    autopayEnabled: false,
    billingEmail: '',
    billingName: '',
    providerAccount: '',
    paymentLink: '',
    starterMonthlyPaymentLink: 'https://buy.stripe.com/3cI28sckN2w12scfDY4gg00',
    starterAnnualPaymentLink: 'https://buy.stripe.com/5kQ7sMesV1rXc2M0J44gg02',
    proMonthlyPaymentLink: 'https://buy.stripe.com/4gMfZigB36Mh8QAezU4gg01',
    proAnnualPaymentLink: 'https://buy.stripe.com/3cIeVeesV4E9eaUdvQ4gg03',
    agencyMonthlyPaymentLink: '',
    agencyAnnualPaymentLink: '',
    enterpriseMonthlyPaymentLink: '',
    enterpriseAnnualPaymentLink: '',
    paymentHandle: '',
    setupStatus: 'Ready for Payment Collection',
    notes: '',
    updatedAt: ''
  },
  onboarding: {
    planSelectionCompleted: false,
    selectedPlan: 'Free',
    tourCompleted: false,
    tourSkipped: false,
    tourCompletedAt: '',
    agencyEnterpriseEnabled: false,
    promoNoticeVisible: false,
    updatedAt: ''
  },
  deletionRequest: {
    status: 'None',
    workspaceInstanceId: '',
    accountStatus: 'Active',
    requestedAt: '',
    requestedBy: '',
    cancellationRequestedAt: '',
    scheduledDeletionAt: '',
    cancelAtPeriodEnd: false,
    note: ''
  },
  billingCenter: {
    paymentCollectionStatus: 'Needs Review',
    lastStripeSyncAt: '',
    stripeWebhookStatus: 'Needs Review',
    autoActivationStatus: 'Needs Review',
    unmatchedStripePaymentCount: 0,
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    subscriptionStatus: '',
    currentPeriodEnd: '',
    cancelAtPeriodEnd: false,
    outstandingBalance: 0,
    latestInvoiceStatus: '',
    latestInvoiceId: '',
    latestInvoiceHostedUrl: '',
    latestInvoicePdf: '',
    currentPlan: 'Free',
    effectiveAccessPlan: 'Free',
    scheduledPlan: '',
    scheduledPlanChangeAt: '',
    scheduledPlanChangeReason: '',
    billingInterval: 'monthly',
    stripePriceId: '',
    stripeProductId: '',
    prorationBehavior: '',
    lastPlanSyncAt: '',
    planChangeSource: '',
    paymentHistory: []
  }
}

export const ROLE_OPTIONS = ['Admin', 'Team Member / VA', 'Buyer', 'Seller / Submitter', 'Viewer'] as const

export const MOCK_USER = {
  id: 'u1',
  name: 'Alex Rivera',
  email: 'alex@dealblast.pro',
  company: 'Apex Acquisitions',
  role: 'Admin' as const,
  avatar: undefined
}

export const TRIAL_DEFAULT = {
  isActive: true,
  daysLeft: 999,
  endDate: '',
  usage: { dealsSubmitted: 0, buyersImported: 0, blastsSent: 0, exports: 0 },
  isPaid: false,
  plan: 'Free' as const,
  billingStatus: 'Free Active' as const,
  billingFrequency: 'monthly' as const,
  paymentProvider: 'Stripe' as const,
  billingPeriodStart: '',
  billingPeriodEnd: '',
  billingAdminNote: '',
  billingUpdatedAt: '',
  currentPlan: 'Free' as const,
  effectiveAccessPlan: 'Free' as const,
  scheduledPlan: '',
  scheduledPlanChangeAt: '',
  scheduledPlanChangeReason: '',
  billingInterval: 'monthly' as const,
  stripePriceId: ''
}


