// S2-only provider readers. SQL returns digests and Checkout identifiers, never
// buyer identities/ciphertexts, Auth credentials or Checkout capability URLs.
import { createHash, randomUUID } from "node:crypto";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const deny = () => {
  throw Error("S2 live evidence UNVERIFIED");
};
const tableHash = (t) =>
  `(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by to_jsonb(t)::text),'')) from public.${t} t)`;
export const checkoutReadSql = (plan) =>
  `select coalesce(jsonb_agg(jsonb_build_object('checkoutId',id,'owner',owner_id,'runId',operation_key,'product',product,'tier',plan_version,'id',session_id,'state',state,'createdAt',created_at) order by id),'[]'::jsonb) as rows from public.bm_checkouts where operation_key='${plan.runId}' or (owner_id='${plan.owner}' and created_at>=to_timestamp(${plan.startedAt}/1000.0))`;
export const priorCheckoutReadSql = (plan) =>
  `select coalesce(jsonb_agg(jsonb_build_object('checkoutId',id,'id',session_id) order by id),'[]'::jsonb) as rows from public.bm_checkouts where owner_id='${plan.owner}' and product='buyermatch' and state='pending' and operation_key<>'${plan.runId}' and created_at<to_timestamp(${plan.startedAt}/1000.0)`;
export const PRESERVATION_SQL = `select jsonb_build_object(
 'buyers',(select count(*) from public.bm_buyers),
 'provenance',(select count(*) from public.bm_buyers where nullif(source_ciphertext,'') is not null),
 'nonstandardHashes',(select count(*) from public.bm_buyers where identity_hash !~ '^[a-f0-9]{64}$'),
 'buyerDigest',${tableHash("bm_buyers")},
 'dependenciesDigest',md5(${tableHash("bm_exposures")}||${tableHash("bm_response_tokens")}||${tableHash("bm_outbox")}||${tableHash("bm_duplicate_reviews")}),
 'unrelatedAccountsDigest',md5(${tableHash("account_profiles")}||(select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by to_jsonb(t)::text),'')) from public.bm_entitlements t where not(owner_id='368f5f93-acf7-4cc3-9805-a4c0817506c3' and product='buyermatch')))
 ) as snapshot`;
