import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAppStore } from "../../store/useAppStore";

type Data = Record<string, any>;
const kinds = [
  "identity",
  "inventory_verified",
  "interested",
  "written_offer",
  "offer_status",
  "emd_pending",
  "emd_confirmed",
  "emd_failed",
  "closing_scheduled",
  "closed",
  "lost",
  "stalled",
  "withdrawn",
  "canceled",
  "reopened",
  "fee_projected",
  "fee_invoiced",
  "fee_received",
  "fee_refunded",
  "void",
];
const reasons = [
  "inventory_control",
  "unrealistic_price",
  "poor_matching",
  "low_response",
  "missing_emd",
  "closing_execution",
  "seller_withdrew",
  "buyer_withdrew",
  "title_issue",
  "financing",
  "other_documented",
];
const label = (s: string) => s.replace(/_/g, " ");
const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v / 100,
  );
const ratio = (v: Data) =>
  v.percent === null
    ? `Insufficient data (0/${v.denominator})`
    : `${v.numerator}/${v.denominator} (${v.percent.toFixed(1)}%)`;
const input = "rounded border border-slate-600 bg-slate-950 p-2 w-full";
export default function BuyerMatchConversion() {
  const owner = useAppStore((s) => s.user?.id);
  return <ConversionScreen key={owner || "signed-out"} owner={owner} />;
}
export function ConversionScreen({
  owner,
  transport,
}: {
  owner?: string;
  transport?: (action: string, data?: Data, read?: boolean) => Promise<Data>;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Data>({ windowDays: "90" }),
    [selected, setSelected] = useState("");
  const [form, setForm] = useState<Data>({
    kind: "inventory_verified",
    occurredAt: "",
    reason: "other_documented",
    verifier: "title",
    status: "accepted",
  });
  const [reviewedPair, setReviewedPair] = useState("");
  const [confirmed, setConfirmed] = useState(false),
    operation = useRef<{ value: string; key: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setConfirmed(false);
    setForm({
      kind: "inventory_verified",
      occurredAt: "",
      reason: "other_documented",
      verifier: "title",
      status: "accepted",
    });
    operation.current = null;
  }, [selected]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const request = useCallback(
    async (action: string, values: Data = {}, read = false) => {
      if (transport) return transport(action, values, read);
      const { data: session } = await supabase.auth.getSession();
      if (
        !owner ||
        session.session?.user.id !== owner ||
        useAppStore.getState().user?.id !== owner
      )
        throw new Error("Account changed. Reload the conversion dashboard.");
      const response = await fetch(
        read
          ? `/api/buyermatch?${new URLSearchParams({ action, ...values })}`
          : "/api/buyermatch",
        {
          method: read ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            "Content-Type": "application/json",
          },
          ...(!read ? { body: JSON.stringify({ action, ...values }) } : {}),
        },
      );
      const result = await response.json();
      const latest = await supabase.auth.getSession();
      if (
        latest.data.session?.user.id !== owner ||
        useAppStore.getState().user?.id !== owner
      )
        throw new Error("Account changed. Reload before continuing.");
      if (!response.ok)
        throw new Error(result.error || "Conversion request failed");
      return result;
    },
    [owner, transport],
  );
  async function load() {
    const run = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "conversion-report",
        Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value !== ""),
        ),
        true,
      );
      if (generation.current === run) {
        setData(result);
        setSelected((previous) =>
          result.rows.some((row: Data) => row.id === previous)
            ? previous
            : result.rows[0]?.id || "",
        );
        setReviewedPair("");
        setConfirmed(false);
      }
    } catch (e) {
      if (generation.current === run) {
        setData(null);
        setError((e as Error).message);
      }
    } finally {
      if (generation.current === run) setBusy(false);
    }
  }
  async function write(action: string, values: Data) {
    const serialized = JSON.stringify({ action, ...values });
    if (operation.current?.value !== serialized)
      operation.current = { value: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await request(action, { ...values, operationKey: operation.current.key });
      operation.current = null;
      setConfirmed(false);
      await load();
    } catch (e) {
      setError(
        `${(e as Error).message} If the outcome is uncertain, refresh first; the unchanged form retains its operation key.`,
      );
      setBusy(false);
    }
  }
  async function record(event: React.FormEvent) {
    event.preventDefault();
    if (
      !confirmed ||
      !data?.rows.some((row: Data) => row.id === selected) ||
      !form.occurredAt
    )
      return;
    let payload: Data = {};
    const kind = form.kind;
    if (kind === "identity")
      payload = Object.fromEntries(
        [
          "unit",
          "parcelRef",
          "contractRef",
          "interestRef",
          "transactionRef",
          "source",
          "jvPartner",
          "market",
          "crmDealRef",
        ]
          .filter((k) => form[k] || k === "jvPartner")
          .map((k) => [k, form[k] || ""]),
      );
    if (
      [
        "written_offer",
        "emd_pending",
        "emd_confirmed",
        "emd_failed",
        "offer_status",
      ].includes(kind)
    )
      payload.offerRef = form.offerRef;
    if (["interested", "written_offer"].includes(kind))
      payload.counterpartyRef = form.counterpartyRef;
    if (kind === "closing_scheduled")
      payload.scheduledDate = form.scheduledDate;
    if (
      [
        "written_offer",
        "emd_confirmed",
        "closed",
        "fee_projected",
        "fee_invoiced",
        "fee_received",
        "fee_refunded",
      ].includes(kind)
    ) {
      const amount = Number(form.amount);
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(form.amount || "")
      ) {
        setError(
          "Enter a positive USD amount with at most two decimal places.",
        );
        return;
      }
      payload.amountCents = Math.round(amount * 100);
    }
    if (
      [
        "inventory_verified",
        "written_offer",
        "emd_confirmed",
        "closed",
        "fee_received",
        "fee_refunded",
      ].includes(kind)
    )
      payload.confirmed = true;
    if (
      [
        "lost",
        "stalled",
        "withdrawn",
        "canceled",
        "reopened",
        "emd_failed",
        "void",
      ].includes(kind)
    )
      payload.reason = form.reason;
    if (kind === "emd_confirmed") payload.verifier = form.verifier;
    if (kind === "offer_status") payload.status = form.status;
    if (kind === "void") payload.eventId = form.eventId;
    await write("conversion-record", {
      dealId: selected,
      kind,
      occurredAt: new Date(form.occurredAt).toISOString(),
      evidenceRef: form.evidenceRef,
      payload,
    });
  }
  const row = data?.rows.find((value: Data) => value.id === selected);
  const field = (
    key: string,
    title: string,
    required = true,
    type = "text",
  ) => (
    <label className="block" key={key}>
      {title}
      <input
        className={input}
        type={type}
        required={required}
        value={form[key] || ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <header>
        <Link to="/app/buyermatch">BuyerMatch deals</Link>
        <h1 className="text-2xl font-semibold">
          Property conversion intelligence
        </h1>
        <p>
          Evidence-based property and transaction outcomes. Email volume is not
          a sale.
        </p>
        <p>
          Dates select the received-property cohort. Funnel and engagement use
          the observation window; current outcomes and lifetime cohort fees
          include later evidence and corrections.
        </p>
      </header>
      <form
        className="grid sm:grid-cols-4 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        aria-label="Conversion filters"
      >
        {["market", "source", "jvPartner", "from", "to", "windowDays"].map(
          (key) => (
            <label key={key}>
              {label(key)}
              <input
                className={input}
                aria-label={key}
                type={
                  ["from", "to"].includes(key)
                    ? "date"
                    : key === "windowDays"
                      ? "number"
                      : "text"
                }
                min={key === "windowDays" ? 1 : undefined}
                max={key === "windowDays" ? 1095 : undefined}
                value={filters[key] || ""}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ),
        )}
        <label>
          Outcome
          <select
            className={input}
            value={filters.outcome || ""}
            onChange={(e) =>
              setFilters({ ...filters, outcome: e.target.value })
            }
          >
            <option value="">All outcomes</option>
            {[
              "open",
              "closed",
              "lost",
              "stalled",
              "withdrawn",
              "canceled",
              "reopened",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-green self-end" disabled={busy}>
          Load conversion report
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!data && !error && (
        <p>
          Load your recorded conversion cohort. No sample outcomes or historical
          receipts are generated.
        </p>
      )}
      {data && (
        <>
          <p>
            {data.properties} property identities · {data.transactions}{" "}
            transactions · {data.submissions} preserved submissions.{" "}
            {data.unresolvedIdentities} identities need review and are counted
            separately, so the property total is provisional.{" "}
            {data.matureTransactions}/{data.transactions} transactions have the
            full {data.filters.windowDays}-day observation window.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ["Verified inventory", data.funnel[1]],
              ["Eligible-match coverage", data.eligiblePropertyMatches],
              ["Delivered-recipient engagement", data.buyerEngagement],
            ].map(([title, value]) => (
              <section className="card p-4" key={String(title)}>
                <h2>{String(title)}</h2>
                <p>{ratio(value as Data)}</p>
              </section>
            ))}
          </div>
          <section>
            <h2 className="text-xl">Property funnel</h2>
            <p>
              Independent recorded stages; no intermediate stage is inferred.
              Conditional conversion counts properties with both stages.
            </p>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Properties reached</th>
                  <th>From prior stage</th>
                  <th>Of received cohort</th>
                </tr>
              </thead>
              <tbody>
                {data.funnel.map((f: Data) => (
                  <tr key={f.stage}>
                    <th>{label(f.stage)}</th>
                    <td>{f.reached}</td>
                    <td>{ratio(f)}</td>
                    <td>{ratio(f.cohort)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="text-xl">USD outcomes and fees</h2>
            <p>
              {data.closedTransactions} currently closed transactions · known
              volume {money(data.closedVolumeCents)} ·{" "}
              {data.unknownClosingVolumes} closing volumes unrecorded
            </p>
            <p>
              Projected {money(data.projectedFeesCents)} · invoiced{" "}
              {money(data.invoicedFeesCents)} · received{" "}
              {money(data.receivedFeesCents)} · refunded{" "}
              {money(data.refundedFeesCents)} · net received{" "}
              {money(data.receivedFeesCents - data.refundedFeesCents)}
            </p>
            <p>
              Amounts are recorded evidence, not payment processing. Existing
              fee-due/paid snapshots do not establish receipt amounts. Totals
              are lifetime recorded amounts for the selected received cohort.
            </p>
          </section>
          <section>
            <h2 className="text-xl">Stage timing and bottlenecks</h2>
            {data.intervals.map((i: Data) => (
              <p key={i.to}>
                {label(i.from)} → {label(i.to)}:{" "}
                {i.averageDays === null
                  ? "Insufficient data"
                  : `${i.averageDays.toFixed(1)} days`}{" "}
                ({i.samples} dated transaction pairs)
              </p>
            ))}
            {Object.entries(data.reasons).map(([reason, count]) => (
              <p key={reason}>
                {label(reason)}: {String(count)}
              </p>
            ))}
          </section>
          <section>
            <h2 className="text-xl">Transaction ledger</h2>
            <select
              className={input}
              aria-label="Transaction"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a transaction</option>
              {data.rows.map((r: Data) => (
                <option key={r.id} value={r.id}>
                  {r.address} · {r.id.slice(0, 8)} · {r.outcome}
                </option>
              ))}
            </select>
            {row && (
              <div className="space-y-2">
                <Link to={`/app/buyermatch/deals/${row.id}`}>
                  Open original deal
                </Link>
                <p>
                  {row.market} · source {row.identity.source || "Unattributed"}{" "}
                  · JV {row.identity.jvPartner || "Unattributed"}
                </p>
                <p>
                  {row.eligibleMatches ?? "Unknown"} eligible matches (
                  {row.matchVersion || "no recorded analysis"}) ·{" "}
                  {row.recipients} delivered recipients · {row.responses}{" "}
                  responding buyers · {row.interestedBuyers} buyers with
                  recorded interest in the conversion window
                </p>
                <p>Preserved submissions: {row.submissionIds.join(", ")}</p>
                <ul>
                  {row.recommendations.map((r: string) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <h3>Offers, EMD and closing records</h3>
                {row.existingOffers.map((e: Data) => (
                  <p key={e.id}>
                    Existing offer {e.offerRef}: {money(e.amountCents)} · {e.at}{" "}
                    · written evidence unconfirmed
                  </p>
                ))}
                {row.writtenOffers.map((e: Data) => (
                  <p key={e.id}>
                    Written offer {e.offerRef}: {money(e.amountCents)} · {e.at}{" "}
                    · buyer reference {e.counterpartyRef}
                  </p>
                ))}
                {row.offerStatuses.map((e: Data) => (
                  <p key={e.id}>
                    Offer {e.offerRef}: {e.status} · {e.at}
                  </p>
                ))}
                {row.emd.map((e: Data) => (
                  <p key={e.id}>
                    {label(e.kind)} · {e.offerRef} ·{" "}
                    {e.amountCents ? money(e.amountCents) : "amount unverified"}{" "}
                    · {e.at}
                  </p>
                ))}
                {row.closings.map((c: Data, i: number) => (
                  <p key={i}>
                    Existing closing: scheduled {c.scheduled_date || "unknown"}{" "}
                    · verified {c.verified_at || "unverified"} · fee due{" "}
                    {c.fee_due_cents === null
                      ? "unknown"
                      : money(c.fee_due_cents)}
                    . Receipt amount not inferred.
                  </p>
                ))}
                <details>
                  <summary>Dated event and source history</summary>
                  <ol>
                    {row.history.map((e: Data) => (
                      <li key={e.id}>
                        {e.at} · {label(e.kind)} · {e.origin} ·{" "}
                        {e.evidenceRef || e.id}
                        {e.origin === "owner_evidence"
                          ? ` · event UUID ${e.id}`
                          : ""}
                        {e.reason ? ` · ${label(e.reason)}` : ""}
                        {e.voided ? " · corrected/voided (retained)" : ""}
                        {e.recordedAt ? ` · recorded ${e.recordedAt}` : ""}
                        {e.outsideObservationWindow
                          ? " · outside conversion window"
                          : ""}
                        {e.kind === "identity"
                          ? ` · source ${e.source} · JV ${e.jvPartner || "Unattributed"} · original CRM reference ${e.crmDealRef || "unrecorded"}`
                          : ""}
                        {e.scheduledDate
                          ? ` · scheduled closing ${e.scheduledDate}`
                          : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </section>
          <section>
            <h2 className="text-xl">Record verified evidence</h2>
            <p>
              No email addresses, buyer names, bank details, credentials or
              document URLs. Use opaque internal evidence/receipt references.
              Recording an outcome does not send buyers anything or collect
              fees.
            </p>
            <form
              className="grid sm:grid-cols-3 gap-3"
              onSubmit={(e) => void record(e)}
            >
              <label>
                Event
                <select
                  className={input}
                  value={form.kind}
                  onChange={(e) => {
                    setForm({ ...form, kind: e.target.value });
                    setConfirmed(false);
                  }}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                "occurredAt",
                "Actual occurrence date/time",
                true,
                "datetime-local",
              )}
              {field("evidenceRef", "Opaque evidence reference")}
              {form.kind === "identity" &&
                [
                  "unit",
                  "parcelRef",
                  "contractRef",
                  "interestRef",
                  "transactionRef",
                  "source",
                  "jvPartner",
                  "market",
                  "crmDealRef",
                ].map((k) =>
                  field(
                    k,
                    k === "unit"
                      ? "Unit (use whole for entire parcel)"
                      : label(k),
                    !["parcelRef", "jvPartner", "crmDealRef"].includes(k),
                  ),
                )}
              {[
                "written_offer",
                "emd_pending",
                "emd_confirmed",
                "emd_failed",
                "offer_status",
              ].includes(form.kind) && field("offerRef", "Offer reference")}
              {["interested", "written_offer"].includes(form.kind) &&
                field("counterpartyRef", "Opaque buyer/counterparty reference")}
              {[
                "written_offer",
                "emd_confirmed",
                "closed",
                "fee_projected",
                "fee_invoiced",
                "fee_received",
                "fee_refunded",
              ].includes(form.kind) &&
                field(
                  "amount",
                  form.kind === "closed"
                    ? "Actual closing volume (USD)"
                    : "Amount (USD)",
                )}
              {form.kind === "void" &&
                field("eventId", "Event UUID to correct")}
              {form.kind === "closing_scheduled" &&
                field("scheduledDate", "Scheduled closing date", true, "date")}
              {[
                "lost",
                "stalled",
                "withdrawn",
                "canceled",
                "reopened",
                "emd_failed",
                "void",
              ].includes(form.kind) && (
                <label>
                  Recorded reason
                  <select
                    className={input}
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value })
                    }
                  >
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {form.kind === "emd_confirmed" && (
                <label>
                  Verification source
                  <select
                    className={input}
                    value={form.verifier}
                    onChange={(e) =>
                      setForm({ ...form, verifier: e.target.value })
                    }
                  >
                    {["title", "escrow", "bank"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              {form.kind === "offer_status" && (
                <label>
                  Offer status
                  <select
                    className={input}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    {["accepted", "rejected", "withdrawn"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                I verified the actual evidence, date, amount and selected
                transaction.
              </label>
              <button
                className="btn btn-green"
                disabled={busy || !row || !confirmed}
              >
                Append evidence
              </button>
            </form>
          </section>
          <section>
            <h2 className="text-xl">Duplicate review</h2>
            {data.moreDuplicateCandidates && (
              <p role="status">
                More than 200 duplicate candidates: narrow the received-date,
                market or source filters before reviewing additional pairs.
              </p>
            )}
            <p>
              Same address is only a candidate. Merging requires matching unit,
              property, contract, ownership interest and transaction references;
              originals and audit history remain intact.
            </p>
            {data.duplicateCandidates.map((c: Data) => (
              <div className="border p-3" key={`${c.sourceId}:${c.targetId}`}>
                {c.address} · {c.sourceId.slice(0, 8)} →{" "}
                {c.targetId.slice(0, 8)} ·{" "}
                {c.safeToMerge
                  ? "Identities agree; owner review required"
                  : "Do not merge: incomplete or distinct transaction identity"}
                <label>
                  <input
                    type="checkbox"
                    checked={reviewedPair === `${c.sourceId}:${c.targetId}`}
                    onChange={(e) =>
                      setReviewedPair(
                        e.target.checked ? `${c.sourceId}:${c.targetId}` : "",
                      )
                    }
                  />{" "}
                  I reviewed both original submissions and verified the same
                  unit, contract, interest and transaction.
                </label>
                <button
                  className="btn btn-ghost"
                  disabled={
                    busy ||
                    reviewedPair !== `${c.sourceId}:${c.targetId}` ||
                    !c.safeToMerge
                  }
                  onClick={() =>
                    void write("conversion-review", {
                      sourceId: c.sourceId,
                      targetId: c.targetId,
                      reason: "same_submission",
                    })
                  }
                >
                  Confirm duplicate association
                </button>
              </div>
            ))}
            {row?.submissionIds
              .filter((id: string) => id !== row.id)
              .map((id: string) => (
                <button
                  className="btn btn-ghost"
                  key={id}
                  disabled={busy || !confirmed}
                  onClick={() =>
                    void write("conversion-review", {
                      sourceId: id,
                      targetId: null,
                      reason: "incorrect_merge",
                    })
                  }
                >
                  Unmerge preserved submission {id.slice(0, 8)}
                </button>
              ))}
          </section>
        </>
      )}
    </div>
  );
}
