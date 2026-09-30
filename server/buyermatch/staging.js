import { URL } from "node:url";
import process from "node:process";
export const PRODUCTION_SUPABASE_REF = "aigvnbxiydbzzqbetlhl";
export function assertStaging(env = process.env) {
  if (env.BM_ENVIRONMENT !== "staging" || env.VERCEL_ENV === "production")
    throw new Error("Staging environment required");
  const url = new URL(env.SUPABASE_URL || "");
  const ref = env.BM_STAGING_PROJECT_REF;
  if (
    !ref ||
    ref === PRODUCTION_SUPABASE_REF ||
    url.hostname !== `${ref}.supabase.co` ||
    url.protocol !== "https:"
  )
    throw new Error("Verified staging project required");
  if (
    env.VITE_SUPABASE_URL &&
    new URL(env.VITE_SUPABASE_URL).origin !== url.origin
  )
    throw new Error("Frontend and server project mismatch");
  return url.origin;
}
export function stagingOrigin(env = process.env) {
  assertStaging(env);
  const url = new URL(env.BM_APP_ORIGIN || "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith(".vercel.app") ||
    url.hostname === "deal-blast-pro.vercel.app"
  )
    throw new Error("Explicit Vercel preview origin required");
  return url.origin;
}
