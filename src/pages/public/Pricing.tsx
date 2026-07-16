import React from 'react'
import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'

const tiers = [
  {
    name: 'Free',
    monthly: '$0',
    annual: '$0',
    annualNote: 'annual plan',
    positioning: 'For testing public submission flows and exploring Deal Blast Pro.',
    points: ['Public intake testing', 'Basic evaluation limits'],
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: false
  },
  {
    name: 'Starter',
    monthly: '$47/mo',
    annual: '$470/yr',
    annualNote: '$470 billed annually',
    positioning: 'For solo wholesalers and investors who need organized deal and buyer management.',
    points: ['Deal and buyer management', 'Core starter calculators'],
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: false
  },
  {
    name: 'Pro',
    monthly: '$97/mo',
    annual: '$970/yr',
    annualNote: '$970 billed annually',
    positioning: 'For active operators who need buyer matching, deal blasts, advanced calculators, Property Intelligence, and stronger follow-up tools.',
    points: ['Advanced buyer matching', 'All core calculators', 'Property Intelligence limits', 'Custom portals'],
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: true,
    badge: 'Most Popular'
  },
  {
    name: 'Agency',
    monthly: '$197/mo',
    annual: '$1,970/yr',
    annualNote: '$1,970 billed annually',
    positioning: 'For teams managing higher deal volume, shared buyer activity, and multiple users.',
    points: ['Higher monthly limits', 'Team workspace planning', 'Contact-based setup'],
    cta: 'Contact Admin',
    to: '/contact',
    highlight: false,
    releaseStatus: 'Coming Soon / Contact Admin'
  },
  {
    name: 'Enterprise',
    monthly: '$297/mo or Custom',
    annual: 'Custom annual pricing',
    annualNote: 'Contact Admin',
    positioning: 'For custom onboarding, higher-volume workflows, integrations, and tailored support.',
    points: ['Custom volume', 'Custom roles and scale', 'Tailored support'],
    cta: 'Contact Sales',
    to: '/contact',
    highlight: false,
    releaseStatus: 'Coming Soon / Contact Sales'
  }
]

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
    feature: 'Buyer Database',
    statuses: ['Limited', 'Included', 'Advanced', 'Advanced', 'Custom']
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
    statuses: ['ARV only', 'ARV, Rehab, MAO', 'All calculators', 'All calculators', 'All calculators']
  },
  {
    feature: 'Property Intelligence',
    statuses: ['Not included', 'Not included', 'Included with monthly limits', 'Higher monthly limits', 'Custom']
  },
  {
    feature: 'Custom Buyer and Deal Portals',
    statuses: ['Not included', 'Not included', 'Included', 'Included', 'Custom']
  },
  {
    feature: 'Global Buyer Hub',
    statuses: ['Not included', 'Not included', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Team and Multi-User Access',
    statuses: ['Not included', 'Not included', 'Single user', 'Team access', 'Custom roles and scale']
  },
  {
    feature: 'Usage and Workspace Scale',
    statuses: ['Evaluation limits', 'Solo operator', 'Active operator', 'Team workspace', 'Custom volume']
  }
]

const statusClass = (status: string) => {
  if (status === 'Included') return 'text-[#22C55E]'
  if (status === 'Planned' || status === 'Coming Soon' || status.includes('Coming Soon')) return 'text-[#FBBF24]'
  if (status === 'Custom') return 'text-[#60A5FA]'
  if (status === 'Advanced') return 'text-[#A78BFA]'
  if (status === 'Not included' || status === '-') return 'text-[#64748B]'
  if (status === 'Basic' || status === 'Limited' || status.includes('limits') || status.includes('operator') || status.includes('workspace') || status.includes('user') || status.includes('ARV') || status.includes('calculator')) return 'text-[#C5CAD6]'
  return 'text-[#8B92A3]'
}

const getPlanPriceDisplay = (tier: typeof tiers[number], billing: 'monthly' | 'annual') => {
  if (billing === 'monthly') {
    return {
      price: tier.monthly,
      noteLines: tier.monthly.includes('Custom') ? ['or Custom'] : ['monthly plan']
    }
  }

  if (tier.name === 'Enterprise') {
    return { price: 'Custom annual pricing', noteLines: ['Contact Admin'] }
  }

  return {
    price: tier.annual,
    noteLines: tier.annual === '$0' ? ['annual plan'] : [tier.annualNote || 'billed annually']
  }
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
            const priceDisplay = getPlanPriceDisplay(tier, billing)

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
            Property Intelligence starts on Pro with monthly limits. Agency and Enterprise remain contact-based while higher-volume workflows are prepared.
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

