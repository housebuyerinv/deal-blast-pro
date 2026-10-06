import BuyerCriteriaEditor from "./BuyerCriteriaEditor";
import BuyerMatchConfiguration from "./BuyerMatchConfiguration";
import { UsageCards, AdminUsage, CommercialPlans } from './BuyerMatchUsage';
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { supabase } from "../../lib/supabase";
import { useAppStore } from "../../store/useAppStore";

type RecordData = Record<string, any>;
const inputClass =
  "w-full rounded-lg border border-[#30384a] bg-[#0b101a] p-3 text-white";
async function request(action: string, data: RecordData = {}, read = false) {
  const ownerId = useAppStore.getState().user?.id;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) throw new Error("Sign in to continue.");
  if (!ownerId || session.session.user.id !== ownerId || useAppStore.getState().user?.id !== ownerId)
    throw new Error("Account changed. Reload BuyerMatch.");
  const response = await fetch(
    read
      ? `/api/buyermatch?${new URLSearchParams({ action, ...data })}`
      : "/api/buyermatch",
    {
      method: read ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(read ? {} : { body: JSON.stringify({ action, ...data }) }),
    },
  );
  const result = await response
    .json()
    .catch(() => ({ error: "BuyerMatch is temporarily unavailable." }));
  const { data: latestSession } = await supabase.auth.getSession();
  if (useAppStore.getState().user?.id !== ownerId || latestSession.session?.user.id !== ownerId)
    throw new Error("Account changed. Reload BuyerMatch.");
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Request failed"), {
      status: response.status,
    });
  return result;
}
function Analysis({ value }: { value: RecordData }) {
  return (
    <section className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-5 space-y-3">
      <h2 className="text-xl font-semibold">
        BuyerMatch result ·{" "}
        {value.score === null
          ? "Score withheld for privacy"
          : `${value.score}/100`}
      </h2>
      <p className="text-sm text-slate-300">{value.explanation}</p>
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          ["Strong matches", value.strongMatches],
          ["Possible matches", value.possibleMatches],
          ["Verified closers", value.verifiedClosers],
          ["Recently active", value.recentlyActive],
        ].map(([label, count]) => (
          <div key={label} className="rounded bg-black/20 p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p>{count}</p>
          </div>
        ))}
      </div>
      <p className="text-sm">
        Missing property information:{" "}
        {value.missingInformation?.join(", ") || "None identified"}
      </p>
      <h3>Price sensitivity</h3>
      <div className="flex flex-wrap gap-4">
        {value.priceSensitivity?.map((r: RecordData) => (
          <p key={r.price} className="text-sm">
            ${r.price.toLocaleString()}: {r.strongMatches} strong /{" "}
            {r.possibleMatches} possible
          </p>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Analysis does not contact buyers. Verification and recent activity
        reflect recorded evidence only.
      </p>
    </section>
  );
}
export default function BuyerMatch() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isPlans = location.pathname.endsWith("/plans");
  const isAdmin = location.pathname.endsWith("/admin");
  const [data, setData] = useState<RecordData>({});
  const [plans, setPlans] = useState<RecordData>({});
  const checkoutKeys = useRef<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [property, setProperty] = useState<RecordData>({
    serviceType: 'software',
    assetType: "sfh",
    state: "",
    zip: "",
  });
  const [title, setTitle] = useState<RecordData>({});
  const [note, setNote] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [kind, setKind] = useState("progress_update");
  const [signature, setSignature] = useState("");
  const [documents, setDocuments] = useState<RecordData[]>([]);
  const [rows, setRows] = useState<RecordData[]>([]);
  const [mapping, setMapping] = useState<RecordData>({});
  const [preview, setPreview] = useState<RecordData[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<RecordData | null>(null);
  const [duplicates, setDuplicates] = useState<RecordData[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [testResult, setTestResult] = useState("");
  const [criteria, setCriteria] = useState("");
  const [adminDetail, setAdminDetail] = useState<RecordData | null>(null);
  const [progressKind, setProgressKind] = useState("buyer_interest");
  const [progressEvidence, setProgressEvidence] = useState<RecordData>({});
  const [settlementKey, setSettlementKey] = useState("");
  const [filter, setFilter] = useState("all");
  const [adminPage, setAdminPage] = useState(0);
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const reload = useCallback(async () => {
    const plan = await request("plans", {}, true);
    setPlans(plan);
    if (isPlans) return;
    if (isAdmin) {
      if (!plan.isNetworkAdmin)
        throw new Error("Network administrator required");
      const listing = await request("admin-list", { page: String(adminPage) }, true);
      const metrics = await request('admin-usage', {}, true);
      setData({ ...listing, metrics });
      return;
    }
    if (id) {
      const detail = await request("detail", { id }, true);
      setData(detail);
      setProperty(detail.deal.property);
      setTitle(detail.deal.title || {});
      setDocuments((await request("documents", {}, true)).documents);
    } else setData(await request("list", {}, true));
  }, [id, isPlans, isAdmin, adminPage]);
  useEffect(() => {
    setData({});
    setError("");
    setNotice("");
    setSettlementKey("");
    setSignature("");
    setBusy(true);
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [reload]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const button = (
    label: string,
    fn: () => Promise<void>,
    unavailable = false,
  ) => (
    <button
      disabled={busy || unavailable}
      onClick={() => void run(fn)}
      className="rounded-lg bg-emerald-500 px-4 py-2 text-black font-medium disabled:opacity-40"
    >
      {label}
    </button>
  );
  const field = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label key={key} className="text-sm text-slate-300">
      {label}
      {required ? " *" : ""}
      <input
        className={inputClass}
        type={type}
        min={type === "number" ? 0 : undefined}
        required={required}
        value={property[key] ?? ""}
        onChange={(e) =>
          setProperty({
            ...property,
            [key]:
              type === "number"
                ? e.target.value === ""
                  ? undefined
                  : Number(e.target.value)
                : e.target.value,
          })
        }
      />
    </label>
  );
  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6 text-slate-100">
      <header className="space-y-3">
        <p className="text-xs tracking-widest text-emerald-400">
          DEAL BLAST PRO · PRIVATE NETWORK
        </p>
        <h1 className="text-3xl font-semibold">
          {isAdmin
            ? "Private Buyer Network"
            : isPlans
              ? "BuyerMatch access"
              : "DBP BuyerMatch"}
        </h1>
        <nav className="flex gap-5 text-sm">
          <Link to="/app/buyermatch">My deals</Link>
          <Link to="/app/buyermatch/plans">Plans & allowances</Link>
          {plans.isNetworkAdmin && (
            <Link to="/app/buyermatch/admin">Network admin</Link>
          )}
        </nav>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded border border-amber-800 bg-amber-950/40 p-4"
        >
          {error}
        </p>
      )}
      {busy && <p role="status">Working…</p>}
      {notice && (
        <p role="status" className="rounded border border-emerald-800 p-4">
          {notice}
        </p>
      )}
      {isPlans ? (
        <section className="space-y-5">
          <UsageCards usage={plans.usage} />
          <CommercialPlans plans={plans.commercialPlans} />
          <p>
            BuyerMatch analysis and Private Network distribution have separate
            allowances from your CRM subscription and purchased credits.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {["buyermatch", "network"].map((product) => {
              const p = plans.entitlements?.find(
                (e: RecordData) => e.product === product,
              );
              return (
                <article
                  key={product}
                  className="border border-slate-700 rounded-xl p-5"
                >
                  <h2 className="text-xl">
                    {product === "buyermatch" ? "BuyerMatch subscription" : "Managed Dispo / Network subscription"}
                  </h2>
                  <p>
                    {p
                      ? `${p.plan_version} · ${p.status}`
                      : "Not activated"}
                  </p>
                  {p && (
                    <p>
                      Period ends {new Date(p.period_end).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-sm text-slate-400 mt-3">
                    {plans.checkoutEnabled
                      ? plans.checkoutMode === 'live' ? 'Secure Stripe subscription checkout' : "Stripe test mode · no live billing"
                      : "Checkout is unavailable. No payment will be taken."}
                  </p>
                  {plans.catalog
                    ?.filter((item: RecordData) => item.product === product)
                    .map((item: RecordData) => (
                      <div key={item.version} className="mt-3 space-y-2">
                        <p>
                          {item.label} · {item.allowance} per period ·{" "}
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: item.currency,
                          }).format(item.amount / 100)}{" "}
                          /{" "}
                          {item.intervalCount > 1
                            ? `${item.intervalCount} ${item.interval}s`
                            : item.interval}
                        </p>
                        {plans.checkoutEnabled &&
                          button(plans.checkoutMode === 'live' ? 'Open secure checkout' : "Open Stripe test checkout", async () => {
                            const key = (checkoutKeys.current[item.version] ??=
                              crypto.randomUUID());
                            try {
                              const result = await request("checkout", {
                                planVersion: item.version,
                                operationKey: key,
                              });
                              window.location.assign(result.url);
                            } catch (error: any) {
                              if (error.status === 409)
                                delete checkoutKeys.current[item.version];
                              throw error;
                            }
                          })}
                      </div>
                    ))}
                </article>
              );
            })}
          </div>
          <p>
            {plans.deliveryMode === "test"
              ? "Synthetic test delivery only. No real buyers are contacted."
              : plans.deliveryMode === "live"
                ? "Buyer delivery requires review and approval."
                : "Buyer delivery is disabled. Saving and analyzing a deal does not send invitations."}{" "}
            Success fees remain disabled.
          </p>
        </section>
      ) : isAdmin ? (
        plans.isNetworkAdmin && (
          <>
            <AdminUsage metrics={data.metrics} />
            <section className="border border-slate-700 rounded-xl p-5 space-y-4">
              <h2 className="text-xl">Import buyers</h2>
              <p className="text-sm text-slate-400">
                Large CSV files are processed in batches of 500. New buyers stay
                inactive and unverified until reviewed. Duplicate emails are
                skipped; CRM buyers remain separate.
              </p>
              <input
                aria-label="Buyer CSV"
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    Papa.parse<RecordData>(file, {
                      header: true,
                      skipEmptyLines: true,
                      complete: (r) => {
                        setRows(r.data);
                        setPreview([]);
                        setMapping({});
                        if (r.errors.length)
                          setError(
                            "CSV parsing errors: correct the file before import.",
                          );
                      },
                    });
                }}
              />
              {rows.length > 0 && (
                <>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      "name",
                      "email",
                      "phone",
                      "company",
                      "state",
                      "city",
                      "zips",
                      "assetTypes",
                      "minPrice",
                      "maxPrice",
                      "maxArvRatio",
                      "maxRepairs",
                      "minBeds",
                      "minBaths",
                      "minSqft",
                      "minUnits",
                      "minCapRate",
                      "minNoi",
                      "excludedZips",
                      "excludedCities",
                      "excludedConditions",
                      "excludedOccupancies",
                      "conditions",
                      "occupancies",
                      "dealTypes",
                      "financingPreferences",
                      "notes",
                      "consentEvidence",
                    ].map((key) => (
                      <label key={key}>
                        {key}
                        <select
                          className={inputClass}
                          value={mapping[key] || ""}
                          onChange={(e) => {
                            setMapping({ ...mapping, [key]: e.target.value });
                            setPreview([]);
                          }}
                        >
                          <option value="">Not mapped</option>
                          {Object.keys(rows[0]).map((h) => (
                            <option key={h}>{h}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {button("Preview & check duplicates", async () => {
                    const combined: RecordData[] = [];
                    const seen = new Set<string>();
                    for (let offset = 0; offset < rows.length; offset += 500) {
                      const result = await request("admin-preview", {
                        rows: rows.slice(offset, offset + 500),
                        mapping,
                      });
                      for (const row of result.rows) {
                        combined.push({
                          ...row,
                          row: row.row + offset,
                          duplicate:
                            row.duplicate || seen.has(row.identity.email),
                        });
                        seen.add(row.identity.email);
                      }
                    }
                    setPreview(combined);
                  })}
                </>
              )}
              {preview.length > 0 && (
                <>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Email</th>
                          <th>Review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r) => (
                          <tr key={r.row}>
                            <td>{r.row}</td>
                            <td>{r.identity.email}</td>
                            <td>
                              {r.errors.join("; ") ||
                                (r.duplicate
                                  ? "Duplicate — skipped"
                                  : "Ready (inactive)")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {button("Import valid new buyers", async () => {
                    for (let offset = 0; offset < rows.length; offset += 500)
                      await request("admin-import", {
                        rows: rows.slice(offset, offset + 500),
                        mapping,
                      });
                    setPreview([]);
                    setRows([]);
                    await reload();
                  })}
                </>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-xl">Network buyers</h2>
              <div className="flex gap-4 items-center">
                <button
                  disabled={busy || adminPage === 0}
                  onClick={() => setAdminPage((p) => p - 1)}
                >
                  Previous page
                </button>
                <span>Page {adminPage + 1}</span>
                <button
                  disabled={
                    busy ||
                    (data.buyers?.length < 100 && data.deals?.length < 100)
                  }
                  onClick={() => setAdminPage((p) => p + 1)}
                >
                  Next page
                </button>
              </div>
              {data.buyers?.map((b: RecordData) => (
                <button
                  key={b.id}
                  className="block w-full text-left rounded border border-slate-700 p-3"
                  onClick={() => {
                    setSelectedBuyer(b);
                    setDuplicates([]);
                    setReviewNote("");
                    setCriteria(JSON.stringify(b.criteria, null, 2));
                  }}
                >
                  {b.identity.name || b.identity.email} · {b.status} ·{" "}
                  {b.verification_level}
                </button>
              ))}
              {selectedBuyer && (
                <div className="space-y-3 border border-slate-700 rounded p-4">
                  <h3>{selectedBuyer.identity.email}</h3>
                  {button("Find possible duplicates", async () =>
                    setDuplicates(
                      (
                        await request("admin-duplicates", {
                          id: selectedBuyer.id,
                        })
                      ).candidates,
                    ),
                  )}
                  {duplicates.length > 0 && (
                    <div className="space-y-3">
                      <label>
                        Review evidence / reason
                        <input
                          className={inputClass}
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                      </label>
                      {duplicates.map((candidate) => (
                        <article
                          key={candidate.id}
                          className="border border-slate-700 p-3"
                        >
                          <p>
                            {candidate.name} · {candidate.email} ·{" "}
                            {candidate.reasons.join(", ")}
                          </p>
                          {(["distinct", "merge"] as const).map((decision) => (
                            <button
                              key={decision}
                              disabled={busy || reviewNote.trim().length < 3}
                              className="mr-4 underline disabled:opacity-40"
                              onClick={() =>
                                void run(async () => {
                                  await request("admin-duplicate-review", {
                                    id: selectedBuyer.id,
                                    targetId: candidate.id,
                                    decision,
                                    note: reviewNote,
                                  });
                                  setDuplicates([]);
                                  setSelectedBuyer(null);
                                  await reload();
                                })
                              }
                            >
                              {decision === "merge"
                                ? "Merge selected buyer into this record"
                                : "Keep separate with evidence"}
                            </button>
                          ))}
                        </article>
                      ))}
                      <p className="text-sm">
                        Merges preserve audit history. Buyers with existing
                        exposures require manual attribution reconciliation.
                      </p>
                    </div>
                  )}
                  <BuyerCriteriaEditor
                    value={JSON.parse(criteria)}
                    onChange={(value) => setCriteria(JSON.stringify(value))}
                  />
                  <label>
                    Status
                    <select
                      className={inputClass}
                      value={selectedBuyer.status}
                      onChange={(e) =>
                        setSelectedBuyer({
                          ...selectedBuyer,
                          status: e.target.value,
                        })
                      }
                    >
                      {["inactive", "active", "suppressed"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Verification
                    <select
                      className={inputClass}
                      value={selectedBuyer.verification_level}
                      onChange={(e) =>
                        setSelectedBuyer({
                          ...selectedBuyer,
                          verification_level: e.target.value,
                        })
                      }
                    >
                      <option value="unverified">Unverified</option>
                      <option value="closing_verified">Closing verified</option>
                    </select>
                  </label>
                  <label>
                    Verification evidence
                    <textarea
                      className={inputClass}
                      value={selectedBuyer.verification_evidence || ""}
                      onChange={(e) =>
                        setSelectedBuyer({
                          ...selectedBuyer,
                          verification_evidence: e.target.value,
                        })
                      }
                    />
                  </label>
                  {button("Save reviewed buyer", async () => {
                    await request("admin-buyer", {
                      id: selectedBuyer.id,
                      status: selectedBuyer.status,
                      criteria: JSON.parse(criteria),
                      verificationLevel: selectedBuyer.verification_level,
                      verificationEvidence: selectedBuyer.verification_evidence,
                    });
                    setSelectedBuyer(null);
                    await reload();
                  })}
                </div>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-xl">Deal review & EOC reminders</h2>
              {data.dueReminders?.map((r: RecordData) => (
                <div key={r.id} className="rounded border border-amber-800 p-3">
                  <p>
                    Due {r.due_date} · EOC {r.day_offset > 0 ? "+" : ""}
                    {r.day_offset} days · Deal {r.deal_id}
                  </p>
                  {button("Acknowledge reminder", async () => {
                    await request("admin-reminder", { reminderId: r.id });
                    await reload();
                  })}
                </div>
              ))}
              <select
                aria-label="Deal filter"
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "all",
                  "approaching_eoc",
                  "buyer_selected",
                  "closing_scheduled",
                  "closing_unknown",
                  "closed_fee_pending",
                  "fee_paid",
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              {data.deals
                ?.filter(
                  (d: RecordData) =>
                    filter === "all" ||
                    (filter === "approaching_eoc"
                      ? d.title?.eoc &&
                        Date.parse(d.title.eoc) - Date.now() < 14 * 86400000
                      : filter === "fee_paid"
                        ? Boolean(d.closing?.paid_at)
                        : filter === "closed_fee_pending"
                          ? d.status === "closed" && !d.closing?.paid_at
                          : filter === "closing_unknown"
                            ? d.title?.eoc &&
                              Date.parse(d.title.eoc) < Date.now() &&
                              d.status !== "closed"
                            : d.status === filter),
                )
                .map((d: RecordData) => (
                  <article
                    key={d.id}
                    className="border border-slate-700 rounded p-3 space-y-2"
                  >
                    <p>
                      {d.property.address} · {d.status}
                    </p>
                    <p className="text-sm">
                      {d.title?.company} · EOC: {d.title?.eoc || "Not supplied"}
                    </p>
                    <p className="text-xs">
                      Internal reminder dates:{" "}
                      {d.reminders.map((r: RecordData) => r.date).join(", ") ||
                        "Awaiting EOC"}
                    </p>
                    {button("Inspect private matches & events", async () =>
                      setAdminDetail(
                        await request("admin-detail", { id: d.id }),
                      ),
                    )}{" "}
                    {button("Approve contract review", async () => {
                      await request("admin-review", { id: d.id });
                      await reload();
                    })}
                  </article>
                ))}
              {adminDetail && (
                <section className="space-y-3 border border-slate-700 p-4 rounded">
                  <h3>Review {adminDetail.deal.property.address}</h3>
                  {plans.testDeliveryEnabled &&
                    button("Run synthetic delivery batch", async () => {
                      const result = await request("admin-test-dispatch");
                      setTestResult(
                        `${result.sent} accepted; ${result.retry} require retry.`,
                      );
                      setAdminDetail(
                        await request("admin-detail", {
                          id: adminDetail.deal.id,
                        }),
                      );
                    })}
                  {testResult && <p role="status">{testResult}</p>}
                  {plans.testDeliveryEnabled &&
                    button(
                      "Open selected synthetic buyer response",
                      async () => {
                        const result = await request(
                          "admin-test-response-link",
                          {
                            exposureId: progressEvidence.exposureId,
                          },
                        );
                        window.open(
                          result.url,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      },
                    )}
                  {button("View private PSA", async () => {
                    const result = await request("admin-document", {
                      id: adminDetail.deal.id,
                    });
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  })}
                  <label>
                    Progress event
                    <select
                      className={inputClass}
                      value={progressKind}
                      onChange={(e) => setProgressKind(e.target.value)}
                    >
                      {[
                        "buyer_interest",
                        "offer_received",
                        "buyer_selected",
                        "title_open",
                        "closing_scheduled",
                        "title_acknowledged",
                        "closing_verified",
                        "fee_due",
                        "fee_paid",
                        "canceled",
                        "expired",
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Actual exposure
                    <select
                      className={inputClass}
                      value={progressEvidence.exposureId || ""}
                      onChange={(e) =>
                        setProgressEvidence({
                          ...progressEvidence,
                          exposureId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select exposure</option>
                      {adminDetail.exposures.map((x: RecordData) => (
                        <option key={x.id} value={x.id}>
                          {x.buyer_id} · {x.bm_outbox?.[0]?.state || "pending"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Interest signal
                    <select
                      className={inputClass}
                      value={progressEvidence.signal || ""}
                      onChange={(e) =>
                        setProgressEvidence({
                          ...progressEvidence,
                          signal: e.target.value,
                        })
                      }
                    >
                      <option value="">Select signal</option>
                      {["reply", "inquiry", "showing_request"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {[
                    "amountCents",
                    "grossCents",
                    "terms",
                    "date",
                    "reference",
                    "settlementKey",
                  ].map((key) => (
                    <label className="block" key={key}>
                      {key}
                      <input
                        className={inputClass}
                        type={
                          key === "date"
                            ? "date"
                            : ["amountCents", "grossCents"].includes(key)
                              ? "number"
                              : "text"
                        }
                        value={progressEvidence[key] || ""}
                        onChange={(e) =>
                          setProgressEvidence({
                            ...progressEvidence,
                            [key]: ["amountCents", "grossCents"].includes(key)
                              ? Number(e.target.value)
                              : e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  {button("Record verified progress", async () => {
                    await request("admin-progress", {
                      id: adminDetail.deal.id,
                      kind: progressKind,
                      evidence: progressEvidence,
                    });
                    setAdminDetail(
                      await request("admin-detail", {
                        id: adminDetail.deal.id,
                      }),
                    );
                    await reload();
                  })}
                  <pre className="text-xs p-4 bg-black/30 overflow-auto max-h-96">
                    {JSON.stringify(adminDetail, null, 2)}
                  </pre>
                </section>
              )}
            </section>
            <section>
              <BuyerMatchConfiguration request={request} />
              <h2 className="text-xl">Import history</h2>
              {data.imports?.map((r: RecordData) => (
                <p key={r.id}>
                  {new Date(r.created_at).toLocaleString()} ·{" "}
                  {r.summary.inserted} imported, {r.summary.skipped} skipped
                </p>
              ))}
            </section>
          </>
        )
      ) : id && data.deal?.id !== id ? null : (
        <>
          {!id && (
            <section className="space-y-3">
              <p>
                Save and analyze a deal before contracting it. Analysis never
                distributes a deal.
              </p>
              {data.deals?.map((d: RecordData) => (
                <Link
                  key={d.id}
                  to={`/app/buyermatch/deals/${d.id}`}
                  className="block rounded-xl border border-slate-700 p-4"
                >
                  {d.property.address} · {d.property.city}, {d.property.state}{" "}
                  <span className="block mt-2 text-sm text-slate-400 sm:mt-0 sm:float-right">
                    {d.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </section>
          )}
          <form
            className="rounded-xl border border-slate-700 p-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await request("save", { id, property });
                setOperationKey(crypto.randomUUID());
                if (id) await reload();
                else navigate(`/app/buyermatch/deals/${result.id}`);
              });
            }}
          >
            <h2 className="text-xl">
              {id ? "Deal details" : "Save a new deal"}
            </h2>
            <label className="block">Service
              <select className={inputClass} value={property.serviceType || (id ? 'managed_dispo' : 'software')}
                onChange={event => setProperty({...property,serviceType:event.target.value})}>
                <option value="software">BuyerMatch software — no automatic success fee</option>
                <option value="managed_dispo">Managed Dispo — separate deal-specific terms required</option>
              </select>
            </label>
            <div className="grid sm:grid-cols-3 gap-4">
              {field("address", "Street address", "text", true)}
              {field("city", "City", "text", true)}
              {field("state", "State (two letters)", "text", true)}
              {field("zip", "ZIP code", "text", true)}
              <label>
                Property type
                <select
                  className={inputClass}
                  value={property.assetType}
                  onChange={(e) =>
                    setProperty({ ...property, assetType: e.target.value })
                  }
                >
                  {[
                    "sfh",
                    "condo",
                    "townhouse",
                    "land",
                    "multifamily",
                    "commercial",
                    "stnl",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {field("price", "Buyer asking price ($)", "number", true)}
              {field("arv", "ARV ($)", "number")}
              {field("repairs", "Repairs ($)", "number")}
              {field("beds", "Beds", "number")}
              {field("baths", "Baths", "number")}
              {field("sqft", "Square feet", "number")}
              {field("condition", "Condition")}
              {field("occupancy", "Occupancy")}
              {field("dealType", "Deal structure")}
              {field("closingTimeline", "Closing timeline")}
              {field("financing", "Financing")}
              {["multifamily", "commercial", "stnl"].includes(
                property.assetType,
              ) && (
                <>
                  {field("units", "Units", "number")}
                  {field("noi", "Annual NOI ($)", "number")}
                  {field("capRate", "Cap rate (%)", "number")}
                  {field(
                    "debtServiceCoverage",
                    "Debt service coverage",
                    "number",
                  )}
                </>
              )}
              {["commercial", "stnl"].includes(property.assetType) && (
                <>
                  {field("tenant", "Tenant")}
                  {field("leaseEnd", "Lease end", "date")}
                  {field("leaseYears", "Remaining lease years", "number")}
                </>
              )}
            </div>
            <button
              disabled={
                busy ||
                Boolean(
                  id && !["draft", "analyzed"].includes(data.deal?.status),
                )
              }
              className="rounded bg-emerald-500 px-4 py-2 text-black disabled:opacity-40"
            >
              Save deal
            </button>
          </form>
          {id && (
            <>
              {button("Analyze saved deal", async () => {
                const result = await request("analyze", { id, operationKey });
                setData({ ...data, analysis: result });
                setOperationKey(crypto.randomUUID());
                await reload();
              })}
              {data.analysis && <Analysis value={data.analysis} />}
              <section className="border border-slate-700 rounded-xl p-5 space-y-4">
                <h2 className="text-xl">Prepare for distribution</h2>
                <p className="text-sm text-slate-400">
                  {plans.distributionEnabled
                    ? plans.testDeliveryEnabled
                      ? "Synthetic test delivery requires review. No real buyers are contacted."
                      : "Buyer delivery requires review and approval."
                    : "Buyer delivery is disabled. You can save documents and prepare this deal for review."}{" "}
                  Success fees remain disabled.
                </p>
                <label>
                  Private PSA PDF (up to 10 MB)
                  <input
                    className={inputClass}
                    type="file"
                    accept="application/pdf"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(async () => {
                          if (
                            file.size > 10485760 ||
                            file.type !== "application/pdf"
                          )
                            throw new Error("Upload a PDF under 10 MB");
                          const upload = await request("upload", { id });
                          const result = await supabase.storage
                            .from("buyermatch-private")
                            .uploadToSignedUrl(upload.path, upload.token, file);
                          if (result.error)
                            throw new Error(
                              "Private upload failed. Please retry.",
                            );
                          await reload();
                        });
                    }}
                  />
                </label>
                <p>
                  PSA:{" "}
                  {data.deal?.hasContract
                    ? "Upload reference saved"
                    : "Not uploaded"}{" "}
                  · Contract control:{" "}
                  {data.deal?.contractVerified ? "Verified" : "Pending review"}
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {["company", "name", "email", "phone", "eoc"].map((key) => (
                    <label key={key}>
                      {key === "eoc" ? "End of contract" : `Title ${key}`}
                      <input
                        className={inputClass}
                        type={
                          key === "eoc"
                            ? "date"
                            : key === "email"
                              ? "email"
                              : "text"
                        }
                        value={title[key] || ""}
                        onChange={(e) =>
                          setTitle({ ...title, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                {button("Save title / EOC extension", async () => {
                  await request("title", { id, title });
                  await reload();
                  setNotice(
                    "Title information and end of contract saved. Contract review is required again.",
                  );
                })}
                <h3>Agreements & certification</h3>
                {documents.length === 0 ? (
                  <p>No approved agreement documents have been configured.</p>
                ) : (
                  <>
                    <label>
                      Typed signature
                      <input
                        className={inputClass}
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                      />
                    </label>
                    {documents.filter(doc => (property.serviceType || 'managed_dispo') !== 'software' || doc.kind !== 'fee_schedule').map((doc) => (
                      <details key={doc.id}>
                        <summary>
                          {doc.kind} · version {doc.version}
                        </summary>
                        <pre className="whitespace-pre-wrap text-sm">
                          {doc.content}
                        </pre>
                        {button("Accept this version", async () => {
                          await request("accept", {
                            id,
                            documentId: doc.id,
                            signature,
                          });
                          setSignature("");
                          setNotice(
                            `${doc.kind} version ${doc.version} accepted.`,
                          );
                        })}
                      </details>
                    ))}
                  </>
                )}
                <p className="text-sm text-slate-400">
                  After contract or title changes and admin review, run Analyze
                  saved deal again before requesting distribution.
                </p>
                <section className="rounded border border-slate-700 p-4 space-y-2" aria-label="Distribution readiness">
                  <h3>Distribution check</h3>
                  {(property.serviceType || 'managed_dispo') === 'software' && <p>Your plan will distribute this deal to up to {plans.usage?.softwareDistribution?.maxDistributionFanout ?? 0} of the strongest eligible matches. {plans.usage?.softwareDistribution?.remaining ?? 0} Software distributions remaining this billing period.</p>}
                  <p>{data.deal.hasContract ? '✓' : 'Required:'} Private contract upload</p>
                  <p>{data.deal.contractVerified ? '✓' : 'Required:'} Contract/control review</p>
                  <p>{data.analysis ? '✓' : 'Required:'} Matching analysis (freshness rechecked before sending)</p>
                  <p>{Date.parse(data.deal.title?.eoc || '') > Date.now() ? '✓' : 'Required:'} Future closing/EOC date</p>
                  <p>{plans.distributionEnabled ? '✓' : 'Unavailable:'} Delivery authorization</p>
                  <p className="text-sm text-slate-400">Current signed agreements, consent and available allowance are checked before any exposure.
                    {(property.serviceType || 'managed_dispo') === 'software' ? ' Software distribution carries no automatic success fee.' : ' Managed Dispo also requires its approved deal-specific fee terms.'}</p>
                </section>
                {button(
                  "Request distribution",
                  async () => {
                    await request("distribution", { id, operationKey });
                    await reload();
                    setNotice(
                      "Distribution request recorded. Delivery status appears in Deal progress.",
                    );
                  },
                  !plans.distributionEnabled || !(plans.usage?.[(property.serviceType || 'managed_dispo') === 'software' ? 'softwareDistribution' : 'managedDispo']?.remaining > 0),
                )}
              </section>
              <section className="border border-slate-700 rounded-xl p-5 space-y-3">
                <h2 className="text-xl">Deal progress</h2>
                {data.offers?.map((offer: RecordData) => (
                  <p key={offer.id}>
                    Network offer: $
                    {(offer.amount_cents / 100).toLocaleString()} ·{" "}
                    {new Date(offer.created_at).toLocaleDateString()}
                  </p>
                ))}
                <div className="rounded-lg border border-slate-700 bg-black/20 p-4 space-y-3">
                  <h3 className="font-semibold">Private buyer conversation</h3>
                  {data.conversations?.length ? (
                    <>
                      <select
                        aria-label="Buyer conversation"
                        className={inputClass}
                        value={conversationId}
                        onChange={(e) => setConversationId(e.target.value)}
                      >
                        <option value="">Select an anonymous buyer</option>
                        {data.conversations.map((conversation: RecordData) => (
                          <option key={conversation.exposureId} value={conversation.exposureId}>
                            {conversation.buyerRef}
                          </option>
                        ))}
                      </select>
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {(data.messages || [])
                          .filter((message: RecordData) => !conversationId || message.exposure_id === conversationId)
                          .map((message: RecordData) => (
                            <div key={message.id} className="rounded bg-slate-900 p-3">
                              <p className="text-xs text-slate-400">
                                {message.sender_kind === "buyer" ? "Buyer" : "You / team"} · {new Date(message.created_at).toLocaleString()}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                            </div>
                          ))}
                      </div>
                      <textarea
                        aria-label="Message buyer"
                        className={inputClass}
                        maxLength={2000}
                        value={messageDraft}
                        onChange={(e) => setMessageDraft(e.target.value)}
                        placeholder="Send a message without exposing either party's email address."
                      />
                      {button("Send message", async () => {
                        if (!conversationId) throw new Error("Select a buyer conversation.");
                        await request("message", {
                          id,
                          exposureId: conversationId,
                          message: messageDraft,
                        });
                        setMessageDraft("");
                        await reload();
                      }, !conversationId || !messageDraft.trim())}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Conversations appear after a buyer receives this deal. Buyer identities stay private.
                    </p>
                  )}
                </div>
                {data.closing && (
                  <p>
                    Closing:{" "}
                    {data.closing.verified_at
                      ? "Verified"
                      : "Pending verification"}{" "}
                    · Signature:{" "}
                    {data.closing.user_signed_at ? "Recorded" : "Pending"} ·
                    Title acknowledgement:{" "}
                    {data.closing.title_acknowledged_at
                      ? "Recorded"
                      : "Pending"}{" "}
                    · Payment:{" "}
                    {data.closing.paid_at ? "Verified paid" : "Not paid"}
                  </p>
                )}
                <label className="block">
                  Private settlement evidence PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={busy}
                    className={inputClass}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(async () => {
                          if (
                            file.type !== "application/pdf" ||
                            file.size > 10485760
                          )
                            throw new Error("Upload a PDF under 10 MB");
                          const upload = await request("upload", {
                            id,
                            purpose: "settlement",
                          });
                          const result = await supabase.storage
                            .from("buyermatch-private")
                            .uploadToSignedUrl(upload.path, upload.token, file);
                          if (result.error)
                            throw new Error("Evidence upload failed");
                          setSettlementKey(upload.path);
                          setNotice(
                            "Settlement PDF uploaded. Submit a closing report to attach it for verification.",
                          );
                        });
                    }}
                  />
                </label>
                <p>
                  User-reported closings remain pending until verified. Email
                  opens alone do not establish buyer interest.
                </p>
                <select
                  aria-label="Update type"
                  className={inputClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {[
                    "progress_update",
                    "review_requested",
                    "closing_reported",
                    "cancellation_requested",
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <textarea
                  aria-label="Progress details"
                  className={inputClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Update, title information, or closing evidence reference"
                />
                {button("Submit update", async () => {
                  await request("update", { id, kind, note, settlementKey });
                  setNote("");
                  setSettlementKey("");
                  await reload();
                })}
                <ol className="space-y-3">
                  {data.events?.map((event: RecordData) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-emerald-700 pl-4"
                    >
                      <p>
                        {event.kind.replaceAll("_", " ")} ·{" "}
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm text-slate-400">
                        {event.public_note}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
