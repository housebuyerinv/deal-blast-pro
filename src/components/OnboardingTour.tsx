import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import {
  CURRENT_ONBOARDING_VERSION,
  loadAuthenticatedOnboardingState,
  saveAuthenticatedOnboardingState,
} from '../lib/accountProfile'
import { DEFAULT_SETTINGS } from '../lib/constants'
import { useAppStore } from '../store/useAppStore'

const TOUR_STEPS = [
  { id: 1, title: 'Command Center', desc: 'Start here for daily deal flow, alerts, activity, and high-level workspace status.' },
  { id: 2, title: 'Deal Submissions', desc: 'Review public deal submissions before anything moves into active inventory or buyer outreach.' },
  { id: 3, title: 'Inventory Hub', desc: 'Approved active deals live here for pricing, status, documents, and follow-up coordination.' },
  { id: 4, title: 'Buyer Database', desc: 'Manage buyers for the current workspace only, including markets, criteria, tags, and funding notes.' },
  { id: 5, title: 'Deal Blast Builder', desc: 'Select a live deal, preview blast copy, match recipients, and prepare outreach exports.' },
  { id: 6, title: 'Buyer Portal', desc: 'Public buyers can submit criteria without an account, then your workspace can review the submission.' },
  { id: 7, title: 'Settings & Trial', desc: 'Manage plan state, billing setup, plan access, diagnostics, backups, and workspace controls.' },
  { id: 8, title: 'Upgrade / Billing', desc: 'Payment collection opens Stripe checkout when configured. Plan access updates after Stripe confirmation.' },
]

