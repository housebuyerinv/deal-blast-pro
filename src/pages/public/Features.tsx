import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Building2, Calculator, Check, ChevronRight, ClipboardCheck,
  FileSearch, FolderKanban, Mail, Maximize2, Network, Send,
  Sparkles, Users, X,
} from 'lucide-react'
import PublicNav from '../../components/layout/PublicNav'
import PublicFooter from '../../components/layout/PublicFooter'
import { PLAN_PRICING } from '../../lib/planPricing'
import { PROPERTY_INTELLIGENCE_CREDIT_PACKS } from '../../lib/propertyIntelligencePolicy'

type TourItem = {
  id: string
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  image: string
  alt: string
  accent: string
  reverse?: boolean
}

const journey = [
  ['Submission', 'Capture public or internal deal intake.', FileSearch],
  ['Review', 'Check details, documents, and next actions.', ClipboardCheck],
  ['Inventory', 'Organize qualified opportunities.', FolderKanban],
  ['Calculator / Intelligence', 'Analyze the numbers and supported property data.', Calculator],
  ['Buyer Match', 'Compare the deal with your buyer criteria.', Users],
  ['Blast', 'Prepare targeted outreach and recipient groups.', Send],
  ['Follow-Up', 'Keep deal and buyer activity moving.', Mail],
  ['Closing', 'Track the operational path toward closing.', Building2],
] as const

const tour: TourItem[] = [
  {
    id: 'command-center', eyebrow: 'COMMAND CENTER', title: 'Know what needs your attention',
    body: 'See a high-level workspace view of active deal work without piecing the story together from separate spreadsheets and inboxes.',
    bullets: ['Deal and submission activity', 'Buyer matches and offers', 'Pending-document signals', 'Operational activity stream'],
    image: '/features/dbp-command-center.webp', alt: 'Demo Command Center, buyer database, inventory, calculator, and resource panels', accent: '#22C55E',
  },
  {
    id: 'deal-details', eyebrow: 'DEAL SUBMISSIONS + INVENTORY', title: 'Turn incoming opportunities into organized deal files',
    body: 'Collect opportunities through public submission or internal intake, review them, and move qualified deals into inventory with the important context attached.',
    bullets: ['Property, pricing, and financial details', 'Photos and document status', 'Creative or seller-finance terms where entered', 'Buyer matching and calculator access'],
    image: '/features/dbp-deal-details.webp', alt: 'Demo Deal Details screen with property information, photos, documents, pricing, and closing details', accent: '#3B82F6', reverse: true,
  },
  {
    id: 'buyer-database', eyebrow: 'BUYER DATABASE + MATCHING', title: 'Turn your buyer list into a searchable deal machine',
    body: 'Organize the buyers in your own workspace by the criteria that matter to your operation. DBP helps you search, filter, and prioritize fit—it does not promise a universal buyer list or a guaranteed match.',
    bullets: ['Market, strategy, asset, and budget criteria', 'Search, filters, import, and export', 'Buyer status, activity, and heat indicators', 'Workspace-based buyer matching'],
    image: '/features/dbp-buyer-database.webp', alt: 'Demo Buyer Database with market, strategy, budget, heat, and activity filters', accent: '#A855F7',
  },
  {
    id: 'deal-blast-builder', eyebrow: 'DEAL BLAST BUILDER', title: 'Build targeted deal outreach in minutes',
    body: 'Choose a deal, prepare the message, preview what buyers will receive, and select a relevant recipient group. The current workflow supports organized BCC, CSV, and batch preparation rather than promising automatic delivery.',
    bullets: ['Deal-driven templates and preview', 'Buyer filters and match context', 'BCC, CSV, and batch preparation', 'Activity logging and follow-up drafts'],
    image: '/features/dbp-deal-blast-builder.webp', alt: 'Demo Deal Blast Builder with message preview and selected buyer recipients', accent: '#14B8A6', reverse: true,
  },
  {
    id: 'deal-calculator', eyebrow: 'DEAL CALCULATOR', title: 'Run the numbers before you blast',
    body: 'Model a deal from a saved opportunity or independent property inputs. Calculator outputs are estimates based on information entered and should be independently verified before an investment decision.',
    bullets: ['ARV, rehab, and MAO scenarios', 'Holding costs and desired profit', 'Rental deal analysis', 'Creative-finance scenarios'],
    image: '/features/dbp-deal-calculator.webp', alt: 'Demo Deal Calculator with ARV, repairs, holding costs, MAO, and potential profit', accent: '#F59E0B',
  },
  {
    id: 'resource-hub', eyebrow: 'RESOURCE HUB', title: 'Keep your real estate network together',
    body: 'Maintain contacts beyond buyers in a structured workspace so the people involved in funding, diligence, repairs, and closing stay easy to find.',
    bullets: ['Buyers, lenders, and title companies', 'Contractors, realtors, and attorneys', 'Insurance, property managers, and vendors', 'Search, categories, tags, notes, import, and export'],
    image: '/features/dbp-resource-hub.webp', alt: 'Demo Resource Hub with categorized real estate contacts and filters', accent: '#06B6D4', reverse: true,
  },
]

