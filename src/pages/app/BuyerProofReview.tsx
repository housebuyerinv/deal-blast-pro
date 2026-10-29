import { useEffect, useRef, useState } from "react";
type Item = {
  id: string;
  buyerId: string;
  expiresOn: string;
  createdAt: string;
  decision: string | null;
};
type Request = (
  action: string,
  data?: Record<string, unknown>,
) => Promise<{ items?: Item[]; next?: string | null; url?: string }>;
export default function BuyerProofReview({ request }: { request: Request }) {
  const [items, setItems] = useState<Item[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const perform = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await task();
    } catch {
      if (alive.current)
        setNotice("Review result not confirmed. Reload before retrying.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const load = async (after?: string) => {
    const result = await request(
      "admin-buyer-proof-queue",
      after ? { after } : {},
    );
    if (alive.current) {
      setItems((old) =>
        after ? [...old, ...(result.items || [])] : result.items || [],
      );
      setNext(result.next || null);
      setLoaded(true);
    }
  };
  return (
    <section className="border border-slate-700 rounded-xl p-5 space-y-4">
      <h2 className="text-xl">Buyer proof replacements</h2>
      <p>
        Owner-only private evidence. Document acceptance does not verify a
        balance, activate a buyer or restore consent. Expired documents cannot
        be accepted; previous proofs and review decisions remain immutable.
      </p>
      {notice && <p role="status">{notice}</p>}
      <button disabled={busy} onClick={() => void perform(() => load())}>
        Load / refresh proof reviews
      </button>
      {loaded && !items.length && <p>No self-service proof uploads.</p>}
      {items.map((item) => (
        <article
          key={item.id}
          className="border border-slate-700 p-3 space-y-2"
        >
          <h3>Buyer {item.buyerId}</h3>
          <p>
            Uploaded {new Date(item.createdAt).toLocaleDateString()} · expires{" "}
            {item.expiresOn} · {item.decision || "Pending review"}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const result = await request("admin-buyer-proof-link", {
                  id: item.id,
                });
                if (alive.current && result.url) {
                  const a = document.createElement("a");
                  a.href = result.url;
                  a.rel = "noreferrer";
                  a.referrerPolicy = "no-referrer";
                  a.click();
                }
              })
            }
          >
            Download private evidence
          </button>
          {!item.decision && (
            <div className="flex flex-wrap gap-3">
              {(["approved", "rejected"] as const).map((decision) => (
                <button
                  key={decision}
                  disabled={
                    busy ||
                    (decision === "approved" &&
                      item.expiresOn <= new Date().toISOString().slice(0, 10))
                  }
                  onClick={() =>
                    void perform(async () => {
                      await request("admin-buyer-proof-review", {
                        id: item.id,
                        decision,
                      });
                      await load();
                      if (alive.current)
                        setNotice(
                          "Review recorded; buyer eligibility and consent unchanged.",
                        );
                    })
                  }
                >
                  {decision === "approved"
                    ? "Accept document"
                    : "Reject document"}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
      {next && (
        <button disabled={busy} onClick={() => void perform(() => load(next))}>
          Load older proof records
        </button>
      )}
    </section>
  );
}
