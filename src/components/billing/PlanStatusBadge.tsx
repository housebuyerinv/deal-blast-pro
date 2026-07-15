import { CreditCard } from 'lucide-react'
import type { TrialState } from '../../lib/types'

export function getPlanStatusText(trial: TrialState) {
  const billingStatus = trial.billingStatus || (trial.isPaid ? 'Paid Active' : 'Trial Active')
  const daysLeft = Math.max(0, Number(trial.daysLeft || 0))
  const plan = trial.plan || 'Free Demo'

  if (['Payment Pending', 'Past Due', 'Cancelled'].includes(String(billingStatus))) {
    return String(billingStatus)
  }

  if (plan === 'Free Demo' && !trial.isPaid) {
    return daysLeft > 0 ? `Free Demo - ${daysLeft} days remaining` : 'Free Demo expired'
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
  const isPaidPlan = Boolean(trial.isPaid || (trial.plan && trial.plan !== 'Free Demo'))

  const className = `flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
    isPaidPlan
      ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]'
      : 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#FBBF24]'
  } ${isActionable ? 'hover:bg-[#F59E0B]/20' : 'cursor-default'}`

  return (
    <button type="button" onClick={onClick} disabled={!isActionable} className={className}>
      <CreditCard size={13} />
      {compact && trial.plan === 'Free Demo' ? 'Free Demo' : label}
    </button>
  )
}
