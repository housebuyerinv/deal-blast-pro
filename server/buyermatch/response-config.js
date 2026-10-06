import process from "node:process";
import { assertStaging, PRODUCTION_SUPABASE_REF } from "./staging.js";
import { billingConfig } from './billing-config.js';

// Receiving an external response is independent of staging-only invitation
// issuance, mock delivery and sandbox checkout. Production must opt in explicitly.
export function responseEnvironment(env = process.env) {
  if (env.VERCEL_ENV !== "production") {
    assertStaging(env);
    return "staging";
  }
  if (
    env.BM_ENVIRONMENT !== "production" ||
    env.BM_RESPONSE_ENABLED !== "true" ||
    env.BM_PRODUCTION_PROJECT_REF !== PRODUCTION_SUPABASE_REF ||
    env.SUPABASE_URL !== `https://${PRODUCTION_SUPABASE_REF}.supabase.co` ||
    (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL !== env.SUPABASE_URL) ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !(env.BM_CHECKOUT_ENABLED === "false" || (env.BM_CHECKOUT_ENABLED === "true" && billingConfig(env).live)) ||
    !(
      env.BM_DELIVERY_MODE === "disabled" ||
      (env.BM_DELIVERY_MODE === "resend" &&
        env.BM_LIVE_DELIVERY_ENABLED === "true")
    )
  )
    throw new Error("Production response configuration unavailable");
  return "production";
}
