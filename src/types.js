import { MediaItem } from 'flow-sdk';

export type UserMode = 'Admin' | 'VA';

export type AppTab = 
  | 'commandCenter' 
  | 'inventoryHub' 
  | 'inventoryDetail'
  | 'activeQueue' 
  | 'dealSubmissions' 
  | 'dealIntake' 
  | 'dealDocs' 
  | 'followUps' 
  | 'globalBuyerDb' 
  | 'buyerPipeline' 
  | 'biddingHub' 
  | 'partners' 
  | 'vaPerformance' 
  | 'vaAuditLogs' 
  | 'systemHealth' 
  | 'smokeTest' 
  | 'finalBackup' 
  | 'systemBackup'
  | 'publicPortal' 
  | 'systemSettings';

export type SubmissionFileType = 
  | 'Photo' 
  | 'Video' 
  | 'Rent Roll' 
  | 'T12' 
  | 'OM / Offering Memo' 
  | 'Contract / PSA' 
  | 'Proof of Contract' 
  | 'Title Document' 
  | 'Appraisal' 
  | 'Inspection Report' 
  | 'Insurance Document' 
  | 'Seller Finance Terms' 
  | 'Other';

export interface PortalDoc {
  id: string;
  fileName: string;
  fileType: SubmissionFileType;
  fileTypeOther?: string;
  notes?: string;
  size: number;
  uploadedAt: number;
  mimeType: string;
  base64: string;
  status?: 'Received' | 'Verified' | 'Rejected';
  reviewStatus?: 'Pending' | 'Reviewed' | 'Incorrect' | 'Missing' | 'Replacement Requested';
  reviewerNotes?: string;
  uploadedBy?: string;
}

export type PortalSubmissionStatus = 'New' | 'Needs Info' | 'Under Review' | 'Approved for Blast' | 'Matched to Buyers' | 'Rejected' | 'Archived' | 'Received' | 'Accepted' | 'Accepted Into Pipeline';

export type TriStateOption = 'Yes' | 'No' | 'Unknown';

export interface PortalSubmission {
  id: string;
  timestamp: number;
  source: string;
  recordType: 'portalSubmission';
  
  // Section 1: Contact
  pocName: string;
  pocEmail: string;
  pocPhone: string;
  company: string;
  role: string;
  customRole?: string;
  jvStructure?: string;
  proofOfAuthority?: string;

  // Section 2: Property
  address: string;
  city: string;
  state: string;
  zip: string;
  market?: string;
  county?: string;
  assetType: AssetType;
  customAssetType?: string;
  unitCount?: number;
  beds?: number;
  baths?: number;
  yearBuilt?: number;
  sqft?: number;

  // Section 3: Pricing
  askingPrice: number | string;
  contractPrice: number | string;
  wholesaleFee?: number | string;
  jvFee?: number | string;
  estimatedArv?: number | string;
  estimatedRehab?: number | string;
  currentRent?: number | string;
  marketRent?: number | string;
  noi?: number | string;
  capRate?: number | string;
  
  // Section 4: Debt & Title
  isUnderContract: boolean;
  contractStatus?: string;
  titleFreeAndClear: TriStateOption;
  hasMortgages: TriStateOption;
  mortgageBalance?: number | string;
  hasLiens: TriStateOption;
  estimatedLiensAmount?: number | string;
  taxesOwed: TriStateOption;
  estimatedTaxesOwed?: number | string;
  titleCompany?: string;
  assignable?: TriStateOption;
  emdRequirement?: string;
  
  // Section 5: Occupancy & Access
  occupancy?: string;
  tenantStatus?: string;
  leaseInfo?: string;
  walkthroughAvailability?: string;
  accessInstructions?: string;

  // Section 6: Condition
  roofCondition?: string;
  hvacCondition?: string;
  plumbingCondition?: string;
  electricalCondition?: string;
  foundationCondition?: string;
  majorRepairsNeeded?: string;
  propertyConditionNotes?: string;

  // Section 7: Documents (Handled by documents array)
  documents: PortalDoc[];

  // Section 8: Seller Contact
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;

  // Section 9: Notes
  dealSummary?: string;
  marketingNotes?: string;
  restrictions?: string;
  specialTerms?: string;

  consentConfirmed: boolean;
  status: PortalSubmissionStatus;
  acceptedIntoPipeline?: boolean;
  missingInfoChecklist?: string[];
  activityLogs?: any[];
  intakeScore?: number;
  daisyChainScore?: number;
  daisyChainLevel?: string;
  flags?: string[];
}

export type AssetType = 'SFR' | 'Multifamily' | 'Duplex / Triplex / Quad' | 'Commercial' | 'Mixed-Use' | 'Land' | 'MHP / RV Park' | 'Hotel / Hospitality' | 'Self Storage' | 'Retail / Shopping Center' | 'Office' | 'Industrial / Warehouse' | 'Notes / Paper' | 'Portfolio' | 'Business Opportunity' | 'Other' | 'Any';

export interface PropertyData {
  id: string;
  status: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: AssetType;
  price: number;
  arv: number;
  rehab: number;
  fee: number;
  pocName: string;
  pocEmail: string;
  pocPhone: string;
  intakeSource: string;
  company: string;
  contractPrice: number;
  rent: number;
  marketRent: number;
  noi: number;
  capRate: number;
  occupancy: string;
  unitCount: number;
  jvStructure: string;
  proofOfControlStatus: string;
  titleCompany: string;
  accessInstructions: string;
  lockboxCode: string;
  ndaRequired: boolean;
  pofRequired: boolean;
  dueDiligenceItems: any[];
  rehabItems: any[];
  photos: any[];
  documents: PortalDoc[]; 
  offers: any[];
  buyerPipeline: any[];
  blastLogs: any[];
  sellerFinance: any;
  comps: any;
  signature: string;
  lastUpdated: number;
  daisyChainScore: number;
  daisyChainLevel: string;
  isTestRecord?: boolean;
  recordType?: string;
  acceptedIntoPipeline?: boolean;
  sourceSubmissionId?: string;
  pipelineStatus?: string;
  
