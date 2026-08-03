
ï»¿import React, { useState, useEffect, useMemo, useRef } from 'react'
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
import { isOwnerPreviewActive } from '../../lib/planAccess'
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

// Local ErrorBoundary â€” defined only inside this file.
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
  const ownerAdminMode = hasOwnerAdminBypass(user)
  const ownerPreviewActive = isOwnerPreviewActive(user, settings)
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
  const [propertyLookupResults, setPropertyLookupResults] = useState<any[]>([])
  const [propertyLookupSummary, setPropertyLookupSummary] = useState<any | null>(null)
 ãNüæÚ$z{-®éÜj×càĞ¢·&÷W'G”ÖW&vU&÷w2æÆVæwF‚ò€Ğ¢ÆF—b6Æ74æÖSÒ&÷fW&fÆ÷rÖWFò#àĞ¢ÇF&ÆR6Æ74æÖSÒ'rÖgVÆÂÖ–â×rÕ³sc…ÒFW‡B×‡2#àĞ¢ÇF†VB6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#àĞ¢ÇG#àĞ¢ÇF‚6Æ74æÖSÒ'Ó"FW‡BÖÆVgB#äf–VÆCÂ÷FƒàĞ¢ÇF‚6Æ74æÖSÒ'Ó"FW‡BÖÆVgB#ä7W'&VçBD%fÇVSÂ÷FƒàĞ¢ÇF‚6Æ74æÖSÒ'Ó"FW‡BÖÆVgB#å&÷W'G’–çFVÆÆ–vVæ6RfÇVSÂ÷FƒàĞ¢ÇF‚6Æ74æÖSÒ'Ó"FW‡BÖÆVgB#ä7F–öãÂ÷FƒàĞ¢Â÷G#àĞ¢Â÷F†VCàĞ¢ÇF&öG“àĞ¢·&÷W'G”ÖW&vU&÷w2æÖ‡&÷rÓâ€Ğ¢ÇG"¶W“×·&÷ræ¶W—Ò6Æ74æÖSÒ&&÷&FW"×B&÷&FW"Õ²3#S$3…Ò#àĞ¢ÇFB6Æ74æÖSÒ'Ó"FW‡BÕ²4SdS„TUÒ#ç·&÷ræÆ&VÇÓÂ÷FCàĞ¢ÇFB6Æ74æÖSÒ'Ó"FW‡BÕ²43T4CeÒ#ç¶f÷&ÖEfÇVR‡&÷ræ7W'&VçB—ÓÂ÷FCàĞ¢ÇFB6Æ74æÖSÒ'Ó"FW‡BÕ²43T4CeÒ#ç¶f÷&ÖEfÇVR‡&÷ræW‡FW&æÂ—ÓÂ÷FCàĞ¢ÇFB6Æ74æÖSÒ'Ó"#àĞ¢Ç6VÆV7@Ğ¢6Æ74æÖSÒ'6VÆV7B Ğ¢fÇVS×·&÷ræ7F–öçĞĞ¢öä6†ævS×¶RÓâ6WE&÷W'G”ÖW&vU&÷w2‡&WbÓâ&WbæÖ†—FVÒÓâ—FVÒæ¶W’ÓÓÒ&÷ræ¶W’ò²ââæ—FVÒÂ7F–öã¢RçF&vWBçfÇVRÒ¢—FVÒ’—ĞĞ¢àĞ¢Æ÷F–öãä¶VW7W'&VçCÂö÷F–öãàĞ¢Æ÷F–öãåW6RæWrfÇVSÂö÷F–öãàĞ¢Æ÷F–öãå&Wf–WsÂö÷F–öãàĞ¢Æ÷F–öãä–væ÷&SÂö÷F–öãàĞ¢Æ÷F–öãäÖF6ƒÂö÷F–öãàĞ¢Â÷6VÆV7CàĞ¢Â÷FCàĞ¢Â÷G#àĞ¢’—ĞĞ¢Â÷F&öG“àĞ¢Â÷F&ÆSàĞ¢ÂöF—càĞ¢’¢€Ğ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒFW‡BÕ²3„#“$5Ò#å6VÆV7BâW†—7F–ærFVÂÂF†VâÆöB&÷W'G’–çFVÆÆ–vVæ6RFò6ö×&RfÇVW2ãÂöF—càĞ¢—ĞĞ¢ÂöF—càĞ¢—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢’¢€Ğ¢ÆF—b6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"ÖF6†VB&÷&FW"Õ²3#S$3…ÒÓbFW‡BÖ6VçFW"FW‡B×6ÒFW‡BÕ²3„#“$5Ò#àĞ¢6VÆV7B6fVBFVÂ÷"7F'BG—–ærâFG&W72âÖçVÂ6Æ7VÆF÷"VçG'’&VÖ–ç2f–Æ&ÆRWfVâv—F†÷WB&÷W'G’–çFVÆÆ–vVæ6RàĞ¢ÂöF—càĞ¢—ĞĞ¢ÂöF—càĞ¢Ğ¢ĞĞ Ğ¢6öç7B6×ÆRÒÔô4µõ$õU%E•ô”åDTÄÄ”tTä4Uõ4ÕÄPĞ¢&WGW&â€Ğ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ&Ö"ÓBfÆW‚fÆW‚Ö6öÂvÓ"ÖC¦fÆW‚×&÷rÖC¦—FV×2×7F'BÖC¦§W7F–g’Ö&WGvVVâ#àĞ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÖÆrföçB×6VÖ–&öÆBFW‡B×v†—FR#å&÷W'G’–çFVÆÆ–vVæ6SÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒFW‡BÕ²3„#“$5Ò#å&÷f–FW"ÖæWWG&Â&÷W'G’Â÷væW"Â6ö×2Â†—7F÷'’ÂæBÖ&¶WBv÷&·76RãÂöF—càĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"ÖÖ&W"ÓSó3&rÖÖ&W"ÓSó‚Ó2’ÓFW‡B×‡2FW‡BÖÖ&W"Ó##àĞ¢6×ÆR&÷W'G’–çFVÆÆ–vVæ6RFFĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ&Ö"ÓB&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²33%ÒÓ2FW‡B×6ÒFW‡BÕ²43T4CeÒ#àĞ¢æòÆ–6Vç6VB&öGV7F–öâ&÷f–FW"&W7VÇB—2f–Æ&ÆRf÷"F†—2&V6÷&BâF†R–æf÷&ÖF–öâ&VÆ÷r—2W‡Æ–6—FÇ’6×ÆRôÖö6°Ğ¢&÷W'G’–çFVÆÆ–vVæ6RæB×W7Bæ÷B&RG&VFVB2Æ—fR&÷f–FW"FFàĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ&Ö"ÓBfÆW‚fÆW‚×w&vÓãRFW‡B×‡2#àĞ¢µ²u&÷W'G’rÂt÷væW"rÂt6ö×2rÂt†—7F÷'’rÂtÖ&¶WBuÒæÖ‡F$æÖRÓâ€Ğ¢Ç7â¶W“×·F$æÖWÒ6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3s##eÒ‚Ó2’ÓFW‡BÕ²43T4CeÒ#ç·F$æÖWÓÂ÷7ãàĞ¢’—ĞĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ&w&–BvÓ2ÖC¦w&–BÖ6öÇ2Ó"#àĞ¢ÆF—b6Æ74æÖSÒ'æVÂÓ2#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBÖ"Ó"#å&÷W'G“ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"vÓ"FW‡B×‡2#àĞ¢µ°Ğ¢²tFG&W72rÂ6×ÆRç&÷W'G’æFG&W72æÆ–æSÒÀĞ¢²t6÷VçG’rÂ6×ÆRç&÷W'G’æ6÷VçG•ÒÀĞ¢²u&6VÂ”BrÂ6×ÆRç&÷W'G’ç&6VÄ–EÒÀĞ¢²u&÷W'G’G—RrÂ6×ÆRç&÷W'G’ç&÷W'G•G—UÒÀĞ¢²t&VG2ò&F‡2rÂG·6×ÆRç&÷W'G’æ&VG7ÒòG·6×ÆRç&÷W'G’æ&F‡7ÖÒÀĞ¢²tÆ—f–ær&VrÂG·6×ÆRç&÷W'G’æÆ—f–æt&V7gBçFôÆö6ÆU7G&–ær‚—Ò7gFÒÀĞ¢²u–V"'V–ÇBrÂ7G&–ær‡6×ÆRç&÷W'G’ç–V$'V–ÇB•ÒÀĞ¢²tW7F–ÖFVBfÇVRrÂf÷&ÖD7W'&Væ7’‡6×ÆRç&÷W'G’æW7F–ÖFVEfÇVR•ÒÀĞ¢²tW7F–ÖFVBWV—G’rÂf÷&ÖD7W'&Væ7’‡6×ÆRç&÷W'G’æW7F–ÖFVDWV—G’•ÒÀĞ¢²tFF6÷W&6RrÂ6×ÆRç&÷W'G’ç6÷W&6UÒÀĞ¢ÒæÖ‚…¶Æ&VÂÂfÇVUÒ’Óâ€Ğ¢ÆF—b¶W“×¶Æ&VÇÒ6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3cÒÓ"#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#ç¶Æ&VÇÓÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²4SdS„TUÒ#ç·fÇVWÓÂöF—càĞ¢ÂöF—càĞ¢’—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ'æVÂÓ2#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBÖ"Ó"#ä÷væW#ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"vÓ"FW‡B×‡2#àĞ¢µ°Ğ¢²t÷væW"æÖRrÂ6×ÆRæ÷væW"æ÷væW$æÖUÒÀĞ¢²tÖ–Æ–ærFG&W72rÂ6×ÆRæ÷væW"æÖ–Æ–ætFG&W75ÒÀĞ¢²t÷væW"ö67W–VBrÂ6×ÆRæ÷væW"æ÷væW$ö67W–VBòu–W2r¢tæòuÒÀĞ¢²u–V'2÷væVBrÂ7G&–ær‡6×ÆRæ÷væW"ç–V'4÷væVB•ÒÀĞ¢²u÷'FföÆ–ò6÷VçBrÂ7G&–ær‡6×ÆRæ÷væW"ç÷'FföÆ–õ&÷W'G”6÷VçB•ÒÀĞ¢²u6÷W&6RrÂ6×ÆRæ÷væW"ç6÷W&6UÒÀĞ¢ÒæÖ‚…¶Æ&VÂÂfÇVUÒ’Óâ€Ğ¢ÆF—b¶W“×¶Æ&VÇÒ6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3cÒÓ"#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#ç¶Æ&VÇÓÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²4SdS„TUÒ#ç·fÇVWÓÂöF—càĞ¢ÂöF—càĞ¢’—ĞĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&×BÓ2FW‡B×‡2FW‡BÕ²3„#“$5Ò#ä6öçF7BFF—2æ÷B6†÷vâv—F†÷WBâWF†÷&—¦VB6¶—×G&6R&÷f–FW"æBÆâVçF—FÆVÖVçBãÂöF—càĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ'æVÂÓ2#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBÖ"Ó"#ä6ö×3ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"FW‡B×‡2#àĞ¢·6×ÆRæ6ö×2æÖ†6ö×Óâ€Ğ¢ÆF—b¶W“×¶6ö×æ–GÒ6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3cÒÓ"#àĞ¢ÆF—b6Æ74æÖSÒ&föçBÖÖVF—VÒFW‡BÕ²4SdS„TUÒ#ç¶6ö×æFG&W72æÆ–æSÓÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#ç¶f÷&ÖD7W'&Væ7’†6ö×ç6ÆU&–6R—Ò(
"¶6ö×æÆ—f–æt&V7gBçFôÆö6ÆU7G&–ær‚—Ò7gB(
"¶f÷&ÖE7gB†6ö×ç6ÆU&–6Rò6ö×æÆ—f–æt&V7gB—Ò(
"¶6ö×ç6÷W&6WÓÂöF—càĞ¢ÂöF—càĞ¢’—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ'æVÂÓ2#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBÖ"Ó"#ä†—7F÷'’bÖ&¶WCÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"FW‡B×‡2#àĞ¢·6×ÆRæ†—7F÷'’æÖ‡&V6÷&BÓâ€Ğ¢ÆF—b¶W“×¶G·&V6÷&Bç&V6÷&DFFWÒÒG·&V6÷&BæWfVçEG—WÖÒ6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3cÒÓ"#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²4SdS„TUÒ#ç·&V6÷&BæWfVçEG—WÒ(
"·&V6÷&Bç&V6÷&DFFWÓÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#ç·&V6÷&Bç7VÖÖ'—Ò(
"6÷W&6S¢·&V6÷&Bç6÷W&6WÓÂöF—càĞ¢ÂöF—càĞ¢’—ĞĞ¢ÆF—b6Æ74æÖSÒ'&÷VæFVB&÷&FW"&÷&FW"Õ²3#S$3…Ò&rÕ²3cÒÓ"#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²4SdS„TUÒ#ç·6×ÆRæÖ&¶WBævVöw&†–4ÆWfVÇÒÖ&¶WB(
"·6×ÆRæÖ&¶WBç&W÷'F–æuW&–öGÓÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5Ò#äÖVF–â6ÆR¶f÷&ÖD7W'&Væ7’‡6×ÆRæÖ&¶WBæÖVF–å6ÆU&–6R—Ò(
"ÖVF–â¶f÷&ÖE7gB‡6×ÆRæÖ&¶WBæÖVF–å&–6UW%7gB—Ò(
"DôÒ·6×ÆRæÖ&¶WBæfW&vTF—4öäÖ&¶WGÒ(
"6÷W&6S¢·6×ÆRæÖ&¶WBç6÷W&6WÓÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢Ğ¢ĞĞ Ğ¢òòÆÂ÷F†W"F'26fVÇ’F—6&ÆVB‡6†÷VÆBæ÷B&V6‚†W&RĞ¢&WGW&â€Ğ¢ÆF—b6Æ74æÖSÒ'Ó‚FW‡BÖ6VçFW"FW‡BÕ²3„#“$5Ò#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÖÆrÖ"Ó"#ä6öÖ–ær6ööâÂ6fVÇ’F—6&ÆVBãÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×6Ò#äÆÂ6Æ7VÆF÷'2&Ræ÷r&W7F÷&VBãÂöF—càĞ¢ÂöF—càĞ¢Ğ¢ĞĞ Ğ¢&WGW&â€Ğ¢ÄÆö6ÄFVÄ6Æ4&÷VæF'“àĞ¢ÆF—b6Æ74æÖSÒ&Ö‚×rÕ³…Ò×‚ÖWFò‚ÓB"Ó"#àĞ¢²ò¢†VFW"¢÷ĞĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓBÖ"Ó2#àĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2#àĞ¢ÄÆ–æ²FóÒ"öö–çfVçF÷'’"6Æ74æÖSÒ&×BÓFW‡BÕ²3„#“$5Ò†÷fW#§FW‡B×v†—FRG&ç6—F–öâÖ6öÆ÷'2"F—FÆSÒ$&6²Fò–çfVçF÷'’#àĞ¢Ä6†Wg&öäÆVgB6—¦S×³#ÒóàĞ¢ÂôÆ–æ³àĞ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÓ7†ÂföçB×6VÖ–&öÆBG&6¶–ærÕ²ÓãW…Ò#äFVÂ6Æ7VÆF÷#ÂöF—càĞ¢ÆF—b6Æ74æÖS×¶‚Ó"ãR’ÓãRFW‡BÕ³…ÒföçBÖ&öÆBG&6¶–ærÕ³…Ò&÷VæFVBG¶÷væW$FÖ–äÖöFRbb÷væW%&Wf–Wt7F—fRòv&rÕ²3#$3STUÒFW‡BÖ&Æ6²r¢v&rÖÖ&W"ÓSóFW‡BÖÖ&W"Ó3&÷&FW"&÷&FW"ÖÖ&W"ÓSó3wÖÓàĞ¢¶÷væW$FÖ–äÖöFRbb÷væW%&Wf–Wt7F—fRòtõtäU"DÔ”âr¢²tg&VRrÂtg&VRFVÖòuÒæ–æ6ÇVFW2…7G&–ær†VffV7F—fT6Æ7VÆF÷%Æâ’’òte$TRr¢7G&–ær†VffV7F—fT6Æ7VÆF÷%Æâ’çFõWW$66R‚—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ²3„#“$5ÒFW‡B×6ÒÖ×BÓãR#ç¶6Æ7VÆF÷$66W74Æ&VÇÓÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&†–FFVâÖC¦fÆW‚—FV×2Ö6VçFW"vÓ"FW‡B×‡2‚Ó2’ÓãR&÷VæFVBÖÆr&rÕ²3s##eÒ&÷&FW"&÷&FW"Õ²3#S$3…ÒFW‡BÕ²3„#“$5Ò#àĞ¢Ä6Æ7VÆF÷"6—¦S×³GÒóâÄô4Â(
"”å5DåB(
"äòDD4Tå@Ğ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢²ò¢FVÂ6VÆV7F÷"G&÷F÷vâ…'B"’Ò6fRÂöæÇ’ffV7G2F†—2vR¢÷ĞĞ¢ÆF—b6Æ74æÖSÒ&Ö"ÓB#àĞ¢ÆF—b6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒFW‡BÕ²3„#“$5ÒÖ"Ó#å6VÆV7BFVÂò&÷W'G’†f÷"&Vf–ÆÂ²6fRFòFVÂ“ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"—FV×2Ö6VçFW"#àĞ¢Æ–çW@Ğ¢G—SÒ'FW‡B Ğ¢fÇVS×¶FVÅ6V&6…FW&×ĞĞ¢öä6†ævS×¶RÓâ6WDFVÅ6V&6…FW&Ò†RçF&vWBçfÇVR—ĞĞ¢Æ6V†öÆFW#Ò%6V&6‚FVÇ2âââ Ğ¢6Æ74æÖSÒ&–çWBfÆW‚ÓFW‡B×6Ò’ÓãR Ğ¢óàĞ¢Ç6VÆV7@Ğ¢fÇVS×·6VÆV7FVDFVÄ–BÇÂrwĞĞ¢öä6†ævS×¶RÓâ°Ğ¢6öç7B–BÒRçF&vWBçfÇVRÇÂçVÆÀĞ¢6WE6VÆV7FVDFVÄ–B†–BĞ¢–b†–B’°Ğ¢Fõ&Vf–ÆÄg&öÔFVÂ†–BĞ¢6öç7BBÒW6T7F÷&RævWE7FFR‚’ævWDFVÂ†–BĞ¢Fö7Bç7V66W72†&Vf–ÆÆVB7V&¦V7Bf–VÆG2g&öÒG¶Còç&÷W'G“òæFG&W72ÇÂw6VÆV7FVBFVÂwÖĞ¢ÒVÇ6R°Ğ¢òòÖçVÂÖöFRÒÆVfR7V&¦V7B2Ö—2÷"6ÆV"–bFW6—&V@Ğ¢ĞĞ¢×ĞĞ¢6Æ74æÖSÒ'6VÆV7BrÓƒFW‡B×6Ò’ÓãR Ğ¢àĞ¢Æ÷F–öâfÇVSÒ"#î(	BæòFVÂ6VÆV7FVB†ÖçVÂÖöFR’(	CÂö÷F–öãàĞ¢µ²âââ‡W6T7F÷&RævWE7FFR‚’ævWD–çfVçF÷'”FVÇ3òâ‚’ÇÂµÒ’Ââââ‡W6T7F÷&RævWE7FFR‚’ævWE7V&Ö—76–öç5VWVSòâ‚’ÇÂµÒ•ĞĞ¢æf–ÇFW"†BÓâ°Ğ¢6öç7BÒ6fTÆ÷vW"†FVÅ6V&6…FW&ÒĞ¢–b‚’&WGW&âG'VPĞ¢6öç7BFG"Ò6fTÆ÷vW"†Bç&÷W'G“òæFG&W72ÇÂrrĞ¢&WGW&âFG"æ–æ6ÇVFW2‡Ğ¢ÒĞ¢ç6Æ–6RƒÂSĞ¢æÖ†BÓâ€Ğ¢Æ÷F–öâ¶W“×¶Bæ–GÒfÇVS×¶Bæ–GÓàĞ¢¶Bç&÷W'G“òæFG&W72ÇÂuVæ¶æ÷vâwÒÂ¶Bç&÷W'G“òæ6—G’ÇÂrwÒ¶Bç&÷W'G“òç7FFRÇÂrwÒ(
"¶Bç&÷W'G“òçG—RÇÂrwÒ(
"¶Bç7FGW7ĞĞ¢Âö÷F–öãàĞ¢’—ĞĞ¢Â÷6VÆV7CàĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ'FW‡BÕ³…Ò×BÓFW‡BÕ²3d#s#ƒÒ#àĞ¢·6VÆV7FVDFVÄ–Bò6Æ7VÆF–ærf÷#¢G·W6T7F÷&RævWE7FFR‚’ævWDFVÂ‡6VÆV7FVDFVÄ–B“òç&÷W'G“òæFG&W72ÇÂw6VÆV7FVB&÷W'G’wÖ¢tÖçVÂÖöFR(	B6fRFòFVÂF—6&ÆVBâwĞĞ¢ÂöF—càĞ¢ÂöF—càĞ Ğ¢²ò¢F"7v—F6†W"Ò6fRÂæò†÷&—¦öçFÂ67&öÆÂÂw&2öâ6ÖÆÂ67&VVç2¢÷ĞĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"×‚Ö"ÓR&÷&FW"Ö"&÷&FW"Õ²3#S$3…Ò#àĞ¢·F'2æÖ‡F"Óâ°Ğ¢6öç7B–6öâÒF"æ–6öàĞ¢6öç7B—47F—fRÒ7F—fUF"ÓÓÒF"æ–@Ğ¢6öç7B—4Væ&ÆVBÒ6ä66W746Æ7VÆF÷$VçF—FÆVÖVçB‡F"æ–BÂG&–ÂÂW6W"Â6WGF–æw2Ğ¢6öç7BÆö6²ÒvWD6Æ7VÆF÷$Æö6´ÖW76vR‡F"æ–BÂG&–ÂÂW6W"Â6WGF–æw2Ğ¢&WGW&â€Ğ¢Æ'WGFöàĞ¢¶W“×·F"æ–GĞĞ¢öä6Æ–6³×²‚’Óâ°Ğ¢–b‚—4Væ&ÆVB’°Ğ¢Fö7Bæ–æfò†Æö6²æÖW76vRĞ¢&WGW&àĞ¢ĞĞ¢6WD7F—fUF"‡F"æ–BĞ¢×ĞĞ¢6Æ74æÖS×¶fÆW‚—FV×2Ö6VçFW"vÓ"‚Ó2’Ó"FW‡B×6ÒföçBÖÖVF—VÒ&÷VæFVB×BÖÆrv†—FW76RÖæ÷w&G&ç6—F–öâÖÆÂ&÷&FW"Ö"Ó"ÖÖ"×‚G°Ğ¢—47F—fPĞ¢òv&rÕ²3cÒ&÷&FW"Õ²3#$3STUÒFW‡B×v†—FRpĞ¢¢—4Væ&ÆV@Ğ¢òv&÷&FW"×G&ç7&VçBFW‡BÕ²3„#“$5Ò†÷fW#§FW‡BÕ²44$CTSÒ†÷fW#¦&rÕ²3s##eÒócpĞ¢¢v&÷&FW"×G&ç7&VçBFW‡BÕ²3d#s#ƒÒ÷6—G’Óc7W'6÷"Öæ÷BÖÆÆ÷vVBpĞ¢ÖĞĞ¢àĞ¢Ä–6öâ6—¦S×³WÒóàĞ¢·F"æÆ&VÇĞĞ¢²—4Væ&ÆVBbb€Ğ¢Ç7â6Æ74æÖSÒ&ÖÂÓFW‡BÕ³—…Ò‚ÓãR’ÓãR&÷VæFVB&rÕ²3#S$3…ÒFW‡BÕ²3„#“$5Ò#àĞ¢µ²tg&VRrÂtg&VRFVÖòuÒæ–æ6ÇVFW2…7G&–ær†Æö6²ç&WV—&VEÆâ’’òt–æ6ÇVFVBr¢G¶Æö6²ç&WV—&VEÆçÒ&WV—&VFĞĞ¢Â÷7ãàĞ¢—ĞĞ¢Âö'WGFöãàĞ¢Ğ¢Ò—ĞĞ¢ÂöF—càĞ Ğ¢²ò¢6öçFVçB6&BÒÇv—2&÷FV7FVB'’F†R÷WFW"&÷VæF'’¢÷ĞĞ¢ÆF—b6Æ74æÖSÒ&6&BÓbÖC§Ór#àĞ¢·&VæFW%F$6öçFVçB‚—ĞĞ¢ÂöF—càĞ Ğ¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"FW‡BÕ³…ÒFW‡BÕ²3d#s#ƒÒ×BÓ‚#àĞ¢µ²tg&VRrÂtg&VRFVÖòuÒæ–æ6ÇVFW2…7G&–ær†VffV7F—fT6Æ7VÆF÷%Æâ’’bb‚÷væW$FÖ–äÖöFRÇÂ÷væW%&Wf–Wt7F—fRĞ¢òtg&VR–æ6ÇVFW2%b6Æ7VÆF÷"öæÇ’â7F'FW"VæÆö6·2&V†"æBÔòâ&òVæÆö6·2WfW'’6Æ7VÆF÷"âpĞ¢¢uv÷&·2v—F‚÷"v—F†÷WB6VÆV7FVBFVÂâÆÂ6Æ7VÆF–öç27F’Æö6ÂâwĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂôÆö6ÄFVÄ6Æ4&÷VæF'“àĞ¢Ğ§ĞĞ