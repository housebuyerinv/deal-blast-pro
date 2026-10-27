import process from "node:process";

export const S2_BILLING_REF = "qxhhlprentrufobpcgna";
export const S2_PRO_OWNER = "368f5f93-acf7-4cc3-9805-a4c0817506c3";
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
  if (env.SUPABASE_URL !== url && env.BM_STAGING_PROJECT_REF !== S2_BILLING_REF)
    return;
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
