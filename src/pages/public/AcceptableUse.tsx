import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'

export default function AcceptableUse() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-semibold mb-4">Acceptable Use Policy</h1>
        <p className="text-[#8B92A3] mb-8">
          Deal Blast Pro may be used only for lawful real estate disposition, buyer management, submission review, and related business workflows.
        </p>

        <section className="card p-6 space-y-4 text-sm leading-6 text-[#C5CAD6]">
          <p>Do not upload illegal content, malware, deceptive material, unauthorized personal data, or documents you do not have permission to share.</p>
          <p>Do not scrape, spam, overload, reverse engineer, bypass access controls, or attempt to access another user&apos;s workspace, files, submissions, or account records.</p>
          <p>Do not use Deal Blast Pro to misrepresent ownership, buyer interest, available funds, property status, contract rights, or other material deal information.</p>
          <p>We may limit, suspend, or remove access when usage threatens security, privacy, platform stability, payment integrity, or legal compliance.</p>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: July 15, 2026</p>
        <div className="mt-6 text-sm">
          <Link to="/privacy" className="text-[#3B82F6]">Privacy Policy</Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
