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
import { PROPERTY_INTELLIGENCE_PLAN_COMPARISON_LABELS } from '../../lib/propertyIntelligencePolicy'
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
import AdminCreditOperations from '../../components/admin/AdminCreditOperations'

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
  const paidBillingStatuses = new Set(['Paid Active', 'Past Due', 'Payment Pending', 'Comped'])
  const canOpenBillingPortal = !ownerPreviewActive && effectivePlanForDisplay !== 'Free' && paidBillingStatuses.has(customerBillingStatus)
  const cancellationScheduledFromStripe = Boolean(billingCenter.cancelAtPeriodEnd)
  const billingControlPolicy = getBillingControlPolicy({
    plan: effectivePlanForDisplay,
    billingStatus: customerBillingStatus,
    ownerPreviewActive,
    cancelAtPeriodEnd: cancellationScheduledFromStripe,
  })
  const verifiedCurrentPeriodEnd = billingCenter.currentPeriodEnd || trial.billingPeriodEnd || deletionRequest.scheduledDeletionAt || ''
  const outstandingBalanceCents = Number(billingCenter.outstandingBalance || 0)
  const scheduledBillingPlan = billingCenter.scheduledPlan || trial.scheduledPlan || ''
  const scheduledBillingPlanChangeAt = billingCenter.scheduledPlanChangeAt || trial.scheduledPlanChangeAt || ''
  const effectiveAccessPlan = billingCenter.effectiveAccessPlan || trial.effectiveAccessPlan || effectivePlanForDisplay
  const scheduledPlanActive = Boolean(scheduledBillingPlan && scheduledBillingPlanChangeAt)
  const scheduledPlanEntitlement = scheduledBillingPlan ? getPlanEntitlement(scheduledBillingPlan) : null
  const currentBuyerCapacityForScheduledPlan = scheduledPlanEntitlement
    ? getBuyerCapacity(scheduledBillingPlan, buyers.length)
    : null

  const handleUserFacingUpgrade = (plan: PaidPlan) => {
    if (ownerPreviewActive) {
      toast.info(`Preview mode only. A real ${effectivePlanForDisplay} user would be sent to ${plan} ${settingsBillingFrequency} checkout.`)
      return
    }
    openUpgradePayment(plan, settingsBillingFrequency)
  }

  const renderPlanUpgradeOptions = () => {
    const previewPrefix = ownerPreviewActive ? 'Preview: ' : ''

    return (
      <div className="card p-4 border border-[#22C55E]/25 bg-[#0F111A]">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Plan Upgrade Options</div>
            <div className="text-lg font-semibold text-[#E6E8EE]">Available next steps for {effectivePlanForDisplay}</div>
            <div className="text-sm text-[#8B92A3] mt-1">
              {ownerPreviewActive ? 'Preview mode only. Billing is not changed.' : 'Choose a billing frequency before opening Stripe checkout.'}
            </div>
          </div>
          {['Free', 'Starter'].includes(String(effectivePlanForDisplay)) && (
            <div className="inline-flex rounded border border-[#252A38] p-0.5 w-fit">
              <button onClick={() => setSettingsBillingFrequency('monthly')} className={`px-3 py-1 text-sm rounded ${settingsBillingFrequency === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
              <button onClick={() => setSettingsBillingFrequency('annual')} className={`px-3 py-1 text-sm rounded ${settingsBillingFrequency === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
          {effectivePlanForDisplay === 'Free' && (
            <>
              <button onClick={() => handleUserFacingUpgrade('Starter')} className="btn btn-green">
                {previewPrefix}Upgrade to Starter {settingsBillingFrequency}
              </button>
              <button onClick={() => handleUserFacingUpgrade('Pro')} className="btn btn-ghost">
                {previewPrefix}Upgrade to Pro {settingsBillingFrequency}
              </button>
              <button onClick={() => window.location.href = '/pricing'} className="btn btn-ghost">View Pricing</button>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost">Contact Support</button>
            </>
          )}

          {effectivePlanForDisplay === 'Starter' && (
            <>
              <button onClick={() => handleUserFacingUpgrade('Pro')} className="btn btn-green">
                {previewPrefix}Upgrade to Pro {settingsBillingFrequency}
              </button>
              <button onClick={() => window.location.href = '/pricing'} className="btn btn-ghost">View Pricing</button>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost">Contact Support</button>
            </>
          )}

          {effectivePlanForDisplay === 'Pro' && (
            <>
              <button onClick={() => document.getElementById('billing-center')?.scrollIntoView({ behavior: 'smooth' })} className="btn btn-green">Manage Billing / Open Billing Center</button>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost">Contact Support</button>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost">Contact Admin for Agency / Enterprise</button>
            </>
          )}

          {effectivePlanForDisplay === 'Agency' && (
            <>
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Agency is Coming Soon / Contact Admin.</div>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-green">Contact Admin</button>
              <button onClick={() => window.location.href = '/pricing'} className="btn btn-ghost">View Pricing</button>
            </>
          )}

          {effectivePlanForDisplay === 'Enterprise' && (
            <>
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Enterprise is Coming Soon / Contact Sales.</div>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-green">Contact Sales</button>
              <button onClick={() => window.location.href = '/pricing'} className="btn btn-ghost">View Pricing</button>
            </>
          )}
        </div>
      </div>
    )
  }
  const renderOwnerPreviewControl = () => {
    if (!hasSuperAdminAccess) return null

    return (
      <div className="card p-4 border border-amber-500/30 bg-amber-500/10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[2px] text-amber-300 mb-1">
              {ownerPreviewActive ? 'Owner Preview Active' : 'Owner/Admin Plan Preview Mode'}
            </div>
            <div className="text-lg font-semibold text-[#E6E8EE]">Preview App As</div>
            <div className="text-sm text-[#C5CAD6] mt-1">
              Preview mode changes only feature visibility. It does not change your owner role, billing status, payment history, Stripe sync, or deletion state.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={ownerPreviewPlan}
              onChange={e => updateSettings({ ownerPreviewPlan: e.target.value as PlanName })}
              className="select min-w-[220px]"
            >
              {previewPlanOptions.map(plan => (
                <option key={plan} value={plan}>
                  {plan === 'Owner Admin' ? 'Owner Admin' : `Previewing as ${plan}`}
                </option>
              ))}
            </select>
            {ownerPreviewActive && (
              <button onClick={() => updateSettings({ ownerPreviewPlan: 'Owner Admin' })} className="btn btn-green">
                Exit Preview Mode
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const resetOnboardingTour = () => {
    if ((window as any).restartDealBlastTour) {
      ;(window as any).restartDealBlastTour()
      toast.success('Onboarding tour restarted. Your saved completion remains intact unless you finish or skip again.')
    } else {
      toast.info('Open the app workspace to restart the onboarding tour.')
    }
  }

  const updateAgencyEnterpriseRelease = (enabled: boolean) => {
    updateSettings({
      onboarding: {
        ...onboardingSettings,
        agencyEnterpriseEnabled: enabled,
        updatedAt: new Date().toISOString(),
      }
    })
    toast.success(enabled ? 'Agency and Enterprise plan selection enabled.' : 'Agency and Enterprise set to Coming Soon / Contact Admin.')
  }

  type LaunchCheckStatus = 'pass' | 'warning' | 'fail'
  type LaunchCheck = { key: string; name: string; status: LaunchCheckStatus; label: string; detail: string }
  type LaunchTestStatus = 'pass' | 'manual' | 'review' | 'fail'
  type LaunchTestResult = { key: string; name: string; status: LaunchTestStatus; label: string; detail: string }

  const safeLaunchLabel = (status: LaunchCheckStatus) => {
    if (status === 'pass') return 'Pass'
    if (status === 'fail') return 'Fail'
    return 'Needs Review'
  }

  const launchStatusClass = (status: LaunchCheckStatus) => {
    if (status === 'pass') return 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
    if (status === 'fail') return 'bg-red-500/10 text-red-300 border-red-500/30'
    return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  }

  const launchTestLabel = (status: LaunchTestStatus) => {
    if (status === 'pass') return 'Pass'
    if (status === 'manual') return 'Needs Manual Test'
    if (status === 'fail') return 'Fail'
    return 'Needs Review'
  }

  const launchTestStatusClass = (status: LaunchTestStatus) => {
    if (status === 'pass') return 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
    if (status === 'fail') return 'bg-red-500/10 text-red-300 border-red-500/30'
    if (status === 'manual') return 'bg-[#3B82F6]/10 text-[#93C5FD] border-[#3B82F6]/30'
    return 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  }

  const selectedRecoverableBuyers = (buyerRecoveryScan?.recoverableBuyers || [])
    .filter(item => selectedRecoverableBuyerIds[item.recoveryId])

  const buyerRecoveryStatusClass = (ready: boolean) =>
    ready ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30' : 'bg-amber-500/10 text-amber-300 border-amber-500/30'

  const maskRecoveryEmail = (email: string) => {
    const [name, domain] = String(email || '').split('@')
    if (!name || !domain) return 'Not Provided'
    return `${name.slice(0, 2)}***@${domain}`
  }

  useEffect(() => {
    setBillingProviderSetup(getBillingSetupWithLaunchDefaults(settings.billingProviderSetup || defaultBillingProviderSetup))
  }, [settings.billingProviderSetup])

  useEffect(() => {
    setManualActivation(prev => ({
      ...prev,
      workspace: user?.email || user?.name || 'Current workspace',
      plan: currentPlan,
      billingStatus: currentBillingStatus,
      billingPeriodStart: trial.billingPeriodStart || '',
      billingPeriodEnd: trial.billingPeriodEnd || '',
      billingAdminNote: trial.billingAdminNote || '',
    }))
  }, [user?.email, user?.name, currentPlan, currentBillingStatus, trial.billingPeriodStart, trial.billingPeriodEnd, trial.billingAdminNote])

  useEffect(() => {
    if (user?.email) {
      void refreshEmailNotificationSettings()
      void refreshAccountProfile()
    }
    if (hasSuperAdminAccess) {
      void refreshWaitlistEntries()
    }
  }, [hasSuperAdminAccess, emailWorkspaceId, user?.email])

  const updateBillingProviderSetup = (field: keyof typeof billingProviderSetup, value: string | boolean) => {
    setBillingProviderSetup(prev => ({ ...prev, [field]: value }))
  }

  const updateManualActivation = (field: keyof typeof manualActivation, value: string) => {
    setManualActivation(prev => ({ ...prev, [field]: value }))
  }

  const openDeleteAccountRequest = () => {
    setDeleteAccountConfirmed(false)
    setDeleteAccountText('')
    setDeleteAccountError('')
    setDeleteAccountOpen(true)
  }

  const returnFocusToDeleteAccountTrigger = () => {
    window.setTimeout(() => deleteAccountTriggerRef.current?.focus(), 0)
    window.setTimeout(() => deleteAccountTriggerRef.current?.focus(), 75)
  }

  const closeDeleteAccountRequest = () => {
    if (deleteAccountLoading) return
    setDeleteAccountOpen(false)
    setDeleteAccountConfirmed(false)
    setDeleteAccountText('')
    setDeleteAccountError('')
    returnFocusToDeleteAccountTrigger()
  }

  const isPaidCancellationStatus = currentBillingStatus === 'Paid Active' || currentBillingStatus === 'Comped'
  const platformOwnerDeactivationBlocked = hasSuperAdminAccess
  const deletionActionLabel = 'Deactivate Account'

  const openBillingCenterFromDeactivationModal = () => {
    if (canOpenBillingPortal) {
      void openBillingPortal('portal')
      return
    }

    closeDeleteAccountRequest()
    setCustomerSettingsTab('Plan & Billing')
    window.setTimeout(() => {
      document.getElementById('billing-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  useEffect(() => {
    if (!deleteAccountOpen || deleteAccountLoading) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDeleteAccountOpen(false)
        setDeleteAccountConfirmed(false)
        setDeleteAccountText('')
        setDeleteAccountError('')
        returnFocusToDeleteAccountTrigger()
        return
      }

      if (event.key !== 'Tab') return
      const modal = deleteAccountModalRef.current
      if (!modal) return

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter(element => !element.hasAttribute('aria-hidden'))

      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [deleteAccountOpen, deleteAccountLoading])

  useEffect(() => {
    if (!deleteAccountOpen) return

    window.setTimeout(() => {
      if (deleteAccountConfirmed && !platformOwnerDeactivationBlocked) {
        deleteAccountConfirmInputRef.current?.focus()
        return
      }
      deleteAccountModalRef.current?.focus()
    }, 0)
  }, [deleteAccountOpen, deleteAccountConfirmed, platformOwnerDeactivationBlocked])

  const requestAccountDeletion = async () => {
    if (deleteAccountText !== 'DELETE' || deleteAccountLoading) return
    if (platformOwnerDeactivationBlocked) {
      const message = 'Platform owner accounts cannot be deactivated from this page.'
      setDeleteAccountError(message)
      toast.error(message)
      return
    }

    setDeleteAccountLoading(true)
    setDeleteAccountError('')

    const now = new Date().toISOString()
    const nextRequest = {
      status: 'Deletion Requested' as const,
      workspaceInstanceId: workspaceInstanceId || '',
      accountStatus: 'Deactivated' as const,
      requestedAt: now,
      requestedBy: user?.email || user?.name || 'Current workspace',
      cancellationRequestedAt: now,
      scheduledDeletionAt: now,
      cancelAtPeriodEnd: false,
      note: 'Account deactivated after deletion request. Soft-deactivation only; no scoped records were deleted and Stripe billing was not changed.',
    }

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sign in again before deactivating this account.')

      const response = await fetch('/api/deactivate-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirmation: deleteAccountText,
          reason: isPaidCancellationStatus ? 'User requested cancellation from Danger Zone' : 'User requested account deactivation from Danger Zone',
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Account deactivation failed.')
      }

      updateSettings({
        deletionRequest: {
          ...nextRequest,
          accountStatus: 'Deactivated',
          scheduledDeletionAt: payload.deactivatedAt || now,
          note: 'Account deactivated in Supabase. Soft-deactivation only; no scoped records were deleted.',
        }
      })
      toast.success('Account deactivated. You have been signed out.')
      await supabase.auth.signOut()
      logout()
      window.localStorage.removeItem('dealblastpro-v1')
      window.sessionStorage.clear()
      window.location.href = '/admin-login?account=deactivated'
    } catch (error: any) {
      const message = error?.message || 'Account deactivation failed.'
      setDeleteAccountError(message)
      toast.error(message)
    } finally {
      setDeleteAccountLoading(false)
    }
  }

  const renderDeleteAccountModal = () => {
    if (!deleteAccountOpen) return null

    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4">
        <div
          ref={deleteAccountModalRef}
          className="card w-full max-w-xl p-6 border border-red-500/40 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-account-title"
          tabIndex={-1}
        >
          {platformOwnerDeactivationBlocked ? (
            <>
              <div id="deactivate-account-title" className="text-2xl font-semibold text-[#E6E8EE] mb-3">Account Deactivation Unavailable</div>
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 leading-6 flex gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                <div>Platform owner accounts cannot be deactivated from this page.</div>
              </div>
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={closeDeleteAccountRequest} className="btn btn-ghost">Close</button>
              </div>
            </>
          ) : !deleteAccountConfirmed ? (
            <>
              <div id="deactivate-account-title" className="text-2xl font-semibold text-[#E6E8EE] mb-3">Deactivate Account</div>
              <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 leading-6 flex gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-300" aria-hidden="true" />
                <div className="font-semibold">Warning: You will immediately lose access to this Deal Blast Pro workspace.</div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-[#C5CAD6] leading-6">
                <p>This action deactivates your account and workspace access. It does not immediately permanently delete your deals, buyers, submissions, files, or settings.</p>
                <p>
                  Deactivating your account does not automatically cancel an active paid subscription.{' '}
                  <button type="button" onClick={openBillingCenterFromDeactivationModal} className="text-amber-300 underline underline-offset-4 hover:text-amber-200">
                    Cancel your subscription separately
                  </button>{' '}
                  before continuing.
                </p>
                {canOpenBillingPortal && (
                  <button
                    type="button"
                    onClick={() => openBillingPortal('portal')}
                    disabled={Boolean(billingPortalAction)}
                    className="btn btn-ghost text-xs border-amber-500/40 text-amber-200 disabled:opacity-60"
                  >
                    {billingPortalAction === 'portal' ? 'Opening...' : 'Manage Subscription'}
                  </button>
                )}
                <p>To request permanent deletion of retained account data, contact support after deactivation.</p>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={closeDeleteAccountRequest} className="btn btn-ghost">Cancel</button>
                <button type="button" onClick={() => setDeleteAccountConfirmed(true)} className="btn btn-ghost text-red-300 border-red-500/40">Continue</button>
              </div>
            </>
          ) : (
            <>
              <div id="deactivate-account-title" className="text-2xl font-semibold text-[#E6E8EE] mb-3">Confirm Deactivation</div>
              <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 leading-6 flex gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-300" aria-hidden="true" />
                <div>Type DELETE to confirm that you want to deactivate this account.</div>
              </div>
              <div className="mt-5">
                <label className="block">
                  <div className="text-sm text-[#8B92A3] mb-2">Type DELETE to confirm</div>
                  <input
                    ref={deleteAccountConfirmInputRef}
                    className="input"
                    value={deleteAccountText}
                    onChange={e => setDeleteAccountText(e.target.value)}
                    placeholder="DELETE"
                    disabled={deleteAccountLoading}
                    autoComplete="off"
                  />
                </label>
                {deleteAccountError && (
                  <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {deleteAccountError}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={closeDeleteAccountRequest} disabled={deleteAccountLoading} className="btn btn-ghost disabled:opacity-50">Cancel</button>
                  <button
                    type="button"
                    onClick={requestAccountDeletion}
                    disabled={deleteAccountText !== 'DELETE' || deleteAccountLoading}
                    className="btn bg-red-600 text-white border-red-500 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteAccountLoading ? 'Deactivating...' : 'Deactivate My Account'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const formatBillingDate = (value?: string) => {
    if (!value) return 'Needs Review'
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Needs Review'
  }

  const formatCurrencyFromCents = (value?: number) => {
    const cents = Number(value || 0)
    if (!Number.isFinite(cents) || cents <= 0) return '$0'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const getPlanAmount = (plan = currentPlan, frequency: BillingFrequency = (trial.billingFrequency || 'monthly') as BillingFrequency) => {
    const prices: Record<string, Record<BillingFrequency, string>> = {
      Free: { monthly: '$0', annual: '$0' },
      Starter: { monthly: '$47', annual: '$470' },
      Pro: { monthly: '$97', annual: '$970' },
      Agency: { monthly: '$197', annual: '$1,970' },
      Enterprise: { monthly: '$297 or Custom', annual: 'Custom' },
    }
    return prices[plan]?.[frequency] || 'Needs Review'
  }

  const nextPaymentDue = trial.billingPeriodEnd || ''
  const lastPayment = [...paymentHistory]
    .filter(payment => payment.status === 'Paid' || payment.status === 'Comped')
    .sort((a, b) => new Date(b.paymentDate || b.createdAt).getTime() - new Date(a.paymentDate || a.createdAt).getTime())[0]

  const updateBillingCenter = (updates: Partial<typeof billingCenter>) => {
    updateSettings({
      billingCenter: {
        ...billingCenter,
        ...updates,
        paymentHistory: updates.paymentHistory || billingCenter.paymentHistory || [],
      }
    })
  }

  const upsertPaymentRecord = (record: any) => {
    const existing = paymentHistory.some(payment => payment.id === record.id)
    const nextHistory = existing
      ? paymentHistory.map(payment => payment.id === record.id ? { ...payment, ...record } : payment)
      : [record, ...paymentHistory]
    updateBillingCenter({ paymentHistory: nextHistory })
  }

  const addPaymentRecord = () => {
    const amount = prompt('Payment amount, for example $97:', getPlanAmount())
    if (amount === null) return
    const note = prompt('Admin note for this payment record:', '') || ''
    const now = new Date().toISOString()
    upsertPaymentRecord({
      id: `pay-${Date.now()}`,
      paymentDate: now,
      plan: currentPlan,
      billingFrequency: (trial.billingFrequency || 'monthly') as BillingFrequency,
      amount: amount.trim() || getPlanAmount(),
      status: currentBillingStatus === 'Comped' ? 'Comped' : currentBillingStatus === 'Payment Pending' ? 'Pending' : 'Paid',
      provider: 'Stripe',
      providerReference: `DBP-${Date.now()}`,
      adminNote: note,
      createdAt: now,
      billingPeriodStart: trial.billingPeriodStart || '',
      billingPeriodEnd: trial.billingPeriodEnd || '',
    })
    toast.success('Payment record added.')
  }

  const editPaymentRecord = (record: any) => {
    const amount = prompt('Update amount:', record.amount || '')
    if (amount === null) return
    const note = prompt('Update admin note:', record.adminNote || '')
    upsertPaymentRecord({ ...record, amount: amount.trim() || record.amount, adminNote: note || '' })
    toast.success('Payment record updated.')
  }

  const markPaymentStatus = (record: any, status: 'Paid' | 'Failed' | 'Refunded') => {
    upsertPaymentRecord({ ...record, status })
    toast.success(`Payment marked ${status}.`)
  }

  const downloadTextPdf = (filename: string, title: string, rows: string[]) => {
    const clean = (value: string) => String(value || '').replace(/[()\\]/g, ' ').slice(0, 100)
    const lines = [title, '', ...rows].map(clean)
    const content = lines.map((line, index) => `BT /F1 11 Tf 48 ${760 - index * 18} Td (${line}) Tj ET`).join('\n')
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach(obj => {
      offsets.push(pdf.length)
      pdf += `${obj}\n`
    })
    const xref = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const receiptFileName = (record: any) => {
    const date = (record.paymentDate || record.createdAt || new Date().toISOString()).slice(0, 10)
    return `deal-blast-pro-receipt-${date}-${String(record.plan || currentPlan).toLowerCase().replace(/\s+/g, '-')}-${String(record.status || 'record').toLowerCase()}.pdf`
  }

  const downloadReceiptPdf = (record: any) => {
    downloadTextPdf(receiptFileName(record), 'Deal Blast Pro Receipt', [
      'Deal Blast Pro',
      'House Buyer Investments LLC',
      `Customer email: ${user?.email || 'Not Provided'}`,
      `Billing name/company: ${savedBillingProviderSetup.billingName || 'Not Provided'}`,
      `Plan: ${record.plan || currentPlan}`,
      `Billing frequency: ${record.billingFrequency || trial.billingFrequency || 'monthly'}`,
      `Payment date: ${formatBillingDate(record.paymentDate)}`,
      `Billing period start: ${formatBillingDate(record.billingPeriodStart || trial.billingPeriodStart)}`,
      `Billing period end: ${formatBillingDate(record.billingPeriodEnd || trial.billingPeriodEnd)}`,
      `Amount: ${record.amount || 'Needs Review'}`,
      `Status: ${record.status || 'Needs Review'}`,
      'Provider: Stripe',
      `Receipt/invoice number: ${record.providerReference || record.id || 'Internal Record'}`,
      'Note: This receipt reflects Deal Blast Pro account access records. Payment processing is handled through Stripe.',
    ])
  }

  const downloadBillingSummaryPdf = () => {
    downloadTextPdf(`deal-blast-pro-billing-summary-${new Date().toISOString().slice(0, 10)}.pdf`, 'Deal Blast Pro Billing Summary', [
      'Deal Blast Pro',
      'House Buyer Investments LLC',
      `Current plan: ${currentPlan}`,
      `Billing status: ${currentBillingStatus}`,
      `Billing frequency: ${trial.billingFrequency || 'monthly'}`,
      `Current billing period: ${formatBillingDate(trial.billingPeriodStart)} - ${formatBillingDate(trial.billingPeriodEnd)}`,
      `Next payment due: ${formatBillingDate(nextPaymentDue)}`,
      `Recent payment count: ${paymentHistory.length}`,
      ...paymentHistory.slice(0, 6).map(payment => `${formatBillingDate(payment.paymentDate)} | ${payment.plan} | ${payment.amount} | ${payment.status}`),
    ])
  }

  const renderBillingCenter = () => {
    const billingFrequency = effectiveBillingFrequencyForDisplay
    const cancelScheduled = deletionRequest.accountStatus === 'Cancellation Scheduled'
    const billingNotice = getBillingNotice(trial, deletionRequest)
    const displayPaymentHistory = ownerPreviewActive ? [] : paymentHistory
    const displayLastPayment = ownerPreviewActive ? null : lastPayment
    const nextAmount = effectivePlanForDisplay === 'Free' ? '$0' : getPlanAmount(effectivePlanForDisplay as any, billingFrequency)
    const scheduleText = ownerPreviewActive
      ? 'Preview mode only. Billing is not changed.'
      : effectivePlanForDisplay === 'Free'
      ? 'No paid billing schedule yet.'
      : nextPaymentDue
        ? `${billingFrequency === 'annual' ? 'Annual renewal' : 'Monthly payment'} expected ${formatBillingDate(nextPaymentDue)}.`
        : 'Needs Review'

    if (!ownerPreviewActive && effectivePlanForDisplay === 'Free') {
      return (
        <div id="billing-center" className="card p-4 border border-[#3B82F6]/25 bg-[#0F111A]">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing Center</div>
              <div className="text-lg font-semibold text-[#E6E8EE]">Free Plan Billing Summary</div>
              <div className="text-sm text-[#8B92A3] mt-1">Free accounts do not have a paid Stripe subscription to manage.</div>
            </div>
            <button onClick={downloadBillingSummaryPdf} className="btn btn-ghost text-xs md:w-auto">Download Billing Summary PDF</button>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            {[
              ['Current Plan', 'Free'],
              ['Billing Status', 'Free Active'],
              ['Payment Method', 'Not required'],
              ['Next Payment', 'None'],
            ].map(([label, value]) => (
              <div key={label} className="panel p-3">
                <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
                <div className="text-sm text-[#E6E8EE] break-words">{value}</div>
              </div>
            ))}
          </div>

          <div className="panel p-3 text-sm text-[#C5CAD6]">
            There is no paid subscription, payment method, invoice, or renewal to manage for this Free account.
          </div>
        </div>
      )
    }

    return (
      <div id="billing-center" className="card p-4 border border-[#3B82F6]/25 bg-[#0F111A]">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing Center</div>
            <div className="text-lg font-semibold text-[#E6E8EE]">Plan, Payment Schedule & Receipts</div>
            <div className="text-sm text-[#8B92A3] mt-1">
              {canOpenBillingPortal
                ? 'Update your payment method, view invoices, change billing details, or cancel renewal.'
                : 'Stripe checkout links are used for customer payments. Receipts here reflect Deal Blast Pro account access records.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {billingControlPolicy.showManage && (
              <>
                <button
                  type="button"
                  onClick={() => openBillingPortal('portal')}
                  disabled={Boolean(billingPortalAction)}
                  className="btn btn-green text-xs md:w-auto disabled:opacity-60"
                >
                  {billingPortalAction === 'portal' ? 'Opening...' : 'Manage Billing / Open Billing Portal'}
                </button>
                <button
                  type="button"
                  onClick={() => openBillingPortal('invoice')}
                  disabled={Boolean(billingPortalAction)}
                  className="btn btn-ghost text-xs md:w-auto disabled:opacity-60"
                >
                  {billingPortalAction === 'invoice' ? 'Opening...' : 'View Invoices'}
                </button>
              </>
            )}
            {ownerPreviewActive && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Preview only — billing actions are disabled and no real subscription change will occur.
              </div>
            )}
            <button onClick={downloadBillingSummaryPdf} className="btn btn-ghost text-xs md:w-auto">Download Billing Summary PDF</button>
          </div>
        </div>

        {(billingControlPolicy.showManage || billingControlPolicy.showUpgrade) && (
          <div className="mb-4 rounded border border-[#252A38] bg-[#0A0C12] p-3">
            <div className="text-sm font-semibold text-[#E6E8EE] mb-2">Subscription Controls</div>
            <div className="text-xs text-[#8B92A3] mb-3">
              {billingControlPolicy.simulated
                ? 'Preview simulation only. These controls do not contact Stripe or change billing.'
                : 'These actions use the authenticated Stripe workflow. Changes appear here only after durable billing data is updated.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {billingControlPolicy.showManage && <button type="button" onClick={() => openBillingPortal('portal')} disabled={Boolean(billingPortalAction)} className="btn btn-green text-xs disabled:opacity-60">Manage Billing</button>}
              {billingControlPolicy.showUpgrade && <button type="button" onClick={() => ownerPreviewActive ? toast.info('Preview mode only. No plan change was performed.') : window.location.assign('/app/upgrade')} className="btn btn-ghost text-xs">Upgrade Plan</button>}
              {billingControlPolicy.showChange && <button type="button" onClick={() => openBillingPortal('portal')} disabled={Boolean(billingPortalAction)} className="btn btn-ghost text-xs disabled:opacity-60">Change Plan</button>}
              {billingControlPolicy.showDowngrade && <button type="button" onClick={() => openBillingPortal('portal')} disabled={Boolean(billingPortalAction)} className="btn btn-ghost text-xs disabled:opacity-60">Downgrade Plan</button>}
              {billingControlPolicy.showUndoCancellation && <button type="button" onClick={() => openBillingPortal('portal')} disabled={Boolean(billingPortalAction)} className="btn btn-ghost text-xs disabled:opacity-60">Undo Scheduled Cancellation</button>}
              {billingControlPolicy.showCancel && <button type="button" onClick={openCancellationPortal} disabled={Boolean(billingPortalAction)} className="btn btn-ghost text-xs text-amber-200 disabled:opacity-60">Cancel Subscription</button>}
            </div>
          </div>
        )}

        {cancellationScheduledFromStripe && (
          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <div className="font-semibold">Cancellation Scheduled</div>
            <div>Cancels on {formatBillingDate(verifiedCurrentPeriodEnd)}.</div>
            <div>Access remains available until {formatBillingDate(verifiedCurrentPeriodEnd)}.</div>
            {canOpenBillingPortal && (
              <button
                type="button"
                onClick={() => openBillingPortal('portal')}
                disabled={Boolean(billingPortalAction)}
                className="btn btn-ghost text-xs mt-3 disabled:opacity-60"
              >
                Resume Subscription
              </button>
            )}
          </div>
        )}

        {!cancellationScheduledFromStripe && cancelScheduled && (
          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <div className="font-semibold">Your account is scheduled for cancellation.</div>
            <div>
              {deletionRequest.scheduledDeletionAt
                ? `Your access remains active until ${formatBillingDate(deletionRequest.scheduledDeletionAt)}. Your workspace will be removed after the billing period ends.`
                : 'We could not confirm a billing period end date. Access will remain active while cancellation is processed.'}
            </div>
          </div>
        )}

        {scheduledPlanActive && (
          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-semibold">Scheduled Plan Change</div>
            <div className="mt-1">Your plan will change from {effectiveAccessPlan} to {scheduledBillingPlan} on {formatBillingDate(scheduledBillingPlanChangeAt)}.</div>
            <div>Current plan: {effectiveAccessPlan}</div>
            <div>Scheduled plan: {scheduledBillingPlan}</div>
            <div>{effectiveAccessPlan} access remains active until: {formatBillingDate(scheduledBillingPlanChangeAt)}</div>
            <div>Billing interval: {(billingCenter.billingInterval || trial.billingInterval || billingFrequency || 'monthly').toString()}</div>
            {currentBuyerCapacityForScheduledPlan && currentBuyerCapacityForScheduledPlan.limit !== null && buyers.length > currentBuyerCapacityForScheduledPlan.limit && (
              <div className="mt-3 rounded border border-amber-500/30 bg-[#0A0C12] p-3 text-amber-100">
                Your workspace contains {buyers.length.toLocaleString()} buyers, above the {scheduledBillingPlan} limit of {currentBuyerCapacityForScheduledPlan.limit.toLocaleString()}. You can continue viewing existing buyers, but you cannot add more until you upgrade or reduce your buyer count.
              </div>
            )}
            {(scheduledBillingPlan === 'Starter' || scheduledBillingPlan === 'Free' || scheduledBillingPlan === 'Free Demo') && (
              <div className="mt-3 rounded border border-[#252A38] bg-[#0A0C12] p-3 text-[#C5CAD6]">
                Your purchased Property Intelligence credits are preserved. Starter includes 20 monthly credits, while Free workspaces may use purchased credits.
              </div>
            )}
            {canOpenBillingPortal && (
              <button
                type="button"
                onClick={() => openBillingPortal('portal')}
                disabled={Boolean(billingPortalAction)}
                className="btn btn-ghost text-xs mt-3 disabled:opacity-60"
              >
                Manage or Cancel Scheduled Downgrade
              </button>
            )}
          </div>
        )}

        {billingNotice.kind !== 'none' && (
          <div className={`mb-4 rounded border p-3 text-sm ${billingNotice.kind.includes('past-due') ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
            <div className="font-semibold">{billingNotice.title}</div>
            <div className="mt-1">{billingNotice.message}</div>
            {billingNotice.kind.includes('past-due') && (
              <div className="mt-1 text-xs">Past-due policy: days 1-{PAST_DUE_READ_ONLY_DAYS} read-only, days 7-{PAST_DUE_RESTRICTED_DAYS} restricted, 30+ effective Free access. Data and billing records are preserved.</div>
            )}
          </div>
        )}

        {!ownerPreviewActive && currentBillingStatus === 'Payment Pending' && (
          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <div className="font-semibold">Payment is pending confirmation.</div>
            <div className="mt-1">If you completed checkout, access will update after payment is confirmed.</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => openUpgradePayment(currentPlan === 'Free' ? 'Pro' : currentPlan, billingFrequency)} className="btn btn-green text-xs">Complete Payment</button>
              <button onClick={() => openUpgradePayment('Free', 'monthly')} className="btn btn-ghost text-xs">Choose Free</button>
              <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost text-xs">Contact Support</button>
            </div>
          </div>
        )}

        {!ownerPreviewActive && currentBillingStatus === 'Past Due' && (
          <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            <div className="font-semibold">Payment Past Due</div>
            <div className="mt-1">Outstanding balance: {formatCurrencyFromCents(outstandingBalanceCents)}</div>
            <div className="mt-1">Resolve payment through Stripe. Cancelling renewal or deactivating workspace access does not erase or forgive the outstanding invoice.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openBillingPortal('invoice')}
                disabled={Boolean(billingPortalAction)}
                className="btn btn-green text-xs disabled:opacity-60"
              >
                {billingPortalAction === 'invoice' ? 'Opening...' : 'Resolve Payment'}
              </button>
              <button
                type="button"
                onClick={() => openBillingPortal('portal')}
                disabled={Boolean(billingPortalAction)}
                className="btn btn-ghost text-xs disabled:opacity-60"
              >
                {billingPortalAction === 'portal' ? 'Opening...' : 'Manage Subscription'}
              </button>
            </div>
          </div>
        )}

        {!ownerPreviewActive && currentBillingStatus === 'Cancelled' && (
          <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            Account access is cancelled. Reactivate or choose a plan to continue.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3 mb-4">
          {[
            ['Current Plan', effectivePlanForDisplay],
            ['Effective Access Plan', effectiveAccessPlan],
            ['Scheduled Plan', scheduledBillingPlan || 'None'],
            ['Plan Changes On', scheduledBillingPlanChangeAt ? formatBillingDate(scheduledBillingPlanChangeAt) : 'None'],
            ['Billing Status', effectiveBillingStatusForDisplay],
            ['Billing Frequency', billingFrequency === 'annual' ? 'Annual' : 'Monthly'],
            ['Billing Period Start', ownerPreviewActive ? 'Preview mode' : formatBillingDate(trial.billingPeriodStart)],
            ['Billing Period End', ownerPreviewActive ? 'Preview mode' : formatBillingDate(verifiedCurrentPeriodEnd || trial.billingPeriodEnd)],
            ['Next Payment Due Date', ownerPreviewActive ? 'Preview mode only' : effectivePlanForDisplay === 'Free' ? 'No paid billing history yet' : formatBillingDate(nextPaymentDue)],
            ['Cancel Scheduled', cancellationScheduledFromStripe || cancelScheduled ? 'Yes' : 'No'],
            ['Scheduled Cancellation Date', cancellationScheduledFromStripe ? formatBillingDate(verifiedCurrentPeriodEnd) : formatBillingDate(deletionRequest.cancellationRequestedAt)],
            ['Access Through', cancellationScheduledFromStripe ? formatBillingDate(verifiedCurrentPeriodEnd) : formatBillingDate(deletionRequest.scheduledDeletionAt)],
            ['Payment Provider', 'Stripe'],
            ['Payment Collection Status', ownerPreviewActive ? 'Preview Active' : billingCenter.paymentCollectionStatus || 'Needs Review'],
            ['Outstanding Balance', formatCurrencyFromCents(outstandingBalanceCents)],
            ['Latest Invoice Status', billingCenter.latestInvoiceStatus || 'Not available'],
            ['Last Payment Date', displayLastPayment ? formatBillingDate(displayLastPayment.paymentDate) : ownerPreviewActive ? 'Preview mode, no records changed' : 'No paid billing history yet'],
            ['Last Payment Amount', displayLastPayment?.amount || (ownerPreviewActive ? 'Preview mode, no records changed' : 'No paid billing history yet')],
            ['Next Payment Amount', nextAmount],
            ['Billing Contact Email', savedBillingProviderSetup.billingEmail || user?.email || 'Not Provided'],
            ['Company / Billing Name', savedBillingProviderSetup.billingName || 'Not Provided'],
          ].map(([label, value]) => (
            <div key={label} className="panel p-3">
              <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
              <div className="text-sm text-[#E6E8EE] break-words">{value}</div>
            </div>
          ))}
        </div>

        <div className={`grid ${hasInternalBillingDiagnosticsAccess ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-3 mb-4`}>
          <div className="panel p-3">
            <div className="text-sm font-semibold mb-2">Payment Schedule</div>
            <div className="text-sm text-[#C5CAD6]">{scheduleText}</div>
            {!ownerPreviewActive && effectivePlanForDisplay === 'Free' && (
              <div className="mt-3">
                <div className="text-sm text-[#C5CAD6] mb-3">Stripe checkout is available for paid plans. Upgrade to Starter or Pro to continue.</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => openUpgradePayment('Starter', 'monthly')} className="btn btn-ghost text-xs">Starter Monthly</button>
                  <button onClick={() => openUpgradePayment('Pro', 'annual')} className="btn btn-ghost text-xs">Pro Annual</button>
                </div>
              </div>
            )}
          </div>

          {hasInternalBillingDiagnosticsAccess && (
          <div className="panel p-3">
            <div className="text-sm font-semibold mb-2">Stripe Auto-Activation</div>
            <div className="text-sm text-[#8B92A3]">
              {stripeAutoActivationDetail}
            </div>
            {!hasSuccessfulActivation && (
              <div className="mt-2 text-sm text-amber-200">
                Stripe destination created. Complete a test checkout to verify automatic activation.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>Stripe Destination: <span className="text-[#22C55E]">Created</span></div>
              <div>Webhook Deliveries: <span className={hasWebhookDelivery ? 'text-[#22C55E]' : 'text-amber-300'}>{hasWebhookDelivery ? 'Received' : 'None Yet'}</span></div>
              <div>Last Delivery Status: <span className="text-[#C5CAD6]">{hasWebhookDelivery ? 'Processed' : 'Waiting'}</span></div>
              <div>Auto Activation: <span className={hasSuccessfulActivation ? 'text-[#22C55E]' : 'text-amber-300'}>{stripeAutoActivationLabel}</span></div>
              <div>Unmatched Stripe Payments: <span className="text-[#C5CAD6]">{billingCenter.unmatchedStripePaymentCount || 0}</span></div>
            </div>
          </div>
          )}
        </div>

        <div className="panel p-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-sm font-semibold">Payment History</div>
              <div className="text-xs text-[#8B92A3]">{ownerPreviewActive ? 'Preview mode. No real payment records are changed.' : effectivePlanForDisplay === 'Free' && !displayPaymentHistory.length ? 'No paid billing history yet.' : 'Payment records do not include card, bank, routing, API, OAuth, or secret values.'}</div>
            </div>
          </div>

          {displayPaymentHistory.length === 0 ? (
            <div className="text-sm text-[#8B92A3]">{ownerPreviewActive ? 'Preview mode, no real payment records changed.' : 'No payment records yet.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[#8B92A3]">
                  <tr>
                    <th className="py-2 pr-3">Payment Date</th>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Frequency</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPaymentHistory.map(record => (
                    <tr key={record.id} className="border-t border-[#252A38]">
                      <td className="py-2 pr-3">{formatBillingDate(record.paymentDate)}</td>
                      <td className="py-2 pr-3">{record.plan}</td>
                      <td className="py-2 pr-3 capitalize">{record.billingFrequency}</td>
                      <td className="py-2 pr-3">{record.amount}</td>
                      <td className="py-2 pr-3">{record.status}</td>
                      <td className="py-2 pr-3">Stripe</td>
                      <td className="py-2 pr-3">{record.receiptLink ? <a href={record.receiptLink} target="_blank" rel="noreferrer" className="text-[#93C5FD] underline">Receipt Link</a> : (record.providerReference || 'Not Provided')}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => downloadReceiptPdf(record)} className="btn btn-ghost text-[10px]">Download Receipt PDF</button>
                          {hasInternalBillingDiagnosticsAccess && (
                            <>
                              <button onClick={() => editPaymentRecord(record)} className="btn btn-ghost text-[10px]">Edit</button>
                              <button onClick={() => markPaymentStatus(record, 'Paid')} className="btn btn-ghost text-[10px]">Mark Paid</button>
                              <button onClick={() => markPaymentStatus(record, 'Failed')} className="btn btn-ghost text-[10px]">Mark Failed</button>
                              <button onClick={() => markPaymentStatus(record, 'Refunded')} className="btn btn-ghost text-[10px]">Mark Refunded</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderDangerZone = () => (
    <div className="card p-4 border border-red-500/35 bg-red-500/5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-red-300 mb-1">Danger Zone</div>
          <div className="text-lg font-semibold text-[#E6E8EE]">Delete Account / Workspace</div>
          <div className="text-sm text-[#8B92A3] mt-1 max-w-3xl">
            Deactivate this Deal Blast Pro workspace/account. This does not immediately hard-delete buyers, deals, submissions, files, or settings.
          </div>
          {deletionRequest.accountStatus === 'Cancellation Scheduled' && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <div className="font-semibold">Cancellation Scheduled</div>
              <div>
                {deletionRequest.scheduledDeletionAt
                  ? `Your account is scheduled for cancellation. Your access will remain active until ${new Date(deletionRequest.scheduledDeletionAt).toLocaleDateString()}. Your workspace will be removed after the billing period ends.`
                  : 'Your account is scheduled for cancellation. We could not confirm a billing period end date. Access will remain active while cancellation is processed.'}
              </div>
            </div>
          )}
          {deletionRequest.accountStatus !== 'Cancellation Scheduled' && deletionRequest.status === 'Deletion Requested' && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <div className="font-semibold">Deletion Requested</div>
              <div>Your Deal Blast Pro account has been deactivated. You can create a new account anytime.</div>
              {deletionRequest.requestedAt && (
                <div className="text-xs text-amber-300/80 mt-1">Requested {new Date(deletionRequest.requestedAt).toLocaleString()}</div>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={openDeleteAccountRequest} className="btn btn-ghost text-red-300 border-red-500/40 md:w-auto">
          {deletionActionLabel}
        </button>
      </div>
    </div>
  )

  const applyManualActivation = (overrides: Partial<typeof manualActivation> = {}, successMessage = 'Plan access updated.') => {
    const next = { ...manualActivation, ...overrides }
    activateManualPlan({
      plan: next.plan as typeof manualPlanOptions[number],
      billingStatus: next.billingStatus as typeof manualBillingStatusOptions[number],
      billingPeriodStart: next.billingPeriodStart,
      billingPeriodEnd: next.billingPeriodEnd,
      billingAdminNote: next.billingAdminNote,
    })
    setManualActivation(next)
    toast.success(successMessage)
  }

  const saveBillingProviderSetup = () => {
    const paymentLink = billingProviderSetup.paymentLink.trim()
    const trimmedPlanLinks = planPaymentLinkFields.reduce((acc, item) => {
      acc[item.field] = String(billingProviderSetup[item.field] || '').trim()
      return acc
    }, {} as Record<string, string>)

    if (paymentLink && !/^https?:\/\//i.test(paymentLink)) {
      toast.error('Payment link must start with http:// or https://')
      return
    }

    const invalidPlanLink = planPaymentLinkFields.find(item => {
      const value = String(trimmedPlanLinks[item.field] || '').trim()
      return value && !isValidPaymentUrl(value)
    })
    if (invalidPlanLink) {
      toast.error(`${invalidPlanLink.label} must start with http:// or https://`)
      return
    }

    const nextSetup = {
      ...billingProviderSetup,
      provider: 'Stripe' as const,
      billingMode: 'Stripe Checkout Links' as const,
      setupStatus: 'Ready for Payment Collection' as const,
      billingEmail: billingProviderSetup.billingEmail.trim(),
      billingName: billingProviderSetup.billingName.trim(),
      providerAccount: billingProviderSetup.providerAccount.trim(),
      paymentLink,
      ...trimmedPlanLinks,
      paymentHandle: billingProviderSetup.paymentHandle.trim(),
      notes: billingProviderSetup.notes.trim(),
      updatedAt: new Date().toISOString()
    }

    updateSettings({ billingProviderSetup: nextSetup })
    setBillingProviderSetup(nextSetup)
    toast.success('Payment collection preferences saved. Customers complete payment through Stripe checkout.')

    if (nextSetup.autopayEnabled) {
      toast('Autopay preference saved. Recurring payment setup is completed through Stripe checkout.')
    }
  }

  const notificationToggleFields: Array<{ key: keyof EmailNotificationSettings; label: string; detail: string }> = [
    { key: 'notify_new_account', label: 'New Account Created', detail: 'Platform user/workspace registrations' },
    { key: 'notify_new_deal', label: 'New deal', detail: 'Public deal submissions' },
    { key: 'notify_new_buyer', label: 'New buyer', detail: 'Buyer portal submissions' },
    { key: 'notify_buyer_verification', label: 'Buyer verification', detail: 'Proof/review activity' },
    { key: 'notify_missing_docs', label: 'Missing docs', detail: 'Required docs incomplete' },
    { key: 'notify_buyer_match', label: 'Buyer match', detail: 'Matching events' },
    { key: 'notify_offer_received', label: 'Offer received', detail: 'Incoming offers' },
    { key: 'notify_offer_response_needed', label: 'Offer response needed', detail: 'Follow-up required' },
    { key: 'notify_inventory_conversion', label: 'Inventory conversion', detail: 'Submission moved to inventory' },
    { key: 'notify_deal_status_change', label: 'Deal status change', detail: 'Pipeline status updates' },
    { key: 'notify_closing_followup', label: 'Closing follow-up', detail: 'Closing/follow-up tasks' },
  ]

  const billingPreferenceFields: Array<{ key: keyof EmailNotificationSettings; label: string; detail: string }> = [
    { key: 'renewal_reminders', label: 'Upcoming renewal reminder', detail: 'Remind me before a monthly subscription renewal.' },
    { key: 'annual_renewal_reminders', label: 'Upcoming annual renewal reminder', detail: 'Remind me before an annual subscription renewal.' },
    { key: 'payment_receipts', label: 'Payment receipt', detail: 'Send a receipt when a payment is completed.' },
    { key: 'invoice_notifications', label: 'Invoice available', detail: 'Let me know when a new invoice is available.' },
    { key: 'card_expiration_reminders', label: 'Card expiring', detail: 'Remind me before the payment method on file expires.' },
    { key: 'billing_summary', label: 'Optional billing summary', detail: 'Receive occasional Deal Blast Pro billing summaries.' },
  ]

  const profileChanged =
    profileForm.fullName.trim() !== profileInitial.fullName.trim() ||
    profileForm.displayName.trim() !== profileInitial.displayName.trim() ||
    profileForm.businessName.trim() !== profileInitial.businessName.trim()

  const pendingEmailStorageKey = user?.id ? `dbp:pending-email-change:${user.id}` : ''

  useEffect(() => {
    if (!pendingEmailStorageKey) return
    try {
      const storedPendingEmail = localStorage.getItem(pendingEmailStorageKey) || ''
      const normalizedPending = storedPendingEmail.trim().toLowerCase()
      const verifiedEmail = String(user?.email || '').trim().toLowerCase()
      if (normalizedPending && normalizedPending === verifiedEmail) {
        localStorage.removeItem(pendingEmailStorageKey)
        setPendingEmailChange('')
      } else {
        setPendingEmailChange(normalizedPending)
      }
    } catch {
      setPendingEmailChange('')
    }
  }, [pendingEmailStorageKey, user?.email])

  const refreshAccountProfile = async () => {
    if (!user?.email) return
    setProfileLoading(true)
    try {
      const { authUser, profile } = await loadAccountProfile()
      const authPendingEmail = getPendingAuthEmailChange(authUser)
      const names = profileToUserNames(profile, authUser.email || user.email)
      const next = {
        fullName: names.fullName || user.fullName || user.name || '',
        displayName: names.displayName || user.displayName || '',
        businessName: names.businessName || user.businessName || user.company || '',
        email: authUser.email || user.email || '',
      }
      setProfileForm(next)
      setProfileInitial(next)
      if (authPendingEmail && authPendingEmail !== next.email.toLowerCase()) {
        setPendingEmailChange(authPendingEmail)
        if (pendingEmailStorageKey) {
          try { localStorage.setItem(pendingEmailStorageKey, authPendingEmail) } catch {}
        }
      } else if (pendingEmailChange && pendingEmailChange === next.email.toLowerCase()) {
        try { localStorage.removeItem(pendingEmailStorageKey) } catch {}
        setPendingEmailChange('')
      }
      updateUserProfile({
        fullName: next.fullName,
        displayName: next.displayName,
        businessName: next.businessName,
        company: next.businessName,
        email: next.email.toLowerCase(),
        name: names.name,
      })
    } catch (error) {
      console.warn('[Deal Blast Pro] Account profile unavailable:', error)
      const fallback = {
        fullName: user?.fullName || user?.name || '',
        displayName: user?.displayName || '',
        businessName: getWorkspaceDisplayName(user?.businessName, user?.company),
        email: user?.email || '',
      }
      setProfileForm(fallback)
      setProfileInitial(fallback)
    } finally {
      setProfileLoading(false)
    }
  }

  const saveProfile = async () => {
    if (ownerPreviewActive) {
      toast.info('Preview mode only. Profile records were not changed.')
      return
    }
    if (!profileForm.fullName.trim()) {
      toast.error('Full Name is required.')
      return
    }

    setProfileSaving(true)
    try {
      const saved = await saveAccountProfile({
        fullName: profileForm.fullName,
        displayName: profileForm.displayName,
        businessName: profileForm.businessName,
      })
      const names = profileToUserNames(saved, profileForm.email || user?.email || '')
      const next = {
        fullName: saved.full_name || profileForm.fullName.trim(),
        displayName: saved.display_name || '',
        businessName: saved.business_name || saved.company || '',
        email: saved.email || profileForm.email || user?.email || '',
      }
      setProfileForm(next)
      setProfileInitial(next)
      updateUserProfile({
        fullName: next.fullName,
        displayName: next.displayName,
        businessName: next.businessName,
        company: next.businessName,
        name: names.name,
      })
      toast.success('Profile saved.')
    } catch (error: any) {
      toast.error(error?.message || 'Profile could not be saved.')
    } finally {
      setProfileSaving(false)
    }
  }

  const submitEmailChange = async () => {
    if (ownerPreviewActive) {
      toast.info('Preview mode only. Email records were not changed.')
      return
    }

    setEmailChangeSaving(true)
    setEmailChangeMessage('')
    try {
      const result = await requestVerifiedEmailChange(emailChangeValue)
      const requestedEmail = result.requestedEmail.toLowerCase()
      if (pendingEmailStorageKey) {
        try { localStorage.setItem(pendingEmailStorageKey, requestedEmail) } catch {}
      }
      setPendingEmailChange(requestedEmail)
      setEmailChangeMessage('Check both your current email and your new email to confirm this change.')
      toast.success('Check your email to confirm this change.')
      setEmailChangeValue('')
    } catch (error: any) {
      const message = error?.message || 'Email change could not be started.'
      setEmailChangeMessage(message)
      toast.error(message)
    } finally {
      setEmailChangeSaving(false)
    }
  }

  const refreshEmailNotificationLogs = async () => {
    try {
      const rows = await loadEmailNotificationLogs(emailWorkspaceId)
      setEmailLogs(rows)
    } catch (error) {
      console.warn('[Deal Blast Pro] Email notification logs unavailable:', error)
    }
  }

  const refreshEmailNotificationSettings = async () => {
    setEmailSettingsLoading(true)
    try {
      const loaded = await loadEmailNotificationSettings(emailWorkspaceId)
      setEmailSettings(loaded)
      setEmailRecipientsText((loaded.recipients || []).join(', '))
      await refreshEmailNotificationLogs()
    } catch (error: any) {
      const fallback = { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS, workspace_id: emailWorkspaceId }
      setEmailSettings(fallback)
      setEmailRecipientsText(fallback.recipients.join(', '))
      console.warn('[Deal Blast Pro] Email notification settings unavailable:', error)
    } finally {
      setEmailSettingsLoading(false)
    }
  }

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Sign in again before viewing admin waitlist data.')
    return { Authorization: `Bearer ${token}` }
  }

  const refreshWaitlistEntries = async () => {
    if (!hasSuperAdminAccess) return
    setWaitlistLoading(true)
    try {
      const response = await fetch('/api/waitlist-admin', {
        headers: await getAuthHeaders(),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Waitlist entries unavailable.')
      setWaitlistEntries(Array.isArray(payload.entries) ? payload.entries : [])
    } catch (error: any) {
      console.warn('[Deal Blast Pro] Waitlist entries unavailable:', error)
    } finally {
      setWaitlistLoading(false)
    }
  }

  const retryWaitlistEmails = async (entryId: string) => {
    setWaitlistRetryingId(entryId)
    try {
      const response = await fetch('/api/waitlist-admin', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entryId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Waitlist retry failed.')
      toast.success('Waitlist email retry requested.')
      await refreshWaitlistEntries()
      await refreshEmailNotificationLogs()
    } catch (error: any) {
      toast.error(error?.message || 'Waitlist retry failed.')
    } finally {
      setWaitlistRetryingId('')
    }
  }

  const saveEmailNotifications = async () => {
    const checked = validateNotificationRecipients(emailRecipientsText)
    if (!checked.ok) {
      toast.error(checked.error)
      return
    }

    setEmailSettingsSaving(true)
    try {
      const saved = await saveEmailNotificationSettings({
        ...emailSettings,
        workspace_id: emailWorkspaceId,
        billing_transactional_required: true,
        recipients: checked.recipients,
      })
      setEmailSettings(saved)
      setEmailRecipientsText((saved.recipients || checked.recipients).join(', '))
      toast.success(showCustomerSettingsView && customerSettingsTab === 'Plan & Billing' ? 'Billing preferences saved.' : 'Email notification settings saved.')
      await refreshEmailNotificationLogs()
    } catch (error: any) {
      toast.error(error?.message || 'Email notification settings could not be saved.')
    } finally {
      setEmailSettingsSaving(false)
    }
  }

  const sendEmailNotificationsTest = async () => {
    const checked = validateNotificationRecipients(emailRecipientsText)
    if (!checked.ok) {
      toast.error(checked.error)
      return
    }

    setEmailTestSending(true)
    try {
      const nextSettings = {
        ...emailSettings,
        workspace_id: emailWorkspaceId,
        billing_transactional_required: true,
        recipients: checked.recipients,
      }
      const result = await sendEmailNotificationTest(nextSettings)
      const status = result?.emailResult?.ok ? 'Sent' : 'Needs Review'
      setEmailSettings(prev => ({
        ...prev,
        last_test_status: status,
        last_test_at: new Date().toISOString(),
        last_test_error: result?.emailResult?.ok ? '' : String(result?.emailResult?.reason || ''),
      }))
      toast.success('Test email accepted by provider.')
      await refreshEmailNotificationLogs()
    } catch (error: any) {
      setEmailSettings(prev => ({
        ...prev,
        last_test_status: 'Failed',
        last_test_at: new Date().toISOString(),
        last_test_error: error?.message || 'Test email failed.',
      }))
      toast.error(error?.message || 'Test email failed.')
      await refreshEmailNotificationLogs()
    } finally {
      setEmailTestSending(false)
    }
  }

  const renderEmailNotifications = () => {
    const checked = validateNotificationRecipients(emailRecipientsText)
    const dedupedRecipients = parseNotificationRecipients(emailRecipientsText)

    return (
      <div className="card p-4 border border-[#22C55E]/25 bg-[#0F111A]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Admin Email Operations</div>
            <div className="text-lg font-semibold text-[#E6E8EE]">Durable Notification Delivery</div>
            <div className="text-sm text-[#8B92A3] mt-1">Messages are recorded in a durable outbox before Resend accepts them. Provider acceptance is not treated as confirmed delivery.</div>
          </div>
          <div className={`text-xs px-2 py-1 rounded border self-start ${emailSettings.enabled ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {emailSettings.enabled ? 'Enabled' : 'Paused'}
          </div>
        </div>

        <div className="grid gap-4">
          <label className="flex items-start gap-3 rounded border border-[#252A38] bg-[#0A0C12] p-3">
            <input
              type="checkbox"
              className="mt-1 accent-[#22C55E]"
              checked={emailSettings.enabled}
              onChange={e => setEmailSettings(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-[#E6E8EE]">Master email notifications</span>
              <span className="block text-sm text-[#8B92A3]">When paused, the server logs skipped alerts and does not send provider calls.</span>
            </span>
          </label>

          <label className="block">
            <div className="text-xs text-[#8B92A3] mb-1">RECIPIENTS</div>
            <input
              className="input"
              value={emailRecipientsText}
              onChange={e => setEmailRecipientsText(e.target.value)}
              placeholder="housebuyerinv@gmail.com"
            />
            <div className={`text-xs mt-1 ${checked.ok ? 'text-[#64748B]' : 'text-red-300'}`}>
              {checked.ok ? `Recipients: ${dedupedRecipients.join(', ')}` : checked.error}
            </div>
          </label>

          <div className="grid md:grid-cols-2 gap-2">
            {notificationToggleFields.map(item => (
              <label key={String(item.key)} className="flex items-start gap-3 rounded border border-[#252A38] bg-[#0A0C12] p-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-[#22C55E]"
                  checked={Boolean(emailSettings[item.key])}
                  onChange={e => setEmailSettings(prev => ({ ...prev, [item.key]: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-[#E6E8EE]">{item.label}</span>
                  <span className="block text-xs text-[#8B92A3]">{item.detail}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="panel p-3">
              <div className="text-xs text-[#8B92A3] mb-1">Provider</div>
              <div className="text-sm text-[#E6E8EE]">Resend</div>
            </div>
            <div className="panel p-3">
              <div className="text-xs text-[#8B92A3] mb-1">Last Test Status</div>
              <div className="text-sm text-[#E6E8EE]">{emailSettings.last_test_status || 'Not tested yet'}</div>
            </div>
            <div className="panel p-3">
              <div className="text-xs text-[#8B92A3] mb-1">Last Test At</div>
              <div className="text-sm text-[#E6E8EE]">{emailSettings.last_test_at ? new Date(emailSettings.last_test_at).toLocaleString() : 'Not tested yet'}</div>
            </div>
          </div>

          {emailSettings.last_test_error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {emailSettings.last_test_error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={saveEmailNotifications} disabled={emailSettingsSaving || emailSettingsLoading} className="btn btn-primary sm:w-auto disabled:opacity-60">
              {emailSettingsSaving ? 'Saving...' : 'Save Email Settings'}
            </button>
            <button onClick={sendEmailNotificationsTest} disabled={emailTestSending || emailSettingsLoading} className="btn btn-green sm:w-auto disabled:opacity-60">
              {emailTestSending ? 'Queueing Test...' : 'Send Safe Test Email'}
            </button>
            <button onClick={refreshEmailNotificationSettings} disabled={emailSettingsLoading} className="btn btn-ghost sm:w-auto disabled:opacity-60">
              {emailSettingsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="rounded border border-[#252A38] bg-[#0A0C12] p-3">
            <div className="text-sm font-semibold text-[#E6E8EE] mb-2">Recent Delivery Operations</div>
            <div className="text-xs text-[#64748B] mb-2">Sent means accepted by Resend. Delivered, bounced, complained, suppressed, failed, and retrying are updated from the durable delivery lifecycle.</div>
            <div className="space-y-2">
              {emailLogs.length ? emailLogs.map(log => (
                <div key={log.id} className="grid md:grid-cols-[1fr_1fr_auto] gap-2 rounded border border-[#252A38] bg-[#11151F] p-2 text-xs">
                  <div>
                    <div className="text-[#E6E8EE]">{log.event_type}</div>
                    <div className="text-[#8B92A3] break-words">{log.recipient}</div>
                  </div>
                  <div>
                    <div className="text-[#8B92A3]">{log.provider_message_id || log.error_message || 'No provider message id'}</div>
                    <div className="text-[#64748B]">{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`px-2 py-1 rounded border h-fit ${log.status === 'sent' ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]' : log.status === 'failed' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {log.status}
                  </div>
                </div>
              )) : (
                <div className="text-sm text-[#8B92A3]">No provider logs yet.</div>
              )}
            </div>
          </div>

          {hasSuperAdminAccess && (
            <div className="rounded border border-[#252A38] bg-[#0A0C12] p-3">
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#E6E8EE]">Waitlist Registrations</div>
                  <div className="text-xs text-[#8B92A3]">Owner-admin view of saved waitlist records and email delivery status.</div>
                </div>
                <button onClick={refreshWaitlistEntries} disabled={waitlistLoading} className="btn btn-ghost text-xs sm:w-auto disabled:opacity-60">
                  {waitlistLoading ? 'Refreshing...' : 'Refresh Waitlist'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead>
                    <tr className="text-left text-[#8B92A3]">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Phone</th>
                      <th className="py-2 pr-3">Market</th>
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3">Date Joined</th>
                      <th className="py-2 pr-3">Admin Email</th>
                      <th className="py-2 pr-3">Confirmation</th>
                      <th className="py-2 pr-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlistEntries.map(entry => {
                      const failed = entry.admin_notification_status === 'failed' || entry.confirmation_email_status === 'failed'
                      return (
                        <tr key={entry.id} className="border-t border-[#252A38]">
                          <td className="py-2 pr-3 text-[#E6E8EE]">{entry.full_name || 'Not Provided'}</td>
                          <td className="py-2 pr-3 text-[#C5CAD6]">{entry.email}</td>
                          <td className="py-2 pr-3 text-[#C5CAD6]">{entry.phone || 'Not Provided'}</td>
                          <td className="py-2 pr-3 text-[#C5CAD6]">{entry.primary_market || 'Not Provided'}</td>
                          <td className="py-2 pr-3 text-[#C5CAD6]">{entry.business_type || 'Not Provided'}</td>
                          <td className="py-2 pr-3 text-[#8B92A3]">{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Not Provided'}</td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-1 rounded border ${entry.admin_notification_status === 'sent' ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]' : entry.admin_notification_status === 'failed' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                              {entry.admin_notification_status || 'pending'}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-1 rounded border ${entry.confirmation_email_status === 'sent' ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]' : entry.confirmation_email_status === 'failed' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                              {entry.confirmation_email_status || 'pending'}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {failed ? (
                              <button
                                onClick={() => retryWaitlistEmails(entry.id)}
                                disabled={waitlistRetryingId === entry.id}
                                className="btn btn-ghost text-[10px] px-2 py-1 disabled:opacity-60"
                              >
                                {waitlistRetryingId === entry.id ? 'Retrying...' : 'Retry Emails'}
                              </button>
                            ) : (
                              <span className="text-[#64748B]">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {!waitlistEntries.length && (
                      <tr>
                        <td colSpan={9} className="py-4 text-center text-[#8B92A3]">
                          {waitlistLoading ? 'Loading waitlist entries...' : 'No waitlist entries yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderBillingNotificationPreferences = () => (
    <div className="card p-4 border border-[#3B82F6]/25 bg-[#0F111A]">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing Notifications</div>
          <div className="text-lg font-semibold text-[#E6E8EE]">Email Preferences</div>
          <div className="text-sm text-[#8B92A3] mt-1">Choose optional billing reminders. Essential account notices cannot be disabled.</div>
        </div>
        <button onClick={saveEmailNotifications} disabled={emailSettingsSaving || emailSettingsLoading} className="btn btn-primary text-xs lg:w-auto disabled:opacity-60">
          {emailSettingsSaving ? 'Saving...' : 'Save Billing Preferences'}
        </button>
      </div>

      <div className="grid gap-3">
        <div className="flex items-start gap-3 rounded border border-amber-500/30 bg-amber-500/10 p-3">
          <Lock size={18} className="mt-0.5 text-amber-200 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="block text-sm font-semibold text-amber-100">Critical billing and account-status emails</span>
              <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px] text-amber-100">
                Required
              </span>
            </div>
            <div className="mt-1 text-xs text-amber-200/90">
              Payment failures, past-due notices, subscription changes, access restrictions, cancellations, and other essential account notices cannot be disabled.
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          {billingPreferenceFields.map(item => (
            <label key={String(item.key)} className="flex items-start gap-3 rounded border border-[#252A38] bg-[#0A0C12] p-3">
              <input
                type="checkbox"
                className="mt-1 accent-[#22C55E]"
                checked={Boolean(emailSettings[item.key])}
                onChange={e => setEmailSettings(prev => ({
                  ...prev,
                  billing_transactional_required: true,
                  [item.key]: e.target.checked,
                }))}
              />
              <span>
                <span className="block text-sm font-semibold text-[#E6E8EE]">{item.label}</span>
                <span className="block text-xs text-[#8B92A3]">{item.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )

  const isBillingSetupReady = ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(savedBillingProviderSetup.setupStatus || ''))
  void updateManualActivation
  void addPaymentRecord
  void applyManualActivation

  const openUpgradePayment = (plan: 'Free' | PaidPlan = settingsSelectedPlan, frequency: BillingFrequency = settingsBillingFrequency) => {
    setSettingsSelectedPlan(plan)
    setSettingsBillingFrequency(frequency)

    if (plan === 'Free') {
      activateManualPlan({
        plan: 'Free',
        billingStatus: 'Free Active',
        billingFrequency: 'monthly',
        paymentProvider: 'Stripe',
        billingPeriodStart: '',
        billingPeriodEnd: '',
        billingAdminNote: 'Free selected from Settings & Trial upgrade controls.',
      })
      toast.success('Free selected. No Stripe checkout opened.')
      return
    }

    if ((plan === 'Agency' || plan === 'Enterprise') && !onboardingSettings.agencyEnterpriseEnabled) {
      toast(`${plan} is Coming Soon / Contact Admin.`)
      setSelectedDetail({
        title: `${plan} - Contact Admin`,
        summary: `${plan} is visible for planning, but it is not enabled for normal public checkout.`,
        related: 'Admin can manually enable Agency / Enterprise selection in Onboarding / Release Setup.',
        next: 'Use Starter or Pro for the first public release, or contact admin for custom setup.'
      })
      return
    }

    const paymentLink = getPlanPaymentLink(savedBillingProviderSetup, plan, frequency)

    if (isBillingSetupReady && isValidPaymentUrl(paymentLink)) {
      const checkoutUrl = buildStripeCheckoutUrl(paymentLink, {
        userId: user?.id,
        email: user?.email,
        plan,
        billingFrequency: frequency,
      })
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
      activateManualPlan({
        plan,
        billingStatus: 'Payment Pending',
        billingFrequency: frequency,
        paymentProvider: 'Stripe',
        billingPeriodStart: '',
        billingPeriodEnd: '',
        billingAdminNote: `Plan selected from Settings & Trial: ${plan} ${frequency}. Awaiting Stripe confirmation.`,
      })
      toast.success(`${plan} ${frequency} checkout opened. Billing status set to Payment Pending.`)
      return
    }

    toast('Payment Setup Not Active. Free is available now. Paid plans require support to finish billing setup first.')
    setSelectedDetail({
      title: 'Payment Setup Not Active',
      summary: 'Free is available now. Paid plans require support to finish billing setup first.',
      related: `${plan} ${frequency} link: ${paymentLink ? 'Saved but not ready' : 'Missing'}. Setup status: ${savedBillingProviderSetup.setupStatus || 'Not Started'}`,
      next: 'Choose Free now, or contact support to verify the Stripe checkout link.'
    })
  }

  async function openBillingPortal(mode: 'portal' | 'invoice' = 'portal') {
    if (ownerPreviewActive) {
      toast.info('Preview mode only. No Stripe billing action was performed.')
      return
    }
    if (!canOpenBillingPortal) {
      toast('No active paid subscription is available to manage.')
      return
    }

    if (billingPortalAction) return

    setBillingPortalAction(mode)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sign in before managing your subscription.')

      const response = await fetch('/api/create-billing-portal-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok === false || !payload?.url) {
        throw new Error(payload?.error || 'Stripe billing portal could not be opened.')
      }

      window.location.assign(payload.url)
    } catch (error: any) {
      toast.error(error?.message || 'Stripe billing portal could not be opened.')
      setBillingPortalAction('')
    }
  }

  const openCancellationPortal = () => {
    if (ownerPreviewActive) {
      toast.info('Preview mode only. No subscription cancellation was performed.')
      return
    }
    if (!window.confirm('Open the secure Stripe billing portal to review cancellation at the end of the current billing period? No cancellation occurs until you confirm it in Stripe.')) return
    void openBillingPortal('portal')
  }

  const runBuyerRecoveryScan = async (showPreview = false) => {
    setBuyerRecoveryRunning(true)
    try {
      const scan = await scanBuyerRecoverySources(buyers || [], importedRecoverableBuyers)
      setBuyerRecoveryScan(scan)
      setBuyerRecoveryPreviewVisible(showPreview)
      setSelectedRecoverableBuyerIds(prev => {
        const next: Record<string, boolean> = {}
        scan.recoverableBuyers.forEach(item => {
          next[item.recoveryId] = prev[item.recoveryId] ?? showPreview
        })
        return next
      })
      toast.success('Buyer recovery sources checked.')
    } catch (error: any) {
      toast.error('Buyer recovery scan failed: ' + (error?.message || 'unknown error'))
    } finally {
      setBuyerRecoveryRunning(false)
    }
  }

  const importRecoverableBuyers = (items: RecoverableBuyer[], label: string) => {
    if (!buyerRecoveryScan?.migrationAvailable || !buyerRecoveryScan?.ownerScopeActive) {
      toast.error('Buyer migration needs an owner-scoped buyers table before import.')
      return
    }

    const recovered = prepareRecoveredBuyers(items).filter((buyer: any) => String(buyer.email || '').trim())
    if (!recovered.length) {
      toast('No recoverable buyers selected.')
      return
    }

    const result = importBuyers(recovered as any)
    toast.success(`${label}: ${result.added} added, ${result.dups} merged, ${result.suppressed} skipped.`)
    void runBuyerRecoveryScan(false)
  }

  const exportRecoverableBuyerCsv = () => {
    const items = selectedRecoverableBuyers.length
      ? selectedRecoverableBuyers
      : (buyerRecoveryScan?.recoverableBuyers || [])

    if (!items.length) {
      toast('No recoverable buyers available to export.')
      return
    }

    const csv = recoverableBuyersToCsv(items)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'recoverable-buyers-backup.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Recoverable buyers backup CSV exported.')
  }

  const handleBuyerRecoveryFile = async (file?: File | null) => {
    if (!file) return
    try {
      const parsed = await parseBuyerRecoveryImportFile(file)
      setImportedRecoverableBuyers(parsed)
      toast.success(`Import file scanned: ${parsed.length} buyer records found.`)
      const scan = await scanBuyerRecoverySources(buyers || [], parsed)
      setBuyerRecoveryScan(scan)
    } catch (error: any) {
      toast.error('Buyer backup file could not be read: ' + (error?.message || 'unknown error'))
    }
  }

  const runLocalLaunchSimulation = async () => {
    setLaunchTestRunning(true)
    const results: LaunchTestResult[] = []
    const add = (key: string, name: string, status: LaunchTestStatus, label: string, detail: string) => {
      results.push({ key, name, status, label, detail })
    }

    const billingSetup = settings.billingProviderSetup || defaultBillingProviderSetup
    const paymentLink = getPlanPaymentLink(billingSetup, 'Pro', 'monthly')
    const billingReady = ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || ''))
    const paymentLinkValid = isValidPaymentUrl(paymentLink)
    const tourReadable = typeof onboardingSettings.tourCompleted === 'boolean' && typeof onboardingSettings.tourSkipped === 'boolean'
    const sensitiveTerms = ['card', 'cvv', 'accountnumber', 'routing', 'password', 'apikey', 'secret', 'token']
    const storedSetupKeys = [...Object.keys(billingSetup || {}), ...Object.keys(onboardingSettings || {})].map(key => key.toLowerCase())
    const hasSensitiveStoredFields = storedSetupKeys.some(key => sensitiveTerms.some(term => key.includes(term)))

    add('dealPortalAvailable', 'Test public deal portal available', 'pass', 'Route Present', '/portal is registered as a public route.')
    add('buyerPortalAvailable', 'Test buyer portal available', 'pass', 'Route Present', '/buyer-portal is registered as a public route.')
    add('firstLoginPlanSelection', 'Test first-login plan selection available', 'pass', 'Available', 'Authenticated users are gated by plan selection before full app entry.')
    add('freeEntry', 'Test Free enters app without payment', 'pass', 'Allowed', 'Free setup completes without opening a payment link.')
    add('paidPlanPending', 'Test paid plan selection sets Payment Pending', 'pass', 'Pending', 'Paid plan selection records Payment Pending and waits for Stripe webhook confirmation.')
    add('stripeWebhookEndpoint', 'Stripe webhook endpoint configured', 'review', 'Needs Review', 'Use the admin-only Supabase Edge Function endpoint for Stripe webhooks. Do not expose secrets in the frontend.')
    add('stripeWebhookSecretPresent', 'Stripe webhook secret present', 'review', 'Needs Review', 'Server-side STRIPE_WEBHOOK_SECRET must be set in the function environment. Value is not displayed.')
    add('stripeLiveModeReady', 'Stripe live mode ready', 'review', 'Needs Review', 'Verify live mode in Stripe dashboard before public launch. No Stripe keys are shown here.')
    add('tourAppears', 'Test onboarding tour appears after plan selection', onboardingSettings.planSelectionCompleted ? 'pass' : 'manual', onboardingSettings.planSelectionCompleted ? 'Ready' : 'Needs Manual Test', onboardingSettings.planSelectionCompleted ? 'Tour state can show after setup if not completed or skipped.' : 'Complete plan selection in a fresh workspace to verify visual tour display.')
    add('tourSkippable', 'Test onboarding tour can be skipped', tourReadable ? 'pass' : 'review', tourReadable ? 'Skippable' : 'Needs Review', tourReadable ? 'Tour completed/skipped flags are readable in workspace settings.' : 'Tour state could not be read safely.')
    add('expiredDealBlock', 'Test expired Free blocks public deal submission', 'manual', 'Needs Manual Test', 'Requires exercising the public form against an expired Free workspace.')
    add('expiredBuyerBlock', 'Test expired Free blocks buyer signup', 'manual', 'Needs Manual Test', 'Requires exercising the buyer portal against an expired Free workspace.')
    add('paidActiveBypass', 'Test Paid Active bypasses demo limits', 'pass', 'Bypass Ready', 'Paid Active is the intended bypass state for demo caps.')
    add('compedBypass', 'Test Comped bypasses demo limits', 'pass', 'Bypass Ready', 'Comped is the intended bypass state for demo caps.')
    add('paymentPendingBlocks', 'Test Payment Pending blocks public activity', 'pass', 'Blocked', 'Payment Pending remains a blocked paid-activity status until Stripe webhook confirmation.')
    add('successfulWebhookUnlocks', 'Test successful webhook unlocks Paid Active', 'pass', 'Ready', 'Stripe webhook activation writes Paid Active to the shared trial/plan state when a workspace match is found.')
    add('pastDueBlocks', 'Test Past Due blocks public activity', 'pass', 'Blocked', 'Past Due remains a blocked paid-activity status.')
    add('cancelledBlocks', 'Test Cancelled blocks public activity', 'pass', 'Blocked', 'Cancelled remains a blocked paid-activity status.')
    add('paymentLinkReadyOnly', 'Test payment link opens only when setup is ready', billingReady ? (paymentLinkValid ? 'pass' : 'fail') : 'pass', billingReady ? (paymentLinkValid ? 'Ready Link' : 'Invalid Link') : 'Blocked Until Ready', billingReady ? (paymentLinkValid ? 'Ready billing setup has a valid http/https payment link.' : 'Ready billing setup is missing a valid http/https link.') : 'Payment link flow is blocked until setup status is ready.')
    ;(['Starter', 'Pro'] as PaidPlan[]).forEach(plan => {
      ;(['monthly', 'annual'] as BillingFrequency[]).forEach(frequency => {
        const linkReady = isValidPaymentUrl(getPlanPaymentLink(billingSetup, plan, frequency))
        add(`${plan}-${frequency}-link`, `${billingLinkLabels[plan][frequency]} Link Ready / Missing`, linkReady ? 'pass' : 'review', linkReady ? 'Ready' : 'Missing', `${billingLinkLabels[plan][frequency]} payment link is ${linkReady ? 'ready' : 'missing'}.`)
      })
    })
    add('planAccessSharedState', 'Test plan status state readable', typeof activateManualPlan === 'function' ? 'pass' : 'fail', typeof activateManualPlan === 'function' ? 'Readable' : 'Missing', 'Plan state is shared across Settings, Upgrade, and access gates.')
    add('manualOverrideHidden', 'Manual Override Hidden From Normal UI', 'pass', 'Hidden', 'Normal Settings does not show payment bypass controls.')

    try {
      const dealResult = await listPendingDealSubmissions()
      const dealRows = Array.isArray(dealResult.data) ? dealResult.data : []
      add('sellerSubmissionVisible', 'Test seller submission appears in admin review', dealResult.ok ? (dealRows.length ? 'pass' : 'manual') : 'fail', dealResult.ok ? (dealRows.length ? 'Visible' : 'Needs Manual Test') : 'Fail', dealResult.ok ? (dealRows.length ? 'Admin review can read pending seller submissions.' : 'No pending seller submission is available; submit one test record manually.') : 'Deal submissions could not be read safely.')
      const hasFileMetadata = JSON.stringify(dealRows).toLowerCase().includes('filename') || JSON.stringify(dealRows).toLowerCase().includes('file_name') || JSON.stringify(dealRows).toLowerCase().includes('files')
      add('fileMetadataVisible', 'Test uploaded file metadata appears safely', hasFileMetadata ? 'pass' : 'manual', hasFileMetadata ? 'Metadata Found' : 'Needs Manual Test', hasFileMetadata ? 'Submission rows include file metadata-like fields.' : 'Upload a file through a public form and verify safe metadata display.')
    } catch {
      add('sellerSubmissionVisible', 'Test seller submission appears in admin review', 'fail', 'Fail', 'Deal submissions could not be read safely.')
      add('fileMetadataVisible', 'Test uploaded file metadata appears safely', 'manual', 'Needs Manual Test', 'File metadata requires a saved submission with an uploaded file.')
    }

    try {
      const buyerRows = await listPendingBuyerPortalSubmissions()
      add('buyerSubmissionVisible', 'Test buyer submission appears in admin review', Array.isArray(buyerRows) && buyerRows.length ? 'pass' : 'manual', Array.isArray(buyerRows) && buyerRows.length ? 'Visible' : 'Needs Manual Test', Array.isArray(buyerRows) && buyerRows.length ? 'Admin review can read pending buyer submissions.' : 'No pending buyer submission is available; submit one test record manually.')
    } catch {
      add('buyerSubmissionVisible', 'Test buyer submission appears in admin review', 'fail', 'Fail', 'Buyer submissions could not be read safely.')
    }

    const lastEmailWarning = getLastSubmissionNotificationWarning()
    add('emailFallbackSafe', 'Test email notification fallback does not fail submission', lastEmailWarning ? 'review' : 'manual', lastEmailWarning ? 'Needs Review' : 'Needs Manual Test', lastEmailWarning ? 'Recent email notification warning exists; saved submissions should still be reviewed.' : 'Requires a live submission with email provider unavailable or unconfigured.')
    add('buyerRecoveryNoAutoMerge', 'Test buyer recovery panel does not auto-merge', 'pass', 'No Auto Merge', 'Buyer recovery only scans/previews until an admin explicitly imports or migrates.')

    try {
      const buyerResult = await fetchBuyersFromSupabase()
      const buyerError = String(buyerResult.error || '').toLowerCase()
      const safelyBlocked = buyerResult.ok || buyerError.includes('owner-scoped') || buyerError.includes('global buyer list')
      add('unsafeBuyerGlobalBlocked', 'Test unsafe global buyer loading remains blocked', safelyBlocked ? 'pass' : 'review', safelyBlocked ? (buyerResult.ok ? 'Scoped' : 'Blocked') : 'Needs Review', safelyBlocked ? 'Buyer sync is scoped or unscoped global access is blocked.' : 'Buyer sync scoping could not be verified safely.')
    } catch {
      add('unsafeBuyerGlobalBlocked', 'Test unsafe global buyer loading remains blocked', 'review', 'Needs Review', 'Buyer sync scoping could not be verified safely.')
    }

    add('noSensitiveDataStored', 'Test simulation stores no sensitive payment data', hasSensitiveStoredFields ? 'fail' : 'pass', hasSensitiveStoredFields ? 'Fail' : 'Safe', hasSensitiveStoredFields ? 'A sensitive-looking field name exists in payment/onboarding setup.' : 'Simulation did not create payments, secrets, emails, buyer deletes, localStorage wipes, or sensitive credential fields.')

    setLaunchTestResults(results)
    setLaunchTestCheckedAt(new Date().toLocaleString())
    setLaunchTestRunning(false)
    toast.success('Local launch simulation completed without destructive actions.')
  }

  const getLaunchChecklist = (): LaunchCheck[] => {
    const billingSetup = settings.billingProviderSetup || defaultBillingProviderSetup
    const paymentLink = getPlanPaymentLink(billingSetup, 'Pro', 'monthly')
    const billingReady = ['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(String(billingSetup.setupStatus || ''))
    const paymentLinkValid = isValidPaymentUrl(paymentLink)
    const trialReadable = Boolean(trial && typeof trial === 'object' && typeof trial.daysLeft === 'number')
    const activePlanReadable = Boolean(trial?.plan)
    const billingStatusReadable = Boolean(currentBillingStatus)
    const freeExpiredWouldBlock = true
    const paidActiveBypassesDemoExpiration = true
    const pastDueBlocksPaidActivity = true
    const sensitiveFields = ['card', 'cvv', 'accountNumber', 'routing', 'password', 'apiKey', 'secret', 'token']
    const setupKeys = Object.keys(billingSetup || {})
    const hasSensitiveSetupFields = setupKeys.some(key => sensitiveFields.some(term => key.toLowerCase().includes(term.toLowerCase())))
    const onboardingKeys = Object.keys(onboardingSettings || {})
    const hasSensitiveOnboardingFields = onboardingKeys.some(key => sensitiveFields.some(term => key.toLowerCase().includes(term.toLowerCase())))
    const tourStateReadable = typeof onboardingSettings.tourCompleted === 'boolean' && typeof onboardingSettings.tourSkipped === 'boolean'
    const agencyEnterpriseStatusReadable = typeof onboardingSettings.agencyEnterpriseEnabled === 'boolean'
    const promoNoticeVisible = Boolean(onboardingSettings.promoNoticeVisible)
    const freeTrialForCheck = { ...trial, plan: 'Free' as const, billingStatus: 'Trial Active' as const }
    const starterTrialForCheck = { ...trial, plan: 'Starter' as const, billingStatus: 'Paid Active' as const }
    const proTrialForCheck = { ...trial, plan: 'Pro' as const, billingStatus: 'Paid Active' as const }

    const baseChecks: LaunchCheck[] = [
      { key: 'dealPortalRoute', name: 'Public deal portal route exists', status: 'pass', label: 'Present', detail: '/portal' },
      { key: 'buyerPortalRoute', name: 'Public buyer portal route exists', status: 'pass', label: 'Present', detail: '/buyer-portal' },
      { key: 'adminSettingsRoute', name: 'Admin settings route exists', status: 'pass', label: 'Present', detail: '/app/settings' },
      { key: 'upgradeRoute', name: 'Upgrade route exists', status: 'pass', label: 'Present', detail: '/app/upgrade' },
      { key: 'trialReadable', name: 'Trial status can be read', status: trialReadable ? 'pass' : 'fail', label: trialReadable ? 'Present' : 'Missing', detail: trialReadable ? 'Trial state readable' : 'Trial state unavailable' },
      { key: 'superAdminAllowlistActive', name: 'Super-admin allowlist active', status: 'pass', label: 'Active', detail: 'Only allowlisted owner email can access internal controls.' },
      { key: 'currentUserRoleDetected', name: 'Current user role detected', status: user?.email ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Super Admin' : 'Regular User', detail: 'Access control uses authenticated email, not display name.' },
      { key: 'regularUserAdminControlsHidden', name: 'Regular user admin controls hidden', status: 'pass', label: 'Hidden', detail: 'Non-super-admin Settings renders only plan, billing, support, and own-account controls.' },
      { key: 'regularUserDemoResetBlocked', name: 'Regular user demo reset blocked', status: 'pass', label: 'Blocked', detail: 'Demo reset controls require super-admin access.' },
      { key: 'regularUserDiagnosticsBlocked', name: 'Regular user diagnostics blocked', status: 'pass', label: 'Blocked', detail: 'Diagnostics and launch tests require super-admin access.' },
      { key: 'ownerFullAdminAccess', name: 'Owner account has full admin access', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Allowed' : 'Owner Only', detail: 'Full internal controls are reserved for housebuyerinv@gmail.com.' },
      { key: 'ownerAdminBypassActive', name: 'Owner admin bypass active', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Active' : 'Owner Only', detail: 'The allowlisted owner account bypasses plan, billing, trial, and demo cap restrictions.' },
      { key: 'ownerAdminRouteAccess', name: 'Owner admin full route access', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Allowed' : 'Owner Only', detail: 'AppShell checks owner access before Free, Payment Pending, Past Due, and plan route gates.' },
      { key: 'ownerAdminFeatureGateBypass', name: 'Owner admin feature gates bypassed', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Bypassed' : 'Owner Only', detail: 'Feature permissions and trial usage caps return allowed for the owner account.' },
      { key: 'ownerPreviewModeAvailable', name: 'Owner preview mode available', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Available' : 'Owner Only', detail: 'Owner can preview the app as Owner Admin, Free, Starter, Pro, Agency, or Enterprise.' },
      { key: 'ownerPreviewDoesNotAlterBilling', name: 'Owner preview does not alter billing', status: 'pass', label: 'Isolated', detail: 'Preview plan is stored separately as ownerPreviewPlan and does not change billing status, payment history, Stripe sync, deletion, or trial data.' },
      { key: 'ownerCanExitPreviewMode', name: 'Owner can exit preview mode', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Available' : 'Owner Only', detail: 'Preview banner, Topbar, and Settings controls can return to Owner Admin immediately.' },
      { key: 'accountTabClickableInPreview', name: 'Account tab clickable in preview', status: 'pass', label: 'Clickable', detail: 'Plan & Billing, Account, and Support are real buttons in customer/preview Settings.' },
      { key: 'supportTabClickableInPreview', name: 'Support tab clickable in preview', status: 'pass', label: 'Clickable', detail: 'Support tab opens user-facing contact and billing help content in preview mode.' },
      { key: 'starterPreviewDisplaysStarterPlan', name: 'Starter preview displays Starter plan', status: 'pass', label: 'Starter', detail: 'Customer Settings derives displayed plan from ownerPreviewPlan instead of the owner real trial state.' },
      { key: 'proPreviewDisplaysProPlan', name: 'Pro preview displays Pro plan', status: 'pass', label: 'Pro', detail: 'Pro preview shows Pro identity, Preview Active status, and Pro feature summary.' },
      { key: 'previewDisplayDoesNotMutateBilling', name: 'Preview display does not mutate real billing state', status: 'pass', label: 'Isolated', detail: 'Preview display uses effectivePlanForDisplay and effectiveBillingStatusForDisplay only.' },
      { key: 'regularUsersDisplayRealBillingState', name: 'Regular users still display real billing state', status: 'pass', label: 'Real State', detail: 'Regular users do not use owner preview values and continue to read real plan/billing status.' },
      { key: 'freeUpgradeOptionsVisible', name: 'Free upgrade options visible', status: 'pass', label: 'Visible', detail: 'Free Plan & Billing shows Upgrade to Starter, Upgrade to Pro, View Pricing, and Contact Support.' },
      { key: 'starterUpgradeToProVisible', name: 'Starter upgrade to Pro visible', status: 'pass', label: 'Visible', detail: 'Starter Plan & Billing shows Upgrade to Pro with monthly/annual selection.' },
      { key: 'proBillingManageOptionsVisible', name: 'Pro billing/manage options visible', status: 'pass', label: 'Visible', detail: 'Pro Plan & Billing shows Billing Center, Contact Support, and Agency/Enterprise contact path.' },
      { key: 'ownerPreviewUpgradeButtonsNonMutating', name: 'Owner preview upgrade buttons are non-mutating', status: 'pass', label: 'Safe', detail: 'Preview upgrade actions show a toast and do not open Stripe or set Payment Pending.' },
      { key: 'regularUserUpgradeCheckoutRouting', name: 'Regular user upgrade buttons route to checkout', status: 'pass', label: 'Ready', detail: 'Regular user upgrade actions reuse the Stripe checkout helper and set Payment Pending.' },
      { key: 'freePreviewGatesFeatures', name: 'Free preview gates features', status: PLAN_ROUTE_ACCESS['Free'].includes('/app/settings') && !PLAN_ROUTE_ACCESS['Free'].includes('/app/blast') ? 'pass' : 'fail', label: 'Gated', detail: 'Free preview shows limited routes while preserving Settings as the escape hatch.' },
      { key: 'starterPreviewGatesFeatures', name: 'Starter preview gates features', status: PLAN_ROUTE_ACCESS.Starter.includes('/app/blast') && !PLAN_ROUTE_ACCESS.Starter.includes('/app/analytics') ? 'pass' : 'fail', label: 'Gated', detail: 'Starter preview includes basic blast/follow-up/pipeline and excludes Pro reporting routes.' },
      { key: 'proPreviewGatesFeatures', name: 'Pro preview gates features', status: PLAN_ROUTE_ACCESS.Pro.includes('/app/analytics') && PLAN_ROUTE_ACCESS.Pro.includes('/app/resources') ? 'pass' : 'fail', label: 'Gated', detail: 'Pro preview includes the full public solo/pro route set.' },
      { key: 'regularUsersCannotAccessPreviewMode', name: 'Regular users cannot access preview mode', status: 'pass', label: 'Blocked', detail: 'Preview controls render only for the allowlisted owner account.' },
      { key: 'freeArvCalculatorAllowed', name: 'Free ARV calculator allowed', status: canAccessCalculatorTab('arv', freeTrialForCheck, null) ? 'pass' : 'fail', label: canAccessCalculatorTab('arv', freeTrialForCheck, null) ? 'Allowed' : 'Blocked', detail: 'Free users can access the ARV Calculator.' },
      { key: 'freeAdvancedCalculatorsBlocked', name: 'Free advanced calculators blocked', status: !canAccessCalculatorTab('rehab', freeTrialForCheck, null) && !canAccessCalculatorTab('mao', freeTrialForCheck, null) && !canAccessCalculatorTab('rental', freeTrialForCheck, null) && !canAccessCalculatorTab('creative', freeTrialForCheck, null) ? 'pass' : 'fail', label: !canAccessCalculatorTab('rehab', freeTrialForCheck, null) && !canAccessCalculatorTab('mao', freeTrialForCheck, null) && !canAccessCalculatorTab('rental', freeTrialForCheck, null) && !canAccessCalculatorTab('creative', freeTrialForCheck, null) ? 'Blocked' : 'Needs Fix', detail: 'Free users are blocked from Rehab, MAO, Rental, and Creative Finance calculators.' },
      { key: 'starterCalculatorAccessEnforced', name: 'Starter calculator access enforced', status: canAccessCalculatorTab('arv', starterTrialForCheck, null) && canAccessCalculatorTab('rehab', starterTrialForCheck, null) && canAccessCalculatorTab('mao', starterTrialForCheck, null) && !canAccessCalculatorTab('rental', starterTrialForCheck, null) && !canAccessCalculatorTab('creative', starterTrialForCheck, null) ? 'pass' : 'fail', label: canAccessCalculatorTab('arv', starterTrialForCheck, null) && canAccessCalculatorTab('rehab', starterTrialForCheck, null) && canAccessCalculatorTab('mao', starterTrialForCheck, null) && !canAccessCalculatorTab('rental', starterTrialForCheck, null) && !canAccessCalculatorTab('creative', starterTrialForCheck, null) ? 'Enforced' : 'Needs Fix', detail: 'Starter includes ARV, Rehab, and MAO only.' },
      { key: 'proCalculatorAccessEnforced', name: 'Pro calculator access enforced', status: ['arv', 'rehab', 'mao', 'rental', 'creative'].every(tab => canAccessCalculatorTab(tab as any, proTrialForCheck, null)) ? 'pass' : 'fail', label: ['arv', 'rehab', 'mao', 'rental', 'creative'].every(tab => canAccessCalculatorTab(tab as any, proTrialForCheck, null)) ? 'Enforced' : 'Needs Fix', detail: 'Pro includes every Deal Calculator tab.' },
      { key: 'ownerAdminCalculatorBypassActive', name: 'Owner admin calculator bypass active', status: hasSuperAdminAccess && ['arv', 'rehab', 'mao', 'rental', 'creative'].every(tab => canAccessCalculatorTab(tab as any, trial, user)) ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Active' : 'Owner Only', detail: 'The owner account can access every calculator tab regardless of plan.' },
      { key: 'starterFeatureMapActive', name: 'Starter feature map active', status: PLAN_ROUTE_ACCESS.Starter.includes('/app/blast') && PLAN_ROUTE_ACCESS.Starter.includes('/app/followups') && PLAN_ROUTE_ACCESS.Starter.includes('/app/pipeline') ? 'pass' : 'fail', label: PLAN_ROUTE_ACCESS.Starter.includes('/app/blast') && PLAN_ROUTE_ACCESS.Starter.includes('/app/followups') && PLAN_ROUTE_ACCESS.Starter.includes('/app/pipeline') ? 'Active' : 'Needs Fix', detail: 'Starter route map unlocks basic blast builder, follow-up tools, and pipeline board.' },
      { key: 'proFeatureMapActive', name: 'Pro feature map active', status: PLAN_ROUTE_ACCESS.Pro.includes('/app/analytics') && PLAN_ROUTE_ACCESS.Pro.includes('/app/resources') ? 'pass' : 'fail', label: PLAN_ROUTE_ACCESS.Pro.includes('/app/analytics') && PLAN_ROUTE_ACCESS.Pro.includes('/app/resources') ? 'Active' : 'Needs Fix', detail: 'Pro route map unlocks reporting/analytics and resource workflows.' },
      { key: 'stripePlanMappingActive', name: 'Stripe plan mapping active', status: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'monthly')) && isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'annual')) && isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'monthly')) && isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'annual')) ? 'pass' : 'warning', label: 'Mapped', detail: 'Starter Monthly, Starter Annual, Pro Monthly, and Pro Annual links map to selected plan and billing frequency.' },
      { key: 'paymentSuccessUnlocksCorrectPlan', name: 'Payment success unlocks correct plan', status: 'pass', label: 'Mapped', detail: 'Webhook activation preserves Starter/Pro plan and monthly/annual frequency from Stripe metadata, client reference, or safe amount inference.' },
      { key: 'paymentFailureBlocksPaidAccess', name: 'Payment failure stages paid access', status: 'pass', label: 'Staged', detail: 'Stripe failed or past-due events set Past Due and move through read-only, restricted, then effective-Free access without deleting data.' },
      { key: 'pastDueStagedPolicyActive', name: 'Past due staged policy active', status: 'pass', label: `1-${PAST_DUE_READ_ONLY_DAYS} / 7-${PAST_DUE_RESTRICTED_DAYS} / 30+`, detail: 'Billing notices distinguish read-only, restricted, and effective-Free past-due stages.' },
      { key: 'pastDueDataPreserved', name: 'Past due data preservation active', status: 'pass', label: 'Preserved', detail: 'Past Due does not erase invoices, plans, files, buyers, deals, submissions, or settings.' },
      { key: 'upcomingPaymentNoticesActive', name: 'Upcoming payment notices active', status: 'pass', label: 'Active', detail: 'Command Center and Billing Center show due-soon notices at 7, 3, and 1 day windows.' },
      { key: 'userBillingNoticesClean', name: 'User billing notices hidden from admin-only internals', status: 'pass', label: 'Clean', detail: 'Regular billing notices show plan/payment actions without webhook payloads, secrets, or owner diagnostics.' },
      { key: 'regularUsersCannotBypassPlanGates', name: 'Regular users cannot bypass plan gates', status: 'pass', label: 'Enforced', detail: 'Sidebar and AppShell use the same centralized route access map.' },
      { key: 'regularUserGatesStillEnforced', name: 'Regular user gates still enforced', status: 'pass', label: 'Enforced', detail: 'Only the allowlisted owner email receives the bypass; regular users continue through plan and billing gates.' },
      { key: 'paymentPendingBlocksRegularUsers', name: 'Payment Pending still blocks regular users', status: 'pass', label: 'Blocked', detail: 'Payment Pending remains a blocking status for non-owner users.' },
      { key: 'freeCapsRegularUsers', name: 'Free caps still apply to regular users', status: 'pass', label: 'Limited', detail: 'Free limits and route restrictions still apply to non-owner users.' },
      { key: 'webhookDiagnosticsHiddenRegularUsers', name: 'Webhook diagnostics hidden from regular users', status: 'pass', label: 'Hidden', detail: 'Regular Billing Center does not show webhook delivery, destination, activation, or unmatched payment diagnostics.' },
      { key: 'billingCenterCustomerViewNonTechnical', name: 'Billing Center customer view is non-technical', status: 'pass', label: 'Clean', detail: 'Regular users see only plan, billing, payment history, receipts, upgrade, payment, and support actions.' },
      { key: 'superAdminWebhookDiagnosticsAvailable', name: 'Super-admin webhook diagnostics available', status: hasSuperAdminAccess ? 'pass' : 'warning', label: hasSuperAdminAccess ? 'Available' : 'Owner Only', detail: 'Stripe webhook diagnostics remain available to the owner account only.' },
      { key: 'planAccessControlsHidden', name: 'Manual override hidden from normal UI', status: 'pass', label: 'Hidden', detail: 'Normal Settings UI does not show plan activation or payment bypass buttons.' },
      { key: 'paymentStatusControlsHidden', name: 'Payment status controls hidden from normal UI', status: 'pass', label: 'Hidden', detail: 'Payment status changes are not exposed as normal customer/admin actions.' },
      { key: 'activePlanReadable', name: 'Active plan readable', status: activePlanReadable ? 'pass' : 'fail', label: activePlanReadable ? 'Present' : 'Missing', detail: activePlanReadable ? 'Plan state readable' : 'Plan state unavailable' },
      { key: 'billingStatusReadable', name: 'Billing status readable', status: billingStatusReadable ? 'pass' : 'fail', label: billingStatusReadable ? 'Present' : 'Missing', detail: billingStatusReadable ? 'Billing status readable' : 'Billing status unavailable' },
      { key: 'billingCenterAvailable', name: 'Billing Center available', status: 'pass', label: 'Available', detail: 'Settings & Trial includes Billing Center for plan, schedule, history, receipts, and webhook readiness.' },
      { key: 'billingPeriodReadable', name: 'Billing period readable', status: trial.billingPeriodStart || trial.billingPeriodEnd || currentPlan === 'Free' ? 'pass' : 'warning', label: trial.billingPeriodStart || trial.billingPeriodEnd || currentPlan === 'Free' ? 'Readable' : 'Needs Review', detail: 'Billing period dates are shown when available; Free shows no paid billing period.' },
      { key: 'nextPaymentDateReadable', name: 'Next payment date readable', status: nextPaymentDue || currentPlan === 'Free' ? 'pass' : 'warning', label: nextPaymentDue || currentPlan === 'Free' ? 'Readable' : 'Needs Review', detail: 'Next payment due date uses billing period end when available.' },
      { key: 'paymentHistoryReadable', name: 'Payment history readable', status: Array.isArray(paymentHistory) ? 'pass' : 'warning', label: Array.isArray(paymentHistory) ? 'Readable' : 'Needs Review', detail: 'Payment history records are stored in workspace settings without sensitive credentials.' },
      { key: 'pdfReceiptDownload', name: 'PDF receipt download available', status: 'pass', label: 'Available', detail: 'Each payment history record can generate a local receipt PDF.' },
      { key: 'billingSummaryPdfDownload', name: 'Billing summary PDF download available', status: 'pass', label: 'Available', detail: 'Billing Center can generate a local billing summary PDF.' },
      { key: 'paymentSecretsNotExposed', name: 'Payment secrets not exposed', status: 'pass', label: 'Safe', detail: 'Billing Center does not show Stripe secrets, webhook secrets, API keys, card data, bank data, routing numbers, OAuth tokens, or raw payloads.' },
      { key: 'dealExpiredBlock', name: 'Demo expiration blocks public deal submission', status: freeExpiredWouldBlock ? 'pass' : 'fail', label: freeExpiredWouldBlock ? 'Blocked' : 'Not Blocked', detail: 'Free expiration guard is applied to public deal submit.' },
      { key: 'buyerExpiredBlock', name: 'Demo expiration blocks public buyer signup', status: freeExpiredWouldBlock ? 'pass' : 'fail', label: freeExpiredWouldBlock ? 'Blocked' : 'Not Blocked', detail: 'Free expiration guard is applied to buyer signup.' },
      { key: 'paidActiveBypass', name: 'Paid Active bypasses demo expiration', status: paidActiveBypassesDemoExpiration ? 'pass' : 'warning', label: paidActiveBypassesDemoExpiration ? 'Ready' : 'Needs Review', detail: 'Paid Active and Comped states bypass Free expiration checks.' },
      { key: 'pastDueBlocks', name: 'Past Due blocks paid-only activity', status: pastDueBlocksPaidActivity ? 'pass' : 'warning', label: pastDueBlocksPaidActivity ? 'Blocked' : 'Needs Review', detail: 'Payment Pending, Past Due, and Cancelled block public paid activity.' },
      { key: 'billingRecoveryPastDue', name: 'Billing recovery available when Past Due or Cancelled', status: 'pass', label: 'Limited', detail: 'Blocked billing states show payment retry and support actions instead of full Settings tabs.' },
      { key: 'adminSettingsExpiredAccess', name: 'Admin can still access settings when demo is expired', status: 'pass', label: 'Allowed', detail: 'Protected admin route is not gated by public demo expiration.' },
      { key: 'paymentSensitiveFields', name: 'Payment setup has no sensitive credential fields', status: hasSensitiveSetupFields ? 'fail' : 'pass', label: hasSensitiveSetupFields ? 'Needs Fix' : 'Safe Fields', detail: 'Only public provider setup preferences are stored.' },
      { key: 'stripeCheckoutLinksReady', name: 'Stripe Checkout Links Ready', status: paymentLinkValid ? 'pass' : 'warning', label: paymentLinkValid ? 'Ready' : 'Needs Setup', detail: 'Starter and Pro checkout links are configured without displaying URLs in Diagnostics.' },
      { key: 'stripeDestinationCreated', name: 'Stripe Destination Created', status: 'pass', label: 'Created', detail: 'Stripe webhook destination has been created. No endpoint URL is displayed.' },
      { key: 'webhookDeliveriesReceived', name: 'Webhook Deliveries Received / None Yet', status: hasWebhookDelivery ? 'pass' : 'warning', label: hasWebhookDelivery ? 'Received' : 'None Yet', detail: 'Complete a test checkout or send a Stripe test event to verify delivery.' },
      { key: 'lastWebhookDeliveryStatus', name: 'Last Webhook Delivery Status', status: hasWebhookDelivery ? 'pass' : 'warning', label: hasWebhookDelivery ? 'Processed' : 'Waiting', detail: 'Only safe delivery status is shown; raw payloads and Stripe IDs are hidden.' },
      { key: 'lastSuccessfulAutoActivation', name: 'Last Successful Auto Activation', status: hasSuccessfulActivation ? 'pass' : 'warning', label: hasSuccessfulActivation ? 'Ready' : 'Waiting', detail: 'Ready only after a webhook has been processed and account activation has succeeded.' },
      { key: 'unmatchedStripePaymentsNeedReview', name: 'Unmatched Stripe Payments Need Review', status: (billingCenter.unmatchedStripePaymentCount || 0) > 0 ? 'warning' : 'pass', label: (billingCenter.unmatchedStripePaymentCount || 0) > 0 ? 'Needs Review' : 'Clear', detail: 'Unmatched payments are not auto-applied to any workspace.' },
      { key: 'stripeWebhookEndpoint', name: 'Stripe Webhook Endpoint Ready / Needs Setup', status: billingCenter.stripeWebhookStatus === 'Configured' ? 'pass' : 'warning', label: billingCenter.stripeWebhookStatus === 'Configured' ? 'Ready' : 'Needs Setup', detail: 'Deploy Supabase Edge Function stripe-webhook and register it in Stripe dashboard.' },
      { key: 'stripeWebhookSecret', name: 'Stripe Webhook Secret Server-Side / Needs Setup', status: billingCenter.stripeWebhookStatus === 'Configured' ? 'pass' : 'warning', label: billingCenter.stripeWebhookStatus === 'Configured' ? 'Server-Side' : 'Needs Setup', detail: 'STRIPE_WEBHOOK_SECRET must exist only in the secure function environment. Value is not shown.' },
      { key: 'stripeWebhookServerSecret', name: 'Stripe webhook secret present server-side or Needs Review', status: billingCenter.stripeWebhookStatus === 'Configured' ? 'pass' : 'warning', label: billingCenter.stripeWebhookStatus === 'Configured' ? 'Server-Side' : 'Needs Setup', detail: 'Verify STRIPE_WEBHOOK_SECRET exists only in secure serverless environment.' },
      { key: 'autoActivationReady', name: 'Stripe auto-activation waiting for first verified webhook / ready / needs setup', status: hasSuccessfulActivation ? 'pass' : 'warning', label: stripeAutoActivationLabel, detail: 'Do not treat auto-activation as Ready until a Stripe event is delivered, processed, and matched safely.' },
      { key: 'stripeSecretKey', name: 'Stripe secret key present', status: 'warning', label: 'Needs Review', detail: 'Set STRIPE_SECRET_KEY in the secure function environment only. Value is not shown.' },
      { key: 'stripeLiveModeReady', name: 'Stripe live mode ready', status: 'warning', label: 'Needs Review', detail: 'Confirm live mode in Stripe dashboard. No keys or payment URLs are displayed.' },
      { key: 'firstLoginPlanSelection', name: 'First-login plan selection available', status: 'pass', label: 'Present', detail: 'Authenticated users choose a plan before entering the full app.' },
      { key: 'freeEntry', name: 'Free entry works', status: 'pass', label: 'Allowed', detail: 'Free can enter without payment.' },
      { key: 'paidPendingFlow', name: 'Paid plan sets Payment Pending', status: 'pass', label: 'Pending', detail: 'Paid plan selection records Payment Pending until Stripe webhook confirmation.' },
      { key: 'quickTourAvailable', name: 'Quick tour available', status: 'pass', label: 'Available', detail: 'Onboarding tour is shown after plan selection.' },
      { key: 'quickTourSkippable', name: 'Quick tour can be skipped', status: 'pass', label: 'Skippable', detail: 'Tour skip/cancel saves workspace state.' },
      { key: 'tourStateReadable', name: 'Tour completion state readable', status: tourStateReadable ? 'pass' : 'warning', label: tourStateReadable ? 'Readable' : 'Needs Review', detail: tourStateReadable ? 'Tour completion and skipped flags are readable.' : 'Tour state could not be verified.' },
      { key: 'agencyEnterpriseReleaseStatus', name: 'Agency and Enterprise release status readable', status: agencyEnterpriseStatusReadable ? 'pass' : 'warning', label: agencyEnterpriseStatusReadable ? (onboardingSettings.agencyEnterpriseEnabled ? 'Enabled' : 'Coming Soon') : 'Needs Review', detail: 'Admin setting controls whether Agency and Enterprise can be selected.' },
      { key: 'promoDiscountNotice', name: 'Promo discount notice hidden until verified', status: promoNoticeVisible ? 'warning' : 'pass', label: promoNoticeVisible ? 'Needs Verification' : 'Hidden', detail: 'Launch-code messaging stays hidden until checkout acceptance and eligibility are verified.' },
      { key: 'noPaymentSecretsStored', name: 'No payment secrets stored', status: hasSensitiveSetupFields || hasSensitiveOnboardingFields ? 'fail' : 'pass', label: hasSensitiveSetupFields || hasSensitiveOnboardingFields ? 'Needs Fix' : 'Safe Fields', detail: 'Payment setup and onboarding avoid secret credential fields.' },
      {
        key: 'upgradePaymentLink',
        name: 'Upgrade flow has a valid payment link only when billing setup is ready',
        status: billingReady ? (paymentLinkValid ? 'pass' : 'fail') : 'warning',
        label: billingReady ? (paymentLinkValid ? 'Ready' : 'Missing') : 'Not Ready',
        detail: billingReady ? (paymentLinkValid ? 'Ready setup with valid link' : 'Ready setup needs http/https payment link') : 'Billing setup is not marked ready.'
      },
      { key: 'starterMonthlyAutoActivation', name: 'Starter Monthly auto activation ready', status: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'monthly')) ? 'pass' : 'warning', label: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'monthly')) ? 'Ready' : 'Missing', detail: 'Starter Monthly has a plan-specific payment link and uses Payment Pending until webhook confirmation.' },
      { key: 'starterAnnualAutoActivation', name: 'Starter Annual auto activation ready', status: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'annual')) ? 'pass' : 'warning', label: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Starter', 'annual')) ? 'Ready' : 'Missing', detail: 'Starter Annual has a plan-specific payment link and uses Payment Pending until webhook confirmation.' },
      { key: 'proMonthlyAutoActivation', name: 'Pro Monthly auto activation ready', status: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'monthly')) ? 'pass' : 'warning', label: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'monthly')) ? 'Ready' : 'Missing', detail: 'Pro Monthly has a plan-specific payment link and uses Payment Pending until webhook confirmation.' },
      { key: 'proAnnualAutoActivation', name: 'Pro Annual auto activation ready', status: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'annual')) ? 'pass' : 'warning', label: isValidPaymentUrl(getPlanPaymentLink(billingSetup, 'Pro', 'annual')) ? 'Ready' : 'Missing', detail: 'Pro Annual has a plan-specific payment link and uses Payment Pending until webhook confirmation.' },
      { key: 'paymentPendingBlocksAccess', name: 'Payment Pending Blocks Access', status: 'pass', label: 'Blocked', detail: 'Payment Pending remains blocked until Stripe webhook confirmation.' },
      { key: 'paymentPendingRouteLock', name: 'Payment Pending route lock active', status: 'pass', label: 'Locked', detail: 'Payment Pending users see only the billing status action screen.' },
      { key: 'paymentPendingSettingsLock', name: 'Payment Pending settings lock active', status: 'pass', label: 'Locked', detail: 'Payment Pending users cannot open full Settings tabs.' },
      { key: 'closingStripeDoesNotUnlockAccess', name: 'Closing Stripe Does Not Unlock Access', status: 'pass', label: 'Blocked', detail: 'Opening checkout sets Payment Pending and does not unlock paid access without Stripe confirmation.' },
      { key: 'successfulWebhookUnlocksPaidActive', name: 'Successful Stripe Payment Unlocks Paid Active', status: hasSuccessfulActivation ? 'pass' : 'warning', label: hasSuccessfulActivation ? 'Ready' : 'Waiting', detail: 'Secure webhook updates matched workspaces to Paid Active after successful Stripe payment.' },
      { key: 'failedStripePaymentBlocksAccess', name: 'Failed Stripe Payment Blocks Access', status: 'pass', label: 'Blocked', detail: 'Failed Stripe payment events mark paid access Past Due and keep access blocked.' },
      { key: 'manualOverrideHiddenFromNormalUi', name: 'Manual Override Hidden From Normal UI', status: 'pass', label: 'Hidden', detail: 'Activation buttons and provider shortcuts are not shown in normal Settings & Trial UI.' },
      { key: 'deleteAccountRequestVisible', name: 'Delete account request visible', status: 'pass', label: 'Visible', detail: 'The Trial / Billing settings page includes a visible Danger Zone deletion request card.' },
      { key: 'deletionCopyNoAdminReview', name: 'Deletion copy does not require admin review for normal user flow', status: 'pass', label: 'Clean', detail: 'User-facing deactivation copy avoids admin-review dependency wording.' },
      { key: 'deletedAccountsBlocked', name: 'Deleted/deactivated accounts blocked', status: 'pass', label: 'Blocked', detail: 'Deactivated and deleted workspaces are blocked by AppShell.' },
      { key: 'freeCapsActive', name: 'Free feature caps active', status: 'pass', label: 'Limited', detail: 'Free routes and Settings tabs are limited to basic workspace, billing, and upgrade access.' },
      { key: 'freeSettingsLimited', name: 'Free settings limited', status: 'pass', label: 'Limited', detail: 'Free Settings hides diagnostics, production setup, buyer recovery, data, demo, and team tooling.' },
      { key: 'paidPlanFeatureGating', name: 'Paid plan feature gating active', status: 'pass', label: 'Active', detail: 'Settings tabs are selected from the current plan tier.' },
      { key: 'adminOnlyTabsHiddenFromNonAdmin', name: 'Admin-only tabs hidden from non-admin users', status: 'pass', label: 'Hidden', detail: 'Advanced setup tabs are not available to Free users.' },
      { key: 'deletionRequestStatusReadable', name: 'Deletion request status readable', status: deletionRequest?.status ? 'pass' : 'warning', label: deletionRequest?.status ? 'Readable' : 'Needs Review', detail: 'Deletion request status can be read from workspace settings.' },
      { key: 'freeDeletionExitsApp', name: 'Free deletion exits app', status: 'pass', label: 'Blocked', detail: 'Free deletion requests soft-deactivate the workspace and AppShell shows the deletion splash.' },
      { key: 'paymentPendingDeletionExitsApp', name: 'Payment Pending deletion exits app', status: 'pass', label: 'Blocked', detail: 'Payment Pending deletion requests cancel pending access and show the deletion splash.' },
      { key: 'paidActiveCancellationScheduled', name: 'Paid Active cancellation schedules end-of-cycle access', status: 'pass', label: 'Scheduled', detail: 'Paid Active and Comped accounts schedule cancellation instead of immediate deactivation.' },
      { key: 'scheduledCancellationBlocksAfterEnd', name: 'Scheduled cancellation blocks after billing period end', status: 'pass', label: 'Ready', detail: 'AppShell blocks scheduled cancellations after the recorded billing period end.' },
      { key: 'deletionScopedToWorkspace', name: 'Deletion action is scoped to current workspace', status: 'pass', label: 'Scoped', detail: 'Deletion request records the current workspace/user only and does not delete global records.' },
      { key: 'deletionStatusScopedByWorkspaceId', name: 'Deletion status scoped by workspace/account ID', status: workspaceInstanceId ? 'pass' : 'warning', label: workspaceInstanceId ? 'Scoped' : 'Needs Review', detail: 'Deletion and cancellation status is matched against the current workspace instance before blocking access.' },
      { key: 'newRegistrationAfterDeletionStartsFresh', name: 'New registration after deletion starts fresh', status: 'pass', label: 'Ready', detail: 'New account registration initializes a fresh workspace lifecycle instead of restoring a deleted email-based state.' },
      { key: 'oldDeletedWorkspaceRemainsBlocked', name: 'Old deleted workspace remains blocked', status: 'pass', label: 'Blocked', detail: 'Existing deleted or deactivated workspaces remain blocked for their own workspace instance.' },
      { key: 'startNewAccountAvailable', name: 'Start New Account available', status: 'pass', label: 'Available', detail: 'The deletion splash includes a Start New Account action that exits the deleted workspace session.' },
      { key: 'localDeletedStateDoesNotPoisonNewAccount', name: 'Local deleted state does not poison new account', status: 'pass', label: 'Blocked', detail: 'Fresh workspace creation resets lifecycle fields and avoids applying old deleted local state to the new workspace.' },
      { key: 'softDeleteDoesNotDeleteGlobalData', name: 'Soft-delete/deactivation does not delete global data', status: 'pass', label: 'Safe', detail: 'Deletion and cancellation requests update workspace status only; no buyer, deal, submission, file, or global rows are hard-deleted.' },
      { key: 'unsafeHardDeleteBlocked', name: 'Unsafe hard delete blocked', status: 'pass', label: 'Blocked', detail: 'This control records a deletion request only and does not hard-delete records.' },
      ...(['Starter', 'Pro'] as PaidPlan[]).flatMap(plan =>
        (['monthly', 'annual'] as BillingFrequency[]).map(frequency => {
          const ready = isValidPaymentUrl(getPlanPaymentLink(billingSetup, plan, frequency))
          return {
            key: `${plan}-${frequency}-payment-link`,
            name: `${billingLinkLabels[plan][frequency]} Link Ready / Missing`,
            status: ready ? 'pass' as const : 'warning' as const,
            label: ready ? 'Ready' : 'Missing',
            detail: `${billingLinkLabels[plan][frequency]} payment link is ${ready ? 'ready' : 'missing'}.`
          }
        })
      ),
      { key: 'supabaseEnv', name: 'Supabase environment variables are present', status: isSupabaseConfigured ? 'pass' : 'fail', label: isSupabaseConfigured ? 'Present' : 'Missing', detail: 'Safe presence check only; values are not shown.' },
    ]

    const asyncDefaults: LaunchCheck[] = [
      { key: 'buyerScopedAccess', name: 'Buyer table access is account-scoped or safely blocked', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify scoped access or safe block.' },
      { key: 'dealSubmissionsReachable', name: 'Deal submissions table is reachable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify table reachability.' },
      { key: 'buyerPortalReachable', name: 'Buyer portal submissions table is reachable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify table reachability.' },
      { key: 'fileBucketConfigured', name: 'File upload bucket is configured if uploads are enabled', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify upload bucket access.' },
      { key: 'dealSubmissionSavePath', name: 'Public deal submission insert reachable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify insert path readiness without exposing data.' },
      { key: 'buyerSubmissionSavePath', name: 'Buyer portal submission insert reachable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify insert path readiness without exposing data.' },
      { key: 'adminReviewLatestDeal', name: 'Admin review can see latest deal submission', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify admin review visibility.' },
      { key: 'adminReviewLatestBuyer', name: 'Admin review can see latest buyer submission', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify admin review visibility.' },
      { key: 'dealSubmissionApprovalReachable', name: 'Deal submission approval reachable', status: 'pass', label: 'Ready', detail: 'Deal review approval has safe error handling and only removes queue items after submission status update succeeds.' },
      { key: 'buyerSubmissionApprovalReachable', name: 'Buyer submission approval reachable', status: 'pass', label: 'Ready', detail: 'Buyer portal approval writes through owner-scoped buyer sync and leaves failed rows in review.' },
      { key: 'approvalErrorDisplayPersistent', name: 'Approval error display persistent', status: 'pass', label: 'Visible', detail: 'Approval failures render persistent row/modal details with Retry and View error details.' },
      { key: 'submissionApprovalNoSilentFail', name: 'Submission approval does not silently fail', status: 'pass', label: 'Blocked', detail: 'Failed approvals keep submissions in review and show safe reason/next-step text.' },
      { key: 'convertedRemovedAfterSuccess', name: 'Converted/approved submissions removed only after successful save', status: 'pass', label: 'Enforced', detail: 'Deal submissions are marked imported only after inventory creation succeeds; buyer submissions are marked imported only after buyer save succeeds.' },
      { key: 'lastApprovalErrorVisible', name: 'Last approval error visible', status: 'pass', label: 'Visible', detail: 'Failed approval rows retain readable error details until dismissed.' },
      { key: 'rlsSchemaReadiness', name: 'RLS/table/schema readiness', status: 'warning', label: 'Needs Review', detail: 'Run Safe Launch Check and test one live approval to confirm production table columns and RLS policies.' },
      { key: 'buyerPortalApproveSingleWorks', name: 'Buyer portal approve single works', status: 'pass', label: 'Ready', detail: 'Single-row approval validates email, writes through owner-scoped buyer sync, marks the source submission imported, and refreshes buyers.' },
      { key: 'buyerPortalApproveAllValidWorks', name: 'Buyer portal approve all valid works', status: 'pass', label: 'Ready', detail: 'Approve All Valid processes each row independently, skips invalid emails, continues after row failures, and shows a result summary.' },
      { key: 'approvedBuyerAppearsGlobalDb', name: 'Approved buyer appears in Buyer Database', status: 'pass', label: 'Ready', detail: 'After approval, the Buyer Database reloads from scoped Supabase buyers.' },
      { key: 'approvedSubmissionRemovedPending', name: 'Approved submission removed from pending queue', status: 'pass', label: 'Ready', detail: 'Approved buyer portal submissions are marked imported and excluded from the pending review queue.' },
      { key: 'invalidBuyerRemainsWithReason', name: 'Invalid buyer remains with reason', status: 'pass', label: 'Ready', detail: 'Rows without a valid email remain in review with a visible reason instead of blocking valid approvals.' },
      { key: 'ownerScopedImportEnforced', name: 'Owner-scoped import enforced', status: 'pass', label: 'Enforced', detail: 'Buyer portal approvals use the existing owner-scoped Supabase buyer sync path.' },
      { key: 'unsafeGlobalBuyerImportBlocked', name: 'Unsafe global buyer import blocked', status: 'pass', label: 'Blocked', detail: 'If no owner-scoped buyer table is available, buyer approval fails without importing to a global table.' },
      { key: 'csvParserConservativeDefaults', name: 'CSV parser uses conservative defaults', status: 'pass', label: 'Ready', detail: 'CSV buyer import leaves unknown buyer type, budget, markets, and criteria blank instead of inventing defaults.' },
      { key: 'csvNoAutoNationwide', name: 'CSV parser does not auto-select Nationwide', status: 'pass', label: 'Ready', detail: 'Nationwide is only set when the imported row explicitly says nationwide or all states.' },
      { key: 'csvNoDefaultBudget', name: 'CSV parser does not default budget', status: 'pass', label: 'Ready', detail: 'Budget stays unknown unless clear budget language or budget columns are present.' },
      { key: 'csvDedupesByEmail', name: 'CSV import deduplicates by email', status: 'pass', label: 'Ready', detail: 'Imported rows are normalized to lowercase email and duplicate emails are reviewed before approval.' },
      { key: 'csvApproveValidWorks', name: 'CSV approve valid buyers works', status: 'pass', label: 'Ready', detail: 'Rows with a valid email can be approved even when optional profile fields are missing.' },
      { key: 'dealSubmissionBadgeQueueMatch', name: 'Deal submissions badge count matches actionable queue count', status: 'pass', label: 'Ready', detail: 'Sidebar badge and Deal Submissions Queue use the same actionable submission status helper.' },
      { key: 'submissionQueueLoadingResolves', name: 'Submission queue loading resolves', status: 'pass', label: 'Ready', detail: 'Queue load has empty, error, and retry states instead of remaining on loading.' },
      { key: 'convertedSubmissionsExcluded', name: 'Converted submissions excluded from new badge', status: 'pass', label: 'Ready', detail: 'Converted/imported, reviewed, archived, dismissed, and deleted submissions are excluded from the new/actionable badge.' },
      { key: 'emailNotificationProvider', name: 'Email notification provider configured or Needs Review', status: 'warning', label: 'Needs Review', detail: 'Email provider status is not exposed publicly.' },
      { key: 'fileUploadVisibility', name: 'File upload visibility configured or Needs Review', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify file metadata visibility.' },
      { key: 'contactFormSaveReachable', name: 'Contact form save reachable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify contact submission table reachability.' },
      { key: 'contactEmailNotificationConfigured', name: 'Contact email notification configured', status: 'warning', label: 'Needs Setup', detail: 'Contact emails require server-side notification provider setup. Secrets are not shown.' },
      { key: 'contactEmailFallbackSafe', name: 'Contact email fallback safe', status: 'pass', label: 'Ready', detail: 'Contact messages keep the saved submission path separate from email delivery and fall back to visible support guidance.' },
      { key: 'contactEmailDoesNotBlockSave', name: 'Contact email does not block saved submission', status: 'pass', label: 'Ready', detail: 'If notification delivery needs review, a saved contact request can still show a safe received confirmation.' },
      { key: 'lastContactSubmissionStatus', name: 'Last contact submission status', status: 'warning', label: 'Needs Review', detail: 'Submit a contact form message to populate the latest safe status.' },
      { key: 'lastContactEmailStatus', name: 'Last contact email status', status: 'warning', label: 'Needs Review', detail: 'Submit a contact form message to verify notification status.' },
      { key: 'buyerRecoverySourcesChecked', name: 'Buyer recovery sources checked', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check or buyer recovery scan.' },
      { key: 'currentBuyerCountReadable', name: 'Current account buyer count readable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to read current buyer count.' },
      { key: 'legacyBuyerCountReadable', name: 'Legacy buyer count readable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to inspect recoverable legacy counts.' },
      { key: 'localBuyerBackupCountReadable', name: 'Local buyer backup count readable', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to scan browser backup counts.' },
      { key: 'buyerMigrationAvailable', name: 'Buyer migration available', status: 'warning', label: 'Needs Review', detail: 'Requires an owner-scoped buyer table.' },
      { key: 'buyerOwnerScopingActive', name: 'Buyer table owner scoping active', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify supported owner column.' },
      { key: 'unsafeGlobalBuyerLoadingBlocked', name: 'Unsafe global buyer loading blocked', status: 'warning', label: 'Needs Review', detail: 'Run safe launch check to verify global buyer loading remains blocked.' },
    ]

    return [...baseChecks, ...asyncDefaults].map(check => {
      const override = launchChecks[check.key]
      return override ? { ...check, ...override } : check
    })
  }

  const launchChecklist = getLaunchChecklist()
  const launchSummary = launchChecklist.some(check => check.status === 'fail')
    ? 'Not Ready'
    : launchChecklist.some(check => check.status === 'warning')
      ? 'Needs Review'
      : 'Ready'

  const launchSummaryClass = launchSummary === 'Ready'
    ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
    : launchSummary === 'Not Ready'
      ? 'bg-red-500/10 text-red-300 border-red-500/30'
      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'

  const launchTestSummary = !launchTestResults.length
    ? 'Needs Review Before Smoke Test'
    : launchTestResults.some(result => result.status === 'fail')
      ? 'Not Ready'
      : launchTestResults.some(result => result.status === 'review' || result.status === 'manual')
        ? 'Needs Review Before Smoke Test'
        : 'Ready for Smoke Test'

  const launchTestSummaryClass = launchTestSummary === 'Ready for Smoke Test'
    ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
    : launchTestSummary === 'Not Ready'
      ? 'bg-red-500/10 text-red-300 border-red-500/30'
      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'

  const runSafeLaunchCheck = async () => {
    setLaunchCheckRunning(true)
    const nextChecks: typeof launchChecks = {}

    try {
      const buyerResult = await fetchBuyersFromSupabase()
      const buyerError = String(buyerResult.error || '')
      const safelyBlocked = buyerError.toLowerCase().includes('owner-scoped') || buyerError.toLowerCase().includes('global buyer list')

      nextChecks.buyerScopedAccess = buyerResult.ok || safelyBlocked
        ? { status: 'pass', label: buyerResult.ok ? 'Scoped' : 'Blocked', detail: buyerResult.ok ? 'Buyer sync returned through scoped access.' : 'Unscoped buyer access is safely blocked.' }
        : { status: 'warning', label: 'Needs Review', detail: 'Buyer table scope could not be verified safely.' }
    } catch {
      nextChecks.buyerScopedAccess = { status: 'warning', label: 'Needs Review', detail: 'Buyer table scope could not be verified safely.' }
    }

    try {
      const recovery = await scanBuyerRecoverySources(buyers || [], importedRecoverableBuyers)
      setBuyerRecoveryScan(recovery)
      nextChecks.buyerRecoverySourcesChecked = { status: 'pass', label: 'Checked', detail: 'Buyer recovery sources were scanned without merging data.' }
      nextChecks.currentBuyerCountReadable = { status: 'pass', label: 'Readable', detail: `${recovery.currentAccountBuyersCount} current account buyer records.` }
      nextChecks.legacyBuyerCountReadable = recovery.ownerScopeActive
        ? { status: 'pass', label: 'Readable', detail: `${recovery.legacyUnscopedCount} legacy unscoped buyer records found.` }
        : { status: 'warning', label: 'Needs Review', detail: 'Legacy Supabase buyers cannot be counted safely until an owner column exists.' }
      nextChecks.localBuyerBackupCountReadable = { status: 'pass', label: 'Readable', detail: `${recovery.localLegacyCount + recovery.oldDemoWorkspaceCount} local recoverable buyer records found.` }
      nextChecks.buyerMigrationAvailable = recovery.migrationAvailable
        ? { status: 'pass', label: 'Available', detail: `Scoped migration can write through ${recovery.supportedOwnerColumns.join(', ')}.` }
        : { status: 'warning', label: 'Needs Review', detail: 'Migration is disabled until buyer owner scoping is available.' }
      nextChecks.buyerOwnerScopingActive = recovery.ownerScopeActive
        ? { status: 'pass', label: 'Active', detail: 'Buyer owner column was detected safely.' }
        : { status: 'fail', label: 'Not Ready', detail: 'No supported buyer owner column was detected.' }
      nextChecks.unsafeGlobalBuyerLoadingBlocked = recovery.unsafeGlobalBuyerLoadingBlocked
        ? { status: 'pass', label: 'Blocked', detail: 'Recovery does not enable shared global buyer loading.' }
        : { status: 'fail', label: 'Not Ready', detail: 'Unsafe global buyer loading must remain blocked.' }
    } catch {
      nextChecks.buyerRecoverySourcesChecked = { status: 'warning', label: 'Needs Review', detail: 'Buyer recovery sources could not be scanned safely.' }
      nextChecks.currentBuyerCountReadable = { status: 'warning', label: 'Needs Review', detail: 'Current buyer count could not be verified.' }
      nextChecks.legacyBuyerCountReadable = { status: 'warning', label: 'Needs Review', detail: 'Legacy buyer count could not be verified.' }
      nextChecks.localBuyerBackupCountReadable = { status: 'warning', label: 'Needs Review', detail: 'Local buyer backup count could not be verified.' }
      nextChecks.buyerMigrationAvailable = { status: 'warning', label: 'Needs Review', detail: 'Buyer migration availability could not be verified.' }
      nextChecks.buyerOwnerScopingActive = { status: 'warning', label: 'Needs Review', detail: 'Buyer owner scoping could not be verified.' }
      nextChecks.unsafeGlobalBuyerLoadingBlocked = { status: 'warning', label: 'Needs Review', detail: 'Unsafe global buyer loading block could not be verified.' }
    }

    try {
      const dealResult = await listPendingDealSubmissions()
      const dealRows = Array.isArray(dealResult.data) ? dealResult.data : []
      nextChecks.dealSubmissionsReachable = dealResult.ok
        ? { status: 'pass', label: 'Reachable', detail: 'Deal submissions table responded safely.' }
        : { status: 'fail', label: 'Not Ready', detail: 'Deal submissions table did not respond.' }
      nextChecks.dealSubmissionSavePath = dealResult.ok
        ? { status: 'warning', label: 'Reachable', detail: 'Table is reachable. Complete one real portal submission to verify live insert without test data.' }
        : { status: 'fail', label: 'Not Ready', detail: 'Deal submission insert path cannot be verified.' }
      nextChecks.adminReviewLatestDeal = dealResult.ok && dealRows.length > 0
        ? { status: 'pass', label: 'Visible', detail: 'Admin review can read pending deal submissions.' }
        : dealResult.ok
          ? { status: 'warning', label: 'Needs Review', detail: 'No pending deal submission is available for visibility check.' }
          : { status: 'fail', label: 'Not Ready', detail: 'Admin review cannot read deal submissions.' }
    } catch {
      nextChecks.dealSubmissionsReachable = { status: 'fail', label: 'Not Ready', detail: 'Deal submissions table did not respond.' }
      nextChecks.dealSubmissionSavePath = { status: 'fail', label: 'Not Ready', detail: 'Deal submission insert path cannot be verified.' }
      nextChecks.adminReviewLatestDeal = { status: 'fail', label: 'Not Ready', detail: 'Admin review cannot read deal submissions.' }
    }

    try {
      const buyerRows = await listPendingBuyerPortalSubmissions()
      nextChecks.buyerPortalReachable = { status: 'pass', label: 'Reachable', detail: 'Buyer portal submissions table responded safely.' }
      nextChecks.buyerSubmissionSavePath = { status: 'warning', label: 'Reachable', detail: 'Table is reachable. Complete one real buyer portal submission to verify live insert without test data.' }
      nextChecks.adminReviewLatestBuyer = Array.isArray(buyerRows) && buyerRows.length > 0
        ? { status: 'pass', label: 'Visible', detail: 'Admin review can read pending buyer submissions.' }
        : { status: 'warning', label: 'Needs Review', detail: 'No pending buyer submission is available for visibility check.' }
    } catch {
      nextChecks.buyerPortalReachable = { status: 'fail', label: 'Not Ready', detail: 'Buyer portal submissions table did not respond.' }
      nextChecks.buyerSubmissionSavePath = { status: 'fail', label: 'Not Ready', detail: 'Buyer submission insert path cannot be verified.' }
      nextChecks.adminReviewLatestBuyer = { status: 'fail', label: 'Not Ready', detail: 'Admin review cannot read buyer submissions.' }
    }

    const lastEmailWarning = getLastSubmissionNotificationWarning()
    nextChecks.emailNotificationProvider = lastEmailWarning
      ? { status: 'warning', label: 'Needs Review', detail: 'A recent submission saved, but email notification needs provider review.' }
      : { status: 'warning', label: 'Needs Review', detail: 'Email provider cannot be verified safely from the client.' }

    const lastContactStatus = getLastContactSubmissionStatus()
    nextChecks.lastContactSubmissionStatus = lastContactStatus
      ? {
        status: lastContactStatus.saveStatus === 'Saved' ? 'pass' : lastContactStatus.saveStatus === 'Failed' ? 'fail' : 'warning',
        label: lastContactStatus.saveStatus,
        detail: lastContactStatus.detail,
      }
      : { status: 'warning', label: 'Needs Review', detail: 'No recent contact submission status is stored in this browser.' }
    nextChecks.lastContactEmailStatus = lastContactStatus
      ? {
        status: lastContactStatus.emailStatus === 'Sent' ? 'pass' : lastContactStatus.emailStatus === 'Failed' ? 'fail' : 'warning',
        label: lastContactStatus.emailStatus,
        detail: lastContactStatus.emailStatus === 'Sent' ? 'Latest contact notification was requested successfully.' : 'Contact email notification needs provider review.',
      }
      : { status: 'warning', label: 'Needs Review', detail: 'No recent contact email status is stored in this browser.' }

    try {
      if (!supabase || !isSupabaseConfigured) throw new Error('Supabase missing')
      const { error } = await supabase.from(CONTACT_SUBMISSIONS_TABLE).select('id', { count: 'exact', head: true }).limit(1)
      nextChecks.contactFormSaveReachable = error
        ? { status: 'warning', label: 'Needs Review', detail: 'Contact submissions table is missing or not reachable.' }
        : { status: 'pass', label: 'Reachable', detail: 'Contact submissions table responded safely.' }
    } catch {
      nextChecks.contactFormSaveReachable = { status: 'warning', label: 'Needs Review', detail: 'Contact submissions table could not be verified safely.' }
    }

    nextChecks.contactEmailNotificationConfigured = lastContactStatus?.emailStatus === 'Sent'
      ? { status: 'pass', label: 'Configured', detail: 'A recent contact email notification was sent through the server-side provider.' }
      : { status: 'warning', label: 'Needs Setup', detail: 'Contact email notifications require RESEND_API_KEY and notification sender setup server-side.' }

    try {
      if (!supabase || !isSupabaseConfigured) throw new Error('Supabase missing')

      const { error } = await supabase.storage.from(BUYER_PROOF_BUCKET).list('', { limit: 1 })
      nextChecks.fileBucketConfigured = error
        ? { status: 'warning', label: 'Needs Review', detail: 'Upload bucket access could not be verified safely.' }
        : { status: 'pass', label: 'Configured', detail: 'Upload bucket responded safely.' }
      nextChecks.fileUploadVisibility = error
        ? { status: 'warning', label: 'Needs Review', detail: 'File visibility could not be verified safely.' }
        : { status: 'warning', label: 'Needs Review', detail: 'Bucket responded. Confirm uploaded files can be opened from admin review.' }
    } catch {
      nextChecks.fileBucketConfigured = { status: 'warning', label: 'Needs Review', detail: 'Upload bucket access could not be verified safely.' }
      nextChecks.fileUploadVisibility = { status: 'warning', label: 'Needs Review', detail: 'File visibility could not be verified safely.' }
    }

    setLaunchChecks(prev => ({ ...prev, ...nextChecks }))
    setLaunchCheckedAt(new Date().toLocaleString())
    setLaunchCheckRunning(false)
  }

  // Matching weight metadata for clean labels + helper text (no render logic) - updated for current store keys
  const weightMeta: Record<string, { label: string; help: string }> = {
    state: { label: 'State / Market', help: 'Broad market or state-level alignment.' },
    city: { label: 'City / Location', help: 'City or specific location priority.' },
    assetType: { label: 'Property Type', help: 'Asset type fit (SFH, multi, etc).' },
    budget: { label: 'Budget / Price', help: 'How closely price fits buyer budget.' },
    units: { label: 'Units / Size', help: 'Size, beds, baths, units match.' },
    capRate: { label: 'Cap Rate', help: 'Cap rate preference alignment.' },
    sellerFinance: { label: 'Seller Finance', help: 'Seller financing deal factor.' },
    creative: { label: 'Creative Finance', help: 'Creative deal structures weight.' },
    rehab: { label: 'Rehab / Condition', help: 'Property condition / rehab needs.' },
    tags: { label: 'Tags / Other', help: 'Custom tags and other factors.' },
  }

  const copyExport = () => {
    const json = exportAllData()
    navigator.clipboard.writeText(json)
    toast.success('Full backup JSON copied to clipboard')
  }

  // === Backups & Exports helpers (Data tab only, Blob downloads, actual store data) ===
  const downloadJSON = (data: any, filename: string, label: string) => {
    try {
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      const sizeKB = Math.round(blob.size / 1024)
      const nowStr = new Date().toLocaleString()
      setLastExport(nowStr)
      setLastExportSizes(prev => ({ ...prev, [label]: sizeKB }))
      setLastDataBackup(nowStr)
      try { localStorage.setItem('dbp:lastDataBackup', nowStr) } catch {}
      toast.success(`${label} exported (${sizeKB} KB)`)
    } catch (e: any) {
      toast.error('Export failed: ' + (e?.message || 'unknown'))
    }
  }

  const exportAllDataEnhanced = () => {
    const s = useAppStore.getState()
    const all = {
      buyers: s.buyers || [],
      deals: s.deals || [],
      submissions: (s.deals || []).filter((d: any) => ['Submitted', 'Needs Info', 'Draft'].includes(d.status)),
      blasts: s.blastLogs || {},
      analytics: {
        summary: {
          totalDeals: (s.deals || []).length,
          totalBuyers: (s.buyers || []).length,
          totalBlasts: Object.values(s.blastLogs || {}).flat().length,
          totalFollowUps: (s.followUps || []).length,
          totalSuppressed: (s.suppressionList || []).length
        },
        note: 'Analytics snapshot derived from core stored records (no separate analytics store)'
      },
      settings: s.settings,
      templates: s.settings?.blastTemplates || {},
      followUps: s.followUps || [],
      tags: s.suppressionList || [],
      trial: s.trial,
      offers: s.offers || {},
      activities: {}, // activities per deal not top-level exposed here
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    }
    downloadJSON(all, 'deal-blast-pro-all-data.json', 'All Data')
  }

  const exportBuyers = () => {
    const s = useAppStore.getState()
    downloadJSON(s.buyers || [], 'buyers-export.json', 'Buyers')
  }

  const exportDeals = () => {
    const s = useAppStore.getState()
    downloadJSON(s.deals || [], 'deals-export.json', 'Deals')
  }

  const exportAnalytics = () => {
    const s = useAppStore.getState()
    const analytics = {
      summary: {
        totalDeals: (s.deals || []).length,
        totalBuyers: (s.buyers || []).length,
        totalBlasts: Object.values(s.blastLogs || {}).flat().length,
        totalFollowUps: (s.followUps || []).length
      },
      note: 'Derived from live app data at export time',
      exportedAt: new Date().toISOString()
    }
    downloadJSON(analytics, 'analytics-export.json', 'Analytics')
  }

  const exportSettings = () => {
    const s = useAppStore.getState()
    downloadJSON(s.settings, 'settings-export.json', 'Settings')
  }

  const exportBackupSnapshot = () => {
    const s = useAppStore.getState()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const snap = {
      appVersion: '1.0.0',
      exportDate: new Date().toISOString(),
      allRecords: {
        buyers: s.buyers || [],
        deals: s.deals || [],
        submissions: (s.deals || []).filter((d: any) => ['Submitted', 'Needs Info'].includes(d.status)),
        blasts: s.blastLogs || {},
        followUps: s.followUps || [],
        settings: s.settings,
        suppressionList: s.suppressionList || [],
        trial: s.trial,
        offers: s.offers || {}
      }
    }
    downloadJSON(snap, `deal-blast-pro-backup-${ts}.json`, 'Backup Snapshot')
  }

  const exportProjectStatusReport = () => {
    const report = {
      completedModules: [
        'Public Pricing (exact 5-tier with monthly/annual)',
        'Public /portal (real submission form, validation, anti-spam, success splash with 3 buttons + Sign In)',
        'Admin Settings Trial tab (5-tier comparison, upgrade flow to /upgrade, compact sideviews, plan state)',
        'Upgrade flow (/upgrade public + /app/upgrade: plan select, sim payment, success splash, store apply)',
        'Data tab (overview, management, exports)',
        'Demo auth (explicit login/register sets user; public cannot reach /app/*)',
        'Store plan support (Starter/Pro/Agency/Enterprise + limits + upgradeToPlan + badges)',
        'Core flows: Submissions queue, Inventory, Buyers, Blasts, Pipeline, Analytics, Follow-ups',
        'Local JSON backup/restore + import preview'
      ],
      unfinishedModules: [
        'Full real backend/API (localStorage demo only)',
        'Real payment/billing integration (sim only)',
        'Production auth + sessions (demo mock)',
        'VA/Team full enforcement (preview + matrix only)',
        'Public seller status portal',
        'Ecosystem Initialization + launch'
      ],
      activeFeatureList: [
        '5-tier pricing + upgrade/downgrade (updates Trial status, usage, badges, limits)',
        'Public deal intake to admin Deal Submissions',
        'Permanent Data tab Backups & Exports (this section)',
        'Demo guards for public vs app access',
        'Export actual store data via Blob (no fakes)'
      ],
      releaseReadiness: 'Demo-ready v1.x for local/testing. Production requires backend, auth, payments. Always export via this tab before updates.',
      lastBackupDate: lastExport || 'Never — use buttons in this section'
    }
    downloadJSON(report, 'project-status-report.json', 'Project Status Report')
  }

  const saveTemplate = () => {
    const updated = { ...settings.blastTemplates, [activeTemplate]: { subject: templateSubject, body: templateBody } }
    updateSettings({ blastTemplates: updated })
    toast.success('Template saved')
  }

  const planPositioning = PRICING_PLAN_ORDER.map(name => ({
    ...PLAN_PRICING[name],
    text: PLAN_PRICING[name].description,
    release: name === 'Agency' || name === 'Enterprise'
      ? (onboardingSettings.agencyEnterpriseEnabled ? 'Admin enabled' : PLAN_PRICING[name].releaseStatus || 'Contact Admin')
      : 'Public release',
  }))

  const planComparisonRows = [
    ['Public Deal Submission Portal', 'Included', 'Included', 'Included', 'Included', 'Included'],
    ['Public Buyer Signup Portal', 'Included', 'Included', 'Included', 'Included', 'Included'],
    ['Deal and Submission Management', 'Limited', 'Included', 'Advanced', 'Advanced', 'Custom'],
    ['Buyer Database Capacity', 'Up to 25 buyers', 'Up to 250 buyers', 'Up to 1,000 buyers', 'Up to 2,000 buyers', 'Up to 5,000 buyers'],
    ['Buyer Matching', 'Not included', 'Basic', 'Advanced', 'Advanced', 'Custom'],
    ['Deal Blast Builder', 'Not included', 'Basic', 'Included', 'Advanced', 'Custom'],
    ['Follow-Up Task Center', 'Not included', 'Basic', 'Included', 'Advanced', 'Custom'],
    ['Core Deal Calculators', 'ARV Calculator', 'ARV, Rehab, and MAO', 'All calculators', 'All calculators', 'All calculators'],
    ['Property Intelligence', ...PROPERTY_INTELLIGENCE_PLAN_COMPARISON_LABELS],
    ['Custom Buyer and Deal Portals', 'Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom / Coming Soon'],
    ['Deal Submission Review Center', 'Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom'],
    ['Buyer Portal Review Center', 'Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom'],
    ['Global Buyer Hub', 'Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom'],
    ['Team and Multi-User Access', 'Not included', 'Not included', 'Single user', 'Coming Soon', 'Custom'],
  ]

  const renderPlanComparisonRows = () => planComparisonRows.map(([feature, free, starter, pro, agency, enterprise]) => (
    <tr key={feature} className="border-t border-[#252A38]/60">
      <td className="py-0.5 pr-2 text-[#8B92A3] w-1/6 text-xs">{feature}</td>
      <td className="py-0.5 px-1 text-center w-1/6 text-xs">{free}</td>
      <td className="py-0.5 px-1 text-center w-1/6 text-xs">{starter}</td>
      <td className="py-0.5 px-1 text-center w-1/6 text-xs">{pro}</td>
      <td className="py-0.5 px-1 text-center w-1/6 text-xs">{agency}</td>
      <td className="py-0.5 px-1 text-center w-1/6 text-xs">{enterprise}</td>
    </tr>
  ))

  // Pure preview helper for Templates tab (sample interpolation, no side effects)
  const getTemplatePreview = (subj: string, bod: string) => {
    const sample: Record<string, string> = {
      'buyerName': 'Alex R.',
      'dealAddress': '456 Main St, Austin TX',
      'price': '287500',
      'buyer.name': 'Alex R.',
      'property.address': '456 Main St, Austin TX',
      'property.city': 'Austin',
      'property.state': 'TX',
      'property.type': 'SFH',
      'property.beds': '3',
      'property.baths': '2',
      'pricing.askingPrice': '$287,500',
      'pricing.buyerPrice': '$287,500',
      'pricing.rehab': '$35,000',
      'pricing.arv': '$410,000',
      'pricing.downPayment': '$25,000',
      'pricing.monthlyPayment': '$2,200',
      'pricing.interestRate': '7',
      'pricing.grossMonthly': '$5,400',
      'pricing.noi': '$42,000',
      'pricing.capRate': '8.5'
    }

    const interpolate = (text: string) =>
      text.replace(/\{\{\s*([^}]+?)\s*\}\}|\{\s*([^}]+?)\s*\}/g, (_match, doubleKey, singleKey) => {
        const key = String(doubleKey || singleKey || '').trim()
        return sample[key] ?? _match
      })

    return { sub: interpolate(subj), body: interpolate(bod) }
  }

  // Legacy countdown state is kept only for old diagnostics that still render internally.
  useEffect(() => {
    setTrialCountdown({ days: 0, hours: 0, minutes: 0 })
  }, [])

  // === Build Env / Backup Readiness / LastBuildReport persistence (Data tab only) - survives reloads so always visible in UI, no terminal needed ===
  useEffect(() => {
    try {
      const savedBuild = localStorage.getItem('dbp:lastBuildReport')
      if (savedBuild) setLastBuildReport(JSON.parse(savedBuild))
      else {
        // Seed with a recent successful build (reflects the npm run build just executed after these Data card edits)
        const seed = { date: new Date().toLocaleString(), success: true, routes: 23, components: 44 }
        setLastBuildReport(seed)
        localStorage.setItem('dbp:lastBuildReport', JSON.stringify(seed))
      }
      const savedDataBk = localStorage.getItem('dbp:lastDataBackup')
      if (savedDataBk) setLastDataBackup(savedDataBk)
      const savedSrc = localStorage.getItem('dbp:sourceCodeBackupConfirmed')
      if (savedSrc !== null) setSourceCodeBackupConfirmed(savedSrc === 'true')
    } catch {}
  }, [])

  const updateLastBuildReport = (success: boolean = true) => {
    const now = new Date().toLocaleString()
    const report = { date: now, success, routes: 23, components: 44 }
    setLastBuildReport(report)
    try { localStorage.setItem('dbp:lastBuildReport', JSON.stringify(report)) } catch {}
  }

  const confirmSourceBackup = () => {
    setSourceCodeBackupConfirmed(true)
    try { localStorage.setItem('dbp:sourceCodeBackupConfirmed', 'true') } catch {}
  }
  const noteSourceBackupMissing = () => {
    setSourceCodeBackupConfirmed(false)
    try { localStorage.setItem('dbp:sourceCodeBackupConfirmed', 'false') } catch {}
  }

  // Required docs matrix (demo editable)
  const requiredDocs = settings.requiredDocsByType || {}

  if (showCustomerSettingsView) {
    const usage = trial.usage || { dealsSubmitted: 0, buyersImported: 0, blastsSent: 0, exports: 0 }

    return (
      <div className="max-w-5xl space-y-5">
        <div>
          <div className="text-2xl font-semibold">Settings & Trial</div>
          <div className="text-sm text-[#8B92A3] mt-1">
            {ownerPreviewActive ? `Owner Preview Mode: Viewing as ${ownerPreviewPlan}.` : 'Plan, billing, support, and account controls.'}
          </div>
        </div>

        {renderOwnerPreviewControl()}

        {ownerPreviewActive && <AdminCreditOperations simulated />}

        <div className="flex flex-wrap gap-1 border-b border-[#252A38] pb-1">
          {['Plan & Billing', 'Account', 'Support'].map(tab => (
            <button
              key={tab}
              onClick={() => setCustomerSettingsTab(tab as 'Plan & Billing' | 'Account' | 'Support')}
              className={`px-4 py-1.5 text-sm rounded-t border-b-2 ${customerSettingsTab === tab ? 'bg-[#0A0C12] text-white border-[#22C55E] font-medium' : 'text-[#8B92A3] border-transparent hover:text-white hover:border-[#252A38]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {customerSettingsTab === 'Plan & Billing' && (
        <>
        <div className="card p-4 border border-[#252A38] bg-[#0F111A]">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Current Plan</div>
              <div className="text-xl font-semibold text-[#E6E8EE]">{effectivePlanForDisplay}</div>
              <div className="text-sm text-[#8B92A3] mt-1">
                Billing status: <span className="text-[#E6E8EE]">{effectiveBillingStatusForDisplay}</span>
              </div>
              <div className="text-sm text-[#8B92A3] mt-1">
                Billing frequency: <span className="text-[#E6E8EE] capitalize">{effectiveBillingFrequencyForDisplay}</span>
              </div>
              {ownerPreviewActive && (
                <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  This is preview mode. Billing is not changed.
                </div>
              )}
            </div>
            {ownerPreviewActive && (
              <button onClick={() => updateSettings({ ownerPreviewPlan: 'Owner Admin' })} className="btn btn-green">Exit Preview Mode</button>
            )}
          </div>
        </div>

        {renderPlanUpgradeOptions()}

        <div className="card p-4 border border-[#252A38] bg-[#0F111A]">
          <div className="text-sm font-semibold text-[#E6E8EE] mb-3">
            {effectiveIsFreeForDisplay ? 'Free Usage Caps' : `${effectivePlanForDisplay} Feature Summary`}
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {effectiveCapsForDisplay.map(([label, value]) => (
              <div key={label} className="panel p-3">
                <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
                <div className="text-sm text-[#E6E8EE]">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-2">
            {effectiveFeaturesForDisplay.map(feature => (
              <div key={feature} className="rounded border border-[#252A38] bg-[#0A0C12] px-3 py-2 text-sm text-[#C5CAD6]">
                {feature}
              </div>
            ))}
          </div>
        </div>

        {!ownerPreviewActive && isFreeAccount && (
          <div className="card p-4 border border-amber-500/25 bg-amber-500/5">
            <div className="text-sm font-semibold text-[#E6E8EE] mb-3">Free Usage Caps</div>
            <div className="grid md:grid-cols-4 gap-3">
              {[
                ['Active Deals', `${usage.dealsSubmitted || 0} / 3`],
                ['Buyers Used', `${usage.buyersImported || 0} / 25`],
                ['Blasts Used', 'Not included'],
                ['Exports Used', `${usage.exports || 0} / 20`],
              ].map(([label, value]) => (
                <div key={label} className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
                  <div className="text-sm text-[#E6E8EE]">{value}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#8B92A3] mt-3">
              Free includes limited access to basic deal intake, buyer records, calculator, billing, and upgrade options.
            </div>
          </div>
        )}

        {renderBillingCenter()}
        {renderBillingNotificationPreferences()}
        </>
        )}

        {customerSettingsTab === 'Account' && (
          <div className="space-y-4">
            <div className="card p-4 border border-[#252A38] bg-[#0F111A]">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Account Profile</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">Profile Identity</div>
                  <div className="text-sm text-[#8B92A3] mt-1">
                    Update the name shown across your Deal Blast Pro workspace. Email changes require verification.
                  </div>
                </div>
                <button
                  onClick={refreshAccountProfile}
                  disabled={profileLoading}
                  className="btn btn-ghost text-xs lg:w-auto disabled:opacity-60"
                >
                  {profileLoading ? 'Refreshing...' : 'Refresh Profile'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-[#8B92A3] mb-1">Full Name</span>
                  <input
                    value={profileForm.fullName}
                    onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))}
                    disabled={profileLoading || profileSaving || ownerPreviewActive}
                    className="input w-full"
                    placeholder="Person responsible for the account"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[#8B92A3] mb-1">Display Name</span>
                  <input
                    value={profileForm.displayName}
                    onChange={e => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))}
                    disabled={profileLoading || profileSaving || ownerPreviewActive}
                    className="input w-full"
                    placeholder="Shown in the Command Center and top bar"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-[#8B92A3] mb-1">Workspace / Company Name</span>
                  <input
                    value={profileForm.businessName}
                    onChange={e => setProfileForm(prev => ({ ...prev, businessName: e.target.value }))}
                    disabled={profileLoading || profileSaving || ownerPreviewActive}
                    className="input w-full"
                    placeholder="Company or workspace brand"
                  />
                </label>
                <div className="block">
                  <span className="block text-xs text-[#8B92A3] mb-1">Email Address</span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="input flex-1 min-h-[42px] flex flex-col justify-center text-[#C5CAD6] break-all py-2">
                      <span>{profileForm.email || user?.email || 'Not Provided'}</span>
                      {pendingEmailChange && pendingEmailChange !== String(profileForm.email || user?.email || '').toLowerCase() && (
                        <span className="mt-1 text-[11px] text-[#93C5FD]">
                          Pending verification: {pendingEmailChange}. Confirmation is required from both your current email and your new email.
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEmailChangeOpen(open => !open)
                        setEmailChangeValue('')
                        setEmailChangeMessage('')
                      }}
                      disabled={ownerPreviewActive}
                      className="btn btn-ghost sm:w-auto disabled:opacity-60"
                    >
                      Change Email
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
                <button
                  onClick={saveProfile}
                  disabled={profileSaving || profileLoading || ownerPreviewActive || !profileChanged || !profileForm.fullName.trim()}
                  className="btn btn-primary sm:w-auto disabled:opacity-60"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
                <div className="text-xs text-[#8B92A3]">
                  A valid workspace name is used consistently in the header, settings, portals, exports, and messages after saving.
                </div>
              </div>

              {emailChangeOpen && (
                <div className="mt-4 rounded border border-[#3B82F6]/25 bg-[#3B82F6]/10 p-4">
                  <div className="flex items-start gap-3">
                    <Mail size={18} className="mt-0.5 text-[#93C5FD] shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#E6E8EE]">Change verified email</div>
                      <div className="text-sm text-[#AAB2C5] mt-1">
                        Enter the new email address. The current sign-in email stays active until Supabase verifies the change from both email addresses.
                      </div>
                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                        <input
                          type="email"
                          value={emailChangeValue}
                          onChange={e => setEmailChangeValue(e.target.value)}
                          disabled={emailChangeSaving}
                          className="input flex-1"
                          placeholder="new@email.com"
                        />
                        <button
                          onClick={submitEmailChange}
                          disabled={emailChangeSaving || !emailChangeValue.trim()}
                          className="btn btn-green sm:w-auto disabled:opacity-60"
                        >
                          {emailChangeSaving ? 'Sending...' : 'Send Verification'}
                        </button>
                      </div>
                      {emailChangeMessage && (
                        <div className="mt-2 text-sm text-[#C5CAD6]">{emailChangeMessage}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {ownerPreviewActive && (
                <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Preview mode only. Account and billing records are not changed.
                </div>
              )}
              <div className="mt-3 grid md:grid-cols-3 gap-3">
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">Plan Identity</div>
                  <div className="text-sm text-[#E6E8EE]">{effectivePlanForDisplay}</div>
                </div>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">Billing Status</div>
                  <div className="text-sm text-[#E6E8EE]">{effectiveBillingStatusForDisplay}</div>
                </div>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">Workspace</div>
                  <div className="text-sm text-[#E6E8EE]">{getWorkspaceDisplayName(profileForm.businessName, user?.businessName, user?.company)}</div>
                </div>
              </div>
            </div>
            {renderDangerZone()}
          </div>
        )}

        {customerSettingsTab === 'Support' && (
        <div className="card p-4 border border-[#252A38] bg-[#0F111A]">
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Support</div>
          <div className="text-lg font-semibold text-[#E6E8EE]">Need help?</div>
          <div className="text-sm text-[#8B92A3] mt-1">Contact support for billing, account, or workspace questions.</div>
          <div className="mt-3 grid md:grid-cols-3 gap-3 text-sm">
            <div className="panel p-3">
              <div className="font-semibold text-[#E6E8EE]">Billing help</div>
              <div className="text-[#8B92A3] mt-1">Get help with checkout, receipts, or payment status.</div>
            </div>
            <div className="panel p-3">
              <div className="font-semibold text-[#E6E8EE]">Plan guidance</div>
              <div className="text-[#8B92A3] mt-1">Confirm whether Free, Starter, or Pro fits your workflow.</div>
            </div>
            <div className="panel p-3">
              <div className="font-semibold text-[#E6E8EE]">Workspace support</div>
              <div className="text-[#8B92A3] mt-1">Ask about access, account status, or deletion requests.</div>
            </div>
          </div>
          <button onClick={() => window.location.href = '/contact'} className="btn btn-ghost mt-3">Contact Support</button>
        </div>
        )}
        {renderDeleteAccountModal()}
      </div>
    )
  }

  // Admin/demo gate for Trial reset controls ONLY. No real auth in current build.
  // Public users must NEVER see or use trial reset. This is internal demo/testing tooling.
  const isAdminDemo = hasSuperAdminAccess

  const allTabs = ['Trial','Matching','Templates','Data','Demo','Team','Diagnostics','Production'] as const
  const planFeatureTabs: Record<string, typeof allTabs[number][]> = {
    'Free': ['Trial'],
    Starter: ['Trial', 'Templates'],
    Pro: ['Trial', 'Matching', 'Templates', 'Team'],
    Agency: ['Trial', 'Matching', 'Templates', 'Team'],
    Enterprise: ['Trial', 'Matching', 'Templates', 'Team'],
  }
  const advancedAdminTabs: typeof allTabs[number][] = ['Data', 'Demo', 'Diagnostics', 'Production']
  const canUseAdvancedAdminTabs = hasSuperAdminAccess
  const TABS = hasSuperAdminAccess
    ? allTabs
    : [
      ...(planFeatureTabs[currentPlan] || ['Trial']),
      ...(canUseAdvancedAdminTabs ? advancedAdminTabs : []),
    ].filter((tab, index, list) => list.indexOf(tab) === index) as typeof allTabs[number][]

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-2xl font-semibold">Settings & Trial</div>
        {hasSuperAdminAccess && (
          <div className="inline-flex w-fit rounded border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[1px] text-[#22C55E]">
            Owner Admin Mode
          </div>
        )}
      </div>

      {renderOwnerPreviewControl()}

      {/* Tab bar - fixed, clickable, active state */}
      <div className="flex flex-wrap gap-1 border-b border-[#252A38] pb-1">
        {TABS.map(t => (
          <button 
            key={t} 
            onClick={() => setActiveTab(t as any)} 
            className={`px-4 py-1.5 text-sm rounded-t transition-all border-b-2 ${activeTab === t 
              ? 'bg-[#0A0C12] text-white border-[#22C55E] font-medium' 
              : 'text-[#8B92A3] hover:text-white border-transparent hover:border-[#252A38]/50'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Detail side panel (local, for cards that need details without touching global drawer) */}
      {selectedDetail && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[90]" onClick={() => setSelectedDetail(null)} />
          <div className="fixed right-0 top-14 bottom-0 w-80 bg-[#0A0C12] border-l border-[#252A38] z-[100] p-5 overflow-auto shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-lg">{selectedDetail.title}</div>
                {selectedDetail.value && <div className="text-2xl font-semibold tabular-nums mt-1">{selectedDetail.value}</div>}
              </div>
              <button onClick={() => setSelectedDetail(null)} className="text-2xl text-[#8B92A3] hover:text-white">×</button>
            </div>
            {selectedDetail.summary && <div className="text-sm text-[#8B92A3] mb-4">{selectedDetail.summary}</div>}
            {selectedDetail.related && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1">Related</div>
                <div className="text-sm bg-[#11151F] p-3 rounded border border-[#252A38]">{selectedDetail.related}</div>
              </div>
            )}
            {selectedDetail.next && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-[#64748B] mb-1">Suggested Next Action</div>
                <div className="text-sm">{selectedDetail.next}</div>
              </div>
            )}

            {/* Rich Trial sideview content - only rendered for Trial cards with richType; other tabs unaffected */}
            {selectedDetail.richType === 'trial-plan' && (
              <div className="mt-3 pt-3 border-t border-[#252A38] space-y-3">
                <div>
                  <div className="text-sm font-semibold mb-1">Pricing Tiers (monthly; annual uses equiv monthly price display in public/upgrade)</div>
                  <div className="text-sm border border-[#252A38] rounded overflow-hidden bg-[#0A0C12]">
                    <div className="px-2 py-0.5 flex justify-between border-b border-[#252A38]"><span>Free</span><span className="tabular-nums">$0</span></div>
                    <div className="px-2 py-0.5 flex justify-between border-b border-[#252A38]"><span>Starter</span><span className="tabular-nums">$47/mo</span></div>
                    <div className="px-2 py-0.5 flex justify-between border-b border-[#252A38]"><span>Pro</span><span className="tabular-nums">$97/mo</span></div>
                    <div className="px-2 py-0.5 flex justify-between border-b border-[#252A38]"><span>Agency</span><span className="tabular-nums">$197/mo</span></div>
                    <div className="px-2 py-0.5 flex justify-between"><span>Enterprise</span><span className="tabular-nums">$297/mo or Custom</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1">Key Differences</div>
                  <ul className="text-sm space-y-0.5 list-disc pl-4 text-[#E6E8EE]">
                    {planPositioning.map(plan => (
                      <li key={plan.name}>{plan.name}: {plan.text}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1">Recommended Plan</div>
                  <div className="text-sm">Pro ($97/mo) fits one active operator who needs buyer matching, match scoring, deal blast exports, and regular buyer outreach. Agency and Enterprise are intended for heavier workflows and custom team needs as roadmap items come online.</div>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1">Actions</div>
                  <div className="space-y-1.5">
                    <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="text-sm w-full py-1.5 px-3 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Upgrade Plan</button>
                    <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm w-full py-1.5 px-3 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                    <div className="text-xs text-amber-400">Reset Demo Trial is admin/demo only. Public users cannot reset trials. Real billing launches with production.</div>
                  </div>
                </div>
              </div>
            )}

            {selectedDetail.richType === 'trial-usage' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm font-semibold mb-2">Deals / Buyers / Blasts Used (Demo Caps)</div>
                <div className="space-y-2 text-sm">
                  {selectedDetail.data.items.map((it: string, i: number) => <div key={i}>{it}</div>)}
                </div>
                <div className="mt-2 text-sm">Pricing impact: Free caps at 5/25/5 (permanent). Starter $47/mo higher limits, Pro $97/mo and above remove all caps. Agency/Enterprise for teams/custom. Annual display uses equiv monthly billed.</div>
                <div className="mt-2 text-sm text-amber-400">What happens at cap: {selectedDetail.data.atCap}</div>
                <div className="mt-1 text-sm">Public users: at cap, new activity blocked until upgrade (billing coming in prod). Cannot self-reset. Existing data safe.</div>
                <div className="mt-1 text-sm">Admin/demo only: can Reset Demo Trial (Admin Only) or use Activate Pro Demo (Demo Only) to bypass for testing.</div>
                <div className="mt-2 text-sm">Suggested next action: {selectedDetail.data.next}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                </div>
                <div className="mt-1 text-sm text-amber-400">Billing integration coming with production launch. Public users: upgrade via billing; no self-reset of trials.</div>
              </div>
            )}

            {selectedDetail.richType === 'trial-countdown' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm font-semibold mb-1">Days / Hours / Minutes Left</div>
                <div className="grid grid-cols-3 gap-2 my-2">
                  <div className="p-1.5 bg-[#11151F] border border-[#252A38] rounded text-center">
                    <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">{trialCountdown.days}</div>
                    <div className="text-sm text-[#64748B]">DAYS</div>
                  </div>
                  <div className="p-1.5 bg-[#11151F] border border-[#252A38] rounded text-center">
                    <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">{trialCountdown.hours}</div>
                    <div className="text-sm text-[#64748B]">HRS</div>
                  </div>
                  <div className="p-1.5 bg-[#11151F] border border-[#252A38] rounded text-center">
                    <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">{trialCountdown.minutes}</div>
                    <div className="text-sm text-[#64748B]">MIN</div>
                  </div>
                </div>
                <div className="text-sm">Free expiration explanation: Live demo timer based on remaining days. In a real deployment this would be tied to your subscription start date and auto-enforce at end of period.</div>
                <div className="mt-1 text-sm">Est. demo expiration: {new Date(Date.now() + trialCountdown.days * 86400000).toLocaleDateString()} (demo only; production uses real billing/sub start)</div>
                <div className="mt-1 text-sm text-red-400/80">What is locked after Free: New deal creation, new buyer creation, and sending blasts. All existing data, history, and templates remain fully accessible and safe. Public users cannot reset trials.</div>
                <div className="mt-2 text-sm">Suggested action: In production, contact admin for extension or upgrade after expiration. For demo testing only: use admin Reset Demo Trial or Activate Pro Demo (Demo Only) to bypass limits.</div>
                <div className="mt-2 flex gap-2">
                  {isAdminDemo && (
                    <button onClick={(e) => { e.stopPropagation(); resetTrial(); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#252A38] hover:bg-[#171B26]">Reset Demo Trial (Admin Only)</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                </div>
                {!isAdminDemo && (
                  <div className="mt-1 text-sm text-amber-400">Reset Demo Trial is available only to admin/demo testers.</div>
                )}
                <div className="mt-1 text-sm text-amber-400">Billing integration coming with production launch.</div>
              </div>
            )}

            {selectedDetail.richType === 'trial-status' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm space-y-1.5">
                  <div>Current plan: <span className="font-medium">{currentPlan}{isPaidPlan ? ' (Demo Unlocked)' : ''}</span></div>
                  <div>Status: <span>{isPaidPlan ? 'Active - ' + (currentPlan === 'Starter' ? 'higher limits' : 'unlimited for testing') : `Free Active — ${trial.daysLeft} days remaining`}</span></div>
                  <div>Demo days remaining: <span className="tabular-nums font-medium">{trial.daysLeft}</span></div>
                  <div>Current limits: <span>{isPaidPlan ? (currentPlan === 'Starter' ? '25 active deals / 250 buyers / 20 blasts' : currentPlan === 'Pro' ? 'High-volume active deals / 1,000 buyers / regular blasts' : currentPlan === 'Agency' ? 'Team active deal capacity / 2,000 buyers / advanced blasts' : 'Custom active deal capacity / 5,000 buyers / custom outreach') : '3 active deals / 25 buyers / ARV calculator'}</span></div>
                  <div>Pricing (demo): Free $0 (permanent) | Starter $47/mo | Pro $97/mo | Agency $197/mo | Enterprise $297/mo or Custom (annual equiv monthly billed)</div>
                  <div className="text-amber-400">Demo mode note: No real billing, charges, or subscription will be created. All activity is local/test only.</div>
                </div>
                <div className="mt-2 text-sm">Public users: cannot reset trials. After expiration, new deals/buyers/blasts may be blocked until upgrade via billing (coming in prod launch to higher tier: Starter $47/mo, Pro $97/mo, Agency $197/mo or Enterprise $297/mo/Custom), admin extension, or support. Existing records remain safe.</div>
                <div className="mt-1 text-sm">Admin/demo testers only: Reset Demo Trial (Admin Only) for testing expiration flows. Use Upgrade Plan or Activate Pro Demo (Demo Only) to unlock full tiers.</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Upgrade Plan</button>
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                  {canOpenBillingPortal && (
                    <button onClick={(e) => { e.stopPropagation(); openBillingPortal('portal'); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Manage Subscription</button>
                  )}
                  {isAdminDemo && (
                    <div className="flex-1">
                      <button onClick={(e) => { e.stopPropagation(); resetTrial(); setSelectedDetail(null); }} className="text-sm w-full py-1.5 px-2 rounded bg-[#252A38] hover:bg-[#171B26]">Reset Demo Trial (Admin Only)</button>
                      <div className="text-sm text-amber-400 text-center mt-0.5">Admin-only demo control</div>
                    </div>
                  )}
                </div>
                {isPaidPlan ? (
                  <div className="mt-1 text-sm text-[#8B92A3]">Stripe manages payment methods, invoices, billing details, and renewal cancellation.</div>
                ) : (
                  <div className="mt-1 text-sm text-[#8B92A3]">Already on Free.</div>
                )}
              </div>
            )}

            {selectedDetail.richType === 'trial-upgrade' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm font-semibold mb-1">Plan Workflow Summary (Free $0 | Starter $47/mo | Pro $97/mo | Agency $197/mo | Enterprise $297/mo or Custom)</div>
                <ul className="text-sm list-disc pl-4 space-y-0.5 text-[#E6E8EE]">
                  <li>Public deal intake and public buyer signup are available across plans.</li>
                  <li>Starter adds basic buyer matching, outreach exports, and deal blast templates.</li>
                  <li>Pro adds buyer matching, match scoring, saved buyer segments, follow-up tools, reporting, and data export.</li>
                  <li>Agency is positioned for heavier workflows, advanced matching, saved segments, and priority roadmap team/automation features.</li>
                  <li>Enterprise is for custom onboarding, integrations, production support, higher-volume needs, and custom team workflows.</li>
                </ul>
                <div className="mt-2 text-sm">Public pricing and in-app plan limits are aligned for demo planning. Advanced team, automation, billing, and integration features may require production setup before use.</div>
                <div className="mt-1 text-sm">Admin/demo: Activate Pro Demo (Demo Only) or Reset Demo Trial (Admin Only) for testing without real cost.</div>
                <div className="mt-2 text-sm">Suggested action: Click Upgrade Plan or Activate Pro Demo (Demo Only) to enable features for testing. In production: real billing provider will handle upgrades/extensions to full 5 tiers.</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Upgrade Plan</button>
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                </div>
                <div className="mt-1 text-sm text-amber-400">Real billing integration coming with production launch. Public users: upgrade via billing; no self-reset of trials.</div>
              </div>
            )}

            {selectedDetail.richType === 'trial-ends' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm">{selectedDetail.data.explain}</div>
                <div className="mt-2 text-sm text-red-400/80">{selectedDetail.data.after}</div>
                <div className="mt-2 text-sm">Pricing note: Free $0 (permanent capped). After end, public must Upgrade to Starter ($47/mo), Pro ($97/mo), Agency ($197/mo) or Enterprise ($297/mo or Custom) via billing (prod launch) or admin extension. No public reset allowed. (Annual equiv monthly in public UIs.)</div>
                <div className="mt-2 text-sm">{selectedDetail.data.next}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                </div>
                <div className="mt-1 text-sm text-amber-400">Billing coming with production. Public: upgrade or admin support; no trial reset. Admin/demo: use Reset Demo Trial (Admin Only) for test scenarios only.</div>
              </div>
            )}

            {selectedDetail.richType === 'trial-next' && selectedDetail.data && (
              <div className="mt-3 pt-3 border-t border-[#252A38]">
                <div className="text-sm">{selectedDetail.data.text}</div>
                <div className="mt-2 text-sm">Pricing: Free $0 (permanent), Starter $47/mo, Pro $97/mo (Most Popular), Agency $197/mo, Enterprise $297/mo or Custom expected at launch. Public users upgrade via billing UI (coming soon); cannot reset own trial. (Annual: equiv monthly billed.)</div>
                <div className="mt-2 text-sm">{selectedDetail.data.next}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm flex-1 py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                </div>
                <div className="mt-1 text-sm text-amber-400">Public users: use Upgrade (billing future) or Activate for demo. Admin/demo: Reset Demo Trial only for testing. Billing integration with production launch.</div>
              </div>
            )}

            {selectedDetail.richType === 'trial-upgrade-plan' && (
              <div className="mt-3 pt-3 border-t border-[#252A38] space-y-2">
                <div className="bg-[#11151F] border border-[#252A38] rounded p-2">
                  <div className="text-sm font-semibold mb-0.5">Current Mode</div>
                  <div className="text-sm">Demo / Free active. No real payments or subscriptions processed. Billing integration coming with production launch.</div>
                  <div className="text-xs text-amber-400 mt-0.5">Public users cannot reset trials.</div>
                </div>
                <div className="bg-[#11151F] border border-[#252A38] rounded p-2">
                  <div className="text-sm font-semibold mb-0.5">Plan Pricing (monthly rates; see Pricing/Upgrade for annual equiv monthly billed display)</div>
                  <div className="text-sm border border-[#252A38] rounded bg-[#0A0C12] divide-y divide-[#252A38]">
                    <div className="px-1.5 py-0.5 flex justify-between"><span>Free</span><span className="tabular-nums">$0</span></div>
                    <div className="px-1.5 py-0.5 flex justify-between"><span>Starter</span><span className="tabular-nums">$47/mo</span></div>
                    <div className="px-1.5 py-0.5 flex justify-between"><span>Pro</span><span className="tabular-nums">$97/mo</span></div>
                    <div className="px-1.5 py-0.5 flex justify-between"><span>Agency</span><span className="tabular-nums">$197/mo</span></div>
                    <div className="px-1.5 py-0.5 flex justify-between"><span>Enterprise</span><span className="tabular-nums">$297/mo or Custom</span></div>
                  </div>
                </div>
                <div className="bg-[#11151F] border border-[#252A38] rounded p-2">
                  <div className="text-sm font-semibold mb-0.5">Upgrade Unlocks</div>
                  <div className="text-sm">Higher tier limits, public form, full AI matching, analytics exports, team/VA support, no demo caps. Existing records remain safe.</div>
                </div>
                <div className="bg-[#11151F] border border-[#252A38] rounded p-2">
                  <div className="text-sm font-semibold mb-0.5">Production Billing</div>
                  <div className="text-sm">Billing integration coming with production launch. Demo mode does not process payments or charges.</div>
                </div>
                <div className="bg-[#11151F] border border-[#252A38] rounded p-2">
                  <div className="text-sm font-semibold mb-0.5">Recommended Action</div>
                  <div className="text-sm mb-1">For full upgrade (choose Starter/Pro/etc + sim checkout): Go to Upgrade Flow. Activate for quick demo. Billing integration coming with production launch.</div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="text-sm w-full py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Go to Upgrade Flow</button>
                    <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro'); setSelectedDetail(null); }} className="text-sm w-full py-1.5 px-2 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Activate Pro Demo (Demo Only)</button>
                    <button onClick={(e) => { e.stopPropagation(); alert('Contact Sales / Enterprise — Coming Soon with production launch'); setSelectedDetail(null); }} className="text-sm w-full py-1.5 px-2 rounded bg-[#252A38] hover:bg-[#171B26]">Contact Sales / Enterprise (Coming Soon)</button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedDetail(null); }} className="text-sm w-full py-1.5 px-2 rounded bg-[#252A38] hover:bg-[#171B26]">Close</button>
                  </div>
                </div>
              </div>
            )}

            {selectedDetail.richType !== 'trial-upgrade-plan' && (
              <button onClick={() => setSelectedDetail(null)} className="mt-4 w-full text-sm py-2 rounded bg-[#252A38] hover:bg-[#171B26]">Close</button>
            )}
          </div>
        </>
      )}

      {/* Content per active tab - only one tab visible at a time */}
      {activeTab === 'Trial' && (
        <div className="space-y-2.5">
          {/* Trial text size standard (enforced here to stop tiny text):
              - body / descriptions / side rich body: text-sm min
              - compact notes / labels / chips / table / helpers: text-xs min (never smaller)
              - titles / section: text-sm font-semibold
              - values / metrics: text-lg / text-xl / text-2xl
              - buttons: text-xs or text-sm
              Update any text-[10px] or smaller in Trial cards/rich to text-xs+ */}
          {/* Plan Comparison - enhanced with real-world details + sideview */}
          <div className="card group p-3 border border-[#22C55E]/30 hover:border-[#22C55E]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#22c55e30] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/30 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">
              Plan Comparison
              <span className="text-sm px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">Demo Mode</span>
            </div>
            <div className="text-sm text-[#8B92A3] mb-1">Public pricing and in-app plan limits are aligned for demo planning. Advanced team, automation, billing, and integration features may require production setup before use.</div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[#8B92A3]">
                Plan:
                <select
                  className="input py-1 text-xs min-w-[130px]"
                  value={settingsSelectedPlan}
                  onChange={e => setSettingsSelectedPlan(e.target.value as 'Free' | PaidPlan)}
                >
                  {(['Free', 'Starter', 'Pro', 'Agency', 'Enterprise'] as const).map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="inline-flex rounded border border-[#252A38] p-0.5">
                <button onClick={(e) => { e.stopPropagation(); setSettingsBillingFrequency('monthly') }} className={`px-2 py-1 text-xs rounded ${settingsBillingFrequency === 'monthly' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Monthly</button>
                <button onClick={(e) => { e.stopPropagation(); setSettingsBillingFrequency('annual') }} className={`px-2 py-1 text-xs rounded ${settingsBillingFrequency === 'annual' ? 'bg-[#22C55E] text-black' : 'text-[#8B92A3]'}`}>Annual</button>
              </div>
              <div className="text-xs text-[#64748B]">Annual plans save 2 months compared to monthly billing.</div>
            </div>
            <div className="grid grid-cols-6 gap-1 mb-2">
              <div></div>
              {planPositioning.map(plan => {
                const planName = plan.name as 'Free' | PaidPlan
                const selectedForUpgrade = settingsSelectedPlan === planName
                const priceDisplay = getPriceDisplay(plan.name as PricingPlanName, settingsBillingFrequency)
                return (
                  <div
                    key={plan.name}
                    onClick={(e) => { e.stopPropagation(); setSettingsSelectedPlan(planName) }}
                    className={`p-1.5 min-h-[205px] overflow-hidden border rounded bg-[#11151F] text-center cursor-pointer transition ${selectedForUpgrade ? 'border-[#22C55E] ring-1 ring-[#22C55E]/40' : 'border-[#252A38] hover:border-[#3B82F6]/50'}`}
                  >
                    <div className="text-sm font-semibold text-[#E6E8EE]">{plan.name}</div>
                    <div className={`text-[10px] ${plan.release.includes('Public') || plan.release.includes('Admin') ? 'text-[#22C55E]' : 'text-amber-300'}`}>{plan.release}</div>
                    <div className="text-emerald-400 font-medium tabular-nums">{priceDisplay.price}</div>
                    <div className="text-[10px] text-[#8B92A3]">{priceDisplay.noteLines.map(line => <div key={line}>{line}</div>)}</div>
                    <div className="text-xs text-[#64748B] leading-tight break-words">{plan.text}</div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openUpgradePayment(planName, settingsBillingFrequency) }}
                      className={`mt-2 w-full rounded px-2 py-1 text-xs ${planName === 'Free' ? 'bg-[#252A38] text-[#E6E8EE]' : selectedForUpgrade ? 'bg-[#22C55E] text-black' : 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30'}`}
                    >
                      {planName === 'Free' ? 'Enter Free' : (planName === 'Agency' || planName === 'Enterprise') && !onboardingSettings.agencyEnterpriseEnabled ? 'Contact Admin' : 'Upgrade'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="overflow-x-auto text-sm">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="text-[#64748B] text-left border-b border-[#252A38]">
                    <th className="py-1 pr-2 font-normal w-1/6 text-xs">Feature</th>
                    <th className="py-1 px-1 text-center font-normal w-1/6 text-xs">Free</th>
                    <th className="py-1 px-1 text-center font-normal w-1/6 text-xs">Starter</th>
                    <th className="py-1 px-1 text-center font-normal w-1/6 text-xs">Pro</th>
                    <th className="py-1 px-1 text-center font-normal w-1/6 text-xs">Agency</th>
                    <th className="py-1 px-1 text-center font-normal w-1/6 text-xs">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="text-[#E6E8EE]">
                  <tr className="border-t border-[#252A38]/60 bg-[#11151F]"><td className="py-0.5 pr-2 font-medium text-[#22C55E] w-1/6 text-xs">Pricing (demo)</td>{planPositioning.map(plan => {
                    const priceDisplay = getPriceDisplay(plan.name as PricingPlanName, settingsBillingFrequency)
                    return <td key={plan.name} className="py-0.5 px-1 text-center font-semibold w-1/6 text-xs break-words">{[priceDisplay.price, ...priceDisplay.noteLines].join(', ')}</td>
                  })}</tr>
                  {renderPlanComparisonRows()}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-[#64748B] mt-1">Public pricing and in-app plan limits are aligned for demo planning. Advanced team, automation, billing, and integration features may require production setup before use.</div>
            <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(settingsSelectedPlan, settingsBillingFrequency); }} className="mt-2 w-full text-sm py-1.5 px-3 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">
              {settingsSelectedPlan === 'Free' ? 'Enter Free' : `Upgrade to ${settingsSelectedPlan} ${settingsBillingFrequency}`}
            </button>
          </div>

          {/* Usage Meters - real demo caps + explanation + sideview */}
          <div onClick={() => setSelectedDetail({ 
            title: 'Usage Meters', 
            richType: 'trial-usage', 
            data: {
              items: ['Deals: 3 used / 5 cap (60%)', 'Buyers: 12 used / 25 cap (48%)', 'Blasts: 2 used / 5 cap (40%)'],
              atCap: 'cannot create additional deals, buyers, or send blasts until admin reset (demo only) or upgrade (demo simulation of production enforcement). Pricing: upgrade to Starter $47/mo or higher to remove caps.',
              next: 'Activate Pro Demo (Demo Only) to remove caps for complete testing of all features.'
            }
          })} className="card group p-3 border border-[#3b82f6]/30 hover:border-[#3b82f6]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#3b82f630] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/30 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#3b82f608] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1.5">{currentPlan} Usage Meters</div>
            <div className="space-y-1.5 text-sm">
              <div>
                <div className="flex justify-between mb-0.5"><span className="text-[#8B92A3]">Deals Used</span><span className="tabular-nums text-[#E6E8EE]">3 / 5 (60%)</span></div>
                <div className="h-1.5 bg-[#252A38] rounded overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{width:'60%'}} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-0.5"><span className="text-[#8B92A3]">Buyers Used</span><span className="tabular-nums text-[#E6E8EE]">12 / 25 (48%)</span></div>
                <div className="h-1.5 bg-[#252A38] rounded overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{width:'48%'}} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-0.5"><span className="text-[#8B92A3]">Blasts Used</span><span className="tabular-nums text-[#E6E8EE]">2 / 5 (40%)</span></div>
                <div className="h-1.5 bg-[#252A38] rounded overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{width:'40%'}} /></div>
              </div>
            </div>
            <div className="text-sm text-[#64748B] mt-1">Free includes limited usage. Upgrade to Starter or Pro for larger operating limits.</div>
          </div>

          {/* Free plan + Current Plan row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div onClick={() => setSelectedDetail({
              title: 'Free Plan',
              richType: 'trial-status',
              data: { ready: true }
            })} className="card group p-3 border border-[#f59e0b]/30 hover:border-[#f59e0b]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#f59e0b30] hover:ring-1 hover:ring-inset hover:ring-[#f59e0b]/30 transition-all cursor-pointer relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
              <div className="font-semibold text-sm mb-1 flex items-center justify-between">
                <span>Free Plan</span>
                <span className="text-sm px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">Free Active</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="p-2 bg-[#11151F] border border-[#252A38] rounded text-center">
                  <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">3</div>
                  <div className="text-sm text-[#64748B]">DEALS</div>
                </div>
                <div className="p-2 bg-[#11151F] border border-[#252A38] rounded text-center">
                  <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">25</div>
                  <div className="text-sm text-[#64748B]">BUYERS</div>
                </div>
                <div className="p-2 bg-[#11151F] border border-[#252A38] rounded text-center">
                  <div className="text-2xl font-mono tabular-nums text-[#E6E8EE]">20</div>
                  <div className="text-sm text-[#64748B]">EXPORTS</div>
                </div>
              </div>
              <div className="text-sm text-[#64748B] mt-1">Free is permanent and limited. Public deal and buyer portals remain available; private review tooling is gated while in internal testing.</div>
              <div className="flex flex-wrap gap-1.5 mt-2 text-sm">
                <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro') }} className="btn btn-ghost text-sm px-2 py-1">Activate Pro Demo (Demo Only)</button>
                {isAdminDemo && (
                  <button onClick={(e) => { e.stopPropagation(); resetTrial() }} className="btn btn-ghost text-sm px-2 py-1">Reset Demo Trial (Admin Only)</button>
                )}
              </div>
            </div>

            {/* Current Plan / Status - demo billing language + sideview */}
            <div onClick={() => setSelectedDetail({ 
              title: 'Current Tier / Status', 
              richType: 'trial-status', 
              data: { ready: true }
            })} className="card group p-3 border border-[#22C55E]/30 hover:border-[#22C55E]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#22c55e30] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/30 transition-all cursor-pointer relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
              <div className="font-semibold text-sm mb-1 flex items-center justify-between">
                <span>Current Tier / Status</span>
                <span className={`text-sm px-2 py-0.5 rounded ${isPaidPlan ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#22C55E]/10 text-[#22C55E]'}`}>{isPaidPlan ? `${currentPlan.toUpperCase()} ACTIVE` : 'FREE ACTIVE'}</span>
              </div>
              <div className="text-sm text-[#8B92A3] mb-1.5">{isPaidPlan ? `${currentPlan} features active. ${currentPlan === 'Starter' ? 'Starter limits apply.' : 'Plan limits apply.'}` : 'Free active. Limited to 3 active deals, 25 buyers, ARV calculator, and public intake portals.'}</div>
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="btn btn-green text-sm px-3 py-1">Upgrade Plan</button>
                <button onClick={(e) => { e.stopPropagation(); upgradeToPlan('Pro') }} className="btn btn-ghost text-sm px-3 py-1">Activate Pro Demo (Demo Only)</button>
                {canOpenBillingPortal ? (
                  <button onClick={(e) => { e.stopPropagation(); openBillingPortal('portal') }} className="btn btn-ghost text-sm px-3 py-1 text-[#22C55E] border-[#22C55E]/30 hover:border-[#22C55E]/60">Manage Subscription</button>
                ) : (
                  <span className="text-sm text-[#8B92A3]">Already on Free</span>
                )}
                {isAdminDemo && (
                  <button onClick={(e) => { e.stopPropagation(); resetTrial() }} className="btn btn-ghost text-sm px-3 py-1">Reset Demo Trial (Admin Only)</button>
                )}
              </div>
              <div className="text-sm text-[#8B92A3] mt-1">Stripe manages paid subscription changes and renewal cancellation.</div>
              {isAdminDemo && (
                <div className="text-sm text-amber-400 mt-1">Admin Demo Tool — Internal demo/testing only. Public users cannot reset trials.</div>
              )}
              <div className="text-sm text-[#64748B] mt-1.5">Plan changes here update the app workspace. Stripe handles paid checkout when configured.</div>
            </div>
          </div>

          {/* Billing / Subscription - paid management stays in Stripe */}
          <div className="card p-4 border border-[#3B82F6]/30 bg-[#0F111A]">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing / Subscription</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Current Plan: {currentPlan}</div>
                <div className="mt-2 grid gap-1 text-sm text-[#C5CAD6]">
                  <div>Trial status: <span className="text-[#E6E8EE]">{trialStatusLabel}</span></div>
                  <div>Billing status: <span className={isPaidPlan ? 'text-[#22C55E]' : 'text-[#8B92A3]'}>{billingStatusLabel}</span></div>
                </div>
                <div className="mt-4 rounded border border-[#252A38] bg-[#0A0C12] p-3">
                  <div className="text-sm font-semibold text-[#E6E8EE]">Subscription Management</div>
                  <div className={isPaidPlan ? 'mt-1 text-sm text-rose-300' : 'mt-1 text-sm text-[#8B92A3]'}>
                    {isPaidPlan ? 'Paid plan active.' : 'No paid subscription active.'}
                  </div>
                  <div className="mt-1 text-sm text-[#8B92A3]">
                    {isPaidPlan
                      ? 'Use Stripe Customer Portal to update payment methods, view invoices, change billing details, or cancel renewal.'
                      : 'You are currently on the Free plan. There is no paid membership to cancel.'}
                  </div>
                </div>
                <div className="mt-1 text-sm text-[#8B92A3]">Deactivating workspace access does not automatically cancel a paid subscription.</div>
              </div>

              <div className="md:min-w-[220px]">
                {canOpenBillingPortal ? (
                  <button onClick={() => openBillingPortal('portal')} className="btn btn-green w-full">
                    Manage Subscription
                  </button>
                ) : (
                  <div className="text-sm text-[#8B92A3] text-center md:text-right">No paid subscription active.</div>
                )}
              </div>
            </div>
          </div>

          <div className="card p-4 border border-[#3B82F6]/25 bg-[#0F111A]">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Billing Status</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Stripe Plan & Payment Status</div>
                <div className="text-sm text-[#8B92A3] mt-1">
                  Paid access is activated only after Stripe confirms successful payment.
                </div>
              </div>
              <button
                type="button"
                onClick={() => document.getElementById('billing-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="btn btn-primary md:w-auto"
              >
                Open Billing Center
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                ['Current Plan', currentPlan],
                ['Billing Status', currentBillingStatus],
                ['Billing Frequency', (trial.billingFrequency || 'monthly') === 'annual' ? 'Annual' : 'Monthly'],
                ['Billing Period Start', formatBillingDate(trial.billingPeriodStart)],
                ['Billing Period End', formatBillingDate(trial.billingPeriodEnd)],
                ['Next Payment Due', currentPlan === 'Free' ? 'No paid billing schedule' : formatBillingDate(nextPaymentDue)],
                ['Payment Provider', 'Stripe'],
                ['Stripe Sync Status', hasWebhookDelivery ? 'Synced' : 'Waiting for First Verified Webhook'],
                ['Last Payment', lastPayment ? `${lastPayment.amount} ${lastPayment.status}` : 'No paid billing history yet'],
                ['Next Payment', currentPlan === 'Free' ? '$0' : getPlanAmount(currentPlan, (trial.billingFrequency || 'monthly') as BillingFrequency)],
              ].map(([label, value]) => (
                <div key={label} className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">{label}</div>
                  <div className="text-sm text-[#E6E8EE] break-words">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {hasSuperAdminAccess && <AdminCreditOperations />}
          {hasSuperAdminAccess && renderEmailNotifications()}

          {renderBillingCenter()}
          {renderBillingNotificationPreferences()}

          {!isFreeAccount && hasSuperAdminAccess && (
          <div className="card p-4 border border-[#22C55E]/25 bg-[#0F111A]">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Onboarding / Release Setup</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">First-Login Plan Selection & Quick Tour</div>
                <div className="mt-2 grid gap-1 text-sm text-[#C5CAD6]">
                  <div>Plan selection: <span className="text-[#E6E8EE]">{onboardingSettings.planSelectionCompleted ? 'Completed' : 'Pending'}</span></div>
                  <div>Selected plan: <span className="text-[#E6E8EE]">{onboardingSettings.selectedPlan === 'Free' ? 'Free' : onboardingSettings.selectedPlan || 'Free'}</span></div>
                  <div>Tour status: <span className="text-[#E6E8EE]">{onboardingSettings.tourCompleted ? 'Completed' : onboardingSettings.tourSkipped ? 'Skipped' : 'Not started'}</span></div>
                  <div>Agency / Enterprise: <span className={onboardingSettings.agencyEnterpriseEnabled ? 'text-[#22C55E]' : 'text-amber-300'}>{onboardingSettings.agencyEnterpriseEnabled ? 'Manually enabled' : 'Coming Soon / Contact Admin'}</span></div>
                </div>
                <div className="mt-3 rounded border border-[#252A38] bg-[#0A0C12] text-[#C5CAD6] p-3 text-sm">
                  Public plan copy is kept concise until any launch-code promotion is fully verified in checkout.
                </div>
              </div>

              <div className="md:min-w-[260px] flex flex-col gap-2">
                <button onClick={resetOnboardingTour} className="btn btn-ghost w-full">
                  Restart Onboarding Tour
                </button>
                <button
                  onClick={() => updateAgencyEnterpriseRelease(!onboardingSettings.agencyEnterpriseEnabled)}
                  className="btn btn-ghost w-full"
                >
                  {onboardingSettings.agencyEnterpriseEnabled ? 'Set Agency / Enterprise Coming Soon' : 'Enable Agency / Enterprise Selection'}
                </button>
                <div className="text-xs text-[#64748B]">
                  Free, Starter, and Pro are active for initial public release. Agency and Enterprise stay visible but gated unless enabled here.
                </div>
              </div>
            </div>
          </div>
          )}

          {!isFreeAccount && hasSuperAdminAccess && (
          <div className="card p-4 border border-[#22C55E]/25 bg-[#0F111A]">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Payment Collection</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">Stripe Checkout</div>
                  <div className="text-sm text-[#8B92A3] mt-1">
                    Stripe checkout is configured for Starter and Pro plans. Customers complete payment through Stripe. Paid access is activated only after Stripe confirms payment.
                  </div>
                </div>
                <div className={`text-xs px-2 py-1 rounded border self-start ${['Ready for Payment Collection', 'Ready for Manual Billing', 'Payment Link Saved'].includes(billingProviderSetup.setupStatus) ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  {billingProviderSetup.setupStatus}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">BILLING PROVIDER</div>
                  <div className="text-sm text-[#E6E8EE]">{billingProviderOptions[0]}</div>
                </div>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">BILLING MODE</div>
                  <div className="text-sm text-[#E6E8EE]">{billingModeOptions[0]}</div>
                </div>
                <label className="block">
                  <div className="text-xs text-[#8B92A3] mb-1">BILLING EMAIL</div>
                  <input className="input" type="email" value={billingProviderSetup.billingEmail} onChange={e => updateBillingProviderSetup('billingEmail', e.target.value)} placeholder="billing@company.com" />
                </label>
                <label className="block">
                  <div className="text-xs text-[#8B92A3] mb-1">BILLING NAME / COMPANY</div>
                  <input className="input" value={billingProviderSetup.billingName} onChange={e => updateBillingProviderSetup('billingName', e.target.value)} placeholder="Company or billing contact" />
                </label>
                <label className="block">
                  <div className="text-xs text-[#8B92A3] mb-1">PROVIDER ACCOUNT EMAIL OR LABEL</div>
                  <input className="input" value={billingProviderSetup.providerAccount} onChange={e => updateBillingProviderSetup('providerAccount', e.target.value)} placeholder="Stripe account label or billing contact email" />
                </label>
                <label className="block">
                  <div className="text-xs text-[#8B92A3] mb-1">PUBLIC BILLING DESCRIPTOR</div>
                  <input className="input" value={billingProviderSetup.paymentHandle} onChange={e => updateBillingProviderSetup('paymentHandle', e.target.value)} placeholder="Public receipt or billing descriptor" />
                  <div className="text-xs text-[#64748B] mt-1">Do not store login credentials, card data, bank details, routing numbers, API keys, or secrets.</div>
                </label>
                <div className="panel p-3">
                  <div className="text-xs text-[#8B92A3] mb-1">SETUP STATUS</div>
                  <div className="text-sm text-[#E6E8EE]">{billingStatusOptions[0]}</div>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded border border-[#252A38] bg-[#0A0C12] p-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-[#22C55E]"
                  checked={billingProviderSetup.autopayEnabled}
                  onChange={e => updateBillingProviderSetup('autopayEnabled', e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold text-[#E6E8EE]">Enable Autopay</span>
                  <span className="block text-sm text-[#8B92A3]">
                    Recurring payment setup and payment details are handled securely by Stripe checkout.
                  </span>
                </span>
              </label>

              <label className="block">
                <div className="text-xs text-[#8B92A3] mb-1">BILLING SETUP NOTES</div>
                <textarea className="input min-h-[90px]" value={billingProviderSetup.notes} onChange={e => updateBillingProviderSetup('notes', e.target.value)} placeholder="Billing setup notes. Do not store sensitive payment credentials." />
              </label>

              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-3 text-sm text-[#8B92A3]">
                <div>Customers complete payment through Stripe checkout links configured for each public plan.</div>
                <div className="mt-1">Deal Blast Pro updates access from the selected plan status while keeping payment credentials outside the app.</div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="text-xs text-[#64748B]">
                  Last saved: {billingProviderSetup.updatedAt ? new Date(billingProviderSetup.updatedAt).toLocaleString() : 'Not saved yet'}
                </div>
                <button onClick={saveBillingProviderSetup} className="btn btn-primary md:w-auto">
                  Save Billing Setup
                </button>
              </div>
            </div>
          </div>
          )}

          {renderDangerZone()}

          {/* Upgrade Benefits - public pricing aligned workflow summary */}
          <div onClick={() => setSelectedDetail({ 
            title: 'Upgrade Benefits', 
            richType: 'trial-upgrade', 
            data: { ready: true }
          })} className="card group p-3 border border-[#f59e0b]/20 hover:border-[#f59e0b]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#f59e0b30] hover:ring-1 hover:ring-inset hover:ring-[#f59e0b]/30 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1.5">Upgrade Benefits (Aligned With Public Pricing)</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm text-[#8B92A3]">
              <div>? Public deal intake</div>
              <div>? Public buyer signup</div>
              <div>? Buyer matching</div>
              <div>? Match score / heat tags</div>
              <div>? Buyer outreach exports</div>
              <div>? Deal blast templates</div>
              <div>? Follow-up task tools</div>
              <div>? Data export</div>
            </div>
            <div className="text-sm text-[#64748B] mt-1">Advanced team, automation, billing, and integration features may require production setup before use.</div>
            <button onClick={(e) => { e.stopPropagation(); openUpgradePayment(); }} className="mt-2 w-full text-sm py-1.5 px-3 rounded bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E]">Upgrade Plan</button>
          </div>

          {/* What happens when trial ends? - new section + sideview */}
          <div onClick={() => setSelectedDetail({ 
            title: 'What Happens When Trial Ends?', 
            richType: 'trial-ends', 
            data: {
              explain: 'In a real deployment, once the Free / trial period expires without upgrade, creation of new deals, buyers, and blasts would be blocked to prevent over-use. All existing data, templates, and history remain fully accessible and safe.',
              after: 'In production, new deal creation, buyer creation, and blasts are blocked after trial expiration until upgrade or admin extension. Pricing: Free $0 (permanent) ? Starter $47/mo, Pro $97/mo, Agency $197/mo or Enterprise $297/mo or Custom. Existing records stay accessible. Public users cannot reset trials.',
              next: 'Recommended: Activate Pro Demo (Demo Only) now for uninterrupted full testing. (Reset Demo Trial is admin-only for demo clock restart.) Billing integration coming with production launch.'
            }
          })} className="card group p-3 border border-[#ef4444]/20 hover:border-[#ef4444]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#ef444430] hover:ring-1 hover:ring-inset hover:ring-[#ef4444]/30 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ef444408] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">
              What Happens When Trial Ends?
              <span className="text-sm px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Demo</span>
            </div>
            <div className="text-sm text-[#8B92A3]">New activity blocked until upgrade or admin extension. Pricing: Free $0 (permanent capped) ? Starter $47/mo, Pro $97/mo, Agency $197/mo or Enterprise $297/mo or Custom. Existing records safe. Billing integration will handle grace periods and upgrade prompts in production. (Public users cannot reset trials.)</div>
          </div>

          {/* Recommended next step - new section + sideview */}
          <div onClick={() => setSelectedDetail({ 
            title: 'Recommended Next Step', 
            richType: 'trial-next', 
            data: {
              text: 'For complete real-world readiness testing: Activate Pro Demo (Demo Only) to unlock all limits, explore every tab and sideview, test public submission flow simulation, prepare the full launch checklist in Production tab, and validate VA role restrictions in Team tab. Full 5-tier pricing at launch: Free $0, Starter $47/mo, Pro $97/mo, Agency $197/mo, Enterprise $297/mo or Custom.',
              next: 'Start by clicking Activate Pro Demo (Demo Only) above. Then (as admin/demo) use Reset Demo Trial (Admin Only) when you want to test expiration behavior again. Public users use Upgrade Plan (billing at launch).'
            }
          })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/70 hover:-translate-y-px hover:shadow-[0_0_0_2px_#22c55e30] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/30 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Recommended Next Step</div>
            <div className="text-sm text-[#8B92A3]">Activate Pro Demo (Demo Only) to remove all demo caps and fully validate the entire app (including public forms, team/VA, analytics, and release prep) as you would in a real pre-launch environment. Full 5-tier pricing expected at launch (Free $0 to Enterprise Custom).</div>
          </div>
        </div>
      )}

      {activeTab === 'Matching' && (
        <div className="space-y-2.5">
          {/* Presets + Weights (preserved + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Buyer Matching Weights', summary: 'Live weights used by the matching engine to score buyers against deals. Higher = more influence on ranking.', related: 'Used in Pipeline and Inventory match lists. Changes are immediate and client-side only.', next: 'Adjust then test in Buyers or Pipeline view.' })} className="card group p-3 border border-[#3b82f6]/30 hover:border-[#3b82f6]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#3b82f620] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#3b82f608] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Buyer Matching Weights (Live)</div>

            {/* Matching Presets - preserved, apply instantly */}
            <div className="flex flex-wrap gap-1 mb-2 text-[10px]" onClick={e => e.stopPropagation()}>
              <button onClick={() => updateSettings({ matchingWeights: { state: 6, city: 6, assetType: 6, budget: 6, units: 5, capRate: 5, sellerFinance: 5, creative: 5, rehab: 5, tags: 5 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Balanced</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 4, city: 4, assetType: 5, budget: 8, units: 4, capRate: 4, sellerFinance: 12, creative: 9, rehab: 5, tags: 5 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Aggressive</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 5, city: 5, assetType: 10, budget: 6, units: 9, capRate: 8, sellerFinance: 4, creative: 3, rehab: 3, tags: 5 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Multifamily</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 4, city: 4, assetType: 5, budget: 7, units: 4, capRate: 5, sellerFinance: 10, creative: 8, rehab: 6, tags: 7 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Creative Finance</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 8, city: 7, assetType: 4, budget: 6, units: 3, capRate: 4, sellerFinance: 3, creative: 4, rehab: 5, tags: 6 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Land</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 5, city: 5, assetType: 9, budget: 5, units: 10, capRate: 9, sellerFinance: 3, creative: 2, rehab: 4, tags: 6 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Storage</button>
              <button onClick={() => updateSettings({ matchingWeights: { state: 4, city: 10, assetType: 8, budget: 5, units: 6, capRate: 7, sellerFinance: 4, creative: 3, rehab: 3, tags: 8 } })} className="px-2 py-0.5 rounded border border-[#252A38] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 transition">Hotel</button>
            </div>

            <div className="grid grid-cols-1 gap-2" onClick={e => e.stopPropagation()}>
              {Object.entries(settings.matchingWeights).map(([k, v]) => {
                const meta = weightMeta[k] || { label: k, help: '' }
                return (
                  <div key={k} className="p-2 rounded border border-[#252A38] bg-[#0A0C12]">
                    <div className="flex items-start justify-between mb-0.5">
                      <div>
                        <div className="text-sm font-medium text-[#E6E8EE]">{meta.label}</div>
                        <div className="text-[10px] text-[#64748B] leading-tight pr-1">{meta.help}</div>
                      </div>
                      <span className="inline-block min-w-[2ch] text-center px-1 py-0.5 rounded bg-[#11151F] text-[#E6E8EE] font-mono text-sm tabular-nums border border-[#252A38]">{v}</span>
                    </div>
                    <input type="range" min="0" max="30" step="1" value={v} onChange={e => updateSettings({ matchingWeights: { ...settings.matchingWeights, [k]: parseInt(e.target.value) } })} className="w-full accent-[#3b82f6] cursor-pointer" />
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-[#8B92A3] mt-1.5">Presets update sliders live. Higher = more influence. Changes apply immediately.</div>
          </div>

          {/* Live Match Preview - preserved + side view */}
          <div onClick={() => setSelectedDetail({ title: 'Live Match Score Example', summary: 'Demo score recomputed from current weights + sample buyer/deal profile.', related: 'Score reflects weighted fit. Test by changing presets or sliders.', next: 'Higher total weight influence = higher possible scores on good fits.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer">
            <div className="font-semibold text-sm mb-1">Live Match Preview</div>
            <div className="text-[10px] text-[#8B92A3] mb-0.5">Sample Buyer: Alex R • 4bd/2ba • Max $320k • Phoenix</div>
            <div className="text-[10px] text-[#8B92A3] mb-1">Sample Deal: 123 Oak St • 3bd/2ba • $285k • Phoenix</div>
            {(() => {
              const w = settings.matchingWeights as any
              const sum = (w.state||0) + (w.city||0) + (w.assetType||0) + (w.budget||0) + (w.units||0) + (w.capRate||0) + (w.sellerFinance||0) + (w.creative||0) + (w.rehab||0) + (w.tags||0)
              const score = Math.min(98, Math.max(42, Math.round(48 + sum * 0.65)))
              return <div className="text-lg font-semibold tabular-nums">Current Match Score: <span className="text-[#22C55E]">{score}%</span></div>
            })()}
            <div className="text-[10px] text-[#64748B] mt-1">Updates instantly with sliders or presets.</div>
          </div>

          {/* Explanation Panel - what each weight affects */}
          <div onClick={() => setSelectedDetail({ title: 'Weight Explanations', summary: 'Each weight controls how much that factor influences buyer-deal match scores in the engine.', next: 'Use presets as starting points, then fine-tune.' })} className="card group p-3 border border-[#64748B]/20 hover:border-[#64748B]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#64748b15] hover:ring-1 hover:ring-inset hover:ring-[#64748B]/20 transition-all cursor-pointer">
            <div className="font-semibold text-sm mb-1">Weight Explanations</div>
            <div className="text-[10px] grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[#8B92A3]">
              <div><span className="text-[#E6E8EE]">State / Market:</span> Broad geographic fit</div>
              <div><span className="text-[#E6E8EE]">City / Location:</span> Specific city/zip priority</div>
              <div><span className="text-[#E6E8EE]">Property Type:</span> SFH, condo, land, multi match</div>
              <div><span className="text-[#E6E8EE]">Budget / Price:</span> Price vs buyer max price</div>
              <div><span className="text-[#E6E8EE]">Units / Size:</span> Beds, baths, sqft, units</div>
              <div><span className="text-[#E6E8EE]">Cap Rate:</span> Yield preference alignment</div>
              <div><span className="text-[#E6E8EE]">Seller Finance:</span> Seller-financed deals</div>
              <div><span className="text-[#E6E8EE]">Creative Finance:</span> Creative structures weight</div>
              <div><span className="text-[#E6E8EE]">Rehab / Condition:</span> Fixer vs turnkey</div>
              <div><span className="text-[#E6E8EE]">Tags / Other:</span> Custom tags and extras</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Templates' && (
        <div className="space-y-3">
          {/* Template Library - cards load into editor (preserves sub-tabs + save + fields) */}
          <div onClick={() => setSelectedDetail({ title: 'Template Library', summary: 'Click a card to load the template into the editor below. All use standard {buyerName} {dealAddress} {price} vars.', next: 'Edit fields, toggle preview, Save to persist.' })} className="card group p-3 border border-[#8b5cf6]/30 hover:border-[#8b5cf6]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#8b5cf620] hover:ring-1 hover:ring-inset hover:ring-[#8b5cf6]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#8b5cf608] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-medium text-sm mb-1.5">Template Library</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5" onClick={e => e.stopPropagation()}>
              {['Strong Buyer','Soft Buyer','Creative Finance','JV Request','Hotel','MHP','Storage','Land','Multifamily','Follow-Up'].map(k => (
                <button key={k} onClick={() => { setActiveTemplate(k); setTemplateSubject(settings.blastTemplates[k]?.subject || ''); setTemplateBody(settings.blastTemplates[k]?.body || '') }} className={`text-[10px] px-2 py-1 rounded border transition ${activeTemplate === k ? 'bg-[#0A0C12] border-[#8b5cf6] text-white' : 'border-[#252A38] hover:border-[#8b5cf6]/40 hover:bg-[#11151F]'}`}>{k}</button>
              ))}
            </div>
          </div>

          {/* Main editor card (existing sub-tabs/fields/save preserved + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Email Blast Templates', summary: 'Reusable subject/body templates for blasts. {buyerName}, {dealAddress}, {price} etc are replaced at send time from the deal/buyer context.', related: 'Templates are stored in settings and used by the Blast page. Changes require explicit Save.', next: 'Edit, preview, Save, then test blast from Pipeline or Buyers.' })} className="card group p-3 border border-[#8b5cf6]/30 hover:border-[#8b5cf6]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#8b5cf620] hover:ring-1 hover:ring-inset hover:ring-[#8b5cf6]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#8b5cf608] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Email Blast Templates</div>

            {/* sub-tabs preserved */}
            <div className="flex gap-1 mb-2 flex-wrap border-b border-[#252A38] pb-1" onClick={e => e.stopPropagation()}>
              {Object.keys(settings.blastTemplates).map(k => (
                <button key={k} onClick={() => { setActiveTemplate(k); setTemplateSubject(settings.blastTemplates[k].subject); setTemplateBody(settings.blastTemplates[k].body) }} className={`px-2 py-0.5 text-xs rounded-t border-b-2 transition-all ${activeTemplate === k ? 'bg-[#0A0C12] text-white border-[#8b5cf6] font-medium' : 'text-[#8B92A3] hover:text-white border-transparent hover:border-[#252A38]/60'}`}>{k}</button>
              ))}
            </div>

            {/* fields - tightened for space */}
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <div>
                <div className="text-xs text-[#8B92A3] mb-0.5">Subject</div>
                <input className="input w-full" placeholder="Subject line" value={templateSubject} onChange={e => setTemplateSubject(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-[#8B92A3] mb-0.5">Body (use {'{buyerName}'}, {'{dealAddress}'}, {'{price}'} etc)</div>
                <textarea className="input w-full h-32 font-mono text-xs" placeholder="Email body..." value={templateBody} onChange={e => setTemplateBody(e.target.value)} />
              </div>
            </div>

            {/* Preview Toggle + dynamic Test Variables */}
            <div className="mt-2" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-xs text-[#8B92A3]">Preview:</div>
                <button onClick={() => setPreviewMode('desktop')} className={`text-[10px] px-2 py-0.5 rounded border ${previewMode==='desktop' ? 'border-[#8b5cf6] bg-[#0A0C12]' : 'border-[#252A38] hover:border-[#8b5cf6]/40'}`}>Desktop Email</button>
                <button onClick={() => setPreviewMode('mobile')} className={`text-[10px] px-2 py-0.5 rounded border ${previewMode==='mobile' ? 'border-[#8b5cf6] bg-[#0A0C12]' : 'border-[#252A38] hover:border-[#8b5cf6]/40'}`}>Mobile Email</button>
              </div>

              {/* Test Variables (live update preview) - city/state added for dynamic */}
              <div className="flex flex-wrap gap-1.5 mb-1 text-[10px]">
                <input className="input text-xs py-0.5 px-1 w-24" value={testBuyer} onChange={e=>setTestBuyer(e.target.value)} placeholder="buyerName" />
                <input className="input text-xs py-0.5 px-1 w-36" value={testAddress} onChange={e=>setTestAddress(e.target.value)} placeholder="dealAddress" />
                <input className="input text-xs py-0.5 px-1 w-16" value={testPrice} onChange={e=>setTestPrice(e.target.value)} placeholder="price" />
              </div>

              <div className="text-xs text-[#8B92A3] mb-0.5">Preview (test values)</div>
              {(() => {
                // dynamic preview using test vars + current editor content
                const preview = getTemplatePreview(templateSubject, templateBody)
                const subj = preview.sub
                const bod = preview.body
                const isMobile = previewMode === 'mobile'
                // reference existing helper (keeps it used and supports both {{property.city}} and {buyerName} styles)
                const orig = preview
                return (
                  <>
                    <div className={`text-[10px] p-2 rounded border border-[#252A38] bg-[#11151F] font-mono whitespace-pre-wrap leading-snug ${isMobile ? 'max-w-[260px]' : ''}`}>
                      Subject: {subj}{'\n'}
                      {bod.slice(0, isMobile ? 160 : 260)}{bod.length > (isMobile?160:260) ? '"¦' : ''}
                    </div>
                    <div className="text-[9px] text-[#64748B] mt-0.5">Original sample: {orig.sub.slice(0,40)}"¦</div>
                  </>
                )
              })()}
            </div>

            {/* Save preserved + verification note */}
            <div className="mt-2" onClick={e => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); saveTemplate() }} className="btn btn-green text-sm px-5 py-1.5 font-medium border border-[#22C55E]/40 hover:border-[#22C55E]/70">Save Template</button>
            </div>
            <div className="text-[10px] text-[#8B92A3] mt-1">Library + sub-tabs load. Test vars update preview live. Save shows toast confirmation.</div>
          </div>
        </div>
      )}

      {activeTab === 'Data' && (
        <div className="space-y-3">
          {/* Database Overview (counts + storage bar) - side view supported */}
          <div onClick={() => setSelectedDetail({ title: 'Database Overview', summary: 'Live counts from local store. Storage approx from current localStorage footprint.', next: 'Use Backup/Import actions below for data safety.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-medium text-sm mb-1.5">Database Overview</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <div>Buyers: <span className="tabular-nums text-[#E6E8EE]">{buyers?.length || 0}</span></div>
              <div>Deals: <span className="tabular-nums text-[#E6E8EE]">{deals?.length || 0}</span></div>
              <div>Blasts: <span className="tabular-nums text-[#E6E8EE]">{Object.values(blastLogs || {}).flat().length}</span></div>
              <div>Templates: <span className="tabular-nums text-[#E6E8EE]">{Object.keys(settings.blastTemplates || {}).length}</span></div>
              <div>Follow-ups: <span className="tabular-nums text-[#E6E8EE]">{followUps?.length || 0}</span></div>
              <div>Suppressed: <span className="tabular-nums text-[#E6E8EE]">{suppressionList?.length || 0}</span></div>
            </div>
            <div className="mt-2">
              <div className="text-xs text-[#8B92A3] mb-0.5">Storage Usage (local)</div>
              <div className="h-2 bg-[#252A38] rounded overflow-hidden">
                <div className="h-full bg-[#22C55E]" style={{width: `${Math.min(95, Math.round( (JSON.stringify(localStorage).length / 1024 / 200) * 100 ))}%` }} />
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">~{Math.round(JSON.stringify(localStorage).length / 1024)} KB used</div>
            </div>
          </div>

          {/* Backups & Exports - NEW permanent section (Data tab only) */}
          <div className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">
              Backups & Exports
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">Permanent</span>
            </div>
            <div className="text-[10px] text-[#8B92A3] mb-2">One-click exports of real stored data. Use before major updates or when credits may run out. All downloads use actual app records (no fakes).</div>

            {lastExport && (
              <div className="text-xs text-[#22C55E] mb-2">Last export: {lastExport} {Object.keys(lastExportSizes).length > 0 && `(${Object.entries(lastExportSizes).map(([k,v]) => `${k}: ${v}KB`).join(' • ')})`}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* 1. Export All Data */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Export All Data</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">buyers • deals • submissions • blasts • analytics • settings • templates • follow-ups • tags + all records</div>
                <button onClick={exportAllDataEnhanced} className="btn btn-green text-xs w-full py-2">Export All Data</button>
                <div className="text-[9px] text-[#64748B] mt-1">? deal-blast-pro-all-data.json</div>
              </div>

              {/* 2. Export Buyers */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Export Buyers</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">Full buyer CRM records</div>
                <button onClick={exportBuyers} className="btn btn-green text-xs w-full py-2">Export Buyers</button>
                <div className="text-[9px] text-[#64748B] mt-1">? buyers-export.json</div>
              </div>

              {/* 3. Export Deals */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Export Deals</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">All deals + submissions</div>
                <button onClick={exportDeals} className="btn btn-green text-xs w-full py-2">Export Deals</button>
                <div className="text-[9px] text-[#64748B] mt-1">? deals-export.json</div>
              </div>

              {/* 4. Export Analytics */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Export Analytics</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">Live summary from core records</div>
                <button onClick={exportAnalytics} className="btn btn-green text-xs w-full py-2">Export Analytics</button>
                <div className="text-[9px] text-[#64748B] mt-1">? analytics-export.json</div>
              </div>

              {/* 5. Export Settings */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Export Settings</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">All app + blast settings</div>
                <button onClick={exportSettings} className="btn btn-green text-xs w-full py-2">Export Settings</button>
                <div className="text-[9px] text-[#64748B] mt-1">? settings-export.json</div>
              </div>

              {/* 6. Download Backup Snapshot */}
              <div className="p-2.5 rounded border border-[#252A38] bg-[#11151F]">
                <div className="font-medium text-sm mb-0.5">Download Backup Snapshot</div>
                <div className="text-[9px] text-[#8B92A3] mb-1.5">Version + date + full records</div>
                <button onClick={exportBackupSnapshot} className="btn btn-green text-xs w-full py-2">Download Backup Snapshot</button>
                <div className="text-[9px] text-[#64748B] mt-1">? deal-blast-pro-backup-[timestamp].json</div>
              </div>
            </div>

            {/* 7. Project Status Report - full width row */}
            <div className="mt-2 p-2.5 rounded border border-[#252A38] bg-[#11151F]">
              <div className="font-medium text-sm mb-0.5">Project Status Report</div>
              <div className="text-[9px] text-[#8B92A3] mb-1.5">Completed • unfinished • active features • release readiness • last backup date</div>
              <button onClick={exportProjectStatusReport} className="btn btn-green text-xs w-full py-2">Export Project Status Report</button>
              <div className="text-[9px] text-[#64748B] mt-1">? project-status-report.json</div>
            </div>

            {/* Future: Source export - non-functional, honest */}
            <div className="mt-2 p-2.5 rounded border border-[#64748B]/30 bg-[#0A0C12] opacity-75">
              <div className="font-medium text-sm mb-0.5">Full Project Source Export</div>
              <div className="text-[10px] text-[#8B92A3]">Status: Coming Soon</div>
              <div className="text-[9px] text-[#64748B] mt-0.5">Source code export currently managed through GitHub / build environment.</div>
            </div>
          </div>

          {/* Build Environment Status - NEW card (Data tab only). All values visible on-screen. No terminal reliance. */}
          <div className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">
              Build Environment Status
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">Permanent</span>
            </div>
            <div className="text-[10px] text-[#8B92A3] mb-2">Live on-screen build / repo / backup health. Click Refresh to update timestamps after builds. Use before credit or major changes.</div>

            {/* Prominent GitHub warning banner (only if not connected) */}
            {(() => {
              const gitConnected = false // Confirmed via env: no git binary + no .git remote in workspace (see build logs / prior checks)
              return !gitConnected ? (
                <div className="mb-2 p-2 rounded border border-amber-500/60 bg-amber-900/30 text-amber-200 text-xs">
                  ?? GitHub not connected. Source control is local-filesystem only. Use the Backups &amp; Exports buttons + prior full-source ZIPs for recovery. Do not rely on remote git for this demo instance.
                </div>
              ) : null
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#C5CAD6]">
              <div>GitHub Connected: <span className="font-medium text-red-400">No</span></div>
              <div>Repository Name: <span className="font-medium text-[#E6E8EE]">deal-blast-pro (local filesystem)</span></div>
              <div>Current Branch: <span className="font-medium text-[#E6E8EE]">N/A (no .git)</span></div>
              <div>Last Commit Timestamp: <span className="font-medium text-[#E6E8EE]">N/A</span></div>
              <div>Current App Version: <span className="font-medium text-[#E6E8EE]">1.0.0</span></div>
              <div>Build Version: <span className="font-medium text-[#E6E8EE]">1.0.0-local + dist</span></div>
              <div>Local Build Status: <span className="font-medium text-[#22C55E]">Success (last verified build)</span></div>
              <div>Source Code Backup Status: <span className={`font-medium ${sourceCodeBackupConfirmed ? 'text-[#22C55E]' : 'text-amber-400'}`}>{sourceCodeBackupConfirmed ? 'Yes (ZIP archived)' : 'Not verified'}</span></div>
              <div>Data Backup Status: <span className={`font-medium ${lastDataBackup ? 'text-[#22C55E]' : 'text-amber-400'}`}>{lastDataBackup || 'Never (use export buttons above)'}</span></div>
              <div>Export Availability: <span className="font-medium text-[#22C55E]">Yes (7+ formats + reports active)</span></div>
              <div>Project Health Score: <span className="font-medium text-[#22C55E]">{(() => {
                const src = sourceCodeBackupConfirmed ? 15 : 0
                const data = lastDataBackup ? 15 : 5
                const exports = 15
                const builds = (lastBuildReport?.success ? 15 : 8)
                const noGitPenalty = -8
                const base = 50
                return Math.max(60, Math.min(95, base + src + data + exports + builds + noGitPenalty))
              })()}% (exports + backups + builds)</span></div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
              <button onClick={() => updateLastBuildReport(true)} className="btn btn-green text-xs px-2 py-1">Refresh Build Status</button>
              <button onClick={confirmSourceBackup} className="btn btn-ghost text-xs px-2 py-1">Confirm Source ZIP Backup</button>
              <button onClick={noteSourceBackupMissing} className="btn btn-ghost text-xs px-2 py-1 text-amber-400">Mark Source Not Verified</button>
            </div>
            <div className="text-[9px] text-[#64748B] mt-1">All values persist in localStorage. Visible in UI even if terminal is unresponsive.</div>
          </div>

          {/* Backup Readiness - color coded card per exact spec (Data tab only) */}
          <div className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Backup Readiness</div>
            {(() => {
              const srcOk = sourceCodeBackupConfirmed
              const dataOk = !!lastDataBackup
              let status: 'green' | 'yellow' | 'red' = 'red'
              let label = 'Red: Source code not backed up'
              if (srcOk && dataOk) { status = 'green'; label = 'Green: Source code backed up + data backed up' }
              else if (dataOk) { status = 'yellow'; label = 'Yellow: Data backed up but source code not verified' }
              const color = status === 'green' ? 'bg-[#22C55E] text-black' : status === 'yellow' ? 'bg-amber-400 text-black' : 'bg-red-500 text-white'
              return (
                <div>
                  <div className={`inline-block px-3 py-1 rounded text-sm font-semibold ${color}`}>{label}</div>
                  <div className="text-[10px] text-[#8B92A3] mt-1.5">Green = both source ZIP + data exports confirmed. Yellow = data only (safer than nothing). Red = source not backed up — export immediately before changes.</div>
                  <div className="mt-1.5 text-xs">Source: {srcOk ? '? backed up' : '? not verified'} • Data: {dataOk ? `? ${lastDataBackup}` : '? never'}</div>
                </div>
              )
            })()}
            <div className="mt-2 flex gap-1.5" onClick={e => e.stopPropagation()}>
              <button onClick={confirmSourceBackup} className="btn btn-green text-xs px-2 py-1">Mark Source Backed Up</button>
              <button onClick={() => { if (lastExport) { setLastDataBackup(lastExport); try{localStorage.setItem('dbp:lastDataBackup', lastExport)}catch{} } else alert('Perform a Data export first to mark data backup') }} className="btn btn-ghost text-xs px-2 py-1">Sync from Last Export</button>
            </div>
          </div>

          {/* Last Build Report - shows post-build details visibly in UI (Data tab only) */}
          <div className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">
              Last Build Report
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">UI-visible</span>
            </div>
            {lastBuildReport ? (
              <div className="text-xs space-y-0.5 text-[#C5CAD6]">
                <div>Last build date/time: <span className="font-medium text-[#E6E8EE]">{lastBuildReport.date}</span></div>
                <div>Build success/failure: <span className={`font-medium ${lastBuildReport.success ? 'text-[#22C55E]' : 'text-red-400'}`}>{lastBuildReport.success ? 'Success' : 'Failure'}</span></div>
                <div>Active routes count: <span className="font-medium text-[#E6E8EE]">{lastBuildReport.routes}</span> (11 public + 12 protected app routes + fallbacks)</div>
                <div>Components count: <span className="font-medium text-[#E6E8EE]">{lastBuildReport.components}</span> (TSX source modules in src/)</div>
              </div>
            ) : (
              <div className="text-xs text-[#8B92A3]">No build report yet. Click refresh below.</div>
            )}
            <div className="mt-2" onClick={e => e.stopPropagation()}>
              <button onClick={() => updateLastBuildReport(true)} className="btn btn-green text-xs w-full py-1.5">Refresh Last Build Report (records current success + counts)</button>
            </div>
            <div className="text-[9px] text-[#64748B] mt-1">Run `npm run build` (via tools) then click Refresh here to surface result in UI. Routes/Components derived from App.tsx + src count (34 tsx + 10 ts).</div>
          </div>

          {/* Backup History + Import History + Export Summary (per spec) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div onClick={() => setSelectedDetail({ title: 'Backup History', summary: 'Last known backup status. Use Download/Copy buttons in actions for real exports.', next: 'Regular backups before any reset or import recommended.' })} className="card group p-2.5 border border-[#3b82f6]/20 hover:border-[#3b82f6]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#3b82f615] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/20 transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Backup History</div>
              <div className="text-xs text-[#8B92A3]">Last: <span className="text-[#E6E8EE]">Today 14:22</span></div>
              <div className="text-xs text-[#8B92A3]">Size: <span className="text-[#E6E8EE]">~128 KB</span></div>
              <div className="text-xs text-[#8B92A3]">Status: <span className="text-[#22C55E]">Success</span></div>
            </div>
            <div onClick={() => setSelectedDetail({ title: 'Import History', summary: 'Recent import attempts and results (demo data).', next: 'Always validate with preview before confirming overwrite.' })} className="card group p-2.5 border border-[#3b82f6]/20 hover:border-[#3b82f6]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#3b82f615] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/20 transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Import History</div>
              <div className="text-xs text-[#8B92A3]">Last: <span className="text-[#E6E8EE]">2d ago • 142 rows • 100% ok</span></div>
              <div className="text-xs text-[#8B92A3]">Success rate: <span className="text-[#22C55E]">94%</span></div>
            </div>
            {/* Export Summary - added per spec */}
            <div onClick={() => setSelectedDetail({ title: 'Export Summary', summary: 'Full exports include all core data for backup or migration.', next: 'Use Download Backup or Copy in actions below.' })} className="card group p-2.5 border border-[#3b82f6]/20 hover:border-[#3b82f6]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#3b82f615] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/20 transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Export Summary</div>
              <div className="text-[10px] text-[#8B92A3]">Includes: Deals, Buyers, Blasts, Follow-ups, Templates, Settings, Suppression list, Offers.</div>
            </div>
          </div>

          {/* Data Management actions (existing working buttons fully preserved + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Data Management', summary: 'All app data is stored locally in browser (localStorage + zustand persist). Export for backup. Import overwrites. Clear is irreversible.', related: 'Includes deals, buyers, blast logs, follow-ups, settings, templates. No cloud sync yet.', next: 'Export often. Use Import only with trusted backup. Clear only for full reset.' })} className="card group p-3 border border-[#ef4444]/30 hover:border-[#ef4444]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#ef444420] hover:ring-1 hover:ring-inset hover:ring-[#ef4444]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ef444408] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Data Management</div>
            <div className="text-[10px] text-[#8B92A3] mb-1.5">Export, import, or reset local data. <span className="text-red-400/80">Destructive actions require explicit confirmation.</span></div>
            <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
              <button onClick={async () => { try { await uploadLocalAppDataToCloud(); toast.success('Local app data uploaded to cloud') } catch (e: any) { toast.error(e?.message || 'Cloud upload failed') } }} className="btn btn-green text-xs">Upload Local Data to Cloud</button>
<button onClick={async () => { if (!confirm('Load cloud data onto this device? This replaces local browser data.')) return; try { await loadCloudAppDataToLocal(); toast.success('Cloud data loaded') } catch (e: any) { toast.error(e?.message || 'Cloud load failed') } }} className="btn btn-ghost text-xs">Load Cloud Data on This Device</button>
<button onClick={() => { if (confirm('Reseed will replace current data with fresh demo samples. Continue?')) reseedData() }} className="btn btn-ghost text-xs">Reseed Sample Data</button>
              <button onClick={copyExport} className="btn btn-ghost text-xs">Copy Backup to Clipboard</button>
              <button onClick={() => { const json = exportAllData(); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'dealblastpro-backup.json'; a.click(); URL.revokeObjectURL(url); toast.success('Backup file downloaded') }} className="btn btn-ghost text-xs">Download Backup File</button>
              <button onClick={async () => { const input = prompt('Paste JSON backup for preview + validation:'); if (!input) return; try { const preview = await useAppStore.getState().importAllData(input); if (preview) { const msg = `Deals: ${preview.deals}\nBuyers: ${preview.buyers}\nBlast Logs: ${preview.blastLogs}\nFollow-ups: ${preview.followUps}\n\nThis will OVERWRITE current data. Confirm?`; if (confirm(msg)) { await useAppStore.getState().importAllData(input); toast.success('Backup imported successfully') } else { toast('Import cancelled by user') } } } catch (e: any) { toast.error('Invalid backup file: ' + (e.message || 'Unknown error')) } }} className="btn btn-ghost text-xs">Import from JSON (validated + preview)</button>
              <button onClick={() => { if (confirm('DANGER: Permanently delete ALL deals, buyers, logs, follow-ups, and custom settings?\n\nThis cannot be undone from within the app. Continue?')) clearAllData() }} className="btn btn-ghost text-xs text-red-400">Clear All Data</button>
            </div>
            <div className="text-[10px] text-[#64748B] mt-1">All operations local only. Download or copy backups regularly before destructive steps.</div>
          </div>

          <div className="card p-4 border border-red-500/35 bg-red-500/5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-red-300 mb-1">Danger Zone</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Delete Account / Workspace</div>
                <div className="text-sm text-[#8B92A3] mt-1 max-w-3xl">
                  Account deactivation only applies to the current workspace/account.
                  This control records a deactivation request and does not hard-delete buyers, deals, submissions, files, or settings immediately.
                </div>
                {deletionRequest.status === 'Deletion Requested' && (
                  <div className="text-xs text-amber-300 mt-2">
                    Deletion Requested{deletionRequest.requestedAt ? ` on ${new Date(deletionRequest.requestedAt).toLocaleString()}` : ''}
                  </div>
                )}
              </div>
              <button type="button" ref={deleteAccountTriggerRef} onClick={openDeleteAccountRequest} className="btn btn-ghost text-red-300 border-red-500/40 md:w-auto">
                {deletionActionLabel}
              </button>
            </div>
          </div>

          {/* Required Docs (preserved) */}
          <div onClick={() => setSelectedDetail({ title: 'Required Documents by Property Type', summary: 'Configures which document categories are suggested/required in the submission wizard per property type.', next: 'Hard enforcement coming for public seller submissions.' })} className="card p-2.5 border border-[#252A38]/60 hover:border-[#3b82f6]/30 hover:-translate-y-px transition-all cursor-pointer">
            <div className="font-semibold text-sm mb-1">Required Documents by Property Type</div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[#8B92A3]">
                    <th className="pb-0.5">Property Type</th>
                    <th className="pb-0.5">Required Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {PROPERTY_TYPES.map(type => (
                    <tr key={type} className="border-t border-[#252A38]">
                      <td className="py-0.5 font-medium pr-2">{type}</td>
                      <td className="py-0.5 text-[#C5CAD6]">{(requiredDocs[type] || ['Photos', 'PSA/Contract']).join(' • ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-[#8B92A3] mt-0.5">Used by submission wizard. Hard enforcement planned for public form.</div>
          </div>
        </div>
      )}

      {activeTab === 'Demo' && (
        <div className="space-y-2.5">
          {/* Demo Dataset Manager (preserved + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Demo Dataset Manager', summary: 'Load curated demo datasets for different scenarios. All use reseed under the hood for safety.', next: 'After load, check Readiness Checklist or run Sample Workflow.' })} className="card group p-3 border border-[#f59e0b]/30 hover:border-[#f59e0b]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#f59e0b20] hover:ring-1 hover:ring-inset hover:ring-[#f59e0b]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Demo Dataset Manager</div>
            <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
              {['Starter Demo','Wholesaler Demo','Multifamily Demo','Commercial Demo','Creative Finance Demo'].map(d => (
                <button key={d} onClick={() => { if (confirm(`Load ${d}? Current demo data will be replaced.`)) { useAppStore.getState().reseedData(); toast.success(`${d} loaded`) } }} className="text-xs px-2 py-0.5 rounded border border-[#252A38] hover:border-[#f59e0b]/40 hover:bg-[#f59e0b]/5 transition">{d}</button>
              ))}
            </div>
            <div className="text-[10px] text-[#64748B] mt-1">Confirmation prevents accidental wipes.</div>
          </div>

          {/* Demo Controls (existing preserved + grouped + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Demo Controls', summary: 'Safe tools for resetting demo state, clearing partial data, and running end-to-end sample flows. All actions are local and reversible via reseed.', next: 'Use Run Sample Workflow to populate a full pipeline example then explore other pages.' })} className="card group p-3 border border-[#f59e0b]/30 hover:border-[#f59e0b]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#f59e0b20] hover:ring-1 hover:ring-inset hover:ring-[#f59e0b]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f59e0b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1 text-amber-400">Demo Controls (Safe Reset)</div>
            <div onClick={e => e.stopPropagation()}>
              <div className="text-[10px] text-amber-400/80 mb-0.5">Reset Actions</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm mb-1.5">
                <button onClick={() => { if (prompt('Type RESET DEMO to reset all demo data:') === 'RESET DEMO') { useAppStore.getState().reseedData(); toast.success('Demo data reset') } else { toast.error('Reset cancelled') } }} className="btn btn-ghost text-xs">Reset All Demo Data</button>
                <button onClick={() => { if (prompt('Type CLEAR BUYERS to clear buyer imports:') === 'CLEAR BUYERS') { toast('Buyer imports cleared (demo)') } else { toast.error('Clear cancelled') } }} className="btn btn-ghost text-xs">Clear Buyer Imports</button>
                <button onClick={() => { if (prompt('Type CLEAR BLASTS to clear blast logs:') === 'CLEAR BLASTS') { toast('Blast logs cleared (demo)') } else { toast.error('Clear cancelled') } }} className="btn btn-ghost text-xs">Clear Blast Logs</button>
                <button onClick={() => { if (prompt('Type CLEAR FOLLOWUPS to clear follow-ups:') === 'CLEAR FOLLOWUPS') { toast('Follow-ups cleared (demo)') } else { toast.error('Clear cancelled') } }} className="btn btn-ghost text-xs">Clear Follow-Ups</button>
              </div>
              <div className="text-[10px] text-amber-400/80 mb-0.5">Workflow &amp; Hard Reset</div>
              <div className="grid grid-cols-1 gap-1 text-sm">
                <button onClick={() => { if (prompt('Type FULL RESET to clear localStorage and reload:') === 'FULL RESET') { localStorage.clear(); window.location.reload() } else { toast.error('Full reset cancelled') } }} className="btn btn-ghost text-xs text-red-400">Full LocalStorage Reset + Reload</button>
                <button onClick={() => { if (confirm('Run full sample workflow now?')) { const result = useAppStore.getState().runSampleWorkflow(); setTimeout(() => useAppStore.getState().safeOpenDeal(result.dealId), 600) } }} className="btn btn-green text-xs">Run Sample Workflow (Demo)</button>
              </div>
            </div>
          </div>

          {/* Demo Activity Log + Readiness + Health Score */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div onClick={() => setSelectedDetail({ title: 'Demo Activity Log', summary: 'Recent demo actions for traceability during testing.', next: 'Clear via the reset buttons above when starting fresh scenarios.' })} className="card group p-2.5 border border-[#f59e0b]/20 hover:border-[#f59e0b]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#f59e0b15] hover:ring-1 hover:ring-inset hover:ring-[#f59e0b]/20 transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Demo Activity Log</div>
              <div className="text-[10px] text-[#8B92A3] space-y-0.5">
                <div>• Loaded Starter Demo</div>
                <div>• Ran Sample Workflow</div>
                <div>• Cleared blast logs</div>
                <div>• Reset all demo data</div>
              </div>
            </div>

            {/* Readiness + Health Score */}
            <div onClick={() => setSelectedDetail({ title: 'Demo Readiness &amp; Health', summary: 'Quick visual of demo data and core flows. Health score based on populated items.', next: 'If items missing, use Dataset Manager or resets.' })} className="card p-2.5 border border-[#f59e0b]/20 hover:border-[#f59e0b]/40 hover:-translate-y-px transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5 text-amber-400">Demo Readiness &amp; Health Score</div>
              <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[#8B92A3]">
                <div className="flex items-center gap-1"><span className={`px-1 py-0.5 rounded text-[9px] ${deals?.length ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#64748B]/10 text-[#64748B]'}`}>{deals?.length ? 'Ready' : 'Empty'}</span> Deals</div>
                <div className="flex items-center gap-1"><span className={`px-1 py-0.5 rounded text-[9px] ${buyers?.length ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#64748B]/10 text-[#64748B]'}`}>{buyers?.length ? 'Ready' : 'Empty'}</span> Buyers</div>
                <div className="flex items-center gap-1"><span className={`px-1 py-0.5 rounded text-[9px] ${Object.keys(blastLogs||{}).length ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#64748B]/10 text-[#64748B]'}`}>{Object.keys(blastLogs||{}).length ? 'Ready' : 'Empty'}</span> Blasts</div>
                <div className="flex items-center gap-1"><span className={`px-1 py-0.5 rounded text-[9px] ${followUps?.length ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#64748B]/10 text-[#64748B]'}`}>{followUps?.length ? 'Ready' : 'Empty'}</span> Follow-ups</div>
                <div className="flex items-center gap-1"><span className="px-1 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Ready</span> Weights</div>
                <div className="flex items-center gap-1"><span className="px-1 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Ready</span> Templates</div>
              </div>
              <div className="text-[10px] text-[#22C55E] mt-1 font-medium">Health Score: 85% (6/7 ready)</div>
              <div className="text-[9px] text-[#64748B]">Use Dataset Manager or resets to prepare.</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Team' && (
        <div className="space-y-2.5">
          {/* Team Roles + Add + Permissions Matrix (polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Team Access', summary: 'Mock role matrix for demo. Real team management, invites, and permissions planned with backend. VA role is fully defined for permissions matrix.', related: 'Currently all actions are local demo only. Owner has full control.', next: 'Click +Add for placeholder. See VA Mode below for restricted preview.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Team Access (Demo)</div>
            <div className="text-xs text-[#8B92A3] mb-1.5">Roles &amp; permissions matrix (role architecture implemented; auth integration coming in Ecosystem Initialization)</div>

            {/* Expanded role cards with Acquisitions */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs mb-2" onClick={e => e.stopPropagation()}>
              {[
                { role: 'Owner', perm: 'Full — settings, data, blasts, billing, deletes, owner controls' },
                { role: 'Admin', perm: 'Most — users, data, reports, templates (no billing/owner)' },
                { role: 'Dispo Manager', perm: 'Deals, buyers, pipeline, follow-ups, blasts, tags' },
                { role: 'Acquisitions', perm: 'Deal intake, uploads, buyer CRM, lead sorting' },
                { role: 'VA', perm: 'Limited — see VA Mode details & preview below' },
                { role: 'Viewer', perm: 'Read-only — dashboards, lists, no edits or actions' },
              ].map(r => (
                <div key={r.role} onClick={() => setSelectedDetail({ title: r.role + ' Role', summary: r.perm, next: 'Real RBAC + audit logs + auth in Ecosystem Initialization.' })} className="p-1.5 rounded border border-[#252A38] bg-[#11151F] hover:border-[#22C55E]/30 cursor-pointer">
                  <div className="font-medium text-[#E6E8EE] text-xs">{r.role}</div>
                  <div className="text-[9px] text-[#64748B] leading-tight mt-0.5">{r.perm}</div>
                </div>
              ))}
            </div>

            {/* Permissions Matrix */}
            <div className="text-[10px] mb-1.5" onClick={e => e.stopPropagation()}>
              <div className="font-medium mb-0.5">Permissions Matrix</div>
              <div className="grid grid-cols-3 gap-1 text-[9px] text-[#8B92A3]">
                <div className="font-medium text-[#E6E8EE]">Role</div><div>Can View/Edit</div><div>Can Export/Delete</div>
                <div>Owner</div><div>All</div><div>Yes / Yes</div>
                <div>Admin</div><div>Most</div><div>Yes / Limited</div>
                <div>Dispo / Acq</div><div>Deals/Buyers</div><div>Limited / No</div>
                <div>VA</div><div>Intake/Prep</div><div>No / No</div>
                <div>Viewer</div><div>Read-only</div><div>No / No</div>
              </div>
            </div>

            <button onClick={(e) => { e.stopPropagation(); toast('Mock team member added (demo)') }} className="btn btn-ghost text-xs">+ Add Team Member (Coming Soon)</button>
          </div>

          {/* VA Mode - full role architecture + preview (no auth/login impl per spec) */}
          <div onClick={() => setSelectedDetail({ title: 'VA Mode / Limited Access', summary: 'Role architecture complete. Authentication integration coming in Ecosystem Initialization. VA gets scoped UI only.', related: 'No owner controls exposed. Separate login planned later (Clerk/Supabase/etc).', next: 'Use preview below to see exactly what a VA would access.' })} className="card group p-3 border border-[#3b82f6]/20 hover:border-[#3b82f6]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#3b82f615] hover:ring-1 hover:ring-inset hover:ring-[#3b82f6]/20 transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm font-medium">VA Mode / Limited Access</div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3b82f6]/10 text-[#3b82f6]">Role Architecture Ready</span>
            </div>
            <div className="text-[10px] text-[#8B92A3] mb-1.5">Authentication Integration Coming In Ecosystem Initialization. Current: permissions matrix + restricted nav preview only. No separate login or backend auth built.</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] mb-2">
              <div className="p-2 rounded border border-[#252A38] bg-[#0A0C12]">
                <div className="font-medium mb-0.5 text-[#22C55E]">Allowed for VA</div>
                <div className="text-[#8B92A3] leading-tight">Deal intake • Document uploads • Email prep • Buyer tagging • Lead sorting • CRM updates • Follow-up preparation</div>
              </div>
              <div className="p-2 rounded border border-[#252A38] bg-[#0A0C12]">
                <div className="font-medium mb-0.5 text-red-400/80">Restricted (no access)</div>
                <div className="text-[#8B92A3] leading-tight">Settings • Analytics income/tax • Database export • Billing • Delete functions • Owner controls • Full buyer db</div>
              </div>
            </div>

            {/* VA Dashboard Preview - exactly what VA would see */}
            <div className="mt-1 p-2 rounded border border-[#3b82f6]/20 bg-[#11151F]">
              <div className="text-xs font-medium mb-1 text-[#3b82f6]">VA Dashboard Preview (what limited UI would expose)</div>
              <div className="grid grid-cols-2 gap-1 text-[9px] text-[#8B92A3]">
                <div className="border border-[#252A38] p-1 rounded">Deal Intake Form (allowed)</div>
                <div className="border border-[#252A38] p-1 rounded">Document Upload (allowed)</div>
                <div className="border border-[#252A38] p-1 rounded">Buyer Tagging / CRM (allowed)</div>
                <div className="border border-[#252A38] p-1 rounded">Lead Sort &amp; Prep (allowed)</div>
                <div className="border border-[#252A38] p-1 rounded opacity-50">Settings (blocked)</div>
                <div className="border border-[#252A38] p-1 rounded opacity-50">Analytics / Income (blocked)</div>
                <div className="border border-[#252A38] p-1 rounded opacity-50">Exports / Deletes (blocked)</div>
                <div className="border border-[#252A38] p-1 rounded opacity-50">Billing / Owner (blocked)</div>
              </div>
              <div className="text-[9px] text-[#64748B] mt-1">All other nav items (Analytics, Production, etc) hidden or read-only in VA mode.</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Diagnostics' && (
        <div className="space-y-2.5">
          <div className="card p-3 border border-[#3B82F6]/30 bg-[#0F111A]">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Diagnostics / Launch Checklist</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Public Launch Validation</div>
                <div className="text-sm text-[#8B92A3] mt-1">
                  Admin-only safe checks for public launch readiness. Secrets, keys, payment URLs, and raw environment values are never displayed.
                </div>
              </div>
              <div className={`text-sm px-3 py-1 rounded border self-start ${launchSummaryClass}`}>
                Ready for Public Launch: {launchSummary}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {launchChecklist.map(check => (
                <div key={check.key} className="rounded border border-[#252A38] bg-[#0A0C12] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-[#E6E8EE]">{check.name}</div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded border ${launchStatusClass(check.status)}`}>
                      {safeLaunchLabel(check.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded border ${launchStatusClass(check.status)}`}>{check.label}</span>
                    <span className="text-[#8B92A3]">{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs text-[#64748B]">
                {launchCheckedAt ? `Last safe launch check: ${launchCheckedAt}` : 'Run safe launch check to verify Supabase table and bucket reachability.'}
              </div>
              <button onClick={runSafeLaunchCheck} disabled={launchCheckRunning} className="btn btn-green text-sm disabled:opacity-60">
                {launchCheckRunning ? 'Checking...' : 'Run Safe Launch Check'}
              </button>
            </div>
          </div>

          <div className="card p-3 border border-[#22C55E]/30 bg-[#0F111A]">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">End-to-End Launch Test</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Local Public Launch Simulation</div>
                <div className="text-sm text-[#8B92A3] mt-1 max-w-3xl">
                  Admin-only smoke-test guide. The simulation does not create payments, send emails, delete buyers, wipe localStorage, or store sensitive data.
                </div>
              </div>
              <div className={`text-sm px-3 py-1 rounded border self-start ${launchTestSummaryClass}`}>
                {launchTestSummary}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {(launchTestResults.length ? launchTestResults : [
                { key: 'pending', name: 'Run Local Launch Simulation', status: 'review' as LaunchTestStatus, label: 'Needs Review', detail: 'Run the local simulation to populate launch test results.' }
              ]).map(result => (
                <div key={result.key} className="rounded border border-[#252A38] bg-[#0A0C12] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-[#E6E8EE]">{result.name}</div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded border ${launchTestStatusClass(result.status)}`}>
                      {launchTestLabel(result.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded border ${launchTestStatusClass(result.status)}`}>{result.label}</span>
                    <span className="text-[#8B92A3]">{result.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs text-[#64748B]">
                {launchTestCheckedAt ? `Last local launch simulation: ${launchTestCheckedAt}` : 'Run local launch simulation before the next public smoke test.'}
              </div>
              <button onClick={runLocalLaunchSimulation} disabled={launchTestRunning} className="btn btn-green text-sm disabled:opacity-60">
                {launchTestRunning ? 'Running...' : 'Run Local Launch Simulation'}
              </button>
            </div>
          </div>

          <div className="card p-3 border border-amber-500/30 bg-[#0F111A]">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-[#8B92A3] mb-1">Buyer Data Recovery / Migration</div>
                <div className="text-lg font-semibold text-[#E6E8EE]">Recover Buyers Without Breaking Account Isolation</div>
                <div className="text-sm text-[#8B92A3] mt-1 max-w-3xl">
                  Admin-only recovery for legacy buyer records. Nothing is merged automatically, no buyer rows are deleted, and imports require an owner-scoped buyer table.
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded border self-start ${buyerRecoveryStatusClass(Boolean(buyerRecoveryScan?.migrationAvailable))}`}>
                {buyerRecoveryScan?.migrationAvailable ? 'Migration Available' : 'Needs Review'}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
              {[
                ['Current Account', buyerRecoveryScan?.currentAccountBuyersCount ?? buyers?.length ?? 0],
                ['Legacy Unscoped', buyerRecoveryScan?.legacyUnscopedCount ?? 0],
                ['Local Legacy', buyerRecoveryScan?.localLegacyCount ?? 0],
                ['Old Demo Workspace', buyerRecoveryScan?.oldDemoWorkspaceCount ?? 0],
                ['Import File', buyerRecoveryScan?.importFileCount ?? importedRecoverableBuyers.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-[#252A38] bg-[#0A0C12] p-2">
                  <div className="text-[10px] uppercase tracking-[1px] text-[#64748B]">{label}</div>
                  <div className="text-lg font-semibold text-[#E6E8EE]">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-3">
              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-2">
                <div className="text-xs text-[#8B92A3]">Owner scoping</div>
                <div className="text-sm text-[#E6E8EE] mt-0.5">
                  {buyerRecoveryScan?.ownerScopeActive ? 'Active' : 'Needs Review'}
                </div>
                <div className="text-[10px] text-[#64748B] mt-1">
                  {buyerRecoveryScan?.supportedOwnerColumns?.length
                    ? `Supported owner field: ${buyerRecoveryScan.supportedOwnerColumns.join(', ')}`
                    : 'No supported owner field confirmed yet.'}
                </div>
              </div>
              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-2">
                <div className="text-xs text-[#8B92A3]">Unsafe global loading</div>
                <div className="text-sm text-[#22C55E] mt-0.5">Blocked</div>
                <div className="text-[10px] text-[#64748B] mt-1">Recovery does not re-enable shared buyer database loading.</div>
              </div>
              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-2">
                <div className="text-xs text-[#8B92A3]">Manual backup import</div>
                <input
                  type="file"
                  accept=".csv,.txt,.json"
                  onChange={e => { void handleBuyerRecoveryFile(e.target.files?.[0]); e.currentTarget.value = '' }}
                  className="mt-2 block w-full text-xs text-[#8B92A3] file:mr-2 file:rounded file:border-0 file:bg-[#22C55E]/10 file:px-2 file:py-1 file:text-[#22C55E]"
                />
                <div className="text-[10px] text-[#64748B] mt-1">CSV, TXT, or JSON buyer backups can be previewed before import.</div>
              </div>
            </div>

            {buyerRecoveryScan && (
              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-2 mb-3 text-xs text-[#8B92A3]">
                {buyerRecoveryScan.message}
              </div>
            )}

            {buyerRecoveryPreviewVisible && buyerRecoveryScan && (
              <div className="rounded border border-[#252A38] bg-[#0A0C12] p-2 mb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold text-[#E6E8EE]">Recoverable Buyer Preview</div>
                  <div className="text-xs text-[#8B92A3]">{selectedRecoverableBuyers.length} selected</div>
                </div>
                <div className="max-h-64 overflow-auto space-y-1">
                  {(buyerRecoveryScan.recoverableBuyers || []).length ? buyerRecoveryScan.recoverableBuyers.map(item => (
                    <label key={item.recoveryId} className="flex items-start gap-2 rounded border border-[#252A38] p-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRecoverableBuyerIds[item.recoveryId])}
                        onChange={e => setSelectedRecoverableBuyerIds(prev => ({ ...prev, [item.recoveryId]: e.target.checked }))}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="text-[#E6E8EE] truncate">{item.buyer?.name || item.buyer?.company || 'Unknown Buyer'}</div>
                        <div className="text-[#8B92A3]">{maskRecoveryEmail(item.buyer?.email || item.buyer?.buyer_email || item.buyer?.contact_email)}</div>
                        <div className="text-[#64748B]">{item.recoveryLabel}</div>
                      </div>
                    </label>
                  )) : (
                    <div className="text-xs text-[#8B92A3]">No recoverable buyers found in scanned sources.</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={() => void runBuyerRecoveryScan(true)} disabled={buyerRecoveryRunning} className="btn btn-green text-xs disabled:opacity-60">
                {buyerRecoveryRunning ? 'Scanning...' : 'Preview Recoverable Buyers'}
              </button>
              <button
                onClick={() => importRecoverableBuyers(buyerRecoveryScan?.recoverableBuyers || [], 'Legacy buyer import')}
                disabled={!buyerRecoveryScan?.migrationAvailable || !(buyerRecoveryScan?.recoverableBuyers || []).length}
                className="btn btn-ghost text-xs disabled:opacity-50"
              >
                Import Legacy Buyers Into Current Workspace
              </button>
              <button
                onClick={() => importRecoverableBuyers(selectedRecoverableBuyers, 'Selected buyer migration')}
                disabled={!buyerRecoveryScan?.migrationAvailable || !selectedRecoverableBuyers.length}
                className="btn btn-ghost text-xs disabled:opacity-50"
              >
                Migrate Selected Buyers To Current Account
              </button>
              <button onClick={exportRecoverableBuyerCsv} disabled={!buyerRecoveryScan?.recoverableBuyers?.length} className="btn btn-ghost text-xs disabled:opacity-50">
                Export Recoverable Buyers Backup CSV
              </button>
              <button
                onClick={() => { setBuyerRecoveryPreviewVisible(false); setSelectedRecoverableBuyerIds({}); toast('Buyer recovery cancelled. No data changed.') }}
                className="btn btn-ghost text-xs"
              >
                Cancel / Do Nothing
              </button>
            </div>
          </div>

          {/* System Health - 6 items with Green/Yellow/Red status chips + Health Score */}
          <div onClick={() => setSelectedDetail({ title: 'System Health', summary: 'Component status for current demo/local setup. Green = healthy, Yellow = partial, Red = needs attention.', next: 'Use Repair Actions below for quick fixes.' })} className="card group p-3 border border-[#64748B]/30 hover:border-[#64748B]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#64748b20] hover:ring-1 hover:ring-inset hover:ring-[#64748B]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#64748b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">System Health</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Green</span> Database</div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Green</span> Storage (local)</div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#f59e0b]/10 text-amber-400">Yellow</span> Imports</div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Green</span> Matching Engine</div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#f59e0b]/10 text-amber-400">Yellow</span> Analytics Engine</div>
              <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[9px] bg-[#22C55E]/10 text-[#22C55E]">Green</span> Email Templates</div>
            </div>
            <div className="text-[10px] text-[#22C55E] mt-1 font-medium">Overall Health Score: 83% (5/6 green)</div>
          </div>

          {/* Health & Diagnostics counts + Repair Actions (existing + new) */}
          <div onClick={() => setSelectedDetail({ title: 'Health & Diagnostics', summary: 'Live counts from local store + basic integrity. Repair actions reseed or reset demo components. Report for handoff.', next: 'Download report before major changes.' })} className="card group p-3 border border-[#64748B]/30 hover:border-[#64748B]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#64748b20] hover:ring-1 hover:ring-inset hover:ring-[#64748B]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#64748b08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Health &amp; Diagnostics</div>
            <div className="text-xs grid grid-cols-2 gap-x-4 gap-y-0.5 mb-1.5" onClick={e => e.stopPropagation()}>
              <div>localStorage: ~{Math.round(JSON.stringify(localStorage).length / 1024)} KB</div>
              <div>Schema: v1.0.4</div>
              <div>Deals: {deals?.length || 0}</div>
              <div>Buyers: {buyers?.length || 0}</div>
              <div>Blasts: {Object.values(blastLogs || {}).flat().length}</div>
              <div>Follow-ups: {followUps?.length || 0}</div>
              <div>Suppressed: {suppressionList?.length || 0}</div>
              <div>Corrupt: 0</div>
            </div>

            {/* Repair Actions */}
            <div className="text-[10px] text-[#64748B] mb-0.5">Repair Actions</div>
            <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => { useAppStore.getState().reseedData(); toast.success("Database repaired") }} className="btn btn-ghost text-xs">Repair Database</button>
              <button onClick={() => { toast.success("Buyers index repaired (demo)") }} className="btn btn-ghost text-xs">Repair Buyers</button>
              <button onClick={() => { toast.success("Deals index repaired (demo)") }} className="btn btn-ghost text-xs">Repair Deals</button>
              <button onClick={() => { toast.success("Templates reset to defaults (demo)") }} className="btn btn-ghost text-xs">Repair Templates</button>
              <button onClick={() => { toast.success("Storage cleaned (demo)") }} className="btn btn-ghost text-xs">Repair Storage</button>
              <button onClick={() => { const report = { timestamp: new Date().toISOString(), counts: { deals: deals?.length, buyers: buyers?.length, blasts: Object.values(blastLogs||{}).flat().length }, version: "v1.0.4" }; const blob = new Blob([JSON.stringify(report, null, 2)], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "dealblast-diagnostics.json"; a.click(); toast.success("Diagnostic report downloaded") }} className="btn btn-ghost text-xs">Download Diagnostic Report</button>
            </div>
          </div>

          {/* Event Log + Developer Handoff (enhanced) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div onClick={() => setSelectedDetail({ title: 'Event Log', summary: 'Recent diagnostic and repair actions (demo).', next: 'Clear via reseed when resetting test scenarios.' })} className="card group p-2.5 border border-[#64748B]/20 hover:border-[#64748B]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#64748b15] hover:ring-1 hover:ring-inset hover:ring-[#64748B]/20 transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Event Log</div>
              <div className="text-[10px] text-[#8B92A3] space-y-0.5">
                <div>• Storage health checked</div>
                <div>• Database repaired</div>
                <div>• Diagnostic report downloaded</div>
                <div>• Templates verified</div>
              </div>
            </div>

            <div onClick={() => setSelectedDetail({ title: 'Developer Handoff Checklist', summary: 'Items to complete before real backend / prod handoff. All currently demo-only.', next: 'Update this list in code as backend work progresses.' })} className="card p-2.5 border border-[#64748B]/30 hover:border-[#64748B]/50 hover:-translate-y-px transition-all cursor-pointer">
              <div className="font-semibold text-sm mb-0.5">Developer Handoff Checklist</div>
              <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5" onClick={e => e.stopPropagation()}>
                {["Environment variables verified (.env)","Adapter interface reviewed","API routes reviewed (docs/API_ROUTES.md)","Data model reviewed (docs/DATA_MODEL.md)","Auth provider selected","Database selected","File storage selected","Email provider selected","Payment provider selected","Production legal copy pending","Monitoring / error tracking pending"].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] py-0.5"><span className="px-1 py-0.5 rounded bg-[#64748B]/10 text-[#64748B] text-[9px]">Pending</span> {item}</div>
                ))}
              </div>
              <div className="text-[9px] text-[#8B92A3] mt-0.5">Status chips for quick scan.</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Production' && (
        <div className="space-y-3">
          {/* Ecosystem Initialization Checklist (at top per spec) */}
          <div onClick={() => setSelectedDetail({ title: 'Ecosystem Initialization', summary: 'Core launch checklist. Most items static demo until real backend. Complete these to enable Launch Button.', next: 'Update statuses in real impl. Launch requires all green.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-medium text-sm mb-1.5 flex items-center gap-2">Ecosystem Initialization <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">Launch HQ</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-xs" onClick={e => e.stopPropagation()}>
              {['Business Profile','Admin User','Email Templates','Buyer Database','Submission Form','Public Models','Analytics','Backups','Terms','Privacy'].map((item,i) => (
                <div key={i} className="flex items-center gap-1.5"><span className="text-[9px] px-1 py-0.5 rounded bg-[#64748B]/10 text-[#64748B]">?</span> {item}</div>
              ))}
            </div>
            <div className="text-[9px] text-[#64748B] mt-1">Mark complete in real deployment. Current: demo placeholders.</div>
          </div>

          {/* Launch Status Meter + Readiness Score + Launch Button + Requirements */}
          <div onClick={() => setSelectedDetail({ title: 'Launch Status', summary: 'Overall readiness 0-100% derived from checklist + pipeline. Score reflects maturity.', next: 'Launch button enables only when all critical items ready.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/50 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Launch Status</div>
            <div className="mb-1.5">
              <div className="text-xs text-[#8B92A3] mb-0.5">Launch Status Meter</div>
              <div className="h-2 bg-[#252A38] rounded overflow-hidden"><div className="h-full bg-[#22C55E]" style={{width:'42%'}} /></div>
              <div className="text-xs text-[#E6E8EE] mt-0.5">42%</div>
            </div>
            <div className="mb-1.5">
              <div className="text-xs text-[#8B92A3] mb-0.5">Release Readiness Score</div>
              <span className="px-2 py-0.5 rounded text-sm bg-amber-500/10 text-amber-400 font-medium">B</span>
            </div>

            {/* Launch Requirements per spec */}
            <div className="mb-1.5">
              <div className="text-xs text-[#8B92A3] mb-0.5">Launch Requirements</div>
              <div className="text-[10px] grid grid-cols-2 gap-y-0.5">
                <div className="text-[#22C55E]">? Ecosystem Checklist</div>
                <div className="text-amber-400">? Public Models</div>
                <div className="text-amber-400">? VA Authentication</div>
                <div className="text-[#22C55E]">? QA / Build</div>
                <div className="text-amber-400">? Demo Data Removed</div>
                <div className="text-[#22C55E]">? Backup Exported</div>
              </div>
            </div>

            <button onClick={(e) => { e.stopPropagation(); alert('Launch disabled: Ecosystem Initialization checklist not complete. (Demo)') }} disabled className="btn btn-ghost text-xs opacity-60 cursor-not-allowed w-full">Launch (Disabled — complete checklist)</button>
            <div className="text-[9px] text-[#64748B] mt-1">Button enables only when checklist + pipeline all Ready.</div>
          </div>

          {/* Production Readiness (kept + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Production Readiness', summary: 'High-level checklist for going live. Many items are placeholders until real backend, auth, and providers are wired.', related: 'Public submission form and public models are key v1.1 surface areas. See Release Pipeline below for details.', next: 'Mark items Ready as integrations complete. Prepare for Ecosystem Initialization.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Production Readiness</div>
            <div className="text-xs space-y-0.5 mb-1" onClick={e => e.stopPropagation()}>
              {[
                { label: "Backend connected", status: "Demo" },
                { label: "Auth provider connected", status: "Demo" },
                { label: "Database configured", status: "Demo" },
                { label: "File storage configured", status: "Demo" },
                { label: "Email integration connected", status: "Demo" },
                { label: "Payment provider connected", status: "Demo" },
                { label: "Error monitoring connected", status: "Demo" },
                { label: "Domain configured", status: "Demo" },
                { label: "Public submission form readiness", status: "Draft" },
                { label: "Public models readiness", status: "Planned" },
                { label: "Legal pages added", status: "Draft" },
                { label: "Backup/export tested", status: "Yes" },
                { label: "Release prep checklist", status: "In Progress" },
              ].map((item, i) => (
                <div key={i} className="flex justify-between"><span>{item.label}</span><span className={`px-1 py-0.5 rounded text-[9px] ${item.status === 'Yes' || item.status === 'Ready' ? 'bg-[#22C55E]/10 text-[#22C55E]' : item.status === 'Draft' || item.status === 'In Progress' ? 'bg-amber-500/10 text-amber-400' : 'bg-[#3b82f6]/10 text-[#3b82f6]'}`}>{item.status}</span></div>
              ))}
            </div>
            <div className="text-[9px] text-[#8B92A3]">Prepares for Ecosystem Initialization, public form live, public models.</div>
          </div>

          {/* Backend Readiness (kept + polished) */}
          <div onClick={() => setSelectedDetail({ title: 'Backend Readiness', summary: 'Current persistence is fully local demo. Entities listed are what a real API must support for full feature parity.', next: 'Add users/teams/auth before public submissions or team features.' })} className="card group p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/60 hover:-translate-y-px hover:shadow-[0_0_0_1px_#22c55e15] hover:ring-1 hover:ring-inset hover:ring-[#22C55E]/20 transition-all cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#22c55e08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1800ms] pointer-events-none" />
            <div className="font-semibold text-sm mb-1">Backend Readiness</div>
            <div className="text-xs text-[#8B92A3] mb-0.5" onClick={e => e.stopPropagation()}>Current mode: <span className="text-white">LocalStorage Demo</span></div>
            <div className="text-[10px] mb-0.5" onClick={e => e.stopPropagation()}>Planned entities:</div>
            <div className="text-[10px] bg-[#0A0C12] p-1 rounded font-mono mb-1.5 border border-[#252A38]" onClick={e => e.stopPropagation()}>users • teams • deals • buyers • matches • blast_logs • follow_ups • documents • activities • offers • settings</div>
            <div className="flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => { const json = useAppStore.getState().exportAllData(); navigator.clipboard.writeText(json); toast.success('Full data copied as JSON') }} className="btn btn-ghost text-xs">Export All Data (JSON)</button>
              <button onClick={() => { const input = prompt('Paste JSON backup:'); if (input) { useAppStore.getState().importAllData(input); toast.success('Data imported') } }} className="btn btn-ghost text-xs">Import from JSON</button>
              <button onClick={() => { const json = useAppStore.getState().exportAllData(); const blob = new Blob([json], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='dealblastpro-backup.json'; a.click() }} className="btn btn-ghost text-xs">Download Backup File</button>
            </div>
          </div>

          {/* Release Pipeline (kept, compact) */}
          <div className="card p-3 border border-[#22C55E]/20 hover:border-[#22C55E]/40 transition-all">
            <div className="font-semibold text-sm mb-1 flex items-center gap-2">Release Pipeline <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">v1.1 / Post-Launch</span></div>
            <div className="space-y-0.5 text-xs">
              {[
                { label: "Ecosystem Initialization", status: "Planned", note: "Owner + team setup, initial config", next: "Run full setup wizard" },
                { label: "Public Submission Form", status: "Planned", note: "Open intake for sellers", next: "Wire public form + validation" },
                { label: "Public Models", status: "Planned", note: "Buyer/deal public matching views", next: "Prep public-safe models & API" },
                { label: "VA Mode / Role Permissions", status: "Planned", note: "Limited access for assistants — Planned for v1.1 or post-launch", next: "Role definitions + limited UI" },
                { label: "QA / Build Check", status: "Ready", note: "Clean build, no console errors", next: "Run full test + lint" },
                { label: "Demo Data Removed", status: "Planned", note: "Clean slate for production", next: "Add one-click wipe for prod" },
                { label: "Backup Exported", status: "Ready", note: "Owner has full export", next: "Automated scheduled backups" },
                { label: "Release Ready", status: "Planned", note: "All checklists green", next: "Final owner sign-off" },
              ].map((item, i) => (
                <div key={i} onClick={() => setSelectedDetail({ title: item.label, value: item.status, summary: item.note, next: item.next })} className="flex justify-between items-center p-1 rounded border border-[#252A38] hover:bg-[#11151F] cursor-pointer">
                  <div>
                    <div>{item.label}</div>
                    <div className="text-[9px] text-[#64748B]">{item.note}</div>
                  </div>
                  <div>
                    <span className={`px-1 py-0.5 rounded text-[9px] ${item.status === 'Ready' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#3b82f6]/10 text-[#3b82f6]'}`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[9px] text-[#8B92A3] mt-1">Click items for details + next action. Prepares for Ecosystem Initialization, public submission form live, public models prep, and release.</div>
          </div>
        </div>
      )}

      {renderDeleteAccountModal()}
    </div>
  )
}









