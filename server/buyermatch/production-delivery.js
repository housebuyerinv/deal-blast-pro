import process from "node:process";
import { URL } from "node:url";
import { responseEnvironment } from "./response-config.js";
import { responseToken, hashToken } from "./tokens.js";
import { decryptIdentity } from "./security.js";

export function productionDeliveryConfig(env = process.env) {
  if (
    env.VERCEL_ENV !== "production" ||
    responseEnvironment(env) !== "production" ||
    env.BM_LIVE_DELIVERY_ENABLED !== "true" ||
    env.BM_DELIVERY_MODE !== "resend" ||
    !env.RESEND_API_KEY ||
    !env.BM_RESEND_FROM ||
    (env.BM_RESPONSE_SECRET || "").length < 32
  )
    throw new Error("Production delivery disabled");
  const origin = new URL(env.BM_APP_ORIGIN || "");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.origin !== env.PUBLIC_APP_URL ||
    /localhost|git-codex|staging/.test(origin.hostname)
  )
    throw new Error("Production origin unavailable");
  return origin.origin;
}

// Runtime callers always construct this adapter; no request can supply transport
// or select a mock. Tests inject transport directly into this module only.
export function productionProvider(
  env = process.env,
  sendFetch = globalThis.fetch,
) {
  const origin = productionDeliveryConfig(env);
  return {
    environment: "production",
    supportsIdempotency: true,
    async send({ email, property, responseUrl, exposureId }) {
      if (!email || !responseUrl.startsWith(origin + "/buyer-response#"))
        throw new Error("Invalid delivery intent");
      const response = await sendFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `bm-production-${exposureId}`,
        },
        body: JSON.stringify({
          from: env.BM_RESEND_FROM,
          to: [email],
          subject: "DBP Private Network invitation",
          text: `Property: ${property.address}, ${property.city}, ${property.state}. Asking price: $${property.price}.\nRespond or unsubscribe: ${responseUrl}`,
        }),
      });
      const receipt = await response.json();
      if (!response.ok || typeof receipt.id !== "string" || !receipt.id)
        throw new Error("Provider did not accept delivery");
      return { id: receipt.id };
    },
  };
}

export async function deliverProductionInvitation(
  db,
  intent,
  provider,
  env = process.env,
) {
  const origin = productionDeliveryConfig(env);
  if (
    provider?.environment !== "production" ||
    provider.supportsIdempotency !== true
  )
    throw new Error("Production provider required");
  const token = responseToken(intent.exposureId, env);
  const { data: job, error } = await db.rpc("bm_claim_production_invitation", {
    p_owner: intent.ownerId,
    p_deal: intent.dealId,
    p_exposure: intent.exposureId,
    p_hash: hashToken(token),
  });
  if (error) throw new Error("Invitation unavailable");
  if (!job) return { accepted: false };
  try {
    if (job.synthetic !== false || job.exposureId !== intent.exposureId)
      throw new Error("Invalid production target");
    const identity = decryptIdentity(job.identityCiphertext);
    const receipt = await provider.send({
      email: identity.email,
      property: job.property,
      exposureId: job.exposureId,
      responseUrl: `${origin}/buyer-response#${token}`,
    });
    if (!receipt?.id) throw new Error("Provider acceptance missing");
    const saved = await db.rpc("bm_finish_production_invitation", {
      p_id: job.id,
      p_lease: job.leaseId,
      p_message: receipt.id,
    });
    if (saved.error || saved.data !== true)
      throw new Error("Receipt persistence failed");
    return { accepted: true };
  } catch {
    await db.rpc("bm_retry_production_invitation", {
      p_id: job.id,
      p_lease: job.leaseId,
    });
    throw new Error("Delivery requires retry or reconciliation");
  }
}
