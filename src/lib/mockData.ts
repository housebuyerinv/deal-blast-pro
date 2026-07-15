import { Deal, Buyer, Offer, Activity } from './types'

export function seedDeals(): Deal[] {
  const now = new Date()
  return [
    {
      id: 'D8F3K2',
      createdAt: new Date(now.getTime() - 1000 * 3600 * 26).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 3600 * 5).toISOString(),
      status: 'Approved',
      submitter: { name: 'Marcus Hale', company: 'Hale Wholesale', email: 'marcus@halewholesale.com', phone: '(412) 555-0192', role: 'Wholesaler', isOwner: false, consent: true },
      property: { address: '1247 Riverside Dr', city: 'Pittsburgh', state: 'PA', zip: '15212', county: 'Allegheny', type: 'SFH', strategy: 'Flip', beds: 3, baths: 2, units: 1, sqft: 1680, lotSize: 0.18, yearBuilt: 1958, occupancy: 'Vacant', description: 'Solid brick 3/2 in up-and-coming area. Needs cosmetics and kitchen refresh. Great ARV comps at $285k.' },
      pricing: { askingPrice: 142000, contractPrice: 138500, assignmentFee: 8500, arv: 268000, rehab: 42000, currentRent: 0, marketRent: 1850, noi: 16800, capRate: 8.4, sellerFinance: false },
      debt: { isFreeClear: false, mortgageBalance: 92000, monthlyPayment: 785, interestRate: 6.75, arrears: 0, taxesOwed: 1850, liens: '', helocBalance: 0, titleCompany: 'First American Title - Mike Torres', probate: false, foreclosure: false },
      condition: { roof: 'Good', hvac: 'Fair', plumbing: 'Good', electrical: 'Good', foundation: 'Good', majorRepairs: 'Full kitchen + baths', rehabNotes: 'New roof 2019. HVAC 8yrs old.', occupancyStatus: 'Vacant', walkthroughAvailable: true, lockbox: '1427', photosVideosAvailable: true },
      docs: []
    },
    {
      id: 'D9K4M1',
      createdAt: new Date(now.getTime() - 1000 * 3600 * 8).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 3600 * 2).toISOString(),
      status: 'Submitted',
      submitter: { name: 'Tasha Reed', company: '', email: 'tasha.reed.rei@gmail.com', phone: '(205) 555-7831', role: 'Direct to Seller', isOwner: true, consent: true },
      property: { address: '892 Oak Hill Lane', city: 'Birmingham', state: 'AL', zip: '35209', county: 'Jefferson', type: 'Multifamily', strategy: 'Value-Add', beds: 0, baths: 0, units: 12, sqft: 9800, yearBuilt: 1974, occupancy: 'Tenant Occupied', description: '12-unit value-add in Homewood. Current 68% occupied, below market rents. Strong upside.' },
      pricing: { askingPrice: 920000, contractPrice: 875000, assignmentFee: 45000, arv: 1450000, rehab: 165000, grossMonthly: 14200, noi: 98000, capRate: 7.1, sellerFinance: true, downPayment: 175000, monthlyPayment: 6100, interestRate: 7.25 },
      debt: { isFreeClear: false, mortgageBalance: 410000, taxesOwed: 12400, liens: 'HOA lien $3,200', titleCompany: 'Stewart Title', probate: false, foreclosure: false },
      condition: { roof: 'Fair', hvac: 'Poor', plumbing: 'Fair', electrical: 'Good', foundation: 'Good', majorRepairs: 'Roof + 4 HVAC units', rehabNotes: 'Unit interiors 60% updated. Need full common area + systems.', occupancyStatus: 'Tenant Occupied', tenantDetails: '8/12 occupied. 3 on month-to-month.', walkthroughAvailable: true, photosVideosAvailable: true },
      docs: []
    },
    {
      id: 'D2P7Q9',
      createdAt: new Date(now.getTime() - 1000 * 3600 * 72).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 3600 * 18).toISOString(),
      status: 'Active',
      submitter: { name: 'Carlos Mendez', company: 'Sunbelt Dispositions', email: 'carlos@sunbeltdispo.com', phone: '(813) 555-4421', role: 'Wholesaler', isOwner: false, jvStructure: '50/50 JV with seller', consent: true },
      property: { address: '4500 N Nebraska Ave', city: 'Tampa', state: 'FL', zip: '33603', county: 'Hillsborough', type: 'Mixed-Use', strategy: 'Seller Finance', beds: 0, baths: 0, units: 4, sqft: 6200, yearBuilt: 1962, occupancy: 'Vacant', description: 'Corner mixed-use. 2 retail + 2 residential units above. Seller wants out fast.' },
      pricing: { askingPrice: 465000, contractPrice: 425000, assignmentFee: 28000, arv: 690000, rehab: 88000, sellerFinance: true, downPayment: 85000, monthlyPayment: 2950, interestRate: 6.9, balloonTerm: 60 },
      debt: { isFreeClear: true },
      condition: { roof: 'Poor', hvac: 'Fair', plumbing: 'Fair', electrical: 'Good', foundation: 'Good', majorRepairs: 'New roof + facade + 2 unit rehabs', rehabNotes: 'Structure sound. Roof leaking in rear retail.', occupancyStatus: 'Vacant', walkthroughAvailable: true, lockbox: 'CODE 4821', photosVideosAvailable: true },
      docs: []
    },
    {
      id: 'D4R1X5',
      createdAt: new Date(now.getTime() - 1000 * 86400 * 5).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 3600 * 9).toISOString(),
      status: 'Offers Received',
      submitter: { name: 'Latrice Johnson', company: 'Premier REI', email: 'latrice@premierrei.net', phone: '(901) 555-9901', role: 'JV Partner', isOwner: false, consent: true },
      property: { address: '3318 Elvis Presley Blvd', city: 'Memphis', state: 'TN', zip: '38116', county: 'Shelby', type: 'MHP', strategy: 'Buy and Hold', beds: 0, baths: 0, units: 28, sqft: 0, yearBuilt: 1988, occupancy: 'Tenant Occupied', description: '28-pad MHP. 24 occupied. Low lot rent, room to raise. Owner retiring.' },
      pricing: { askingPrice: 1380000, contractPrice: 1295000, assignmentFee: 65000, arv: 1920000, rehab: 145000, grossMonthly: 16800, noi: 142000, capRate: 8.9, sellerFinance: false },
      debt: { isFreeClear: false, mortgageBalance: 680000, taxesOwed: 9800, liens: '', titleCompany: 'Chicago Title - Dana K' },
      condition: { roof: 'Good', hvac: 'Good', plumbing: 'Good', electrical: 'Good', foundation: 'Good', majorRepairs: 'Roads + 6 units cosmetic', rehabNotes: 'Park is clean. Need to pave entrance road.', occupancyStatus: 'Tenant Occupied', tenantDetails: '24/28 pads filled. Average rent $425.', walkthroughAvailable: true, photosVideosAvailable: true },
      docs: []
    },
    {
      id: 'D7Y2N8',
      createdAt: new Date(now.getTime() - 1000 * 3600 * 3).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 3600 * 1).toISOString(),
      status: 'Submitted',
      submitter: { name: 'Derek Voss', company: 'Voss Capital', email: 'derek@voss.capital', phone: '(610) 555-2234', role: 'Agent', isOwner: false, consent: true },
      property: { address: '19 Industrial Way', city: 'Allentown', state: 'PA', zip: '18109', county: 'Lehigh', type: 'Storage', strategy: 'Value-Add', beds: 0, baths: 0, units: 84, sqft: 42000, yearBuilt: 1999, occupancy: 'Vacant', description: 'Self-storage facility. 84 units, 62% occupied. Owner motivated after health issues.' },
      pricing: { askingPrice: 1750000, contractPrice: 1620000, assignmentFee: 95000, arv: 2450000, rehab: 210000, grossMonthly: 28500, noi: 205000, capRate: 9.6, sellerFinance: true },
      debt: { isFreeClear: false, mortgageBalance: 980000, taxesOwed: 22100, liens: 'Mechanics lien $18k', titleCompany: 'Fidelity National' },
      condition: { roof: 'Good', hvac: 'N/A', plumbing: 'Good', electrical: 'Good', foundation: 'Good', majorRepairs: 'Gate system + lighting + 12 unit interiors', rehabNotes: 'Security system outdated. 11 units need doors.', occupancyStatus: 'Vacant', walkthroughAvailable: true, photosVideosAvailable: true },
      docs: []
    }
  ]
}