const faqs = [
  ['What are Property Intelligence Credits?', 'Credits are usage units for eligible Property Intelligence requests inside Deal Blast Pro.'],
  ['Why does Property Intelligence use credits?', 'DBP retrieves supported property data through an external property-data service. Credits meter those provider-backed requests.'],
  ['Does viewing normal deal information cost credits?', 'No. Standard deal management is separate from Property Intelligence usage.'],
  ['Does the 14-day Pro trial include credits?', 'No. The trial unlocks eligible Pro workflow features, while included Property Intelligence credits activate only after a qualifying paid subscription invoice.'],
  ['Can I buy additional credits?', 'Yes. Current credit packs are available to authenticated customers through the normal DBP purchase flow.'],
  ['What happens to purchased credits?', 'Purchased credits do not have a monthly expiration in the current ledger and remain separate from subscription-included credits.'],
  ['Will opening a result again cost another credit?', 'Not while the eligible cached result remains available. DBP reuses its 14-day property lookup cache without another provider call or credit. A forced refresh is a new lookup.'],
  ['Is Property Intelligence an appraisal?', 'No. It supports research and workflow. Independently verify material property information before investment, lending, legal, tax, or purchase decisions.'],
]

function Screenshot({ item, onOpen }: { item: TourItem; onOpen: (item: TourItem) => void }) {
  return (
    <button type="button" onClick={() => onOpen(item)} className="group relative block w-full overflow-hidden rounded-2xl border bg-[#070A11] text-left shadow-2xl focus:outline-none focus:ring-2 focus:ring-[#22C55E]" style={{ borderColor: `${item.accent}55` }} aria-label={`Enlarge ${item.eyebrow} screenshot`}>
      <img src={item.image} alt={item.alt} loading="lazy" className="block h-auto w-full transition duration-500 group-hover:scale-[1.015]" />
      <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/75 px-3 py-2 text-xs text-white opacity-100 shadow-lg backdrop-blur md:opacity-0 md:group-hover:opacity-100">
        <Maximize2 size={14} /> Enlarge
      </span>
    </button>
  )
}

