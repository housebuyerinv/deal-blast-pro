
﻿import { Deal, Buyer } from './types'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

const safeArray = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,|;]/).map(v => v.trim()).filter(Boolean);
  return [];
};

const buyerStrategyValues = (buyer: any): string[] => {
  const values = [
    ...safeArray(buyer?.strategies),
    ...safeArray(buyer?.strategy),
    ...safeArray(buyer?.exitStrategy),
    ...safeArray(buyer?.investmentStrategy),
    ...safeArray(buyer?.data?.strategies),
    ...safeArray(buyer?.data?.strategy),
    ...safeArray(buyer?.data?.exitStrategy),
  ]

  return Array.from(new Set(values.map(v => safeLower(v).replace(/[^a-z0-9]+/g, '')).filter(Boolean)))
}

const dealStrategyAliases = (deal: Deal): string[] => {
  const text = safeLower([
    deal.property?.strategy,
    deal.property?.description,
    deal.property?.type,
    deal.pricing?.sellerFinance ? 'seller finance creative finance' : '',
  ].filter(Boolean).join(' '))

  const aliases: string[] = []
  if (/fix\s*(?:&|and)?\s*flip|fix.?n.?flip|(?:house|property|real estate|sfh|sfr)\s+flipping?|\bflipper\b/.test(text)) aliases.push('fixflip', 'fixandflip')
  if (/brrrr|brrr/.test(text)) aliases.push('brrrr', 'brrr')
  if (/buy\s*(?:&|and)?\s*hold/.test(text)) aliases.push('buyhold', 'buyandhold')
  if (/section\s*8/.test(text)) aliases.push('section8')
  if (/long[\s-]?term rental|\bltr\b/.test(text)) aliases.push('longtermrental')
  if (/short[\s-]?term rental|\bstr\b|airbnb|vrbo/.test(text)) aliases.push('shorttermrental')
  if (/wholesale|assign/.test(text)) aliases.push('wholesale')
  if (/seller finance|owner finance/.test(text)) aliases.push('sellerfinance')
  if (/creative/.test(text)) aliases.push('creativefinance')
  if (/subject[\s-]?to|subto|sub[\s-]?to/.test(text)) aliases.push('subjectto')
  if (/dscr/.test(text)) aliases.push('dscrrental')
  if (/development|builder?|build/.test(text)) aliases.push('development')
  if (/\bjv\b|joint venture/.test(text)) aliases.push('jv')
  if (/novation/.test(text)) aliases.push('novation')
  if (/wrap/.test(text)) aliases.push('wrap')
  if (/lease option|rent to own|rto/.test(text)) aliases.push('leaseoption')

  return Array.from(new Set(aliases))
}


interface ScoreBreakdown {
  score: number
  reasons: string[]
  missing: string[]
}

