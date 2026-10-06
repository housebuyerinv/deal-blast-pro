import { responseToken, hashToken } from "./tokens.js";
import { stagingOrigin } from "./staging.js";
import process from "node:process";
export async function dispatchOutbox(db, id, provider, env = process.env) {
  const origin = stagingOrigin(env);
  if (!provider?.verified || !provider?.supportsIdempotency)
    throw new Error("Verified idempotent provider required");
  const { data: job, error } = await db.rpc("bm_claim_outbox", { p_id: id });
  if (error) throw new Error("Outbox claim failed");
  if (!job) return { sent: false };
  try {
    if (job.synthetic !== true)
      throw new Error("Synthetic test buyer required");
    const token = responseToken(job.exposureId, env);
    const savedToken = await db
      .from("bm_response_tokens")
      .upsert(
        {
          token_hash: hashToken(token),
          exposure_id: job.exposureId,
          expires_at: job.expiresAt,
        },
        { onConflict: "exposure_id", ignoreDuplicates: true },
      );
    if (savedToken.error) throw new Error("Response link persistence failed");
    const receipt = await provider.send({
      property: job.property,
      idempotencyKey: job.exposureId,
      responseUrl: `${origin}/buyer-response#${token}`,
      synthetic: true,
    });
    if (!receipt?.id) throw new Error("Provider acceptance missing");
    const saved = await db
      .from("bm_outbox")
      .update({
        state: "accepted",
        provider_message_id: receipt.id,
        accepted_at: new Date().toISOString(),
        lease_until: null,
        test_delivery: true,
        last_error_code: null,
      })
      .eq("id", job.id)
      .is("accepted_at", null);
    if (saved.error) throw new Error("Receipt persistence failed");
    return { sent: true, testMode: true };
  } catch (error) {
    await db
      .from("bm_outbox")
      .update({
        state: "pending",
        lease_until: null,
        last_error_code: /^test_provider_http_[1-5][0-9]{2}_(validation_error|restricted_api_key|invalid_api_key|missing_api_key|rate_limit_exceeded|daily_quota_exceeded|application_error|unclassified)$/.test(error?.code || '')
          ? error.code : "test_delivery_retry",
      })
      .eq("id", job.id)
      .is("accepted_at", null);
    throw new Error("Delivery attempt requires retry");
  }
}
