import process from "node:process";
import { URL } from "node:url";
import { REQUIRED_S2_ENV } from '../../scripts/buyermatch-s2-release.mjs';

export const S2_BILLING_REF = "qxhhlprentrufobpcgna";
export const S2_PRO_OWNER = "368f5f93-acf7-4cc3-9805-a4c0817506c3";
export function isS2LegacyCheckout(action, method, env = process.env) {
  return (
    method === "POST" &&
    ["credit-packs", "pro-trial-checkout"].includes(action) &&
    isDedicatedS2Runtime(env)
  );
}
export function s2BillingWindowStatus(user, env = process.env) {
  if (
    !isDedicatedS2Runtime(env) ||
    env.VERCEL_PROJECT_ID !== "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl" ||
    env.BM_STAGING_PROJECT_REF !== S2_BILLING_REF ||
    env.VERCEL_ENV !== "preview" ||
    env.BM_ENVIRONMENT !== "staging" ||
    env.SUPABASE_URL !== `https://${S2_BILLING_REF}.supabase.co`
  )
    throw Object.assign(Error("Not found"), { status: 404 });
  if (
    user?.id !== S2_PRO_OWNER ||
    !Number.isFinite(Date.parse(user.email_confirmed_at || ""))
  )
    throw Object.assign(Error("Forbidden"), { status: 403 });
  if (
    !/^[a-f0-9]{40}$/.test(env.BM_S2_ATTESTATION_SOURCE_SHA || "") ||
    !/^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID || "")
  )
    throw Object.assign(Error("S2 status unverified"), { status: 503 });
  const publicBindings = Object.fromEntries(
    [
      "BM_S2_BILLING_OWNER_ID",
      "BM_S2_BILLING_RUN_ID",
      "BM_S2_BILLING_STARTED_AT",
      "BM_S2_BILLING_EXPIRES_AT",
      "BM_S2_BILLING_OPERATIONS",
    ].map((k) => [k, env[k] || ""]),
  );
  if (
    (publicBindings.BM_S2_BILLING_OWNER_ID &&
      publicBindings.BM_S2_BILLING_OWNER_ID !== S2_PRO_OWNER) ||
    (publicBindings.BM_S2_BILLING_RUN_ID &&
      !uuid.test(publicBindings.BM_S2_BILLING_RUN_ID)) ||
    ["BM_S2_BILLING_STARTED_AT", "BM_S2_BILLING_EXPIRES_AT"].some(
      (k) =>
        publicBindings[k] &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
          publicBindings[k],
        ) ||
          !Number.isFinite(Date.parse(publicBindings[k]))),
    ) ||
    (publicBindings.BM_S2_BILLING_OPERATIONS &&
      publicBindings.BM_S2_BILLING_OPERATIONS.split(",").some(
        (v) => !operations.has(v),
      ))
  )
    throw Object.assign(Error("S2 status unverified"), { status: 503 });
  return {
    schema: 1,
    source: env.BM_S2_ATTESTATION_SOURCE_SHA,
    projectId: env.VERCEL_PROJECT_ID,
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    pausedSettingsVerified: Object.entries(REQUIRED_S2_ENV).every(([key, value]) => env[key] === value),
    attestationRunId: uuid.test(env.BM_S2_ATTESTATION_RUN_ID || '') ? env.BM_S2_ATTESTATION_RUN_ID : '',
    registrationPaused: env.DBP_REGISTRATION_PAUSED === "true",
    checkoutEnabled: env.BM_CHECKOUT_ENABLED === "true",
    liveBillingDisabled: env.BM_LIVE_BILLING_ENABLED === "false",
    deliveryDisabled: env.BM_LIVE_DELIVERY_ENABLED === "false",
    ...publicBindings,
  };
}
export function isDedicatedS2Runtime(env = process.env) {
  return (
    env.VERCEL_PROJECT_ID === "prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl" ||
    env.BM_STAGING_PROJECT_REF === S2_BILLING_REF ||
    ["SUPABASE_URL", "VITE_SUPABASE_URL"].some((k) => {
      try {
        return (
          new URL(env[k] || "").hostname === S2_BILLING_REF + ".supabase.co"
        );
      } catch {
        return false;
      }
    })
  );
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const operations = new Set(["checkout", "payment", "change", "cancel"]);
const deny = () => {
  throw Object.assign(
    new Error(
      "S2 billing test window is closed or this operation is not approved.",
    ),
    { status: 503 },
  );
};

// Only the dedicated S2 runtime is affected; existing Production/non-S2 policy
// stays in billingConfig. No request body or customer metadata opens this gate.
export function requireS2BillingWindow(
  owner,
  operation,
  env = process.env,
  now = Date.now(),
) {
  const url = `https://${S2_BILLING_REF}.supabase.co`;
  if (!isDedicatedS2Runtime(env)) return;
  const start = Date.parse(env.BM_S2_BILLING_STARTED_AT || "");
  const end = Date.parse(env.BM_S2_BILLING_EXPIRES_AT || "");
  const allowed = (env.BM_S2_BILLING_OPERATIONS || "").split(",");
  if (
    env.VERCEL_ENV !== "preview" ||
    env.BM_ENVIRONMENT !== "staging" ||
    env.BM_STAGING_PROJECT_REF !== S2_BILLING_REF ||
    env.SUPABASE_URL !== url ||
    env.DBP_REGISTRATION_PAUSED !== "true" ||
    env.BM_LIVE_BILLING_ENABLED !== "false" ||
    env.BM_LIVE_DELIVERY_ENABLED !== "false" ||
    owner !== S2_PRO_OWNER ||
    env.BM_S2_BILLING_OWNER_ID !== owner ||
    !uuid.test(env.BM_S2_BILLING_RUN_ID || "") ||
    !operations.has(operation) ||
    !allowed.length ||
    new Set(allowed).size !== allowed.length ||
    allowed.some((item) => !operations.has(item)) ||
    !allowed.includes(operation) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(now) ||
    end <= start ||
    end - start > 30 * 60 * 1000 ||
    now < start ||
    now >= end
  )
    deny();
  return { runId: env.BM_S2_BILLING_RUN_ID, expiresAt: end };
}
