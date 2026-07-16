import { useState } from 'react'
import {
  LAUNCH_ANNUAL_PROMOTION,
  LAUNCH_ANNUAL_PROMOTION_COPY,
  isLaunchAnnualPromotionActive,
} from '../lib/planPricing'
import type { BillingFrequency } from '../lib/billingLinks'

type Props = {
  billing: BillingFrequency
}

export default function LaunchPromoCode({ billing }: Props) {
  const [copied, setCopied] = useState(false)
  if (billing !== 'annual' || !isLaunchAnnualPromotionActive()) return null

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
    <div className="mx-auto mt-3 max-w-4xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-5 text-amber-100 sm:px-4">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center sm:text-left">
        <span className="font-medium">{LAUNCH_ANNUAL_PROMOTION_COPY}</span>
        <span className="text-amber-100">Promo code:</span>
        <code className="rounded bg-[#070A0F] border border-amber-400/40 px-2 py-1 text-xs font-semibold tracking-[0.12em] text-amber-200">
          {LAUNCH_ANNUAL_PROMOTION.code}
        </code>
        <button type="button" onClick={copyCode} className="btn btn-ghost px-2 py-1 text-[11px]">
          {copied ? 'Copied' : 'Copy Code'}
        </button>
        <span className="text-amber-200/90">Eligible on Pro annual and approved higher-tier annual purchases.</span>
      </div>
    </div>
  )
}
