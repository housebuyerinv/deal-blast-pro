import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { DEFAULT_SETTINGS, PROPERTY_TYPES } from '../../lib/constants'
import { toast } from 'sonner'
import { uploadLocalAppDataToCloud, loadCloudAppDataToLocal } from '../../lib/cloudSync'
import { getStorageMode, getActiveAdapterName, isApiMode } from '../../services/storage'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { listPendingDealSubmissions } from '../../lib/dealSubmissionStorage'
import { listPendingBuyerPortalSubmissions } from '../../lib/buyerPortalSubmissionStorage'
import { CONTACT_SUBMISSIONS_TABLE, getLastContactSubmissionStatus } from '../../lib/contactSubmissionStorage'
import { fetchBuyersFromSupabase } from '../../lib/buyerSupabaseSync'
import { BUYER_PROOF_BUCKET } from '../../lib/buyerProofStorage'
import { getLastSubmissionNotificationWarning } from '../../lib/submissionNotifications'
import {
  DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
  loadEmailNotificationLogs,
  loadEmailNotificationSettings,
  parseNotificationRecipients,
  saveEmailNotificationSettings,
  sendEmailNotificationTest,
  validateNotificationRecipients,
  type EmailNotificationLog,
  type EmailNotificationSettings,
} from '../../lib/emailNotificationSettings'
import { isSuperAdmin, isRegularUser } from '../../lib/accessControl'
import { canAccessCalculatorTab } from '../../lib/calculatorAccess'
import { getBillingNotice, getOwnerPreviewPlan, isOwnerPreviewActive, PLAN_ROUTE_ACCESS, type PlanName } from '../../lib/planAccess'
import { getBuyerCapacity, getPlanEntitlement } from '../../lib/planEntitlements'
import { getWorkspaceDisplayName } from '../../lib/workspaceName'
import { getBillingControlPolicy } from '../../lib/customerExperiencePolicies'
import { PAST_DUE_READ_ONLY_DAYS, PAST_DUE_RESTRICTED_DAYS } from '../../lib/accountLifecycle'
import { PLAN_PRICING, PRICING_PLAN_ORDER, getPriceDisplay, type PricingPlanName } from '../../lib/planPricing'
import {
  parseBuyerRecoveryImportFile,
  prepareRecoveredBuyers,
  recoverableBuyersToCsv,
  scanBuyerRecoverySources,
  type BuyerRecoveryScanResult,
  type RecoverableBuyer,
} from '../../lib/buyerRecovery'
import { billingLinkFields, billingLinkLabels, buildStripeCheckoutUrl, getBillingSetupWithLaunchDefaults, getPlanPaymentLink, isValidPaymentUrl, type BillingFrequency, type PaidPlan } from '../../lib/billingLinks'
import { AlertTriangle, Lock, Mail } from 'lucide-react'
import {
  getPendingAuthEmailChange,
  loadAccountProfile,
  profileToUserNames,
  requestVerifiedEmailChange,
  saveAccountProfile,
} from '../../lib/accountProfile'

