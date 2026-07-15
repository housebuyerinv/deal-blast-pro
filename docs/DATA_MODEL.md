# Deal Blast Pro - Data Model

## Core Entities

### User
```ts
interface User {
  id: string;
  name: string;
  email: string;
  company?: string;
  role: 'Owner' | 'Admin' | 'Dispo Manager' | 'Acquisition Manager' | 'VA' | 'Viewer';
  avatar?: string;
  teamId?: string;
  createdAt: string;
}
```

### Team / Organization
```ts
interface Team {
  id: string;
  name: string;
  ownerId: string;
  plan: 'trial' | 'pro' | 'enterprise';
  createdAt: string;
}
```

### TeamMember
```ts
interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: User['role'];
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
}
```

### Deal (Central Entity)
```ts
interface Deal {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: DealStatus; // See enum below
  submitter: SubmitterInfo;
  property: PropertyInfo;
  pricing: PricingInfo;
  debt: DebtInfo;
  condition: ConditionInfo;
  closing?: ClosingInfo;
  docs: Doc[];
  notes?: string;
  teamId: string;           // NEW for multi-tenancy
  createdBy: string;        // userId
}
```

**Sub-objects:**

- **SubmitterInfo**: name, company, email, phone, role, isOwner, jvStructure, consent
- **PropertyInfo**: address, city, state, zip, county, type, strategy, beds, baths, units, sqft, lotSize, yearBuilt, occupancy, description
- **PricingInfo**: All pricing fields (askingPrice, arv, rehab, capRate, sellerFinance terms, etc.)
- **DebtInfo**: isFreeClear + mortgage details, liens, titleCompany, probate/foreclosure flags
- **ConditionInfo**: roof/hvac/plumbing/electrical condition + access/tenant info
- **ClosingInfo**: closingDate, titleCompany, escrowOfficer, buyerEntity, emdAmount, emdDate, fundingStatus, commission fields, closingNotes, checklist

**Enums**:
- `DealStatus`: 'Draft' | 'Submitted' | 'Needs Info' | 'Approved' | 'Active' | 'Blasted' | 'Offers Received' | 'Under Contract' | 'Closing' | 'Sold' | 'Dead'

### Buyer
```ts
interface Buyer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  type: BuyerType;
  markets: string[];
  cities?: string[];
  assetTypes: PropertyType[];
  budgetMin?: number;
  budgetMax?: number;
  unitMin?: number;
  unitMax?: number;
  capRateMin?: number;
  rehabTolerance?: string;
  sellerFinance: boolean;
  creativeFinance: boolean;
  notes?: string;
  tags: string[];
  lastContacted?: string;
  status: BuyerStatus;
  strengthScore?: number;
  createdAt: string;
  teamId: string;
  createdBy: string;
}
```

### BuyerResponse (per deal)
```ts
interface BuyerResponse {
  status: 'Interested' | 'Needs More Info' | 'Passed' | 'Made Offer' | 'NDA Requested' | 'BIO Sent' | 'No Response';
  date: string;
  notes?: string;
}
```

### DealSuppression (per-deal)
```ts
interface DealSuppression {
  buyerId: string;
  reason: string;
  suppressedAt: string;
}
```

### BlastLog
```ts
interface BlastLog {
  id: string;
  sentAt: string;
  template: string;
  subject: string;
  recipientCount: number;
  suppressedCount: number;
  duplicateCount: number;
  selectedDocNames: string[];
  ndaRequired: boolean;
  sentBy: string;
  status: 'Drafted' | 'Sent' | 'Follow-Up Needed' | 'Closed';
  dealId: string;
}
```

### FollowUp
```ts
interface FollowUp {
  id: string;
  dealId: string;
  buyerId?: string;
  dueDate: string;
  type: string;
  completed: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
  teamId: string;
}
```

### Document
```ts
interface Doc {
  id: string;
  dealId: string;
  category: string;
  name: string;
  url: string;              // Will become S3 key or signed URL in backend
  size?: number;
  uploadedAt: string;
  uploadedBy: string;
  isRequired?: boolean;
  isBuyerFacing?: boolean;
  requiresNDA?: boolean;
}
```

### Offer
```ts
interface Offer {
  id: string;
  dealId: string;
  buyerId?: string;
  buyerName: string;
  buyerEmail: string;
  amount: number;
  emd?: number;
  financingType: string;
  closingTimeline: string;
  contingencies?: string;
  status: OfferStatus;
  notes?: string;
  counterAmount?: number;
  proofOfFunds?: string;
  createdAt: string;
  history: Array<{ ts: string; note: string }>;
}
```

### Activity (Audit Log)
```ts
interface Activity {
  id: string;
  dealId?: string;
  timestamp: string;
  type: string;
  description: string;
  user?: string;
  metadata?: Record<string, any>;
}
```

### Settings
```ts
interface AppSettings {
  requiredFieldsByType: Record<PropertyType, string[]>;
  requiredDocsByType: Record<PropertyType, string[]>;
  matchingWeights: Record<string, number>;
  blastTemplates: Record<string, { subject: string; body: string }>;
  pipelineStatuses: string[];
  teamPermissions?: Record<string, string[]>;
}
```

### Subscription / Trial
```ts
interface TrialState {
  isActive: boolean;
  daysLeft: number;
  endDate: string;
  usage: {
    dealsSubmitted: number;
    buyersImported: number;
    blastsSent: number;
    exports: number;
  };
  isPaid: boolean;
}
```

---

## Relationships

- `Deal` → many `Document`, `Offer`, `Activity`, `BlastLog`, `FollowUp`
- `Deal` → many `BuyerResponse` (via buyerResponses map)
- `Buyer` → many `BuyerResponse`, `DealSuppression`
- `Team` → many `User` / `TeamMember`
- `Deal`, `Buyer`, `FollowUp`, `BlastLog` all have `teamId` for multi-tenancy

All IDs are currently string (UUID or short generated IDs). Backend should use proper UUIDs or database-generated IDs.