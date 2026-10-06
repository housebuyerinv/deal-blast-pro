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
  const [conversation, setConversation] = useState<{address: string; city: string; state: string; messages: {sender: string; body: string; createdAt: string}[]} | null>(null);
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
      setConversation(null);
      setBusy(false);
    };
    window.history.replaceState(null, "", window.location.pathname);
    window.addEventListener("hashchange", reopen);
    return () => {
      generation.current += 1;
      window.removeEventListener("hashchange", reopen);
    };
  }, []);
  async function loadConversation() {
    const started = generation.current;
    setBusy(true);
    try {
      const response = await fetch('/api/buyermatch-response', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, operationKey: crypto.randomUUID(), kind: 'conversation' }) });
      const data = await response.json();
      if (!response.ok) throw new Error('This conversation is unavailable. Reopen your invitation or contact the deal team.');
      if (started === generation.current) setConversation(data);
    } catch (error: any) {
      if (started === generation.current) { setConversation(null); setMessage(error.message); }
    } finally { if (started === generation.current) setBusy(false); }
  }
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
            : kind === "message"
              ? { terms }
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
          : kind === "message"
            ? "Your message has been sent."
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
                  ["message", "Send a message"],
                  ["unsubscribe", "Unsubscribe from the network"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "message" && (
              <label className="block">
                Message
                <textarea
                  className="block w-full bg-slate-800 p-3"
                  maxLength={2000}
                  required
                  value={terms}
                  onChange={(e) => {
                    setTerms(e.target.value);
                    setOperationKey(crypto.randomUUID());
                    setMessage("");
                  }}
                  placeholder="Ask a question or send an update about this deal."
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Messaging becomes available after you express interest or submit an offer.
                </span>
              </label>
            )}
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
        {/^[\w-]{43}$/.test(token) && <button disabled={busy} onClick={() => void loadConversation()} className="rounded border border-slate-600 p-3">View deal & conversation</button>}
        {conversation && <section className="space-y-3" aria-label="Private conversation">
          <h2>{conversation.address} · {conversation.city}, {conversation.state}</h2>
          {!conversation.messages.length && <p>No messages yet.</p>}
          {conversation.messages.map((item, index) => <article key={index} className="rounded bg-slate-900 p-3">
            <p className="text-sm text-slate-400">{item.sender}</p><p className="whitespace-pre-wrap">{item.body}</p>
          </article>)}
        </section>}
      </div>
    </main>
  );
}
