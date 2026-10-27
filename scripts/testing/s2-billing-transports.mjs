// Explicitly constructed operator transport. No env/file credential reads or CLI.
// Raw provider responses stay inside private adapter calls; journals are allowlisted.
import { createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import {
  validateBillingPlan,
  billingWindowBindings,
} from "./s2-billing-runner.mjs";
import {
  S2_RELEASE as S2,
  REQUIRED_S2_ENV,
} from "../buyermatch-s2-release.mjs";
const fail = () => {
  throw Error("S2_PROVIDER_OPERATION_UNVERIFIED; no automatic retry");
};
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
async function step(fn, signal) {
  if (signal.aborted) fail();
  let abort;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        abort = () => reject(Error("Aborted"));
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export function makeBillingTransports(
  input,
  {
    approvedSource,
    headersFor,
    verifyApproval,
    verifyAuthority,
    journal,
    privateOpenCheckout,
    previewOrigin,
    deploymentId: approvedDeploymentId,
    fetcher,
    timeoutMs = 10000,
    now = Date.now,
  } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, input.startedAt);
  if (
    [headersFor, verifyApproval, verifyAuthority, journal, now].some(
      (f) => typeof f !== "function",
    ) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    (plan.mode === "LOCAL_SYNTHETIC" && typeof fetcher !== "function")
  )
    fail();
  const http = fetcher || globalThis.fetch,
    digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const sessions = new Set(),
    subscriptions = new Set(),
    invoices = new Map();
  let verifiedUserBearer;
  const supabase = `https://${plan.database}.supabase.co`,
    origin = previewOrigin || S2.origin;
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin ||
    parsedOrigin.protocol !== "https:" ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    !/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(
      parsedOrigin.hostname,
    ) ||
    (plan.mode === "HOSTED" &&
      (!previewOrigin ||
        !/^dpl_[A-Za-z0-9]+$/.test(approvedDeploymentId || "") ||
        approvedDeploymentId === S2.fallback))
  )
    fail();
  const record = async (stage, status, signal) => {
    const ack = await step(
      () =>
        journal({
          runId: plan.runId,
          source: plan.source,
          mode: plan.mode,
          stage,
          status,
        }),
      signal,
    );
    if (ack?.durable !== true) fail();
  };
  const scoped = async (signal, writingCheckout = false) => {
    const consent = await step(
        () => verifyApproval(plan, digest, signal),
        signal,
      ),
      a = await step(() => verifyAuthority(plan, signal), signal);
    if (
      consent?.approved !== true ||
      consent.planDigest !== digest ||
      consent.mode !== plan.mode ||
      ![
        "payment-free-preflight",
        "subscription-activation",
        "subscription-lifecycle",
      ].includes(consent.scope) ||
      (writingCheckout && consent.scope !== "subscription-activation") ||
      a?.project !== plan.project ||
      a.team !== plan.team ||
      a.database !== plan.database ||
      a.account !== plan.account ||
      a.endpoint !== plan.endpoint ||
      a.livemode !== false ||
      a.ownerAuthorized !== true
    )
      fail();
    if (
      plan.mode === "HOSTED" &&
      (a.deploymentId !== approvedDeploymentId ||
        a.previewOrigin !== origin ||
        a.source !== plan.source ||
        a.protectionEnabled !== true)
    )
      fail();
  };
  async function call(
    slot,
    path,
    {
      method = "GET",
      body,
      stage = "preflight",
      signal,
      expectedStatus = 200,
    } = {},
  ) {
    const controller = new globalThis.AbortController();
    let timer;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    timer = setTimeout(abort, timeoutMs);
    try {
      if (controller.signal.aborted) fail();
      await scoped(
        controller.signal,
        stage === "checkout" && method === "POST",
      );
      if (controller.signal.aborted) fail();
      await record(stage, "STARTED", controller.signal);
      const supplied = await step(
        () => headersFor(slot, controller.signal),
        controller.signal,
      );
      const headers = new globalThis.Headers(supplied),
        allowed = slot.startsWith("stripe")
          ? ["authorization"]
          : slot.startsWith("supabase")
            ? ["authorization", "apikey"]
            : ["authorization", "cookie", "x-vercel-trusted-oidc-idp-token"];
      if (
        [...headers.keys()].some((k) => !allowed.includes(k)) ||
        (slot === "guard-probe"
          ? headers.has("authorization")
          : !headers.get("authorization")?.startsWith("Bearer "))
      )
        fail();
      if (slot.startsWith("stripe")) {
        if (
          !/^Bearer rk_test_[A-Za-z0-9_]+$/.test(headers.get("authorization"))
        )
          fail();
        headers.set("Stripe-Context", plan.account);
        headers.set("Stripe-Version", "2026-08-26.dahlia");
      }
      if (slot.startsWith("supabase") && !headers.get("apikey")) fail();
      if (slot === "supabase-user")
        verifiedUserBearer = headers.get("authorization");
      if (
        slot === "application" &&
        (!verifiedUserBearer ||
          headers.get("authorization") !== verifiedUserBearer)
      )
        fail();
      headers.set("Cache-Control", "no-store");
      const base = slot.startsWith("stripe")
        ? "https://api.stripe.com"
        : slot.startsWith("supabase")
          ? supabase
          : origin;
      const target = new URL(path, base);
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        target.origin !== base ||
        target.hash
      )
        fail();
      if (method === "POST") {
        if (slot.startsWith("stripe")) {
          headers.set("Content-Type", "application/x-www-form-urlencoded");
          body = new URLSearchParams(body).toString();
        } else {
          headers.set("Content-Type", "application/json");
          body = JSON.stringify(body);
        }
        headers.set(
          slot.startsWith("stripe") ? "Idempotency-Key" : "X-DBP-Operation-Key",
          plan.runId + ":" + stage + ":" + target.pathname,
        );
      }
      if (
        controller.signal.aborted ||
        (stage === "checkout" &&
          (now() < plan.startedAt || now() >= plan.expiresAt))
      )
        fail();
      const response = await step(
        () =>
          http(target.href, {
            method,
            headers,
            body,
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
          }),
        controller.signal,
      );
      if (
        response.redirected ||
        response.status !== expectedStatus ||
        controller.signal.aborted
      )
        fail();
      const reader = response.body?.getReader();
      if (!reader) fail();
      const decoder = new globalThis.TextDecoder();
      let text = "",
        size = 0;
      try {
        while (true) {
          const { done, value } = await step(
            () => reader.read(),
            controller.signal,
          );
          if (done) break;
          size += value.byteLength;
          if (size > 65536 || controller.signal.aborted) fail();
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        void reader.cancel().catch(() => {});
        try {
          reader.releaseLock();
        } catch {
          /* Aborted reader may still be settling. */
        }
      }
      const value = JSON.parse(text);
      if (controller.signal.aborted) fail();
      await record(stage, "PASS", controller.signal);
      return value;
    } catch {
      throw Error("S2_PROVIDER_OPERATION_UNVERIFIED; no automatic retry");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  const query = (table, fields, extra = {}) =>
    "/rest/v1/" +
    table +
    "?" +
    new URLSearchParams({
      select: fields,
      owner_id: "eq." + plan.owner,
      ...extra,
    });
  const ownedRows = (rows, max = 1) => {
    if (
      !Array.isArray(rows) ||
      rows.length > max ||
      rows.some((r) => r.owner_id !== plan.owner)
    )
      fail();
    return rows;
  };
  function checkoutOwned(s) {
    if (
      !/^cs_test_[A-Za-z0-9]+$/.test(s?.id || "") ||
      s.livemode !== false ||
      s.mode !== "subscription" ||
      s.client_reference_id !== plan.owner ||
      s.metadata?.dealBlastUserId !== plan.owner ||
      s.metadata?.dbpProduct !== "buyermatch" ||
      s.metadata?.dbpS2RunId !== plan.runId ||
      !uuid.test(s.metadata?.dbpCheckoutId || "") ||
      !Number.isSafeInteger(s.created) ||
      s.created * 1000 < Math.floor(plan.startedAt / 1000) * 1000 ||
      s.created * 1000 > plan.expiresAt
    )
      fail();
    return s;
  }
  const api = {
    async readAttestation(deploymentId, signal) {
      if (approvedDeploymentId && deploymentId !== approvedDeploymentId) fail();
      if (
        !/^dpl_[A-Za-z0-9]+$/.test(deploymentId) ||
        deploymentId === S2.fallback
      )
        fail();
      const r = await call(
        "owner-application",
        "/api/platform/s2-attestation",
        { signal },
      );
      if (
        r.schema !== 1 ||
        r.qaOnly !== true ||
        r.identity?.deploymentId !== deploymentId ||
        r.identity.projectId !== plan.project ||
        r.identity.sourceSha !== plan.source ||
        r.identity.runId !== plan.runId ||
        r.identity.target !== "preview" ||
        !/^dbp-registration-s2-[a-z0-9]+-housebuyerinv\.vercel\.app$/.test(
          r.identity.hostname || "",
        ) ||
        r.build?.observation !== "build-process-environment" ||
        r.runtime?.observation !== "effective-function-process-environment" ||
        !/^[a-f0-9]{64}$/.test(r.build.sha256 || "") ||
        !Number.isFinite(Date.parse(r.build.observedAt)) ||
        now() - Date.parse(r.build.observedAt) > 3600000 ||
        Date.parse(r.build.observedAt) > now() + 60000
      )
        fail();
      for (const kind of ["build", "runtime"])
        if (
          Object.keys(r[kind].settings || {}).length !== 17 ||
          Object.entries(REQUIRED_S2_ENV).some(
            ([k, v]) => r[kind].settings[k] !== v,
          )
        )
          fail();
      return {
        verified: true,
        deploymentId,
        source: plan.source,
        runId: plan.runId,
        build: r.build.settings,
        runtime: r.runtime.settings,
      };
    },
    async readLegacyPortalDenied(signal) {
      // Deliberately no application bearer. Even the older route rejects an
      // unsigned request before any account-repair or Portal side effect.
      const r = await call(
        "guard-probe",
        "/api/create-billing-portal-session",
        { method: "POST", body: {}, signal, expectedStatus: 503 },
      );
      if (r.ok !== false || r.code !== "s2_legacy_portal_disabled") fail();
      return { denied: true };
    },
    async readEntitlement(signal) {
      const rows = ownedRows(
        await call(
          "supabase",
          query(
            "bm_entitlements",
            "owner_id,product,plan_version,status,allowance,period_start,period_end,stripe_subscription_id",
            { product: "eq.buyermatch" },
          ),
          { signal },
        ),
      );
      for (const r of rows) {
        if (
          r.product !== "buyermatch" ||
          !["buyermatch-starter-v1", "buyermatch-pro-v1"].includes(
            r.plan_version,
          ) ||
          !["active", "inactive"].includes(r.status) ||
          r.allowance !== (r.plan_version === "buyermatch-pro-v1" ? 50 : 20) ||
          !/^sub_[A-Za-z0-9]+$/.test(r.stripe_subscription_id || "")
        )
          fail();
        subscriptions.add(r.stripe_subscription_id);
      }
      return rows.map(
        ({
          product,
          plan_version,
          status,
          allowance,
          period_start,
          period_end,
          stripe_subscription_id,
        }) => ({
          product,
          plan_version,
          status,
          allowance,
          period_start,
          period_end,
          stripe_subscription_id,
        }),
      );
    },
    async readCheckoutMapping(signal) {
      const rows = ownedRows(
        await call(
          "supabase",
          query("bm_checkouts", "id,owner_id,session_id,state,operation_key", {
            operation_key: "eq." + plan.runId,
          }),
          { signal },
        ),
      );
      const result = [];
      for (const r of rows) {
        if (
          r.operation_key !== plan.runId ||
          !uuid.test(r.id) ||
          !/^cs_test_[A-Za-z0-9]+$/.test(r.session_id || "")
        )
          fail();
        const s = checkoutOwned(
          await call(
            "stripe-runtime",
            "/v1/checkout/sessions/" + r.session_id,
            { signal },
          ),
        );
        if (s.metadata.dbpCheckoutId !== r.id) fail();
        sessions.add(r.session_id);
        result.push({ checkoutId: r.id, id: r.session_id, state: r.state });
      }
      return result;
    },
    async readLedger(eventId, signal) {
      if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) fail();
      const rows = ownedRows(
        await call(
          "supabase",
          query(
            "bm_billing_events",
            "owner_id,event_id,event_created,product,subscription_id",
            { event_id: "eq." + eventId },
          ),
          { signal },
        ),
      );
      if (
        rows.some(
          (r) =>
            r.event_id !== eventId ||
            r.product !== "buyermatch" ||
            !subscriptions.has(r.subscription_id),
        )
      )
        fail();
      return rows.map(({ event_id, event_created, subscription_id }) => ({
        event_id,
        event_created,
        subscription_id,
      }));
    },
    async readSubscription(id, signal) {
      if (!subscriptions.has(id)) fail();
      const s = await call("stripe-runtime", "/v1/subscriptions/" + id, {
        signal,
      });
      if (
        s.id !== id ||
        s.livemode !== false ||
        s.metadata?.dealBlastUserId !== plan.owner ||
        s.metadata?.dbpProduct !== "buyermatch"
      )
        fail();
      const invoice =
        typeof s.latest_invoice === "string"
          ? s.latest_invoice
          : s.latest_invoice?.id;
      if (invoice) {
        if (!/^in_[A-Za-z0-9]+$/.test(invoice)) fail();
        invoices.set(invoice, id);
      }
      return {
        id: s.id,
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end,
        latest_invoice: invoice,
      };
    },
    async readInvoice(id, signal) {
      if (!invoices.has(id)) fail();
      const i = await call("stripe-runtime", "/v1/invoices/" + id, { signal });
      const related =
        i.parent?.subscription_details?.subscription || i.subscription;
      if (
        i.id !== id ||
        i.livemode !== false ||
        (typeof related === "string" ? related : related?.id) !==
          invoices.get(id) ||
        !Number.isSafeInteger(i.amount_paid) ||
        i.amount_paid < 0
      )
        fail();
      return {
        id: i.id,
        status: i.status,
        paid: i.paid,
        amount_paid: i.amount_paid,
      };
    },
    async readPortalConfiguration(signal) {
      const c = await call(
        "stripe-runtime",
        "/v1/billing_portal/configurations/" + S2.portal,
        { signal },
      );
      if (
        c.id !== S2.portal ||
        c.livemode !== false ||
        typeof c.login_page?.enabled !== "boolean"
      )
        fail();
      return {
        active: c.active,
        loginPageEnabled: c.login_page?.enabled === true,
        features: c.features,
      };
    },
    async createProCheckout(signal) {
      try {
        if (
          plan.profile !== "activation" ||
          now() < plan.startedAt ||
          now() >= plan.expiresAt ||
          typeof privateOpenCheckout !== "function"
        )
          fail();
        const deadlineSignal = globalThis.AbortSignal.any([
          globalThis.AbortSignal.timeout(timeoutMs),
          ...(signal ? [signal] : []),
        ]);
        const me = await call("supabase-user", "/auth/v1/user", { signal });
        if (
          me.id !== plan.owner ||
          me.role !== "authenticated" ||
          !Number.isFinite(Date.parse(me.email_confirmed_at || ""))
        )
          fail();
        const window = await call(
            "application",
            "/api/buyermatch?action=billing-status",
            { signal },
          ),
          bindings = billingWindowBindings(plan);
        if (
          window?.source !== plan.source ||
          window.projectId !== plan.project ||
          !/^dpl_[A-Za-z0-9]+$/.test(window.deploymentId || "") ||
          (approvedDeploymentId &&
            window.deploymentId !== approvedDeploymentId) ||
          window.checkoutEnabled !== true ||
          window.registrationPaused !== true ||
          window.liveBillingDisabled !== true ||
          window.deliveryDisabled !== true ||
          Object.entries(bindings).some(([k, v]) => window[k] !== v)
        )
          fail();
        if (now() >= plan.expiresAt) fail();
        const r = await call("application", "/api/buyermatch", {
          method: "POST",
          stage: "checkout",
          signal,
          body: {
            action: "checkout",
            planVersion: "buyermatch-pro-v1",
            operationKey: plan.runId,
          },
        });
        if (
          r.testMode !== true ||
          typeof r.url !== "string" ||
          !r.url.startsWith("https://checkout.stripe.com/")
        )
          fail();
        await step(() => privateOpenCheckout(r.url), deadlineSignal);
        return { created: true }; // Never return/log the capability URL.
      } catch {
        fail();
      }
    },
    async stripeRequest({
      method,
      path,
      body,
      account,
      mode,
      signal,
      retries,
    }) {
      if (account !== plan.account || mode !== "test" || retries !== 0) fail();
      const endpoint = "/v1/webhook_endpoints/" + plan.endpoint;
      const session = [...sessions].find(
        (id) =>
          path === "/v1/checkout/sessions/" + id ||
          path === "/v1/checkout/sessions/" + id + "/expire",
      );
      if (path === endpoint) {
        if (method === "GET") return call("stripe-operator", path, { signal });
        if (
          method === "POST" &&
          body?.disabled === true &&
          Object.keys(body).length === 1
        )
          return call("stripe-operator", path, {
            method,
            body,
            signal,
            stage: "closure",
          });
      }
      if (session) {
        if (method === "GET" && path === "/v1/checkout/sessions/" + session)
          return checkoutOwned(await call("stripe-runtime", path, { signal }));
        if (
          method === "POST" &&
          path.endsWith("/expire") &&
          body &&
          Object.keys(body).length === 0
        ) {
          const before = checkoutOwned(
            await call("stripe-runtime", "/v1/checkout/sessions/" + session, {
              signal,
            }),
          );
          if (before.status !== "open" || before.payment_status !== "unpaid")
            fail();
          return checkoutOwned(
            await call("stripe-runtime", path, {
              method,
              body,
              signal,
              stage: "closure",
            }),
          );
        }
      }
      fail();
    },
  };
  return api;
}