export function seedBuyers(): Buyer[] {
  // Realistic buyers inspired by the provided CSV + expanded
  return [
    { id: 'B1', name: 'Bruce Edwards', email: 'bruce@edenelevations3.com', phone: '(205) 555-1101', company: 'Eden Elevations', type: 'Hedge Fund', markets: ['AL', 'FL', 'TX', 'GA'], assetTypes: ['Multifamily'], budgetMin: 2000000, budgetMax: 50000000, unitMin: 20, unitMax: 300, capRateMin: 6.5, sellerFinance: false, creativeFinance: false, tags: ['Value-Add', '1980+'], status: 'Hot', strengthScore: 88, createdAt: new Date(Date.now() - 86400000 * 12).toISOString() },
    { id: 'B2', name: 'Alireza Zare', email: 'alirezazare.ws@gmail.com', phone: '', company: '', type: 'Cash Buyer', markets: ['TX', 'FL', 'GA', 'TN', 'NC', 'SC'], assetTypes: ['Multifamily'], budgetMin: 5000000, budgetMax: 40000000, unitMin: 100, unitMax: 400, capRateMin: 7, sellerFinance: false, creativeFinance: false, tags: ['B/C+', 'Large MF'], status: 'Active', strengthScore: 79, createdAt: new Date(Date.now() - 86400000 * 9).toISOString() },
    { id: 'B3', name: 'Zakar BanaYahu', email: 'juggernautcrowdsource@gmail.com', phone: '(813) 555-8842', company: 'Juggernaut', type: 'Creative Buyer', markets: ['FL', 'GA', 'TX', 'TN', 'OH'], assetTypes: ['Multifamily', 'MHP'], budgetMin: 800000, budgetMax: 12000000, unitMin: 15, unitMax: 500, sellerFinance: true, creativeFinance: true, tags: ['Seller Finance', 'RV Parks'], status: 'Hot', strengthScore: 92, createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
    { id: 'B4', name: 'Shella Sylla', email: 'shella@1stclassrealtyservices.com', phone: '(205) 555-3319', company: '1st Class Realty', type: 'Wholesaler', markets: ['AL'], assetTypes: ['Multifamily'], budgetMin: 400000, budgetMax: 2500000, unitMin: 8, unitMax: 120, sellerFinance: true, creativeFinance: true, tags: ['Birmingham', 'Value-Add'], status: 'Active', strengthScore: 71, createdAt: new Date(Date.now() - 86400000 * 22).toISOString() },
    { id: 'B5', name: 'Hisham Ragab', email: 'hishamragab1994@gmail.com', phone: '', company: '', type: 'Creative Buyer', markets: ['Any'], assetTypes: ['SFH', 'Multifamily', 'MHP', 'Land'], budgetMin: 0, budgetMax: 5000000, sellerFinance: true, creativeFinance: true, tags: ['Assumable', 'Seller Carry'], status: 'Hot', strengthScore: 85, createdAt: new Date(Date.now() - 86400000 * 31).toISOString() },
    { id: 'B6', name: 'Frankie Carra', email: 'Frankie.carra@homevestors.com', phone: '(205) 555-6677', company: 'HomeVestors', type: 'Cash Buyer', markets: ['AL'], assetTypes: ['SFH'], budgetMin: 45000, budgetMax: 300000, sellerFinance: false, creativeFinance: false, tags: ['Cash', 'Quick Close'], status: 'Active', strengthScore: 64, createdAt: new Date(Date.now() - 86400000 * 6).toISOString() },
    { id: 'B7', name: 'Kad F', email: 'kadfavorite@gmail.com', phone: '(412) 555-0098', company: '', type: 'Cash Buyer', markets: ['PA'], assetTypes: ['SFH'], budgetMin: 60000, budgetMax: 175000, sellerFinance: false, creativeFinance: false, tags: ['Pittsburgh', 'Flips'], status: 'Active', strengthScore: 58, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: 'B8', name: 'Karen Vazquez', email: 'ktanzola@aol.com', phone: '(813) 555-5544', company: '', type: 'Creative Buyer', markets: ['FL'], assetTypes: ['SFH'], budgetMin: 80000, budgetMax: 250000, sellerFinance: true, creativeFinance: true, tags: ['Light Cosmetic', 'Owner Finance'], status: 'New', strengthScore: 69, createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
    { id: 'B9', name: 'Patrick Gritz', email: 'patrickgritz@gmail.com', phone: '(305) 555-1212', company: '', type: 'Cash Buyer', markets: ['FL'], assetTypes: ['SFH', 'Land'], budgetMin: 120000, budgetMax: 1000000, sellerFinance: false, creativeFinance: false, tags: ['South FL', 'Cash'], status: 'Hot', strengthScore: 77, createdAt: new Date(Date.now() - 86400000 * 15).toISOString() },
    { id: 'B10', name: 'Shay - Levi Home Buyers', email: 'info@levihomebuyers.com', phone: '(205) 555-7788', company: 'Levi Home Buyers', type: 'Wholesaler', markets: ['AL'], assetTypes: ['SFH'], budgetMin: 40000, budgetMax: 150000, sellerFinance: false, creativeFinance: false, tags: [], status: 'Active', strengthScore: 52, createdAt: new Date(Date.now() - 86400000 * 41).toISOString() },
    { id: 'B11', name: 'Masha C', email: 'masha.cikota@outlook.com', phone: '', company: '', type: 'Cash Buyer', markets: ['AL'], assetTypes: ['SFH'], budgetMin: 70000, budgetMax: 150000, sellerFinance: false, creativeFinance: false, tags: ['Birmingham', 'Cosmetic Rehab'], status: 'Active', strengthScore: 61, createdAt: new Date(Date.now() - 86400000 * 8).toISOString() },
    { id: 'B12', name: 'Jessica Everly', email: 'jeverly@everlyenterprisesinc.com', phone: '(813) 555-9900', company: 'Everly Enterprises', type: 'Creative Buyer', markets: ['Any'], assetTypes: ['SFH', 'Multifamily'], budgetMin: 0, budgetMax: 800000, sellerFinance: true, creativeFinance: true, tags: ['Seller Carry', 'Structured'], status: 'Active', strengthScore: 74, createdAt: new Date(Date.now() - 86400000 * 19).toISOString() },
    { id: 'B13', name: 'Marie Maah', email: 'tiliana2014@gmail.com', phone: '', company: '', type: 'Hedge Fund', markets: ['Any'], assetTypes: ['Multifamily', 'Hotel'], budgetMin: 8000000, budgetMax: 150000000, unitMin: 80, unitMax: 400, capRateMin: 7.5, sellerFinance: false, creativeFinance: false, tags: ['Large MF', 'Hotels'], status: 'Active', strengthScore: 81, createdAt: new Date(Date.now() - 86400000 * 55).toISOString() },
    { id: 'B14', name: 'Harvey Property Group', email: 'acquisitions@harveypropgroup.com', phone: '', company: 'Harvey Property Group', type: 'Cash Buyer', markets: ['AL', 'GA', 'TN', 'MS'], assetTypes: ['SFH', 'Multifamily'], budgetMin: 0, budgetMax: 1200000, unitMin: 1, unitMax: 8, sellerFinance: false, creativeFinance: false, tags: ['Multi-state', '1-4 Units'], status: 'Active', strengthScore: 66, createdAt: new Date(Date.now() - 86400000 * 27).toISOString() },
    { id: 'B15', name: 'Juan Ruiz', email: 'juanruiz.chisd@gmail.com', phone: '(817) 555-3344', company: '', type: 'Cash Buyer', markets: ['TX'], assetTypes: ['SFH'], budgetMin: 90000, budgetMax: 280000, sellerFinance: false, creativeFinance: false, tags: ['Arlington TX Only'], status: 'Active', strengthScore: 47, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: 'B16', name: 'Douglas Alderman', email: 'dwa961@gmail.com', phone: '', company: '', type: 'Hedge Fund', markets: ['TX'], assetTypes: ['Hotel'], budgetMin: 1500000, budgetMax: 18000000, sellerFinance: false, creativeFinance: false, tags: ['TX Hotels', 'Value-Add'], status: 'Active', strengthScore: 59, createdAt: new Date(Date.now() - 86400000 * 11).toISOString() },
    { id: 'B17', name: 'Luis Gonzales - Core Capital', email: 'info@corecapitalsolutions.com', phone: '', company: 'Core Capital Solutions', type: 'Lender', markets: ['Any'], assetTypes: ['SFH', 'Multifamily'], budgetMin: 0, budgetMax: 5000000, sellerFinance: true, creativeFinance: true, tags: ['Notes', '1st/2nd Position'], status: 'Active', strengthScore: 70, createdAt: new Date(Date.now() - 86400000 * 38).toISOString() },
    { id: 'B18', name: 'DES Group LLC', email: 'desgroupllc@yahoo.com', phone: '', company: 'DES Group', type: 'Creative Buyer', markets: ['Any'], assetTypes: ['SFH', 'Multifamily'], budgetMin: 0, budgetMax: 10000000, sellerFinance: true, creativeFinance: true, tags: ['Assumable Notes'], status: 'Active', strengthScore: 68, createdAt: new Date(Date.now() - 86400000 * 14).toISOString() }
  ]
}

export function seedOffers(_deals: Deal[]): Record<string, Offer[]> {
  const offers: Record<string, Offer[]> = {}
  
  // Add some offers to D4R1X5 (MHP)
  offers['D4R1X5'] = [
    {
      id: 'O1', buyerId: 'B3', buyerName: 'Zakar BanaYahu', buyerEmail: 'juggernautcrowdsource@gmail.com',
      amount: 1190000, emd: 35000, financingType: 'Seller Finance + Cash', closingTimeline: '45 days',
      contingencies: 'Inspection 10 days', status: 'Reviewing', notes: 'Strong buyer, loves the park',
      createdAt: new Date(Date.now() - 86400000 * 1.5).toISOString(),
      history: [{ ts: new Date(Date.now() - 86400000 * 1.5).toISOString(), note: 'Offer recorded' }]
    },
    {
      id: 'O2', buyerId: 'B13', buyerName: 'Marie Maah', buyerEmail: 'tiliana2014@gmail.com',
      amount: 1320000, emd: 80000, financingType: 'All Cash', closingTimeline: '30 days',
      contingencies: 'None after inspection', status: 'New', notes: '',
      createdAt: new Date(Date.now() - 86400000 * 0.6).toISOString(),
      history: [{ ts: new Date(Date.now() - 86400000 * 0.6).toISOString(), note: 'Offer recorded' }]
    }
  ]
  
  // Offers on the Tampa mixed use
  offers['D2P7Q9'] = [
    {
      id: 'O3', buyerId: 'B5', buyerName: 'Hisham Ragab', buyerEmail: 'hishamragab1994@gmail.com',
      amount: 448000, emd: 20000, financingType: 'Seller Finance', closingTimeline: '60 days',
      contingencies: 'Standard', status: 'Countered', counterAmount: 462000,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      history: [
        { ts: new Date(Date.now() - 86400000 * 2).toISOString(), note: 'Offer recorded' },
        { ts: new Date(Date.now() - 86400000 * 1.2).toISOString(), note: 'Countered at $462k' }
      ]
    }
  ]
  
  return offers
}

export function seedActivities(_dealId: string): Activity[] {
  const base = new Date()
  return [
    { id: 'a1', timestamp: new Date(base.getTime() - 3600000 * 4).toISOString(), type: 'Submission Created', description: 'Deal submitted via portal', user: 'System' },
    { id: 'a2', timestamp: new Date(base.getTime() - 3600000 * 2).toISOString(), type: 'Deal Approved', description: 'Approved and moved to Inventory Hub', user: 'Alex Rivera' },
    { id: 'a3', timestamp: new Date(base.getTime() - 3600000 * 1).toISOString(), type: 'Buyer Matched', description: '12 qualified buyer matches found (avg 67%)', user: 'System' },
  ]
}

export function generateExecutiveSummary(deal: Deal): string {
  const issues: string[] = []
  const strengths: string[] = []
  const next: string[] = []
  
  const p = deal.pricing
  const d = deal.debt
  
  if (!p.arv || p.arv < (p.askingPrice || 0) * 1.4) issues.push('ARV spread is tight for a clean flip')
  if (d.isFreeClear === false && (d.mortgageBalance || 0) > (p.contractPrice || 0) * 0.7) issues.push('High leverage on contract price')
  if (deal.condition.roof === 'Poor' || deal.condition.hvac === 'Poor') issues.push('Major systems need attention (roof/HVAC)')
  
  if (p.sellerFinance) strengths.push('Seller finance terms create creative buyer appeal')
  if ((p.noi || 0) > 80000) strengths.push('Strong cash flow profile for hold investors')
  if (deal.property.type === 'MHP' || deal.property.type === 'Multifamily') strengths.push('Scalable asset class with institutional interest')
  
  if (deal.docs.length < 3) next.push('Collect rent roll, T12, and recent photos before blasting')
  next.push('Run fresh buyer match and launch targeted blast to top 8-10')
  if (deal.status === 'Submitted') next.push('Complete review and move to Approved')
  
  return `STRENGTHS: ${strengths.length ? strengths.join('. ') : 'Solid fundamentals with motivated seller.'}\n\nRISKS / GAPS: ${issues.length ? issues.join('. ') : 'Standard wholesale risks. Verify title and access.'}\n\nRECOMMENDED NEXT: ${next.join(' • ')}`
}


