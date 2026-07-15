import { Link } from 'react-router-dom'
import PublicNav from '../../components/layout/PublicNav'

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-semibold mb-4">Refund Policy</h1>
        <div className="card p-6 space-y-4 text-sm leading-6 text-[#C5CAD6]">
          <p>Deal Blast Pro subscription charges are nonrefundable except where required by law.</p>
          <p>Customers may cancel future renewals. Cancellation stops future billing but does not automatically refund the current billing period.</p>
          <p>Any exceptions are reviewed case by case and do not create a guarantee of future refunds.</p>
          <p>For billing questions, contact support through the account settings page or the public contact form.</p>
        </div>
        <div className="mt-6 text-sm">
          <Link to="/terms" className="text-[#3B82F6]">Terms of Service</Link>
        </div>
      </main>
    </div>
  )
}
