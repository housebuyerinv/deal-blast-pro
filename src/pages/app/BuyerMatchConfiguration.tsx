import { useState } from "react";
type Data = Record<string, any>;
const input =
  "w-full rounded border border-slate-700 bg-slate-950 p-2 text-white";
export default function BuyerMatchConfiguration({
  request,
}: {
  request: (action: string, data: Data) => Promise<any>;
}) {
  const [kind, setKind] = useState("plan");
  const [value, setValue] = useState<Data>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const field = (key: string, label: string, type = "text") => (
    <label key={key} className="block">
      {label}
      <input
        className={input}
        type={type}
        value={value[key] ?? ""}
        onChange={(e) =>
          setValue({
            ...value,
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
  const select = (key: string, label: string, options: string[]) => (
    <label>
      {label}
      <select
        className={input}
        value={value[key] || ""}
        onChange={(e) => setValue({ ...value, [key]: e.target.value })}
      >
        <option value="">Select…</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      let config: Data;
      if (kind === "plan")
        config = {
          version: value.version,
          label: value.label,
          product: value.product,
          allowance: value.allowance,
          stripe_price_id: value.stripe_price_id || null,
          approved: Boolean(value.approved),
        };
      else if (kind === "document")
        config = {
          kind: value.documentKind,
          version: value.version,
          content: value.content,
          approved: Boolean(value.approved),
        };
      else if (kind === "entitlement")
        config = {
          owner_id: value.owner_id,
          product: value.product,
          plan_version: value.plan_version,
          status: value.status,
          period_start: new Date(value.period_start).toISOString(),
          period_end: new Date(value.period_end).toISOString(),
        };
      else
        config = {
          state: value.state,
          plan_version: value.plan_version,
          version: value.version,
          approved: Boolean(value.approved),
          document_id: value.document_id,
          formula: {
            mode: value.mode,
            fixedCents: value.fixedCents,
            basisPoints: value.basisPoints,
            minimumCents: value.minimumCents,
            maximumCents: value.maximumCents,
          },
        };
      await request("admin-configure", { kind, config });
      setMessage(
        "Saved. Live billing, real buyer sends and success fees remain disabled.",
      );
      setValue({});
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border border-slate-700 rounded-xl p-5">
      <summary className="text-xl cursor-pointer">
        Plans, agreements & fee policies
      </summary>
      <div className="space-y-3 mt-4">
        <p className="text-sm text-slate-400">
          Publish only approved limits and exact reviewed documents. Changes
          create new versions. This form cannot activate charges or sending.
        </p>
        <label>
          Configure
          <select
            className={input}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setValue({});
            }}
          >
            {["plan", "entitlement", "document", "fee_policy"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {["plan", "document", "fee_policy"].includes(kind) &&
          field("version", "Version")}
        {["plan", "entitlement"].includes(kind) &&
          select("product", "Product", ["buyermatch", "network"])}
        {kind === "plan" && (
          <>
            {field("label", "Plan name")}
            {field("allowance", "Operations per billing period", "number")}
            {field(
              "stripe_price_id",
              "Approved Stripe sandbox price ID (optional)",
            )}
          </>
        )}
        {kind === "entitlement" && (
          <>
            {field("owner_id", "Account user ID")}
            {field("plan_version", "Approved plan version")}
            {select("status", "Access", ["active", "inactive"])}
            {field("period_start", "Period start", "datetime-local")}
            {field("period_end", "Period end", "datetime-local")}
          </>
        )}
        {kind === "document" && (
          <>
            {select("documentKind", "Document", [
              "platform_terms",
              "privacy",
              "network",
              "fee_schedule",
              "deal_certification",
              "closing_authorization",
            ])}
            <label className="block">
              Exact reviewed document text
              <textarea
                className={input}
                rows={10}
                value={value.content || ""}
                onChange={(e) =>
                  setValue({ ...value, content: e.target.value })
                }
              />
            </label>
          </>
        )}
        {kind === "fee_policy" && (
          <>
            {field("state", "Property state (two letters)")}
            {field("plan_version", "Network plan version")}
            {field("document_id", "Approved fee document ID")}
            {select("mode", "Calculation", ["fixed", "percentage"])}
            {field("fixedCents", "Fixed amount (cents)", "number")}
            {field(
              "basisPoints",
              "Percentage (basis points: 100 = 1%)",
              "number",
            )}
            {field("minimumCents", "Minimum (cents)", "number")}
            {field("maximumCents", "Cap (cents)", "number")}
          </>
        )}
        {kind !== "entitlement" && (
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={Boolean(value.approved)}
              onChange={(e) =>
                setValue({ ...value, approved: e.target.checked })
              }
            />
            I confirm this version has the required business/legal approval.
          </label>
        )}
        <button
          disabled={busy}
          className="bg-emerald-500 text-black rounded px-4 py-2"
          onClick={() => void save()}
        >
          Save configuration
        </button>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
