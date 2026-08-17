import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileText, Search, Send, ShieldCheck, UserRoundCheck } from 'lucide-react'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'

const audience = [
  {
    title: 'For wholesalers and dispo teams',
    desc: 'Collect opportunities, organize buyers, track inventory, and move deals from review to targeted outreach with less scattered follow-up.'
  },
  {
    title: 'For agents and brokers',
    desc: 'Review investor-friendly opportunities, organize property details and documents, and connect deals with qualified buyers and partners.'
  },
  {
    title: 'For investors and acquisition teams',
    desc: 'Evaluate incoming opportunities, track active deals, maintain buyer criteria, and keep acquisition and disposition activity organized.'
  },
  {
    title: 'For real estate teams and deal partners',
    desc: 'Give your team one workspace for submissions, buyer matching, documents, status updates, exports, and follow-up.'
  }
]

const steps = [
  { title: 'Capture submissions', desc: 'Use public intake forms to collect deal details and buyer criteria without building extra forms.', icon: FileText },
  { title: 'Review the pipeline', desc: 'Organize submissions, inventory, documents, and statuses before outreach begins.', icon: Search },
  { title: 'Match buyer fit', desc: 'Use buyer criteria and match scoring to prioritize the right audience for each opportunity.', icon: UserRoundCheck },
  { title: 'Blast and follow up', desc: 'Export outreach lists, use templates, and keep follow-up work moving from one workspace.', icon: Send }
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <PublicNav />

      <main>
        <section className="relative overflow-hidden border-b border-[#252A38]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_12%_6%,rgba(59,130,246,0.16),transparent_30%)]" />
          <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-24 grid lg:grid-cols-[1fr_420px] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] text-xs font-semibold tracking-[1.5px] border border-[#22C55E]/20">
                <ShieldCheck size={14} />
                DISPO + BUYER MATCHING SOFTWARE
              </div>
              <h1 className="text-5xl lg:text-7xl font-semibold leading-[0.95] mb-6">
                Deal Blast Pro
              </h1>
              <p className="max-w-2xl text-xl text-[#C5CAD6] mb-8">
                Deal Blast Pro helps real estate operators collect deal submissions, organize buyers, track inventory, and manage disposition follow-up from one simple workspace.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                  <Link to="/register" className="btn btn-green text-base px-7 py-3">
                   Create Free Account
                  <ArrowRight size={18} />
                </Link>
                <Link to="/pricing" className="btn btn-ghost text-base px-7 py-3">View Pricing</Link>
                <Link to="/admin-login" className="btn btn-ghost text-base px-7 py-3">Sign In</Link>
              </div>
            </div>

            <div className="panel p-5 sm:p-6 border-[#3B82F6]/30 flex flex-col justify-center">
              <div className="text-sm text-[#8B92A3] mb-4">Workspace snapshot</div>
              <div className="space-y-3">
                {['Submission review', 'Buyer database', 'Pipeline tracking', 'Stripe subscription access'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-lg border border-[#252A38] bg-[#0A0C12] px-4 py-3">
                    <CheckCircle2 className="text-[#22C55E] shrink-0" size={18} />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-14">
          <div className="mb-8">
            <div className="text-[#22C55E] text-sm font-semibold tracking-[1px]">BUILT FOR REAL ESTATE DEAL WORKFLOWS</div>
            <h2 className="text-3xl font-semibold mt-2">Built for every side of the real estate deal.</h2>
            <p className="mt-3 max-w-3xl text-[#8B92A3]">
              Organize opportunities, buyers, documents, inventory, and follow-up from one connected workspace.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {audience.map((item) => (
              <div key={item.title} className="card p-5 h-full">
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[#8B92A3]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#12151F] border-y border-[#252A38]">
          <div className="max-w-7xl mx-auto px-6 py-14">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
              <div>
                <div className="text-[#22C55E] text-sm font-semibold tracking-[1px]">HOW IT WORKS</div>
                <h2 className="text-3xl font-semibold mt-2">From incoming opportunity to organized deal follow-up.</h2>
              </div>
              <p className="max-w-xl text-sm text-[#8B92A3]">
                The public portals are part of the workflow, but the product is the operating workspace behind review, matching, inventory, exports, and follow-up.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((step, index) => {
                const Icon = step.icon
                return (
                  <div key={step.title} className="card p-5">
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-10 h-10 rounded-lg bg-[#3B82F6]/15 text-[#60A5FA] flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <div className="text-xs text-[#8B92A3]">{String(index + 1).padStart(2, '0')}</div>
                    </div>
                    <h3 className="font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-[#8B92A3]">{step.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 pt-14 pb-10 grid lg:grid-cols-2 gap-5">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#22C55E]/15 text-[#22C55E] flex items-center justify-center">
                <UserRoundCheck size={20} />
              </div>
              <h2 className="text-2xl font-semibold">Buyer database</h2>
            </div>
            <p className="text-[#C5CAD6] mb-4">
              Keep buyer criteria, markets, budget, funding notes, and fit signals organized so your outreach starts with better targeting.
            </p>
            <Link to="/pricing" className="btn btn-ghost">
              Compare Plans
              <ArrowRight size={17} />
            </Link>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#3B82F6]/15 text-[#60A5FA] flex items-center justify-center">
                <FileText size={20} />
              </div>
              <h2 className="text-2xl font-semibold">Submission review</h2>
            </div>
            <p className="text-[#C5CAD6] mb-4">
              Review inbound opportunities before marketing anything, then move qualified deals into inventory, buyer matching, exports, and follow-up.
            </p>
               <Link to="/pricing" className="btn btn-ghost">
               View Pricing
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 pt-4 pb-14 text-center">
          <h2 className="text-3xl font-semibold mb-4">Start building your dispo workspace.</h2>
          <p className="text-[#8B92A3] mb-7">
            Create your workspace and start organizing deals and buyers today.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
             <Link to="/register" className="btn btn-green px-8 py-3 text-base">Create Free Account</Link>
            <Link to="/pricing" className="btn btn-ghost px-8 py-3 text-base">View Pricing</Link>
            <Link to="/admin-login" className="btn btn-ghost px-8 py-3 text-base">Sign In</Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
