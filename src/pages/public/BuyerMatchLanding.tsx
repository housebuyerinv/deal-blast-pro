import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
  MessageSquare,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Workflow,
} from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";
import { WorkflowSteps } from "../../components/buyermatch/WorkspaceOverview";
import catalog from "../../../supabase/functions/_shared/buyermatchPlans.json";

const capabilities = [
  {
    icon: FileSearch,
    title: "Evaluate first",
    body: "Compare asking price, location, property type and recorded buying criteria. Review missing information and price sensitivity before deciding your next move.",
    tag: "ANALYZE",
  },
  {
    icon: LockKeyhole,
    title: "See private fit signals",
    body: "Review anonymous buyer references and fit diagnostics. Buyer names, email addresses, phone numbers and the master network are not handed out to subscribers.",
    tag: "PROTECT",
  },
  {
    icon: Target,
    title: "Distribute with control",
    body: "Prepare a reviewed deal for software distribution within your allowance. Contract control, current analysis, consent and required agreements are checked before exposure.",
    tag: "DISTRIBUTE",
  },
  {
    icon: MessageSquare,
    title: "Keep the transaction organized",
    body: "Track interest, offers, passes and deal-specific messages. Keep the conversation attached to the property, with buyer identities protected.",
    tag: "RESPOND",
  },
  {
    icon: Workflow,
    title: "From review to closing evidence",
    body: "Keep deal progress and end-of-contract dates together. Reported closings remain pending until verified; interest and email opens are not proof of a closing.",
    tag: "TRACK",
  },
  {
    icon: SlidersHorizontal,
    title: "Your subscription, your capacity",
    body: "See period usage and remaining allowances. Manage BuyerMatch billing independently of your DBP CRM access through the supported billing controls.",
    tag: "MANAGE",
  },
];
const pages = [
  ["/buyermatch", "Overview"],
  ["/buyermatch/features", "Features"],
  ["/buyermatch/how-it-works", "How it works"],
  ["/buyermatch/pricing", "Pricing"],
] as const;
const faqs = [
  [
    "Can buyers maintain their own information?",
    "Yes. Confirmed account holders can create a new pending buyer profile. Existing network profiles require a valid delivered invitation and matching confirmed identity to connect. Linked buyers can update their own profile and criteria, privately replace proof, withdraw invitation consent and page through their personal response history. A submission receipt is never an edit credential.",
  ],
  [
    "Does updated proof of funds automatically verify me?",
    "No. A replacement is private, retains earlier evidence and requires review. Document acceptance is not a guaranteed balance or permission to receive invitations. Expired proof stays expired.",
  ],
  [
    "Are allowances shared with DBP CRM credits?",
    "No. Starter includes 20 analyses, 10 distributions and up to 25 buyers per distribution. Pro includes 50 analyses, 25 distributions and up to 50 buyers. These are BuyerMatch billing-period allowances, separate from DBP CRM plans, Property Intelligence credit packs and promotions.",
  ],
  [
    "Do I need a paid DBP CRM plan?",
    "No. BuyerMatch is an independent subscription. Existing DBP users can add it without replacing their CRM subscription. A BuyerMatch purchase does not activate a paid CRM plan.",
  ],
  [
    "Can I download the buyer network?",
    "No. Matching uses private buyer criteria and anonymous references. Subscriber access does not expose the master buyer database or buyer contact details.",
  ],
  [
    "What counts as a distribution?",
    "A software distribution is a reviewed deal-distribution request within your billing-period allowance. The fanout limit is a maximum number of eligible buyers for that distribution, not a guaranteed audience or response count.",
  ],
  [
    "Does saving or analyzing contact buyers?",
    "No. Analysis and distribution are separate steps. Delivery requires the applicable permissions, consent, review, agreements and remaining allowance.",
  ],
  [
    "Is managed disposition included?",
    "No. Managed disposition is a separately arranged service with its own signed scope and terms. Neither software plan automatically charges a success fee or enrolls you in that service.",
  ],
  [
    "When does paid access begin?",
    "Creating an account does not start billing. Subscription access follows completed Checkout and server-verified payment status. Availability and payment controls are shown in your workspace.",
  ],
];
function MatchPreview() {
  return (
    <div
      className="bm-preview"
      aria-label="Illustrative BuyerMatch analysis, sample data"
    >
      <div className="bm-preview-bar">
        <span>
          <Network size={16} /> BUYERMATCH
        </span>
        <span className="bm-sample">ILLUSTRATIVE DATA</span>
      </div>
      <div className="bm-preview-body">
        <div className="bm-card-top">
          <span className="bm-eyebrow">PROPERTY FIT REVIEW</span>
          <LockKeyhole size={17} />
        </div>
        <h2>Look beyond a buyer list.</h2>
        <p>Understand the criteria behind the fit.</p>
        <div className="bm-fit-row">
          <div className="bm-fit-ring">Fit</div>
          <div>
            <strong>Anonymous buyer profile</strong>
            <p>Location · price · strategy</p>
            <span className="bm-status">Criteria matched</span>
          </div>
        </div>
        <div className="bm-checklist">
          {[
            "Location matches the recorded buy box",
            "Asking price within recorded range",
            "Buyer contact details remain private",
          ].map((t) => (
            <p key={t}>
              <CheckCircle2 size={16} />
              {t}
            </p>
          ))}
        </div>
        <div className="bm-preview-footer">
          <span>Analysis never sends invitations</span>
          <ShieldCheck size={18} />
        </div>
      </div>
    </div>
  );
}
export function BuyerMatchPlanCards() {
  return (
    <div className="bm-pricing-grid">
      {catalog.map((plan, index) => (
        <article
          className={`bm-price-card ${index === 1 ? "bm-price-pro" : ""}`}
          key={plan.version}
        >
          <div className="bm-card-top">
            <p className="bm-eyebrow">BUYERMATCH {plan.name.toUpperCase()}</p>
            {index === 1 && <span className="bm-status">More capacity</span>}
          </div>
          <h2>{plan.name}</h2>
          <p className="bm-price">
            <strong>${plan.amountCents / 100}</strong>
            <span> / month</span>
          </p>
          <p>
            {index === 0
              ? "For a focused deal pipeline."
              : "For a more active disposition workflow."}
          </p>
          <ul className="bm-plan-list">
            {[
              `${plan.analysisAllowance} analyses per billing period`,
              `${plan.distributionAllowance} software distributions per billing period`,
              `Up to ${plan.maxDistributionFanout} qualified buyers per distribution`,
              "Private matching and secure buyer responses",
              "Independent BuyerMatch billing",
            ].map((item) => (
              <li key={item}>
                <Check size={17} />
                {item}
              </li>
            ))}
          </ul>
          <Link
            className={`btn ${index === 1 ? "btn-green" : "btn-ghost"}`}
            to={`/register?product=buyermatch&tier=${index === 0 ? "starter" : "pro"}`}
          >
            Choose {plan.name} <ArrowRight size={16} />
          </Link>
          <p className="bm-fineprint">
            Creating an account does not start billing. Purchase availability is
            shown in your workspace.
          </p>
        </article>
      ))}
    </div>
  );
}
export default function BuyerMatchLanding() {
  const { pathname: rawPathname } = useLocation();
  const pathname = rawPathname.replace(/\/+$/, "") || "/";
  const page = pathname.endsWith("/pricing")
    ? "pricing"
    : pathname.endsWith("/features")
      ? "features"
      : pathname.endsWith("/how-it-works")
        ? "workflow"
        : "overview";
  const heading =
    page === "pricing"
      ? "A plan for your deal flow."
      : page === "features"
        ? "Every deal. A clearer next step."
        : page === "workflow"
          ? "From property details to private conversations."
          : "Find the right fit for your next real estate deal.";
  useEffect(() => {
    const previous = document.title;
    if (typeof window !== "undefined") window.scrollTo?.(0, 0);
    document.title = `BuyerMatch ${page === "overview" ? "— Private Buyer Matching" : page === "workflow" ? "— How it works" : `— ${page[0].toUpperCase()}${page.slice(1)}`} | Deal Blast Pro`;
    return () => {
      document.title = previous;
    };
  }, [page]);
  return (
    <div className="bm-site">
      <PublicNav />
      <main id="main-content">
        <nav className="bm-product-nav" aria-label="BuyerMatch product">
          <Link to="/buyermatch" className="bm-product-brand">
            <Network size={19} /> BuyerMatch <span>by DBP</span>
          </Link>
          <div>
            {pages.map(([to, label]) => (
              <NavLink key={to} to={to} end>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
        <section
          className={`bm-hero ${page !== "overview" ? "bm-hero-compact" : ""}`}
        >
          <div className="bm-hero-copy">
            <p className="bm-eyebrow">
              <span className="bm-dot" /> PRIVATE BUYER MATCHING · INDEPENDENT
              SOFTWARE
            </p>
            <h1>{heading}</h1>
            <p className="bm-lead">
              {page === "pricing"
                ? "Choose the capacity you need for analysis and eligible deal distribution. Separate from DBP CRM. No paid CRM subscription required."
                : page === "features"
                  ? "Bring property analysis, private buyer fit, reviewed distribution and responses into one connected workspace."
                  : page === "workflow"
                    ? "Start with what you know about the property. Understand the match, complete the required review, and keep the response tied to the deal."
                    : "BuyerMatch helps wholesalers and acquisition teams evaluate opportunities, see private buyer-match signals, and manage controlled deal distribution, without exposing the entire buyer network."}
            </p>
            {page !== "pricing" && (
              <div className="bm-actions">
                <Link className="btn btn-green" to="/buyermatch/pricing">
                  Explore plans <ArrowRight size={17} />
                </Link>
                <Link className="btn btn-ghost" to="/buyermatch/demo">
                  Explore the interactive demo
                </Link>
              </div>
            )}
            <p className="bm-fineprint">
              Standalone Starter $59/mo · Pro $119/mo · No automatic paid CRM
              assignment
            </p>
          </div>
          {page === "overview" && <MatchPreview />}
        </section>
        {page === "pricing" ? (
          <section className="bm-section bm-section-tight">
            <BuyerMatchPlanCards />
            <div className="bm-comparison-note">
              <ShieldCheck size={22} />
              <div>
                <h3>One workspace. Two clearly separate products.</h3>
                <p>
                  DBP CRM organizes your deal operation. BuyerMatch provides
                  private matching and eligible network distribution. CRM annual
                  pricing, credits and promotions do not apply to these monthly
                  BuyerMatch plans.
                </p>
                <Link to="/pricing">
                  Compare DBP CRM plans <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <p className="bm-fineprint">
              Allowances apply per billing period. Buyer counts are upper
              limits, not guaranteed matches, invitations or responses. Payment,
              distribution and required agreement controls remain
              server-enforced.
            </p>
          </section>
        ) : (
          <>
            <section className="bm-value-strip" aria-label="Product principles">
              <span>
                <LockKeyhole size={18} /> Private buyer identities
              </span>
              <span>
                <FileSearch size={18} /> Explainable fit
              </span>
              <span>
                <ShieldCheck size={18} /> Reviewed distribution
              </span>
              <span>
                <MessageSquare size={18} /> Deal-specific responses
              </span>
            </section>
            <section className="bm-section">
              <div className="bm-section-title">
                <div>
                  <p className="bm-eyebrow">
                    {page === "workflow"
                      ? "THE WORKFLOW"
                      : "BUILT AROUND YOUR NEXT DEAL"}
                  </p>
                  <h2>
                    {page === "workflow"
                      ? "Four steps. Clear boundaries."
                      : "Less list chasing. More informed follow-through."}
                  </h2>
                </div>
                <p>
                  Keep your property, its fit and its next action together.
                  Analysis is a decision aid—not a buyer commitment or promise
                  of a closing.
                </p>
              </div>
              <WorkflowSteps />
              {page === "workflow" && (
                <div className="bm-detail-grid mt-6">
                  <article className="bm-panel">
                    <h3>Subscriber onboarding</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>
                        Verify your identity and review the current versioned
                        terms.
                      </li>
                      <li>
                        Confirm your standalone subscription and available
                        allowances.
                      </li>
                      <li>Submit the property and known deal details.</li>
                      <li>
                        Review analysis, missing information and eligible
                        private fit signals.
                      </li>
                      <li>
                        Verify contract rights, consent and required agreements.
                      </li>
                      <li>
                        Initiate a permitted distribution within the plan
                        limits.
                      </li>
                      <li>Monitor responses and end-of-contract dates.</li>
                    </ol>
                  </article>
                  <article className="bm-panel">
                    <h3>Buyer onboarding</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>
                        Submit criteria for review, or create a pending profile
                        after normal confirmation and sign in.
                      </li>
                      <li>
                        Upload private proof when ready; review is required.
                      </li>
                      <li>Review only your authorized invitations.</li>
                      <li>
                        Express interest, make an offer or decline through the
                        valid private invitation.
                      </li>
                      <li>
                        Use your authenticated buyer account to maintain
                        criteria and proof, stop invitations and read personal
                        history.
                      </li>
                    </ol>
                    <Link
                      className="btn btn-ghost mt-4"
                      to="/buyermatch/buyers/account"
                    >
                      Open buyer account <ArrowRight size={16} />
                    </Link>
                  </article>
                </div>
              )}
              {page === "workflow" && (
                <div className="bm-detail-grid">
                  {[
                    [
                      "01 / PREPARE",
                      "Save the property, not another spreadsheet.",
                      "Record the address, price, asset type and available financial details. Add missing information before analysis. No buyer is contacted when you save.",
                    ],
                    [
                      "02 / ANALYZE",
                      "Understand what is driving the match.",
                      "Review anonymous fit, missing information and price sensitivity where available. Scores may be withheld to protect privacy; recorded evidence is not a promise of funding.",
                    ],
                    [
                      "03 / REVIEW",
                      "Make distribution a deliberate step.",
                      "Complete contract/control review, a future EOC date, required agreements, consent and allowance checks. The server rechecks eligibility before exposure.",
                    ],
                    [
                      "04 / FOLLOW THROUGH",
                      "Keep interest and evidence in context.",
                      "Follow secure conversations, offers and passes. Track EOC and closing evidence. Reported progress and verified closing status remain distinct.",
                    ],
                  ].map(([step, title, body]) => (
                    <article className="bm-panel" key={step}>
                      <p className="bm-eyebrow">{step}</p>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            {page !== "workflow" && (
              <section className="bm-section bm-feature-section">
                <div className="bm-section-title">
                  <div>
                    <p className="bm-eyebrow">THE TOOLKIT</p>
                    <h2>From first look to follow-up.</h2>
                  </div>
                  <Link className="btn btn-ghost" to="/buyermatch/how-it-works">
                    See the workflow <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="bm-feature-grid">
                  {capabilities.map(({ icon: Icon, title, body, tag }) => (
                    <article className="bm-feature-card" key={tag}>
                      <div className="bm-card-top">
                        <Icon size={24} />
                        <span className="bm-eyebrow">{tag}</span>
                      </div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section className="bm-section">
              <div className="bm-audience-grid">
                <article className="bm-panel">
                  <p className="bm-eyebrow">FOR WHOLESALERS & DISPO TEAMS</p>
                  <h2>Your deal. A private matching workspace.</h2>
                  <p>
                    Save, analyze and prepare eligible distribution. Already use
                    DBP? Add BuyerMatch without giving up your existing CRM
                    plan.
                  </p>
                  <Link to="/admin-login?product=buyermatch&tier=starter">
                    Sign in to your workspace <ArrowRight size={16} />
                  </Link>
                </article>
                <article className="bm-panel">
                  <p className="bm-eyebrow">FOR PROPERTY BUYERS</p>
                  <h2>A buying profile, not a software subscription.</h2>
                  <p>
                    Submit your criteria and proof for private review. Access
                    matched opportunities through secure invitations; no paid
                    subscriber plan is required to submit.
                  </p>
                  <Link to="/buyermatch/buyers">
                    Create a buyer profile <ArrowRight size={16} />
                  </Link>
                </article>
              </div>
            </section>
            {page === "overview" && (
              <section className="bm-section">
                <div className="bm-section-title">
                  <div>
                    <p className="bm-eyebrow">CHOOSE YOUR CAPACITY</p>
                    <h2>Independent plans. Clear allowances.</h2>
                  </div>
                  <Link to="/buyermatch/pricing">
                    Compare plans <ArrowRight size={16} />
                  </Link>
                </div>
                <BuyerMatchPlanCards />
              </section>
            )}
          </>
        )}
        <section className="bm-section bm-faq">
          <p className="bm-eyebrow">BEFORE YOU GET STARTED</p>
          <h2>Good questions. Clear answers.</h2>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
        <section className="bm-final-cta">
          <Network size={30} />
          <h2>A more focused next deal starts here.</h2>
          <p>Explore the workspace before choosing a plan.</p>
          <div className="bm-actions">
            <Link className="btn btn-green" to="/buyermatch/demo">
              Try the interactive demo <ArrowRight size={16} />
            </Link>
            <Link className="btn btn-ghost" to="/buyermatch/pricing">
              See BuyerMatch pricing
            </Link>
          </div>
          <p className="bm-fineprint">
            Managed disposition is separately arranged under signed terms.
            Software success fees remain disabled. No guaranteed matches,
            delivery or closings.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
