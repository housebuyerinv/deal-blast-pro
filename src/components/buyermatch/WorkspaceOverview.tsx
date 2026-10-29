import { Link } from "react-router-dom";
import { ArrowRight, Building2, FileSearch, ShieldCheck } from "lucide-react";

export type DealCard = {
  id: string;
  status: string;
  property: {
    address?: string;
    city?: string;
    state?: string;
    price?: number;
    assetType?: string;
  };
  title?: { eoc?: string };
};
export function WorkspaceOverview({
  deals,
  loading = false,
  failed = false,
  allDeals = deals,
  searchActive = false,
  prefix = "/app/buyermatch/deals/",
}: {
  deals: DealCard[];
  loading?: boolean;
  failed?: boolean;
  allDeals?: DealCard[];
  searchActive?: boolean;
  prefix?: string;
}) {
  return (
    <section aria-label="Deal workspace" className="bm-workspace">
      <div className="bm-metrics">
        {[
          ["Saved deals", allDeals.length],
          [
            "In progress",
            allDeals.filter(
              (d) => !["closed", "draft", "archived"].includes(d.status),
            ).length,
          ],
          [
            "Closed deals",
            allDeals.filter((d) => d.status === "closed").length,
          ],
        ].map(([name, value]) => (
          <div className="bm-stat" key={name}>
            <span>{name}</span>
            <strong>{failed || loading ? "—" : value}</strong>
            <small>
              {name === "Saved deals"
                ? "Your private workspace"
                : "Recorded deal status"}
            </small>
          </div>
        ))}
      </div>
      <div className="bm-section-title">
        <div>
          <p className="bm-eyebrow">YOUR PIPELINE</p>
          <h2>Keep the next step in view.</h2>
        </div>
        <a className="btn btn-green" href="#new-deal">
          Add a deal <Building2 size={16} />
        </a>
      </div>
      {loading ? (
        <p role="status" className="bm-panel">
          Loading your deal workspace…
        </p>
      ) : failed ? (
        <div className="bm-panel">
          <h3>Your deals could not be loaded</h3>
          <p>
            Use Retry above. An unavailable workspace is not an empty pipeline.
          </p>
        </div>
      ) : !deals.length ? (
        <div className="bm-empty">
          <FileSearch size={36} />
          <h3>
            {searchActive
              ? "No deals match your search."
              : "Your next deal starts here."}
          </h3>
          <p>
            {searchActive
              ? "Change or clear the search above to see your saved deals."
              : "Add property details, review private buyer fit, then prepare eligible distribution. Saving or analyzing a deal never contacts buyers."}
          </p>
          <a href="#new-deal" className="btn btn-green">
            {searchActive ? "Add another deal" : "Save your first deal"}{" "}
            <ArrowRight size={16} />
          </a>
        </div>
      ) : (
        <div className="bm-deal-grid">
          {deals.map((deal) => (
            <Link
              className="bm-deal-card"
              key={deal.id}
              to={`${prefix}${deal.id}`}
            >
              <div className="bm-card-top">
                <span className="bm-property-icon">
                  <Building2 size={20} />
                </span>
                <span className="bm-status">
                  {deal.status.replace(/_/g, " ")}
                </span>
              </div>
              <h3>{deal.property.address || "Untitled property"}</h3>
              <p>
                {[deal.property.city, deal.property.state]
                  .filter(Boolean)
                  .join(", ") || "Location not recorded"}
              </p>
              <div className="bm-card-bottom">
                <strong>
                  {typeof deal.property.price === "number"
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(deal.property.price)
                    : "Price not recorded"}
                </strong>
                <span>
                  Open deal <ArrowRight size={16} />
                </span>
              </div>
              {deal.title?.eoc && (
                <p className="bm-deadline">EOC · {deal.title.eoc}</p>
              )}
            </Link>
          ))}
        </div>
      )}
      <p className="bm-privacy-note">
        <ShieldCheck size={16} /> Your deals and buyer conversations stay scoped
        to your account. Match counts do not expose buyer contact details.
      </p>
    </section>
  );
}
export function WorkflowSteps() {
  return (
    <ol className="bm-workflow" aria-label="BuyerMatch workflow">
      {[
        ["01", "Add a property", "Save your deal details."],
        ["02", "Understand the fit", "Analyze recorded buyer criteria."],
        ["03", "Prepare distribution", "Complete consent and review."],
        ["04", "Track responses", "Keep conversations private."],
      ].map(([number, title, body]) => (
        <li key={number}>
          <span>{number}</span>
          <div>
            <strong>{title}</strong>
            <p>{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
