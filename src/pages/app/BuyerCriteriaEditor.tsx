type Criteria = Record<string, any>;
const input =
  "w-full rounded border border-slate-700 bg-slate-950 p-2 text-white";
export default function BuyerCriteriaEditor({
  value,
  onChange,
}: {
  value: Criteria;
  onChange: (value: Criteria) => void;
}) {
  const update = (key: string, next: any) =>
    onChange({ ...value, [key]: next });
  const label = (key: string) =>
    key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="space-y-4">
      <h4>Buyer criteria</h4>
      <p className="text-sm text-slate-400">
        Blank criteria remain unknown. Markets are alternatives; city and ZIP
        restrictions apply together within each market.
      </p>
      {(value.markets || []).map((market: Criteria, index: number) => (
        <fieldset
          key={index}
          className="border border-slate-700 p-3 grid sm:grid-cols-3 gap-3"
        >
          <legend>Market {index + 1}</legend>
          {["state", "city", "zips"].map((key) => (
            <label key={key}>
              {key === "zips" ? "ZIP codes (comma separated)" : label(key)}
              <input
                className={input}
                value={
                  key === "zips"
                    ? (market.zips || []).join(", ")
                    : market[key] || ""
                }
                onChange={(e) =>
                  update(
                    "markets",
                    value.markets.map((m: Criteria, i: number) =>
                      i === index
                        ? {
                            ...m,
                            [key]:
                              key === "zips"
                                ? e.target.value
                                    .split(",")
                                    .map((x) => x.trim())
                                    .filter(Boolean)
                                : e.target.value || undefined,
                          }
                        : m,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() =>
              update(
                "markets",
                value.markets.filter((_: Criteria, i: number) => i !== index),
              )
            }
          >
            Remove market
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="underline"
        onClick={() =>
          update("markets", [...(value.markets || []), { state: "" }])
        }
      >
        Add market
      </button>
      <fieldset>
        <legend>Property types</legend>
        <div className="flex flex-wrap gap-4">
          {[
            "sfh",
            "condo",
            "townhouse",
            "land",
            "multifamily",
            "commercial",
            "stnl",
          ].map((type) => (
            <label key={type} className="flex gap-2">
              <input
                type="checkbox"
                checked={(value.assetTypes || []).includes(type)}
                onChange={(e) =>
                  update(
                    "assetTypes",
                    e.target.checked
                      ? [...(value.assetTypes || []), type]
                      : (value.assetTypes || []).filter(
                          (x: string) => x !== type,
                        ),
                  )
                }
              />
              {type}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          "minPrice",
          "maxPrice",
          "maxArvRatio",
          "maxRepairs",
          "minBeds",
          "minBaths",
          "minSqft",
          "maxSqft",
          "minUnits",
          "maxUnits",
          "minCapRate",
          "minNoi",
          "minLeaseYears",
          "minDebtServiceCoverage",
        ].map((key) => (
          <label key={key}>
            {key === "maxArvRatio" ? "Max ARV ratio (0–1)" : label(key)}
            <input
              className={input}
              type="number"
              min="0"
              step="any"
              value={value[key] ?? ""}
              onChange={(e) =>
                update(
                  key,
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          "conditions",
          "occupancies",
          "dealTypes",
          "financingPreferences",
          "excludedZips",
          "excludedCities",
          "excludedConditions",
          "excludedOccupancies",
        ].map((key) => (
          <label key={key}>
            {label(key)} (semicolon separated)
            <input
              className={input}
              value={(value[key] || []).join("; ")}
              onChange={(e) =>
                update(
                  key,
                  e.target.value
                    .split(";")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
