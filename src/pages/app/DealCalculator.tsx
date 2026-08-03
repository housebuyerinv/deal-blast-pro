
﻿import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { toast } from 'sonner'
import { Calculator, Copy, Save, Download, ChevronLeft, TrendingUp, Wrench, Target, Home, Coins, Lock, Database } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  canAccessCalculatorEntitlement,
  getCalculatorLockMessage,
  getCalculatorPlanSubtitle,
  getEffectiveCalculatorPlan,
  type CalculatorEntitlementId,
  type CalculatorTabId,
} from '../../lib/calculatorAccess'
import { hasOwnerAdminBypass } from '../../lib/accessControl'
import { getOwnerPreviewPlan, isOwnerPreviewActive } from '../../lib/planAccess'
import { MOCK_PROPERTY_INTELLIGENCE_SAMPLE } from '../../lib/propertyIntelligence/mockProvider'
import { canShowSamplePropertyIntelligence } from '../../lib/customerExperiencePolicies'
import { supabase } from '../../lib/supabase'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

const sanitizePdfText = (value: any) =>
  String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

const escapePdfText = (value: string) =>
  sanitizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const wrapPdfLine = (line: string, maxLength = 92) => {
  const clean = sanitizePdfText(line)
  if (clean.length <= maxLength) return [clean]

  const words = clean.split(/\s+/)
  const wrapped: string[] = []
  let current = ''

  words.forEach(word => {
    if (!current) {
      current = word
      return
    }

    if ((current + ' ' + word).length <= maxLength) {
      current += ' ' + word
      return
    }

    wrapped.push(current)
    current = word
  })

  if (current) wrapped.push(current)
  return wrapped.length ? wrapped : ['']
}

