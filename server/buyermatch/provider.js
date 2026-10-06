import process from "node:process";
import { stagingOrigin } from "./staging.js";
export function testProvider(env = process.env, sendFetch = globalThis.fetch) {
  const origin = stagingOrigin(env);
  if (!["mock", "resend-test"].includes(env.BM_DELIVERY_MODE))
    throw new Error("Test delivery mode required");
  return {
    verified: true,
    supportsIdempotency: true,
    async send({ property, idempotencyKey, responseUrl, synthetic }) {
      if (synthetic !== true)
        throw new Error("Only synthetic buyers may receive test distributions");
      if (!responseUrl.startsWith(origin + "/buyer-response#"))
        throw new Error("Invalid response origin");
      if (env.BM_DELIVERY_MODE === "mock")
        return { id: `mock-${idempotencyKey}` };
      if (!env.RESEND_API_KEY) throw new Error("Resend staging key required");
      // Recipient is hardcoded to Resend's test sink. No configurable real-recipient path.
      const response = await sendFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `bm-${idempotencyKey}`,
        },
        body: JSON.stringify({
          from:
            env.NOTIFY_FROM_EMAIL || "Deal Blast Pro <onboarding@resend.dev>",
          to: ["delivered@resend.dev"],
          subject: "[SYNTHETIC TEST] DBP BuyerMatch deal",
          text: `Synthetic staging deal: ${property.address}, ${property.city}, ${property.state}. Asking price: $${property.price}.\nRespond or unsubscribe: ${responseUrl}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.id) {
        // Never retain provider messages: they may echo credentials or payload data.
        const categories = new Set(['validation_error', 'restricted_api_key', 'invalid_api_key',
          'missing_api_key', 'rate_limit_exceeded', 'daily_quota_exceeded', 'application_error']);
        const category = categories.has(data.name) ? data.name : 'unclassified';
        const error = new Error('Test provider request failed');
        error.code = `test_provider_http_${response.status}_${category}`;
        throw error;
      }
      return { id: data.id };
    },
  };
}
