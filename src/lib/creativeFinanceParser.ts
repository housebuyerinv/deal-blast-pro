export type CreativeFinanceDetails = {
  sellerFinanceAccepted?: boolean
  creativeFinanceAccepted?: boolean
  subjectToAccepted?: boolean
  assumableAccepted?: boolean
  leaseOptionAccepted?: boolean
  wrapAccepted?: boolean
  sellerCarryAccepted?: boolean
  dscrAccepted?: boolean
  maximumDownPayment?: number
  maximumDownPaymentPercent?: number
  minimumDownPayment?: number
  minimumDownPaymentPercent?: number
  maximumMonthlyPayment?: number
  minimumMonthlyPayment?: number
  maximumInterestRate?: number
  preferredInterestRate?: number
  balloonTermMonths?: number
  balloonTermYears?: number
  amortizationMonths?: number
  amortizationYears?: number
  maximumPurchasePrice?: number
  cashPurchaseMaximum?: number
  creativePurchaseMaximum?: number
  pitiIncluded?: boolean
  existingMortgageAccepted?: boolean
  mortgageRateMaximum?: number
  equityRequirement?: string
  occupancyRequirement?: string
  creativeStructure?: string
  creativeFinanceNotes?: string
}

const SOURCE_KEYS = [
  'criteria',
  'buyerCriteria',
  'Buyer Criteria',
  'notes',
  'Notes',
  'buyBox',
  'buy_box',
  'Buy Box',
  'buyBoxSummary',
  'requirements',
  'description',
  'comments',
  'creativeStructure',
  'creative_structure',
  'sellerFinance',
  'seller_finance',
  'creativeFinance',
  'creative_finance',
  'sellerFinanceNotes',
  'creativeFinanceNotes',
  'strategy',
  'strategies',
  'exitStrategy',
  'investmentStrategy',
  'rawText',
] as const

const moneyToNumber = (value: string): number | undefined => {
  const match = String(value || '').match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/)
  if (!match) return undefined
  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return undefined
  const suffix = (match[2] || '').toLowerCase()
  if (suffix === 'm') return Math.round(base * 1000000)
  if (suffix === 'k') return Math.round(base * 1000)
  return Math.round(base)
}

