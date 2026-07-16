import { useState } from 'react'
import {
  LAUNCH_ANNUAL_PROMOTION,
  LAUNCH_ANNUAL_PROMOTION_COPY,
  canShowLaunchAnnualPromotion,
  type PricingPlanName,
} from '../lib/planPricing'

type Props = {
  plan: PricingPlanName
  billing: 'monthly' | 'annual'
  compact?: boolean
}

export default function LaunchPromoCode({ plan, billing, compact = false }: Props) {
  const [copied, setCopied] = useState(false)
  if (!canShowLaunchAnnualPromotion(plan, billing)) return null

  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(LAUNCH_ANNUAL_PROMOTION.code)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = LAUNCH_ANNUAL_PROMOTION.code
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div className={`rounded border border-amber-500/30 bg-amber-500/10 text-amber-100 ${compact ? 'p-2 text-[11px]' : 'p-3 text-xs'}`}>
      <div className="font-medium leading-5">{LAUNCH_ANNUAL_PROMOTION_COPY}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span>Promo code:</span>
        <code className="rounded bg-[#070A0F] border border-amber-400/40 px-2 py-1 font-semibold tracking-[0.12em] text-amber-200">
          {LAUNCH_ANNUAL_PROMOTION.code}
        </code>
        <button type="button" onClick={copyCode} className="btn btn-ghost px-2 py-1 text-[11px]">
          {copied ? 'Copied' : 'Copy Code'}
        </button>
      </div>
    </div>
  )
}
