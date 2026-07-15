import { Link } from 'react-router-dom'

const footerLinks = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/portal', label: 'Submit Deal' },
  { to: '/buyer-portal', label: 'Buyer Portal' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/security', label: 'Security' }
]

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Terms of Service</h1>
        <p className="text-[#8B92A3] mb-8">
          These public terms describe basic expectations for using Deal Blast Pro public pages and forms.
        </p>

        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200 mb-8">
          This page is a working template and should be reviewed by legal counsel before production use.
        </div>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Platform Purpose</h2>
            <p>
              Deal Blast Pro is a platform for collecting real estate deal information and buyer information through public forms and related workflows.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">No Guarantees</h2>
            <p>
              Submitting a deal does not guarantee review, marketing, acceptance, sale, funding, closing, or buyer interest. Buyer signup does not guarantee access to every deal or investment opportunity.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">User Responsibilities</h2>
            <p>
              Users must submit accurate information and only upload files, photos, contracts, financial documents, or other materials they have the right to share.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">No Professional Advice</h2>
            <p>
              Deal Blast Pro does not provide legal, financial, tax, brokerage, or investment advice through the public pages. Users are responsible for their own due diligence and should consult qualified professionals when needed.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Platform Changes</h2>
            <p>
              Platform access, features, workflows, and availability may change as production features are added, configured, tested, or updated.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: Public working template. This is not legal advice.</p>
      </main>

      <footer className="border-t border-[#252A38] py-8 text-center text-xs text-[#8B92A3]">
        Deal Blast Pro<br />
        {footerLinks.map((link, index) => (
          <span key={link.to}>
            <Link to={link.to} className="hover:text-white">{link.label}</Link>
            {index < footerLinks.length - 1 ? ' - ' : ''}
          </span>
        ))}
      </footer>
    </div>
  )
}