const createSimplePdf = (title: string, body: string) => {
  const bodyLines = sanitizePdfText(body)
    .split('\n')
    .flatMap(line => line.trim() ? wrapPdfLine(line) : [''])

  const linesPerPage = 42
  const pages: string[][] = []
  for (let i = 0; i < bodyLines.length; i += linesPerPage) {
    pages.push(bodyLines.slice(i, i + linesPerPage))
  }
  if (!pages.length) pages.push([''])

  const objects: string[] = []
  const pageObjectIds: number[] = []

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  pages.forEach(pageLines => {
    const pageObjectId = objects.length + 1
    const contentObjectId = pageObjectId + 1
    pageObjectIds.push(pageObjectId)

    const contentLines = [
      'BT',
      '/F1 16 Tf',
      '50 760 Td',
      `(${escapePdfText(title)}) Tj`,
      '/F1 10 Tf',
      '0 -24 Td',
      ...pageLines.flatMap((line, index) => [
        index === 0 ? '' : '0 -14 Td',
        `(${escapePdfText(line)}) Tj`,
      ]).filter(Boolean),
      'ET',
    ]
    const content = contentLines.join('\n')

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}

const getPdfDateStamp = () => new Date().toISOString().slice(0, 10)

const buildPdfFilename = (slug: string) =>
  `deal-blast-pro-${slug}-summary-${getPdfDateStamp()}.pdf`

const validatePdfBlob = async (blob: Blob) => {
  if (!blob || blob.type !== 'application/pdf' || blob.size === 0) {
    throw new Error('Invalid PDF output')
  }

  const header = await blob.slice(0, 4).text()
  if (header !== '%PDF') {
    throw new Error('Generated file is not a valid PDF')
  }

  return { size: blob.size, header }
}

const generateValidatedPdf = async (title: string, body: string) => {
  const blob = createSimplePdf(title, body)
  const validation = await validatePdfBlob(blob)
  return { blob, validation }
}

const recordPdfValidation = (
  filename: string,
  title: string,
  validation: { size: number; header: string },
) => {
  const payload = {
    filename,
    title,
    size: validation.size,
    header: validation.header,
    validatedAt: new Date().toISOString(),
  }

  ;(window as any).__dealBlastLastPdfValidation = payload
  document.documentElement.dataset.dealBlastLastPdfValidation = JSON.stringify(payload)
}

const downloadPdf = async (filename: string, title: string, body: string) => {
  try {
    const { blob, validation } = await generateValidatedPdf(title, body)
    recordPdfValidation(filename, title, validation)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    toast.success('PDF downloaded')
  } catch (error) {
    console.error('[Deal Blast Pro] PDF generation failed:', error)
    toast.error('Unable to generate PDF')
  }
}

const previewPdf = async (title: string, body: string) => {
  try {
    const { blob, validation } = await generateValidatedPdf(title, body)
    recordPdfValidation('preview', title, validation)
    const url = URL.createObjectURL(blob)
    const preview = window.open(url, '_blank', 'noopener,noreferrer')
    if (!preview) {
      URL.revokeObjectURL(url)
      toast.error('Unable to open PDF preview')
      return
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch (error) {
    console.error('[Deal Blast Pro] PDF preview failed:', error)
    toast.error('Unable to generate PDF')
  }
}

type CalcTab = CalculatorTabId | 'propertyIntelligence'

interface TabDef {
  id: CalculatorEntitlementId
  label: string
  icon: React.ComponentType<any>
}

const tabs: TabDef[] = [
  { id: 'arv', label: 'ARV Calculator', icon: TrendingUp },
  { id: 'rehab', label: 'Rehab Calculator', icon: Wrench },
  { id: 'mao', label: 'MAO / Offer Calculator', icon: Target },
  { id: 'rental', label: 'Rental Deal Calculator', icon: Home },
  { id: 'creative', label: 'Creative Finance Calculator', icon: Coins },
  { id: 'propertyIntelligence', label: 'Property Intelligence', icon: Database },
]

export function parseSignedCurrency(value: string): number {
  const trimmed = String(value ?? '').trim()
  const isNegative =
    trimmed.startsWith('-') ||
    trimmed.startsWith('-$') ||
    trimmed.startsWith('$-')

  const numeric = trimmed.replace(/[^0-9.]/g, '')
  const parsed = Number(numeric)

  if (!Number.isFinite(parsed)) return 0

  return isNegative ? -Math.abs(parsed) : parsed
}

// Local ErrorBoundary — defined only inside this file.
// Any future error inside Deal Calculator is caught here and cannot poison
// the shared AppShell, SectionErrorBoundary, or sibling routes.
class LocalDealCalcBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: any) {
    console.error('Deal Calculator local boundary caught (isolated):', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <div className="text-2xl font-semibold mb-3">Deal Calculator</div>
          <p className="text-[#8B92A3] mb-4">
            Calculator tools temporarily disabled while repair is completed.
          </p>
          <Link to="/app/inventory" className="btn btn-primary">
            Back to Inventory Hub
          </Link>
        </div>
      )
    }
    return this.props.children
  }
}

export default function DealCalculator() {
  // ARV-only state for Step 1 (safe defaults, no selected deal required)
  const [activeTab, setActiveTab] = useState<CalcTab>('arv')
  const { trial, user, settings, deals } = useAppStore()
  const ownerPreviewActive = isOwnerPreviewActive(user, settings)
  const ownerAdminMode = hasOwnerAdminBypass(user) && !ownerPreviewActive
  const effectiveCalculatorPlan = getEffectiveCalculatorPlan(trial, user, settings)
  const calculatorAccessLabel = getCalculatorPlanSubtitle(effectiveCalculatorPlan)
  const canUseLivePropertyData = canAccessCalculatorEntitlement('propertyIntelligence', trial, user, settings)
  const canViewOwnerDetails = canUseLivePropertyData

  const [arvComps, setArvComps] = useState<Array<{
    salePrice: number;
    beds?: number;
    baths?: number;
    sqft: number;
    distance?: number;
    conditionNotes?: string;
    optionalAdj?: number;
    optionalAdjInput?: string;
  }>>([
    { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }
  ])
  const [subjectSqft, setSubjectSqft] = useState<number>(0)
  const [subjectBeds, setSubjectBeds] = useState<number>(0)
  const [subjectBaths, setSubjectBaths] = useState<number>(0)
  const [subjectAddress, setSubjectAddress] = useState('')
  const [subjectPropertyType, setSubjectPropertyType] = useState('')
  const [subjectConditionNotes, setSubjectConditionNotes] = useState('')
  const [adjustment, setAdjustment] = useState<number>(0)
  const [adjustmentInput, setAdjustmentInput] = useState('')
  const [adjType, setAdjType] = useState<'$' | '%'>('$')

  const [arvNotes, setArvNotes] = useState('')

  // Rehab state - safe default shape only (Step 2)
  const [rehabItems, setRehabItems] = useState([
    { id: 1, category: 'Kitchen', scope: 'Medium', cost: 3800, notes: '' },
    { id: 2, category: 'Bathrooms', scope: 'Medium', cost: 2400, notes: '' },
    { id: 3, category: 'Paint', scope: 'Light', cost: 1200, notes: '' },
    { id: 4, category: 'Flooring', scope: 'Light', cost: 1800, notes: '' },
  ])

  // MAO / Offer state - safe defaults only
  const [maoArv, setMaoArv] = useState(0)
  const [maoRehab, setMaoRehab] = useState(0)
  const [maoClosing, setMaoClosing] = useState(0)
  const [maoHolding, setMaoHolding] = useState(0)
  const [maoFee, setMaoFee] = useState(0)
  const [maoProfit, setMaoProfit] = useState(0)
  const [maoRule, setMaoRule] = useState('70')
  const [maoCustomRule, setMaoCustomRule] = useState(70)
  const [maoSellerBottom, setMaoSellerBottom] = useState(0)
  const [maoAsking, setMaoAsking] = useState(0)

  // Deal selection for prefill and Save to Deal (safe, isolated to this page)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [dealSearchTerm, setDealSearchTerm] = useState('')

  // Preselect from drawer via ?dealId or store currentDealId (no route changes needed elsewhere)
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const paramId = searchParams.get('dealId')
    const storeId = useAppStore.getState().currentDealId
    const target = paramId || storeId
    if (target) {
      setSelectedDealId(target)
      // Immediately prefill Subject fields (not comps) so drawer "Open Full" works without extra click
      doPrefillFromDeal(target)
    }
  }, []) // mount only; drawer link + store currentDealId enable full roundtrip

  useEffect(() => {
    if (!canAccessCalculatorEntitlement(activeTab, trial, user, settings)) {
      const lock = getCalculatorLockMessage(activeTab, trial, user, settings)
      setActiveTab('arv')
      toast.info(lock.message)
    }
  }, [activeTab, trial.plan, trial.billingStatus, user?.email, settings.ownerPreviewPlan])

  // Rental Deal Calculator - safe defaults (all numbers)
  const [rentPurchase, setRentPurchase] = useState(0)
  const [rentRehab, setRentRehab] = useState(0)
  const [rentClosing, setRentClosing] = useState(0)
  const [rentDown, setRentDown] = useState(0)
  const [rentLoan, setRentLoan] = useState(0)
  const [rentRate, setRentRate] = useState(0)
  const [rentTerm, setRentTerm] = useState(0)
  const [rentMonthly, setRentMonthly] = useState(0)
  const [rentOtherIncome, setRentOtherIncome] = useState(0)
  const [rentTaxes, setRentTaxes] = useState(0)
  const [rentIns, setRentIns] = useState(0)
  const [rentHOA, setRentHOA] = useState(0)
  const [rentUtil, setRentUtil] = useState(0)
  const [rentMgmt, setRentMgmt] = useState(0)
  const [rentVac, setRentVac] = useState(0)
  const [rentMaint, setRentMaint] = useState(0)
  const [rentCapex, setRentCapex] = useState(0)
  const [rentRepairPct, setRentRepairPct] = useState(0)
  const [rentDebtService, setRentDebtService] = useState(0)

  // Creative Finance - safe defaults (all numbers)
  const [crePurchase, setCrePurchase] = useState(0)
  const [creDown, setCreDown] = useState(0)
  const [creSellerPmt, setCreSellerPmt] = useState(0)
  const [creExistingPmt, setCreExistingPmt] = useState(0)
  const [creRate, setCreRate] = useState(0)
  const [creAmort, setCreAmort] = useState(0)
  const [creBalloon, setCreBalloon] = useState(0)
  const [creEntry, setCreEntry] = useState(0)
  const [creClosing, setCreClosing] = useState(0)
  const [creFee, setCreFee] = useState(0)
  const [creRent, setCreRent] = useState(0)
  const [creOtherIncome, setCreOtherIncome] = useState(0)
  const [creTaxes, setCreTaxes] = useState(0)
  const [creIns, setCreIns] = useState(0)
  const [creHOA, setCreHOA] = useState(0)
  const [creUtil, setCreUtil] = useState(0)
  const [creVac, setCreVac] = useState(0)
  const [creMaint, setCreMaint] = useState(0)
  const [creMgmt, setCreMgmt] = useState(0)

  const [propertySearch, setPropertySearch] = useState('')
  const [propertyLookupLoading, setPropertyLookupLoading] = useState(false)
  const [propertyAutocompleteLoading, setPropertyAutocompleteLoading] = useState(false)
  const [propertyAutocompleteMessage, setPropertyAutocompleteMessage] = useState('')
  const [propertyLookupError, setPropertyLookupError] = useState('')
  const [propertyCreditBlock, setPropertyCreditBlock] = useState<'' | 'zero_balance' | 'temporarily_unavailable'>('')
  const [propertyLookupResults, setPropertyLookupResults] = useState<any[]>([])
  const [propertyLookupSummary, setPropertyLookupSummary] = useState<any | null>(null)
  const [propertyLookupStatus, setPropertyLookupStatus] = useState('')
  const [propertyCreditBalance, setPropertyCreditBalance] = useState<any | null>(null)
  const [propertyCreditPacks, setPropertyCreditPacks] = useState<any[]>([])
  const [creditCheckoutLoading, setCreditCheckoutLoading] = useState('')
  const [propertyConnection, setPropertyConnection] = useState<{ status: string; connected: boolean; checked: boolean }>({
    status: canUseLivePropertyData ? 'Testing Connection' : 'Pro Required',
    connected: false,
    checked: false,
  })
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [selectedPropertyAddress, setSelectedPropertyAddress] = useState<any | null>(null)
  const [propertyDealId, setPropertyDealId] = useState('')
  const [propertyTab, setPropertyTab] = useState<'Property' | 'Owner' | 'Comps' | 'History' | 'Market' | 'Merge'>('Property')
  const [propertyMergeRows, setPropertyMergeRows] = useState<any[]>([])
  const [selectedPropertyCompIds, setSelectedPropertyCompIds] = useState<string[]>([])
  const propertySuggestRef = useRef<HTMLDivElement | null>(null)

  // Safe ARV helpers (all guarded)
  const formatCurrency = (n: any) => {
    const num = Number(n)
    if (!isFinite(num)) return '$0'
    const rounded = Math.round(num)
    return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toLocaleString()}`
  }
  const formatSignedCurrency = (n: any) => {
    const num = Number(n)
    if (!isFinite(num) || Math.round(num) === 0) return '$0'
    return `${num > 0 ? '+' : '-'}$${Math.abs(Math.round(num)).toLocaleString()}`
  }
  const formatPpsqft = (n: any) => {
    const num = Number(n)
    return '$' + (isFinite(num) ? num.toFixed(2) : '0.00')
  }

  const formatValue = (value: any) => {
    if (value === undefined || value === null || value === '') return 'Not available'
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : 'Not available'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }

  const toTitleCase = (value: any) => String(value || '').trim().replace(/\w\S*/g, part => {
    const upper = part.toUpperCase()
    if (/^[A-Z]{2}$/.test(upper)) return upper
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  })

  const formatAddressLabel = (address: any) =>
    [address?.line1 || address?.address, toTitleCase(address?.city), String(address?.state || '').trim().toUpperCase(), address?.postalCode || address?.zip || address?.zipCode]
      .filter(Boolean)
      .join(', ')

  const parseTypedPropertyAddress = (value: string) => {
    const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean)
    const stateZip = parts[2] || ''
    const stateMatch = stateZip.match(/\b([A-Z]{2})\b/i)
    const zipMatch = stateZip.match(/\b\d{5}(?:-\d{4})?\b/)
    return {
      line1: parts[0] || '',
      city: parts[1] || '',
      state: stateMatch?.[1]?.toUpperCase() || '',
      postalCode: zipMatch?.[0] || '',
    }
  }

  const isCompletePropertyAddress = (address: any) =>
    Boolean(address?.line1 && address?.city && address?.state)

  const propertyRequestRef = useRef<Map<string, Promise<any>>>(new Map())

  const propertyConnectionErrorStatus = (error: any) => {
    const code = error?.code || error?.payload?.code || ''
    if (code === 'pro_required') return 'Pro Required'
    if (code === 'provider_not_configured') return 'Provider Not Configured'
    if (code === 'provider_timeout') return 'Provider Timeout'
    if (code === 'rate_limited') return 'Rate Limited'
    if (error?.status === 401) return 'Sign In Required'
    return 'Provider Unavailable'
  }

  const activePropertyDeal = useMemo(
    () => (deals || []).find((deal: any) => deal.id === propertyDealId) || null,
    [deals, propertyDealId],
  )

  const intelligenceDealOptions = useMemo(() => {
    const hiddenStatuses = new Set(['Dead'])
    return (deals || [])
      .filter((deal: any) => deal?.id && !hiddenStatuses.has(deal.status))
      .map((deal: any) => {
        const property = deal.property || {}
        const price = deal.pricing?.askingPrice ? ` | ${formatCurrency(deal.pricing.askingPrice)}` : ''
        return {
          id: deal.id,
          label: `${property.address || 'Untitled property'}${property.city || property.state ? `, ${[property.city, property.state].filter(Boolean).join(', ')}` : ''} | ${property.type || 'Property'} | ${deal.status}${price}`,
        }
      })
  }, [deals])

  const selectedDealDbpValues = (deal: any) => {
    const property = deal?.property || {}
    const pricing = deal?.pricing || {}
    const condition = deal?.condition || {}
    const submitter = deal?.submitter || {}
    return {
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      county: property.county,
      propertyType: property.type || property.propertyType,
      beds: property.beds,
      baths: property.baths,
      sqft: property.sqft,
      lotSize: property.lotSize,
      yearBuilt: property.yearBuilt,
      units: property.units,
      occupancy: property.occupancy,
      askingPrice: pricing.askingPrice,
      contractPrice: pricing.contractPrice,
      arv: pricing.arv,
      repairEstimate: pricing.rehab,
      rent: pricing.currentRent || pricing.marketRent,
      sellerName: submitter.name,
      sellerPhone: submitter.phone,
      sellerEmail: submitter.email,
      submissionSource: deal?.source || submitter.role,
      propertyNotes: property.description || condition.rehabNotes || deal?.notes,
      status: deal?.status,
      photos: (deal?.docs || []).filter((doc: any) => /photo|image/i.test(doc.type || doc.name || '')),
    }
  }

  const buildPropertyMergeRows = (deal: any, summary: any) => {
    if (!deal || !summary) return []
    const current = selectedDealDbpValues(deal)
    const property = summary.property || {}
    const valuation = summary.valuation || {}
    const rent = summary.rent || {}
    const rows = [
      { key: 'property.address', label: 'Address', current: current.address, external: formatAddressLabel(property.address || summary.address), target: 'property', field: 'address' },
      { key: 'property.city', label: 'City', current: current.city, external: property.address?.city || summary.address?.city, target: 'property', field: 'city' },
      { key: 'property.state', label: 'State', current: current.state, external: property.address?.state || summary.address?.state, target: 'property', field: 'state' },
      { key: 'property.zip', label: 'ZIP', current: current.zip, external: property.address?.postalCode || summary.address?.postalCode, target: 'property', field: 'zip' },
      { key: 'property.county', label: 'County', current: current.county, external: property.county || property.address?.county, target: 'property', field: 'county' },
      { key: 'property.type', label: 'Property Type', current: current.propertyType, external: property.propertyType, target: 'property', field: 'type' },
      { key: 'property.beds', label: 'Beds', current: current.beds, external: property.beds, target: 'property', field: 'beds' },
      { key: 'property.baths', label: 'Baths', current: current.baths, external: property.baths, target: 'property', field: 'baths' },
      { key: 'property.sqft', label: 'Sq Ft', current: current.sqft, external: property.livingAreaSqft, target: 'property', field: 'sqft' },
      { key: 'property.lotSize', label: 'Lot Size', current: current.lotSize, external: property.lotSizeSqft, target: 'property', field: 'lotSize' },
      { key: 'property.yearBuilt', label: 'Year Built', current: current.yearBuilt, external: property.yearBuilt, target: 'property', field: 'yearBuilt' },
      { key: 'property.units', label: 'Units', current: current.units, external: property.units, target: 'property', field: 'units' },
      { key: 'pricing.arv', label: 'Estimated Value', current: current.arv, external: valuation.value || property.estimatedValue, target: 'pricing', field: 'arv' },
      { key: 'pricing.marketRent', label: 'Estimated Rent', current: current.rent, external: rent.rent, target: 'pricing', field: 'marketRent' },
    ]
    return rows
      .filter(row => row.external !== undefined && row.external !== null && row.external !== '')
      .map(row => ({
        ...row,
        action: row.current === row.external ? 'Match' : 'Review',
      }))
  }

  const fetchPropertyIntelligence = async (action: string, params: Record<string, any>) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      search.set(key, String(value))
    })
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      throw new Error('Sign in is required to use Property Intelligence.')
    }

    const requestKey = `${action}?${search.toString()}`
    const existing = propertyRequestRef.current.get(requestKey)
    if (existing) return existing

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 18000)
    const request = fetch(`/api/property-intelligence/${action}?${search.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          const error = new Error(payload?.error || 'Property Intelligence lookup failed')
          ;(error as any).code = payload?.code || ''
          ;(error as any).status = response.status
          ;(error as any).payload = payload
          throw error
        }

        return payload
      })
      .catch(error => {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error('Property Intelligence timed out. Please try again.')
          ;(timeoutError as any).code = 'provider_timeout'
          throw timeoutError
        }
        throw error
      })
      .finally(() => {
        window.clearTimeout(timeout)
        propertyRequestRef.current.delete(requestKey)
      })

    propertyRequestRef.current.set(requestKey, request)
    return request
  }

  const searchPropertyIntelligence = async () => {
    if (!canUseLivePropertyData) {
      setPropertyLookupResults([])
      setPropertyLookupError('Property Intelligence is available on the Pro plan. Manual property analysis remains available on every plan.')
      return
    }
    const query = propertySearch.trim()
    if (!query) {
      setPropertyLookupError('Enter a property address to search.')
      return
    }

    setPropertyAutocompleteLoading(true)
    setPropertyAutocompleteMessage('')
    setPropertyLookupError('')

    try {
      const payload = await fetchPropertyIntelligence('autocomplete', { query, limit: 8 })
      const results = Array.isArray(payload.results) ? payload.results : []
      setPropertyLookupResults(results)
      if (results.length === 0) setPropertyAutocompleteMessage('No verified address suggestions found. You can continue with a complete manual address.')
      setPropertyLookupSummary(null)
    } catch (error: any) {
      const messageByCode: Record<string, string> = {
        autocomplete_not_configured: 'Address suggestions are not configured. You can continue with a complete manual address.',
        provider_not_configured: 'Address suggestions are not configured. You can continue with a complete manual address.',
        autocomplete_authentication_failed: 'Address suggestions are not authorized. You can continue with a complete manual address.',
        rate_limited: 'Address suggestions are receiving too many requests. Wait a moment or continue with a complete manual address.',
        provider_network_failure: 'Address suggestions cannot reach the provider right now. You can continue with a complete manual address.',
        provider_timeout: 'Address suggestions timed out. You can continue with a complete manual address.',
      }
      setPropertyAutocompleteMessage(messageByCode[error?.code] || 'Address suggestions are temporarily unavailable. You can continue with a complete manual address.')
      setPropertyLookupResults([])
    } finally {
      setPropertyAutocompleteLoading(false)
    }
  }

  const loadPropertyIntelligenceForAddress = async (address: any, options: { refresh?: boolean } = {}) => {
    if (!canUseLivePropertyData) {
      setPropertyLookupError('Property Intelligence is available on the Pro plan. Manual property analysis remains available on every plan.')
      return
    }
    const normalizedAddress = isCompletePropertyAddress(address) ? address : parseTypedPropertyAddress(propertySearch)
    if (!isCompletePropertyAddress(normalizedAddress)) {
      setPropertyLookupError('Select a complete address from the suggestions before loading Property Intelligence.')
      return
    }
    const query = formatAddressLabel(normalizedAddress)
    if (!query) {
      setPropertyLookupError('Address not found.')
      return
    }

    const availableCredits = Number(propertyCreditBalance?.totalRemaining ?? (
      Number(propertyCreditBalance?.includedRemaining || 0) + Number(propertyCreditBalance?.purchasedRemaining || 0)
    ))
    if (!ownerAdminMode && propertyCreditBalance && availableCredits <= 0) {
      setPropertyCreditBlock('zero_balance')
      setPropertyLookupError('')
      setPropertyLookupStatus('')
      return
    }

    setPropertyLookupLoading(true)
    setPropertyCreditBlock('')
    setPropertyLookupError('')
    setPropertyLookupStatus('Loading property facts...')

    try {
      const operationId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const payload = await fetchPropertyIntelligence('lookup', {
        address: query,
        city: normalizedAddress.city,
        state: normalizedAddress.state,
        zipCode: normalizedAddress.postalCode,
        operationId,
        refresh: options.refresh ? 'true' : '',
      })

      const summary = {
        address: normalizedAddress,
        property: payload.property,
        owner: payload.owner,
        valuation: payload.valuation,
        rent: payload.rent,
        comps: payload.comps || [],
        history: payload.history || [],
        market: payload.market,
        cache: payload.cache,
        usage: payload.usage,
        retrievedAt: new Date().toISOString(),
      }
      if (payload.usage) setPropertyCreditBalance(payload.usage)
      setPropertyLookupSummary(summary)
      setPropertyLookupResults([])
      setPropertyMergeRows(buildPropertyMergeRows(activePropertyDeal, summary))
      setSelectedPropertyCompIds([])
      setPropertyTab('Property')
      setPropertyLookupStatus('')
      if (payload.cache?.status === 'hit') {
        setPropertyLookupStatus('Cached result. No lookup credit used.')
      } else if (payload.usage?.creditUsed) {
        setPropertyLookupStatus('Property data loaded successfully.')
      }
    } catch (error: any) {
      if (['credits_required', 'credits_exhausted'].includes(String(error?.code || ''))) {
        setPropertyCreditBlock('zero_balance')
        setPropertyLookupError('')
      } else {
        setPropertyCreditBlock(error?.code === 'credit_service_unavailable' ? 'temporarily_unavailable' : '')
        setPropertyLookupError(error?.message || 'Property Intelligence lookup failed')
      }
      setPropertyLookupStatus('')
    } finally {
      setPropertyLookupLoading(false)
    }
  }

  const selectPropertyIntelligenceResult = (result: any) => {
    setPropertyCreditBlock('')
    setPropertyLookupResults([])
    setPropertyAutocompleteLoading(false)
    const address = result?.address || {}
    if (address.line1 && address.city && address.state) {
      setSelectedPropertyAddress(address)
      setPropertySearch(result?.label || formatAddressLabel(address))
      setPropertyAutocompleteMessage('Complete address selected. Choose Load Property Intelligence when you are ready.')
    } else {
      setSelectedPropertyAddress(null)
      setPropertySearch(result?.label || propertySearch)
      setPropertyAutocompleteMessage('The selected suggestion was incomplete. You can continue with a complete manual address.')
    }
  }

  useEffect(() => {
    const query = propertySearch.trim()
    if (!canUseLivePropertyData) {
      setPropertyLookupResults([])
      setPropertyAutocompleteLoading(false)
      return
    }
    if (query.length < 5 || selectedPropertyAddress && query === formatAddressLabel(selectedPropertyAddress)) {
      setPropertyLookupResults([])
      setPropertyAutocompleteLoading(false)
      if (query.length < 5) setPropertyAutocompleteMessage('')
      return
    }

    const timer = window.setTimeout(() => {
      void searchPropertyIntelligence()
    }, 325)

    return () => window.clearTimeout(timer)
  }, [propertySearch, selectedPropertyAddress, canUseLivePropertyData])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!propertySuggestRef.current) return
      if (!propertySuggestRef.current.contains(event.target as Node)) setPropertyLookupResults([])
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (activeTab !== 'propertyIntelligence') return
    if (!canUseLivePropertyData) {
      setPropertyConnection({ status: 'Pro Required', connected: false, checked: true })
      return
    }
    let cancelled = false
    const checkConnection = async () => {
      setPropertyConnection({ status: 'Testing Connection', connected: false, checked: false })
      try {
        const previewPlan = getOwnerPreviewPlan(settings)
        const simulatedIncluded = previewPlan === 'Pro' ? 25 : previewPlan === 'Agency' ? 100 : previewPlan === 'Enterprise' ? 0 : 0
        const [payload, balance, packPayload] = await Promise.all([
          fetchPropertyIntelligence('status', {}),
          ownerPreviewActive
            ? Promise.resolve({ includedRemaining: simulatedIncluded, purchasedRemaining: 0, totalRemaining: simulatedIncluded, simulated: true, resetDate: 'Preview cycle' })
            : fetchPropertyIntelligence('balance', {}).catch(() => null),
          fetchPropertyIntelligence('credit-packs', {}).catch(() => null),
        ])
        if (cancelled) return
        if (balance) setPropertyCreditBalance(balance)
        if (Array.isArray(packPayload?.packs)) setPropertyCreditPacks(packPayload.packs)
        setPropertyConnection({
          status: payload?.propertyDataConnected ? 'Property Data Connected' : (payload?.status || 'Connection Error'),
          connected: Boolean(payload?.propertyDataConnected),
          checked: true,
        })
      } catch (error: any) {
        if (cancelled) return
        setPropertyConnection({
          status: propertyConnectionErrorStatus(error),
          connected: false,
          checked: true,
        })
        if (error?.message) setPropertyLookupError(error.message)
      }
    }
    void checkConnection()
    return () => { cancelled = true }
  }, [activeTab, canUseLivePropertyData, ownerPreviewActive, settings.ownerPreviewPlan])

  const openCreditPackCheckout = async (packKey: string) => {
    if (ownerPreviewActive) { toast.info('Preview simulation only. No credit purchase or billing change was started.'); return }
    setCreditCheckoutLoading(packKey)
    try {
      const { data } = await supabase.auth.getSession()
      const response = await fetch('/api/property-intelligence/credit-packs', { method: 'POST', headers: {
        Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ packKey }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Credit checkout is unavailable.')
      window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch (error: any) { toast.error(error?.message || 'Credit checkout is unavailable.') }
    finally { setCreditCheckoutLoading('') }
  }

  const selectPropertyDeal = (id: string) => {
    setPropertyDealId(id)
    setSelectedDealId(id)
    doPrefillFromDeal(id)
    const deal = useAppStore.getState().getDeal(id)
    if (!deal) return
    const property = deal.property || {}
    const address = {
      line1: property.address,
      city: property.city,
      state: property.state,
      postalCode: property.zip,
      county: property.county,
    }
    setSelectedPropertyAddress(address)
    setPropertySearch(formatAddressLabel(address))
    setPropertyLookupSummary(null)
    setPropertyMergeRows([])
  }

  const applySelectedPropertyUpdates = () => {
    if (!propertyDealId) {
      toast.error('Select a deal before applying updates.')
      return
    }
    const propertyUpdates: Record<string, any> = {}
    const pricingUpdates: Record<string, any> = {}
    propertyMergeRows.forEach(row => {
      if (row.action !== 'Use New Value') return
      if (row.target === 'property') propertyUpdates[row.field] = row.external
      if (row.target === 'pricing') pricingUpdates[row.field] = Number(row.external) || row.external
    })
    if (Object.keys(propertyUpdates).length) useAppStore.getState().updateDealProperty(propertyDealId, propertyUpdates as any)
    if (Object.keys(pricingUpdates).length) useAppStore.getState().updateDealPricing(propertyDealId, pricingUpdates as any)
    const audit = {
      savedAt: new Date().toISOString(),
      source: 'Property Intelligence',
      updates: propertyMergeRows
        .filter(row => row.action === 'Use New Value')
        .map(row => ({ field: row.key, originalValue: row.current ?? null, updatedValue: row.external ?? null })),
    }
    const deal = useAppStore.getState().getDeal(propertyDealId)
    useAppStore.getState().updateDeal(propertyDealId, {
      notes: `${deal?.notes || ''}\n===PROPERTY_INTELLIGENCE_UPDATE:${audit.savedAt}===\n${JSON.stringify(audit)}\n`,
    })
    toast.success('Selected Property Intelligence updates saved to deal')
  }

  const sendSelectedCompsToArv = () => {
    const comps = (propertyLookupSummary?.comps || []).filter((comp: any) => selectedPropertyCompIds.includes(comp.id))
    if (!comps.length) {
      toast.error('Select at least one comparable first.')
      return
    }
    const next = comps.slice(0, 5).map((comp: any) => ({
      salePrice: Number(comp.salePrice) || 0,
      sqft: Number(comp.livingAreaSqft) || 0,
      beds: Number(comp.beds) || 0,
      baths: Number(comp.baths) || 0,
      distance: Number(comp.distanceMiles) || 0,
      conditionNotes: formatAddressLabel(comp.address),
      optionalAdj: 0,
      optionalAdjInput: '',
    }))
    while (next.length < 5) next.push({ salePrice: 0, sqft: 0 })
    setArvComps(next)
    if (propertyLookupSummary?.property?.livingAreaSqft) setSubjectSqft(Number(propertyLookupSummary.property.livingAreaSqft) || subjectSqft)
    if (propertyLookupSummary?.property?.beds) setSubjectBeds(Number(propertyLookupSummary.property.beds) || subjectBeds)
    if (propertyLookupSummary?.property?.baths) setSubjectBaths(Number(propertyLookupSummary.property.baths) || subjectBaths)
    setActiveTab('arv')
    toast.success('Selected comps sent to ARV Calculator')
  }

  const savePropertyIntelligenceToDeal = () => {
    if (!propertyDealId || !propertyLookupSummary) {
      toast.error('Select a deal and load Property Intelligence first.')
      return
    }
    const now = new Date().toISOString()
    const deal = useAppStore.getState().getDeal(propertyDealId)
    const saved = {
      savedAt: now,
      source: 'Property Intelligence',
      address: propertyLookupSummary.address,
      property: propertyLookupSummary.property,
      valuation: propertyLookupSummary.valuation,
      rent: propertyLookupSummary.rent,
      comps: (propertyLookupSummary.comps || []).filter((comp: any) => selectedPropertyCompIds.includes(comp.id)),
      history: propertyLookupSummary.history,
      market: propertyLookupSummary.market,
    }
    useAppStore.getState().updateDeal(propertyDealId, {
      notes: `${deal?.notes || ''}\n===PROPERTY_INTELLIGENCE:${now}===\n${JSON.stringify(saved)}\n`,
    })
    toast.success('Property Intelligence saved to deal')
  }

  const applySuggestedArv = () => {
    const suggested = Number(propertyLookupSummary?.valuation?.value || propertyLookupSummary?.property?.estimatedValue || 0)
    if (!suggested || !Number.isFinite(suggested)) {
      toast.error('No suggested ARV is available from Property Intelligence.')
      return
    }
    setMaoArv(Math.round(suggested))
    if (propertyLookupSummary?.address) setSubjectAddress(formatAddressLabel(propertyLookupSummary.address))
    if (propertyLookupSummary?.property?.livingAreaSqft) setSubjectSqft(Number(propertyLookupSummary.property.livingAreaSqft) || subjectSqft)
    if (propertyLookupSummary?.property?.beds) setSubjectBeds(Number(propertyLookupSummary.property.beds) || subjectBeds)
    if (propertyLookupSummary?.property?.baths) setSubjectBaths(Number(propertyLookupSummary.property.baths) || subjectBaths)
    if (propertyLookupSummary?.property?.propertyType) setSubjectPropertyType(propertyLookupSummary.property.propertyType)
    setActiveTab('mao')
    toast.success('Suggested ARV applied to MAO / Offer Calculator')
  }

  // Shared saver (notes hack, no schema change) — used by all tabs + drawer Quick Calc
  const saveCalcResultToDeal = (type: CalcTab, data: Record<string, any>) => {
    const id = selectedDealId
    if (!id) { toast.error('Select a deal first to save'); return }
    const deal = useAppStore.getState().getDeal(id)
    if (!deal) return
    const now = new Date().toISOString()
    const block = `\n===CALC:${type.toUpperCase()}:${now}===\n${JSON.stringify({ type, savedAt: now, ...data })}\n`
    const current = deal.notes || ''
    useAppStore.getState().updateDeal(id, { notes: current + block })
    toast.success(`${type.toUpperCase()} result saved to deal`)
  }

  // Safe prefill ONLY to Subject fields (never comps). Used by dropdown + drawer ?dealId link.
  const doPrefillFromDeal = (id: string | null) => {
    if (!id) return
    const deal = useAppStore.getState().getDeal(id)
    if (!deal) return
    const p: any = deal.property || {}
    const pr: any = deal.pricing || {}
    const c: any = deal.condition || {}
    // Subject fields (ARV card + common) - all optional / null-safe
    if (p.address) setSubjectAddress(p.address)
    if (p.beds != null) setSubjectBeds(Number(p.beds) || 0)
    if (p.baths != null) setSubjectBaths(Number(p.baths) || 0)
    if (p.sqft != null) setSubjectSqft(Number(p.sqft) || 0)
    if (p.type || p.propertyType) setSubjectPropertyType(p.type || p.propertyType || '')
    if (c.rehabNotes || c.conditionNotes) setSubjectConditionNotes(c.rehabNotes || c.conditionNotes || '')
    // MAO related
    if (pr.askingPrice) setMaoAsking(Number(pr.askingPrice) || 0)
    if (pr.arv) setMaoArv(Number(pr.arv) || 0)
    if (pr.rehab) setMaoRehab(Number(pr.rehab) || 0)
  }

  const updateComp = (index: number, field: 'salePrice' | 'sqft' | 'beds' | 'baths' | 'distance' | 'conditionNotes' | 'optionalAdj' | 'optionalAdjInput', value: any) => {
    setArvComps(prev => {
      const next = [...(prev || [])]
      if (!next[index]) next[index] = { salePrice: 0, sqft: 0 }
      if (field === 'optionalAdjInput') {
        next[index] = { ...next[index], optionalAdjInput: String(value ?? ''), optionalAdj: parseSignedCurrency(String(value ?? '')) }
      } else {
        next[index] = { ...next[index], [field]: field === 'salePrice' || field === 'sqft' || field === 'beds' || field === 'baths' || field === 'distance' ? Math.max(0, Number(value) || 0) : field === 'optionalAdj' ? Number(value) || 0 : value }
      }
      return next
    })
  }

  const clearArv = () => {
    setArvComps([{ salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }, { salePrice: 0, sqft: 0 }])
    setSubjectSqft(0)
    setSubjectBeds(0)
    setSubjectBaths(0)
    setAdjustment(0)
    setAdjustmentInput('')
    setAdjType('$')
    setArvNotes('')
    setSubjectAddress('')
    setSubjectPropertyType('')
    setSubjectConditionNotes('')
  }

  // ARV calculations (fully guarded)
  const safeArvComps = arvComps || []
  const validComps = safeArvComps.filter(c => (c?.salePrice || 0) > 0 && (c?.sqft || 0) > 0)
  const adjustedComps = validComps.map(c => {
    const compAdjustment = Number(c?.optionalAdj) || 0
    const adjustedSalePrice = (Number(c?.salePrice) || 0) + compAdjustment
    const adjustedPpsqft = (Number(c?.sqft) || 0) > 0 ? adjustedSalePrice / (Number(c?.sqft) || 1) : 0
    return { ...c, compAdjustment, adjustedSalePrice, adjustedPpsqft }
  })
  const avgPpsqft = adjustedComps.length > 0
    ? adjustedComps.reduce((s, c) => s + c.adjustedPpsqft, 0) / adjustedComps.length
    : 0
  const baseArv = avgPpsqft * (subjectSqft || 0)
  const adjustedArv = adjType === '$'
    ? baseArv + (adjustment || 0)
    : baseArv * (1 + ((adjustment || 0) / 100))

  const copyArv = () => {
    const compLines = adjustedComps.map((comp, index) =>
      `Comp ${index + 1}: Sale ${formatCurrency(comp.salePrice)} | Comp Adjustment ${formatSignedCurrency(comp.compAdjustment)} | Adjusted Sale ${formatCurrency(comp.adjustedSalePrice)} | Adjusted $/Sq Ft ${formatPpsqft(comp.adjustedPpsqft)}`
    ).join('\n')
    const text = `ARV Calculator\nComps used: ${validComps.length}\nAverage Adjusted Price / Sq Ft: ${formatPpsqft(avgPpsqft)}\nSubject sqft: ${subjectSqft || 0}\nBase ARV Before Subject Adjustment: ${formatCurrency(baseArv)}\nSubject Adjustment: ${adjType === '%' ? (adjustment || 0) + '%' : formatSignedCurrency(adjustment)}\nEstimated ARV: ${formatCurrency(adjustedArv)}\n\nComparable Adjustments:\n${compLines || '(none)'}\n\nNotes:\n${arvNotes || '(none)'}\n(Deal Blast Pro)`
    navigator.clipboard.writeText(text).then(() => toast.success('ARV results copied'))
  }

  const saveArv = () => {
    saveCalcResultToDeal('arv', {
      estARV: adjustedArv,
      avgPpsqft: Math.round(avgPpsqft * 100) / 100,
      baseArv,
      subjectSqft,
      subjectAdjustment: adjustment,
      adjType,
      compsUsed: validComps.length,
      comps: adjustedComps.map((comp, index) => ({
        index: index + 1,
        salePrice: comp.salePrice,
        sqft: comp.sqft,
        compAdjustment: comp.compAdjustment,
        adjustedSalePrice: comp.adjustedSalePrice,
        adjustedPpsqft: Math.round(comp.adjustedPpsqft * 100) / 100,
      })),
      notes: arvNotes || ''
    })
  }

  const buildArvPdfBody = () => {
    const compLines = adjustedComps.map((comp, index) =>
      [
        `Comp ${index + 1}`,
        `Original price: ${formatCurrency(comp.salePrice)}`,
        `Comp adjustment: ${formatSignedCurrency(comp.compAdjustment)}`,
        `Adjusted price: ${formatCurrency(comp.adjustedSalePrice)}`,
        `Adjusted price per sq ft: ${formatPpsqft(comp.adjustedPpsqft)}`,
        `Sq ft: ${comp.sqft || 0}`,
      ].join(' | ')
    ).join('\n')
    return `ARV Calculator
Subject address: ${subjectAddress || 'Not provided'}
Subject square footage: ${subjectSqft || 0}
Subject beds: ${subjectBeds || 0}
Subject baths: ${subjectBaths || 0}
Property type: ${subjectPropertyType || 'Not provided'}
Subject condition notes: ${subjectConditionNotes || 'Not provided'}

Valid comp count: ${validComps.length}
Original comp prices, adjustments, and adjusted values:
${compLines || '(none)'}

Average adjusted price per square foot: ${formatPpsqft(avgPpsqft)}
Base ARV: ${formatCurrency(baseArv)}
Subject adjustment: ${adjType === '%' ? (adjustment || 0) + '%' : formatSignedCurrency(adjustment)}
Estimated ARV: ${formatCurrency(adjustedArv)}

Analysis notes:
${arvNotes || '(none)'}

Generated timestamp: ${new Date().toISOString()}
Deal Blast Pro`
  }

  const exportArvPDF = () => {
    void downloadPdf(buildPdfFilename('arv'), 'ARV Calculator Results', buildArvPdfBody())
  }

  const previewArvPDF = () => {
    void previewPdf('ARV Calculator Results', buildArvPdfBody())
  }

  const resetArv = () => {
    clearArv()
  }

  // Rehab helpers - all safe, guarded (Step 2)
  const updateRehabItem = (id: any, field: any, value: any) => {
    setRehabItems(prev => (prev || []).map(item =>
      item.id === id
        ? { ...item, [field]: field === 'cost' ? Math.max(0, Number(value) || 0) : value }
        : item
    ))
  }

  const removeRehabItem = (id: any) => {
    setRehabItems(prev => (prev || []).filter(item => item.id !== id))
  }

  const addCustomRehabItem = () => {
    const newId = Date.now()
    setRehabItems(prev => [
      ...(prev || []),
      { id: newId, category: 'Custom Item', scope: 'Custom', cost: 500, notes: '' }
    ])
  }

  const applyRehabPreset = (preset: any) => {
    let base: any[] = []
    const mult = preset === 'Light Rehab' ? 0.6 : preset === 'Heavy Rehab' ? 1.6 : preset === 'Full Gut' ? 2.0 : 1.0

    if (preset === 'Light Rehab' || preset === 'Medium Rehab' || preset === 'Heavy Rehab' || preset === 'Full Gut') {
      base = [
        { id: 10, category: 'Kitchen', scope: 'Medium', cost: Math.round(3800 * mult), notes: '' },
        { id: 11, category: 'Bathrooms', scope: 'Medium', cost: Math.round(2400 * mult), notes: '' },
        { id: 12, category: 'Paint', scope: 'Light', cost: Math.round(1200 * mult), notes: '' },
        { id: 13, category: 'Flooring', scope: 'Light', cost: Math.round(1800 * mult), notes: '' },
        { id: 14, category: 'HVAC', scope: 'Light', cost: Math.round(2200 * mult), notes: '' },
      ]
    } else if (preset === 'Full Gut') {
      base = [
        { id: 10, category: 'Kitchen', scope: 'Heavy', cost: Math.round(3800 * 2), notes: '' },
        { id: 11, category: 'Bathrooms', scope: 'Heavy', cost: Math.round(2400 * 2), notes: '' },
        { id: 12, category: 'Paint', scope: 'Heavy', cost: Math.round(1200 * 2), notes: '' },
        { id: 13, category: 'Flooring', scope: 'Heavy', cost: Math.round(1800 * 2), notes: '' },
        { id: 14, category: 'HVAC', scope: 'Heavy', cost: Math.round(2200 * 2), notes: '' },
        { id: 15, category: 'Roof', scope: 'Heavy', cost: Math.round(6500), notes: '' },
        { id: 16, category: 'Electrical', scope: 'Heavy', cost: Math.round(3200), notes: '' },
        { id: 17, category: 'Plumbing', scope: 'Heavy', cost: Math.round(2800), notes: '' },
      ]
    }

    setRehabItems(base)
  }

  const clearRehab = () => {
    setRehabItems([])
  }

  // MAO helpers - fully guarded calculations
  const getMaoRulePercent = () => {
    if (maoRule === 'custom') return maoCustomRule || 0
    return parseFloat(maoRule) || 0
  }

  const maoPercent = getMaoRulePercent() / 100

  const grossMAO = (maoArv || 0) * maoPercent
  const totalDeductions = (maoRehab || 0) + (maoClosing || 0) + (maoHolding || 0) + (maoFee || 0) + (maoProfit || 0)
  const maoValue = Math.max(0, Math.round(grossMAO - totalDeductions))

  const buyerAllIn = (maoArv || 0) - maoValue   // rough all-in view
  const spread = maoValue - (maoSellerBottom || 0)
  const discountFromArv = maoArv > 0 ? ((maoArv - maoValue) / maoArv * 100) : 0

  const recommendedLow = Math.max(0, maoValue - 15000)
  const recommendedHigh = Math.max(0, maoValue - 5000)

  const dealStrength = () => {
    if (maoValue <= 0) return 'Weak'
    if (maoSellerBottom && maoSellerBottom > maoValue) return 'Weak'

    const asking = maoAsking || 0
    if (asking > maoValue) return 'Weak'
    if (asking > 0 && asking < maoValue * 0.85) return 'Strong' // meaningfully below MAO
    if (asking > 0 && asking <= maoValue) return 'Moderate'

    if (spread >= 20000 && maoProfit >= 10000) return 'Strong'
    if (spread >= 5000) return 'Moderate'
    return 'Weak'
  }

  const maoStrength = dealStrength()

  // New: Asking Price impact (null-safe)
  const askingVsMaoDiff = (maoAsking && maoAsking > 0) ? maoValue - maoAsking : null

  let negotiationTarget = 'N/A'
  if (maoAsking && maoAsking > 0) {
    if (maoAsking <= maoValue) {
      negotiationTarget = 'Asking price is within target range.'
      if (maoSellerBottom && maoSellerBottom > maoAsking) {
        negotiationTarget += ` Seller bottom line (${formatCurrency(maoSellerBottom)}) is higher.`
      }
    } else {
      const targetLow = Math.max(0, maoValue - 10000)
      const targetHigh = maoValue
      negotiationTarget = `Target offer: ${formatCurrency(targetLow)} – ${formatCurrency(targetHigh)}`
      if (maoSellerBottom && maoSellerBottom < maoAsking) {
        negotiationTarget += ` (Seller bottom ${formatCurrency(maoSellerBottom)} may be flexible)`
      }
    }
  }

  const profitRoomAfterAsking = askingVsMaoDiff // positive = good for buyer

  const copyMao = () => {
    const askingInfo = askingVsMaoDiff !== null 
      ? `\nAsking vs MAO: ${askingVsMaoDiff >= 0 ? 'Under by ' : 'Over by '}${formatCurrency(Math.abs(askingVsMaoDiff))}`
      : '\nAsking vs MAO: N/A'
    const text = `MAO Calculator\nMAO: ${formatCurrency(maoValue)}\nRecommended Seller Offer: ${formatCurrency(recommendedLow)} - ${formatCurrency(recommendedHigh)}\nBuyer All-In: ${formatCurrency(buyerAllIn)}\nSpread: ${formatCurrency(spread)}\nDiscount from ARV: ${discountFromArv.toFixed(1)}%\nDeal Strength: ${maoStrength}${askingInfo}\n(Deal Blast Pro)`
    navigator.clipboard.writeText(text).then(() => toast.success('MAO results copied'))
  }

  const saveMao = () => {
    saveCalcResultToDeal('mao', {
      mao: maoValue,
      recommendedLow,
      recommendedHigh,
      buyerAllIn,
      spread,
      discountFromArv: Math.round(discountFromArv * 10) / 10,
      strength: maoStrength,
      askingVsMaoDiff: askingVsMaoDiff,
      askingPrice: maoAsking || 0
    })
  }

  const exportMaoPDF = () => {
    const askingInfo = askingVsMaoDiff !== null 
      ? `\nAsking vs MAO Diff: ${askingVsMaoDiff >= 0 ? '+' : ''}${formatCurrency(askingVsMaoDiff)}`
      : '\nAsking vs MAO: N/A'
    const summary = `MAO / Offer Calculator
Inputs:
ARV: ${formatCurrency(maoArv)}
Rehab estimate: ${formatCurrency(maoRehab)}
Closing costs: ${formatCurrency(maoClosing)}
Holding costs: ${formatCurrency(maoHolding)}
Assignment / wholesale fee: ${formatCurrency(maoFee)}
Buyer profit / safety buffer: ${formatCurrency(maoProfit)}
Rule percent: ${getMaoRulePercent()}%
Seller bottom line: ${formatCurrency(maoSellerBottom)}
Current asking price: ${formatCurrency(maoAsking)}

Results:
Gross MAO before deductions: ${formatCurrency(grossMAO)}
Total deductions: ${formatCurrency(totalDeductions)}
MAO: ${formatCurrency(maoValue)}
Recommended seller offer: ${formatCurrency(recommendedLow)} - ${formatCurrency(recommendedHigh)}
Buyer all-in cost: ${formatCurrency(buyerAllIn)}
Spread: ${formatCurrency(spread)}
Discount from ARV: ${discountFromArv.toFixed(1)}%
Deal strength: ${maoStrength}${askingInfo}
Generated timestamp: ${new Date().toISOString()}
Deal Blast Pro`
    void downloadPdf(buildPdfFilename('mao'), 'MAO / Offer Results', summary)
  }

  // Rental calculations - all guarded against blank/0
  const rentGrossMonthly = (rentMonthly || 0) + (rentOtherIncome || 0)
  const rentOpExMonthly = (rentTaxes || 0) + (rentIns || 0) + (rentHOA || 0) + (rentUtil || 0) +
    (rentGrossMonthly * ((rentMgmt || 0) + (rentVac || 0) + (rentMaint || 0) + (rentCapex || 0) + (rentRepairPct || 0)) / 100)
  const rentNOIMonthly = rentGrossMonthly - rentOpExMonthly
  const rentNOI = rentNOIMonthly * 12
  const rentMonthlyCF = rentGrossMonthly - rentOpExMonthly - (rentDebtService || 0)
  const rentAnnualCF = rentMonthlyCF * 12
  const rentTotalCost = (rentPurchase || 0) + (rentRehab || 0) + (rentClosing || 0)
  const rentCapRate = rentTotalCost > 0 ? (rentNOI / rentTotalCost * 100) : 0
  const rentCoC = (rentDown || 0) > 0 ? (rentAnnualCF / (rentDown || 0) * 100) : 0
  const rentDSCR = (rentDebtService || 0) > 0 ? (rentNOI / ((rentDebtService || 0) * 12)) : 0
  const rentOnePercent = (rentPurchase || 0) > 0 ? ((rentMonthly || 0) >= 0.01 * (rentPurchase || 0)) : false
  const rentBreakEven = rentOpExMonthly + (rentDebtService || 0)

  const rentStrength = () => {
    if (rentMonthlyCF <= 0) return 'Weak'
    if (rentDSCR < 1.0) return 'Weak'
    if (rentCoC >= 10 && rentDSCR >= 1.25) return 'Strong'
    if (rentCoC >= 6 || rentDSCR >= 1.1) return 'Moderate'
    return 'Weak'
  }

  // Creative calculations - all guarded
  const creGrossMonthly = (creRent || 0) + (creOtherIncome || 0)
  const creOpExMonthly = (creTaxes || 0) + (creIns || 0) + (creHOA || 0) + (creUtil || 0) +
    (creGrossMonthly * ((creVac || 0) + (creMaint || 0) + (creMgmt || 0)) / 100)
  const creMonthlyCF = creGrossMonthly - (creSellerPmt || 0) - (creExistingPmt || 0) - creOpExMonthly
  const creAnnualCF = creMonthlyCF * 12
  const creTotalEntry = (creDown || 0) + (creEntry || 0) + (creClosing || 0) + (creFee || 0)
  const crePaybackMo = creMonthlyCF > 0 ? Math.ceil(creTotalEntry / creMonthlyCF) : 999
  const creCoC = creTotalEntry > 0 ? (creAnnualCF / creTotalEntry * 100) : 0

  const creStrength = () => {
    if (creMonthlyCF <= 0) return 'Weak'
    if (creCoC >= 12) return 'Strong'
    if (creCoC >= 6) return 'Moderate'
    return 'Weak'
  }

  // Simple tab content renderer (only ARV active)
  const renderTabContent = () => {
    if (!canAccessCalculatorEntitlement(activeTab, trial, user, settings)) {
      const lock = getCalculatorLockMessage(activeTab, trial, user, settings)
      return (
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <Lock size={22} />
          </div>
          <div className="text-xl font-semibold text-white mb-2">{lock.message}</div>
          <p className="mx-auto max-w-md text-sm text-[#8B92A3] mb-5">
            Current plan: {lock.currentPlan}. Required plan: {lock.requiredPlan}. Upgrade when you are ready to unlock this workflow.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-2">
            <Link to="/pricing" className="btn btn-ghost">View Plans</Link>
            {!ownerPreviewActive && <Link to="/app/upgrade" className="btn btn-green">Upgrade</Link>}
            <button onClick={() => setActiveTab('arv')} className="btn btn-ghost">Return to ARV Calculator</button>
          </div>
        </div>
      )
    }

    if (activeTab === 'arv') {
      return (
        <div>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold text-white">ARV Calculator</div>
              <div className="text-sm text-[#8B92A3]">Comps → Avg $/sqft → Subject ARV with adjustment</div>
            </div>
            <button onClick={resetArv} className="text-xs px-3 py-1 rounded border border-[#252A38] hover:bg-[#252A38] text-[#8B92A3]">Clear</button>
          </div>

          {/* Subject Property card (matches comp card visual style exactly) */}
          <div className="mb-4">
            <div className="text-xs uppercase tracking-widest text-[#8B92A3] mb-2">Subject Property</div>
            <div className="bg-[#0A0C12] border border-[#252A38] rounded-lg p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                <div className="md:col-span-3">
                  <div className="text-[#8B92A3]">Address</div>
                  <input type="text" value={subjectAddress} onChange={e => setSubjectAddress(e.target.value)} className="input py-1 text-sm w-full" placeholder="123 Main St" />
                </div>
                <div>
                  <div className="text-[#8B92A3]">Beds</div>
                  <input type="number" value={subjectBeds || ''} onChange={e => setSubjectBeds(Math.max(0, parseFloat(e.target.value) || 0))} className="input py-1 text-sm w-full" placeholder="" />
                </div>
                <div>
                  <div className="text-[#8B92A3]">Baths</div>
                  <input type="number" value={subjectBaths || ''} onChange={e => setSubjectBaths(Math.max(0, parseFloat(e.target.value) || 0))} className="input py-1 text-sm w-full" placeholder="" />
                </div>
                <div>
                  <div className="text-[#8B92A3]">Sq Ft</div>
                  <input type="number" value={subjectSqft || ''} onChange={e => setSubjectSqft(Math.max(0, parseFloat(e.target.value) || 0))} className="input py-1 text-sm w-full" placeholder="e.g. 1850" />
                </div>
                <div>
                  <div className="text-[#8B92A3]">Property Type</div>
                  <input type="text" value={subjectPropertyType} onChange={e => setSubjectPropertyType(e.target.value)} className="input py-1 text-sm w-full" placeholder="SFH / Multifamily..." />
                </div>
                <div>
                  <div className="text-[#8B92A3]">Condition / Notes</div>
                  <input type="text" value={subjectConditionNotes} onChange={e => setSubjectConditionNotes(e.target.value)} className="input py-1 text-sm w-full" placeholder="Updated, needs paint..." />
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[#8B92A3] text-[10px]">Subject Adjustment (+/- $)</div>
                    <div className="flex rounded overflow-hidden text-xs border border-[#252A38]">
                      <button onClick={() => setAdjType('$')} className={`px-3 py-0.5 ${adjType === '$' ? 'bg-[#22C55E] text-black' : 'hover:bg-[#171B26]'}`}>$</button>
                      <button onClick={() => setAdjType('%')} className={`px-3 py-0.5 ${adjType === '%' ? 'bg-[#22C55E] text-black' : 'hover:bg-[#171B26]'}`}>%</button>
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustmentInput}
                    onChange={e => {
                      setAdjustmentInput(e.target.value)
                      setAdjustment(adjType === '$' ? parseSignedCurrency(e.target.value) : Number(e.target.value) || 0)
                    }}
                    className="input py-1 text-sm w-full"
                    placeholder={adjType === '$' ? 'e.g. $8,000 or -$3,000' : 'e.g. 3 or -2'}
                  />
                  <div className="text-[10px] text-[#64748B] mt-1">Use a negative value when the comparable is superior to the subject and a positive value when it is inferior.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Comp Inputs - enhanced with quality fields (safe, guarded) */}
          <div className="mb-5">
            <div className="text-xs uppercase tracking-widest text-[#8B92A3] mb-2">Comparable Sales</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[0,1,2,3,4].map(i => {
                const comp = safeArvComps[i] || { salePrice: 0, sqft: 0 }
                const subjBeds = subjectBeds || 0
                const subjBaths = subjectBaths || 0
                const subjSqft = subjectSqft || 0

                // Simple quality score (0-100) based on similarity
                const bedsDiff = Math.abs((comp.beds || 0) - subjBeds)
                const bathsDiff = Math.abs((comp.baths || 0) - subjBaths)
                const sqftDiffPct = subjSqft > 0 ? Math.abs((comp.sqft - subjSqft) / subjSqft) : 1
                const qualityScore = Math.max(0, Math.min(100, Math.round(100 - (bedsDiff * 8 + bathsDiff * 10 + sqftDiffPct * 50))))

                return (
                  <div key={i} className="bg-[#0A0C12] border border-[#252A38] rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="text-[11px] font-medium text-[#CBD5E1]">Comp {i+1}{i > 2 ? ' (optional)' : ''}</div>
                      <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#252A38] text-[#8B92A3]">
                        Quality: {qualityScore}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[#8B92A3]">Sale Price</div>
                        <input type="number" value={comp.salePrice || ''} onChange={e => updateComp(i, 'salePrice', parseFloat(e.target.value))} className="input py-1 text-sm" placeholder="0" />
                      </div>
                      <div>
                        <div className="text-[#8B92A3]">Sq Ft</div>
                        <input type="number" value={comp.sqft || ''} onChange={e => updateComp(i, 'sqft', parseFloat(e.target.value))} className="input py-1 text-sm" placeholder="0" />
                      </div>
                      <div>
                        <div className="text-[#8B92A3]">Beds</div>
                        <input type="number" value={comp.beds || ''} onChange={e => updateComp(i, 'beds', parseFloat(e.target.value))} className="input py-1 text-sm" placeholder="" />
                      </div>
                      <div>
                        <div className="text-[#8B92A3]">Baths</div>
                        <input type="number" value={comp.baths || ''} onChange={e => updateComp(i, 'baths', parseFloat(e.target.value))} className="input py-1 text-sm" placeholder="" />
                      </div>
                      <div>
                        <div className="text-[#8B92A3]">Distance (mi)</div>
                        <input type="number" value={comp.distance || ''} onChange={e => updateComp(i, 'distance', parseFloat(e.target.value))} className="input py-1 text-sm" placeholder="0" />
                      </div>
                      <div>
                        <div className="text-[#8B92A3]">Comp Adjustment (+/- $)</div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={comp.optionalAdjInput ?? (comp.optionalAdj ? String(comp.optionalAdj) : '')}
                          onChange={e => updateComp(i, 'optionalAdjInput', e.target.value)}
                          className="input py-1 text-sm"
                          placeholder="0"
                        />
                        <div className="text-[10px] text-[#64748B] mt-1">Use a negative value when the comparable is superior to the subject and a positive value when it is inferior.</div>
                      </div>
                    </div>

                    {(comp.salePrice || 0) > 0 && (comp.sqft || 0) > 0 && (
                      <div className="mt-2 rounded border border-[#252A38] bg-[#0F111A] p-2 text-[10px] text-[#C5CAD6]">
                        <div>Adjusted Sale Price: <span className="text-white">{formatCurrency((comp.salePrice || 0) + (comp.optionalAdj || 0))}</span></div>
                        <div>Adjusted Price / Sq Ft: <span className="text-white">{formatPpsqft(((comp.salePrice || 0) + (comp.optionalAdj || 0)) / (comp.sqft || 1))}</span></div>
                      </div>
                    )}

                    <div className="mt-1">
                      <div className="text-[#8B92A3] text-[10px]">Condition / Notes</div>
                      <input type="text" value={comp.conditionNotes || ''} onChange={e => updateComp(i, 'conditionNotes', e.target.value)} className="input py-1 text-xs w-full" placeholder="Good condition, updated kitchen..." />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* (Subject fields now live in the dedicated Subject Property card above; math still driven exclusively by comp Sale Price + SqFt) */}

          {/* Live KPI Results - safe */}
          <div className="text-xs uppercase tracking-widest text-[#8B92A3] mb-2">Live Results</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#8B92A3] tracking-widest">AVG ADJUSTED PRICE / SQFT</div>
              <div className="text-2xl font-semibold tabular-nums text-[#22C55E] mt-1">{formatPpsqft(avgPpsqft)}</div>
              <div className="text-[10px] text-[#6B7280] mt-0.5">{validComps.length} comps used</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#8B92A3] tracking-widest">BASE ARV BEFORE SUBJECT ADJ</div>
              <div className="text-2xl font-semibold tabular-nums text-[#E6E8EE] mt-1">{formatCurrency(baseArv)}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#8B92A3] tracking-widest">SUBJECT ADJUSTMENT</div>
              <div className="text-2xl font-semibold tabular-nums text-[#E6E8EE] mt-1">
                {adjType === '%' ? `${adjustment || 0}%` : formatSignedCurrency(adjustment)}
              </div>
            </div>
            <div className="bg-[#052E16] border border-[#22C55E]/40 rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#4ADE80] tracking-widest">ESTIMATED ARV</div>
              <div className="text-2xl font-bold tabular-nums text-[#22C55E] mt-1">{formatCurrency(adjustedArv)}</div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <div className="text-xs text-[#8B92A3] mb-1">Notes for this ARV analysis</div>
            <textarea
              value={arvNotes}
              onChange={e => setArvNotes(e.target.value)}
              className="input w-full h-16 text-sm resize-y"
              placeholder="Comp adjustments, condition notes..."
            />
          </div>

          {/* Actions for ARV only - Save disabled (no selector in Step 1) */}
          <div className="pt-4 border-t border-[#252A38] flex flex-wrap items-center gap-2">
            <button onClick={copyArv} className="btn btn-ghost text-sm px-3 py-1.5"><Copy size={15} /> Copy Results</button>
            <button
              onClick={saveArv}
              disabled={!selectedDealId}
              className="btn btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!selectedDealId ? 'Select a deal above first' : 'Save result to this deal'}
            >
              <Save size={15} /> Save to Deal
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exportArvPDF() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportArvPDF() } }}
              className="btn btn-ghost text-sm px-3 py-1.5"
            >
              <Download size={15} /> Export PDF
            </button>
            {ownerAdminMode && !ownerPreviewActive && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); previewArvPDF() }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); previewArvPDF() } }}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                Preview Generated PDF
              </button>
            )}
            <button onClick={resetArv} className="btn btn-ghost text-sm px-3 py-1.5 text-[#8B92A3]">Reset ARV</button>
            <div className="ml-auto text-[11px] text-[#6B7280] hidden sm:block">All math is local • instant</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'rehab') {
      const safeRehab = rehabItems || []
      const total = safeRehab.reduce((sum, item) => sum + (item?.cost || 0), 0)
      const count = safeRehab.length
      const highest = safeRehab.length > 0
        ? safeRehab.reduce((max, item) => (item?.cost || 0) > (max?.cost || 0) ? item : max, safeRehab[0])
        : null
      const costPerSqft = (subjectSqft || 0) > 0 ? total / (subjectSqft || 0) : 0

      const copyRehab = () => {
        const text = `Rehab Estimate\nTotal: ${formatCurrency(total)}\nItems: ${count}\nHighest: ${highest?.category || '—'} (${formatCurrency(highest?.cost || 0)})\n\n(Deal Blast Pro)`
        navigator.clipboard.writeText(text).then(() => toast.success('Rehab results copied'))
      }

      const saveRehab = () => {
        const safeRehab = rehabItems || []
        const total = safeRehab.reduce((sum, item) => sum + (item?.cost || 0), 0)
        saveCalcResultToDeal('rehab', {
          totalRehab: total,
          itemCount: safeRehab.length,
          highestCategory: safeRehab.length > 0 ? safeRehab.reduce((max, item) => (item?.cost || 0) > (max?.cost || 0) ? item : max, safeRehab[0])?.category : null,
          costPerSqft: (subjectSqft || 0) > 0 ? Math.round((total / (subjectSqft || 0)) * 100) / 100 : 0
        })
      }

      const exportRehabPDF = () => {
        const lineItems = safeRehab.map((item, index) =>
          `Item ${index + 1}: ${item.category || 'Untitled'} | Scope: ${item.scope || 'Not provided'} | Cost: ${formatCurrency(item.cost || 0)} | Notes: ${item.notes || 'None'}`
        ).join('\n')
        const summary = `Rehab Estimate
Subject address: ${subjectAddress || 'Not provided'}
Subject square footage: ${subjectSqft || 0}
Line item count: ${count}
Highest item: ${highest?.category || 'None'} (${formatCurrency(highest?.cost || 0)})
Cost per square foot: ${costPerSqft.toFixed(2)}
Total rehab: ${formatCurrency(total)}

Line items:
${lineItems || '(none)'}

Generated timestamp: ${new Date().toISOString()}
Deal Blast Pro`
        void downloadPdf(buildPdfFilename('rehab'), 'Rehab Calculator Results', summary)
      }

      return (
        <div>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Rehab Calculator</div>
              <div className="text-sm text-[#8B92A3]">Presets + editable line items → Total rehab cost</div>
            </div>
            <button onClick={clearRehab} className="text-xs px-3 py-1 rounded border border-[#252A38] hover:bg-[#252A38] text-[#8B92A3]">Clear</button>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {['Light Rehab', 'Medium Rehab', 'Heavy Rehab', 'Full Gut'].map(p => (
              <button key={p} onClick={() => applyRehabPreset(p)} className="btn btn-ghost px-2.5 py-1 text-xs">{p} Preset</button>
            ))}
            <button onClick={addCustomRehabItem} className="btn btn-green px-3 py-1 text-xs">+ Add Custom Item</button>
          </div>

          {/* Line Items - safe */}
          <div className="space-y-2 mb-4">
            {safeRehab.map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-[#0A0C12] border border-[#252A38] rounded-lg px-3 py-2 text-sm">
                <input
                  type="text"
                  value={item.category || ''}
                  onChange={e => updateRehabItem(item.id, 'category', e.target.value)}
                  className="col-span-3 input py-1 text-sm font-medium"
                  placeholder="Item name"
                />

                <select
                  value={item.scope}
                  onChange={e => updateRehabItem(item.id, 'scope', e.target.value)}
                  className="col-span-2 select py-1 text-xs"
                >
                  {['None', 'Light', 'Medium', 'Heavy', 'Custom'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <input
                  type="number"
                  value={item.cost || ''}
                  onChange={e => updateRehabItem(item.id, 'cost', e.target.value)}
                  className="col-span-2 input py-1 text-sm"
                  placeholder="Cost"
                />

                <input
                  value={item.notes || ''}
                  onChange={e => updateRehabItem(item.id, 'notes', e.target.value)}
                  placeholder="Notes..."
                  className="col-span-4 input py-1 text-xs"
                />

                <button onClick={() => removeRehabItem(item.id)} className="col-span-1 text-red-400 hover:text-red-300 text-lg leading-none">×</button>
              </div>
            ))}
            {safeRehab.length === 0 && (
              <div className="text-sm text-[#8B92A3] text-center py-4">No line items. Use presets or add custom.</div>
            )}
          </div>

          {/* Outputs - safe */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#052E16] border border-[#22C55E]/40 rounded-lg p-3 text-center">
              <div className="text-xs text-[#4ADE80]">TOTAL REHAB</div>
              <div className="text-2xl font-bold text-[#22C55E]">{formatCurrency(total)}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">COST / SQFT</div>
              <div className="text-2xl font-semibold">{(subjectSqft || 0) > 0 ? costPerSqft.toFixed(2) : '—'}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">LINE ITEMS</div>
              <div className="text-2xl font-semibold">{count}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">HIGHEST COST</div>
              <div className="text-lg font-semibold truncate">{highest?.category || '—'}</div>
              <div className="text-sm">{formatCurrency(highest?.cost || 0)}</div>
            </div>
          </div>

          {/* Bottom actions for Rehab */}
          <div className="pt-4 border-t border-[#252A38] flex flex-wrap items-center gap-2">
            <button onClick={copyRehab} className="btn btn-ghost text-sm px-3 py-1.5"><Copy size={15} /> Copy Results</button>
            <button
              onClick={saveRehab}
              disabled={!selectedDealId}
              className="btn btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!selectedDealId ? 'Select a deal above first' : 'Save result to this deal'}
            >
              <Save size={15} /> Save to Deal
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exportRehabPDF() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportRehabPDF() } }}
              className="btn btn-ghost text-sm px-3 py-1.5"
            >
              <Download size={15} /> Export PDF
            </button>
            <button onClick={clearRehab} className="btn btn-ghost text-sm px-3 py-1.5 text-[#8B92A3]">Clear</button>
            <div className="ml-auto text-[11px] text-[#6B7280] hidden sm:block">All math is local • instant</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'mao') {
      const ruleOptions = ['65', '70', '75', 'custom']

      return (
        <div>
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">MAO / Offer Calculator</div>
            <div className="text-sm text-[#8B92A3]">Calculate maximum allowable offer and recommended seller price</div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">ARV</div>
              <input type="number" value={maoArv || ''} onChange={e => setMaoArv(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Rehab Estimate</div>
              <input type="number" value={maoRehab || ''} onChange={e => setMaoRehab(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Closing Costs</div>
              <input type="number" value={maoClosing || ''} onChange={e => setMaoClosing(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Holding Costs</div>
              <input type="number" value={maoHolding || ''} onChange={e => setMaoHolding(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Assignment / Wholesale Fee</div>
              <input type="number" value={maoFee || ''} onChange={e => setMaoFee(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Buyer Profit / Safety Buffer</div>
              <input type="number" value={maoProfit || ''} onChange={e => setMaoProfit(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Rule %</div>
              <div className="flex gap-1 flex-wrap">
                {ruleOptions.map(r => (
                  <button
                    key={r}
                    onClick={() => setMaoRule(r)}
                    className={`px-2.5 py-0.5 text-xs rounded ${maoRule === r ? 'bg-[#22C55E] text-black' : 'bg-[#171B26] border border-[#252A38]'}`}
                  >
                    {r === 'custom' ? 'Custom' : r + '%'}
                  </button>
                ))}
              </div>
            </div>
            {maoRule === 'custom' && (
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Custom Rule %</div>
                <input type="number" value={maoCustomRule || ''} onChange={e => setMaoCustomRule(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className="input" placeholder="70" />
              </div>
            )}
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Seller Bottom Line (optional)</div>
              <input type="number" value={maoSellerBottom || ''} onChange={e => setMaoSellerBottom(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
            <div>
              <div className="text-xs text-[#8B92A3] mb-1">Current Asking Price (optional)</div>
              <input type="number" value={maoAsking || ''} onChange={e => setMaoAsking(Math.max(0, parseFloat(e.target.value) || 0))} className="input" placeholder="0" />
            </div>
          </div>

          {/* Outputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#052E16] border border-[#22C55E]/40 rounded-lg p-3 text-center">
              <div className="text-xs text-[#4ADE80]">MAO / MAX ALLOWABLE OFFER</div>
              <div className="text-2xl font-bold text-[#22C55E] mt-1">{formatCurrency(maoValue)}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">RECOMMENDED SELLER OFFER</div>
              <div className="text-xl font-semibold mt-1">{formatCurrency(recommendedLow)} — {formatCurrency(recommendedHigh)}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">BUYER ALL-IN COST</div>
              <div className="text-2xl font-semibold mt-1">{formatCurrency(buyerAllIn)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">PROFIT / SPREAD ROOM</div>
              <div className="text-2xl font-semibold">{formatCurrency(spread)}</div>
            </div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3]">DISCOUNT FROM ARV</div>
              <div className="text-2xl font-semibold">{discountFromArv.toFixed(1)}%</div>
            </div>
            <div className={`bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center ${maoStrength === 'Strong' ? 'border-[#22C55E]' : maoStrength === 'Moderate' ? 'border-[#FBBF24]' : ''}`}>
              <div className="text-xs text-[#8B92A3]">DEAL STRENGTH</div>
              <div className={`text-2xl font-bold mt-1 ${maoStrength === 'Strong' ? 'text-[#22C55E]' : maoStrength === 'Moderate' ? 'text-[#FBBF24]' : 'text-red-400'}`}>{maoStrength}</div>
            </div>
          </div>

          {/* New Asking Price Impact KPIs (null-safe) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3] tracking-widest">ASKING VS MAO DIFFERENCE</div>
              <div className={`text-2xl font-semibold mt-1 ${askingVsMaoDiff === null ? 'text-[#8B92A3]' : askingVsMaoDiff >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>
                {askingVsMaoDiff === null ? 'N/A' : askingVsMaoDiff >= 0 ? `Under MAO by ${formatCurrency(askingVsMaoDiff)}` : `Over MAO by ${formatCurrency(Math.abs(askingVsMaoDiff))}`}
              </div>
            </div>

            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3] tracking-widest">SUGGESTED NEGOTIATION TARGET</div>
              <div className="text-lg font-semibold mt-1 leading-tight">
                {negotiationTarget}
              </div>
            </div>

            <div className="bg-[#0F111A] border border-[#252A38] rounded-lg p-3 text-center">
              <div className="text-xs text-[#8B92A3] tracking-widest">PROFIT ROOM AFTER ASKING</div>
              <div className={`text-2xl font-semibold mt-1 ${profitRoomAfterAsking === null ? 'text-[#8B92A3]' : profitRoomAfterAsking >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>
                {profitRoomAfterAsking === null ? 'N/A' : formatCurrency(profitRoomAfterAsking)}
              </div>
              <div className="text-[10px] text-[#6B7280] mt-0.5">
                {profitRoomAfterAsking === null ? '' : profitRoomAfterAsking >= 0 ? 'Positive for buyer' : 'Negative — negotiate'}
              </div>
            </div>
          </div>

          {/* Bottom actions for MAO */}
          <div className="pt-4 border-t border-[#252A38] flex flex-wrap items-center gap-2">
            <button onClick={copyMao} className="btn btn-ghost text-sm px-3 py-1.5"><Copy size={15} /> Copy Results</button>
            <button
              onClick={saveMao}
              disabled={!selectedDealId}
              className="btn btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!selectedDealId ? 'Select a deal above first' : 'Save result to this deal'}
            >
              <Save size={15} /> Save to Deal
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exportMaoPDF() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportMaoPDF() } }}
              className="btn btn-ghost text-sm px-3 py-1.5"
            >
              <Download size={15} /> Export PDF
            </button>
            <div className="ml-auto text-[11px] text-[#6B7280] hidden sm:block">All math is local • instant</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'rental') {
      const rentStrengthVal = rentStrength()

      const copyRental = () => {
        const text = `Rental Deal\nMonthly CF: ${formatCurrency(rentMonthlyCF)}\nAnnual CF: ${formatCurrency(rentAnnualCF)}\nNOI: ${formatCurrency(rentNOI)}\nCap Rate: ${rentCapRate.toFixed(1)}%\nCash-on-Cash: ${rentCoC.toFixed(1)}%\nDSCR: ${rentDSCR.toFixed(2)}\n1% Rule: ${rentOnePercent ? 'PASS' : 'FAIL'}\nBreak-even Rent: ${formatCurrency(rentBreakEven)}\nStrength: ${rentStrengthVal}\n(Deal Blast Pro)`
        navigator.clipboard.writeText(text).then(() => toast.success('Rental results copied'))
      }

      const saveRental = () => {
        saveCalcResultToDeal('rental', {
          monthlyCF: rentMonthlyCF,
          annualCF: rentAnnualCF,
          noi: rentNOI,
          capRate: Math.round(rentCapRate * 10) / 10,
          cashOnCash: Math.round(rentCoC * 10) / 10,
          dscr: Math.round(rentDSCR * 100) / 100,
          strength: rentStrength()
        })
      }

      const exportRentalPDF = () => {
        const summary = `Rental Deal Calculator
Inputs:
Purchase price: ${formatCurrency(rentPurchase)}
Rehab / repairs: ${formatCurrency(rentRehab)}
Closing costs: ${formatCurrency(rentClosing)}
Down payment: ${formatCurrency(rentDown)}
Loan amount: ${formatCurrency(rentLoan)}
Interest rate: ${rentRate || 0}%
Loan term months: ${rentTerm || 0}
Monthly rent: ${formatCurrency(rentMonthly)}
Other monthly income: ${formatCurrency(rentOtherIncome)}
Monthly debt service: ${formatCurrency(rentDebtService)}

Expenses:
Taxes: ${formatCurrency(rentTaxes)}
Insurance: ${formatCurrency(rentIns)}
HOA: ${formatCurrency(rentHOA)}
Utilities: ${formatCurrency(rentUtil)}
Management: ${rentMgmt || 0}%
Vacancy: ${rentVac || 0}%
Maintenance: ${rentMaint || 0}%
CapEx: ${rentCapex || 0}%
Repairs: ${rentRepairPct || 0}%

Results:
Monthly cash flow: ${formatCurrency(rentMonthlyCF)}
Annual cash flow: ${formatCurrency(rentAnnualCF)}
NOI: ${formatCurrency(rentNOI)}
Cap rate: ${rentCapRate.toFixed(1)}%
Cash on cash: ${rentCoC.toFixed(1)}%
DSCR: ${rentDSCR.toFixed(2)}
One percent rule: ${rentOnePercent ? 'PASS' : 'FAIL'}
Break-even rent: ${formatCurrency(rentBreakEven)}
Strength: ${rentStrengthVal}
Generated timestamp: ${new Date().toISOString()}
Deal Blast Pro`
        void downloadPdf(buildPdfFilename('rental'), 'Rental Deal Results', summary)
      }

      return (
        <div>
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">Rental Deal Calculator</div>
            <div className="text-sm text-[#8B92A3]">Full pro-forma with financing and all expenses</div>
          </div>

          {/* Inputs - grouped for readability, all safe */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div><div className="text-xs mb-1">Purchase Price</div><input type="number" value={rentPurchase || ''} onChange={e => setRentPurchase(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Rehab / Repairs</div><input type="number" value={rentRehab || ''} onChange={e => setRentRehab(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Closing Costs</div><input type="number" value={rentClosing || ''} onChange={e => setRentClosing(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Down Payment</div><input type="number" value={rentDown || ''} onChange={e => setRentDown(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Loan Amount</div><input type="number" value={rentLoan || ''} onChange={e => setRentLoan(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Interest Rate %</div><input type="number" value={rentRate || ''} onChange={e => setRentRate(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Loan Term (months)</div><input type="number" value={rentTerm || ''} onChange={e => setRentTerm(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Monthly Rent</div><input type="number" value={rentMonthly || ''} onChange={e => setRentMonthly(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Other Monthly Income</div><input type="number" value={rentOtherIncome || ''} onChange={e => setRentOtherIncome(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Taxes (mo)</div><input type="number" value={rentTaxes || ''} onChange={e => setRentTaxes(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Insurance (mo)</div><input type="number" value={rentIns || ''} onChange={e => setRentIns(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">HOA (mo)</div><input type="number" value={rentHOA || ''} onChange={e => setRentHOA(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Utilities (owner mo)</div><input type="number" value={rentUtil || ''} onChange={e => setRentUtil(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Prop Mgmt %</div><input type="number" value={rentMgmt || ''} onChange={e => setRentMgmt(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Vacancy %</div><input type="number" value={rentVac || ''} onChange={e => setRentVac(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Maintenance %</div><input type="number" value={rentMaint || ''} onChange={e => setRentMaint(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">CapEx Reserve %</div><input type="number" value={rentCapex || ''} onChange={e => setRentCapex(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Repairs % of rent</div><input type="number" value={rentRepairPct || ''} onChange={e => setRentRepairPct(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Monthly Debt Service</div><input type="number" value={rentDebtService || ''} onChange={e => setRentDebtService(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
          </div>

          {/* Outputs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#052E16] border border-[#22C55E]/40 rounded p-3 text-center"><div className="text-xs text-[#4ADE80]">MONTHLY CASH FLOW</div><div className="text-2xl font-bold text-[#22C55E] mt-1">{formatCurrency(rentMonthlyCF)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">ANNUAL CASH FLOW</div><div className="text-2xl font-bold mt-1">{formatCurrency(rentAnnualCF)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">NOI (Annual)</div><div className="text-2xl font-bold mt-1">{formatCurrency(rentNOI)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">CAP RATE</div><div className="text-2xl font-bold mt-1">{rentCapRate.toFixed(1)}%</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">CASH-ON-CASH</div><div className="text-2xl font-bold mt-1">{rentCoC.toFixed(1)}%</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">DSCR</div><div className="text-2xl font-bold mt-1">{rentDSCR.toFixed(2)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">1% RULE</div><div className={`text-2xl font-bold mt-1 ${rentOnePercent ? 'text-[#22C55E]' : 'text-red-400'}`}>{rentOnePercent ? 'PASS' : 'FAIL'}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">BREAK-EVEN RENT</div><div className="text-2xl font-bold mt-1">{formatCurrency(rentBreakEven)}</div></div>
            <div className={`bg-[#0F111A] border border-[#252A38] rounded p-3 text-center ${rentStrengthVal === 'Strong' ? 'border-[#22C55E]' : rentStrengthVal === 'Moderate' ? 'border-[#FBBF24]' : ''}`}>
              <div className="text-xs">DEAL STRENGTH</div>
              <div className={`text-2xl font-bold mt-1 ${rentStrengthVal === 'Strong' ? 'text-[#22C55E]' : rentStrengthVal === 'Moderate' ? 'text-[#FBBF24]' : 'text-red-400'}`}>{rentStrengthVal}</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#252A38] flex flex-wrap items-center gap-2">
            <button onClick={copyRental} className="btn btn-ghost text-sm px-3 py-1.5"><Copy size={15} /> Copy Results</button>
            <button onClick={saveRental} disabled={!selectedDealId} className="btn btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed" title={!selectedDealId ? 'Select a deal above first' : 'Save result to this deal'}><Save size={15} /> Save to Deal</button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exportRentalPDF() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportRentalPDF() } }}
              className="btn btn-ghost text-sm px-3 py-1.5"
            >
              <Download size={15} /> Export PDF
            </button>
            <div className="ml-auto text-[11px] text-[#6B7280] hidden sm:block">All math is local • instant</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'creative') {
      const creStrengthVal = creStrength()

      const copyCreative = () => {
        const text = `Creative Finance\nTotal Entry: ${formatCurrency(creTotalEntry)}\nMonthly CF: ${formatCurrency(creMonthlyCF)}\nAnnual CF: ${formatCurrency(creAnnualCF)}\nPayback (mo): ${crePaybackMo}\nCash-on-Cash: ${creCoC.toFixed(1)}%\nStrength: ${creStrengthVal}\n(Deal Blast Pro)`
        navigator.clipboard.writeText(text).then(() => toast.success('Creative results copied'))
      }

      const saveCreative = () => {
        saveCalcResultToDeal('creative', {
          entryCost: creTotalEntry,
          monthlyCF: creMonthlyCF,
          annualCF: creAnnualCF,
          paybackMo: crePaybackMo,
          cashOnCash: Math.round(creCoC * 10) / 10,
          strength: creStrengthVal
        })
      }

      const exportCreativePDF = () => {
        const summary = `Creative Finance Calculator
Inputs:
Purchase price: ${formatCurrency(crePurchase)}
Down payment: ${formatCurrency(creDown)}
Seller monthly payment: ${formatCurrency(creSellerPmt)}
Existing mortgage payment: ${formatCurrency(creExistingPmt)}
Interest rate: ${creRate || 0}%
Amortization term months: ${creAmort || 0}
Balloon term months: ${creBalloon || 0}
Entry costs: ${formatCurrency(creEntry)}
Closing costs: ${formatCurrency(creClosing)}
Assignment / wholesale fee: ${formatCurrency(creFee)}
Monthly rent: ${formatCurrency(creRent)}
Other monthly income: ${formatCurrency(creOtherIncome)}

Expenses:
Taxes: ${formatCurrency(creTaxes)}
Insurance: ${formatCurrency(creIns)}
HOA: ${formatCurrency(creHOA)}
Utilities: ${formatCurrency(creUtil)}
Vacancy: ${creVac || 0}%
Maintenance: ${creMaint || 0}%
Management: ${creMgmt || 0}%

Results:
Total entry cost: ${formatCurrency(creTotalEntry)}
Monthly cash flow: ${formatCurrency(creMonthlyCF)}
Annual cash flow: ${formatCurrency(creAnnualCF)}
Payback months: ${crePaybackMo}
Cash on cash: ${creCoC.toFixed(1)}%
Strength: ${creStrengthVal}
Generated timestamp: ${new Date().toISOString()}
Deal Blast Pro`
        void downloadPdf(buildPdfFilename('creative'), 'Creative Finance Results', summary)
      }

      return (
        <div>
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">Creative Finance Calculator</div>
            <div className="text-sm text-[#8B92A3]">Seller finance / subject-to pro-forma</div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div><div className="text-xs mb-1">Purchase Price</div><input type="number" value={crePurchase || ''} onChange={e => setCrePurchase(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Down Payment</div><input type="number" value={creDown || ''} onChange={e => setCreDown(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Seller Monthly Payment</div><input type="number" value={creSellerPmt || ''} onChange={e => setCreSellerPmt(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Existing Mortgage Pmt (if Subject-To)</div><input type="number" value={creExistingPmt || ''} onChange={e => setCreExistingPmt(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Interest Rate %</div><input type="number" value={creRate || ''} onChange={e => setCreRate(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Amortization Term (mo)</div><input type="number" value={creAmort || ''} onChange={e => setCreAmort(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Balloon Term (mo)</div><input type="number" value={creBalloon || ''} onChange={e => setCreBalloon(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Entry Costs</div><input type="number" value={creEntry || ''} onChange={e => setCreEntry(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Closing Costs</div><input type="number" value={creClosing || ''} onChange={e => setCreClosing(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Assignment / Wholesale Fee</div><input type="number" value={creFee || ''} onChange={e => setCreFee(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Monthly Rent</div><input type="number" value={creRent || ''} onChange={e => setCreRent(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Other Monthly Income</div><input type="number" value={creOtherIncome || ''} onChange={e => setCreOtherIncome(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Taxes (mo)</div><input type="number" value={creTaxes || ''} onChange={e => setCreTaxes(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Insurance (mo)</div><input type="number" value={creIns || ''} onChange={e => setCreIns(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">HOA (mo)</div><input type="number" value={creHOA || ''} onChange={e => setCreHOA(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Utilities (mo)</div><input type="number" value={creUtil || ''} onChange={e => setCreUtil(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Vacancy %</div><input type="number" value={creVac || ''} onChange={e => setCreVac(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Maintenance %</div><input type="number" value={creMaint || ''} onChange={e => setCreMaint(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
            <div><div className="text-xs mb-1">Property Management %</div><input type="number" value={creMgmt || ''} onChange={e => setCreMgmt(Math.max(0, parseFloat(e.target.value) || 0))} className="input" /></div>
          </div>

          {/* Outputs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#052E16] border border-[#22C55E]/40 rounded p-3 text-center"><div className="text-xs text-[#4ADE80]">TOTAL ENTRY COST</div><div className="text-2xl font-bold text-[#22C55E] mt-1">{formatCurrency(creTotalEntry)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">MONTHLY CASH FLOW</div><div className="text-2xl font-bold mt-1">{formatCurrency(creMonthlyCF)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">ANNUAL CASH FLOW</div><div className="text-2xl font-bold mt-1">{formatCurrency(creAnnualCF)}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">PAYBACK (MONTHS)</div><div className="text-2xl font-bold mt-1">{crePaybackMo === 999 ? '∞' : crePaybackMo}</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">CASH-ON-CASH</div><div className="text-2xl font-bold mt-1">{creCoC.toFixed(1)}%</div></div>
            <div className="bg-[#0F111A] border border-[#252A38] rounded p-3 text-center"><div className="text-xs">DEAL STRENGTH</div><div className={`text-2xl font-bold mt-1 ${creStrengthVal === 'Strong' ? 'text-[#22C55E]' : creStrengthVal === 'Moderate' ? 'text-[#FBBF24]' : 'text-red-400'}`}>{creStrengthVal}</div></div>
          </div>

          <div className="pt-4 border-t border-[#252A38] flex flex-wrap items-center gap-2">
            <button onClick={copyCreative} className="btn btn-ghost text-sm px-3 py-1.5"><Copy size={15} /> Copy Results</button>
            <button onClick={saveCreative} disabled={!selectedDealId} className="btn btn-ghost text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed" title={!selectedDealId ? 'Select a deal above first' : 'Save result to this deal'}><Save size={15} /> Save to Deal</button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exportCreativePDF() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exportCreativePDF() } }}
              className="btn btn-ghost text-sm px-3 py-1.5"
            >
              <Download size={15} /> Export PDF
            </button>
            <div className="ml-auto text-[11px] text-[#6B7280] hidden sm:block">All math is local • instant</div>
          </div>
        </div>
      )
    }

    if (activeTab === 'propertyIntelligence') {
      const allowSamplePropertyIntelligence = canShowSamplePropertyIntelligence({
        isOwnerAdmin: ownerAdminMode,
        ownerPreviewActive,
      })

      if (!allowSamplePropertyIntelligence) {
        const summaryCards = propertyLookupSummary ? [
          ['Property Type', propertyLookupSummary.property?.propertyType || 'Not provided'],
          ['Beds / Baths', [propertyLookupSummary.property?.beds, propertyLookupSummary.property?.baths].filter(v => v !== undefined && v !== null).join(' / ') || 'Not provided'],
          ['Living Area', propertyLookupSummary.property?.livingAreaSqft ? `${Number(propertyLookupSummary.property.livingAreaSqft).toLocaleString()} sqft` : 'Not provided'],
          ['Estimated Value', propertyLookupSummary.valuation?.value ? formatCurrency(propertyLookupSummary.valuation.value) : 'Not provided'],
          ['Rent Estimate', propertyLookupSummary.rent?.rent ? formatCurrency(propertyLookupSummary.rent.rent) : 'Not provided'],
          ['Market Median Sale', propertyLookupSummary.market?.medianSalePrice ? formatCurrency(propertyLookupSummary.market.medianSalePrice) : 'Not provided'],
          ['Source', 'Property Intelligence'],
          ['Updated', propertyLookupSummary.property?.lastUpdated ? new Date(propertyLookupSummary.property.lastUpdated).toLocaleString() : 'On lookup'],
        ] : []
        const dbpValues = activePropertyDeal ? selectedDealDbpValues(activePropertyDeal) : null
        const propertyRows = propertyLookupSummary ? [
          ['Full Address', formatAddressLabel(propertyLookupSummary.property?.address || propertyLookupSummary.address)],
          ['County', propertyLookupSummary.property?.county || propertyLookupSummary.property?.address?.county],
          ['Parcel ID', propertyLookupSummary.property?.parcelId],
          ['Property Type', propertyLookupSummary.property?.propertyType],
          ['Beds / Baths', [propertyLookupSummary.property?.beds, propertyLookupSummary.property?.baths].filter(v => v !== undefined && v !== null).join(' / ')],
          ['Living Area', propertyLookupSummary.property?.livingAreaSqft ? `${Number(propertyLookupSummary.property.livingAreaSqft).toLocaleString()} sqft` : ''],
          ['Building Area', propertyLookupSummary.property?.buildingAreaSqft ? `${Number(propertyLookupSummary.property.buildingAreaSqft).toLocaleString()} sqft` : ''],
          ['Lot Size', propertyLookupSummary.property?.lotSizeSqft ? `${Number(propertyLookupSummary.property.lotSizeSqft).toLocaleString()} sqft` : ''],
          ['Year Built', propertyLookupSummary.property?.yearBuilt ? String(propertyLookupSummary.property.yearBuilt) : ''],
          ['Units', propertyLookupSummary.property?.units],
          ['Stories', propertyLookupSummary.property?.stories],
          ['Zoning', propertyLookupSummary.property?.zoning],
          ['Subdivision', propertyLookupSummary.property?.subdivision],
          ['Construction', propertyLookupSummary.property?.constructionType],
          ['Exterior', propertyLookupSummary.property?.exteriorType],
          ['Roof', propertyLookupSummary.property?.roofType],
          ['Foundation', propertyLookupSummary.property?.foundation],
          ['Garage', propertyLookupSummary.property?.garage],
          ['Basement', propertyLookupSummary.property?.basement],
          ['Heating', propertyLookupSummary.property?.heating],
          ['Cooling', propertyLookupSummary.property?.cooling],
          ['Pool', propertyLookupSummary.property?.pool],
          ['Tax Amount', propertyLookupSummary.property?.taxAmount ? formatCurrency(propertyLookupSummary.property.taxAmount) : ''],
          ['Assessed Value', propertyLookupSummary.property?.taxAssessment ? formatCurrency(propertyLookupSummary.property.taxAssessment) : ''],
          ['Market Value', propertyLookupSummary.property?.marketValue ? formatCurrency(propertyLookupSummary.property.marketValue) : ''],
          ['Last Sale Date', propertyLookupSummary.property?.lastSaleDate],
          ['Last Sale Amount', propertyLookupSummary.property?.lastSaleAmount ? formatCurrency(propertyLookupSummary.property.lastSaleAmount) : ''],
          ['Estimated Value', propertyLookupSummary.valuation?.value ? formatCurrency(propertyLookupSummary.valuation.value) : ''],
          ['Estimated Rent', propertyLookupSummary.rent?.rent ? formatCurrency(propertyLookupSummary.rent.rent) : ''],
          ['Latitude / Longitude', [propertyLookupSummary.property?.latitude || propertyLookupSummary.address?.latitude, propertyLookupSummary.property?.longitude || propertyLookupSummary.address?.longitude].filter(Boolean).join(' / ')],
          ['Data Retrieval Date', propertyLookupSummary.retrievedAt ? new Date(propertyLookupSummary.retrievedAt).toLocaleString() : ''],
        ] : []
        const owner = propertyLookupSummary?.owner || null
        const tabs = ['Property', 'Owner', 'Comps', 'History', 'Market', 'Merge'] as const
        const parsedTypedAddress = parseTypedPropertyAddress(propertySearch)
        const hasLoadablePropertyAddress = isCompletePropertyAddress(selectedPropertyAddress) || isCompletePropertyAddress(parsedTypedAddress)
        const propertyLoadDisabledReason = !canUseLivePropertyData
          ? 'Property Intelligence is available on the Pro plan.'
          : propertyLookupLoading
            ? 'Loading Property Intelligence.'
            : propertySearch.trim().length < 3
              ? 'Enter a property address.'
              : !hasLoadablePropertyAddress
                ? 'Enter street, city, and state before loading Property Intelligence.'
                : propertyConnection.checked && !propertyConnection.connected
                  ? propertyConnection.status === 'Provider Not Configured'
                    ? 'Property Intelligence provider is not configured yet.'
                    : propertyConnection.status === 'Provider Timeout'
                      ? 'Property provider timed out. Try checking again.'
                      : propertyConnection.status === 'Rate Limited'
                        ? 'Please wait a moment before retrying.'
                        : 'Property provider is temporarily unavailable.'
                  : ''

        return (
          <div>
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">Property Intelligence</div>
                <div className="text-sm text-[#8B92A3]">Property facts, owner controls, valuation, rent, comps, history, and market workspace.</div>
              </div>
              <div className={`rounded border px-3 py-1 text-xs ${
                propertyConnection.connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : propertyConnection.status === 'Testing Connection'
                    ? 'border-[#252A38] bg-[#171B26] text-[#C5CAD6]'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}>
                {propertyConnection.status}
              </div>
            </div>

            {!canUseLivePropertyData && (
              <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Property Intelligence is available on the Pro plan. Manual property analysis remains available on every plan.
              </div>
            )}

            {canUseLivePropertyData && ownerAdminMode && (
              <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Owner Admin access is unrestricted. Property Intelligence requests do not consume lookup credits.
              </div>
            )}

            {canUseLivePropertyData && !ownerAdminMode && propertyCreditBalance && (
              <div className="mb-4 grid gap-2 md:grid-cols-3">
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3]">Property Intelligence Lookups</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">
                    {propertyCreditBalance.includedRemaining ?? Math.max(0, Number(propertyCreditBalance.includedLimit || 0) - Number(propertyCreditBalance.includedUsed || 0))} remaining this month
                  </div>
                </div>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3]">Additional Credits</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">{propertyCreditBalance.purchasedRemaining ?? 0}</div>
                </div>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3]">Reset Date</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">{propertyCreditBalance.resetDate || 'Next billing month'}</div>
                </div>
              </div>
            )}

            {canUseLivePropertyData && !ownerAdminMode && propertyCreditPacks.length > 0 && (
              <div id="pi-credit-packs" className="mb-4 rounded border border-[#252A38] bg-[#0F111A] p-3">
                <div className="text-sm font-semibold text-[#E6E8EE]">Buy Property Intelligence Credits</div>
                <div className="mb-2 text-xs text-[#8B92A3]">Purchased credits do not expire. Credits are granted only after Stripe confirms payment.</div>
                <div className="flex flex-wrap gap-2">{propertyCreditPacks.map(pack => <button key={pack.key} type="button"
                  disabled={!pack.checkoutReady || Boolean(creditCheckoutLoading)} onClick={() => void openCreditPackCheckout(pack.key)} className="btn btn-ghost text-xs disabled:opacity-50">
                  {creditCheckoutLoading===pack.key?'Opening…':`${pack.credits} credits • $${(pack.amountCents/100).toFixed(0)}`}{!pack.checkoutReady?' • Setup pending':''}
                </button>)}</div>
              </div>
            )}

            <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <div>
                <div className="text-xs text-[#8B92A3] mb-1.5">Select Existing Deal</div>
                <select
                  className="select w-full"
                  value={propertyDealId}
                  onChange={e => selectPropertyDeal(e.target.value)}
                >
                  <option value="">Search or enrich without a saved deal</option>
                  {intelligenceDealOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div ref={propertySuggestRef} className="relative">
                <div className="text-xs text-[#8B92A3] mb-1.5">Address Search</div>
                <input
                  className="input w-full"
                  value={propertySearch}
                  onChange={e => {
                    setPropertySearch(e.target.value)
                    setPropertyCreditBlock('')
                    setSelectedPropertyAddress(null)
                    setActiveSuggestionIndex(-1)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setActiveSuggestionIndex(index => Math.min(propertyLookupResults.length - 1, index + 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setActiveSuggestionIndex(index => Math.max(0, index - 1))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const result = propertyLookupResults[activeSuggestionIndex]
                      if (result) selectPropertyIntelligenceResult(result)
                      else void loadPropertyIntelligenceForAddress(selectedPropertyAddress || parseTypedPropertyAddress(propertySearch))
                    } else if (e.key === 'Escape') {
                      setPropertyLookupResults([])
                    }
                  }}
                  placeholder="Start typing a U.S. property address..."
                />
                {propertyAutocompleteLoading && <div className="absolute right-3 top-9 text-xs text-[#8B92A3]">Searching addresses...</div>}
                {propertyLookupResults.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded border border-[#252A38] bg-[#0F111A] shadow-xl">
                    {propertyLookupResults.slice(0, 8).map((result, index) => {
                      const address = result.address || {}
                      const label = result.label || formatAddressLabel(address) || 'Unknown address'
                      return (
                        <button
                          key={result.id || label}
                          type="button"
                          onClick={() => selectPropertyIntelligenceResult(result)}
                          className={`w-full px-3 py-2 text-left text-sm ${index === activeSuggestionIndex ? 'bg-[#1D4ED8]/30' : 'hover:bg-[#171B26]'}`}
                        >
                          <div className="font-medium text-[#E6E8EE]">{label}</div>
                          <div className="text-xs text-[#8B92A3]">{Math.round(Number(result.confidence || 0.85) * 100)}% match</div>
                        </button>
                      )
                    })}
                  </div>
                )}
                {!propertyAutocompleteLoading && propertyAutocompleteMessage && propertyLookupResults.length === 0 && (
                  <div className="mt-1 text-[11px] leading-4 text-[#8B92A3]" role="status">
                    {propertyAutocompleteMessage}
                  </div>
                )}
                <div className="mt-1 text-[10px] leading-4 text-[#6B7280]">
                  Powered by{' '}
                  <a
                    href="https://www.geoapify.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-[#6B7280]/60 underline-offset-2 hover:text-[#AAB0BE]"
                  >
                    Geoapify
                  </a>
                </div>
              </div>
              <div className="flex items-end">
                <div className="w-full lg:w-48">
                  <button
                    type="button"
                    onClick={() => void loadPropertyIntelligenceForAddress(selectedPropertyAddress || parsedTypedAddress)}
                    disabled={Boolean(propertyLoadDisabledReason)}
                    className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {propertyLookupLoading ? 'Loading...' : 'Load Property Intelligence'}
                  </button>
                  {propertyLoadDisabledReason && !propertyLookupLoading && (
                    <div className="mt-1 text-[11px] leading-4 text-[#8B92A3]">{propertyLoadDisabledReason}</div>
                  )}
                </div>
              </div>
            </div>

            {propertyCreditBlock && !ownerAdminMode && (
              <div className="mb-4 rounded border border-amber-400/50 bg-amber-500/10 p-4 text-amber-100" role="alert" aria-live="assertive">
                <div className="font-semibold">
                  {propertyCreditBlock === 'zero_balance'
                    ? 'You need Property Intelligence credits to run this lookup.'
                    : 'Property Intelligence credits are temporarily unavailable.'}
                </div>
                <div className="mt-1 text-sm text-amber-100/80">
                  Geoapify address search and all available manual calculators remain usable. No provider request or credit reservation was created.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => document.getElementById('pi-credit-packs')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Buy Credits</button>
                  <Link to="/app/settings" className="btn btn-ghost">View Plans</Link>
                  <button type="button" className="btn btn-ghost" onClick={() => setPropertyCreditBlock('')}>Dismiss</button>
                </div>
              </div>
            )}

            {activePropertyDeal && dbpValues && (
              <div className="mb-4 panel p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Deal Blast Pro Record</div>
                  <span className="rounded border border-[#252A38] px-2 py-0.5 text-xs text-[#8B92A3]">{activePropertyDeal.status}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {[
                    ['Address', dbpValues.address],
                    ['City / State', [dbpValues.city, dbpValues.state].filter(Boolean).join(', ')],
                    ['Type', dbpValues.propertyType],
                    ['Beds / Baths', [dbpValues.beds, dbpValues.baths].filter(v => v !== undefined && v !== null).join(' / ')],
                    ['Sq Ft', dbpValues.sqft],
                    ['Asking', dbpValues.askingPrice ? formatCurrency(dbpValues.askingPrice) : ''],
                    ['Contract', dbpValues.contractPrice ? formatCurrency(dbpValues.contractPrice) : ''],
                    ['Source', dbpValues.submissionSource],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded border border-[#252A38] bg-[#0A0C12] p-2">
                      <div className="text-[#8B92A3]">{label}</div>
                      <div className="text-[#E6E8EE]">{formatValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {propertyLookupError && (
              <div className="mb-4 flex flex-col gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 md:flex-row md:items-center md:justify-between">
                <div>{propertyLookupError}</div>
                {canUseLivePropertyData && activeTab === 'propertyIntelligence' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPropertyLookupError('')
                      setPropertyConnection({ status: 'Testing Connection', connected: false, checked: false })
                      void fetchPropertyIntelligence('status', { force: true })
                        .then(payload => setPropertyConnection({
                          status: payload?.propertyDataConnected ? 'Property Data Connected' : (payload?.status || 'Provider Unavailable'),
                          connected: Boolean(payload?.propertyDataConnected),
                          checked: true,
                        }))
                        .catch(error => setPropertyConnection({
                          status: propertyConnectionErrorStatus(error),
                          connected: false,
                          checked: true,
                        }))
                    }}
                    className="btn btn-ghost text-xs"
                  >
                    Check Again
                  </button>
                )}
              </div>
            )}

            {propertyLookupStatus && (
              <div className="mb-4 rounded border border-[#252A38] bg-[#0A0C12] p-3 text-sm text-[#C5CAD6]">
                {propertyLookupStatus}
              </div>
            )}

            {propertyLookupSummary ? (
              <div className="grid gap-3">
                <div className="panel p-3">
                  <div className="text-sm font-semibold mb-2">Lookup Summary</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {summaryCards.map(([label, value]) => (
                      <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                        <div className="text-[#8B92A3]">{label}</div>
                        <div className="text-[#E6E8EE]">{value}</div>
                      </div>
                    ))}
                  </div>
                  {(propertyLookupSummary.valuation?.value || propertyLookupSummary.property?.estimatedValue) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={applySuggestedArv} className="btn btn-primary text-sm">Apply Suggested ARV</button>
                      <button type="button" onClick={savePropertyIntelligenceToDeal} disabled={!activePropertyDeal} className="btn btn-ghost text-sm disabled:opacity-50">Save Property Intelligence to Deal</button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = ownerAdminMode || window.confirm('Refreshing this property will use 1 lookup credit.')
                          if (ok) void loadPropertyIntelligenceForAddress(propertyLookupSummary.address, { refresh: true })
                        }}
                        className="btn btn-ghost text-sm"
                      >
                        Refresh Property Data
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  {tabs.map(tabName => (
                    <button
                      key={tabName}
                      type="button"
                      onClick={() => setPropertyTab(tabName)}
                      className={`rounded border px-3 py-1 ${propertyTab === tabName ? 'border-[#22C55E] bg-[#052E16] text-[#86EFAC]' : 'border-[#252A38] bg-[#171B26] text-[#C5CAD6]'}`}
                    >
                      {tabName}
                    </button>
                  ))}
                </div>

                <div className="panel p-3">
                  {propertyTab === 'Property' && (
                    <div>
                      <div className="text-sm font-semibold mb-2">Property</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {propertyRows.map(([label, value]) => (
                          <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                            <div className="text-[#8B92A3]">{label}</div>
                            <div className="text-[#E6E8EE]">{formatValue(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {propertyTab === 'Owner' && (
                    <div>
                      <div className="text-sm font-semibold mb-2">Owner</div>
                      {!canViewOwnerDetails || owner?.locked ? (
                        <div className="rounded border border-[#252A38] bg-[#0A0C12] p-4">
                          <div className="text-base font-semibold text-white mb-1">Owner details require Pro or higher.</div>
                          <div className="text-sm text-[#8B92A3] mb-3">Current plan: {String(effectiveCalculatorPlan)}. Required plan: Pro.</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                            {[
                              ['Owner record', owner ? 'Found' : 'Not available'],
                              ['Owner occupied', owner?.ownerOccupied],
                              ['Ownership type', owner?.ownershipEntity],
                              ['Years owned', owner?.yearsOwned],
                              ['Mailing state', owner?.mailingState],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                                <div className="text-[#8B92A3]">{label}</div>
                                <div className="text-[#E6E8EE]">{formatValue(value)}</div>
                              </div>
                            ))}
                          </div>
                          <Link to="/pricing" className="btn btn-primary">Upgrade to Pro</Link>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {[
                            ['Owner Name', owner?.ownerName],
                            ['Ownership Entity', owner?.ownershipEntity],
                            ['Mailing Address', owner?.mailingAddress],
                            ['Owner Occupied', owner?.ownerOccupied],
                            ['Absentee Owner', owner?.absenteeOwner],
                            ['Years Owned', owner?.yearsOwned],
                            ['Transfer Date', owner?.ownershipTransferDate],
                            ['Contact Data', 'Not configured'],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                              <div className="text-[#8B92A3]">{label}</div>
                              <div className="text-[#E6E8EE]">{formatValue(value)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {propertyTab === 'Comps' && (
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold mr-auto">Comparable Sales</div>
                        <button type="button" onClick={sendSelectedCompsToArv} className="btn btn-ghost text-sm">Send Selected Comps to ARV Calculator</button>
                      </div>
                      {(propertyLookupSummary.comps || []).length ? (
                        <div className="space-y-2 text-xs">
                          {propertyLookupSummary.comps.map((comp: any) => {
                            const checked = selectedPropertyCompIds.includes(comp.id)
                            return (
                              <label key={comp.id} className="flex gap-3 rounded border border-[#252A38] bg-[#0F111A] p-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => setSelectedPropertyCompIds(prev => e.target.checked ? [...prev, comp.id] : prev.filter(id => id !== comp.id))}
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-[#E6E8EE]">{formatAddressLabel(comp.address)}</div>
                                  <div className="text-[#8B92A3]">{formatCurrency(comp.salePrice)} | {comp.saleDate || 'No sale date'} | {formatValue(comp.beds)} bd / {formatValue(comp.baths)} ba | {formatValue(comp.livingAreaSqft)} sqft | {comp.distanceMiles ? `${Number(comp.distanceMiles).toFixed(2)} mi` : 'Distance not available'} | {comp.pricePerSqft ? formatPpsqft(comp.pricePerSqft) : 'PPSF not available'}</div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-[#8B92A3]">Comparable sales are not available from the current data source.</div>
                      )}
                    </div>
                  )}

                  {propertyTab === 'History' && (
                    <div>
                      <div className="text-sm font-semibold mb-2">History</div>
                      {(propertyLookupSummary.history || []).length ? (
                        <div className="space-y-2 text-xs">
                          {propertyLookupSummary.history.map((record: any, index: number) => (
                            <div key={`${record.eventType}-${record.recordDate}-${index}`} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                              <div className="text-[#E6E8EE]">{record.eventType} | {record.recordDate || 'Date not available'} | {record.amount ? formatCurrency(record.amount) : 'Amount not available'}</div>
                              <div className="text-[#8B92A3]">{record.summary || 'This information is not available from the current data source.'}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-[#8B92A3]">This information is not available from the current data source.</div>
                      )}
                    </div>
                  )}

                  {propertyTab === 'Market' && (
                    <div>
                      <div className="text-sm font-semibold mb-2">Market</div>
                      {propertyLookupSummary.market ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {[
                            ['Geography', [propertyLookupSummary.market.location?.postalCode, propertyLookupSummary.market.location?.city, propertyLookupSummary.market.location?.state].filter(Boolean).join(', ')],
                            ['Level', propertyLookupSummary.market.geographicLevel],
                            ['Reporting Period', propertyLookupSummary.market.reportingPeriod],
                            ['Median Sale Price', propertyLookupSummary.market.medianSalePrice ? formatCurrency(propertyLookupSummary.market.medianSalePrice) : ''],
                            ['Median PPSF', propertyLookupSummary.market.medianPricePerSqft ? formatPpsqft(propertyLookupSummary.market.medianPricePerSqft) : ''],
                            ['Median Rent', propertyLookupSummary.market.medianRent ? formatCurrency(propertyLookupSummary.market.medianRent) : ''],
                            ['Average Rent', propertyLookupSummary.market.averageRent ? formatCurrency(propertyLookupSummary.market.averageRent) : ''],
                            ['Active Sale Listings', propertyLookupSummary.market.activeInventory],
                            ['Active Rental Listings', propertyLookupSummary.market.activeRentalListings],
                            ['Days on Market', propertyLookupSummary.market.averageDaysOnMarket],
                            ['Price Trend', propertyLookupSummary.market.priceTrend],
                            ['Last Updated', propertyLookupSummary.market.lastUpdated ? new Date(propertyLookupSummary.market.lastUpdated).toLocaleString() : ''],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                              <div className="text-[#8B92A3]">{label}</div>
                              <div className="text-[#E6E8EE]">{formatValue(value)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-[#8B92A3]">Market data is not available from the current data source.</div>
                      )}
                    </div>
                  )}

                  {propertyTab === 'Merge' && (
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold mr-auto">Merge Comparison</div>
                        <button type="button" onClick={applySelectedPropertyUpdates} disabled={!activePropertyDeal} className="btn btn-primary text-sm disabled:opacity-50">Apply Selected Updates</button>
                        <button type="button" onClick={savePropertyIntelligenceToDeal} disabled={!activePropertyDeal} className="btn btn-ghost text-sm disabled:opacity-50">Save Property Intelligence to Deal</button>
                      </div>
                      {propertyMergeRows.length ? (
                        <div className="overflow-auto">
                          <table className="w-full min-w-[760px] text-xs">
                            <thead className="text-[#8B92A3]">
                              <tr>
                                <th className="p-2 text-left">Field</th>
                                <th className="p-2 text-left">Current DBP Value</th>
                                <th className="p-2 text-left">Property Intelligence Value</th>
                                <th className="p-2 text-left">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {propertyMergeRows.map(row => (
                                <tr key={row.key} className="border-t border-[#252A38]">
                                  <td className="p-2 text-[#E6E8EE]">{row.label}</td>
                                  <td className="p-2 text-[#C5CAD6]">{formatValue(row.current)}</td>
                                  <td className="p-2 text-[#C5CAD6]">{formatValue(row.external)}</td>
                                  <td className="p-2">
                                    <select
                                      className="select"
                                      value={row.action}
                                      onChange={e => setPropertyMergeRows(prev => prev.map(item => item.key === row.key ? { ...item, action: e.target.value } : item))}
                                    >
                                      <option>Keep Current</option>
                                      <option>Use New Value</option>
                                      <option>Review</option>
                                      <option>Ignore</option>
                                      <option>Match</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-sm text-[#8B92A3]">Select an existing deal, then load Property Intelligence to compare values.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-[#252A38] p-6 text-center text-sm text-[#8B92A3]">
                Select a saved deal or start typing an address. Manual calculator entry remains available even without Property Intelligence.
              </div>
            )}
          </div>
        )
      }

      const sample = MOCK_PROPERTY_INTELLIGENCE_SAMPLE
      return (
        <div>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Property Intelligence</div>
              <div className="text-sm text-[#8B92A3]">Provider-neutral property, owner, comps, history, and market workspace.</div>
            </div>
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
              Sample Property Intelligence Data
            </div>
          </div>

          <div className="mb-4 rounded border border-[#252A38] bg-[#0A0C12] p-3 text-sm text-[#C5CAD6]">
            No licensed production provider result is available for this record. The information below is explicitly Sample/Mock
            Property Intelligence and must not be treated as live provider data.
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
            {['Property', 'Owner', 'Comps', 'History', 'Market'].map(tabName => (
              <span key={tabName} className="rounded border border-[#252A38] bg-[#171B26] px-3 py-1 text-[#C5CAD6]">{tabName}</span>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="panel p-3">
              <div className="text-sm font-semibold mb-2">Property</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Address', sample.property.address.line1],
                  ['County', sample.property.county],
                  ['Parcel ID', sample.property.parcelId],
                  ['Property Type', sample.property.propertyType],
                  ['Beds / Baths', `${sample.property.beds} / ${sample.property.baths}`],
                  ['Living Area', `${sample.property.livingAreaSqft.toLocaleString()} sqft`],
                  ['Year Built', String(sample.property.yearBuilt)],
                  ['Estimated Value', formatCurrency(sample.property.estimatedValue)],
                  ['Estimated Equity', formatCurrency(sample.property.estimatedEquity)],
                  ['Data Source', sample.property.source],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                    <div className="text-[#8B92A3]">{label}</div>
                    <div className="text-[#E6E8EE]">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-3">
              <div className="text-sm font-semibold mb-2">Owner</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Owner Name', sample.owner.ownerName],
                  ['Mailing Address', sample.owner.mailingAddress],
                  ['Owner Occupied', sample.owner.ownerOccupied ? 'Yes' : 'No'],
                  ['Years Owned', String(sample.owner.yearsOwned)],
                  ['Portfolio Count', String(sample.owner.portfolioPropertyCount)],
                  ['Source', sample.owner.source],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                    <div className="text-[#8B92A3]">{label}</div>
                    <div className="text-[#E6E8EE]">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-[#8B92A3]">Contact data is not shown without an authorized skip-trace provider and plan entitlement.</div>
            </div>

            <div className="panel p-3">
              <div className="text-sm font-semibold mb-2">Comps</div>
              <div className="space-y-2 text-xs">
                {sample.comps.map(comp => (
                  <div key={comp.id} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                    <div className="font-medium text-[#E6E8EE]">{comp.address.line1}</div>
                    <div className="text-[#8B92A3]">{formatCurrency(comp.salePrice)} • {comp.livingAreaSqft.toLocaleString()} sqft • {formatPpsqft(comp.salePrice / comp.livingAreaSqft)} • {comp.source}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-3">
              <div className="text-sm font-semibold mb-2">History & Market</div>
              <div className="space-y-2 text-xs">
                {sample.history.map(record => (
                  <div key={`${record.recordDate}-${record.eventType}`} className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                    <div className="text-[#E6E8EE]">{record.eventType} • {record.recordDate}</div>
                    <div className="text-[#8B92A3]">{record.summary} • Source: {record.source}</div>
                  </div>
                ))}
                <div className="rounded border border-[#252A38] bg-[#0F111A] p-2">
                  <div className="text-[#E6E8EE]">{sample.market.geographicLevel} Market • {sample.market.reportingPeriod}</div>
                  <div className="text-[#8B92A3]">Median sale {formatCurrency(sample.market.medianSalePrice)} • Median {formatPpsqft(sample.market.medianPricePerSqft)} • DOM {sample.market.averageDaysOnMarket} • Source: {sample.market.source}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // All other tabs safely disabled (should not reach here)
    return (
      <div className="p-8 text-center text-[#8B92A3]">
        <div className="text-lg mb-2">Coming soon, safely disabled.</div>
        <div className="text-sm">All calculators are now restored.</div>
      </div>
    )
  }

  return (
    <LocalDealCalcBoundary>
      <div className="max-w-[1100px] mx-auto px-4 pb-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <Link to="/app/inventory" className="mt-1 text-[#8B92A3] hover:text-white transition-colors" title="Back to Inventory">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-semibold tracking-[-0.5px]">Deal Calculator</div>
                <div className={`px-2.5 py-0.5 text-[10px] font-bold tracking-[1px] rounded ${ownerAdminMode && !ownerPreviewActive ? 'bg-[#22C55E] text-black' : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'}`}>
                  {ownerAdminMode && !ownerPreviewActive ? 'OWNER ADMIN' : ['Free', 'Free Demo'].includes(String(effectiveCalculatorPlan)) ? 'FREE' : String(effectiveCalculatorPlan).toUpperCase()}
                </div>
              </div>
              <div className="text-[#8B92A3] text-sm -mt-0.5">{calculatorAccessLabel}</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-[#171B26] border border-[#252A38] text-[#8B92A3]">
            <Calculator size={14} /> LOCAL • INSTANT • NO DATA SENT
          </div>
        </div>

        {/* Deal Selector Dropdown (Part 2) - safe, only affects this page */}
        <div className="mb-4">
          <div className="text-xs font-medium text-[#8B92A3] mb-1">Select Deal / Property (for prefill + Save to Deal)</div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={dealSearchTerm}
              onChange={e => setDealSearchTerm(e.target.value)}
              placeholder="Search deals..."
              className="input flex-1 text-sm py-1.5"
            />
            <select
              value={selectedDealId || ''}
              onChange={e => {
                const id = e.target.value || null
                setSelectedDealId(id)
                if (id) {
                  doPrefillFromDeal(id)
                  const d = useAppStore.getState().getDeal(id)
                  toast.success(`Prefilled Subject fields from ${d?.property?.address || 'selected deal'}`)
                } else {
                  // manual mode - leave subject as-is or clear if desired
                }
              }}
              className="select w-80 text-sm py-1.5"
            >
              <option value="">— No deal selected (manual mode) —</option>
              {[...(useAppStore.getState().getInventoryDeals?.() || []), ...(useAppStore.getState().getSubmissionsQueue?.() || [])]
                .filter(d => {
                  const q = safeLower(dealSearchTerm)
                  if (!q) return true
                  const addr = safeLower(d.property?.address || '')
                  return addr.includes(q)
                })
                .slice(0, 50)
                .map(d => (
                  <option key={d.id} value={d.id}>
                    {d.property?.address || 'Unknown'}, {d.property?.city || ''} {d.property?.state || ''} • {d.property?.type || ''} • {d.status}
                  </option>
                ))}
            </select>
          </div>
          <div className="text-[11px] mt-1 text-[#6B7280]">
            {selectedDealId ? `Calculating for: ${useAppStore.getState().getDeal(selectedDealId)?.property?.address || 'selected property'}` : 'Manual mode — Save to Deal disabled.'}
          </div>
        </div>

        {/* Tab Switcher - safe, no horizontal scroll, wraps on small screens */}
        <div className="flex flex-wrap gap-1 pb-px mb-5 border-b border-[#252A38]">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const isEnabled = canAccessCalculatorEntitlement(tab.id, trial, user, settings)
            const lock = getCalculatorLockMessage(tab.id, trial, user, settings)
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (!isEnabled) {
                    toast.info(lock.message)
                    return
                  }
                  setActiveTab(tab.id)
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2 -mb-px ${
                  isActive
                    ? 'bg-[#0F111A] border-[#22C55E] text-white'
                    : isEnabled
                      ? 'border-transparent text-[#8B92A3] hover:text-[#CBD5E1] hover:bg-[#171B26]/60'
                      : 'border-transparent text-[#6B7280] opacity-60 cursor-not-allowed'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {!isEnabled && (
                  <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#252A38] text-[#8B92A3]">
                    {['Free', 'Free Demo'].includes(String(lock.requiredPlan)) ? 'Included' : `${lock.requiredPlan} Required`}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content Card - always protected by the outer boundary */}
        <div className="card p-6 md:p-7">
          {renderTabContent()}
        </div>

        <div className="text-center text-[11px] text-[#6B7280] mt-8">
          {['Free', 'Free Demo'].includes(String(effectiveCalculatorPlan)) && (!ownerAdminMode || ownerPreviewActive)
            ? 'Free includes ARV Calculator only. Starter unlocks Rehab and MAO. Pro unlocks every calculator.'
            : 'Works with or without a selected deal. All calculations stay local.'}
        </div>
      </div>
    </LocalDealCalcBoundary>
  )
}
