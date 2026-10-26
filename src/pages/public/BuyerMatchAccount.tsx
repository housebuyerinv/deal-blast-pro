import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import BuyerCriteriaEditor from "../app/BuyerCriteriaEditor";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

type Criteria = Record<string, unknown>;
type Proof = {
  id: string;
  expiresOn: string;
  createdAt: string;
  status: string;
};
type Account = {
  linked: boolean;
  revision?: number;
  criteria?: Criteria;
  profile?: { name: string; company: string; phone: string };
  status?: string;
  optedOut?: boolean;
  consent?: { version: string; text: string };
  proofs?: Proof[];
};
type HistoryItem = {
  id: string;
  createdAt: string;
  status: string;
  property: { address?: string; city?: string; state?: string };
  responses: { kind: string; createdAt: string }[];
  offers: { amountCents: number; terms: string; createdAt: string }[];
  messages: { sender: string; body: string; createdAt: string }[];
};
type Command = Record<string, unknown>;
type Reply = {
  items?: HistoryItem[];
  next?: { before: string; beforeId: string } | null;
  url?: string;
};
type Run = (input: Command) => Promise<Reply>;

// Presentation is shared with synthetic component tests, never an authentication bypass.
export function BuyerAccountPanel({
  account,
  run,
}: {
  account: Account;
  run: Run;
}) {
  const [criteria, setCriteria] = useState<Criteria>(account.criteria || {});
  const [accurate, setAccurate] = useState(false);
  const [invitations, setInvitations] = useState(false);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(
    account.profile || { name: "", company: "", phone: "" },
  );
  const creationKey = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [next, setNext] = useState<{ before: string; beforeId: string } | null>(
    null,
  );
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const execute = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch {
      if (alive.current)
        setMessage(
          "Result not confirmed. An update may have been saved. Reload the current profile before retrying; do not submit duplicate documents.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const version = () => ({
    operationKey: crypto.randomUUID(),
    revision: account.revision,
  });
  const loadHistory = () =>
    execute(async () => {
      const result = await run({ action: "history", ...(next || {}) });
      if (!alive.current) return;
      setHistory((old) => [...old, ...(result.items || [])]);
      setNext(result.next || null);
      setHistoryLoaded(true);
    });
  return (
    <main id="main-content" className="bm-section bm-buyer-account">
      <p className="bm-eyebrow">BUYERMATCH · PRIVATE BUYER ACCOUNT</p>
      <h1>Your buying profile</h1>
      <p className="bm-lead">
        Maintain your criteria, replace proof of funds and review your delivered
        invitations. No paid CRM or BuyerMatch subscription is required.
      </p>
      <nav className="bm-subnav" aria-label="Buyer account sections">
        <a href="#buyer-profile">Profile</a>
        <a href="#buying-criteria">Criteria</a>
        <a href="#buyer-proof">Proof of funds</a>
        <a href="#buyer-history">Deal &amp; response history</a>
        <Link to="/buyermatch/buyers/help">Buyer guide</Link>
      </nav>
      {message && (
        <p role="status" className="bm-panel">
          {message}
        </p>
      )}
      {!account.linked ? (
        <section className="bm-panel">
          <h2>Connect your existing buyer profile</h2>
          <p>
            Use a valid, delivered invitation sent to your confirmed account
            email. Paste its complete private link or its token below. A public
            submission receipt or email address alone cannot connect a profile.
            Expired or revoked invitations cannot be used. Do not send the link
            to support.
          </p>
          <form
            aria-label="Connect buyer profile"
            onSubmit={(e) => {
              e.preventDefault();
              void execute(async () => {
                let privateToken = token.trim();
                if (!/^[A-Za-z0-9_-]{43}$/.test(privateToken)) {
                  const link = new URL(privateToken);
                  if (
                    link.origin !== window.location.origin ||
                    link.pathname !== "/buyer-response" ||
                    link.search
                  )
                    throw Error("Invalid invitation");
                  privateToken = link.hash.slice(1);
                }
                if (!/^[A-Za-z0-9_-]{43}$/.test(privateToken))
                  throw Error("Invalid invitation");
                await run({ action: "claim", token: privateToken });
                if (alive.current) setToken("");
              });
            }}
          >
            <label>
              Private invitation link or token
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                minLength={43}
                maxLength={2048}
              />
            </label>
            <button className="btn btn-green" disabled={busy}>
              Connect buyer profile
            </button>
          </form>
          <details className="mt-6">
            <summary>Create a new buyer profile</summary>
            <p>
              This creates a new, pending profile for your confirmed account
              email. It will refuse to overwrite or claim an existing matching
              profile. Existing participants should connect their private
              invitation above. New profiles remain subject to the registration
              pause.
            </p>
            <form
              aria-label="New buyer profile"
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  await run({
                    action: "create",
                    operationKey: creationKey.current,
                    name,
                    criteria,
                    accurate,
                    invitations,
                    consentVersion: account.consent?.version,
                  });
                });
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Your name
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <BuyerCriteriaEditor value={criteria} onChange={setCriteria} />
                <p>{account.consent?.text}</p>
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={accurate}
                    onChange={(e) => setAccurate(e.target.checked)}
                  />
                  I confirm the accuracy and storage authorization above.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={invitations}
                    onChange={(e) => setInvitations(e.target.checked)}
                  />
                  I request private deal invitations (optional; review
                  required).
                </label>
                <button
                  className="btn btn-green"
                  disabled={!accurate || !account.consent?.version}
                >
                  Create pending buyer profile
                </button>
              </fieldset>
            </form>
          </details>
          <p>
            Prefer guest intake?{" "}
            <Link to="/buyermatch/buyers">
              Submit initial criteria for review
            </Link>
            . Its receipt cannot grant account access.
          </p>
        </section>
      ) : (
        <>
          <section className="bm-panel" id="buyer-profile">
            <h2>Your buyer profile</h2>
            <p>
              Update your name, company and contact phone privately. Your linked
              identity and verified account email cannot be changed through this
              form. Updates require review and preserve previous consent.
            </p>
            <form
              aria-label="Buyer profile updates"
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  await run({ action: "profile", ...version(), ...profile });
                  if (alive.current)
                    setMessage(
                      "Profile saved for review. Your identity binding and opt-outs are unchanged.",
                    );
                });
              }}
            >
              <fieldset disabled={busy}>
                {(["name", "company", "phone"] as const).map((field) => (
                  <label key={field}>
                    {field === "name"
                      ? "Your name"
                      : field === "company"
                        ? "Company"
                        : "Contact phone"}
                    <input
                      type={field === "phone" ? "tel" : "text"}
                      autoComplete={
                        field === "name"
                          ? "name"
                          : field === "company"
                            ? "organization"
                            : "tel"
                      }
                      required={field === "name"}
                      maxLength={field === "phone" ? 40 : 120}
                      value={profile[field]}
                      onChange={(e) =>
                        setProfile((old) => ({
                          ...old,
                          [field]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <button className="btn btn-green">Save private profile</button>
              </fieldset>
            </form>
          </section>
          <section className="bm-panel" id="buying-criteria">
            <h2>Buying criteria</h2>
            <p>
              Review status: {account.status}. Changes pause matching
              eligibility for review. Existing opt-outs remain in force.
            </p>
            <form
              aria-label="Buying criteria updates"
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  await run({
                    action: "criteria",
                    ...version(),
                    criteria,
                    accurate,
                    invitations,
                    consentVersion: account.consent?.version,
                  });
                  if (alive.current) {
                    setAccurate(false);
                    setMessage(
                      "Criteria saved for review. No delivery was activated.",
                    );
                  }
                });
              }}
            >
              <fieldset disabled={busy}>
                <BuyerCriteriaEditor value={criteria} onChange={setCriteria} />
                <p>{account.consent?.text}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={accurate}
                    onChange={(e) => setAccurate(e.target.checked)}
                    required
                  />
                  I confirm the accuracy and storage authorization above.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={invitations}
                    onChange={(e) => setInvitations(e.target.checked)}
                  />
                  I request private deal invitations (optional; previous
                  opt-outs require reviewed re-enrollment).
                </label>
                <button className="btn btn-green" disabled={!accurate}>
                  Save criteria for review
                </button>
              </fieldset>
            </form>
            <button
              className="btn btn-ghost"
              disabled={busy || account.optedOut}
              onClick={() =>
                void execute(async () => {
                  await run({ action: "withdraw", ...version() });
                  if (alive.current)
                    setMessage(
                      "Invitation consent withdrawn. Pending invitations suppressed.",
                    );
                })
              }
            >
              {account.optedOut
                ? "Invitations opted out"
                : "Stop future invitations"}
            </button>
          </section>
          <section className="bm-panel" id="buyer-proof">
            <h2>Private proof of funds</h2>
            <p>
              PDF, PNG or JPEG, up to 2 MiB. Uploaded documents remain private
              and pending review. Replacements retain previous evidence and
              never automatically verify funds.
            </p>
            <form
              aria-label="Private proof replacement"
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  if (
                    !file ||
                    file.size > 2097152 ||
                    !["application/pdf", "image/png", "image/jpeg"].includes(
                      file.type,
                    )
                  )
                    throw Error("Invalid file");
                  const buffer = new Uint8Array(await file.arrayBuffer());
                  let binary = "";
                  for (const byte of buffer)
                    binary += String.fromCharCode(byte);
                  await run({
                    action: "proof",
                    ...version(),
                    content: btoa(binary),
                    mime: file.type,
                    expiresOn: expiry,
                  });
                  if (alive.current) {
                    setFile(null);
                    setMessage(
                      "Private proof received for review. Previous files retained.",
                    );
                  }
                });
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Replacement document
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                <label>
                  Document expiration date
                  <input
                    type="date"
                    required
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                </label>
                <button className="btn btn-green" disabled={!file}>
                  Upload private replacement
                </button>
              </fieldset>
            </form>
            {!account.proofs?.length ? (
              <p>No self-service proof uploads recorded.</p>
            ) : (
              <ul>
                {account.proofs.map((p) => (
                  <li key={p.id}>
                    Uploaded {new Date(p.createdAt).toLocaleDateString()} ·
                    expires {p.expiresOn} ·{" "}
                    {p.status === "expired"
                      ? "Expired"
                      : p.status === "approved"
                        ? "Document accepted"
                        : p.status === "rejected"
                          ? "Document rejected"
                          : "Pending review"}{" "}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void execute(async () => {
                          const result = await run({
                            action: "proof-link",
                            id: p.id,
                          });
                          if (alive.current && result.url) {
                            const link = document.createElement("a");
                            link.href = result.url;
                            link.rel = "noreferrer";
                            link.referrerPolicy = "no-referrer";
                            link.click();
                          }
                        })
                      }
                    >
                      Download private document
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bm-panel" id="buyer-history">
            <h2>Your deal &amp; response history</h2>
            <p>
              Only invitations actually delivered to your linked buyer identity
              appear. History includes expired invitations; it does not
              reactivate their private response links or show another buyer’s
              conversations.
            </p>
            {history.map((item) => (
              <article key={item.id} className="bm-panel">
                <h3>{item.property.address || "Private invitation"}</h3>
                <p>
                  {item.property.city} {item.property.state} · {item.status} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
                <h4>Responses</h4>
                {!item.responses.length ? (
                  <p>No response recorded.</p>
                ) : (
                  <ul>
                    {item.responses.map((r, i) => (
                      <li key={i}>
                        {r.kind} · {new Date(r.createdAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                )}
                {item.offers.map((offer, i) => (
                  <p key={i}>
                    Offer: ${(offer.amountCents / 100).toLocaleString()} ·{" "}
                    {offer.terms} · {new Date(offer.createdAt).toLocaleString()}
                  </p>
                ))}
                <h4>Private conversation</h4>
                {item.messages.map((m, i) => (
                  <p key={i}>
                    <strong>
                      {m.sender === "buyer" ? "You" : "Deal team"}
                    </strong>
                    : {m.body}{" "}
                    <small>{new Date(m.createdAt).toLocaleString()}</small>
                  </p>
                ))}
                <p>
                  To respond, use the original private invitation while it
                  remains valid.
                </p>
              </article>
            ))}
            {historyLoaded && !history.length && (
              <p>No delivered invitations recorded.</p>
            )}
            {(!historyLoaded || next) && (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void loadHistory()}
              >
                {historyLoaded
                  ? "Load older invitations"
                  : "Load private history"}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default function BuyerMatchAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const generation = useRef(0);
  const loginLock = useRef(false);
  const call = async (input: Command, expected = generation.current) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token || expected !== generation.current)
      throw Error("Sign in required");
    const response = await fetch("/api/buyermatch-buyer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(input),
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (expected !== generation.current) throw Error("Account changed");
    if (!response.ok) throw Error("Unavailable");
    const result = await response.json();
    if (expected !== generation.current) throw Error("Account changed");
    return result;
  };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const current = ++generation.current;
      setAccount(null);
      setLoading(true);
      setError("");
      const { data } = await supabase.auth.getSession();
      if (!active || current !== generation.current) return;
      setSignedIn(!!data.session);
      if (data.session)
        try {
          const result = await call({ action: "account" }, current);
          if (active && current === generation.current) setAccount(result);
        } catch {
          if (active && current === generation.current)
            setError(
              "Private buyer account is unavailable. No data was changed.",
            );
        }
      if (active && current === generation.current) setLoading(false);
    };
    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setAccount(null);
      setPassword("");
      setLoading(true);
      setTimeout(() => {
        if (active) void refresh();
      }, 0);
    });
    // This ref is a request generation counter, not a DOM ref.
    return () => {
      active = false;
      generation.current++; // eslint-disable-line react-hooks/exhaustive-deps
      subscription.unsubscribe();
    };
    // Auth subscription owns this lifecycle; request results are generation-bound.
  }, []);
  const run: Run = async (input) => {
    const current = generation.current;
    const result = await call(input, current);
    if (
      ["create", "claim", "profile", "criteria", "proof", "withdraw"].includes(
        String(input.action),
      )
    ) {
      const latest = await call({ action: "account" }, current);
      if (current === generation.current) setAccount(latest);
    }
    return result;
  };
  return (
    <div className="bm-site">
      <PublicNav />
      {loading ? (
        <main className="bm-section">
          <h1>Loading private buyer account…</h1>
        </main>
      ) : account ? (
        <BuyerAccountPanel
          key={`${generation.current}:${account.linked}`}
          account={account}
          run={run}
        />
      ) : (
        <main id="main-content" className="bm-section bm-buyer-account">
          <h1>Buyer account sign in</h1>
          <p>
            Use your existing confirmed account. Buyer self-service does not
            require a paid subscription. Profile linking also requires your
            private, delivered invitation.
          </p>
          <p>
            Need an account?{" "}
            <Link to="/register?plan=free">Create a free login</Link> through
            the existing confirmation flow, then return here. Registration
            availability applies; this does not purchase a subscription.
          </p>
          {error && <p role="alert">{error}</p>}
          {signedIn ? (
            <button
              className="btn btn-ghost"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          ) : (
            <form
              className="bm-panel"
              onSubmit={async (e) => {
                e.preventDefault();
                if (loginLock.current) return;
                loginLock.current = true;
                setError("");
                try {
                  const { error: failure } =
                    await supabase.auth.signInWithPassword({ email, password });
                  setPassword("");
                  if (failure)
                    setError(
                      "Sign in failed. Check your confirmed account credentials.",
                    );
                } catch {
                  setPassword("");
                  setError("Sign in unavailable.");
                } finally {
                  loginLock.current = false;
                }
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="btn btn-green">Sign in privately</button>
            </form>
          )}
        </main>
      )}
      {signedIn && account && (
        <div className="bm-section">
          <button
            className="btn btn-ghost"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out of buyer account
          </button>
        </div>
      )}
      <PublicFooter />
    </div>
  );
}