  // Authorize Blast workflow fields
  authorizedBuyerBlastList?: Array<{ buyerId: string; name: string; email: string; score: number }>;
  authorizedAt?: number;
  authorizedBy?: string;

  // Refined Title/Debt audit for Inventory
  titleFreeAndClear?: TriStateOption;
  hasMortgages?: TriStateOption;
  mortgageBalance?: number;
  taxesOwed?: TriStateOption;
  estimatedTaxesOwed?: number;
  hasLiens?: TriStateOption;
  estimatedLiensAmount?: number;
  hasLegalIssues?: TriStateOption;

  // New Inventory Fields
  createdAt?: number;
  updatedAt?: number;
  market?: string;
  assetType?: string;
  askingPrice?: number;
  assignmentFee?: number;
  jvFee?: number;
  taxesOwedAmount?: number;
  liensAmount?: number;
  totalDebtAmount?: number;
  titleStatus?: string;
  occupancyStatus?: string;
  conditionSummary?: string;
  accessInfo?: string;
  docs?: any[];
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  missingRequirements?: string[];
  reviewNotes?: string;
  approvedAt?: number;

  // Granular fields for Manage drawer
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  county?: string;
  
  assignable?: TriStateOption;
  emdRequirement?: string;
  
  tenantStatus?: string;
  leaseStatus?: string;
  walkthroughInfo?: string;
  
  roof?: string;
  hvac?: string;
  plumbing?: string;
  electrical?: string;
  foundation?: string;
  majorRepairs?: string;
  conditionNotes?: string;
  
  role?: string;
  summary?: string;
  marketingNotes?: string;
  restrictions?: string;
  specialTerms?: string;
}

export interface SavedDeal {
  id: string;
  timestamp: number;
  data: PropertyData;
  content: any;
}

export interface BuyerMatchResult {
  buyer: Buyer;
  score: number;
  reasons: {
    market: string;
    asset: string;
    budget: string;
    strategy: string;
  };
}

export interface Buyer {
  id: string;
  name: string;
  email: string;
  phone: string;
  mobilePhone: string;
  directPhone: string;
  company: string;
  website: string;
  city: string;
  isNationwide: boolean;
  preferredMarkets: string[]; 
  excludedMarkets: string[];  
  states: string[]; 
  type: any;
  status: any;
  reviewStatus: any;
  nextAction: string;
  activity: any;
  minPrice: number;
  maxPrice: number;
  rawBudgetText: string;
  minROI: number;
  capRate: number;
  unitRange: string;
  wantsCreative: boolean;
  acceptsCreativeTerms: boolean;
  creativeTermsNotes: string;
  isCashBuyer: boolean;
  isJVFriendly: boolean;
  isDirectOnly: boolean;
  isSellerFinance: boolean;
  notes: string;
  lastImported: number;
  updatedAt: number;
  lastAuditedAt: number;
  isEdited: boolean;
  isDuplicate: boolean;
  needsReview: boolean;
  propertyTypes: AssetType[];
  financeTypes: string[];
  tags: string[];
  rating: number;
  dealCount: number;
  sourceFile: string; 
  rawData?: any;
  isTestRecord?: boolean;
  source?: string;
}

export interface Partner {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  dealsSubmitted: number;
  dealsAccepted: number;
  dealsBlasted: number;
  dealsClosed: number;
  dealsDead: number;
  avgDealQuality: number;
  totalJVProfit: number;
  proofOfControl: boolean;
  responsiveness: any;
  jvSplit: number;
  notes: string;
  tags: any[];
  timestamp: number;
}

export interface Task {
  id: string;
  category: string;
  assignedTo: string;
  priority: any;
  dueDate: string;
  status: any;
  notes: string;
  timestamp: number;
  relatedDealId?: string;
  relatedDealAddress?: string;
  relatedContactId?: string;
  relatedContactName?: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  relatedRecordId?: string;
  status: 'unread' | 'read' | 'dismissed' | 'acknowledged';
  createdAt: number;
  acknowledgedAt?: number;
}

export interface AppSettings {
  hasCompletedSetup: boolean;
  userMode: UserMode;
  adminPin: string;
  stalePartnerDays: number;
  limboDealDays: number;
  minBuyerMatchScore: number;
  maxBlastRecipients: number;
  defaultJVSplit: number;
  defaultFee: number;
  defaultSignature: string;
  criticalDDLabels: string[];
  preferredCategories: any[];
  scoringProfiles: Record<AssetType, any>;
  dealScoreRules: { strong: number; okay: number };
  followUpThresholdHours: number;
  priorityEngine: any;
  vaNames: string[];
  priorityEngineConfig: any;
  partnerTags: string[];
  backupFrequency: 'Daily' | 'Weekly' | 'Manual';
  vaBenchmarks: any;
  health: any;
  release: any;
  backupTracking: any;
  featureFlags: any;
  isSampleDataMode?: boolean;
  defaultNotificationEmail?: string;
  defaultPublicPortalRoute?: string;
  customPublicPortalUrl?: string;
}

export interface SystemAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  relatedId?: string;
  tabTarget?: AppTab;
  actionLabel?: string;
  acknowledged?: boolean;
}
