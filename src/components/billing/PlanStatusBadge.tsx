import { CreditCard } from 'lucide-react'
import type { TrialState } from '../../lib/types'

export function getPlanStatusText(trial: TrialState) {
  const plan = trial.plan === 'Free Demo' ? 'Free' : trial.plan || 'Free'
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : plan === 'Free' ? 'Free Active' : 'Trial Active')

  if (['Payment Pending', 'Past Due', 'Cancelled'].includes(String(billingStatus))) {
    return String(billingStatus)
  }

  if (plan === 'Free' && !trial.isPaid) {
    return 'Free Plan'
  }

  return `${plan} plan`
}

export function PlanStatusBadge({
  trial,
  onClick,
  compact = false,
}: {
  trial: TrialState
  onClick?: () => void
  compact?: boolean
}) {
  const label = getPlanStatusText(trial)
  const isActionable = Boolean(onClick)
  const plan = trial.plan === 'Free Demo' ? 'Free' : trial.plan
  const isPaidPlan = Boolean(trial.isPaid || (plan && plan !== 'Free'))

  const className = `flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
    isPaidPlan
      ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]'
      : 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#FBBF24]'
  } ${isActionable ? 'hover:bg-[#F59E0B]/20' : 'cursor-default'}`

  return (
    <button type="button" onClick={onClick} disabled={!isActionable} className={className}>
      <CreditCard size={13} />
      {compact && plan === 'Free' ? 'Free' : label}
    </button>
  )
}
