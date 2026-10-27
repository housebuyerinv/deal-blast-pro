// No credentials/default transport/CLI. Private transports require separate review.
import { z } from "zod";
import { createHash } from "node:crypto";
import { validateBillingPlan } from "./s2-billing-runner.mjs";

const receiptSchema = z
  .object({
    source: z.string().regex(/^[a-f0-9]{40}$/),
    runId: z.string().uuid(),
    checkouts: z
      .array(
        z
          .object({
            id: z.string().regex(/^cs_test_[A-Za-z0-9]+$/),
            checkoutId: z.string().uuid(),
          })
          .strict(),
      )
      .max(1),
  })
  .strict();
const same = (a, p) =>
  a?.project === p.project &&
  a.team === p.team &&
  a.database === p.database &&
  a.account === p.account &&
  a.endpoint === p.endpoint &&
  a.livemode === false &&
  a.ownerAuthorized === true;
const deny = () => {
  throw Error("Billing containment evidence unavailable; no retry");
};

export function makeBillingContainment(input, receipt, ports, approvedSource) {
  // Cleanup remains allowed after expiry; this validates scope, not activation.
  const plan = validateBillingPlan(input, approvedSource, input.startedAt);
  const parsed = receiptSchema.safeParse(receipt);
  if (
    !parsed.success ||
    parsed.data.runId !== plan.runId ||
    parsed.data.source !== plan.source
  )
    deny();
  const owned = parsed.data; // Parsed copy: caller mutation cannot change scope.
  const planDigest = createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");
  for (const method of [
    "readApproval",
    "readAuthority",
    "stripeRequest",
    "pauseReceiver",
    "readReceiverPaused",
    "readPortalPolicy",
    "readCheckoutPolicy",
    "closeRouting",
  ])
    if (typeof ports?.[method] !== "function") deny();
  const authority = async (signal) => {
    if (signal?.aborted) deny();
    const consent = await ports.readApproval(planDigest, signal);
    if (
      consent?.approved !== true ||
      consent.planDigest !== planDigest ||
      consent.mode !== plan.mode ||
      ![
        "payment-free-preflight",
        "subscription-activation",
        "subscription-lifecycle",
      ].includes(consent.scope)
    )
      deny();
    const a = await ports.readAuthority(signal);
    if (!same(a, plan)) deny();
    return a;
  };
  const request = async (method, path, body, signal) => {
    if (signal?.aborted) deny();
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
    } // Raw provider exceptions may contain credentials or URLs.
  };
  const endpointPath = "/v1/webhook_endpoints/" + plan.endpoint;
  const checkEndpoint = (e) => {
    if (
      e?.id !== plan.endpoint ||
      e.livemode !== false ||
      e.url !==
        `https://${plan.database}.supabase.co/functions/v1/stripe-webhook` ||
      !["enabled", "disabled"].includes(e.status)
    )
      deny();
  };
  const checkSession = (s, r) => {
    if (
      s?.id !== r.id ||
      s.livemode !== false ||
      s.mode !== "subscription" ||
      s.client_reference_id !== plan.owner ||
      s.metadata?.dealBlastUserId !== plan.owner ||
      s.metadata?.dbpProduct !== "buyermatch" ||
      s.metadata?.dbpCheckoutId !== r.checkoutId ||
      s.metadata?.dbpS2RunId !== plan.runId ||
      !Number.isSafeInteger(s.created) ||
      s.created * 1000 < Math.floor(plan.startedAt / 1000) * 1000 ||
      s.created * 1000 > plan.expiresAt ||
      !["open", "expired", "complete"].includes(s.status)
    )
      deny();
  };
  const invocation = (_plan) => {
    // The runner passes the plan per call. Refuse changes instead of ignoring it.
    if (
      Object.keys(_plan || {}).length !== Object.keys(plan).length ||
      Object.entries(plan).some(([k, v]) => _plan[k] !== v)
    )
      deny();
  };
  const wrap = (fn) => async (_plan, signal) => {
    invocation(_plan);
    try {
      return await fn(signal);
    } catch {
      deny();
    }
  };
  return {
    async verifyApproval(_plan, digest, signal) {
      invocation(_plan);
      try {
        if (signal?.aborted || digest !== planDigest) deny();
        const a = await ports.readApproval(digest, signal);
        if (
          a?.approved !== true ||
          a.planDigest !== digest ||
          a.mode !== plan.mode
        )
          deny();
        if (
          ![
            "payment-free-preflight",
            "subscription-activation",
            "subscription-lifecycle",
          ].includes(a.scope)
        )
          deny();
        return {
          approved: true,
          planDigest: digest,
          mode: plan.mode,
          scope: a.scope,
        };
      } catch {
        deny();
      }
    },
    verifyAuthority: wrap(authority),
    disableEndpoint: wrap(async (signal) => {
      await authority(signal);
      checkEndpoint(await request("GET", endpointPath, undefined, signal));
      const updated = await request(
        "POST",
        endpointPath,
        { disabled: true },
        signal,
      );
      checkEndpoint(updated);
      const readback = await request("GET", endpointPath, undefined, signal);
      checkEndpoint(readback);
      if (updated.status !== "disabled" || readback.status !== "disabled")
        deny();
      return { verified: true };
    }),
    pauseReceiver: wrap(async (signal) => {
      await authority(signal);
      if (signal?.aborted) deny();
      await ports.pauseReceiver(plan.database, signal);
      if ((await ports.readReceiverPaused(signal)) !== true) deny();
      return { verified: true };
    }),
    closeNewCheckoutSessions: wrap(async (signal) => {
      await authority(signal);
      const policy = await ports.readCheckoutPolicy(signal);
      if (
        policy?.source !== plan.source ||
        policy.runId !== plan.runId ||
        policy.issuanceJournalComplete !== true ||
        policy.inflightReconciled !== true ||
        !Array.isArray(policy.sessionIds) ||
        [...policy.sessionIds].sort().join("|") !==
          owned.checkouts
            .map((r) => r.id)
            .sort()
            .join("|")
      )
        deny();
      for (const r of owned.checkouts) {
        const path = "/v1/checkout/sessions/" + r.id;
        const before = await request("GET", path, undefined, signal);
        checkSession(before, r);
        if (before.status === "open") {
          if (before.payment_status !== "unpaid") deny();
          // Provider supports expiration of OPEN sessions only. No payment, cancel,
          // refund or subscription mutation is performed by cleanup.
          checkSession(await request("POST", path + "/expire", {}, signal), r);
        }
        const after = await request("GET", path, undefined, signal);
        checkSession(after, r);
        if (!["expired", "complete"].includes(after.status)) deny();
      }
      return { verified: true };
    }),
    closePortalSessions: wrap(async (signal) => {
      await authority(signal);
      const p = await ports.readPortalPolicy(signal);
      // An empty array alone is NOT proof that no capability was issued.
      if (
        plan.profile !== "activation" ||
        p?.source !== plan.source ||
        p.runId !== plan.runId ||
        p.owner !== plan.owner ||
        p.runtimeAttested !== true ||
        p.allReachableS2RuntimesCovered !== true ||
        p.legacyPortalDenied !== true ||
        p.providerLoginPageDisabled !== true ||
        p.operations !== "checkout" ||
        p.issuanceJournalComplete !== true ||
        !Array.isArray(p.issuedSessions) ||
        p.issuedSessions.length
      )
        deny();
      return { verified: true }; // Proven no issuance, never pretend to revoke a session.
    }),
    restoreRoutingAndRemoveTemporaryPreview: wrap(async (signal) => {
      await authority(signal);
      if (signal?.aborted) deny();
      const closed = await ports.closeRouting(plan, signal);
      if (
        closed?.verified !== true ||
        closed.source !== plan.source ||
        closed.runId !== plan.runId
      )
        deny();
      return { verified: true };
    }),
  };
}