export function computeMatchScore(deal: Deal, buyer: Buyer, weights: any): ScoreBreakdown {
  let score = 0
  const reasons: string[] = []
  const missing: string[] = []
  
  const d = deal.property
  const p = deal.pricing
  const asking = p.askingPrice || p.contractPrice || 0
  
  // State / Market
  const stateMatch = safeArray(buyer.markets).some(m => 
    safeLower(m) === safeLower(d.state) || 
    safeLower(m) === 'nationwide' || 
    safeLower(m) === 'any'
  )
  if (stateMatch) {
    score += weights.state
    reasons.push(`Location/market match (+${weights.state})`)
  } else {
    missing.push('State/market')
  }
  
  // City
  const cityMatch = safeArray(buyer.cities).some(c => safeLower(c) === safeLower(d.city))
  if (cityMatch) {
    score += weights.city
    reasons.push(`City match (+${weights.city})`)
  }
  
  // Asset type
  const assetMatch = safeArray(buyer.assetTypes).includes(d.type)
  if (assetMatch) {
    score += weights.assetType
    reasons.push(`Asset type match (+${weights.assetType})`)
  } else if (safeArray(buyer.assetTypes).length === 0) {
    // broad buyer
    score += Math.floor(weights.assetType * 0.6)
    reasons.push(`Broad asset tolerance (+${Math.floor(weights.assetType * 0.6)})`)
  } else {
    missing.push('Asset type')
  }
  
  // Budget overlap
  if (asking > 0 && buyer.budgetMin != null && buyer.budgetMax != null) {
    const within = asking >= buyer.budgetMin && asking <= buyer.budgetMax
    const near = Math.abs(asking - (buyer.budgetMax || asking)) / (buyer.budgetMax || asking) < 0.25
    if (within || near) {
      score += weights.budget
      reasons.push(`Budget fit / near budget (+${weights.budget})`)
    } else {
      missing.push('Budget fit')
    }
  } else if (buyer.budgetMax && asking > buyer.budgetMax * 1.3) {
    missing.push('Budget (too high)')
  }
  
  // Units
  const units = d.units || 1
  if (buyer.unitMin != null && buyer.unitMax != null) {
    if (units >= buyer.unitMin && units <= buyer.unitMax) {
      score += weights.units
      reasons.push(`Unit count in range (+${weights.units})`)
    }
  }
  
  // Cap rate
  if (p.capRate != null && buyer.capRateMin != null) {
    if (p.capRate >= buyer.capRateMin) {
      score += weights.capRate
      reasons.push(`Cap rate meets requirement (+${weights.capRate})`)
    } else {
      missing.push('Cap rate')
    }
  }
  
  // Seller finance
  const buyerStrategies = buyerStrategyValues(buyer)
  const dealStrategies = dealStrategyAliases(deal)
  const strategyOverlap = dealStrategies.filter(strategy => buyerStrategies.includes(strategy))

  if (strategyOverlap.length) {
    score += Math.max(4, Math.floor((weights.tags || 8) * 0.75))
    reasons.push(`Exit strategy match (+${Math.max(4, Math.floor((weights.tags || 8) * 0.75))})`)
  }

  if (p.sellerFinance && (buyer.sellerFinance || buyerStrategies.includes('sellerfinance'))) {
    score += weights.sellerFinance
    reasons.push(`Seller finance match (+${weights.sellerFinance})`)
  } else if (p.sellerFinance && !buyer.sellerFinance && !buyerStrategies.includes('sellerfinance')) {
    // still possible but lower
    score += 3
  }
  
  // Creative
  if (buyer.creativeFinance || buyerStrategies.some(strategy => ['creativefinance', 'subjectto', 'wrap', 'leaseoption', 'novation', 'sellerfinance'].includes(strategy))) {
    score += weights.creative
    reasons.push(`Creative finance buyer (+${weights.creative})`)
  }
  
  // Rehab tolerance (very rough heuristic)
  const rehab = p.rehab || 0
  if (buyer.rehabTolerance && rehab > 0) {
    const tol = safeLower(buyer.rehabTolerance)
    if ((tol.includes('heavy') && rehab > 40000) || (tol.includes('light') && rehab < 35000)) {
      score += weights.rehab
      reasons.push(`Rehab tolerance alignment (+${weights.rehab})`)
    }
  }
  
  // Tags bonus
  const dealTags = [d.type, p.sellerFinance ? 'creative' : ''].filter(Boolean).map(t => safeLower(t))
  const overlap = safeArray(buyer.tags).filter(t => dealTags.some(dt => dt.includes(safeLower(t)) || safeLower(t).includes(dt)))
  if (overlap.length) {
    score += weights.tags
    reasons.push(`Tag synergy: ${overlap.join(', ')} (+${weights.tags})`)
  }
  
  // Nationwide bonus
  const isNationwide = safeArray(buyer.markets).some(m => ['nationwide', 'any', 'all'].includes(safeLower(m)))
  if (isNationwide) {
    score += 6
    reasons.push('Nationwide buyer (+6)')
  }
  
  // Clamp
  const final = Math.max(0, Math.min(100, Math.round(score)))
  
  return { score: final, reasons: reasons.length ? reasons : ['Baseline profile match'], missing }
}

export function getTier(score: number): 'Strong Match' | 'Possible Match' | 'Weak Match' {
  if (score >= 70) return 'Strong Match'
  if (score >= 45) return 'Possible Match'
  return 'Weak Match'
}

export function getCreativeOnly(deal: Deal): boolean {
  return !!deal.pricing.sellerFinance || safeLower(deal.property.strategy).includes('seller') || safeLower(deal.property.strategy).includes('creative')
}
