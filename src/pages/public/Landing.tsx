import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileText, Search, Send, ShieldCheck, UserRoundCheck } from 'lucide-react'
import PublicFooter from '../../components/layout/PublicFooter'
import PublicNav from '../../components/layout/PublicNav'

const audience = [
  {
    title: 'For wholesalers',
    desc: 'Collect opportunities, keep buyer interest organized, and move from review to outreach with less scattered follow-up.'
  },
  {
    title: 'For dispo teams',
    desc: 'Give operators one workspace for submissions, inventory, buyer fit, exports, and follow-up activity.'
  },
  {
    title: 'For investor-friendly deal flow',
    desc: 'Review inbound deals before marketing them and keep private contact details out of public pages.'
  },
  {
    title: 'For subscription access',
    desc: 'Join the waitlist for early access, product launch updates, and plan availability.'
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
                <Link to="/waitlist" className="btn btn-green text-base px-7 py-3">
                  Join the Waitlist
                  <ArrowRight size={18} />
                </Link>
                <Link to="/pricing" className="btn btn-ghost text-base px-7 py-3">View Pricing</Link>
                <Link to="/admin-login" className="btn btn-ghost text-base px-7 py-3">Sign In</Link>
              </div>
            </div>

            <div className="panel p-5 border-[#3B82F6]/30">
              <div className="text-sm text-[#8B92A3] mb-4">Workspace snapshot</div>
              <div className="space-y-3">
                {['Submission review', 'Buyer database', 'Pipeline tracking', 'Stripe subscription access'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-lg border border-[#252A38] bg-[#0A0C12] px-4 py-3">
                    <CheckCircle2 className="text-[#22C55E] shrink-0" size={18} />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 p-4 text-sm text-[#C5CAD6]">
                Your information is used to review opportunities and buyer fit. We do not publish private contact details on public pages.
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-14">
          <div className="mb-8">
            <div className="text-[#22C55E] text-sm font-semibold tracking-[1px]">BUILT FOR DISPO WORKFLOW</div>
            <h2 className="text-3xl font-semibold mt-2">Software for real estate operators, not just another lead form.</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {audience.map((item) => (
              <div key={item.title} className="card p-5">
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
                <h2 className="text-3xl font-semibold mt-2">From inbound opportunity to focused buyer outreach.</h2>
              </div>
              <p className="max-w-xl text-sm text-[#8B92A3]">
                The public portals are part of the workflow, but the product is the operating workspace behind review, matching, and follow-up.
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

        <section className="max-w-7xl mx-auto px-6 py-14 grid lg:grid-cols-2 gap-5">
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
              <Link to="/waitlist" className="btn btn-ghost">
              Join Waitlist
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <section className="border-y border-[#252A38] bg-[#12151F]">
          <div className="max-w-7xl mx-auto px-6 py-10">
            <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 p-5 flex flex-col md:flex-row md:items-center gap-4">
              <ShieldCheck className="text-[#22C55E] shrink-0" size={28} />
              <p className="text-[#C5CAD6]">
                Your information is used to review opportunities and buyer fit. We do not publish private contact details on public pages.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 py-14 text-center">
          <h2 className="text-3xl font-semibold mb-4">Start building your dispo workspace.</h2>
          <p className="text-[#8B92A3] mb-7">
            Join the waitlist for Deal Blast Pro early access and product launch updates.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
            <Link to="/waitlist" className="btn btn-green px-8 py-3 text-base">Join the Waitlist</Link>
            <Link to="/pricing" className="btn btn-ghost px-8 py-3 text-base">View Pricing</Link>
            <Link to="/admin-login" className="btn btn-ghost px-8 py-3 text-base">Sign In</Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
