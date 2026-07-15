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

export default function Security() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Security Overview</h1>
        <p className="text-[#8B92A3] mb-8">
          This page explains the intended security posture for public Deal Blast Pro forms and production readiness planning.
        </p>

        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200 mb-8">
          This is a production readiness and security overview, not a guarantee of completed enterprise security controls.
        </div>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Public Forms</h2>
            <p>
              Public forms collect information for review, including deal details, buyer criteria, contact information, messages, and uploaded files.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Admin Access</h2>
            <p>
              Admin areas require login. Public users should use the seller/deal submission form, buyer portal, pricing page, or contact page rather than attempting to access private work areas.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Uploaded Files</h2>
            <p>
              Uploaded files should not include unnecessary sensitive information. Submit only files that are relevant to review and that you have the right to share.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Production Readiness</h2>
            <p>
              A production setup should include secure storage, access controls, backups, email security, monitoring, and periodic security reviews before handling sensitive workflows at scale.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Report Concerns</h2>
            <p>
              Security concerns can be reported through the contact page. Please include enough detail to help identify the issue without sharing unnecessary private information.
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