const compactText = (value: string) =>
  String(value || '')
    .replace(/[–—]/g, '-')
    .replace(/â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

export const buildCreativeFinanceSourceText = (source: any): string => {
  if (typeof source === 'string') return compactText(source)
  if (!source || typeof source !== 'object') return ''

  const chunks: string[] = []
  SOURCE_KEYS.forEach(key => {
    const value = source[key]
    if (value === undefined || value === null || typeof value === 'boolean') return
    if (Array.isArray(value)) {
      const joined = value.map(item => String(item || '').trim()).filter(Boolean).join(', ')
      if (joined) chunks.push(joined)
      return
    }
    const text = String(value).trim()
    if (text) chunks.push(text)
  })

  return compactText(Array.from(new Set(chunks)).join(' | '))
}

const addStructure = (structures: string[], value: string) => {
  if (!structures.includes(value)) structures.push(value)
}

const sentenceNotes = (raw: string) => {
  const keywords = /seller financ|seller carry|owner financ|creative|structured|subject[ -]?to|subto|assumable|wrap|lease option|dscr|hybrid|money down|down payment|\bdown\b|monthly payment|paid monthly|balloon|amort|interest|mortgage rate|piti|existing mortgage|all cash|cash accepted/i
  const pieces = raw
    .split(/(?:\s*[.;]\s*|\s+\|\s+|\n+)/)
    .map(piece => piece.trim())
    .filter(Boolean)
    .filter(piece => keywords.test(piece))

  return Array.from(new Set(pieces)).join('; ')
}

export const parseCreativeFinanceDetails = (source: any): CreativeFinanceDetails => {
  const raw = buildCreativeFinanceSourceText(source)
  const lower = raw.toLowerCase()
  const details: CreativeFinanceDetails = {}
  const structures: string[] = []

  if (!raw) return details

  if (/seller\s*financ(?:e|ing)|seller\s*carry/.test(lower)) {
    details.sellerFinanceAccepted = true
    details.creativeFinanceAccepted = true
    addStructure(structures, 'Seller Finance')
  }
  if (/owner\s*financ(?:e|ing)/.test(lower)) {
    details.sellerFinanceAccepted = true
    details.creativeFinanceAccepted = true
    addStructure(structures, 'Owner Financing')
  }
  if (/seller\s*carry/.test(lower)) {
    details.sellerCarryAccepted = true
    addStructure(structures, 'Seller Carry')
  }
  if (/creative\s*(?:finance|financing|terms)|structured\s*deals?|creative\s*terms?/.test(lower)) {
    details.creativeFinanceAccepted = true
    addStructure(structures, 'Creative Finance')
  }
  if (/subject[ -]?to|subto|sub-to/.test(lower)) {
    details.subjectToAccepted = true
    details.creativeFinanceAccepted = true
    details.existingMortgageAccepted = true
    addStructure(structures, 'Subject To')
  }
  if (/assumable/.test(lower)) {
    details.assumableAccepted = true
    details.existingMortgageAccepted = true
    addStructure(structures, 'Assumable')
  }
  if (/\bwrap(?:around)?\b/.test(lower)) {
    details.wrapAccepted = true
    details.creativeFinanceAccepted = true
    addStructure(structures, 'Wrap')
  }
  if (/lease\s*option/.test(lower)) {
    details.leaseOptionAccepted = true
    details.creativeFinanceAccepted = true
    addStructure(structures, 'Lease Option')
  }
  if (/\bdscr\b/.test(lower)) {
    details.dscrAccepted = true
    addStructure(structures, 'DSCR')
  }
  if (/\bhybrid\b/.test(lower)) addStructure(structures, 'Hybrid')

  if (/\ball\s*cash\b|\bcash accepted\b|will buy all cash/.test(lower)) {
    addStructure(structures, 'Cash Accepted')
  }

  const downRange = raw.match(/(\d+(?:\.\d+)?)\s*%\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*%\s*(?:down|down payment|dp)/i)
  if (downRange) {
    details.minimumDownPaymentPercent = Number(downRange[1])
    details.maximumDownPaymentPercent = Number(downRange[2])
  } else {
    const downPercent = raw.match(/(?:less than|under|below|max(?:imum)?|up to|no more than)\s*(\d+(?:\.\d+)?)\s*%\s*(?:down|down payment|dp)/i)
    if (downPercent) details.maximumDownPaymentPercent = Number(downPercent[1])
  }

  if (/no money down|zero down|(?:^|[^\d])0\s*%\s*down/.test(lower)) {
    details.maximumDownPayment = 0
    details.maximumDownPaymentPercent = 0
  }
  if (/low money down/.test(lower)) details.equityRequirement = 'Low money down'

  const downMoney = raw.match(/(?:approximately|approx\.?|about|around|up to|max(?:imum)?|less than|under)?\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)\s*(?:down|down payment|dp)/i)
    || raw.match(/(?:down payment|down|dp)\s*(?:of|:|-)?\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)/i)
  if (downMoney) {
    const value = moneyToNumber(downMoney[1])
    if (value !== undefined) details.maximumDownPayment = value
  }

  const monthlyPayment = raw.match(/(?:up to|max(?:imum)?|less than|under)?\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)\s*(?:monthly payment|per month|\/mo|\/mth|monthly|mo\b|mth\b)/i)
    || raw.match(/(?:monthly payment|monthly budget|payment)\s*(?:of|:|-)?\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)/i)
  if (monthlyPayment) {
    const value = moneyToNumber(monthlyPayment[1])
    if (value !== undefined) details.maximumMonthlyPayment = value
  }

  const interest = raw.match(/(?:interest|interest rate|rate)\s*(?:under|below|less than|max(?:imum)?|up to|:|-)?\s*(\d+(?:\.\d+)?)\s*%/i)
  if (interest) details.maximumInterestRate = Number(interest[1])

  const preferredInterest = raw.match(/(?:preferred interest|preferred rate|target rate)\s*(?:of|:|-)?\s*(\d+(?:\.\d+)?)\s*%/i)
  if (preferredInterest) details.preferredInterestRate = Number(preferredInterest[1])

  const mortgageRate = raw.match(/(?:existing mortgage rate|mortgage rate)\s*(?:under|below|less than|max(?:imum)?|up to|:|-)?\s*(\d+(?:\.\d+)?)\s*%/i)
  if (mortgageRate) {
    details.existingMortgageAccepted = true
    details.mortgageRateMaximum = Number(mortgageRate[1])
  }

  const balloonYears = raw.match(/(?:balloon\s*(?:in|after)?\s*|)(\d+(?:\.\d+)?)\s*(?:year|yr|yrs|years)\s*(?:balloon)?/i)
  const balloonMonths = raw.match(/(?:balloon\s*(?:in|after)?\s*|)(\d+(?:\.\d+)?)\s*(?:month|mo|mos|months)\s*(?:balloon)?/i)
  if (/balloon/i.test(raw)) {
    if (balloonYears) {
      details.balloonTermYears = Number(balloonYears[1])
      details.balloonTermMonths = Math.round(Number(balloonYears[1]) * 12)
    } else if (balloonMonths) {
      details.balloonTermMonths = Math.round(Number(balloonMonths[1]))
      details.balloonTermYears = Number((Number(balloonMonths[1]) / 12).toFixed(2))
    }
  }

  const amortYears = raw.match(/(\d+(?:\.\d+)?)\s*(?:-| )?\s*(?:year|yr|yrs|years)[ -]*amort(?:ization)?/i)
    || raw.match(/amort(?:ization)?\s*(?:over|:|-)?\s*(\d+(?:\.\d+)?)\s*(?:year|yr|yrs|years)/i)
  if (amortYears) {
    details.amortizationYears = Number(amortYears[1])
    details.amortizationMonths = Math.round(Number(amortYears[1]) * 12)
  }

  if (/piti\s*included|includes?\s*piti/.test(lower)) details.pitiIncluded = true
  if (/existing mortgage|subject[ -]?to existing mortgage/.test(lower)) details.existingMortgageAccepted = true

  const purchaseMax = raw.match(/(?:up to|max(?:imum)?|under|less than)\s*(\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?)(?:\s*(?:purchase|price|notes?|assumable))?/i)
  if (purchaseMax && !/down|monthly|payment/i.test(purchaseMax[0])) {
    const value = moneyToNumber(purchaseMax[1])
    if (value !== undefined) {
      details.maximumPurchasePrice = value
      if (details.assumableAccepted || details.creativeFinanceAccepted || details.sellerFinanceAccepted) {
        details.creativePurchaseMaximum = value
      }
    }
  }

  if (structures.length) details.creativeStructure = structures.join('; ')

  const notes = sentenceNotes(raw)
  if (notes) details.creativeFinanceNotes = notes

  return details
}

export const hasCreativeFinanceDetails = (details: any): boolean => {
  if (!details || typeof details !== 'object') return false
  return Object.entries(details).some(([key, value]) => {
    if (key === 'creativeFinanceNotes') return String(value || '').trim().length > 0
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value)
    if (Array.isArray(value)) return value.length > 0
    return String(value ?? '').trim().length > 0
  })
}

export const cloneCreativeFinanceDetails = (details: CreativeFinanceDetails): CreativeFinanceDetails => ({
  ...details,
})

export const formatCreativeFinanceAmount = (value: any): string => {
  if (value === undefined || value === null || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export const formatCreativeFinancePercent = (value: any): string => {
  if (value === undefined || value === null || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return `${number}%`
}

export const mergeCreativeFinanceDetails = (...sources: any[]): CreativeFinanceDetails => {
  const merged: CreativeFinanceDetails = {}
  sources.forEach(source => {
    if (!source || typeof source !== 'object') return
    Object.entries(source).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      ;(merged as any)[key] = value
    })
  })
  return merged
}
