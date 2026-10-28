// Operator only: never creates subscriptions, reads buyer data or opens Portal.
import { createHash } from "node:crypto";
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";
const deny = () => {
  throw Error(
    "Campaign subscription cleanup UNVERIFIED; no automatic mutation retry",
  );
};
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function subscriptionEvidenceScope(plan) {
  return {
    source: plan.source,
    runId: plan.runId,
    mode: plan.mode,
    account: plan.account,
    owner: plan.owner,
  };
}
export async function closeCampaignSubscription(
  plan,
  owned,
  ports,
  operatorSource,
  signal,
) {
  try {
    return await closeScopedSubscription(
      structuredClone(plan),
      structuredClone(owned),
      ports,
      operatorSource,
      signal,
    );
  } catch {
    deny();
  }
}
async function closeScopedSubscription(
  plan,
  owned,
  ports,
  operatorSource,
  signal,
) {
  if (
    plan.profile !== "activation" ||
    !/^[a-f0-9]{40}$/.test(operatorSource || "")
  )
    deny();
  if (
    plan.account !== S2.account ||
    plan.database !== S2.staging ||
    plan.project !== S2.project ||
    plan.team !== S2.team ||
    plan.endpoint !== S2.endpoint ||
    !Array.isArray(owned.checkouts) ||
    owned.checkouts.length > 1 ||
    owned.source !== plan.source ||
    owned.runId !== plan.runId ||
    owned.checkouts.some(
      (c) =>
        !/^cs_test_[A-Za-z0-9]+$/.test(c.id || "") ||
        !/^[a-f0-9-]{36}$/.test(c.checkoutId || ""),
    )
  )
    deny();
  for (const name of [
    "readSubscriptionEvidence",
    "claimSubscriptionCancellation",
    "readApproval",
    "readAuthority",
    "stripeRequest",
    "readCheckoutPolicy",
  ])
    if (typeof ports[name] !== "function") deny();
  const scope = subscriptionEvidenceScope(plan);
  const matches = (value) =>
    value && Object.entries(scope).every(([k, v]) => value[k] === v);
  const consent = await ports.readApproval(hash(plan), signal);
  if (
    consent?.approved !== true ||
    consent.planDigest !== hash(plan) ||
    consent.mode !== plan.mode ||
    consent.scope !== "subscription-activation" ||
    consent.cleanupOperatorSource !== operatorSource ||
    consent.cancelCampaignCreatedTestSubscription !== true
  )
    deny();
  const authority = async () => {
    if (signal?.aborted) deny();
    const a = await ports.readAuthority(signal);
    if (
      a?.account !== plan.account ||
      a.project !== plan.project ||
      a.team !== plan.team ||
      a.database !== plan.database ||
      a.endpoint !== plan.endpoint ||
      a.livemode !== false ||
      a.ownerAuthorized !== true
    )
      deny();
  };
  const request = async (method, path, body) => {
    await authority();
    try {
      return await ports.stripeRequest({
        method,
        path,
        body,
        account: plan.account,
        mode: "test",
        signal,
        retries: 0,
      });
    } catch {
      deny();
    }
  };
  await authority();
  const policy = await ports.readCheckoutPolicy(signal);
  if (
    policy?.source !== plan.source ||
    policy.runId !== plan.runId ||
    policy.issuanceJournalComplete !== true ||
    policy.inflightReconciled !== true ||
    !Array.isArray(policy.sessionIds) ||
    policy.sessionIds.length !== owned.checkouts.length ||
    [...policy.sessionIds].sort().join("|") !==
      owned.checkouts
        .map((c) => c.id)
        .sort()
        .join("|")
  )
    deny();
  // Evidence reader must read immutable fsynced records, not an in-memory assertion.
  let evidence = await ports.readSubscriptionEvidence(plan, signal);
  const base = evidence?.baseline;
  let created = evidence?.creation;
  if (
    !matches(base) ||
    evidence.durable !== true ||
    evidence.baselineSha256 !== hash(base) ||
    !Number.isSafeInteger(base.observedAt) ||
    base.observedAt > plan.startedAt ||
    !Array.isArray(base.subscriptionIds) ||
    base.subscriptionIds.some((id) => !/^sub_[A-Za-z0-9]+$/.test(id)) ||
    new Set(base.subscriptionIds).size !== base.subscriptionIds.length
  )
    deny();
  const validateCreation = () => {
    if (
      created &&
      (!matches(created) ||
        evidence.creationSha256 !== hash(created) ||
        created.baselineSha256 !== hash(base) ||
        !/^sub_[A-Za-z0-9]+$/.test(created.subscription) ||
        !/^cus_[A-Za-z0-9]+$/.test(created.customer) ||
        !owned.checkouts.some(
          (c) =>
            c.id === created.session && c.checkoutId === created.checkoutId,
        ) ||
        !Number.isSafeInteger(created.recordedAt) ||
        created.recordedAt < plan.startedAt ||
        base.subscriptionIds.includes(created.subscription))
    )
      deny();
  };
  validateCreation();
  let discovered = null;
  for (const checkout of owned.checkouts) {
    const s = await request("GET", "/v1/checkout/sessions/" + checkout.id);
    if (
      s?.id !== checkout.id ||
      s.livemode !== false ||
      s.mode !== "subscription" ||
      s.client_reference_id !== plan.owner ||
      s.metadata?.dealBlastUserId !== plan.owner ||
      s.metadata?.dbpProduct !== "buyermatch" ||
      s.metadata?.dbpCheckoutId !== checkout.checkoutId ||
      s.metadata?.dbpS2RunId !== plan.runId ||
      !Number.isSafeInteger(s.created) ||
      s.created * 1000 < plan.startedAt ||
      s.created * 1000 > plan.expiresAt ||
      !["expired", "complete"].includes(s.status)
    )
      deny();
    if (s.status === "complete") {
      if (!created) {
        if (
          typeof ports.recordSubscriptionCreation !== "function" ||
          !/^sub_[A-Za-z0-9]+$/.test(s.subscription || "") ||
          !/^cus_[A-Za-z0-9]+$/.test(s.customer || "") ||
          s.payment_status !== "paid" ||
          s.amount_total !== 11900 ||
          s.currency !== "usd" ||
          base.subscriptionIds.includes(s.subscription)
        )
          deny();
        const ack = await ports.recordSubscriptionCreation({
          subscription: s.subscription,
          customer: s.customer,
          session: s.id,
          checkoutId: checkout.checkoutId,
        });
        if (ack?.durable !== true) deny();
        evidence = await ports.readSubscriptionEvidence(plan, signal);
        created = evidence.creation;
        if (!created || evidence.baselineSha256 !== hash(base)) deny();
        validateCreation();
      }
      if (
        !created ||
        s.id !== created.session ||
        s.subscription !== created.subscription ||
        s.customer !== created.customer ||
        s.payment_status !== "paid" ||
        s.amount_total !== 11900 ||
        s.currency !== "usd"
      )
        deny();
      discovered = created;
    } else if (s.subscription || created) deny();
  }
  if (!discovered) {
    if (created) deny();
    return { verified: true };
  }
  const path = "/v1/subscriptions/" + discovered.subscription;
  const validate = (s) => {
    if (
      s?.id !== discovered.subscription ||
      s.livemode !== false ||
      s.customer !== discovered.customer ||
      s.metadata?.dealBlastUserId !== plan.owner ||
      s.metadata?.dbpProduct !== "buyermatch" ||
      s.metadata?.dbpCheckoutId !== discovered.checkoutId ||
      s.metadata?.dbpS2RunId !== plan.runId ||
      !Number.isSafeInteger(s.created) ||
      s.created * 1000 < plan.startedAt ||
      s.created * 1000 > plan.expiresAt ||
      ![
        "active",
        "past_due",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "canceled",
      ].includes(s.status) ||
      s.items?.has_more !== false ||
      s.items.data?.length !== 1 ||
      s.items.data[0].quantity !== 1 ||
      s.items.data[0].price?.id !== S2.pro
    )
      deny();
  };
  const customer = await request("GET", "/v1/customers/" + discovered.customer);
  if (
    customer?.id !== discovered.customer ||
    customer.livemode !== false ||
    customer.deleted ||
    !Number.isSafeInteger(customer.created) ||
    customer.created * 1000 < plan.startedAt ||
    customer.created * 1000 > plan.expiresAt
  )
    deny();
  const before = await request("GET", path);
  validate(before);
  // Stripe cancellation can stop collection of finalized invoices on the entire
  // customer. Refuse shared billing customers, including any existing CRM use.
  const query =
    "?" + new URLSearchParams({ customer: discovered.customer, limit: "100" });
  const related = await request(
    "GET",
    "/v1/subscriptions" + query + "&status=all",
  );
  const invoices = await request("GET", "/v1/invoices" + query);
  if (
    related?.has_more !== false ||
    !Array.isArray(related.data) ||
    related.data.length !== 1 ||
    related.data[0].id !== discovered.subscription ||
    invoices?.has_more !== false ||
    !Array.isArray(invoices.data) ||
    invoices.data.length > 1 ||
    invoices.data.some(
      (i) =>
        i.livemode !== false ||
        i.customer !== discovered.customer ||
        i.status !== "paid" ||
        i.paid !== true ||
        (i.parent?.subscription_details?.subscription || i.subscription) !==
          discovered.subscription,
    )
  )
    deny();
  if (before.status !== "canceled") {
    // Durable create-only claim survives restarts and ambiguous network outcomes.
    // Never repeat DELETE automatically; a later invocation may only verify GET.
    const claim = await ports.claimSubscriptionCancellation(
      plan,
      discovered,
      evidence.creationSha256,
      signal,
    );
    if (claim?.claimed !== true) deny();
    await authority();
    const freshConsent = await ports.readApproval(hash(plan), signal);
    if (
      freshConsent?.approved !== true ||
      freshConsent.planDigest !== hash(plan) ||
      freshConsent.cleanupOperatorSource !== operatorSource ||
      freshConsent.cancelCampaignCreatedTestSubscription !== true ||
      freshConsent.scope !== "subscription-activation" ||
      freshConsent.mode !== plan.mode
    )
      deny();
    try {
      await request("DELETE", path, { invoice_now: false, prorate: false });
    } catch {
      /* Read back only this exact object; no automatic second mutation. */
    }
  }
  const after = await request("GET", path);
  validate(after);
  if (
    after.status !== "canceled" ||
    !Number.isSafeInteger(after.canceled_at) ||
    after.canceled_at * 1000 < plan.startedAt
  )
    deny();
  return { verified: true };
}
