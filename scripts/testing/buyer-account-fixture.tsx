// Local UI harness only. Not imported by App or included in the production entry.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { BuyerAccountPanel } from "../../src/pages/public/BuyerMatchAccount";
import "../../src/index.css";
function Fixture() {
  const [account, setAccount] = useState({
    linked: true,
    revision: 0,
    profile: {
      name: "Sample buyer",
      company: "Example investments",
      phone: "",
    },
    criteria: {
      markets: [{ state: "TX", city: "Austin" }],
      assetTypes: ["sfh"],
      minPrice: 100000,
      maxPrice: 350000,
    },
    status: "inactive",
    optedOut: false,
    consent: {
      version: "buyer-maintenance-v1",
      text: "SYNTHETIC LOCAL FIXTURE: accuracy/storage authorization; invitation consent remains optional.",
    },
    proofs: [
      {
        id: "synthetic-proof",
        expiresOn: "2026-10-01",
        createdAt: "2026-09-01T12:00:00Z",
        status: "expired",
      },
    ],
  });
  return (
    <div className="bm-site">
      <aside className="bm-panel" role="note">
        <strong>
          SYNTHETIC UI FIXTURE — no authentication, providers, uploads, delivery
          or real account changes.
        </strong>{" "}
        This is the real buyer-account presentation with in-memory fixtures, not
        hosted acceptance.
      </aside>
      <BuyerAccountPanel
        account={account}
        run={async (input) => {
          if (input.action === "history")
            return {
              items: [
                {
                  id: "synthetic-invitation",
                  createdAt: "2026-10-25T12:00:00Z",
                  status: "closed",
                  property: {
                    address: "Sample investment property",
                    city: "Austin",
                    state: "TX",
                  },
                  responses: [
                    { kind: "declined", createdAt: "2026-10-25T13:00:00Z" },
                  ],
                  offers: [],
                  messages: [
                    {
                      sender: "buyer",
                      body: "This sample property is outside my current criteria.",
                      createdAt: "2026-10-25T13:00:00Z",
                    },
                  ],
                },
              ],
              next: null,
            };
          if (input.action === "profile") {
            setAccount((old) => ({
              ...old,
              revision: old.revision + 1,
              profile: {
                name: String(input.name),
                company: String(input.company),
                phone: String(input.phone),
              },
            }));
            return {};
          }
          if (input.action === "criteria" || input.action === "withdraw") {
            setAccount((old) => ({
              ...old,
              revision: old.revision + 1,
              optedOut: input.action === "withdraw" || !input.invitations,
              status:
                input.action === "withdraw" || !input.invitations
                  ? "suppressed"
                  : "inactive",
            }));
            return {};
          }
          throw Error(
            "Document/provider operations are disabled in this fixture",
          );
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <Fixture />
  </MemoryRouter>,
);
