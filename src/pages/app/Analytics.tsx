
import { useAppStore } from '../../store/useAppStore'
import { useState, useEffect } from 'react'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

export default function Analytics() {
  const { deals, buyers, blastLogs, followUps, buyerResponses, offers, getBuyerHeatScore, getDealQualityScore } = useAppStore()

  // Live date/time with weekday (for page header)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const [selectedKPI, setSelectedKPI] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerData, setDrawerData] = useState<any>(null)

  // New compact controls for added analytics (Buyer Coverage + Income History)
  const [coverageMode, setCoverageMode] = useState<'state' | 'asset'>('state')
  const [coverageSearch, setCoverageSearch] = useState('')
  const [selectedCoveragePreview, setSelectedCoveragePreview] = useState<{mode: 'state'|'asset', key: string, count: number, top: any[]} | null>(null)
  const [incomePeriod, setIncomePeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [incomeYear, setIncomeYear] = useState<number>(new Date().getFullYear())
  const [incomeMonth, setIncomeMonth] = useState<number | null>(null)
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear())
  const [taxPeriod, setTaxPeriod] = useState<'monthly'|'quarterly'|'yearly'>('yearly')
  const [taxMonth, setTaxMonth] = useState<number | null>(null)

  // Basic performance guard - avoid heavy work on empty data (after all hooks)
  if (deals.length === 0) {
    return (
      <div className="empty-state card p-8">
        <div>No data loaded yet.</div>
        <button onClick={() => useAppStore.getState().runSampleWorkflow()} className="btn btn-green mt-4">
          Generate Demo Data
        </button>
      </div>
    )
  }

  const currentYear = new Date().getFullYear()

  const activeAnalyticsDeals = deals.filter((d: any) => d.status !== 'Dead')
  const totalDeals = activeAnalyticsDeals.length
  const activeDeals = activeAnalyticsDeals.filter((d: any) => ['Approved', 'Active', 'Blasted', 'Offers Received', 'Under Contract', 'Closing'].includes(d.status)).length
  const blastedDeals = activeAnalyticsDeals.filter((d: any) => d.status === 'Blasted' || d.status === 'Offers Received').length

  const totalBuyers = buyers.length
  const hotBuyers = buyers.filter(b => b.status === 'Hot').length

  const totalBlasts = Object.values(blastLogs).flat().length
  const totalRecipients = Object.values(blastLogs).flat().reduce((sum, log) => sum + (log.recipientCount || 0), 0)

  // Buyer response analytics - REAL DATA ONLY
  // Scope: all recorded deal blasts and buyer responses stored in the app.
  // Nothing here is calculated from total buyer count unless those buyers were actually blasted/responded.
  const allOffers: any[] = Object.values(offers || {}).flat() as any[]
  const responseRecords: any[] = Object.values(buyerResponses || {}).flatMap((dealMap: any) => Object.values(dealMap || {})) as any[]

  const explicitInterested = responseRecords.filter((r: any) => r?.status === 'Interested').length
  const explicitMadeOffer = responseRecords.filter((r: any) => r?.status === 'Made Offer').length
  const explicitPassed = responseRecords.filter((r: any) => r?.status === 'Passed').length
  const explicitNoResponse = responseRecords.filter((r: any) => r?.status === 'No Response').length
  const needsMoreInfo = responseRecords.filter((r: any) => r?.status === 'Needs More Info').length
  const ndaRequested = responseRecords.filter((r: any) => r?.status === 'NDA Requested').length
  const bioSent = responseRecords.filter((r: any) => r?.status === 'BIO Sent').length

  const actualResponses = explicitInterested + explicitMadeOffer + explicitPassed + needsMoreInfo + ndaRequested + bioSent
  const totalRecordedResponses = responseRecords.length
  const actualOffersCount = Math.max(explicitMadeOffer, allOffers.length)
  const noResponse = totalRecipients > 0
    ? Math.max(explicitNoResponse, totalRecipients - actualResponses)
    : explicitNoResponse

  const interested = explicitInterested
  const madeOffer = actualOffersCount
  const passed = explicitPassed
  const responseDenominator = totalRecipients > 0 ? totalRecipients : totalRecordedResponses
  const responseRate = responseDenominator > 0 ? Math.round((actualResponses / responseDenominator) * 100) : 0
  const offerConversion = actualResponses > 0 ? Math.round((actualOffersCount / actualResponses) * 100) : 0
  const responseScopeLabel = totalRecipients > 0
    ? `All blasts • ${totalRecipients} recipients`
    : 'No blast activity recorded yet'

  const hasResponseAnalyticsData = totalBlasts > 0 || totalRecordedResponses > 0 || allOffers.length > 0

  const resetDemoResponseAnalytics = () => {
    const ok = window.confirm(
      'Reset demo buyer response analytics? This clears saved blast logs, buyer responses, and offer records from this local app state. Buyers and deals will stay untouched.'
    )
    if (!ok) return

    useAppStore.setState({
      blastLogs: {},
      buyerResponses: {},
      offers: {},
    })

    setSelectedKPI(null)
    setDrawerOpen(false)
    setDrawerData(null)
  }

  const avgMatchScore = Math.round(
    activeAnalyticsDeals.reduce((sum: number, d: any) => {
      const matches = useAppStore.getState().getMatchesForDeal(d.id)
      return sum + (matches.length > 0 ? matches.reduce((s: number, m: any) => s + m.score, 0) / matches.length : 0)
    }, 0) / Math.max(1, activeAnalyticsDeals.length)
  )

  const overdueFollowups = followUps.filter(f => !f.completed && new Date(f.dueDate) <= new Date()).length

  // ========== SAFE DATA HELPERS (real data only, no fakes, optional chaining, no NaN) ==========
  const getAssignmentFee = (d: any): number => {
    const v = Number(d?.pricing?.assignmentFee)
    return isFinite(v) && v > 0 ? v : 0
  }
  const getCommission = (d: any): number => {
    const v = Number(d?.closing?.commissionPaid) || Number(d?.closing?.commissionExpected)
    return isFinite(v) && v > 0 ? v : 0
  }
  const getBuyerPrice = (d: any): number => {
    const v = Number(d?.pricing?.buyerPrice)
    return isFinite(v) && v > 0 ? v : 0
  }
  const getContractPrice = (d: any): number => {
    const v = Number(d?.pricing?.contractPrice)
    return isFinite(v) && v > 0 ? v : 0
  }
  const getNetIncome = (d: any): number => {
    // Net = assignment + commission + double-close spread if buyerPrice present (real fields only)
    const assign = getAssignmentFee(d)
    const comm = getCommission(d)
    const dbl = getBuyerPrice(d) > 0 ? Math.max(0, getBuyerPrice(d) - getContractPrice(d)) : 0
    return assign + comm + dbl
  }
  const getGrossForDeal = (d: any): number => getAssignmentFee(d) || getCommission(d)
  const getCloseDateStr = (d: any): string => {
    if (d?.closing?.closingDate) return d.closing.closingDate
    return d?.updatedAt || d?.createdAt || ''
  }
  const safeStr = (v: any, fallback = '—'): string => (v == null || v === '' ? fallback : String(v))
  const safeNum = (v: any): number => (isFinite(Number(v)) ? Number(v) : 0)

  const formatMoneyCompact = (n: number): string => {
    const val = safeNum(n)
    if (!val) return '$0'
    const abs = Math.abs(val)
    if (abs >= 1000000) return '$' + (abs / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M'
    if (abs >= 10000) return '$' + Math.round(abs / 1000) + 'K'
    if (abs >= 1000) return '$' + Math.round(abs / 1000) + 'K'
    return '$' + Math.round(abs).toLocaleString()
  }
  const formatMoneyFull = (n: number): string => {
    const val = safeNum(n)
    if (!val) return '$0'
    return '$' + Math.round(val).toLocaleString()
  }
  const formatDateSafe = (iso: string): string => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString() } catch { return '—' }
  }

  // ========== CLOSED DEALS + ALL INCOME/PERFORMANCE METRICS (real only) ==========
  const closedDeals = deals.filter((d: any) =>
    d.status === 'Sold' || !!(d.closing && d.closing.closingDate)
  ).sort((a: any, b: any) => {
    const ta = new Date(getCloseDateStr(a)).getTime() || 0
    const tb = new Date(getCloseDateStr(b)).getTime() || 0
    return tb - ta
  })

  const dealsReceived = totalDeals // live/non-dead intake only; rejected/dead deals are excluded from Analytics KPIs
  const dealsClosedCount = closedDeals.length
  const closeRate = dealsReceived > 0 ? Math.round((dealsClosedCount / dealsReceived) * 100) : 0

  // Closed with net for calcs (safe)
  const closedWithNet = closedDeals.map((d: any) => {
    const net = getNetIncome(d)
    let ts = 0
    try { ts = new Date(getCloseDateStr(d)).getTime() || 0 } catch {}
    return { d, net, ts }
  })

  const totalNetIncome = closedWithNet.reduce((s, c) => s + c.net, 0)

  // Period incomes (trailing / realized in window from close dates) — 0 if none
  const nowTs = Date.now()
  const dayMs = 86400000
  const dailyIncome = closedWithNet.filter(c => c.ts >= (nowTs - dayMs)).reduce((s, c) => s + c.net, 0)
  const weeklyIncome = closedWithNet.filter(c => c.ts >= (nowTs - 7 * dayMs)).reduce((s, c) => s + c.net, 0)
  const monthlyIncome = closedWithNet.filter(c => c.ts >= (nowTs - 30 * dayMs)).reduce((s, c) => s + c.net, 0)
  const annualIncome = closedWithNet.filter(c => c.ts >= (nowTs - 365 * dayMs)).reduce((s, c) => s + c.net, 0)

  // Averages (safe span)
  let avgPerMonth = 0
  let avgPerYear = 0
  if (dealsClosedCount > 0) {
    const times = closedWithNet.map(c => c.ts).filter(t => t > 0).sort((a,b)=>a-b)
    if (times.length > 0) {
      const spanMs = Math.max(dayMs * 30, times[times.length-1] - times[0])
      const months = Math.max(1, Math.round(spanMs / (dayMs * 30.44)))
      const years = Math.max(1, Math.round(spanMs / (dayMs * 365.25)))
      avgPerMonth = Math.round(totalNetIncome / months)
      avgPerYear = Math.round(totalNetIncome / years)
    } else {
      avgPerMonth = Math.round(totalNetIncome)
      avgPerYear = Math.round(totalNetIncome)
    }
  }

  const avgProfitPerClosed = dealsClosedCount > 0 ? Math.round(totalNetIncome / dealsClosedCount) : 0

  // Assignment / JV / Double (only from actual fields on closed)
  const assignmentFeesTotal = closedDeals.reduce((s, d) => s + getAssignmentFee(d), 0)
  const jvDeals = closedDeals.filter((d: any) =>
    (d.submitter?.role && String(d.submitter.role).toUpperCase().includes('JV')) ||
    (d.submitter?.jvStructure && String(d.submitter.jvStructure).length > 0)
  )
  const jvCommissionsTotal = jvDeals.reduce((s, d) => s + getCommission(d), 0)
  const doubleCloseProfitTotal = closedDeals.reduce((s, d) => {
    const bp = getBuyerPrice(d)
    return s + (bp > 0 ? Math.max(0, bp - getContractPrice(d)) : 0)
  }, 0)

  // Partners from closed submitters (real only)
  const partnerMap = new Map<string, number>()
  closedDeals.forEach((d: any) => {
    const nm = safeStr(d?.submitter?.name, 'Unknown Partner')
    partnerMap.set(nm, (partnerMap.get(nm) || 0) + 1)
  })
  const partnersClosedCount = partnerMap.size
  const topClosingPartnersArr = [...partnerMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  const topClosingPartners = topClosingPartnersArr.length
    ? topClosingPartnersArr.map(([n, c]) => `${n} (${c})`).join(', ')
    : '—'
  const displayTopPartners = topClosingPartnersArr.length === 0 ? '—' :
    topClosingPartnersArr.length === 1 ? topClosingPartnersArr[0][0] :
    'View top partners'

  // Best market / asset (by count of closed; tie -> first)
  const marketMap = new Map<string, number>()
  const assetMap = new Map<string, number>()
  closedDeals.forEach((d: any) => {
    const mkt = `${safeStr(d?.property?.city, '')}, ${safeStr(d?.property?.state, '')}`.replace(/^, |, $/, '').trim() || 'Unknown'
    marketMap.set(mkt, (marketMap.get(mkt) || 0) + 1)
    const ast = safeStr(d?.property?.type, 'Other')
    assetMap.set(ast, (assetMap.get(ast) || 0) + 1)
  })
  const bestMarket = marketMap.size ? [...marketMap.entries()].sort((a,b)=>b[1]-a[1])[0][0] : '—'
  const bestAsset = assetMap.size ? [...assetMap.entries()].sort((a,b)=>b[1]-a[1])[0][0] : '—'

  // Highest net + most recent (real closed only)
  let highestNetDeal: any = null
  let highestNetVal = 0
  closedWithNet.forEach(c => { if (c.net > highestNetVal) { highestNetVal = c.net; highestNetDeal = c.d } })
  const mostRecentClosed = closedDeals.length > 0 ? closedDeals[0] : null

  // ===== Buyer Coverage (real data from buyer profiles; compact + drawer) - only State + Asset Type (removed duplicative Market) =====
  const stateCounts = new Map<string, number>()
  const assetCounts = new Map<string, number>()
  buyers.forEach((b: any) => {
    const mkts: string[] = (b?.markets || []).map((m: string) => String(m).trim()).filter(Boolean)
    mkts.forEach((m: string) => {
      const up = m.toUpperCase()
      if (/^[A-Z]{2}$/.test(up)) {
        stateCounts.set(up, (stateCounts.get(up) || 0) + 1)
      } else if (up === 'ANY' || up.includes('NATION')) {
        stateCounts.set('ANY', (stateCounts.get('ANY') || 0) + 1)
      }
    })
    const asts: string[] = (b?.assetTypes || [])
    asts.forEach((a: string) => {
      assetCounts.set(a, (assetCounts.get(a) || 0) + 1)
    })
  })

  function getCoverageData(mode: 'state'|'asset', search: string) {
    let map: Map<string, number>
    if (mode === 'state') map = stateCounts
    else map = assetCounts
    let entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const q = search.trim().toLowerCase()
    if (q) entries = entries.filter(([k]) => safeLower(k).includes(q))
    return entries
  }

  const stateNameMap: Record<string, string> = { AL: 'Alabama', FL: 'Florida', GA: 'Georgia', TN: 'Tennessee', TX: 'Texas', PA: 'Pennsylvania', NC: 'North Carolina', SC: 'South Carolina', MS: 'Mississippi', OH: 'Ohio', 'ANY': 'Nationwide/Any' }
  function formatCoverageKey(k: string, mode: string) {
    if (mode === 'state') return stateNameMap[k] || k
    return k
  }

  // ===== YTD + Period Income buckets (real closed deal data only; $0 for gaps in display) =====
  const ytdClosedWithNet = closedWithNet.filter(c => {
    try { return new Date(c.ts || 0).getFullYear() === currentYear } catch { return false }
  })
  const ytdNetIncome = ytdClosedWithNet.reduce((s, c) => s + c.net, 0)
  const ytdGrossFees = ytdClosedWithNet.reduce((s, c) => s + getGrossForDeal(c.d), 0)
  const ytdAssignmentFees = ytdClosedWithNet.reduce((s, c) => s + getAssignmentFee(c.d), 0)
  const ytdJVComms = closedDeals.filter((d: any) => {
    try { return new Date(getCloseDateStr(d)).getFullYear() === currentYear } catch { return false }
  }).filter((d: any) => (d.submitter?.role && String(d.submitter.role).toUpperCase().includes('JV')) || (d.submitter?.jvStructure && String(d.submitter.jvStructure).length > 0))
    .reduce((s, d) => s + getCommission(d), 0)
  const ytdDoubleClose = ytdClosedWithNet.reduce((s, c) => {
    const bp = getBuyerPrice(c.d); return s + (bp > 0 ? Math.max(0, bp - getContractPrice(c.d)) : 0)
  }, 0)

  // Dynamic years from real closed data for dropdowns (no fakes)
  const availableYears = Array.from(new Set(
    closedWithNet.map((c: any) => {
      try { return new Date(c.ts || 0).getFullYear() } catch { return currentYear }
    })
  )).sort((a, b) => b - a)
  if (availableYears.length === 0) availableYears.push(currentYear)

  function getIncomePeriodList(period: 'monthly'|'quarterly'|'yearly', year: number = currentYear, month: number | null = null) {
    // Build buckets from real closed data only for the selected year (and month if monthly)
    const buckets = new Map<string, { sum: number; count: number; deals: any[] }>()
    closedWithNet.forEach(c => {
      if (!c.ts) return
      try {
        const d = new Date(c.ts)
        if (d.getFullYear() !== year) return
        if (period === 'monthly' && month !== null && d.getMonth() !== month) return
        let key = ''
        if (period === 'yearly') key = `${d.getFullYear()}`
        else if (period === 'quarterly') {
          const q = Math.floor(d.getMonth() / 3) + 1
          key = `${d.getFullYear()} Q${q}`
        } else {
          const mon = d.toLocaleString('default', { month: 'long' })
          key = `${mon} ${d.getFullYear()}`
        }
        if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, deals: [] })
        const b = buckets.get(key)!
        b.sum += c.net; b.count += 1; b.deals.push(c.d)
      } catch {}
    })
    // Generate slots for the selected YEAR using period (include $0 for missing months/quarters)
    const slots: any[] = []
    if (period === 'yearly') {
      const key = `${year}`
      const b = buckets.get(key) || { sum: 0, count: 0, deals: [] }
      slots.push({ label: key, sum: b.sum, count: b.count, deals: b.deals, year, period })
    } else if (period === 'quarterly') {
      for (let q = 1; q <= 4; q++) {
        const key = `${year} Q${q}`
        const b = buckets.get(key) || { sum: 0, count: 0, deals: [] }
        slots.push({ label: key, sum: b.sum, count: b.count, deals: b.deals, year, period })
      }
    } else {
      // monthly for the year
      for (let m = 0; m < 12; m++) {
        const dt = new Date(year, m, 1)
        const mon = dt.toLocaleString('default', { month: 'long' })
        const key = `${mon} ${year}`
        const b = buckets.get(key) || { sum: 0, count: 0, deals: [] }
        const isSel = month !== null && m === month
        slots.push({ label: key, sum: b.sum, count: b.count, deals: b.deals, year, period, month: m, isSelected: isSel })
      }
    }
    // YTD for the selected year (real data)
    const ytdForYear = closedWithNet.filter(c => {
      try { return new Date(c.ts || 0).getFullYear() === year } catch { return false }
    }).reduce((s, c) => s + c.net, 0)
    const ytdLabel = `${year} YTD`
    return { slots, ytdLabel, ytdSum: ytdForYear, year, period, month }
  }

  function getTaxFilteredData(year: number, period: 'monthly'|'quarterly'|'yearly', month: number | null) {
    const filtered = closedWithNet.filter((c: any) => {
      try {
        const d = new Date(c.ts || 0)
        if (d.getFullYear() !== year) return false
        if (period === 'monthly' && month !== null && d.getMonth() !== month) return false
        return true
      } catch { return false }
    })
    const net = filtered.reduce((s, c) => s + c.net, 0)
    const gross = filtered.reduce((s, c) => s + getGrossForDeal(c.d), 0)
    const assign = filtered.reduce((s, c) => s + getAssignmentFee(c.d), 0)
    const jvDealsF = filtered.map((c: any) => c.d).filter((d: any) => (d.submitter?.role && String(d.submitter.role).toUpperCase().includes('JV')) || (d.submitter?.jvStructure && String(d.submitter.jvStructure).length > 0))
    const jv = jvDealsF.reduce((s, d) => s + getCommission(d), 0)
    const dbl = filtered.reduce((s, c) => {
      const bp = getBuyerPrice(c.d); return s + (bp > 0 ? Math.max(0, bp - getContractPrice(c.d)) : 0)
    }, 0)
    const deals = filtered.map((c: any) => c.d)
    return { net, gross, assign, jv, dbl, deals, year, period, month }
  }

  // Full tax recordkeeping breakdowns (real closed data only, no fakes)
  function getIncomeBreakdowns(dealsList: any[]) {
    const byMonth = new Map<string, number>()
    const byPartner = new Map<string, number>()
    const bySource = new Map<string, number>()
    const byAsset = new Map<string, number>()
    const byMarket = new Map<string, number>()
    let jvPayouts = 0
    let hasJVData = false
    dealsList.forEach((d: any) => {
      const net = getNetIncome(d)
      try {
        const dt = new Date(getCloseDateStr(d) || Date.now())
        const monKey = dt.toLocaleString('default', { month: 'short' }) + ' ' + dt.getFullYear()
        byMonth.set(monKey, (byMonth.get(monKey) || 0) + net)
      } catch {}
      const partner = safeStr(d?.submitter?.name, 'Unknown')
      byPartner.set(partner, (byPartner.get(partner) || 0) + net)
      const src = safeStr(d?.submitter?.role || d?.source, '—')
      bySource.set(src, (bySource.get(src) || 0) + net)
      const ast = safeStr(d?.property?.type, 'Other')
      byAsset.set(ast, (byAsset.get(ast) || 0) + net)
      const mkt = safeStr(d?.property?.state, '—')
      byMarket.set(mkt, (byMarket.get(mkt) || 0) + net)
      const isJV = !!(d?.submitter?.jvStructure || (d?.submitter?.role && String(d.submitter.role).toUpperCase().includes('JV')))
      if (isJV) {
        hasJVData = true
        jvPayouts += getCommission(d)
      }
    })
    return {
      byMonth: [...byMonth.entries()].sort((a, b) => b[1] - a[1]),
      byPartner: [...byPartner.entries()].sort((a, b) => b[1] - a[1]),
      bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
      byAsset: [...byAsset.entries()].sort((a, b) => b[1] - a[1]),
      byMarket: [...byMarket.entries()].sort((a, b) => b[1] - a[1]),
      jvPayouts: isFinite(jvPayouts) ? jvPayouts : 0,
      hasJVData
    }
  }

  function generateTaxPrepCSV(filteredDeals: any[], year: number): string {
    const headers = ['Deal / Property','Market','Asset Type','Closed Date','Partner / JV','Gross Fee','JV Split / Commission','Net Income','Source','Status','Tax Year']
    const rows = filteredDeals.map((d: any) => {
      const mkt = `${safeStr(d?.property?.city,'')}, ${safeStr(d?.property?.state,'')}`.replace(/^, |, $/, '').trim() || '—'
      const partner = `${safeStr(d?.submitter?.name,'—')}${d?.submitter?.jvStructure ? ' • ' + d.submitter.jvStructure : ''}`
      return [
        safeStr(d?.property?.address, '').replace(/"/g, '""'),
        mkt.replace(/"/g, '""'),
        safeStr(d?.property?.type, ''),
        formatDateSafe(getCloseDateStr(d)),
        partner.replace(/"/g, '""'),
        getGrossForDeal(d),
        getCommission(d),
        getNetIncome(d),
        safeStr(d?.submitter?.role || d?.source, ''),
        safeStr(d?.status, ''),
        year
      ]
    })
    return [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  }

  function generateIncomeSummaryCSV(year: number, period: string, month: number | null): string {
    const headers = ['Category','Key','Amount','Tax Year','Period']
    const rows: any[] = []
    const t = getTaxFilteredData(year, (period as any) || 'yearly', month)
    rows.push(['Gross Income','Total', t.gross, year, period || 'yearly'])
    rows.push(['Net Income','Total', t.net, year, period || 'yearly'])
    rows.push(['Assignment Fees','Total', t.assign, year, period || 'yearly'])
    rows.push(['JV Commissions Paid','Total', t.jv, year, period || 'yearly'])
    rows.push(['Double-Close Profit','Total', t.dbl, year, period || 'yearly'])
    rows.push(['Number of Closed Deals','Count', t.deals.length, year, period || 'yearly'])
    const b = getIncomeBreakdowns(t.deals)
    b.byMonth.forEach(([k, v]: [string, number]) => rows.push(['Income by Month', k, v, year, period || 'yearly']))
    b.byPartner.slice(0, 8).forEach(([k, v]: [string, number]) => rows.push(['Income by Partner', k, v, year, period || 'yearly']))
    b.bySource.forEach(([k, v]: [string, number]) => rows.push(['Income by Source', k, v, year, period || 'yearly']))
    b.byAsset.forEach(([k, v]: [string, number]) => rows.push(['Income by Asset Type', k, v, year, period || 'yearly']))
    b.byMarket.forEach(([k, v]: [string, number]) => rows.push(['Income by Market/State', k, v, year, period || 'yearly']))
    if (b.hasJVData) {
      rows.push(['1099-Related JV/Partner Payouts', 'Total', b.jvPayouts, year, period || 'yearly'])
    }
    return [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  }

  // Download helper using browser Blob/ObjectURL (no backend)
  function downloadCSV(csvContent: string, filename: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const openDrawer = (data: any) => {
    setDrawerData(data)
    setDrawerOpen(true)
    if (data.key) setSelectedKPI(data.key)
  }
  const closeDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => setDrawerData(null), 200)
  }

  // Helper to build Related Details content for drawer
  const getRelatedDetails = (data: any) => {
    if (!data) return null
    // For new coverage/period/tax + income types, prefer the explicitly provided relatedDetails for primary list
    if (data.relatedDetails && Array.isArray(data.relatedDetails) && data.relatedDetails.length > 0) {
      if (['coverage', 'income-period', 'tax', 'income'].includes(data.type) || (data.key && (String(data.key).includes('period') || String(data.key).includes('tax') || String(data.key).includes('coverage')))) {
        return data.relatedDetails
      }
    }
    const items: any[] = []
    if (data.type === 'kpi') {
      if (data.key === 'hotBuyers') {
        const hotOnly = buyers.filter(b => b.status === 'Hot').sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0,5)
        hotOnly.forEach(b => items.push({ label: b.name, value: `Heat: ${getBuyerHeatScore(b.id)} • ${b.status}`, id: b.id, kind: 'buyer' }))
      } else if (data.key === 'totalBuyers') {
        const top = [...buyers].sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0,5)
        top.forEach(b => items.push({ label: b.name, value: `Heat: ${getBuyerHeatScore(b.id)} • ${b.status}`, id: b.id, kind: 'buyer' }))
      } else if (data.key === 'totalDeals' || data.key === 'activePipeline' || data.key === 'dealsMarketed' || data.key === 'dealsReceived') {
        let filtered = activeAnalyticsDeals
        if (data.key === 'activePipeline') filtered = activeAnalyticsDeals.filter((d: any) => ['Approved','Active','Blasted','Offers Received','Under Contract','Closing'].includes(d.status))
        if (data.key === 'dealsMarketed') filtered = activeAnalyticsDeals.filter((d: any) => d.status === 'Blasted' || d.status === 'Offers Received')
        if (data.key === 'dealsReceived') filtered = activeAnalyticsDeals
        filtered.slice(0,6).forEach(d => {
          const q = getDealQualityScore(d.id)
          const cleanName = d.property?.address || 'Untitled Deal'
          const assetInfo = d.property?.type || ''
          const marketInfo = d.property?.city || d.property?.state || ''
          const dateInfo = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : ''
          const valueParts = [`${d.status} • ${q.grade} ${q.score}`]
          if (marketInfo) valueParts.push(marketInfo)
          if (assetInfo) valueParts.push(assetInfo)
          if (dateInfo) valueParts.push(dateInfo)
          items.push({ label: cleanName, value: valueParts.join(' • '), id: d.id, kind: 'deal' })
        })
      } else if (data.key === 'blastsSent') {
        const allLogs = Object.values(blastLogs || {}).flat().slice(-5)
        allLogs.forEach((log: any, idx: number) => {
          let dealName = ''
          if (log.dealId) {
            const d = deals.find((dd: any) => dd.id === log.dealId)
            dealName = d ? (d.property?.address || 'Unknown Deal') : ''
          }
          const campaignNames = ['Buyer Blast Campaign', 'Deal Blast Campaign', 'Recent Blast']
          const cleanLabel = campaignNames[idx % 3]
          const valueParts = [`${log.recipientCount || 0} recipients`]
          if (dealName) valueParts.push(dealName)
          if (log.timestamp) {
            try { valueParts.push(new Date(log.timestamp).toLocaleDateString()) } catch {}
          }
          items.push({ 
            label: cleanLabel, 
            value: valueParts.join(' • '), 
            kind: 'blast'
          })
        })
      } else if (data.key === 'dealsClosed') {
        closedDeals.slice(0,6).forEach(d => {
          const net = getNetIncome(d)
          items.push({ label: d.property?.address || 'Closed Deal', value: `${d.status} • Net ${formatMoneyCompact(net)}`, id: d.id, kind: 'deal' })
        })
      }
    } else if (data.type === 'section') {
      if (data.key === 'top-buyers' || data.key === 'hotBuyers') {
        [...buyers].sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0,5).forEach(b => items.push({ label: b.name, value: `Heat: ${getBuyerHeatScore(b.id)}`, id: b.id, kind: 'buyer' }))
      } else if (data.key === 'top-deals') {
        [...activeAnalyticsDeals].sort((a: any,b: any) => getDealQualityScore(b.id).score - getDealQualityScore(a.id).score).slice(0,5).forEach((d: any) => {
          const q = getDealQualityScore(d.id)
          items.push({ label: d.property.address, value: `${q.grade} ${q.score}`, id: d.id, kind: 'deal' })
        })
      } else if (data.key === 'buyer-response') {
        items.push({ label: 'Interested', value: interested })
        items.push({ label: 'Made Offer / Offers', value: madeOffer })
        items.push({ label: 'Passed', value: passed })
        items.push({ label: 'No Response', value: noResponse })
        const examples = [...buyers].slice(0,3).map(b => ({ label: b.name, value: b.status }))
        items.push(...examples.map(e => ({...e, kind: 'buyer'})))
      }
    } else if (data.type === 'income') {
      // Related for income metrics - real contributing records only
      if (data.key === 'totalNetIncome' || data.key === 'dealsClosed') {
        closedWithNet.slice(0,8).forEach(c => items.push({ label: c.d.property?.address || 'Closed', value: `Net ${formatMoneyFull(c.net)} • ${formatDateSafe(getCloseDateStr(c.d))}`, id: c.d.id, kind: 'deal' }))
      } else if (data.key === 'assignmentFees') {
        closedDeals.filter(d => getAssignmentFee(d) > 0).slice(0,8).forEach(d => items.push({ label: d.property?.address || 'Deal', value: `Assignment ${formatMoneyFull(getAssignmentFee(d))}`, id: d.id, kind: 'deal' }))
      } else if (data.key === 'jvCommissions') {
        jvDeals.slice(0,8).forEach(d => items.push({ label: d.property?.address || 'JV Deal', value: `JV/Comm ${formatMoneyFull(getCommission(d))} • ${safeStr(d.submitter?.name)}`, id: d.id, kind: 'deal' }))
      } else if (data.key === 'doubleCloseProfit') {
        closedDeals.filter(d => getBuyerPrice(d) > 0).slice(0,8).forEach(d => items.push({ label: d.property?.address || 'Deal', value: `Double-close spread ${formatMoneyFull(Math.max(0, getBuyerPrice(d) - getContractPrice(d)))}`, id: d.id, kind: 'deal' }))
      } else if (data.key === 'partnersClosedWith' || data.key === 'topPartners') {
        ;[...partnerMap.entries()].slice(0,8).forEach(([name, cnt]) => {
          // try map to a buyer for click-through
          const matchBuyer = buyers.find((b: any) => b.name === name || (b.company && name.includes(b.company)))
          items.push({ label: name, value: `${cnt} closed deal${cnt === 1 ? '' : 's'}`, id: matchBuyer?.id, kind: matchBuyer ? 'buyer' : 'partner' })
        })
      } else if (data.key === 'bestMarket') {
        closedDeals.forEach(d => items.push({ label: d.property?.address || 'Deal', value: `${safeStr(d.property?.city)}, ${safeStr(d.property?.state)} • ${d.status}`, id: d.id, kind: 'deal' }))
      } else if (data.key === 'bestAsset') {
        closedDeals.forEach(d => items.push({ label: d.property?.address || 'Deal', value: `${safeStr(d.property?.type)} • Net ${formatMoneyCompact(getNetIncome(d))}`, id: d.id, kind: 'deal' }))
      } else if (data.key === 'highestNet' || data.key === 'mostRecentClosed') {
        const target = data.key === 'highestNet' ? highestNetDeal : mostRecentClosed
        if (target) items.push({ label: target.property?.address || 'Closed Deal', value: `Net ${formatMoneyFull(getNetIncome(target))} • ${formatDateSafe(getCloseDateStr(target))}`, id: target.id, kind: 'deal' })
      } else if (data.key === 'dealsReceived') {
        activeAnalyticsDeals.slice(0,6).forEach((d: any) => items.push({ label: d.property?.address || 'Deal', value: `${d.status} • ${safeStr(d.submitter?.role)}`, id: d.id, kind: 'deal' }))
      }
    }
    if ((data.key === 'key-metrics' || data.key === 'buyer-response') && data.relatedDetails) {
      return data.relatedDetails;
    }
    // generic fallback
    if (items.length === 0 && data.related) {
      items.push({ label: 'Summary', value: data.related })
    }
    return items
  }

  // Partner details (prefer matching buyer record for JV partners, else generic info)
  const openPartnerDetails = (name: string, count: number) => {
    const match = buyers.find((b: any) => b.name === name || (b.company && safeLower(name).includes(safeLower(b.company))))
    if (match) {
      openBuyerDetails(match)
      return
    }
    openDrawer({
      type: 'partner',
      key: name,
      title: name,
      value: `${count} closed deal${count === 1 ? '' : 's'}`,
      desc: 'Partner / JV from submitter records on closed deals (no fake entries).',
      relatedDetails: [
        { label: 'Deals closed with', value: count },
        { label: 'Source', value: 'Submitter / JV flag on deal' }
      ],
      action: 'Import matching buyer or review closed deal records for follow-up.',
      buttons: ['View Buyers']
    })
  }

  const openBuyerDetails = (b: any) => {
    openDrawer({
      type: 'buyer',
      key: b.id,
      title: b.name,
      value: getBuyerHeatScore(b.id),
      desc: `Status: ${b.status || 'N/A'} • Markets: ${(b.markets || []).join(', ') || 'Any'}`,
      relatedDetails: [
        { label: 'Email', value: b.email || 'N/A' },
        { label: 'Heat Score', value: getBuyerHeatScore(b.id) },
        { label: 'Status', value: b.status || 'N/A' },
      ],
      action: 'Build Blast targeting this buyer or add to list.',
      buttons: ['View Buyers', 'Build Blast']
    })
  }

  const openDealDetails = (d: any) => {
    const q = getDealQualityScore(d.id)
    openDrawer({
      type: 'deal',
      key: d.id,
      title: d.property.address,
      value: `${q.grade} ${q.score}`,
      desc: `Status: ${d.status} • Price: ${d.pricing?.askingPrice || 'N/A'}`,
      relatedDetails: [
        { label: 'Status', value: d.status },
        { label: 'Quality', value: `${q.grade} ${q.score}` },
        { label: 'City/State', value: `${d.property.city || ''}, ${d.property.state || ''}` },
      ],
      action: 'Include in next blast or mark for follow-up.',
      buttons: ['View Deals', 'Run Buyer Match']
    })
  }

  // Open rich drawer for every Income & Deal Performance metric (real data + calc + related + action)
  const openIncomeMetric = (key: string) => {
    let drawerPayload: any = {
      type: 'income',
      key,
      title: key,
      value: '',
      desc: '',
      relatedDetails: [],
      calc: 'Derived only from closed/Sold deals that have closingDate or status Sold + numeric fee fields.',
      action: 'Close more deals in Pipeline to populate real income analytics.',
      buttons: ['View Pipeline']
    }

    switch (key) {
      case 'dealsReceived':
        drawerPayload = {
          ...drawerPayload,
          title: 'Deals Received',
          value: dealsReceived,
          desc: 'Live deals recorded in system. Rejected / Dead deals are excluded so Analytics matches current pipeline status.',
          relatedDetails: activeAnalyticsDeals.slice(0,8).map((d:any)=>({ label: d.property?.address||'Deal', value: `${d.status} • ${safeStr(d.submitter?.role)}`, id: d.id, kind: 'deal' })),
          calc: 'Count of all deals where status !== Dead. Rejected deals do not count in Analytics KPIs.',
          action: 'Intake more via portal or manual entry. Review Submissions queue.'
        }
        break
      case 'dealsClosed':
        drawerPayload = {
          ...drawerPayload,
          title: 'Deals Closed',
          value: dealsClosedCount,
          desc: 'Deals with status Sold or explicit closingDate in closing info.',
          relatedDetails: closedDeals.map((d:any)=>({ label: d.property?.address||'Closed', value: `${formatDateSafe(getCloseDateStr(d))} • Net ${formatMoneyCompact(getNetIncome(d))}`, id: d.id, kind: 'deal' })),
          calc: 'Count of deals where status==="Sold" OR closing.closingDate present.',
          action: 'Mark deals Sold in Pipeline after closing. Add closing details + fees.'
        }
        break
      case 'closeRate':
        drawerPayload = {
          ...drawerPayload,
          title: 'Close Rate',
          value: `${closeRate}%`,
          desc: 'Deals Closed Ã· Deals Received (real counts).',
          relatedDetails: [
            { label: 'Deals Closed', value: dealsClosedCount },
            { label: 'Deals Received', value: dealsReceived },
            { label: 'Formula', value: 'Closed / Received Ã— 100' }
          ],
          calc: 'Math.round( (closedCount / Math.max(1, receivedCount)) * 100 )',
          action: 'Improve close rate by focusing blasts on high-quality pipeline and hot buyers.'
        }
        break
      case 'totalNetIncome':
        drawerPayload = {
          ...drawerPayload,
          title: 'Total Net Income',
          value: formatMoneyFull(totalNetIncome),
          desc: 'Sum of (assignmentFee + commissionPaid/Expected + buyerPrice spread if present) across all closed deals.',
          relatedDetails: closedWithNet.map(c => ({ label: c.d.property?.address || 'Closed', value: `Net ${formatMoneyFull(c.net)} • ${formatDateSafe(getCloseDateStr(c.d))}`, id: c.d.id, kind: 'deal' })),
          calc: 'For each closed: assignmentFee + (commissionPaid || commissionExpected) + max(0, buyerPrice - contractPrice if buyerPrice set). Sum all.',
          action: 'Add closing.commission* and pricing.assignmentFee on closed deals to track true net.'
        }
        break
      case 'dailyIncome':
        drawerPayload = {
          ...drawerPayload,
          title: 'Daily Income',
          value: formatMoneyFull(dailyIncome),
          desc: 'Net income from closed deals with closing date in last 24 hours.',
          relatedDetails: closedWithNet.filter(c => c.ts >= nowTs - dayMs).map(c => ({ label: c.d.property?.address||'Deal', value: formatMoneyFull(c.net), id: c.d.id, kind: 'deal' })),
          calc: 'Sum net of closed deals where closeTs >= now - 1 day.',
          action: 'Close deals today to see daily realized income.'
        }
        break
      case 'weeklyIncome':
        drawerPayload = {
          ...drawerPayload,
          title: 'Weekly Income',
          value: formatMoneyFull(weeklyIncome),
          desc: 'Net income from closed deals in the last 7 days.',
          relatedDetails: closedWithNet.filter(c => c.ts >= nowTs - 7*dayMs).map(c => ({ label: c.d.property?.address||'Deal', value: formatMoneyFull(c.net), id: c.d.id, kind: 'deal' })),
          calc: 'Sum net of closed deals where closeTs >= now - 7 days.',
          action: 'Consistent weekly closings drive predictable income.'
        }
        break
      case 'monthlyIncome':
        drawerPayload = {
          ...drawerPayload,
          title: 'Monthly Income',
          value: formatMoneyFull(monthlyIncome),
          desc: 'Net income from closed deals in the last 30 days.',
          relatedDetails: closedWithNet.filter(c => c.ts >= nowTs - 30*dayMs).map(c => ({ label: c.d.property?.address||'Deal', value: formatMoneyFull(c.net), id: c.d.id, kind: 'deal' })),
          calc: 'Sum net of closed deals where closeTs >= now - 30 days.',
          action: 'Track monthly to forecast and set targets.'
        }
        break
      case 'annualIncome':
        drawerPayload = {
          ...drawerPayload,
          title: 'Annual Income',
          value: formatMoneyFull(annualIncome),
          desc: 'Net income from closed deals in the last 365 days (or YTD if shorter).',
          relatedDetails: closedWithNet.filter(c => c.ts >= nowTs - 365*dayMs).map(c => ({ label: c.d.property?.address||'Deal', value: formatMoneyFull(c.net), id: c.d.id, kind: 'deal' })),
          calc: 'Sum net of closed deals where closeTs >= now - 365 days.',
          action: 'Use annual run-rate for business planning and scaling.'
        }
        break
      case 'avgPerMonth':
        drawerPayload = {
          ...drawerPayload,
          title: 'Average Income Per Month',
          value: formatMoneyFull(avgPerMonth),
          desc: 'Total net income averaged over the span of closed deals (min 1 month).',
          relatedDetails: [{ label: 'Total Net (all time)', value: formatMoneyFull(totalNetIncome) }, { label: 'Closed deals', value: dealsClosedCount }],
          calc: 'totalNet / max(1, rounded months between first and last close date)',
          action: 'Close more to smooth and raise monthly average.'
        }
        break
      case 'avgPerYear':
        drawerPayload = {
          ...drawerPayload,
          title: 'Average Income Per Year',
          value: formatMoneyFull(avgPerYear),
          desc: 'Total net income averaged over the span in years.',
          relatedDetails: [{ label: 'Total Net (all time)', value: formatMoneyFull(totalNetIncome) }, { label: 'Closed deals', value: dealsClosedCount }],
          calc: 'totalNet / max(1, rounded years span)',
          action: 'Build multi-year track record for investors/partners.'
        }
        break
      case 'jvCommissions':
        drawerPayload = {
          ...drawerPayload,
          title: 'JV Commissions',
          value: formatMoneyFull(jvCommissionsTotal),
          desc: 'Commission amounts (paid/expected) on closed deals where submitter role or jvStructure indicates JV.',
          relatedDetails: jvDeals.map(d => ({ label: d.property?.address||'JV Deal', value: `${safeStr(d.submitter?.name)} • ${formatMoneyFull(getCommission(d))}`, id: d.id, kind: 'deal' })),
          calc: 'Sum (commissionPaid || commissionExpected) only for closed deals with JV role/jvStructure flag.',
          action: 'Record JV splits accurately in closing info for proper partner payouts.'
        }
        break
      case 'assignmentFees':
        drawerPayload = {
          ...drawerPayload,
          title: 'Assignment Fees',
          value: formatMoneyFull(assignmentFeesTotal),
          desc: 'Sum of pricing.assignmentFee on all closed/Sold deals.',
          relatedDetails: closedDeals.filter(d => getAssignmentFee(d)>0).map(d => ({ label: d.property?.address||'Deal', value: formatMoneyFull(getAssignmentFee(d)), id: d.id, kind: 'deal' })),
          calc: 'Sum assignmentFee for every closed deal that has it populated.',
          action: 'Populate pricing.assignmentFee at intake or update for accurate income.'
        }
        break
      case 'doubleCloseProfit':
        drawerPayload = {
          ...drawerPayload,
          title: 'Double-Close Profit',
          value: formatMoneyFull(doubleCloseProfitTotal),
          desc: 'Spread realized when buyerPrice present: max(0, buyerPrice - contractPrice) on closed deals.',
          relatedDetails: closedDeals.filter(d => getBuyerPrice(d)>0).map(d => ({ label: d.property?.address||'Deal', value: formatMoneyFull(Math.max(0, getBuyerPrice(d)-getContractPrice(d))), id: d.id, kind: 'deal' })),
          calc: 'Only when buyerPrice is set on pricing: sum max(0, buyerPrice - contractPrice) for closed.',
          action: 'Use buyerPrice field on double-close / wholetail deals for profit tracking.'
        }
        break
      case 'avgProfitPerClosed':
        drawerPayload = {
          ...drawerPayload,
          title: 'Average Profit Per Closed Deal',
          value: formatMoneyFull(avgProfitPerClosed),
          desc: 'Mean net income across all closed deals.',
          relatedDetails: [{ label: 'Total Net Income', value: formatMoneyFull(totalNetIncome) }, { label: 'Deals Closed', value: dealsClosedCount }],
          calc: 'totalNetIncome / dealsClosedCount (0 when no closed)',
          action: 'Raise per-deal profit via better pricing, less JV splits, or higher quality deals.'
        }
        break
      case 'partnersClosedWith':
        drawerPayload = {
          ...drawerPayload,
          title: 'Partners Closed With',
          value: `${partnersClosedCount} partner${partnersClosedCount===1?'':'s'}`,
          desc: 'Unique partners (submitter names) from closed deals.',
          relatedDetails: [...partnerMap.entries()].map(([name, cnt]) => ({ label: name, value: `${cnt} deal${cnt===1?'':'s'}`, kind: 'partner', id: name })),
          calc: 'Count distinct submitter.name values on closed deals.',
          action: 'Nurture repeat JV partners and top performers.'
        }
        break
      case 'topPartners':
        drawerPayload = {
          ...drawerPayload,
          title: 'Top Closing Partner(s)',
          value: topClosingPartners,
          desc: 'Highest volume partners by # closed deals (from submitter data).',
          relatedDetails: topClosingPartnersArr.length ? topClosingPartnersArr.map(([name, cnt]) => ({ label: name, value: `${cnt} closed`, kind: 'partner', id: name })) : [{ label: 'No closed records', value: '—' }],
          calc: 'Top 1-2 submitter.name entries ranked by closed deal count.',
          action: 'Double down on partners with proven close rate.'
        }
        break
      case 'bestMarket':
        drawerPayload = {
          ...drawerPayload,
          title: 'Best Closing Market',
          value: bestMarket,
          desc: 'Market (city, state) with most closed deals.',
          relatedDetails: closedDeals.map(d => ({ label: `${safeStr(d.property?.city)}, ${safeStr(d.property?.state)}`, value: d.property?.address || d.status, id: d.id, kind: 'deal' })),
          calc: 'Most frequent city/state combo among closed deals.',
          action: 'Focus sourcing and buyer lists on proven high-close markets.'
        }
        break
      case 'bestAsset':
        drawerPayload = {
          ...drawerPayload,
          title: 'Best Asset Type',
          value: bestAsset,
          desc: 'Asset type with most closed deals.',
          relatedDetails: closedDeals.map(d => ({ label: safeStr(d.property?.type), value: d.property?.address || '', id: d.id, kind: 'deal' })),
          calc: 'Most frequent property.type among closed deals.',
          action: 'Target more of the winning asset class in future blasts.'
        }
        break
      case 'highestNet':
        drawerPayload = {
          ...drawerPayload,
          title: 'Highest Net Deal',
          value: highestNetDeal ? formatMoneyFull(highestNetVal) : '$0',
          desc: highestNetDeal ? `Highest net contributor: ${safeStr(highestNetDeal.property?.address)}` : 'No closed records yet.',
          relatedDetails: highestNetDeal ? [{ label: highestNetDeal.property?.address, value: `Net ${formatMoneyFull(highestNetVal)} • ${formatDateSafe(getCloseDateStr(highestNetDeal))}`, id: highestNetDeal.id, kind: 'deal' }] : [],
          calc: 'Max( getNetIncome(d) ) over closed deals.',
          action: 'Replicate the structure of your highest net deals.'
        }
        break
      case 'mostRecentClosed':
        drawerPayload = {
          ...drawerPayload,
          title: 'Most Recent Closed Deal',
          value: mostRecentClosed ? formatMoneyCompact(getNetIncome(mostRecentClosed)) : '—',
          desc: mostRecentClosed ? safeStr(mostRecentClosed.property?.address) : 'No closed records yet.',
          relatedDetails: mostRecentClosed ? [{ label: mostRecentClosed.property?.address, value: `${formatDateSafe(getCloseDateStr(mostRecentClosed))} • Net ${formatMoneyFull(getNetIncome(mostRecentClosed))}`, id: mostRecentClosed.id, kind: 'deal' }] : [],
          calc: 'Latest by closingDate (fallback updatedAt) among closed deals.',
          action: 'Log the most recent closing fully (fees, partner, date) for history.'
        }
        break
      default:
        break
    }
    openDrawer(drawerPayload)
  }

  // New coverage + period + tax drawer helpers (reuse same drawer, populate related + calc + action)
  function openBuyerCoverage(mode: 'state'|'asset', key: string, count: number) {
    let matching: any[] = []
    const upKey = key.toUpperCase()
    if (mode === 'state') {
      matching = buyers.filter((b: any) => (b?.markets || []).some((m: string) => String(m).toUpperCase() === upKey || (upKey.includes('ANY') && String(m).includes('any')) || (upKey.includes('NATION') && String(m).includes('nation')) ))
    } else {
      matching = buyers.filter((b: any) => (b?.assetTypes || []).some((a: string) => String(a) === key ))
    }
    const top = [...matching].sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0, 8)
    openDrawer({
      type: 'coverage',
      key: `${mode}:${key}`,
      title: `${formatCoverageKey(key, mode)} — Buyer Coverage`,
      value: `${count} buyers`,
      desc: `Buyers with ${mode} match: ${key}`,
      relatedDetails: top.map((b: any) => ({ label: b.name, value: `Heat ${getBuyerHeatScore(b.id)} • ${b.status || ''} • Markets: ${(b.markets||[]).slice(0,3).join(', ')}`, id: b.id, kind: 'buyer' })),
      calc: `Count of buyers where their ${mode === 'asset' ? 'assetTypes' : 'markets'} include ${key}.`,
      action: 'Build targeted blast for buyers in this segment.',
      buttons: ['View Buyers', 'Build Blast']
    })
  }

  function openBuyerCoverageFull(entries: [string, number][], mode: string) {
    const related = entries.map(([k, cnt]) => {
      const disp = formatCoverageKey(k, mode)
      return { label: disp, value: `${cnt} buyers`, kind: 'coverage', mode, rawKey: k, count: cnt }
    })
    openDrawer({
      type: 'coverage',
      key: `all:${mode}`,
      title: `All ${mode} Coverage`,
      value: `${entries.length} segments`,
      desc: 'Full breakdown of buyer reach. Click rows for details.',
      relatedDetails: related,
      calc: 'Aggregated from all registered buyers\' markets and assetTypes arrays (no fabricated entries).',
      action: 'Use segments with high coverage for focused marketing.'
    })
  }

  function openIncomePeriod(label: string, sum: number, deals: any[], year?: number, period?: string, month?: number|null) {
    openDrawer({
      type: 'income-period',
      key: `period:${label}`,
      title: `Income — ${label}`,
      value: formatMoneyFull(sum),
      desc: `${deals.length} closed deal(s) contributed. ${year ? `Year: ${year}` : ''}${period ? ` Period: ${period}` : ''}${month!=null ? ` Month: ${month+1}` : ''}`,
      relatedDetails: deals.slice(0, 10).map((d: any) => ({ label: safeStr(d.property?.address, d.id), value: `${formatDateSafe(getCloseDateStr(d))} • Net ${formatMoneyFull(getNetIncome(d))}`, id: d.id, kind: 'deal' })),
      calc: 'Sum of net income (assignmentFee + commission + double-close spread if present) for closed deals whose close date matches the selected year/period/month (real data only; $0 when none).',
      action: 'Analyze seasonality and plan sourcing for high-performing months.',
      year: year || currentYear,
      period: period || 'yearly',
      month: month
    })
  }

  // Helper for CSV exports (used by card buttons and drawer) - uses Blob/ObjectURL, respects live filter when called from sideview
  function doTaxCsvExport(year: number, useSummary: boolean = false, period: 'monthly'|'quarterly'|'yearly' = 'yearly', month: number | null = null) {
    try {
      const t = getTaxFilteredData(year, period, month)
      const deals = t.deals
      let csv = ''
      let fname = ''
      if (!useSummary) {
        csv = generateTaxPrepCSV(deals, year)
        fname = `deal-blast-pro-tax-prep-${year}.csv`
      } else {
        csv = generateIncomeSummaryCSV(year, period, month)
        fname = `deal-blast-pro-income-summary-${year}.csv`
      }
      downloadCSV(csv, fname)
    } catch(e){}
  }

  const kpis = [
    { key: 'totalDeals', label: 'Total Deals', value: totalDeals, border: '#3b82f6', text: '#3b82f6', section: 'top-deals', support: 'Current non-dead deals', desc: 'Live count of deals in the system. Rejected / Dead deals are excluded so the KPI reflects current deal status.', related: 'Shows active/current records only. Top Quality Deals also excludes rejected/dead deals.', action: 'Intake new deals or run buyer match on pipeline.' },
    { key: 'activePipeline', label: 'Active Pipeline', value: activeDeals, border: '#22c55e', text: '#22c55e', section: 'key-metrics', support: 'Deals still in progress', desc: 'Deals in live stages (Approved, Active, Blasted, Offers, Under Contract, Closing).', related: `${activeDeals} deals generating activity.`, action: 'Focus blasts on active deals to advance them.' },
    { key: 'dealsMarketed', label: 'Deals Marketed', value: blastedDeals, border: '#a78bfa', text: '#a78bfa', section: 'buyer-response', support: 'Unique deals sent to buyers', desc: 'Number of unique deals that have been sent/blasted to buyers (status Blasted or Offers Received).', related: 'See Buyer Response Breakdown for engagement rates on these deals.', action: 'Build new blasts targeting unmarketed deals or follow up responses.' },
    { key: 'totalBuyers', label: 'Total Buyers', value: totalBuyers, border: '#67e8f9', text: '#67e8f9', section: 'top-buyers', support: 'In CRM database', desc: 'All registered buyers available for matching and blasts.', related: 'Filter by heat or markets in Buyers page.', action: 'Import more buyers or segment for targeted campaigns.' },
    { key: 'hotBuyers', label: 'Hot Buyers', value: hotBuyers, border: '#f59e0b', text: '#fbbf24', section: 'top-buyers', support: 'High interest/engagement', desc: 'Buyers flagged as Hot with top heat scores ready for immediate follow-up.', related: 'Only status Hot buyers shown in this sideview. See heat scores section for ranking.', action: 'Prioritize Hot Buyers in next blast or direct outreach.' },
    { key: 'blastsSent', label: 'Blasts Sent', value: totalBlasts, border: '#ec4899', text: '#f472b6', section: 'key-metrics', support: 'Total campaigns executed', desc: 'Total number of blast campaigns executed (a single deal may appear in multiple campaigns). Total recipients reached: ' + totalRecipients + '.', related: 'See response metrics and conversion rates.', action: 'Review past blasts in Blast Builder or schedule follow-ups.' },
  ]

  // Simple bar helper - polished with % and better labels
  const Bar = ({ label, value, max = 100, color = 'bg-[#3B82F6]' }: { label: string; value: number; max?: number; color?: string }) => {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
      <div className="text-sm">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[#8B92A3] truncate">{label}</div>
          <div className="font-mono text-xs text-[#64748B] tabular-nums">{value} <span className="opacity-60">({pct}%)</span></div>
        </div>
        <div className="w-full bg-[#252A38] h-1.5 rounded overflow-hidden">
          <div className={`h-1.5 rounded ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
    )
  }

  const dateTimeStr = `${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} • ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`

  return (
    <div>
      <div className="text-3xl font-semibold tracking-tight mb-1">Analytics</div>
      <div className="text-[#8B92A3] mb-1">Real-time performance across deals, buyers, and blasts</div>
      <div className="text-xs text-[#64748B] mb-6 font-mono tabular-nums">{dateTimeStr}</div>

      {/* KPI Row - color coded, interactive, clickable with selected state (kept intact, Deals Marketed + Blasts Sent preserved) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map((kpi) => {
          const isSelected = selectedKPI === kpi.key
          return (
            <div
              key={kpi.key}
              onClick={() => {
                openDrawer({ ...kpi, type: 'kpi' })
                if (kpi.section) {
                  const el = document.getElementById(kpi.section)
                  if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
                }
              }}
              className={`interactive-border card p-4 cursor-pointer transition-all duration-200 border hover:border-[var(--border-color)] hover:ring-2 hover:ring-[var(--border-color)]/50 hover:scale-[1.02] hover:shadow-[0_0_25px_-1px_var(--border-color)] ${isSelected ? 'is-selected ring-2 ring-offset-1 ring-offset-[#0A0C12] shadow-[0_0_20px_-2px_var(--border-color)]' : ''} hover:-translate-y-[2px]`}
              style={{
                '--border-color': kpi.border,
                borderColor: `${kpi.border}40`,
                boxShadow: isSelected 
                  ? `0 0 0 2px ${kpi.border}80, 0 0 18px -1px ${kpi.border}70` 
                  : `0 0 0 1px ${kpi.border}30, 0 0 10px -2px ${kpi.border}40`,
                background: `linear-gradient(160deg, #0A0C12 50%, ${kpi.border}10 100%)`,
              } as React.CSSProperties}
              title={`Click for details${kpi.section ? ' + scroll to section' : ''}`}
            >
              <div className="text-sm text-[#8B92A3]">{kpi.label}</div>
              <div className="text-2xl font-semibold tabular-nums my-0.5" style={{ color: kpi.text }}>{kpi.value}</div>
              <div className="text-[10px] text-[#64748B] leading-tight">{kpi.support}</div>
              <div className="text-[9px] text-[#3B82F6]/70 mt-1">Click for related records &amp; actions</div>
            </div>
          )
        })}
      </div>

      {/* Right-side drawer will handle details; old inline panel removed for drawer UX */}

      {deals.length === 0 && (
        <div className="empty-state card p-8 mb-6">
          <div>No data yet</div>
          <button onClick={() => useAppStore.getState().runSampleWorkflow()} className="btn btn-green mt-4">Run Sample Workflow</button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Response Breakdown - more visual/polished bars, clickable for drawer */}
        <div 
          id="buyer-response" 
          onClick={() => openDrawer({ 
            title: 'Buyer Response Breakdown', 
            key: 'buyer-response', 
            type: 'section',
            value: `${responseRate}% Response`, 
            desc: 'Real buyer response analytics across all recorded deal blasts. These numbers only populate from blast logs, saved buyer responses, and offer records — not total buyer count.',
            relatedDetails: [
              { label: 'Scope', value: responseScopeLabel },
              { label: 'Recipients Blasted', value: totalRecipients },
              { label: 'Recorded Responses', value: totalRecordedResponses },
              { label: 'Actual Responses', value: actualResponses },
              { label: 'Interested', value: interested },
              { label: 'Made Offer / Offers', value: madeOffer },
              { label: 'Needs More Info', value: needsMoreInfo },
              { label: 'NDA Requested', value: ndaRequested },
              { label: 'BIO Sent', value: bioSent },
              { label: 'Passed', value: passed },
              { label: 'No Response', value: noResponse }
            ],
            action: 'Prioritize Hot Buyers for follow-up or build targeted re-blasts.',
            buttons: ['View Buyers', 'Build Blast']
          })}
          className="interactive-border card p-5 cursor-pointer"
          style={{ '--border-color': '#22c55e' } as React.CSSProperties}
        >
          <div className="font-medium mb-3 flex items-start justify-between gap-3">
            <div>
              <div>Buyer Response Breakdown</div>
              <div className="mt-1 text-[10px] text-[#64748B] leading-snug">
                Real analytics only. Scope: {responseScopeLabel}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasResponseAnalyticsData && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    resetDemoResponseAnalytics()
                  }}
                  className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-[10px] font-semibold text-[#FBBF24] hover:bg-[#F59E0B]/20"
                  title="Demo/admin reset only. Clears response analytics without deleting buyers or deals."
                >
                  Reset Demo Metrics
                </button>
              )}
              <span className="text-[10px] text-[#64748B] whitespace-nowrap">{responseScopeLabel}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {responseDenominator === 0 && totalRecordedResponses === 0 ? (
              <div className="rounded-lg border border-[#252A38] bg-[#0A0C12]/60 p-4 text-sm text-[#8B92A3]">
                No buyer response activity recorded yet. This card will populate after a deal blast is sent or buyer responses/offers are logged.
              </div>
            ) : (
              <>
                <div onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Interested Buyers', value: interested, desc: 'Buyers marked Interested in saved buyer response records.', relatedDetails: [{label: 'Scope', value: responseScopeLabel}, {label: 'Interested count', value: interested}, {label: 'Actual responses', value: actualResponses}], action: 'Follow up with interested buyers.' }); }} className="cursor-pointer"><Bar label="Interested" value={interested} max={Math.max(1, responseDenominator)} color="bg-[#22C55E]" /></div>
                <div onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Made Offer / Offers Received', value: madeOffer, desc: 'Buyers marked Made Offer plus saved offer records. Uses the larger of recorded Made Offer responses or actual offers.', relatedDetails: [{label: 'Recorded Made Offer responses', value: explicitMadeOffer}, {label: 'Saved offers', value: allOffers.length}, {label: 'Displayed offer count', value: madeOffer}], action: 'Convert offers to contracts.' }); }} className="cursor-pointer"><Bar label="Made Offer / Offers" value={madeOffer} max={Math.max(1, responseDenominator)} color="bg-[#3B82F6]" /></div>
                <div onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Passed Buyers', value: passed, desc: 'Buyers explicitly marked Passed in saved buyer response records.', relatedDetails: [{label: 'Passed count', value: passed}, {label: 'Scope', value: responseScopeLabel}], action: 'Review why buyers passed and improve deal presentation.' }); }} className="cursor-pointer"><Bar label="Passed" value={passed} max={Math.max(1, responseDenominator)} color="bg-amber-500" /></div>
                <div onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'No Response', value: noResponse, desc: 'If blasts were sent, this is recipients blasted minus actual recorded responses. If no blasts were sent, it only counts explicit No Response records.', relatedDetails: [{label: 'Recipients blasted', value: totalRecipients}, {label: 'Actual responses', value: actualResponses}, {label: 'Explicit No Response records', value: explicitNoResponse}], action: 'Send follow-ups or clean unresponsive contacts.' }); }} className="cursor-pointer"><Bar label="No Response" value={noResponse} max={Math.max(1, responseDenominator)} color="bg-[#8B92A3]" /></div>
              </>
            )}
          </div>
          <div className="mt-3 text-xs text-[#8B92A3]">
            Scope: <span className="text-white font-semibold">{responseScopeLabel}</span> • Response Rate: <span className="text-white font-semibold">{responseRate}%</span> • Offer Conversion: <span className="text-white font-semibold">{offerConversion}%</span>
          </div>
        </div>

        {/* Key Performance Metrics - clean 2x2 mini KPI grid with larger text, strong labels, better space use */}
        <div id="key-metrics" className="interactive-border card p-4 cursor-pointer flex flex-col" style={{ '--border-color': '#3b82f6' } as React.CSSProperties} onClick={() => openDrawer({ 
          title: 'Key Performance Metrics', 
          key: 'key-metrics', 
          type: 'section',
          value: '4 Metrics',
          desc: 'Quick health indicators: recipients, avg match, overdue, quality A/B.',
          relatedDetails: [
            { label: 'Total Recipients Blasted', value: totalRecipients },
            { label: 'Avg Match Score', value: `${avgMatchScore}%` },
            { label: 'Overdue Follow-ups', value: overdueFollowups },
            { label: 'Deals with Quality A/B', value: deals.filter(d => ['A','B'].includes(getDealQualityScore(d.id).grade)).length }
          ],
          action: 'Use these to decide next blast or follow-up priority.'
        })}>
          <div className="font-semibold text-sm mb-2.5 tracking-wide">Key Performance Metrics</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-base flex-1">
            <div className="flex justify-between items-center px-1 py-1.5 rounded hover:bg-[#171B26] cursor-pointer border-l-2 border-[#3b82f6]/50 pl-2" onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Total Recipients Blasted', value: totalRecipients, desc: 'Total people reached across all blast campaigns.', relatedDetails: getRelatedDetails({key:'blastsSent', type:'kpi'}), action: 'Review past blasts.' }); }}>
              <span className="text-[#C5C9D3] font-medium">Total Recipients Blasted</span>
              <span className="font-semibold tabular-nums text-xl leading-none">{totalRecipients}</span>
            </div>
            <div className="flex justify-between items-center px-1 py-1.5 rounded hover:bg-[#171B26] cursor-pointer border-l-2 border-[#3b82f6]/50 pl-2" onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Avg Match Score', value: `${avgMatchScore}%`, desc: 'Average match score across all deals.', action: 'Improve data quality for better scores.' }); }}>
              <span className="text-[#C5C9D3] font-medium">Avg Match Score</span>
              <span className="font-semibold tabular-nums text-xl leading-none">{avgMatchScore}%</span>
            </div>
            <div className="flex justify-between items-center px-1 py-1.5 rounded hover:bg-[#171B26] cursor-pointer border-l-2 border-[#3b82f6]/50 pl-2" onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Overdue Follow-ups', value: overdueFollowups, desc: 'Follow-ups past due date that are not completed.', action: 'Complete overdue follow-ups.' }); }}>
              <span className="text-[#C5C9D3] font-medium">Overdue Follow-ups</span>
              <span className="font-semibold text-red-400 tabular-nums text-xl leading-none">{overdueFollowups}</span>
            </div>
            <div className="flex justify-between items-center px-1 py-1.5 rounded hover:bg-[#171B26] cursor-pointer border-l-2 border-[#3b82f6]/50 pl-2" onClick={(e) => { e.stopPropagation(); openDrawer({ title: 'Quality A/B Deals', value: deals.filter(d => ['A','B'].includes(getDealQualityScore(d.id).grade)).length, desc: 'Deals with high internal quality grades.', action: 'Focus on high quality deals.' }); }}>
              <span className="text-[#C5C9D3] font-medium">Quality A/B Deals</span>
              <span className="font-semibold tabular-nums text-xl leading-none">{deals.filter(d => ['A','B'].includes(getDealQualityScore(d.id).grade)).length}</span>
            </div>
          </div>
        </div>

        {/* Top 8 Hottest Buyers - cleaner with row hover, clickable for drawer */}
        <div 
          id="top-buyers" 
          onClick={() => openDrawer({ 
            title: 'Top Buyer Heat Scores', 
            key: 'top-buyers', 
            type: 'section',
            value: `${Math.min(8, buyers.length)} shown`, 
            desc: 'Buyers ranked by heat score (engagement + match strength). Not all are status Hot.', 
            relatedDetails: [...buyers].sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0,3).map(b => ({label: b.name, value: `Heat ${getBuyerHeatScore(b.id)} • ${b.status || ''}`})),
            action: 'Click rows or use in next blast. Consider direct follow up.'
          })}
          className="interactive-border card p-5 cursor-pointer"
          style={{ '--border-color': '#f59e0b' } as React.CSSProperties}
        >
          <div className="font-medium mb-2 flex items-baseline justify-between">
            <span>Top Buyer Heat Scores</span>
            <span className="text-[10px] text-[#64748B]">by heat score (not all Hot)</span>
          </div>
          <div className="divide-y divide-[#252A38] text-sm">
            {[...buyers].sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id)).slice(0,8).map(b => (
              <div 
                key={b.id} 
                className="flex justify-between py-1.5 px-0.5 hover:bg-[#171B26] hover:text-[#22C55E] rounded transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); openBuyerDetails(b); }}
                title="Open buyer details in sideview"
              >
                <div className="truncate pr-2">{b.name} <span className="text-[#64748B] text-xs">({b.status})</span></div>
                <div className="font-mono text-[#22C55E] tabular-nums shrink-0">{getBuyerHeatScore(b.id)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Quality Deals - cleaner with row hover, clickable for drawer */}
        <div 
          id="top-deals" 
          onClick={() => openDrawer({ 
            title: 'Top Quality Deals', 
            key: 'top-deals', 
            type: 'section',
            value: 'Top 6', 
            desc: 'Deals ranked by internal quality score (A/B/C etc based on completeness, price, etc).', 
            relatedDetails: [...activeAnalyticsDeals].sort((a:any,b:any) => getDealQualityScore(b.id).score - getDealQualityScore(a.id).score).slice(0,3).map((d:any) => { const q=getDealQualityScore(d.id); return {label: d.property.address, value: `${d.status} • ${q.grade} ${q.score}`, id: d.id, kind: 'deal' } }),
            action: 'Prioritize high quality in active pipeline for blasts.'
          })}
          className="interactive-border card p-5 cursor-pointer"
          style={{ '--border-color': '#22c55e' } as React.CSSProperties}
        >
          <div className="font-medium mb-2 flex items-baseline justify-between">
            <span>Top Quality Deals</span>
            <span className="text-[10px] text-[#64748B]">by grade + score</span>
          </div>
          <div className="divide-y divide-[#252A38] text-sm">
            {[...activeAnalyticsDeals].sort((a:any,b:any) => getDealQualityScore(b.id).score - getDealQualityScore(a.id).score).slice(0,6).map((d:any) => {
              const q = getDealQualityScore(d.id)
              return (
                <div 
                  key={d.id} 
                  className="flex justify-between py-1.5 px-0.5 hover:bg-[#171B26] hover:text-[#22C55E] rounded transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); openDealDetails(d); }}
                  title="Open deal details in sideview"
                >
                  <div className="truncate pr-2">{d.property.address}</div>
                  <div className="font-mono text-[#22C55E] tabular-nums shrink-0">{q.grade} {q.score}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ========== Buyer Coverage (compact, only State + Asset Type; 2-col left controls/list + right top preview) ========== */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="font-semibold text-base">Buyer Coverage</div>
          <div className="text-xs text-[#64748B]">State / Asset Type from buyer profiles (no dupes)</div>
        </div>
        <div className="card p-2.5 border border-[#252A38]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Left: controls + compact list */}
            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <select
                  value={coverageMode}
                  onChange={(e) => { setCoverageMode(e.target.value as any); setCoverageSearch(''); setSelectedCoveragePreview(null); }}
                  className="text-sm bg-[#0A0C12] border border-[#252A38] rounded px-2 py-0.5"
                >
                  <option value="state">State</option>
                  <option value="asset">Asset Type</option>
                </select>
                <input
                  value={coverageSearch}
                  onChange={(e) => setCoverageSearch(e.target.value)}
                  placeholder="Search"
                  className="text-sm bg-[#0A0C12] border border-[#252A38] rounded px-2 py-0.5 w-20"
                />
                <button
                  onClick={() => {
                    const entries = getCoverageData(coverageMode, coverageSearch)
                    openBuyerCoverageFull(entries, coverageMode)
                  }}
                  className="ml-auto text-xs px-2 py-0.5 rounded bg-[#252A38] hover:bg-[#3B82F6]/10 border border-[#252A38]"
                >
                  View All
                </button>
              </div>
              <div className="text-sm divide-y divide-[#252A38]">
                {(() => {
                  const entries = getCoverageData(coverageMode, coverageSearch)
                  if (entries.length === 0) return <div className="text-[#64748B] py-0.5 text-xs">No matching buyer coverage.</div>
                  return entries.slice(0, 6).map(([k, cnt]) => {
                    const disp = formatCoverageKey(k, coverageMode)
                    const isSel = selectedCoveragePreview && selectedCoveragePreview.key === k && selectedCoveragePreview.mode === coverageMode
                    return (
                      <div
                        key={`${coverageMode}:${k}`}
                        onClick={() => {
                          const top = buyers
                            .filter((b: any) => coverageMode === 'state' 
                              ? (b?.markets || []).some((m: string) => String(m).toUpperCase() === k.toUpperCase() || (k.toUpperCase()==='ANY' && String(m).includes('any')))
                              : (b?.assetTypes || []).includes(k)
                            )
                            .sort((a,b) => getBuyerHeatScore(b.id) - getBuyerHeatScore(a.id))
                            .slice(0, 3)
                          setSelectedCoveragePreview({ mode: coverageMode, key: k, count: cnt, top })
                          openBuyerCoverage(coverageMode, k, cnt)
                        }}
                        className={`flex justify-between py-0.5 px-1 hover:bg-[#171B26] cursor-pointer rounded text-sm ${isSel ? 'bg-[#171B26]' : ''}`}
                        title={`Click to open sideview for ${disp}`}
                      >
                        <span className="text-[#E6E8EE]">{disp}</span>
                        <span className="tabular-nums text-[#8B92A3]">{cnt} buyers</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            {/* Right: selected segment preview / summary */}
            <div className="border-l border-[#252A38] pl-2.5 text-sm">
              {selectedCoveragePreview ? (
                <>
                  <div className="font-medium mb-1 text-sm">{formatCoverageKey(selectedCoveragePreview.key, selectedCoveragePreview.mode)} — {selectedCoveragePreview.count} buyers</div>
                  <div className="text-xs text-[#64748B] mb-1">Top buyers in segment</div>
                  <div className="space-y-0.5 text-xs mb-1">
                    {selectedCoveragePreview.top.length > 0 ? selectedCoveragePreview.top.map((b: any) => (
                      <div key={b.id} className="flex justify-between hover:text-[#22C55E] cursor-pointer" onClick={() => openBuyerDetails(b)}>
                        <span className="truncate pr-1">{b.name}</span>
                        <span className="tabular-nums text-[#8B92A3] shrink-0">{getBuyerHeatScore(b.id)}</span>
                      </div>
                    )) : <div className="text-[#64748B] text-xs">No buyers</div>}
                  </div>
                  <button onClick={() => openBuyerCoverage(selectedCoveragePreview.mode, selectedCoveragePreview.key, selectedCoveragePreview.count)} className="text-xs px-2 py-0.5 bg-[#252A38] rounded hover:bg-[#3B82F6]/10">Open sideview</button>
                </>
              ) : (
                <div className="text-xs text-[#64748B] h-full flex items-center">Select row left → preview top buyers + open sideview. View All for full.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========== Income & Deal Performance (reorganized into clean grouped panels - no rainbow grid) ========== */}
      <div className="mt-7">
        <div className="mb-3">
          <div className="font-semibold text-lg">Income &amp; Deal Performance</div>
          <div className="text-xs text-[#8B92A3]">Track received deals, closings, income, JV splits, and partner performance.</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Group A: Deal Flow */}
          <div className="card p-4 border border-[#252A38] hover:border-[#3b82f6]/40 hover:shadow-[0_0_0_1px_#3b82f620] transition-all">
            <div className="text-sm font-medium mb-2.5 text-[#E6E8EE]">Deal Flow</div>
            <div className="space-y-0.5 text-sm">
              <div onClick={() => openIncomeMetric('dealsReceived')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Deals Received</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{dealsReceived}</span>
              </div>
              <div onClick={() => openIncomeMetric('dealsClosed')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Deals Closed</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{dealsClosedCount}</span>
              </div>
              <div onClick={() => openIncomeMetric('closeRate')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Close Rate</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{closeRate}%</span>
              </div>
            </div>
          </div>

          {/* Group B: Income */}
          <div className="card p-4 border border-[#252A38] hover:border-[#22c55e]/40 hover:shadow-[0_0_0_1px_#22c55e20] transition-all">
            <div className="text-sm font-medium mb-2.5 text-[#E6E8EE]">Income</div>
            <div className="space-y-0.5 text-sm">
              <div onClick={() => openIncomeMetric('totalNetIncome')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Total Net Income</span>
                <span className="font-semibold tabular-nums text-[#22c55e]">{formatMoneyCompact(totalNetIncome)}</span>
              </div>
              <div onClick={() => openIncomeMetric('monthlyIncome')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Monthly Income</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{formatMoneyCompact(monthlyIncome)}</span>
              </div>
              <div onClick={() => openIncomeMetric('annualIncome')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Annual Income</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{formatMoneyCompact(annualIncome)}</span>
              </div>
              <div onClick={() => openIncomeMetric('avgProfitPerClosed')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Average Profit / Closed Deal</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{formatMoneyCompact(avgProfitPerClosed)}</span>
              </div>
            </div>
          </div>

          {/* Group C: JV & Partners */}
          <div className="card p-4 border border-[#252A38] hover:border-[#f59e0b]/40 hover:shadow-[0_0_0_1px_#f59e0b20] transition-all">
            <div className="text-sm font-medium mb-2.5 text-[#E6E8EE]">JV &amp; Partners</div>
            <div className="space-y-0.5 text-sm">
              <div onClick={() => openIncomeMetric('jvCommissions')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">JV Commissions Paid</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{formatMoneyCompact(jvCommissionsTotal)}</span>
              </div>
              <div onClick={() => openIncomeMetric('partnersClosedWith')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Partners Closed With</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{partnersClosedCount}</span>
              </div>
              <div onClick={() => {
                if (topClosingPartnersArr.length === 1) {
                  openPartnerDetails(topClosingPartnersArr[0][0], topClosingPartnersArr[0][1])
                } else {
                  openIncomeMetric('topPartners')
                }
              }} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for partner breakdown">
                <span className="text-[#8B92A3]">Top Closing Partner</span>
                <span className="font-semibold text-[#E6E8EE] truncate max-w-[140px]" title={displayTopPartners}>{displayTopPartners}</span>
              </div>
            </div>
          </div>

          {/* Group D: Best Performers */}
          <div className="card p-4 border border-[#252A38] hover:border-[#8b5cf6]/40 hover:shadow-[0_0_0_1px_#8b5cf620] transition-all">
            <div className="text-sm font-medium mb-2.5 text-[#E6E8EE]">Best Performers</div>
            <div className="space-y-0.5 text-sm">
              <div onClick={() => openIncomeMetric('bestMarket')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Best Market</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE] truncate max-w-[110px] text-right">{bestMarket}</span>
              </div>
              <div onClick={() => openIncomeMetric('bestAsset')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Best Asset Type</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{bestAsset}</span>
              </div>
              <div onClick={() => openIncomeMetric('highestNet')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Highest Net Deal</span>
                <span className="font-semibold tabular-nums text-[#22c55e]">{highestNetDeal ? formatMoneyCompact(highestNetVal) : '$0'}</span>
              </div>
              <div onClick={() => openIncomeMetric('mostRecentClosed')} className="flex justify-between items-baseline py-1 px-1 rounded hover:bg-[#171B26] cursor-pointer" title="Click for details">
                <span className="text-[#8B92A3]">Most Recent Closed Deal</span>
                <span className="font-semibold tabular-nums text-[#E6E8EE]">{mostRecentClosed ? formatMoneyCompact(getNetIncome(mostRecentClosed)) : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Income History - standalone compact card/panel (not stretched list) */}
        <div className="mt-4 card p-3 border border-[#252A38]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-sm font-semibold">Income History</div>
            <div className="flex gap-1 text-sm">
              <select
                value={incomeYear}
                onChange={(e) => { const y = parseInt(e.target.value); setIncomeYear(y); if (incomePeriod === 'monthly') setIncomeMonth(null); }}
                className="bg-[#0A0C12] border border-[#252A38] rounded px-2 py-0.5 text-sm"
              >
                {availableYears.map((y: number) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={incomePeriod}
                onChange={(e) => { setIncomePeriod(e.target.value as any); setIncomeMonth(null); }}
                className="bg-[#0A0C12] border border-[#252A38] rounded px-2 py-0.5 text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
              {incomePeriod === 'monthly' && (
                <select
                  value={incomeMonth ?? ''}
                  onChange={(e) => setIncomeMonth(e.target.value === '' ? null : parseInt(e.target.value))}
                  className="bg-[#0A0C12] border border-[#252A38] rounded px-2 py-0.5 text-sm"
                >
                  <option value="">All</option>
                  {Array.from({length:12}, (_,m) => (
                    <option key={m} value={m}>{new Date(2000,m,1).toLocaleString('default',{month:'short'})}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {/* Selected period summary */}
          <div className="text-xs text-[#8B92A3] mb-1">
            Showing: {incomeYear} {incomePeriod}{incomeMonth != null ? ' / ' + new Date(2000, incomeMonth,1).toLocaleString('default',{month:'long'}) : ''} • Click rows for sideview
          </div>
          <div className="text-sm space-y-0.5 max-h-28 overflow-auto border border-[#252A38] rounded p-1 bg-[#0A0C12]">
            {getIncomePeriodList(incomePeriod, incomeYear, incomeMonth).slots.map((p: any) => (
              <div
                key={p.label}
                onClick={() => openIncomePeriod(p.label, p.sum, p.deals, p.year, p.period, p.month)}
                className={`flex justify-between items-baseline px-1 py-0.5 rounded hover:bg-[#171B26] cursor-pointer text-sm ${p.isSelected ? 'bg-[#171B26] font-medium' : ''}`}
                title="Click for period details in sideview"
              >
                <span>{p.label}</span>
                <span className="font-mono tabular-nums">{formatMoneyCompact(p.sum)}</span>
              </div>
            ))}
            {(() => {
              const { ytdLabel, ytdSum } = getIncomePeriodList(incomePeriod, incomeYear, incomeMonth)
              const ytdDealsForYear = closedWithNet.filter((c: any) => { try { return new Date(c.ts||0).getFullYear()===incomeYear } catch{return false} }).map((c:any)=>c.d)
              return (
                <div
                  onClick={() => openIncomePeriod(ytdLabel, ytdSum, ytdDealsForYear, incomeYear, 'yearly', null)}
                  className="flex justify-between items-baseline px-1 py-0.5 mt-0.5 border-t border-[#252A38] font-medium hover:bg-[#171B26] cursor-pointer text-sm"
                  title="Click for YTD breakdown"
                >
                  <span>{ytdLabel}</span>
                  <span className="font-mono tabular-nums">{formatMoneyCompact(ytdSum)}</span>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Tax Prep / Records - compact card for tax recordkeeping from closed deals (no tax calc/advice) */}
        <div
          className="mt-4 card p-3 border border-[#252A38] cursor-pointer hover:border-[#22c55e]/40 hover:shadow-[0_0_0_1px_#22c55e20] transition-all"
          role="button"
          tabIndex={0}
          onClick={() => openDrawer({ type: 'tax', title: 'Tax Prep / Records' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDrawer({ type: 'tax', title: 'Tax Prep / Records' });
            }
          }}
        >
          <div className="font-semibold text-sm mb-1 flex items-center justify-between">
            <span>Tax Prep / Records</span>
            <span className="text-[10px] text-[#64748B]">from closed deals • recordkeeping only</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2 text-sm">
            <div>Gross income received: <span className="font-mono">{formatMoneyCompact(ytdGrossFees)}</span></div>
            <div>Net income: <span className="font-mono font-semibold text-[#22c55e]">{formatMoneyCompact(ytdNetIncome)}</span></div>
            <div>Assignment fees: <span className="font-mono">{formatMoneyCompact(ytdAssignmentFees)}</span></div>
            <div>JV commissions paid: <span className="font-mono">{formatMoneyCompact(ytdJVComms)}</span></div>
            <div>Double-close profit: <span className="font-mono">{formatMoneyCompact(ytdDoubleClose)}</span></div>
            <div>Number of closed deals: <span className="font-mono">{ytdClosedWithNet.length}</span></div>
          </div>
          <div className="flex flex-wrap gap-2 mb-1.5">
            <button onClick={(e) => { e.stopPropagation(); doTaxCsvExport(currentYear, false); }} className="text-xs px-2 py-1 rounded bg-[#252A38] hover:bg-[#22c55e]/20 border border-[#252A38]">Download Tax Prep CSV</button>
            <button onClick={(e) => { e.stopPropagation(); doTaxCsvExport(currentYear, true); }} className="text-xs px-2 py-1 rounded bg-[#252A38] hover:bg-[#3b82f6]/20 border border-[#252A38]">Download Income Summary CSV</button>
          </div>
          <div className="text-[10px] text-[#64748B] leading-tight">For recordkeeping only, confirm tax treatment with a tax professional.</div>
        </div>
      </div>

      {/* ========== CLOSING HISTORY (table or empty) ========== */}
      <div className="mt-7">
        <div className="font-semibold text-lg mb-3">Closing History</div>
        {closedDeals.length === 0 ? (
          <div className="card p-6 border border-[#252A38] bg-[#0A0C12] text-center">
            <div className="text-[#8B92A3] text-sm">No closed deal history yet. Closed deals will appear here once marked as Closed/Sold with fee data.</div>
            <div className="text-[10px] text-[#64748B] mt-2">Use Pipeline to update status to Sold and populate closing.commission* + pricing.assignmentFee.</div>
          </div>
        ) : (
          <div className="card p-0 overflow-x-auto border border-[#252A38]">
            <table className="w-full text-sm">
              <thead className="bg-[#11151F] text-[#8B92A3]">
                <tr>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Deal / Property</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Market</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Asset</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Closed Date</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Partner / JV</th>
                  <th className="text-right px-2.5 py-1.5 font-medium text-xs">Gross Fee</th>
                  <th className="text-right px-2.5 py-1.5 font-medium text-xs">JV Split / Comm</th>
                  <th className="text-right px-2.5 py-1.5 font-medium text-xs">Net Income</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Source</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252A38]">
                {closedDeals.map((d: any) => {
                  const net = getNetIncome(d)
                  const gross = getGrossForDeal(d)
                  const comm = getCommission(d)
                  const mkt = `${safeStr(d.property?.city)}, ${safeStr(d.property?.state)}`.replace(/^, |, $/, '')
                  const partner = safeStr(d.submitter?.name, '—')
                  const jvNote = d.submitter?.jvStructure ? ` • ${d.submitter.jvStructure}` : ''
                  const dealName = d.property?.address || 'Untitled'
                  const partnerFull = `${partner}${jvNote}`
                  return (
                    <tr
                      key={d.id}
                      onClick={() => openDealDetails(d)}
                      className="hover:bg-[#171B26] cursor-pointer transition-colors"
                      title="Open deal details"
                    >
                      <td className="px-2.5 py-1.5 font-medium truncate max-w-[220px]" title={dealName}>{dealName}</td>
                      <td className="px-2.5 py-1.5 text-[#8B92A3]">{mkt || '—'}</td>
                      <td className="px-2.5 py-1.5 text-[#8B92A3]">{safeStr(d.property?.type)}</td>
                      <td className="px-2.5 py-1.5 tabular-nums text-[#8B92A3] text-xs">{formatDateSafe(getCloseDateStr(d))}</td>
                      <td className="px-2.5 py-1.5 text-[#8B92A3] truncate max-w-[140px]" title={partnerFull}>{partnerFull}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-xs">{formatMoneyFull(gross)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-[#8B92A3] text-xs">{comm ? formatMoneyFull(comm) : (d.submitter?.jvStructure || '—')}</td>
                      <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-xs" style={{ color: net > 0 ? '#22c55e' : '#E6E8EE' }}>{formatMoneyFull(net)}</td>
                      <td className="px-2.5 py-1.5 text-[#8B92A3] text-xs">{safeStr(d.submitter?.role || d.source, '—')}</td>
                      <td className="px-2.5 py-1.5"><span className="px-1 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] text-[10px]">{d.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {closedDeals.length > 0 && (
          <div className="text-[10px] text-[#64748B] mt-1.5">Click any row to open full deal details. Net = assignment + commission + double-close spread (if buyerPrice set).</div>
        )}
      </div>

      {/* Right-side details drawer / sideview for KPI, sections, and ALL new income metrics */}
      {drawerOpen && drawerData && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 z-[90]" 
            onClick={closeDrawer}
          />
          <div 
            className="fixed right-0 top-14 bottom-0 w-full max-w-md bg-[#0A0C12] border-l border-[#252A38] z-[100] p-4 overflow-auto shadow-2xl transition-transform"
            style={{ boxShadow: drawerData.border ? `0 0 0 1px ${drawerData.border}30` : undefined }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-lg" style={{ color: drawerData.text || '#E6E8EE' }}>
                {drawerData.label || drawerData.title}
              </div>
              <button 
                onClick={closeDrawer} 
                className="text-[#8B92A3] hover:text-white text-xl leading-none p-1"
                aria-label="Close drawer"
              >
                Ã—
              </button>
            </div>

            {drawerData.value !== undefined && (
              <div className="text-4xl font-semibold tabular-nums mb-1" style={{ color: drawerData.text || '#E6E8EE' }}>
                {drawerData.value}
              </div>
            )}

            {drawerData.type !== 'tax' && (
              <div className="text-sm text-[#8B92A3] mb-3">
                {drawerData.desc || drawerData.support || 'Details for selected item.'}
              </div>
            )}

            {/* Calculation method for income + new coverage/period/tax metrics */}
            {(drawerData.type === 'income' || drawerData.type === 'coverage' || drawerData.type === 'income-period' || drawerData.type === 'tax') && drawerData.calc && (
              <div className="mb-3 p-2 rounded border border-[#252A38] bg-[#0A0B0F]">
                <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-0.5">Calculation / Source</div>
                <div className="text-xs text-[#C8CBD4]">{drawerData.calc}</div>
              </div>
            )}

            {drawerData.type === 'tax' && (
              <div className="mb-3 p-2 rounded border border-[#252A38] bg-[#0A0B0F] text-sm">
                <div className="flex flex-wrap gap-2 mb-2 items-center">
                  <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value))} className="bg-[#0A0C12] border border-[#252A38] text-sm rounded px-2 py-1">
                    {availableYears.map((y:number)=><option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={taxPeriod} onChange={e => { setTaxPeriod(e.target.value as any); setTaxMonth(null) }} className="bg-[#0A0C12] border border-[#252A38] text-sm rounded px-2 py-1">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  {taxPeriod === 'monthly' && (
                    <select value={taxMonth ?? ''} onChange={e => setTaxMonth(e.target.value==='' ? null : parseInt(e.target.value))} className="bg-[#0A0C12] border border-[#252A38] text-sm rounded px-2 py-1">
                      <option value="">All months</option>
                      {Array.from({length:12},(_,m)=><option key={m} value={m}>{new Date(2000,m,1).toLocaleString('default',{month:'short'})}</option>)}
                    </select>
                  )}
                </div>
                {(() => {
                  const t = getTaxFilteredData(taxYear, taxPeriod, taxMonth)
                  const br = getIncomeBreakdowns(t.deals)
                  return (
                    <>
                      <div className="text-[10px] font-medium mt-1 mb-0.5">Summary Metrics</div>
                      <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">Gross Income: <span className="font-mono">{formatMoneyCompact(t.gross)}</span></div>
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">Net Income: <span className="font-mono font-semibold text-[#22c55e]">{formatMoneyCompact(t.net)}</span></div>
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">JV Commissions Paid: <span className="font-mono">{formatMoneyCompact(t.jv)}</span></div>
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">Assignment Fees: <span className="font-mono">{formatMoneyCompact(t.assign)}</span></div>
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">Double-Close Profit: <span className="font-mono">{formatMoneyCompact(t.dbl)}</span></div>
                        <div className="p-2 rounded border border-[#252A38] bg-[#11151F]">Closed Deals Count: <span className="font-mono">{t.deals.length}</span></div>
                      </div>

                      <div className="text-[10px] font-medium mt-1 mb-0.5 text-[#C5C9D3]">Income by Month</div>
                      <div className="text-xs mb-1 border border-[#252A38] rounded p-1 bg-[#0A0C12] space-y-0.5">
                        {br.byMonth.length ? br.byMonth.slice(0,6).map(([k,v],i) => <div key={i} className="flex justify-between"><span>{k}</span><span className="font-mono tabular-nums">{formatMoneyCompact(v)}</span></div>) : <div>$0 — No closed deal records yet.</div>}
                      </div>

                      <div className="text-[10px] font-medium mb-0.5 text-[#C5C9D3]">Income by Partner</div>
                      <div className="text-xs mb-1 border border-[#252A38] rounded p-1 bg-[#0A0C12] space-y-0.5">
                        {br.byPartner.length ? br.byPartner.slice(0,5).map(([k,v],i) => <div key={i} className="flex justify-between"><span className="truncate pr-1">{k}</span><span className="font-mono tabular-nums">{formatMoneyCompact(v)}</span></div>) : <div>$0 — No closed deal records yet.</div>}
                      </div>

                      <div className="text-[10px] font-medium mb-0.5 text-[#C5C9D3]">Income by Asset Type</div>
                      <div className="text-xs mb-1 border border-[#252A38] rounded p-1 bg-[#0A0C12] space-y-0.5">
                        {br.byAsset.length ? br.byAsset.slice(0,5).map(([k,v],i) => <div key={i} className="flex justify-between"><span>{k}</span><span className="font-mono tabular-nums">{formatMoneyCompact(v)}</span></div>) : <div>$0 — No closed deal records yet.</div>}
                      </div>

                      <div className="text-[10px] font-medium mb-0.5 text-[#C5C9D3]">Income by State / Market</div>
                      <div className="text-xs mb-1 border border-[#252A38] rounded p-1 bg-[#0A0C12] space-y-0.5">
                        {br.byMarket.length ? br.byMarket.slice(0,5).map(([k,v],i) => <div key={i} className="flex justify-between"><span>{k}</span><span className="font-mono tabular-nums">{formatMoneyCompact(v)}</span></div>) : <div>$0 — No closed deal records yet.</div>}
                      </div>

                      <div className="text-[10px] font-medium mt-1 mb-0.5">Closed Deal Ledger</div>
                      <div className="max-h-32 overflow-auto text-xs border border-[#252A38] rounded p-1 bg-[#0A0C12]">
                        {t.deals.length === 0 ? (
                          <div>No closed deal records yet.</div>
                        ) : (
                          <>
                            <div className="grid grid-cols-6 gap-1 text-xs font-medium text-[#8B92A3] border-b border-[#252A38] pb-0.5 mb-0.5">
                              <span>Deal / Property</span>
                              <span>Closed Date</span>
                              <span>Market / State</span>
                              <span>Gross Fee</span>
                              <span>JV Comm</span>
                              <span>Net Income</span>
                            </div>
                            {t.deals.slice(0,10).map((d:any, i:number) => {
                              const gross = getGrossForDeal(d);
                              const jv = getCommission(d);
                              const net = getNetIncome(d);
                              return (
                                <div key={i} className="grid grid-cols-6 gap-1 text-xs py-1 border-b border-[#252A38] last:border-0">
                                  <span className="truncate">{safeStr(d?.property?.address, d?.id || '—')}</span>
                                  <span className="text-[#8B92A3]">{formatDateSafe(getCloseDateStr(d))}</span>
                                  <span className="text-[#8B92A3]">{safeStr(d?.property?.state, '—')}</span>
                                  <span className="text-right tabular-nums">{formatMoneyCompact(gross)}</span>
                                  <span className="text-right tabular-nums text-[#8B92A3]">{formatMoneyCompact(jv)}</span>
                                  <span className="text-right tabular-nums font-semibold" style={{ color: net > 0 ? '#22c55e' : undefined }}>{formatMoneyCompact(net)}</span>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => doTaxCsvExport(taxYear, false, taxPeriod, taxMonth)} className="text-xs px-2 py-1 rounded bg-[#252A38] hover:bg-[#22c55e]/20 border border-[#252A38]">Download Tax Prep CSV</button>
                        <button onClick={() => doTaxCsvExport(taxYear, true, taxPeriod, taxMonth)} className="text-xs px-2 py-1 rounded bg-[#252A38] hover:bg-[#3b82f6]/20 border border-[#252A38]">Download Income Summary CSV</button>
                      </div>
                      <div className="text-[9px] mt-1 text-[#64748B]">For recordkeeping only, confirm tax treatment with a tax professional.</div>
                    </>
                  )
                })()}
              </div>
            )}

            {drawerData.type !== 'tax' && (
              /* Related Details - always present with actual records; supports partner clicks */
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1.5">Related Details</div>
                {(() => {
                  const details = getRelatedDetails(drawerData)
                  if (!details || details.length === 0) {
                    if (drawerData.key === 'dealsMarketed') {
                      return <div className="text-sm text-[#64748B] italic">No marketed deals yet. Deals will appear here after being blasted or sent to buyers.</div>
                    }
                    if (drawerData.key && (drawerData.key.includes('Income') || drawerData.key.includes('Closed') || drawerData.type === 'income' || drawerData.type === 'income-period')) {
                      return <div className="text-sm text-[#64748B] italic">No closed records yet. Closed deals will appear here once marked as Closed/Sold with fee data.</div>
                    }
                    if (drawerData.type === 'coverage') {
                      return <div className="text-sm text-[#64748B] italic">No buyers in this segment yet.</div>
                    }
                    return <div className="text-sm text-[#64748B] italic">No related records yet.</div>
                  }
                  return (
                    <div className="space-y-1 text-sm border border-[#252A38] rounded p-2 bg-[#0A0B0F]">
                      {details.map((item: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="border-b border-[#252A38] last:border-0 py-1.5 px-1 hover:bg-[#171B26] rounded cursor-pointer"
                          onClick={() => {
                            if (item.kind === 'buyer' && item.id) {
                              const b = buyers.find((bb: any) => bb.id === item.id)
                              if (b) openBuyerDetails(b)
                            } else if (item.kind === 'deal' && item.id) {
                              const d = deals.find((dd: any) => dd.id === item.id)
                              if (d) openDealDetails(d)
                            } else if ((item.kind === 'partner' || drawerData.type === 'partner') && item.label) {
                              const cnt = typeof item.value === 'string' && item.value.match(/\d+/) ? parseInt(item.value.match(/\d+/)[0]) : 1
                              openPartnerDetails(item.label, cnt)
                            } else if (item.kind === 'coverage' && item.mode && item.rawKey != null) {
                              openBuyerCoverage(item.mode, item.rawKey, item.count || 0)
                            }
                          }}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.label}</div>
                            <div className="text-xs text-[#8B92A3]">{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {drawerData.relatedDetails && Array.isArray(drawerData.relatedDetails) && drawerData.relatedDetails.length > 0 && drawerData.type !== 'tax' && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1">Additional Details</div>
                <div className="space-y-1 text-sm border border-[#252A38] rounded p-2 bg-[#0A0B0F]">
                  {drawerData.relatedDetails.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.label}</span>
                      <span className="font-mono text-xs">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drawerData.type === 'tax' ? (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1">Suggested Tax Record Action</div>
                <div className="text-sm text-[#E6E8EE] mb-2">Download your CSV ledger and send it to your CPA/bookkeeper.</div>
                <button 
                  onClick={closeDrawer}
                  className="text-xs px-3 py-1 rounded bg-[#252A38] hover:bg-[#3B82F6]/20 border border-[#252A38] hover:border-[#3B82F6]/40"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1">Suggested Next Action</div>
                <div className="text-sm text-[#E6E8EE] mb-2">{drawerData.action || 'Review related records and take follow-up action.'}</div>

                {drawerData.buttons && drawerData.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {drawerData.buttons.map((btn: string, i: number) => (
                      <button 
                        key={i}
                        onClick={() => closeDrawer()}
                        className="text-xs px-2 py-1 rounded bg-[#252A38] hover:bg-[#22C55E]/20 border border-[#252A38] hover:border-[#22C55E]/40"
                      >
                        {btn}
                      </button>
                    ))}
                  </div>
                )}

                <button 
                  onClick={closeDrawer}
                  className="text-xs px-3 py-1 rounded bg-[#252A38] hover:bg-[#3B82F6]/20 border border-[#252A38] hover:border-[#3B82F6]/40"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}


