import React from 'react'
import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'
import { PLAN_ENTITLEMENTS } from '../../lib/planEntitlements'
import {
  LAUNCH_ANNUAL_PROMOTION_COPY,
  PRICING_PLAN_ORDER,
  PLAN_PRICING,
  getPriceDisplay,
} from '../../lib/planPricing'

const tierPoints: Record<string, string[]> = {
  Free: ['Public submission access', 'ARV calculator', 'Up to 25 buyers'],
  Starter: ['Deal and buyer management', 'Core starter calculators', 'Up to 250 buyers'],
  Pro: ['Advanced buyer matching', 'All calculators', '25 Property Intelligence lookups monthly', 'Up to 1,000 buyers'],
  Agency: ['Higher monthly limits', '100 Property Intelligence lookups monthly', 'Up to 2,000 buyers', 'Team features coming soon'],
  Enterprise: ['Up to 5,000 buyers', 'Custom Property Intelligence limits', 'Custom workflows and support'],
}

const tiers = PRICING_PLAN_ORDER.map(name => ({
  ...PLAN_PRICING[name],
  points: tierPoints[name],
  positioning: PLAN_PRICING[name].description,
}))

const featureRows = [
  {
    feature: 'Public Deal Submission Portal',
    statuses: ['Included', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Public Buyer Signup Portal',
    statuses: ['Included', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Deal and Submission Management',
    statuses: ['Limited', 'Included', 'Advanced', 'Advanced', 'Custom']
  },
  {
    feature: 'Buyer Database Capacity',
    statuses: [
      PLAN_ENTITLEMENTS.Free.buyerLimitLabel,
      PLAN_ENTITLEMENTS.Starter.buyerLimitLabel,
      PLAN_ENTITLEMENTS.Pro.buyerLimitLabel,
      PLAN_ENTITLEMENTS.Agency.buyerLimitLabel,
      PLAN_ENTITLEMENTS.Enterprise.buyerLimitLabel
    ]
  },
  {
    feature: 'Buyer Matching',
    statuses: ['Not included', 'Basic', 'Advanced', 'Advanced', 'Custom']
  },
  {
    feature: 'Deal Blast Builder',
    statuses: ['Not included', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Follow-Up Task Center',
    statuses: ['Not included', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Core Deal Calculators',
    statuses: ['ARV Calculator', 'ARV, Rehab, and MAO', 'All calculators', 'All calculators', 'All calculators']
  },
  {
    feature: 'Property Intelligence',
    statuses: ['Not included', 'Not included', '25 lookups per month', '100 lookups per month', 'Custom']
  },
  {
    feature: 'Custom Buyer and Deal Portals',
    statuses: ['Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom / Coming Soon']
  },
  {
    feature: 'Deal Submission Review Center',
    statuses: ['Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Buyer Portal Review Center',
    statuses: [
      PLAN_ENTITLEMENTS.Free.buyerPortalReviewLabel,
      PLAN_ENTITLEMENTS.Starter.buyerPortalReviewLabel,
      PLAN_ENTITLEMENTS.Pro.buyerPortalReviewLabel,
      PLAN_ENTITLEMENTS.Agency.buyerPortalReviewLabel,
      'Custom'
    ]
  },
  {
    feature: 'Global Buyer Hub',
    statuses: ['Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Team and Multi-User Access',
    statuses: ['Not included', 'Not included', 'Single user', 'Coming Soon', 'Custom']
  }
]

const statusClass = (status: string) => {
  if (status === 'Included') return 'text-[#22C55E]'
  if (status === 'Planned' || status === 'Coming Soon' || status.includes('Coming Soon')) return 'text-[#FBBF24]'
  if (status === 'Custom') return 'text-[#60A5FA]'
  if (status === 'Advanced') return 'text-[#A78BFA]'
  if (status === 'Not included' || status === '-') return 'text-[#64748B]'
  if (status === 'Basic' || status === 'Limited' || status.includes('lookups') || status.includes('buyer') || status.includes('user') || status.includes('ARV') || status.includes('calculator')) return 'text-[#C5CAD6]'
  return 'text-[#8B92A3]'
}

export default function Pricing() {
  const [billing, setBilling] = React.useState<'monthly' | 'annual'>('monthly')

  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-semibold tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-3 text-[#8B92A3]">Start small, then upgrade when your deal flow and buyer outreach need more room.</p>
          <p className="mt-2 text-sm text-[#C5CAD6]">Start with Free, Starter, or Pro. Agency and Enterprise options are available by request.</p>
          <p className="mt-2 text-xs text-[#8B92A3]">Features labeled Coming Soon are not yet available for customer use. Plan limits and feature availability are enforced by account and workspace.</p>
          <p className="mt-3 text-xs font-medium text-[#FBBF24]">{LAUNCH_ANNUAL_PROMOTION_COPY}</p>
          <div className="mt-5 grid gap-2 md:hidden">
            <Link to="/waitlist" className="btn btn-green w-full justify-center py-3 text-sm">
              Join Waitlist
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/pricing" className="btn btn-ghost justify-center px-3 py-2.5 text-sm">
                Starter Details
              </Link>
              <Link to="/pricing" className="btn btn-ghost justify-center px-3 py-2.5 text-sm">
                Pro Details
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 mb-8 sm:flex-row sm:gap-3">
          <div className="inline-flex rounded-lg border border-[#252A38] p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1 text-sm rounded-md ${billing === 'monthly' ? 'bg-[#3B82F6] text-white' : 'text-[#8B92A3]'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-4 py-1 text-sm rounded-md ${billing === 'annual' ? 'bg-[#3B82F6] text-white' : 'text-[#8B92A3]'}`}
            >
              Annual
            </button>
          </div>
          <div className="max-w-xs text-center text-xs leading-4 text-[#8B92A3] sm:max-w-none sm:text-left">Annual plans save 2 months compared to monthly billing.</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-16">
          {tiers.map((tier) => {
            const priceDisplay = getPriceDisplay(tier.name, billing)

            return (
              <div
                key={tier.name}
                className={`card p-6 flex flex-col min-h-[335px] overflow-visible ${tier.highlight ? 'ring-2 ring-[#22C55E] relative' : ''}`}
              >
                <div className="h-7 mb-1 flex items-start justify-center">
                  {tier.badge && (
                    <div className="bg-[#22C55E] text-black text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                      {tier.badge}
                    </div>
                  )}
                </div>

                <div className="mb-5">
                  <div className="font-semibold text-xl">{tier.name}</div>
                  {tier.releaseStatus && <div className="mt-1 text-xs text-amber-300">{tier.releaseStatus}</div>}
                  <div className="mt-2 min-h-[78px] text-xs leading-5 text-[#8B92A3] italic break-words">{tier.positioning}</div>
                  <div className="mt-5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-3xl font-semibold leading-none tabular-nums">{priceDisplay.price}</span>
                    </div>
                    <div className="mt-2 text-[11px] leading-4 text-[#8B92A3] break-words">
                      {priceDisplay.noteLines.map(line => <div key={line}>{line}</div>)}
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    {tier.points.map(point => (
                      <div key={point} className="text-xs leading-4 text-[#C5CAD6]">
                        <span className={tier.highlight ? 'text-[#22C55E]' : 'text-[#64748B]'}>-</span> {point}
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  to={tier.to}
                  className={`btn text-center mt-auto ${tier.highlight ? 'btn-green' : 'btn-ghost'}`}
                >
                  {tier.cta}
                </Link>
              </div>
            )
          })}
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 text-center">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-[#252A38]">
              <thead>
                <tr className="bg-[#12151F]">
                  <th className="p-3 text-left font-normal text-[#8B92A3]">Feature</th>
                  {tiers.map((tier) => (
                    <th key={tier.name} className="p-3 text-center font-normal">{tier.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.feature} className="border-t border-[#252A38]">
                    <td className="p-3 font-medium">{row.feature}</td>
                    {tiers.map((tier, index) => {
                      const status = row.statuses[index] || '-'
                      return (
                        <td key={tier.name} className={`p-3 text-center text-xs font-medium ${statusClass(status)}`}>
                          {status}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-xs text-[#8B92A3]">
            Property Intelligence lookups start on Pro. Cached results may not use an additional lookup credit. Data availability varies by property and market.
          </p>
          <p className="mt-2 text-center text-xs text-[#8B92A3]">
            Additional buyer-capacity packs may be offered in the future.
          </p>
        </section>

        <div className="text-center text-xs text-[#8B92A3]">
          Cancel or downgrade anytime. Contact sales for higher-volume needs.
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}