export default function Settings() {
  const { 
    user, settings, updateSettings, trial, upgradeToPlan, activateManualPlan, resetTrial, updateUserProfile,
    reseedData, clearAllData, exportAllData, importBuyers,
    buyers, deals, blastLogs, followUps, offers, suppressionList, workspaceInstanceId, logout
  } = useAppStore()
  const currentPlan = ((trial.plan === 'Free' ? 'Free' : trial.plan) || (trial.isPaid ? 'Pro' : 'Free')) as 'Free' | 'Starter' | 'Pro' | 'Agency' | 'Enterprise'
  const isPaidPlan = currentPlan !== 'Free'
  const currentBillingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : currentPlan === 'Free' ? 'Free Active' : 'Trial Active')
  const isFreeAccount = currentBillingStatus === 'Free Active' && currentPlan === 'Free'
  const trialStatusLabel = isPaidPlan ? `${currentPlan} plan selected` : 'Free plan active'
  const billingStatusLabel = currentBillingStatus
  const defaultBillingProviderSetup = getBillingSetupWithLaunchDefaults(DEFAULT_SETTINGS.billingProviderSetup!)
  const savedBillingProviderSetup = getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || defaultBillingProviderSetup)
  const onboardingSettings = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }

  const [activeTab, setActiveTab] = useState<'Trial'|'Matching'|'Templates'|'Data'|'Demo'|'Team'|'Diagnostics'|'Production'>('Trial')
  const [activeTemplate, setActiveTemplate] = useState('Strong Buyer')
  const [templateSubject, setTemplateSubject] = useState(settings.blastTemplates['Strong Buyer']?.subject || '')
  const [templateBody, setTemplateBody] = useState(settings.blastTemplates['Strong Buyer']?.body || '')
  const [billingProviderSetup, setBillingProviderSetup] = useState(savedBillingProviderSetup)
  const [settingsBillingFrequency, setSettingsBillingFrequency] = useState<BillingFrequency>('monthly')
  const [settingsSelectedPlan, setSettingsSelectedPlan] = useState<'Free' | PaidPlan>(currentPlan === 'Free' ? 'Pro' : currentPlan)
  const [manualActivation, setManualActivation] = useState({
    workspace: user?.email || user?.name || 'Current workspace',
    plan: currentPlan,
    billingStatus: currentBillingStatus,
    billingPeriodStart: trial.billingPeriodStart || '',
    billingPeriodEnd: trial.billingPeriodEnd || '',
    billingAdminNote: trial.billingAdminNote || '',
  })
  const [selectedDetail, setSelectedDetail] = useState<any>(null)
  const [trialCountdown, setTrialCountdown] = useState({ days: 0, hours: 0, minutes: 0 })
  // Templates tab polish support (local only, no impact on other tabs or persistence)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [testBuyer, setTestBuyer] = useState('Alex R.')
  const [testAddress, setTestAddress] = useState('456 Main St, Austin TX')
  const [testPrice, setTestPrice] = useState('287500')

  // Backups & Exports (Data tab only) - last export tracking for UI feedback
  const [lastExport, setLastExport] = useState<string | null>(null)
  const [lastExportSizes, setLastExportSizes] = useState<Record<string, number>>({})

  // Build Environment Status / Backup Readiness / Last Build Report (Data tab ONLY - on-screen status cards for visibility when terminal is stuck/unreliable)
  const [lastBuildReport, setLastBuildReport] = useState<{date: string; success: boolean; routes: number; components: number} | null>(null)
  const [lastDataBackup, setLastDataBackup] = useState<string | null>(null)
  const [sourceCodeBackupConfirmed, setSourceCodeBackupConfirmed] = useState<boolean>(true) // seeded true from prior full-source ZIP creation in backup phase; user can toggle/confirm via button
  const [launchChecks, setLaunchChecks] = useState<Record<string, { status: 'pass' | 'warning' | 'fail'; label: string; detail: string }>>({})
  const [launchCheckRunning, setLaunchCheckRunning] = useState(false)
  const [launchCheckedAt, setLaunchCheckedAt] = useState('')
  const [launchTestResults, setLaunchTestResults] = useState<LaunchTestResult[]>([])
  const [launchTestRunning, setLaunchTestRunning] = useState(false)
  const [launchTestCheckedAt, setLaunchTestCheckedAt] = useState('')
  const [buyerRecoveryScan, setBuyerRecoveryScan] = useState<BuyerRecoveryScanResult | null>(null)
  const [buyerRecoveryRunning, setBuyerRecoveryRunning] = useState(false)
  const [buyerRecoveryPreviewVisible, setBuyerRecoveryPreviewVisible] = useState(false)
  const [selectedRecoverableBuyerIds, setSelectedRecoverableBuyerIds] = useState<Record<string, boolean>>({})
  const [importedRecoverableBuyers, setImportedRecoverableBuyers] = useState<RecoverableBuyer[]>([])
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountConfirmed, setDeleteAccountConfirmed] = useState(false)
  const [deleteAccountText, setDeleteAccountText] = useState('')
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [billingPortalAction, setBillingPortalAction] = useState<'' | 'portal' | 'invoice'>('')
  const deleteAccountTriggerRef = useRef<HTMLButtonElement | null>(null)
  const deleteAccountModalRef = useRef<HTMLDivElement | null>(null)
  const deleteAccountConfirmInputRef = useRef<HTMLInputElement | null>(null)
  const [customerSettingsTab, setCustomerSettingsTab] = useState<'Plan & Billing' | 'Account' | 'Support'>('Plan & Billing')
  const emailWorkspaceId = workspaceInstanceId || 'default'
  const [emailSettings, setEmailSettings] = useState<EmailNotificationSettings>({
    ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
    workspace_id: emailWorkspaceId,
  })
  const [emailRecipientsText, setEmailRecipientsText] = useState(DEFAULT_EMAIL_NOTIFICATION_SETTINGS.recipients.join(', '))
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false)
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false)
  const [emailTestSending, setEmailTestSending] = useState(false)
  const [emailLogs, setEmailLogs] = useState<EmailNotificationLog[]>([])
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    displayName: '',
    businessName: '',
    email: '',
  })
  const [profileInitial, setProfileInitial] = useState({
    fullName: '',
    displayName: '',
    businessName: '',
    email: '',
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [emailChangeOpen, setEmailChangeOpen] = useState(false)
  const [emailChangeValue, setEmailChangeValue] = useState('')
  const [emailChangeSaving, setEmailChangeSaving] = useState(false)
  const [emailChangeMessage, setEmailChangeMessage] = useState('')
  const [pendingEmailChange, setPendingEmailChange] = useState('')
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistRetryingId, setWaitlistRetryingId] = useState('')

  // Ensure storage imports are referenced (used in Diagnostics tab) to satisfy strict TS unused check
  void getStorageMode; void getActiveAdapterName; void isApiMode

  // Silence TS unused (offers provided by store for completeness but not rendered in Settings UI)
  void offers

  const billingProviderOptions = ['Stripe'] as const
  const billingModeOptions = ['Stripe Checkout Links'] as const
  const billingStatusOptions = ['Ready for Payment Collection'] as const
  const manualPlanOptions = ['Free', 'Starter', 'Pro', 'Agency', 'Enterprise'] as const
  const manualBillingStatusOptions = ['Free Active', 'Payment Pending', 'Paid Active', 'Past Due', 'Cancelled', 'Comped'] as const
  const hasSuperAdminAccess = isSuperAdmin(user)
  const ownerPreviewActive = isOwnerPreviewActive(user, settings)
  const hasInternalBillingDiagnosticsAccess = hasSuperAdminAccess && !ownerPreviewActive
  const ownerPreviewPlan = getOwnerPreviewPlan(settings)
  const regularUser = isRegularUser(user)
  const showCustomerSettingsView = regularUser || ownerPreviewActive
  const deletionRequest = settings.deletionRequest || DEFAULT_SETTINGS.deletionRequest!
  const billingCenter = {
    ...DEFAULT_SETTINGS.billingCenter!,
    ...(settings.billingCenter || {}),
    paymentHistory: settings.billingCenter?.paymentHistory || DEFAULT_SETTINGS.billingCenter!.paymentHistory || [],
  }
  const paymentHistory = billingCenter.paymentHistory || []
  const hasWebhookDelivery = Boolean(billingCenter.lastStripeSyncAt)
  const hasSuccessfulActivation = hasWebhookDelivery && billingCenter.autoActivationStatus === 'Ready'
  const stripeAutoActivationLabel = hasSuccessfulActivation
    ? 'Ready'
    : hasWebhookDelivery
      ? 'Needs Review'
      : 'Waiting for First Verified Webhook'
  const stripeAutoActivationDetail = hasSuccessfulActivation
    ? 'Stripe Auto-Activation: Ready'
    : hasWebhookDelivery
      ? 'Stripe Auto-Activation: Needs Review'
      : 'Stripe Auto-Activation: Waiting for First Verified Webhook'
  const planPaymentLinkFields = (['Starter', 'Pro', 'Agency', 'Enterprise'] as PaidPlan[])
    .flatMap(plan => (['monthly', 'annual'] as BillingFrequency[]).map(frequency => ({
      plan,
      frequency,
      field: billingLinkFields[plan][frequency] as keyof typeof billingProviderSetup,
      label: `${billingLinkLabels[plan][frequency]} Payment Link URL`,
    })))

  const previewPlanOptions: PlanName[] = ['Owner Admin', 'Free', 'Starter', 'Pro', 'Agency', 'Enterprise']
  const effectivePlanForDisplay = ownerPreviewActive && ownerPreviewPlan !== 'Owner Admin'
    ? (ownerPreviewPlan === 'Free' ? 'Free' : ownerPreviewPlan)
    : currentPlan
  const effectiveBillingStatusForDisplay = ownerPreviewActive
    ? effectivePlanForDisplay === 'Free'
      ? 'Free Preview'
      : 'Preview Active'
    : currentBillingStatus
  const effectiveBillingFrequencyForDisplay = ownerPreviewActive ? 'monthly' as BillingFrequency : (trial.billingFrequency || 'monthly') as BillingFrequency
  const effectiveIsFreeForDisplay = effectivePlanForDisplay === 'Free'
  const effectiveCapsForDisplay = effectivePlanForDisplay === 'Free'
    ? [
      ['Active Deals', '3 active deals'],
      ['Buyers', '25 buyers'],
      ['Blasts', 'Not included'],
      ['Exports', '20 exports'],
    ]
    : effectivePlanForDisplay === 'Starter'
      ? [
        ['Deals', 'Starter solo operator limits'],
        ['Buyers', 'Starter buyer cap'],
        ['Blasts', 'Basic deal blasts'],
        ['Exports', 'Basic outreach exports'],
      ]
      : effectivePlanForDisplay === 'Pro'
        ? [
          ['Deals', 'Expanded Pro limits'],
          ['Buyers', 'Expanded buyer records'],
          ['Blasts', 'Regular buyer outreach'],
          ['Exports', 'Buyer outreach exports'],
        ]
        : [
          ['Plan status', 'Coming Soon / Contact Admin'],
          ['Team workflows', 'Roadmap or custom setup'],
          ['Automation', 'Requires setup'],
          ['Support', 'Contact Admin'],
        ]
  const effectiveFeaturesForDisplay = effectivePlanForDisplay === 'Free'
    ? ['Command Center limited', 'Public intake portals available', 'Inventory basics', 'Buyer records within cap', 'ARV Calculator only', 'Billing Center limited']
    : effectivePlanForDisplay === 'Starter'
      ? ['Command Center', 'Deal Submissions', 'Inventory Hub', 'Basic buyer records/import', 'ARV/Rehab/MAO calculators', 'Basic Pipeline Board', 'Basic Deal Blast Builder', 'Basic follow-up tools']
      : effectivePlanForDisplay === 'Pro'
        ? ['All Starter features', 'Advanced buyer matching', 'Heat score / advanced tags', 'Saved buyer segments', 'Buyer outreach exports', 'Deal blast templates', 'Follow-up task tools', 'Basic analytics', 'All calculators']
        : ['Coming Soon / Contact Admin', 'Team/VA workflows may require setup', 'Custom onboarding and integrations may require setup']
  const customerBillingStatus = String(currentBillingStatus || effectiveBillingStatusForDisplay || '')
  const paidBillingStatuses = new Set(['Paid Active', 'Past Due', 'Payment Pending', 'Com×O6Ókh‘éì¶»§q«^u\Ê›\İÙÜßßJK™›]

K›[™İK™\œÚ[ÛˆŒKŒˆNÈÛÛœİ›ØˆH™]È›ØŠÒ”ÓÓ‹œİš[™ÚYJ™\Ü[ŠWKİ\Nˆ˜\XØ][Û‹ÚœÛÛˆŸJNÈÛÛœİ\›HT“˜Ü™X]SØš™XİT“
›ØŠNÈÛÛœİHHØİ[Y[˜Ü™X]Q[[Y[
˜HŠNÈKš™YˆH\›ÈK™İÛ›ØYH™X[›\İYXYÛ›ÜİXÜËšœÛÛˆÈK˜ÛXÚÊ
NÈØ\İœİXØÙ\ÜÊ‘XYÛ›ÜİXÈ™\ÜİÛ›ØYYŠH_HÛ\ÜÓ˜[YOH˜ˆ‹YÚÜİ^^È‘İÛ›ØYXYÛ›ÜİXÈ™\ÜØ]ÛƒBˆÙ]ƒBˆÙ]ƒBƒBˆËÊˆ]™[ÙÈ
È]™[Ü\ˆ[™Ù™ˆ
[š[˜ÙY
H
‹ßCBˆ]ˆÛ\ÜÓ˜[YOH™ÜšYÜšYXÛÛËLHY™ÜšYXÛÛËLˆØ\L‹HƒBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	Ñ]™[ÙÉËİ[[X\Nˆ	Ô™XÙ[XYÛ›ÜİXÈ[™™\Z\ˆXİ[ÛœÈ
[[ÊK‰Ë™^ˆ	ĞÛX\ˆšXH™\ÙYYÚ[ˆ™\Ù][™È\İØÙ[˜\š[ÜË‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™Ü›İ\L‹H›Ü™\ˆ›Ü™\‹VÈÍÍ—KÌŒİ™\˜›Ü™\‹VÈÍÍ—KÍLİ™\‹]˜[œÛ]K^K\İ™\œÚYİËVÌÌÌÌ\ÈÍÍŒMWHİ™\œš[™ËLHİ™\œš[™ËZ[œÙ]İ™\œš[™ËVÈÍÍ—KÌŒ˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH‘]™[ÙÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÌLH^VÈÎLL×HÜXÙK^KLHƒBˆ]¸ (ˆİÜ˜YÙHX[ÚXÚÙYÙ]ƒBˆ]¸ (ˆ]X˜\ÙH™\Z\™YÙ]ƒBˆ]¸ (ˆXYÛ›ÜİXÈ™\ÜİÛ›ØYYÙ]ƒBˆ]¸ (ˆ[\]\È™\šYšYYÙ]ƒBˆÙ]ƒBˆÙ]ƒBƒBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	Ñ]™[Ü\ˆ[™Ù™ˆÚXÚÛ\İ	Ëİ[[X\Nˆ	Ò][\ÈÈÛÛ\]H™Y›Ü™H™X[˜XÚÙ[™È›Ù[™Ù™‹ˆ[İ\œ™[H[[Ë[Û›K‰Ë™^ˆ	Õ\]H\È\İ[ˆÛÙH\È˜XÚÙ[™ÛÜšÈ›ÙÜ™\ÜÙ\Ë‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™L‹H›Ü™\ˆ›Ü™\‹VÈÍÍ—KÌÌİ™\˜›Ü™\‹VÈÍÍ—KÍLİ™\‹]˜[œÛ]K^K\˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH‘]™[Ü\ˆ[™Ù™ˆÚXÚÛ\İÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^^ÈÜšYÜšYXÛÛËLHÛN™ÜšYXÛÛËLˆØ\^LÈØ\^KLHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_OƒBˆÖÈ‘[š\›Û›Y[˜\šXX›\È™\šYšYY
™[ŠH‹Y\\ˆ[\™˜XÙH™]šY]ÙY‹TH›İ]\È™]šY]ÙY
ØÜËĞTWÔ“ÕUTË›Y
H‹‘]H[Ù[™]šY]ÙY
ØÜËÑUWÓSÑS›Y
H‹]]›İšY\ˆÙ[XİY‹‘]X˜\ÙHÙ[XİY‹‘š[HİÜ˜YÙHÙ[XİY‹‘[XZ[›İšY\ˆÙ[XİY‹”^[Y[›İšY\ˆÙ[XİY‹”›ÙXİ[ÛˆYØ[ÛÜH[™[™È‹“[Ûš]Üš[™ÈÈ\œ›Üˆ˜XÚÚ[™È[™[™È—K›X\

][KJHOˆ
Bˆ]ˆÙ^O^Ú_HÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LKH^VÌLHKLHÜ[ˆÛ\ÜÓ˜[YOHœLHKLH›İ[™Y™ËVÈÍÍ—KÌL^VÈÍÍ—H^VÎ\H”[™[™ÏÜÜ[ˆÚ][_OÙ]ƒBˆ
J_CBˆÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÎLL×H]LH”İ]\ÈÚ\È›Üˆ]ZXÚÈØØ[‹Ù]ƒBˆÙ]ƒBˆÙ]ƒBˆÙ]ƒBˆ
_CBƒBˆØXİ]™UXˆOOH	Ô›ÙXİ[Û‰È	‰ˆ
Bˆ]ˆÛ\ÜÓ˜[YOHœÜXÙK^KLÈƒBˆËÊˆXÛÜŞ\İ[H[š]X[^˜][ÛˆÚXÚÛ\İ
]Ü\ˆÜXÊH
‹ßCBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	ÑXÛÜŞ\İ[H[š]X[^˜][Û‰Ëİ[[X\Nˆ	ĞÛÜ™H][˜ÚÚXÚÛ\İˆ[Üİ][\Èİ]XÈ[[È[[™X[˜XÚÙ[™ˆÛÛ\]H\ÙHÈ[˜X›H][˜Ú]Û‹‰Ë™^ˆ	Õ\]Hİ]\Ù\È[ˆ™X[[\ˆ][˜Ú™\]Z\™\È[Ü™Y[‹‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™Ü›İ\LÈ›Ü™\ˆ›Ü™\‹VÈÌŒÍMQWKÌŒİ™\˜›Ü™\‹VÈÌŒÍMQWKÍLİ™\‹]˜[œÛ]K^K\İ™\œÚYİËVÌÌÌÌ\ÈÌŒ˜ÍMYLMWHİ™\œš[™ËLHİ™\œš[™ËZ[œÙ]İ™\œš[™ËVÈÌŒÍMQWKÌŒ˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆ™[]]™Hİ™\™›İËZY[ˆƒBˆ]ˆÛ\ÜÓ˜[YOH˜XœÛÛ]H[œÙ]L™ËYÜ˜YY[]Ë\ˆœ›ÛK]˜[œÜ\™[šXKVÈÌŒ˜ÍMYLHË]˜[œÜ\™[]˜[œÛ]K^Y[Ü›İ\Zİ™\˜[œÛ]K^Y[˜[œÚ][Û‹]˜[œÙ›Ü›H\˜][Û‹VÌN\×HÚ[\‹Y]™[Ë[›Û™HˆÏƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û[YY][H^\ÛHX‹LKH›^][\ËXÙ[\ˆØ\Lˆ‘XÛÜŞ\İ[H[š]X[^˜][ÛˆÜ[ˆÛ\ÜÓ˜[YOH^VÎ\HLKHKLH›İ[™Y™ËVÈÌŒÍMQWKÌL^VÈÌŒÍMQWH“][˜ÚOÜÜ[Ù]ƒBˆ]ˆÛ\ÜÓ˜[YOH™ÜšYÜšYXÛÛËLˆÛN™ÜšYXÛÛËLÈØ\^LÈØ\^KLH^^ÈˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_OƒBˆÖÉĞ\Ú[™\ÜÈ›Ùš[IË	ĞYZ[ˆ\Ù\‰Ë	Ñ[XZ[[\]\ÉË	Ğ^Y\ˆ]X˜\ÙIË	ÔİX›Z\ÜÚ[Ûˆ›Ü›IË	ÔX›XÈ[Ù[ÉË	Ğ[˜[]XÜÉË	Ğ˜XÚİ\ÉË	Õ\›\ÉË	Ôš]˜XŞI×K›X\

][KJHOˆ
Bˆ]ˆÙ^O^Ú_HÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LKHÜ[ˆÛ\ÜÓ˜[YOH^VÎ\HLHKLH›İ[™Y™ËVÈÍÍ—KÌL^VÈÍÍ—HÏÜÜ[ˆÚ][_OÙ]ƒBˆ
J_CBˆÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÍÍ—H]LH“X\šÈÛÛ\]H[ˆ™X[\Ş[Y[ˆİ\œ™[ˆ[[ÈXÙZÛ\œËÙ]ƒBˆÙ]ƒBƒBˆËÊˆ][˜Úİ]\ÈY]\ˆ
È™XY[™\ÜÈØÛÜ™H
È][˜Ú]Ûˆ
È™\]Z\™[Y[È
‹ßCBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	Ó][˜Úİ]\ÉËİ[[X\Nˆ	Óİ™\˜[™XY[™\ÜÈLL	H\š]™Yœ›ÛHÚXÚÛ\İ
È\[[™KˆØÛÜ™H™Y›XİÈX]\š]K‰Ë™^ˆ	Ó][˜Ú]Ûˆ[˜X›\ÈÛ›HÚ[ˆ[Üš]XØ[][\È™XYK‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™Ü›İ\LÈ›Ü™\ˆ›Ü™\‹VÈÌŒÍMQWKÌŒİ™\˜›Ü™\‹VÈÌŒÍMQWKÍLİ™\‹]˜[œÛ]K^K\İ™\œÚYİËVÌÌÌÌ\ÈÌŒ˜ÍMYLMWHİ™\œš[™ËLHİ™\œš[™ËZ[œÙ]İ™\œš[™ËVÈÌŒÍMQWKÌŒ˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆ™[]]™Hİ™\™›İËZY[ˆƒBˆ]ˆÛ\ÜÓ˜[YOH˜XœÛÛ]H[œÙ]L™ËYÜ˜YY[]Ë\ˆœ›ÛK]˜[œÜ\™[šXKVÈÌŒ˜ÍMYLHË]˜[œÜ\™[]˜[œÛ]K^Y[Ü›İ\Zİ™\˜[œÛ]K^Y[˜[œÚ][Û‹]˜[œÙ›Ü›H\˜][Û‹VÌN\×HÚ[\‹Y]™[Ë[›Û™HˆÏƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH“][˜Úİ]\ÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH›X‹LKHƒBˆ]ˆÛ\ÜÓ˜[YOH^^È^VÈÎLL×HX‹LH“][˜Úİ]\ÈY]\Ù]ƒBˆ]ˆÛ\ÜÓ˜[YOHšLˆ™ËVÈÌLLÎH›İ[™Yİ™\™›İËZY[ˆ]ˆÛ\ÜÓ˜[YOHšY[™ËVÈÌŒÍMQWHˆİ[O^ŞİÚY‰Í‰Iß_HÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^^È^VÈÑM‘NQWH]LH‰OÙ]ƒBˆÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH›X‹LKHƒBˆ]ˆÛ\ÜÓ˜[YOH^^È^VÈÎLL×HX‹LH”™[X\ÙH™XY[™\ÜÈØÛÜ™OÙ]ƒBˆÜ[ˆÛ\ÜÓ˜[YOHœLˆKLH›İ[™Y^\ÛH™ËX[X™\‹MLÌL^X[X™\‹M›Û[YY][HÜÜ[ƒBˆÙ]ƒBƒBˆËÊˆ][˜Ú™\]Z\™[Y[È\ˆÜXÈ
‹ßCBˆ]ˆÛ\ÜÓ˜[YOH›X‹LKHƒBˆ]ˆÛ\ÜÓ˜[YOH^^È^VÈÎLL×HX‹LH“][˜Ú™\]Z\™[Y[ÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÌLHÜšYÜšYXÛÛËLˆØ\^KLHƒBˆ]ˆÛ\ÜÓ˜[YOH^VÈÌŒÍMQWHÈXÛÜŞ\İ[HÚXÚÛ\İÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^X[X™\‹MÈX›XÈ[Ù[ÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^X[X™\‹MÈH]][XØ][ÛÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÈÌŒÍMQWHÈPHÈZ[Ù]ƒBˆ]ˆÛ\ÜÓ˜[YOH^X[X™\‹MÈ[[È]H™[[İ™YÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÈÌŒÍMQWHÈ˜XÚİ\^ÜYÙ]ƒBˆÙ]ƒBˆÙ]ƒBƒBˆ]ÛˆÛÛXÚÏ^ÊJHOˆÈKœİÜ›ÜYØ][ÛŠ
NÈ[\
	Ó][˜Ú\ØX›YˆXÛÜŞ\İ[H[š]X[^˜][ÛˆÚXÚÛ\İ›İÛÛ\]Kˆ
[[ÊIÊH_H\ØX›YÛ\ÜÓ˜[YOH˜ˆ‹YÚÜİ^^ÈÜXÚ]KMŒİ\œÛÜ‹[›İX[İÙYËY[“][˜Ú
\ØX›Y8 %ÛÛ\]HÚXÚÛ\İ
OØ]ÛƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÍÍ—H]LH]Ûˆ[˜X›\ÈÛ›HÚ[ˆÚXÚÛ\İ
È\[[™H[™XYKÙ]ƒBˆÙ]ƒBƒBˆËÊˆ›ÙXİ[Ûˆ™XY[™\ÜÈ
Ù\
ÈÛ\ÚY
H
‹ßCBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	Ô›ÙXİ[Ûˆ™XY[™\ÜÉËİ[[X\Nˆ	ÒYÚ[]™[ÚXÚÛ\İ›ÜˆÛÚ[™È]™KˆX[H][\È\™HXÙZÛ\œÈ[[™X[˜XÚÙ[™]][™›İšY\œÈ\™HÚ\™Y‰Ë™[]Yˆ	ÔX›XÈİX›Z\ÜÚ[Ûˆ›Ü›H[™X›XÈ[Ù[È\™HÙ^HŒKŒHİ\™˜XÙH\™X\ËˆÙYH™[X\ÙH\[[™H™[İÈ›Üˆ]Z[Ë‰Ë™^ˆ	ÓX\šÈ][\È™XYH\È[YÜ˜][ÛœÈÛÛ\]Kˆ™\\™H›ÜˆXÛÜŞ\İ[H[š]X[^˜][Û‹‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™Ü›İ\LÈ›Ü™\ˆ›Ü™\‹VÈÌŒÍMQWKÌŒİ™\˜›Ü™\‹VÈÌŒÍMQWKÍŒİ™\‹]˜[œÛ]K^K\İ™\œÚYİËVÌÌÌÌ\ÈÌŒ˜ÍMYLMWHİ™\œš[™ËLHİ™\œš[™ËZ[œÙ]İ™\œš[™ËVÈÌŒÍMQWKÌŒ˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆ™[]]™Hİ™\™›İËZY[ˆƒBˆ]ˆÛ\ÜÓ˜[YOH˜XœÛÛ]H[œÙ]L™ËYÜ˜YY[]Ë\ˆœ›ÛK]˜[œÜ\™[šXKVÈÌŒ˜ÍMYLHË]˜[œÜ\™[]˜[œÛ]K^Y[Ü›İ\Zİ™\˜[œÛ]K^Y[˜[œÚ][Û‹]˜[œÙ›Ü›H\˜][Û‹VÌN\×HÚ[\‹Y]™[Ë[›Û™HˆÏƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH”›ÙXİ[Ûˆ™XY[™\ÜÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^^ÈÜXÙK^KLHX‹LHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_OƒBˆÖÃBˆÈX™[ˆ˜XÚÙ[™ÛÛ›™XİY‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ]]›İšY\ˆÛÛ›™XİY‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ‘]X˜\ÙHÛÛ™šYİ\™Y‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ‘š[HİÜ˜YÙHÛÛ™šYİ\™Y‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ‘[XZ[[YÜ˜][ÛˆÛÛ›™XİY‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ”^[Y[›İšY\ˆÛÛ›™XİY‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ‘\œ›Üˆ[Ûš]Üš[™ÈÛÛ›™XİY‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ‘ÛXZ[ˆÛÛ™šYİ\™Y‹İ]\Îˆ‘[[ÈˆKBˆÈX™[ˆ”X›XÈİX›Z\ÜÚ[Ûˆ›Ü›H™XY[™\ÜÈ‹İ]\Îˆ‘˜YˆKBˆÈX™[ˆ”X›XÈ[Ù[È™XY[™\ÜÈ‹İ]\Îˆ”[›™YˆKBˆÈX™[ˆ“YØ[YÙ\ÈYY‹İ]\Îˆ‘˜YˆKBˆÈX™[ˆ˜XÚİ\Ù^Ü\İY‹İ]\Îˆ–Y\ÈˆKBˆÈX™[ˆ”™[X\ÙH™\ÚXÚÛ\İ‹İ]\Îˆ’[ˆ›ÙÜ™\ÜÈˆKBˆK›X\

][KJHOˆ
Bˆ]ˆÙ^O^Ú_HÛ\ÜÓ˜[YOH™›^\İYKX™]ÙY[ˆÜ[Ú][K›X™[OÜÜ[Ü[ˆÛ\ÜÓ˜[YO^ØLHKLH›İ[™Y^VÎ\H	Ú][Kœİ]\ÈOOH	ÖY\ÉÈ][Kœİ]\ÈOOH	Ô™XYIÈÈ	Ø™ËVÈÌŒÍMQWKÌL^VÈÌŒÍMQWIÈˆ][Kœİ]\ÈOOH	Ñ˜Y	È][Kœİ]\ÈOOH	Ò[ˆ›ÙÜ™\ÜÉÈÈ	Ø™ËX[X™\‹MLÌL^X[X™\‹M	Èˆ	Ø™ËVÈÌØ™—KÌL^VÈÌØ™—IßXOÚ][Kœİ]\ßOÜÜ[Ù]ƒBˆ
J_CBˆÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÎLL×H”™\\™\È›ÜˆXÛÜŞ\İ[H[š]X[^˜][Û‹X›XÈ›Ü›H]™KX›XÈ[Ù[ËÙ]ƒBˆÙ]ƒBƒBˆËÊˆ˜XÚÙ[™™XY[™\ÜÈ
Ù\
ÈÛ\ÚY
H
‹ßCBˆ]ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ	Ğ˜XÚÙ[™™XY[™\ÜÉËİ[[X\Nˆ	Ğİ\œ™[\œÚ\İ[˜ÙH\È[HØØ[[[Ëˆ[]Y\È\İY\™HÚ]H™X[TH]\İİ\Ü›Üˆ[™X]\™H\š]K‰Ë™^ˆ	ĞY\Ù\œËİX[\ËØ]]™Y›Ü™HX›XÈİX›Z\ÜÚ[ÛœÈÜˆX[H™X]\™\Ë‰ÈJ_HÛ\ÜÓ˜[YOH˜Ø\™Ü›İ\LÈ›Ü™\ˆ›Ü™\‹VÈÌŒÍMQWKÌŒİ™\˜›Ü™\‹VÈÌŒÍMQWKÍŒİ™\‹]˜[œÛ]K^K\İ™\œÚYİËVÌÌÌÌ\ÈÌŒ˜ÍMYLMWHİ™\œš[™ËLHİ™\œš[™ËZ[œÙ]İ™\œš[™ËVÈÌŒÍMQWKÌŒ˜[œÚ][Û‹X[İ\œÛÜ‹\Ú[\ˆ™[]]™Hİ™\™›İËZY[ˆƒBˆ]ˆÛ\ÜÓ˜[YOH˜XœÛÛ]H[œÙ]L™ËYÜ˜YY[]Ë\ˆœ›ÛK]˜[œÜ\™[šXKVÈÌŒ˜ÍMYLHË]˜[œÜ\™[]˜[œÛ]K^Y[Ü›İ\Zİ™\˜[œÛ]K^Y[˜[œÚ][Û‹]˜[œÙ›Ü›H\˜][Û‹VÌN\×HÚ[\‹Y]™[Ë[›Û™HˆÏƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH˜XÚÙ[™™XY[™\ÜÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^^È^VÈÎLL×HX‹LHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_Oİ\œ™[[ÙNˆÜ[ˆÛ\ÜÓ˜[YOH^]Ú]H“ØØ[İÜ˜YÙH[[ÏÜÜ[Ù]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÌLHX‹LHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_O”[›™Y[]Y\ÎÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÌLH™ËVÈÌLÌL—HLH›İ[™Y›Û[[Û›ÈX‹LKH›Ü™\ˆ›Ü™\‹VÈÌLLÎHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_O\Ù\œÈ8 (ˆX[\È8 (ˆX[È8 (ˆ^Y\œÈ8 (ˆX]Ú\È8 (ˆ›\İÛÙÜÈ8 (ˆ›Ûİ×İ\È8 (ˆØİ[Y[È8 (ˆXİ]š]Y\È8 (ˆÙ™™\œÈ8 (ˆÙ][™ÜÏÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH™›^›^]Ü˜\Ø\LHˆÛÛXÚÏ^ÙHOˆKœİÜ›ÜYØ][ÛŠ
_OƒBˆ]ÛˆÛÛXÚÏ^Ê
HOˆÈÛÛœİœÛÛˆH\ÙP\İÜ™K™Ù]İ]J
K™^Ü[]J
NÈ˜]šYØ]Ü‹˜Û\›Ø\™Üš]U^
œÛÛŠNÈØ\İœİXØÙ\ÜÊ	Ñ[]HÛÜYY\È”ÓÓ‰ÊH_HÛ\ÜÓ˜[YOH˜ˆ‹YÚÜİ^^È‘^Ü[]H
”ÓÓŠOØ]ÛƒBˆ]ÛˆÛÛXÚÏ^Ê
HOˆÈÛÛœİ[œ]H›Û\
	Ô\İH”ÓÓˆ˜XÚİ\‰ÊNÈYˆ
[œ]
HÈ\ÙP\İÜ™K™Ù]İ]J
Kš[\Ü[]J[œ]
NÈØ\İœİXØÙ\ÜÊ	Ñ]H[\ÜY	ÊHH_HÛ\ÜÓ˜[YOH˜ˆ‹YÚÜİ^^È’[\Üœ›ÛH”ÓÓØ]ÛƒBˆ]ÛˆÛÛXÚÏ^Ê
HOˆÈÛÛœİœÛÛˆH\ÙP\İÜ™K™Ù]İ]J
K™^Ü[]J
NÈÛÛœİ›ØˆH™]È›ØŠÚœÛÛ—Kİ\N‰Ø\XØ][Û‹ÚœÛÛ‰ßJNÈÛÛœİ\›HT“˜Ü™X]SØš™XİT“
›ØŠNÈÛÛœİHHØİ[Y[˜Ü™X]Q[[Y[
	ØIÊNÈKš™Y]\›ÈK™İÛ›ØYIÙX[›\İ›ËX˜XÚİ\šœÛÛ‰ÎÈK˜ÛXÚÊ
H_HÛ\ÜÓ˜[YOH˜ˆ‹YÚÜİ^^È‘İÛ›ØY˜XÚİ\š[OØ]ÛƒBˆÙ]ƒBˆÙ]ƒBƒBˆËÊˆ™[X\ÙH\[[™H
Ù\ÛÛ\Xİ
H
‹ßCBˆ]ˆÛ\ÜÓ˜[YOH˜Ø\™LÈ›Ü™\ˆ›Ü™\‹VÈÌŒÍMQWKÌŒİ™\˜›Ü™\‹VÈÌŒÍMQWKÍ˜[œÚ][Û‹X[ƒBˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^\ÛHX‹LH›^][\ËXÙ[\ˆØ\Lˆ”™[X\ÙH\[[™HÜ[ˆÛ\ÜÓ˜[YOH^VÎ\HLKHKLH›İ[™Y™ËVÈÌŒÍMQWKÌL^VÈÌŒÍMQWHŒKŒHÈÜİS][˜ÚÜÜ[Ù]ƒBˆ]ˆÛ\ÜÓ˜[YOHœÜXÙK^KLH^^ÈƒBˆÖÃBˆÈX™[ˆ‘XÛÜŞ\İ[H[š]X[^˜][Ûˆ‹İ]\Îˆ”[›™Y‹›İNˆ“İÛ™\ˆ
ÈX[HÙ]\[š]X[ÛÛ™šYÈ‹™^ˆ”[ˆ[Ù]\Ú^˜\™ˆKBˆÈX™[ˆ”X›XÈİX›Z\ÜÚ[Ûˆ›Ü›H‹İ]\Îˆ”[›™Y‹›İNˆ“Ü[ˆ[ZÙH›ÜˆÙ[\œÈ‹™^ˆ•Ú\™HX›XÈ›Ü›H
È˜[Y][ÛˆˆKBˆÈX™[ˆ”X›XÈ[Ù[È‹İ]\Îˆ”[›™Y‹›İNˆ^Y\‹ÙX[X›XÈX]Ú[™ÈšY]ÜÈ‹™^ˆ”™\X›XË\ØY™H[Ù[È	ˆTHˆKBˆÈX™[ˆ•H[ÙHÈ›ÛH\›Z\ÜÚ[ÛœÈ‹İ]\Îˆ”[›™Y‹›İNˆ“[Z]YXØÙ\ÜÈ›Üˆ\ÜÚ\İ[È8 %[›™Y›ÜˆŒKŒHÜˆÜİ[][˜Ú‹™^ˆ”›ÛHYš[š][ÛœÈ
È[Z]YRHˆKBˆÈX™[ˆ”PHÈZ[ÚXÚÈ‹İ]\Îˆ”™XYH‹›İNˆÛX[ˆZ[›ÈÛÛœÛÛH\œ›ÜœÈ‹™^ˆ”[ˆ[\İ
È[ˆKBˆÈX™[ˆ‘[[È]H™[[İ™Y‹İ]\Îˆ”[›™Y‹›İNˆÛX[ˆÛ]H›Üˆ›ÙXİ[Ûˆ‹™^ˆYÛ™KXÛXÚÈÚ\H›Üˆ›ÙˆKBˆÈX™[ˆ˜XÚİ\^ÜY‹İ]\Îˆ”™XYH‹›İNˆ“İÛ™\ˆ\È[^Ü‹™^ˆ]]ÛX]YØÚY[Y˜XÚİ\ÈˆKBˆÈX™[ˆ”™[X\ÙH™XYH‹İ]\Îˆ”[›™Y‹›İNˆ[ÚXÚÛ\İÈÜ™Y[ˆ‹™^ˆ‘š[˜[İÛ™\ˆÚYÛ‹[Ù™ˆˆKBˆK›X\

][KJHOˆ
Bˆ]ˆÙ^O^Ú_HÛÛXÚÏ^Ê
HOˆÙ]Ù[XİY]Z[
È]Nˆ][K›X™[˜[YNˆ][Kœİ]\Ëİ[[X\Nˆ][K››İK™^ˆ][K›™^J_HÛ\ÜÓ˜[YOH™›^\İYKX™]ÙY[ˆ][\ËXÙ[\ˆLH›İ[™Y›Ü™\ˆ›Ü™\‹VÈÌLLÎHİ™\˜™ËVÈÌLLMLQ—Hİ\œÛÜ‹\Ú[\ˆƒBˆ]ƒBˆ]Ú][K›X™[OÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÍÍ—HÚ][K››İ_OÙ]ƒBˆÙ]ƒBˆ]ƒBˆÜ[ˆÛ\ÜÓ˜[YO^ØLHKLH›İ[™Y^VÎ\H	Ú][Kœİ]\ÈOOH	Ô™XYIÈÈ	Ø™ËVÈÌŒÍMQWKÌL^VÈÌŒÍMQWIÈˆ	Ø™ËVÈÌØ™—KÌL^VÈÌØ™—IßXOÚ][Kœİ]\ßOÜÜ[ƒBˆÙ]ƒBˆÙ]ƒBˆ
J_CBˆÙ]ƒBˆ]ˆÛ\ÜÓ˜[YOH^VÎ\H^VÈÎLL×H]LHÛXÚÈ][\È›Üˆ]Z[È
È™^Xİ[Û‹ˆ™\\™\È›ÜˆXÛÜŞ\İ[H[š]X[^˜][Û‹X›XÈİX›Z\ÜÚ[Ûˆ›Ü›H]™KX›XÈ[Ù[È™\[™™[X\ÙKÙ]ƒBˆÙ]ƒBˆÙ]ƒBˆ
_CBƒBˆÜ™[™\‘[]PXØÛİ[[Ù[

_CBˆÙ]ƒBˆ
CBŸCBƒBƒBƒBƒBƒBƒBƒBƒBƒB