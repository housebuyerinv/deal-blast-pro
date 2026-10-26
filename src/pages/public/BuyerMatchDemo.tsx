import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileSearch,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Network,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  WorkspaceOverview,
  WorkflowSteps,
  type DealCard,
} from "../../components/buyermatch/WorkspaceOverview";
import catalog from "../../../supabase/functions/_shared/buyermatchPlans.json";

const initialDeals: DealCard[] = [
  {
    id: "sample-oak",
    status: "draft",
    property: {
      address: "124 Sample Oak Lane",
      city: "Birmingham",
      state: "AL",
      price: 145000,
      assetType: "sfh",
    },
  },
  {
    id: "sample-pine",
    status: "under_review",
    property: {
      address: "82 Example Pine Drive",
      city: "Huntsville",
      state: "AL",
      price: 198000,
      assetType: "sfh",
    },
  },
];
const demoLinks = [
  ["", "My deals", LayoutDashboard],
  ["/plans", "Plans & usage", Wallet],
  ["/buyers", "Buyer experience", Users],
  ["/admin", "Network review", ShieldCheck],
] as const;

// Public, synthetic walkthrough. No authentication adapter, persistence, API calls,
// provider SDK, storage upload, payment or delivery implementation is imported.
export default function BuyerMatchDemo() {
  const { pathname: rawPathname } = useLocation();
  const pathname = rawPathname.replace(/\/+$/, "") || "/";
  const section = pathname.includes("/deals/")
    ? "deal"
    : pathname.split("/").pop();
  const [deals, setDeals] = useState(initialDeals);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [notice, setNotice] = useState("");
  const [tier, setTier] = useState(0);
  const [buyerResponse, setBuyerResponse] = useState("interested");
  const [proof, setProof] = useState("");
  const [consent, setConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [filter, setFilter] = useState("all");
  const found = deals.find((d) => pathname.endsWith("/" + d.id));
  const selected = found || deals[0];
  useEffect(() => {
    setNotice("");
    setAnalyzed(false);
    if (typeof window !== "undefined") window.scrollTo?.(0, 0);
  }, [pathname]);
  const plan = catalog[tier];
  if (section === "deal" && !found)
    return (
      <div className="bm-site p-8">
        <main className="bm-panel max-w-xl mx-auto">
          <h1>Sample deal not found</h1>
          <p>
            This is a synthetic walkthrough. No real property or private data
            was requested.
          </p>
          <Link to="/buyermatch/demo" className="btn btn-green">
            Return to sample deals
          </Link>
        </main>
      </div>
    );
  return (
    <div className="bm-site bm-demo">
      <div className="bm-demo-banner">
        <LockKeyhole size={16} />
        <span>
          <strong>Interactive demo</strong> · Synthetic data only. Nothing is
          saved, sent, purchased or activated.
        </span>
        <Link to="/buyermatch">
          Exit demo <ArrowRight size={14} />
        </Link>
      </div>
      <div className="bm-demo-layout">
        <aside className="bm-demo-sidebar">
          <Link className="bm-product-brand" to="/buyermatch">
            <span className="bm-logo">
              <Network size={22} />
            </span>
            BuyerMatch
          </Link>
          <p className="bm-eyebrow">YOUR WORKSPACE · DEMO</p>
          <nav aria-label="Demo workspace">
            {demoLinks.map(([path, title, Icon]) => (
              <NavLink
                end
                key={path}
                to={"/buyermatch/demo" + path}
                onClick={() => setNotice("")}
              >
                <Icon size={18} />
                {title}
              </NavLink>
            ))}
          </nav>
          <div className="bm-sidebar-note">
            <ShieldCheck size={22} />
            <strong>Private by design</strong>
            <p>Real network identities never appear in this walkthrough.</p>
            <Link to="/buyermatch/features">
              Explore features <ArrowRight size={14} />
            </Link>
          </div>
          <Link className="bm-crm-link" to="/">
            Deal Blast Pro CRM <ArrowRight size={14} />
          </Link>
        </aside>
        <main className="bm-demo-main">
          <header className="bm-demo-header">
            <div>
              <p className="bm-eyebrow">
                BUYERMATCH /{" "}
                {section === "deal"
                  ? "DEAL WORKSPACE"
                  : section === "plans"
                    ? "SUBSCRIPTION"
                    : section === "buyers"
                      ? "BUYER JOURNEY"
                      : section === "admin"
                        ? "NETWORK ADMINISTRATION"
                        : "OVERVIEW"}
              </p>
              <h1>
                {section === "deal"
                  ? selected.property.address
                  : section === "plans"
                    ? "Capacity that fits your workflow."
                    : section === "buyers"
                      ? "Your criteria. Your next opportunity."
                      : section === "admin"
                        ? "A considered approach to your network."
                        : "Your next deal, in focus."}
              </h1>
              <p>
                {section === "demo"
                  ? "Bring property details, private buyer fit and follow-through together."
                  : "Explore the workflow with illustrative data and local-only controls."}
              </p>
            </div>
            <span className="bm-status">Synthetic workspace</span>
          </header>
          {notice && (
            <p className="bm-demo-notice" role="status">
              {notice}
            </p>
          )}
          {section === "demo" && (
            <>
              <WorkflowSteps />
              <WorkspaceOverview
                deals={deals}
                prefix="/buyermatch/demo/deals/"
              />
              <form
                id="new-deal"
                className="bm-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  setDeals([
                    ...deals,
                    {
                      id: "sample-" + (deals.length + 1),
                      status: "draft",
                      property: {
                        address,
                        city,
                        state: "AL",
                        price: Number(price),
                      },
                    },
                  ]);
                  setAddress("");
                  setCity("");
                  setPrice("");
                  setNotice(
                    "Sample deal added in memory. No account or server record was created.",
                  );
                }}
              >
                <div className="bm-section-title">
                  <div>
                    <p className="bm-eyebrow">START A DEAL</p>
                    <h2>Put the property in context.</h2>
                  </div>
                  <Building2 size={24} />
                </div>
                <div className="bm-form-grid">
                  <label>
                    Sample street address
                    <input
                      required
                      maxLength={200}
                      className="input"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Use a fictional address"
                    />
                  </label>
                  <label>
                    Sample city
                    <input
                      required
                      maxLength={100}
                      className="input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </label>
                  <label>
                    Asking price ($)
                    <input
                      required
                      type="number"
                      min="1"
                      max="100000000"
                      className="input"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                </div>
                <button className="btn btn-green">
                  Add sample deal <ArrowRight size={16} />
                </button>
                <p className="bm-fineprint">
                  Demo inputs stay in page memory and reset when this demo
                  unmounts. Do not enter personal or confidential information.
                </p>
              </form>
            </>
          )}
          {section === "deal" && (
            <>
              <Link to="/buyermatch/demo" className="bm-inline-link">
                <ArrowLeft size={16} /> All sample deals
              </Link>
              <div className="bm-detail-grid">
                <section className="bm-panel">
                  <p className="bm-eyebrow">PROPERTY SNAPSHOT</p>
                  <h2>{selected.property.address}</h2>
                  <p>
                    {selected.property.city}, {selected.property.state} ·
                    Single-family
                  </p>
                  <div className="bm-metrics">
                    <div className="bm-stat">
                      <span>Sample asking price</span>
                      <strong>
                        ${selected.property.price?.toLocaleString()}
                      </strong>
                    </div>
                    <div className="bm-stat">
                      <span>Sample status</span>
                      <strong className="bm-stat-word">
                        {selected.status.replace(/_/g, " ")}
                      </strong>
                    </div>
                  </div>
                  <button
                    className="btn btn-green"
                    onClick={() => {
                      setAnalyzed(true);
                      setNotice(
                        "Illustrative analysis opened. No real buyer data was queried or allowance consumed.",
                      );
                    }}
                  >
                    <FileSearch size={17} /> Preview sample analysis
                  </button>
                </section>
                <section className="bm-panel">
                  <p className="bm-eyebrow">PRIVATE FIT REVIEW</p>
                  <h2>
                    {analyzed
                      ? "Criteria worth a closer look."
                      : "Analysis is a separate step."}
                  </h2>
                  {analyzed ? (
                    <>
                      <span className="bm-sample">
                        ILLUSTRATIVE · NOT A REAL MATCH
                      </span>
                      <div className="bm-checklist">
                        {[
                          "Sample buyer BM-DEMO-01 · location fit",
                          "Sample buyer BM-DEMO-02 · price fit",
                          "Missing detail: occupancy",
                        ].map((t) => (
                          <p key={t}>
                            <CheckCircle2 size={16} />
                            {t}
                          </p>
                        ))}
                      </div>
                      <p>
                        No close-likelihood prediction is fabricated. Actual fit
                        depends on the saved property and recorded buyer
                        criteria.
                      </p>
                    </>
                  ) : (
                    <p>
                      Review fit diagnostics without sending an invitation. This
                      demo does not run the matching engine.
                    </p>
                  )}
                </section>
              </div>
              <div className="bm-detail-grid">
                <section className="bm-panel">
                  <p className="bm-eyebrow">DISTRIBUTION READINESS</p>
                  <h2>Review before reach.</h2>
                  <ul className="bm-plan-list">
                    {[
                      "Contract and control verification",
                      "Future EOC date",
                      "Current analysis and available allowance",
                      "Required agreements and consent",
                      "Authorized delivery",
                    ].map((t) => (
                      <li key={t}>
                        <LockKeyhole size={16} />
                        {t}
                      </li>
                    ))}
                  </ul>
                  <button className="btn btn-ghost" disabled>
                    Delivery disabled in demo
                  </button>
                </section>
                <section className="bm-panel">
                  <p className="bm-eyebrow">BUYER RESPONSES</p>
                  <h2>Keep the response with the deal.</h2>
                  <div className="bm-message">
                    <span>BM-DEMO-01 · sample conversation</span>
                    <p>Can you share the proposed closing timeline?</p>
                  </div>
                  <p>
                    Interest, offers, passes and messages are recorded
                    separately from verified closings.
                  </p>
                  <Link className="btn btn-ghost" to="/buyermatch/demo/buyers">
                    Explore the buyer side <MessageSquare size={16} />
                  </Link>
                </section>
              </div>
            </>
          )}
          {section === "plans" && (
            <>
              <div className="bm-comparison-note">
                <Wallet size={24} />
                <div>
                  <h2>BuyerMatch billing is separate from CRM.</h2>
                  <p>
                    This is an allowance preview. Selecting a tier here does not
                    start Checkout or change any entitlement.
                  </p>
                </div>
              </div>
              <div className="bm-pricing-grid">
                {catalog.map((item, index) => (
                  <article
                    className={
                      "bm-price-card " + (tier === index ? "bm-price-pro" : "")
                    }
                    key={item.version}
                  >
                    <p className="bm-eyebrow">BUYERMATCH</p>
                    <h2>{item.name}</h2>
                    <p className="bm-price">
                      <strong>${item.amountCents / 100}</strong>
                      <span>/month</span>
                    </p>
                    <ul className="bm-plan-list">
                      <li>{item.analysisAllowance} analyses</li>
                      <li>
                        {item.distributionAllowance} software distributions
                      </li>
                      <li>
                        Up to {item.maxDistributionFanout} buyers per
                        distribution
                      </li>
                    </ul>
                    <button
                      className="btn btn-ghost"
                      aria-pressed={tier === index}
                      onClick={() => setTier(index)}
                    >
                      Preview {item.name} allowances
                    </button>
                  </article>
                ))}
              </div>
              <section className="bm-panel">
                <h2>{plan.name} · illustrative billing period</h2>
                <div className="bm-metrics">
                  {[
                    ["Analyses", plan.analysisAllowance],
                    ["Distributions", plan.distributionAllowance],
                    ["Buyers per distribution", plan.maxDistributionFanout],
                  ].map(([name, count]) => (
                    <div className="bm-stat" key={name}>
                      <span>{name}</span>
                      <strong>{count}</strong>
                      <small>Plan ceiling · no real usage</small>
                    </div>
                  ))}
                </div>
                <p>
                  Real billing management shows the effective change date,
                  proration and cancellation details in Stripe before
                  confirmation. No payment or plan change can occur here.
                </p>
                <Link to="/buyermatch/pricing" className="bm-inline-link">
                  Full plan details <ArrowRight size={16} />
                </Link>
              </section>
            </>
          )}
          {section === "buyers" && (
            <>
              <div className="bm-detail-grid">
                <form
                  className="bm-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNotice(
                      "Sample criteria reviewed locally. No buyer profile, upload or consent record was submitted.",
                    );
                  }}
                >
                  <p className="bm-eyebrow">BUYING PROFILE</p>
                  <h2>Tell the network what fits.</h2>
                  <p>
                    Real intake keeps your criteria private and requires review.
                    No paid software plan is needed to submit.
                  </p>
                  <label className="bm-label">
                    Sample target market
                    <input
                      className="input"
                      required
                      defaultValue="Birmingham, AL"
                    />
                  </label>
                  <label className="bm-label">
                    Sample maximum budget ($)
                    <input
                      className="input"
                      required
                      type="number"
                      min="1"
                      defaultValue="200000"
                    />
                  </label>
                  <div className="bm-label">
                    <span>Proof-of-funds example · demo only</span>
                    <button type="button" className="btn btn-ghost" aria-describedby="demo-proof-note" onClick={() => setProof('synthetic-proof-example.pdf')}>Use a synthetic proof label</button>
                    <small id="demo-proof-note">
                      {proof
                        ? "Sample label only; no document exists or was uploaded: " + proof
                        : "No file picker or upload. Keep real financial documents out of the demo."}
                    </small>
                  </div>
                  <p className="bm-fineprint">Real initial intake and private invitation responses exist. Post-submission profile/POF editing and account-wide response history are not provided by this demo or the current buyer interface.</p>
                  <Link className="bm-inline-link" to="/buyermatch/buyers/help">What the real buyer journey supports <ArrowRight size={15} /></Link>
                  <button className="btn btn-green">
                    Preview criteria review
                  </button>
                </form>
                <section className="bm-panel">
                  <p className="bm-eyebrow">INVITATION-ONLY DEALS</p>
                  <h2>A private route to the response.</h2>
                  <p>
                    Real opportunities arrive through a deal-specific secure
                    invitation, not a public inventory feed.
                  </p>
                  <div className="bm-message">
                    <strong>124 Sample Oak Lane</strong>
                    <p>Illustrative opportunity · no live invitation</p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setNotice(
                        "Sample response: " +
                          buyerResponse.replace(/_/g, " ") +
                          ". Nothing was sent or recorded.",
                      );
                    }}
                  >
                    <label className="bm-label">
                      Sample response
                      <select
                        aria-label="Sample response"
                        className="input"
                        value={buyerResponse}
                        onChange={(e) => setBuyerResponse(e.target.value)}
                      >
                        <option value="interested">Interested</option>
                        <option value="offer">Make an offer</option>
                        <option value="pass">Pass</option>
                        <option value="message">Ask a question</option>
                      </select>
                    </label>
                    {buyerResponse === "offer" && (
                      <label className="bm-label">
                        Sample offer ($)
                        <input
                          className="input"
                          type="number"
                          min="1"
                          required
                        />
                      </label>
                    )}
                    {["offer", "message"].includes(buyerResponse) && (
                      <label className="bm-label">
                        Sample message
                        <textarea className="input" required maxLength={2000} />
                      </label>
                    )}
                    <button className="btn btn-ghost">Preview response</button>
                  </form>
                </section>
              </div>
              <Link to="/buyermatch/buyers" className="bm-inline-link">
                View the real buyer intake form <ArrowRight size={16} />
              </Link>
            </>
          )}
          {section === "admin" && (
            <>
              <div className="bm-section-title">
                <div>
                  <p className="bm-eyebrow">REVIEW QUEUE · SAMPLE DATA</p>
                  <h2>Consent comes before eligibility.</h2>
                </div>
                <label>
                  Show
                  <select
                    aria-label="Show sample profiles"
                    className="input"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All sample profiles</option>
                    <option value="pending">Pending review</option>
                    <option value="reviewed">Reviewed</option>
                  </select>
                </label>
              </div>
              {filter === "all" ||
              (reviewed ? filter === "reviewed" : filter === "pending") ? (
                <section className="bm-panel">
                  <div className="bm-card-top">
                    <h2>Sample buyer BM-DEMO-01</h2>
                    <span className="bm-status">
                      {reviewed ? "Review demonstrated" : "Pending review"}
                    </span>
                  </div>
                  <p>
                    Illustrative criteria: Alabama · Single-family · Up to
                    $200,000
                  </p>
                  <p>
                    Proof review and explicit invitation consent remain separate
                    from profile approval. Imported buyers are not automatically
                    verified or eligible.
                  </p>
                  <label className="bm-label bm-checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    Mark synthetic invitation-consent evidence reviewed
                  </label>
                  <button
                    className="btn btn-green"
                    disabled={!consent}
                    onClick={() => {
                      setReviewed(true);
                      setNotice(
                        "Synthetic review demonstrated. No server record, verification or delivery state changed.",
                      );
                    }}
                  >
                    Preview reviewed status
                  </button>
                </section>
              ) : (
                <div className="bm-empty">
                  <Users size={32} />
                  <h2>No sample profiles in this filter.</h2>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setFilter("all")}
                  >
                    Show all sample profiles
                  </button>
                </div>
              )}
              <section className="bm-panel">
                <h2>Import with a review boundary.</h2>
                <p>
                  The real network administrator can map CSV columns, preview
                  duplicate detection and review profiles before activation. The
                  demo never imports a file or reads the private network.
                </p>
                <button className="btn btn-ghost" disabled>
                  Server import unavailable in demo
                </button>
              </section>
            </>
          )}
          <footer className="bm-demo-footer">
            <ShieldCheck size={16} /> This walkthrough demonstrates interface
            behavior, not hosted security, payment, delivery or matching
            verification.
          </footer>
        </main>
      </div>
    </div>
  );
}