function validSnapshot(s) {
  if (
    s?.buyers !== 223 ||
    s.provenance !== 9 ||
    s.nonstandardHashes !== 8 ||
    ["buyerDigest", "dependenciesDigest", "unrelatedAccountsDigest"].some(
      (k) => !/^([a-f0-9]{32}|[a-f0-9]{64})$/.test(s[k] || ""),
    ) ||
    Object.keys(s).length !== 6
  )
    deny();
  return s;
}
export function makeLiveBillingReaders(
  input,
  { query, provider, evidence, approvedSource, now = Date.now } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, input.startedAt),
    planDigest = hash(plan);
  if (
    typeof query !== "function" ||
    typeof evidence?.read !== "function" ||
    typeof evidence?.create !== "function" ||
    typeof provider?.listCampaignCheckouts !== "function" ||
    typeof provider?.readIssuancePaused !== "function"
  )
    deny();
  const scope = {
    source: plan.source,
    runId: plan.runId,
    planDigest,
    account: plan.account,
    owner: plan.owner,
  };
  const fresh = async (sql, signal) => {
    const started = now(),
      r = await query(sql, signal);
    if (
      !Array.isArray(r) ||
      r.length !== 1 ||
      !Number.isFinite(Date.parse(r[0].observed_at || "")) ||
      Date.parse(r[0].observed_at) < started - 2000 ||
      now() - Date.parse(r[0].observed_at) > 15000
    )
      deny();
    return r[0];
  };
  const snapshot = async (signal) =>
    validSnapshot((await fresh(PRESERVATION_SQL, signal)).snapshot);
  const readBaseline = async () => {
    const b = await evidence.read("preservation-baseline");
    if (
      Object.entries(scope).some(([k, v]) => b[k] !== v) ||
      !Number.isSafeInteger(b.observedAt) ||
      b.observedAt < plan.startedAt - 300000 ||
      b.observedAt > plan.startedAt ||
      b.snapshotDigest !== hash(b.snapshot)
    )
      deny();
    validSnapshot(b.snapshot);
    return b;
  };
  async function reconcile(signal) {
    if ((await provider.readIssuancePaused(signal)) !== true) deny();
    // Fresh independent DB and Stripe inventories; null session mappings are
    // unresolved even if the launcher's journal says it finished successfully.
    const sql = checkoutReadSql(plan);
    const rows = (await fresh(sql, signal)).rows,
      sessions = await provider.listCampaignCheckouts(signal);
    if (
      !Array.isArray(rows) ||
      rows.length > 1 ||
      !Array.isArray(sessions) ||
      sessions.length > 1 ||
      rows.length !== sessions.length
    )
      deny();
    const checkouts = [];
    for (const r of rows) {
      const s = sessions.find((x) => x.id === r.id);
      if (
        !s ||
        r.owner !== plan.owner ||
        r.runId !== plan.runId ||
        r.product !== "buyermatch" ||
        r.tier !== "buyermatch-pro-v1" ||
        !/^cs_test_[A-Za-z0-9]+$/.test(r.id || "") ||
        !/^[a-f0-9-]{36}$/.test(r.checkoutId || "") ||
        !["pending", "completed", "expired"].includes(r.state) ||
        Date.parse(r.createdAt) < plan.startedAt ||
        Date.parse(r.createdAt) > plan.expiresAt ||
        s.livemode !== false ||
        s.mode !== "subscription" ||
        s.client_reference_id !== plan.owner ||
        s.metadata?.dealBlastUserId !== plan.owner ||
        s.metadata?.dbpS2RunId !== plan.runId ||
        s.metadata?.dbpCheckoutId !== r.checkoutId ||
        s.metadata?.dbpProduct !== "buyermatch" ||
        s.created * 1000 < Math.floor(plan.startedAt / 1000) * 1000 ||
        s.created * 1000 > plan.expiresAt ||
        !["open", "expired", "complete"].includes(s.status)
      )
        deny();
      checkouts.push({ id: r.id, checkoutId: r.checkoutId });
    }
    if ((await provider.readIssuancePaused(signal)) !== true) deny();
    const receipt = { source: plan.source, runId: plan.runId, checkouts };
    // Reconciliation records append with create-only names. No receipt overwrite,
    // no trust in stale cached files and no record of provider capability URLs.
    await evidence.create(
      "checkout-observation-" + now() + "-" + randomUUID(),
      { ...scope, observedAt: now(), receipt },
    );
    return receipt;
  }
  return {
    async verifyNoPriorUnreconciledCheckout(signal) {
      const rows = (await fresh(priorCheckoutReadSql(plan), signal)).rows;
      if (
        !Array.isArray(rows) ||
        rows.length > 100 ||
        typeof provider.readPriorCheckoutStates !== "function"
      )
        deny();
      const statuses = await provider.readPriorCheckoutStates(rows, signal);
      if (
        !Array.isArray(statuses) ||
        statuses.length !== rows.length ||
        statuses.some((s) => !["expired", "complete"].includes(s))
      )
        deny();
      return { verified: true };
    },
    async capturePreservationBaseline(signal) {
      const s = await snapshot(signal),
        observedAt = now();
      if (observedAt > plan.startedAt) deny();
      if (typeof provider.readSubscriptionSentinels !== "function") deny();
      const stripeDigest = hash(
        await provider.readSubscriptionSentinels(signal),
      );
      await evidence.create("preservation-baseline", {
        ...scope,
        observedAt,
        snapshot: s,
        snapshotDigest: hash(s),
        stripeDigest,
      });
      return s;
    },
    readPreservation: snapshot,
    readCheckoutReceipt: async (requested, signal) => {
      if (hash(requested) !== planDigest) deny();
      return reconcile(signal);
    },
    readCheckoutPolicy: async (signal) => {
      const receipt = await reconcile(signal);
      return {
        source: plan.source,
        runId: plan.runId,
        issuanceJournalComplete: true,
        inflightReconciled: true,
        sessionIds: receipt.checkouts.map((r) => r.id),
      };
    },
    verifyPreservation: async (requested, signal) => {
      if (hash(requested) !== planDigest) deny();
      const before = await readBaseline(),
        current = await snapshot(signal);
      if (
        hash(current) !== before.snapshotDigest ||
        typeof provider.readSubscriptionSentinels !== "function" ||
        hash(await provider.readSubscriptionSentinels(signal)) !==
          before.stripeDigest
      )
        deny();
      return { verified: true, unchanged: true, planDigest };
    },
  };
}
