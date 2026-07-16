import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
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
  const { user, settings, updateSettings } = useAppStore()
  const onboarding = {
    ...DEFAULT_SETTINGS.onboarding!,
    ...(settings.onboarding || {}),
  }

  useEffect(() => {
    if (!user) return
    if (onboarding.planSelectionCompleted && !onboarding.tourCompleted && !onboarding.tourSkipped) {
      const timer = setTimeout(() => setIsOpen(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [user, onboarding.planSelectionCompleted, onboarding.tourCompleted, onboarding.tourSkipped])

  const currentStep = TOUR_STEPS.find(s => s.id === step) || TOUR_STEPS[0]

  const persistTourState = (skipped: boolean) => {
    updateSettings({
      onboarding: {
        ...onboarding,
        tourCompleted: !skipped,
        tourSkipped: skipped,
        tourCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    setIsOpen(false)
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

  const restartTour = () => {
    updateSettings({
      onboarding: {
        ...onboarding,
        tourCompleted: false,
        tourSkipped: false,
        tourCompletedAt: '',
        updatedAt: new Date().toISOString(),
      },
    })
    setStep(1)
    setIsOpen(true)
  }

  ;(window as any).restartDealBlastTour = restartTour

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
