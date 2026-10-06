import { Link } from "react-router-dom";
import { Check, LockKeyhole, MessageSquare, Network, ShieldCheck, Sparkles } from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";
import catalog from '../../../supabase/functions/_shared/buyermatchPlans.json';

const plans = [
  {
    name: "Starter",
    price: `$${catalog[0].amountCents / 100}`,
    description: "Private matching for wholesalers who want qualified buyer reach without giving away the network.",
    features: [`${catalog[0].analysisAllowance} analyses per billing period`, `${catalog[0].distributionAllowance} Software distributions per billing period`, `Up to ${catalog[0].maxDistributionFanout} qualified buyers per distribution`, "Anonymous buyer profiles", "Secure buyer responses"],
  },
  {
    name: "Pro",
    price: `$${catalog[1].amountCents / 100}`,
    description: "More matching capacity and deeper buyer intelligence for active disposition teams.",
    features: [`${catalog[1].analysisAllowance} analyses per billing period`, `${catalog[1].distributionAllowance} Software distributions per billing period`, `Up to ${catalog[1].maxDistributionFanout} qualified buyers per distribution`, "Detailed buyer-fit diagnostics", "Offer and response tracking"],
  },
];

export default function BuyerMatchLanding() {
  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      <PublicNav />
      <main>
        <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1 text-xs font-semibold text-[#22C55E]">
              <Network size={14} /> PRIVATE BUYER MATCHING
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Stop buying lists. Match your deal to buyers who actually fit it.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg text-[#AAB2C2]">
              BuyerMatch compares your property against a private investor network, explains why buyers fit, and routes responses through secure deal-specific conversations without handing out the underlying buyer database.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="btn btn-primary px-6 py-3">Start BuyerMatch</Link>
              <Link to="/portal" className="btn btn-ghost px-6 py-3">Submit a Deal</Link>
            </div>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {[
              [ShieldCheck, "Private by design", "Buyer names, phone numbers, emails, and the master buyer database stay protected by default."],
              [Sparkles, "Explainable matches", "See match strength and the criteria behind it instead of a mysterious buyer count."],
              [MessageSquare, "Built-in response flow", "Buyers can express interest, make offers, pass, or message through secure deal-specific links."],
            ].map(([Icon, title, body]: any) => (
              <div key={title} className="rounded-2xl border border-[#252A38] bg-[#0D111A] p-6">
                <Icon className="mb-4 text-[#22C55E]" />
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9AA3B5]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-[#252A38] bg-[#0B0F17]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-3xl font-bold">Your buyers remain your network.</h2>
                <p className="mt-4 text-[#AAB2C2]">
                  BuyerMatch exposes useful anonymous buyer intelligence and engagement, not a downloadable buyer list. Existing buyers do not need to create an account before they can receive a secure matched-deal invitation.
                </p>
              </div>
              <div className="rounded-2xl border border-[#252A38] bg-[#070A12] p-6">
                <div className="flex items-center gap-2 text-[#22C55E]"><LockKeyhole size={18} /> Example match</div>
                <div className="mt-4 text-2xl font-semibold">Buyer BM-84F2A19C · 90% fit</div>
                <div className="mt-3 space-y-2 text-sm text-[#AAB2C2]">
                  <p>✓ Birmingham SFR strategy fit</p>
                  <p>✓ Price fits recorded buy box</p>
                  <p>✓ Recently active</p>
                  <p>✓ Secure response available</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold">BuyerMatch plans</h2>
            <p className="mt-3 text-[#9AA3B5]">Software plans do not automatically take a percentage of your assignment fee.</p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.name} className="rounded-2xl border border-[#30384A] bg-[#0D111A] p-7">
                <h3 className="text-2xl font-semibold">{plan.name}</h3>
                <div className="mt-3"><span className="text-4xl font-bold">{plan.price}</span><span className="text-[#8B92A3]">/month</span></div>
                <p className="mt-4 text-sm text-[#AAB2C2]">{plan.description}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={17} className="mt-0.5 text-[#22C55E]" />{feature}</li>)}
                </ul>
                <Link to="/register" className="btn btn-primary mt-7 block w-full text-center">Choose {plan.name}</Link>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/5 p-6">
            <h3 className="text-xl font-semibold">Managed Dispo / success-fee option</h3>
            <p className="mt-2 text-sm text-[#AAB2C2]">
              For deals where House Buyer Investments actively handles disposition, the deal-specific fee terms are agreed and signed before protected buyer exposure. The fee is not silently attached to standard BuyerMatch software usage.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
