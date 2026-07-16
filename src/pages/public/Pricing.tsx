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
    positioning: 'For quick testing of the public submission flow.',
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: false
  },
  {
    name: 'Starter',
    monthly: '$47/mo',
    annual: '$40/mo',
    annualNote: '$470 billed annually',
    positioning: 'For solo operators collecting deals and buyer interest.',
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: false
  },
  {
    name: 'Pro',
    monthly: '$97/mo',
    annual: '$81/mo',
    annualNote: '$970 billed annually',
    promoAnnual: '$73/mo',
    promoLabel: 'with LAUNCH10',
    promoAnnualNote: '$873 first annual payment',
    positioning: 'For one active operator who needs buyer matching, match scoring, deal blast exports, and regular buyer outreach.',
    cta: 'Join Waitlist',
    to: '/waitlist',
    highlight: true,
    badge: 'Most Popular'
  },
  {
    name: 'Agency',
    monthly: '$197/mo',
    annual: '$165/mo',
    annualNote: '$1,970 billed annually',
    promoAnnual: '$148/mo',
    promoLabel: 'with LAUNCH10',
    promoAnnualNote: '$1,773 first annual payment',
    positioning: 'For heavier dispo workflows, saved buyer segments, stronger matching, follow-up systems, and future team/VA workflows. Team/VA features may require setup before use.',
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
    positioning: 'For custom onboarding, integrations, production support, higher-volume needs, and custom team workflows.',
    cta: 'Contact Sales',
    to: '/contact',
    highlight: false,
    releaseStatus: 'Coming Soon / Contact Admin'
  }
]

const featureRows = [
  {
    feature: 'Public deal intake',
    statuses: ['Included', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Public buyer signup',
    statuses: ['Included', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Buyer criteria capture',
    statuses: ['Basic', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Document uploads',
    statuses: ['Limited', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'ARV Calculator',
    statuses: ['Included', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Rehab Calculator',
    statuses: ['-', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'MAO / Offer Calculator',
    statuses: ['-', 'Included', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Rental Deal Calculator',
    statuses: ['-', '-', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Creative Finance Calculator',
    statuses: ['-', '-', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Property Intelligence',
    statuses: ['-', 'Limited Preview', 'Included with limits', 'Advanced', 'Custom']
  },
  {
    feature: 'Custom buyer and deal portals',
    statuses: ['-', '-', 'Pro and higher', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Global Buyer Hub verified network',
    statuses: ['-', '-', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Submit buyers to Global Buyer Hub',
    statuses: ['-', 'Paid submit only', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Deal Blast Pro Community',
    statuses: ['-', 'Coming Soon', 'Coming Soon', 'Coming Soon', 'Custom']
  },
  {
    feature: 'Buyer matching',
    statuses: ['-', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Match score / heat tags',
    statuses: ['-', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Saved buyer segments',
    statuses: ['-', '-', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Buyer outreach exports',
    statuses: ['-', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Deal blast templates',
    statuses: ['-', 'Basic', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Follow-up task tools',
    statuses: ['-', '-', 'Included', 'Advanced', 'Custom']
  },
  {
    feature: 'Basic reporting',
    statuses: ['-', '-', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Data export',
    statuses: ['-', '-', 'Included', 'Included', 'Included']
  },
  {
    feature: 'Team / VA access',
    statuses: ['-', '-', 'Planned', 'Priority Roadmap', 'Custom']
  },
  {
    feature: 'Role permissions',
    statuses: ['-', '-', 'Planned', 'Priority Roadmap', 'Custom']
  },
  {
    feature: 'Email notifications',
    statuses: ['-', 'Planned', 'Planned', 'Priority Roadmap', 'Custom']
  },
  {
    feature: 'Custom onboarding',
    statuses: ['-', '-', '-', 'Optional Setup', 'Custom']
  },
  {
    feature: 'Integration support',
    statuses: ['-', '-', '-', 'Optional Setup', 'Custom']
  }
]

const statusClass = (status: string) => {
  if (status === 'Included') return 'text-[#22C55E]'
  if (status === 'Planned' || status === 'Priority Roadmap' || status === 'Coming Soon' || status.includes('Coming Soon')) return 'text-[#FBBF24]'
  if (status === 'Custom') return 'text-[#60A5FA]'
  if (status === 'Advanced') return 'text-[#A78BFA]'
  if (status === 'Basic' || status === 'Limited' || status === 'Limited Preview' || status === 'Included with limits' || status === 'Optional Setup') return 'text-[#C5CAD6]'
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

  if (tier.name === 'Pro' || tier.name === 'Agency') {
    return {
      price: tier.promoAnnual || tier.annual,
      noteLines: [],
      promoLabel: tier.promoLabel,
      regularPrice: tier.annual,
      annualPayment: tier.promoAnnualNote,
      regularAnnualPayment: tier.annualNote,
    }
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
          <p className="mt-2 text-sm text-[#C5CAD6]">Public release tiers: Free Demo, Starter, and Pro. Agency and Enterprise are Coming Soon / Contact Admin.</p>
          <p className="mx-auto mt-2 max-w-3xl text-sm leading-5 text-amber-300">Launch promo: Use code LAUNCH10 for 10% off your first annual payment on Pro annual and higher annual plans through 01/01/2027.</p>
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
                      {'promoLabel' in priceDisplay && priceDisplay.promoLabel && (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-amber-300">{priceDisplay.promoLabel}</span>
                      )}
                    </div>
                    {'regularPrice' in priceDisplay && priceDisplay.regularPrice && (
                      <div className="mt-1 text-xs text-[#8B92A3] line-through">Regular {priceDisplay.regularPrice}</div>
                    )}
                    <div className="mt-2 text-[11px] leading-4 text-[#8B92A3] break-words">
                      {priceDisplay.noteLines.map(line => <div key={line}>{line}</div>)}
                      {'annualPayment' in priceDisplay && priceDisplay.annualPayment && <div className="text-amber-300">{priceDisplay.annualPayment}</div>}
                      {'regularAnnualPayment' in priceDisplay && priceDisplay.regularAnnualPayment && (
                        <div className="text-[#64748B] line-through">Regular {priceDisplay.regularAnnualPayment}</div>
                      )}
                    </div>
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
            Matching, exports, templates, calculators, and follow-up tools are core Deal Blast Pro workflows. Property Intelligence requires provider setup and is not advertised as fully live until licensed production data sources are connected.
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

