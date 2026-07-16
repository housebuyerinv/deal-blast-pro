import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-semibold mb-4">Refund Policy</h1>
        <p className="text-[#8B92A3] mb-8">
          Deal Blast Pro subscription charges and one-time digital-credit purchases are nonrefundable except where required by applicable law. Users may cancel future subscription renewals through the available billing controls.
        </p>

        <section className="card p-6 space-y-5 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Monthly And Annual Subscriptions</h2>
            <p>
              Monthly and annual subscription charges are nonrefundable except where required by law. Canceling a subscription stops future automatic renewal but does not automatically refund the current billing period.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Current Billing-Period Access</h2>
            <p>
              Users generally retain access through the end of the paid billing period unless access is suspended for misuse, fraud, chargeback activity, security concerns, or another valid enforcement reason.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Property Intelligence Credits</h2>
            <p>
              Property Intelligence lookup-credit packs are one-time digital purchases and are nonrefundable except where required by law. Unused purchased credits remain associated with an active eligible account.
            </p>
            <p className="mt-3">
              Canceling Pro prevents Property Intelligence usage after paid Pro access ends, even if unused purchased credits remain. Credits may become usable again if the same workspace later reactivates an eligible plan, subject to this policy and applicable retention limits.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Duplicate Charges And Failed Payments</h2>
            <p>
              Duplicate charges or clear billing errors should be reported for review. Verified billing errors may be corrected. Failed payments may interrupt access until billing is resolved.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Disputes And Legal Exceptions</h2>
            <p>
              Charge disputes may affect account access while they are reviewed. Nothing in this policy limits refunds or rights required by applicable law.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Billing Questions</h2>
            <p>
              Billing questions can be submitted through account settings when signed in or through the public <Link to="/contact" className="text-[#3B82F6]">Contact</Link> page.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: July 15, 2026</p>
      </main>

      <PublicFooter />
    </div>
  )
}
