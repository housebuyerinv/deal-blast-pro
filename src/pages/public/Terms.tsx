import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Terms of Service</h1>
        <p className="text-[#8B92A3] mb-8">
          These Terms of Service govern access to and use of Deal Blast Pro, including public pages, submission forms, account features, subscriptions, and related services.
        </p>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Platform And Eligibility</h2>
            <p>
              Deal Blast Pro is a product of House Buyer Investments LLC for real estate disposition, buyer management, submission review, and related business workflows. Users must be able to enter binding agreements and use the platform only for lawful business purposes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Accounts And Security</h2>
            <p>
              Users are responsible for accurate registration information, account security, password protection, and activity under their accounts. Account access may be limited, suspended, or terminated for misuse, security concerns, nonpayment, or violation of these Terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Subscriptions, Trials, And Billing</h2>
            <p>
              Paid subscriptions, free trials, demos, and digital-credit purchases are subject to the plan details, checkout terms, billing provider rules, and Refund Policy in effect at the time of purchase or renewal.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Submissions, Files, And User Content</h2>
            <p>
              Users must submit accurate deal, buyer, and account information and may upload only files, photos, contracts, financial documents, or other materials they have the right to share. Users retain responsibility for their submissions and for removing unnecessary sensitive information.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Property Intelligence And Third-Party Data</h2>
            <p>
              Property Intelligence and other third-party data features may use outside providers such as RentCast when available. Third-party data can be incomplete, delayed, or inaccurate and should be independently verified before business decisions are made.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Acceptable Use</h2>
            <p>
              Users may not scrape, spam, overload, reverse engineer, bypass access controls, upload malware, submit deceptive content, access another workspace, or use Deal Blast Pro for unlawful or harmful activity.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">No Guarantees Or Professional Advice</h2>
            <p>
              Deal Blast Pro does not guarantee any deal, buyer, funding, sale, closing, valuation, rent estimate, or investment outcome. The platform does not provide legal, tax, brokerage, investment, financial, or lending advice.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Intellectual Property</h2>
            <p>
              Deal Blast Pro, its software, branding, workflows, and platform materials are owned by House Buyer Investments LLC or its licensors. Users may not copy or misuse the platform except as allowed through authorized access.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Disclaimers, Liability, And Indemnification</h2>
            <p>
              Deal Blast Pro is provided subject to availability and may change over time. To the fullest extent permitted by law, liability is limited for indirect, incidental, consequential, special, exemplary, or lost-profit damages. Users agree to be responsible for claims arising from their misuse of the platform or materials they submit.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Changes And Contact</h2>
            <p>
              We may update these Terms as features, services, or requirements change. Questions can be submitted through the Contact page.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: July 15, 2026</p>
      </main>

      <PublicFooter />
    </div>
  )
}