export default function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [manualRestart, setManualRestart] = useState(false)
  const reconciledUserId = useRef('')
  const migratedUserIds = useRef(new Set<string>())
  const { user, settings, updateSettings } = useAppStore()
  const onboarding = useMemo(() => ({
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }), [settings.onboarding])
  const completedVersion = Number(onboarding.onboardingVersionCompleted || 0)
  const hasCurrentVersion = completedVersion >= CURRENT_ONBOARDING_VERSION
  const hasLegacyCompletion = Boolean(onboarding.tourCompleted || onboarding.tourSkipped)

  useEffect(() => {
    if (!user?.id) return
    if (reconciledUserId.current === user.id) return
    reconciledUserId.current = user.id

    let active = true
    ;(async () => {
      try {
        const result = await loadAuthenticatedOnboardingState()
        if (!active || result.authUser.id !== user.id) return
        const serverVersion = Number(result.profile?.onboarding_version_completed || 0)
        const serverHasCurrentVersion = serverVersion >= CURRENT_ONBOARDING_VERSION

        if (serverHasCurrentVersion) {
          updateSettings({
            onboarding: {
              ...onboarding,
              tourCompleted: Boolean(result.profile?.onboarding_completed_at) || onboarding.tourCompleted,
              tourSkipped: Boolean(result.profile?.onboarding_dismissed_at) || onboarding.tourSkipped,
              tourCompletedAt: onboarding.tourCompletedAt || result.profile?.onboarding_completed_at || result.profile?.onboarding_dismissed_at || '',
              onboardingVersionCompleted: serverVersion,
              onboardingCompletedAt: result.profile?.onboarding_completed_at || onboarding.onboardingCompletedAt || '',
              onboardingDismissedAt: result.profile?.onboarding_dismissed_at || onboarding.onboardingDismissedAt || '',
              updatedAt: result.profile?.updated_at || onboarding.updatedAt || new Date().toISOString(),
            },
          })
          setIsOpen(false)
          return
        }

        if (hasLegacyCompletion && !migratedUserIds.current.has(user.id)) {
          migratedUserIds.current.add(user.id)
          const completedAt = onboarding.onboardingCompletedAt || onboarding.tourCompletedAt || new Date().toISOString()
          const dismissedAt = onboarding.onboardingDismissedAt || onboarding.tourCompletedAt || new Date().toISOString()
          await saveAuthenticatedOnboardingState({
            completed: Boolean(onboarding.tourCompleted),
            skipped: Boolean(onboarding.tourSkipped),
            completedAt,
            dismissedAt,
          })
          if (!active) return
          updateSettings({
            onboarding: {
              ...onboarding,
              onboardingVersionCompleted: CURRENT_ONBOARDING_VERSION,
              onboardingCompletedAt: onboarding.tourCompleted ? completedAt : onboarding.onboardingCompletedAt || '',
              onboardingDismissedAt: onboarding.tourSkipped ? dismissedAt : onboarding.onboardingDismissedAt || '',
              updatedAt: new Date().toISOString(),
            },
          })
        }
      } catch (error) {
        console.warn('[Deal Blast Pro] Onboarding profile reconciliation failed', error)
      }
    })()

    return () => {
      active = false
    }
  }, [user?.id, hasLegacyCompletion, onboarding, updateSettings])

  useEffect(() => {
    if (!user) return
    if (manualRestart) return
    if (onboarding.planSelectionCompleted && !hasCurrentVersion && !onboarding.tourCompleted && !onboarding.tourSkipped) {
      const timer = setTimeout(() => setIsOpen(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [user, onboarding.planSelectionCompleted, hasCurrentVersion, onboarding.tourCompleted, onboarding.tourSkipped, manualRestart])

  const currentStep = TOUR_STEPS.find(s => s.id === step) || TOUR_STEPS[0]

  const persistTourState = async (skipped: boolean) => {
    const now = new Date().toISOString()
    updateSettings({
      onboarding: {
        ...onboarding,
        tourCompleted: !skipped,
        tourSkipped: skipped,
        tourCompletedAt: now,
        onboardingVersionCompleted: CURRENT_ONBOARDING_VERSION,
        onboardingCompletedAt: skipped ? onboarding.onboardingCompletedAt || '' : now,
        onboardingDismissedAt: skipped ? now : onboarding.onboardingDismissedAt || '',
        updatedAt: now,
      },
    })
    setIsOpen(false)
    setManualRestart(false)
    try {
      await saveAuthenticatedOnboardingState({
        completed: !skipped,
        skipped,
        completedAt: skipped ? undefined : now,
        dismissedAt: skipped ? now : undefined,
      })
    } catch (error) {
      console.warn('[Deal Blast Pro] Onboarding profile save failed', error)
      toast.error('Tour saved locally, but cloud sync needs review.')
    }
    toast.success(skipped ? 'Tour skipped. You can restart it from Settings.' : 'Tour completed. You can restart it from Settings.')
  }

  const next = () => {
    if (step < TOUR_STEPS.length) {
      setStep(step + 1)
    } else {
      persistTourState(false)
    }
  }

  const prev = () => {
    if (step > 1) setStep(step - 1)
  }

  const skip = () => {
    persistTourState(true)
  }

  const restartTour = useCallback(() => {
    setManualRestart(true)
    setStep(1)
    setIsOpen(true)
  }, [])

  useEffect(() => {
    ;(window as any).restartDealBlastTour = restartTour
    return () => {
      if ((window as any).restartDealBlastTour === restartTour) {
        delete (window as any).restartDealBlastTour
      }
    }
  }, [restartTour])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 relative">
        <button onClick={skip} className="absolute top-4 right-4 text-[#8B92A3] hover:text-white" aria-label="Skip tour">
          <X size={18} />
        </button>

        <div className="mb-4">
          <div className="text-xs text-[#8B92A3]">ONBOARDING TOUR - STEP {step} OF {TOUR_STEPS.length}</div>
          <div className="h-1 bg-[#252A38] mt-2 rounded">
            <div className="h-1 bg-[#22C55E] rounded" style={{ width: `${(step / TOUR_STEPS.length) * 100}%` }} />
          </div>
        </div>

        <div className="text-xl font-semibold mb-2">{currentStep.title}</div>
        <div className="text-[#C5CAD6] mb-6">{currentStep.desc}</div>

        <div className="flex justify-between">
          <button onClick={prev} disabled={step === 1} className="btn btn-ghost disabled:opacity-40">Previous</button>

          <div className="flex gap-2">
            <button onClick={skip} className="btn btn-ghost">Skip Tour</button>
            <button onClick={next} className="btn btn-primary">
              {step === TOUR_STEPS.length ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-[#64748B]">
          Sample workflows remain available only through explicit owner actions in Settings.
        </div>
      </div>
    </div>
  )
}
