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

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Privacy Policy</h1>
        <p className="text-[#8B92A3] mb-8">
          This public privacy template explains how Deal Blast Pro may collect and use information submitted through public deal and buyer forms.
        </p>

        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200 mb-8">
          This page is a working template and should be reviewed by legal counsel before production use.
        </div>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Information We Collect</h2>
            <p>
              Deal submissions may include contact details, company or role information, property addresses, property condition, pricing expectations, deal terms, seller notes, messages, photos, documents, and other files submitted for review.
            </p>
            <p className="mt-3">
              Buyer portal submissions may include contact details, company information, buyer criteria, preferred markets, asset types, budget ranges, financing preferences, proof files, and messages.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">How Information Is Used</h2>
            <p>
              Information may be used to review opportunities, evaluate buyer fit, communicate with sellers, deal finders, buyers, and team members, operate the platform, respond to requests, and improve public intake workflows.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Public Visibility</h2>
            <p>
              Private contact details are not published on public pages. Submitted information is intended for review and communication related to potential real estate opportunities and buyer interest.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Files And Storage</h2>
            <p>
              Uploaded files may be stored using connected storage, Supabase, or production storage when configured. Users should avoid submitting unnecessary sensitive information in files or messages.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Correction Or Removal Requests</h2>
            <p>
              Users may contact the company through the contact page to request correction, update, or removal of submitted information, subject to applicable legal, operational, and recordkeeping needs.
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
