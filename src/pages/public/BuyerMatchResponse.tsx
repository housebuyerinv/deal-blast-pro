import { useEffect, useRef, useState } from "react";
export default function BuyerMatchResponse() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const generation = useRef(0);
  const [kind, setKind] = useState("interested");
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const reopen = () => {
      generation.current += 1;
      setToken(window.location.hash.slice(1));
      window.history.replaceState(null, "", window.location.pathname);
      setKind("interested");
      setAmount("");
      setTerms("");
      setOperationKey(crypto.randomUUID());
      setMessage("");
      setBusy(false);
    };
    window.history.replaceState(null, "", window.location.pathname);
    window.addEventListener("hashchange", reopen);
    return () => {
      generation.current += 1;
      window.removeEventListener("hashchange", reopen);
    };
  }, []);
  async function submit() {
    const started = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await fetch("/api/buyermatch-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          operationKey,
          kind,
          ...(kind === "offer"
            ? { amountCents: Math.round(Number(amount) * 100), terms }
            : {}),
        }),
      });
      const data = await result.json().catch(() => {
        throw new Error("Response service is unavailable. Please try again.");
      });
      if (!result.ok || data?.recorded !== true)
        throw new Error(data?.error || "Your response could not be recorded.");
      if (started !== generation.current) return;
      setMessage(
        kind === "unsubscribe"
          ? "You have been opted out of this network."
          : "Your response has been recorded.",
      );
    } catch (e: any) {
      if (started === generation.current)
        setMessage(e.message || "Response unavailable");
    } finally {
      if (started === generation.current) setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-lg mx-auto space-y-5">
        <h1 className="text-2xl">DBP Private Network response</h1>
        <p>
          This private link is limited to the deal you received. Do not forward
          it.
        </p>
        {!/^[\w-]{43}$/.test(token) ? (
          <p role="alert">
            Open the complete response link from your deal invitation.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            <label className="block">
              Response
              <select
                className="block w-full bg-slate-800 p-3"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setOperationKey(crypto.randomUUID());
                  setMessage("");
                }}
              >
                {[
                  ["interested", "Interested"],
                  ["offer", "Submit offer"],
                  ["declined", "Pass on this deal"],
                  ["unsubscribe", "Unsubscribe from the network"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "offer" && (
              <>
                <label className="block">
                  Offer amount ($)
                  <input
                    className="block w-full bg-slate-800 p-3"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setOperationKey(crypto.randomUUID());
                      setMessage("");
                    }}
                  />
                </label>
                <label className="block">
                  Offer terms
                  <textarea
                    className="block w-full bg-slate-800 p-3"
                    maxLength={2000}
                    value={terms}
                    onChange={(e) => {
                      setTerms(e.target.value);
                      setOperationKey(crypto.randomUUID());
                      setMessage("");
                    }}
                  />
                </label>
              </>
            )}
            <button
              disabled={busy}
              className="rounded bg-emerald-500 px-4 py-2 text-black"
            >
              {busy ? "Recording…" : "Submit response"}
            </button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </main>
  );
}
