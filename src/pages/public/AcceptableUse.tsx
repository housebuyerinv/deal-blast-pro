import { Link } from 'react-router-dom'
import PublicNav from '../../components/layout/PublicNav'

export default function AcceptableUse() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-semibold mb-4">Acceptable Use Policy</h1>
        <div className="card p-6 space-y-4 text-sm leading-6 text-[#C5CAD6]">
          <p>Deal Blast Pro may be used only for lawful real estate disposition, buyer management, and related business workflows.</p>
          <p>Do not upload illegal content, malware, deceptive material, unauthorized personal data, or documents you do not have permission to share.</p>
          <p>Do not scrape, spam, overload, reverse engineer, bypass access controls, or attempt to access another user&apos;s workspace or files.</p>
          <p>We may limit, suspend, or remove access when usage threatens security, privacy, platform stability, or legal compliance.</p>
        </div>
        <div className="mt-6 text-sm">
          <Link to="/privacy" className="text-[#3B82F6]">Privacy Policy</Link>
        </div>
      </main>
    </div>
  )
}