export default function Features() {
  const [lightbox, setLightbox] = useState<TourItem | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Deal Blast Pro Features | Real Estate Disposition & Buyer Management Software'
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    const previousDescription = meta?.content
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    meta.content = 'Explore Deal Blast Pro features including deal intake, buyer management, buyer matching, deal analysis, targeted outreach, follow-up, resource management and Property Intelligence.'
    return () => { document.title = previousTitle; if (meta && previousDescription !== undefined) meta.content = previousDescription }
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = '' }
  }, [lightbox])

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#080A10] text-[#E6E8EE]">
      <PublicNav />
      <main>
        <section className="relative overflow-hidden border-b border-[#252A38]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(34,197,94,.2),transparent_30%),radial-gradient(circle_at_12%_12%,rgba(59,130,246,.18),transparent_34%)]" />
          <div className="relative mx-auto max-w-7xl px-5 py-20 text-center sm:px-6 lg:py-28">
            <div className="mb-5 text-xs font-semibold tracking-[.2em] text-[#22C55E]">EVERYTHING YOU NEED TO MOVE A DEAL</div>
            <h1 className="mx-auto max-w-5xl text-4xl font-semibold leading-tight sm:text-6xl lg:text-7xl">See What Deal Blast Pro Can Do</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-8 text-[#B7BECE] sm:text-xl">From incoming deal submissions to buyer matching, deal analysis, targeted outreach, document tracking, follow-up, and Property Intelligence, DBP brings the disposition workflow into one connected workspace.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/register" className="btn btn-green px-8 py-3 text-base">Start Free <ArrowRight size={18} /></Link>
              <Link to="/pricing" className="btn btn-ghost px-8 py-3 text-base">View Pricing</Link>
            </div>
            <p className="mt-4 text-sm text-[#8B92A3]">Start with Free. Upgrade when you need more power.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="text-sm font-semibold tracking-[.14em] text-[#22C55E]">THE DEAL JOURNEY</div>
            <h2 className="mt-3 text-3xl font-semibold sm:text-5xl">One workspace. The entire dispo workflow.</h2>
            <p className="mt-4 text-lg text-[#8B92A3]">Follow the property from intake through closing without rebuilding the workflow in a different tool at every step.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {journey.map(([title, body, Icon], index) => (
              <div key={title} className="relative rounded-xl border border-[#252A38] bg-[#10131C] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#22C55E]/10 text-[#22C55E]"><Icon size={20} /></span>
                  <span className="text-xs text-[#616A7D]">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#8B92A3]">{body}</p>
                {index < journey.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden text-[#22C55E]/60 lg:block" size={20} />}
              </div>
            ))}
          </div>
        </section>

        <section id="property-intelligence" className="scroll-mt-24 border-y border-[#22C55E]/25 bg-[linear-gradient(145deg,#0D1716,#0C1019_60%,#111126)]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:py-24">
            <div className="grid items-start gap-10 lg:grid-cols-[.95fr_1.05fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-4 py-2 text-xs font-semibold tracking-[.14em] text-[#22C55E]"><Sparkles size={15} /> PROPERTY INTELLIGENCE</div>
                <h2 className="mt-5 text-4xl font-semibold sm:text-5xl">Research a property without jumping between multiple websites.</h2>
                <p className="mt-5 text-lg leading-8 text-[#C5CAD6]">Eligible users can request supported property data from inside DBP and bring it into the deal workflow. Current lookup results can include property characteristics, ownership details where plan access allows, sale history, estimated value and comparable sales, long-term rent estimates, and ZIP-level sale and rental market indicators.</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {['Property characteristics', 'Value estimate + sales comps', 'Rent estimate', 'Sale history + market context'].map(label => <div key={label} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm"><Check className="text-[#22C55E]" size={17} />{label}</div>)}
                </div>
              </div>
              <div className="rounded-2xl border border-[#22C55E]/30 bg-[#080B12]/80 p-5 shadow-2xl sm:p-7">
                <div className="text-sm font-semibold tracking-[.12em] text-[#22C55E]">WHAT DOES ONE CREDIT MEAN?</div>
                <div className="mt-3 text-3xl font-semibold">One successful new property lookup = one credit.</div>
                <p className="mt-4 leading-7 text-[#AAB2C3]">DBP reserves one credit before calling the property-data provider. If the provider-backed lookup fails, that reservation is released. A successful lookup finalizes one credit even when DBP uses several provider requests to assemble the supported result.</p>
                <div className="mt-6 rounded-xl border border-[#3B82F6]/35 bg-[#3B82F6]/10 p-5">
                  <div className="font-semibold text-[#8CC0FF]">Cached results do not use another credit</div>
                  <p className="mt-2 text-sm leading-6 text-[#C5CAD6]">An eligible result is cached for 14 days. Reopening that result during the cache window uses no provider request and no additional credit. A forced refresh is treated as a new lookup.</p>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <h3 className="text-3xl font-semibold">How Intelligence Credits work</h3>
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {[
                  ['1', 'Check your balance', 'Included and purchased balances appear separately in your workspace.'],
                  ['2', 'Run a new lookup', 'DBP reserves one available credit before any RentCast request.'],
                  ['3', 'Retrieve supported data', 'A successful provider-backed result finalizes that single credit.'],
                  ['4', 'Reuse cached results', 'Open the 14-day cached result again without another credit.'],
                ].map(([number, title, body]) => <div key={number} className="rounded-xl border border-white/10 bg-black/20 p-5"><span className="text-2xl font-semibold text-[#22C55E]">{number}</span><h4 className="mt-4 font-semibold">{title}</h4><p className="mt-2 text-sm leading-6 text-[#8B92A3]">{body}</p></div>)}
              </div>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/8 p-6"><h3 className="text-xl font-semibold">Included credits</h3><p className="mt-3 text-[#AAB2C3]">Paid Starter receives 20 per billing cycle, paid Pro 50, and paid Agency 150. Enterprise is contract-specific. Included credits expire at the end of their billing period and do not roll over.</p></div>
              <div className="rounded-xl border border-[#A855F7]/30 bg-[#A855F7]/8 p-6"><h3 className="text-xl font-semibold">Purchased credits</h3><p className="mt-3 text-[#AAB2C3]">Purchased credits are tracked separately, have no ledger expiration, and remain available after subscription cancellation. DBP uses available included credits first, then purchased credits.</p></div>
            </div>
            <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100"><strong>Trial note:</strong> The 14-day Pro trial unlocks eligible Pro workflow features, but it does not include Property Intelligence credits. Purchased credits remain governed by the existing balance rules.</div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-[#0A0D14] p-6 sm:p-8">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h3 className="text-2xl font-semibold">Current credit packs</h3><p className="mt-2 text-[#8B92A3]">Add credits through the authenticated DBP purchase flow.</p></div><Link to="/pricing" className="btn btn-ghost">View Credit Options <ArrowRight size={17} /></Link></div>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{PROPERTY_INTELLIGENCE_CREDIT_PACKS.map(pack => <div key={pack.key} className="rounded-xl border border-[#252A38] bg-[#10131C] p-5"><div className="text-2xl font-semibold">{pack.credits}</div><div className="text-sm text-[#8B92A3]">credits</div><div className="mt-3 font-semibold text-[#22C55E]">${(pack.amountCents / 100).toFixed(0)}</div></div>)}</div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto mb-14 max-w-3xl text-center"><div className="text-sm font-semibold tracking-[.14em] text-[#22C55E]">PRODUCT TOUR</div><h2 className="mt-3 text-4xl font-semibold sm:text-5xl">The operating workspace behind every deal</h2><p className="mt-4 text-lg text-[#8B92A3]">Every screen below uses fictitious demo data.</p></div>
          <div className="space-y-20 lg:space-y-28">
            {tour.map(item => (
              <article id={item.id} key={item.id} className={`scroll-mt-24 grid items-center gap-8 lg:grid-cols-2 lg:gap-12 ${item.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <div><div className="text-xs font-semibold tracking-[.16em]" style={{ color: item.accent }}>{item.eyebrow}</div><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{item.title}</h2><p className="mt-4 text-lg leading-8 text-[#AAB2C3]">{item.body}</p><ul className="mt-6 grid gap-3 sm:grid-cols-2">{item.bullets.map(bullet => <li key={bullet} className="flex items-start gap-3 text-sm text-[#C5CAD6]"><Check className="mt-0.5 shrink-0" style={{ color: item.accent }} size={17} />{bullet}</li>)}</ul></div>
                <Screenshot item={item} onOpen={setLightbox} />
              </article>
            ))}
          </div>
        </section>

        <section id="public-portals" className="border-y border-[#252A38] bg-[#10131C]">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-6 md:grid-cols-2">
            <div className="rounded-xl border border-[#252A38] bg-[#090C12] p-7"><FileSearch className="text-[#3B82F6]" /><h2 className="mt-5 text-2xl font-semibold">Collect information without opening your workspace</h2><p className="mt-3 leading-7 text-[#8B92A3]">Public deal and buyer submission portals collect structured intake. They do not give visitors access to the authenticated DBP workspace.</p></div>
            <div className="rounded-xl border border-[#252A38] bg-[#090C12] p-7"><Network className="text-[#A855F7]" /><h2 className="mt-5 text-2xl font-semibold">Know what happens next</h2><p className="mt-3 leading-7 text-[#8B92A3]">Pipeline stages, follow-up tasks, activity, pending documentation, and closing information help operators keep the next action visible.</p></div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-6 lg:py-24"><div className="text-center"><h2 className="text-4xl font-semibold">Property Intelligence FAQ</h2></div><div className="mt-9 grid gap-3">{faqs.map(([question, answer]) => <details key={question} className="group rounded-xl border border-[#252A38] bg-[#10131C] p-5"><summary className="cursor-pointer list-none pr-8 font-semibold marker:hidden">{question}</summary><p className="mt-3 max-w-4xl text-sm leading-7 text-[#8B92A3]">{answer}</p></details>)}</div></section>

        <section className="border-y border-[#252A38] bg-[#0E1119]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-6"><div className="mb-8"><h2 className="text-3xl font-semibold">Start free. Upgrade when you need more.</h2><p className="mt-3 text-[#8B92A3]">A quick view—see Pricing for the complete comparison.</p></div><div className="grid gap-4 md:grid-cols-3">{(['Free','Starter','Pro'] as const).map(name => { const plan=PLAN_PRICING[name]; return <div key={name} className={`rounded-xl border p-6 ${name==='Pro'?'border-[#22C55E] bg-[#22C55E]/5':'border-[#252A38] bg-[#090C12]'}`}><h3 className="text-2xl font-semibold">{name}</h3><div className="mt-3 text-xl">{plan.monthlyLabel}</div><p className="mt-3 min-h-16 text-sm leading-6 text-[#8B92A3]">{plan.description}</p><Link to="/pricing" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#60A5FA]">Compare Plans <ArrowRight size={16} /></Link></div>})}</div></div></section>

        <section className="relative overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(34,197,94,.18),transparent_45%)]" /><div className="relative mx-auto max-w-4xl px-5 py-20 text-center sm:px-6 lg:py-28"><BarChart3 className="mx-auto text-[#22C55E]" size={38} /><h2 className="mt-5 text-4xl font-semibold sm:text-5xl">Replace spreadsheet chaos with one deal workspace</h2><p className="mx-auto mt-5 max-w-2xl text-lg text-[#AAB2C3]">Organize deals, buyers, resources, outreach, and follow-up from one connected system.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/register" className="btn btn-green px-8 py-3">Create Free Account</Link><Link to="/pricing" className="btn btn-ghost px-8 py-3">View Pricing</Link></div><Link to="/admin-login" className="mt-5 inline-block text-sm text-[#8B92A3] hover:text-white">Already have an account? Sign In</Link></div></section>
      </main>
      <PublicFooter />

      {lightbox && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`${lightbox.eyebrow} screenshot`} onClick={() => setLightbox(null)}><button type="button" onClick={() => setLightbox(null)} className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-black/70 p-3 text-white focus:ring-2 focus:ring-[#22C55E]" aria-label="Close enlarged screenshot"><X /></button><img src={lightbox.image} alt={lightbox.alt} className="max-h-[92vh] max-w-full rounded-xl object-contain shadow-2xl" onClick={event => event.stopPropagation()} /></div>}
    </div>
  )
}
