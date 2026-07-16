import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Privacy Policy</h1>
        <p className="text-[#8B92A3] mb-8">
          Deal Blast Pro collects and processes information submitted through our website, waitlist, buyer portal, deal-submission forms, and authenticated platform features. This Privacy Policy explains the categories of information we collect, how we use it, and the choices available to users.
        </p>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Information We Collect</h2>
            <p>
              We may collect account information, waitlist registrations, deal submissions, buyer submissions, uploaded photos and documents, property addresses, buyer criteria, messages, usage data, authentication data, billing records, and Property Intelligence search details.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">How We Use Information</h2>
            <p>
              Information is used to operate Deal Blast Pro, review opportunities, evaluate buyer fit, manage subscriptions, provide support, process requested communications, improve workflows, protect the platform, and maintain business records.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Public Visibility</h2>
            <p>
              Deal Blast Pro does not intentionally publish private contact information on public pages unless the user requests or authorizes publication. Public forms are intended for private review by the appropriate workspace team.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Cookies And Local Storage</h2>
            <p>
              Deal Blast Pro may use browser storage, cookies, or similar technologies to support authentication, workspace preferences, form behavior, security, and product analytics.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Service Providers</h2>
            <p>
              We may use service providers such as Supabase for authentication, database, and storage services; Vercel for hosting; Stripe for billing when applicable; RentCast for Property Intelligence when applicable; and Resend for email delivery when applicable.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Retention, Deactivation, And Requests</h2>
            <p>
              Records may be retained for operational, security, legal, billing, and audit purposes. Account deactivation restricts access but does not automatically hard-delete deals, buyers, submissions, files, settings, or billing records. Users may contact us to request correction, deletion, or access to information, subject to applicable law and legitimate business needs.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Security And Children</h2>
            <p>
              We use safeguards designed to protect account and submission information, but no system can guarantee absolute security. Deal Blast Pro is not intended for children, and we do not knowingly collect information from children.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Policy Changes And Contact</h2>
            <p>
              We may update this Privacy Policy as the product, services, or legal requirements change. Questions or requests can be submitted through the Contact page.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: July 15, 2026</p>
      </main>

      <PublicFooter />
    </div>
  )
}
