import { z } from "zod";
import { getSupabaseAdminClient } from "./_accountAuth.js";
import {
  hashToken,
  responseOperationKey,
} from "../server/buyermatch/tokens.js";
import { assertStaging } from "../server/buyermatch/staging.js";
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  try {
    assertStaging();
    const input = z
      .object({
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        operationKey: z.string().uuid(),
        kind: z.enum(["interested", "offer", "declined", "unsubscribe"]),
        amountCents: z.number().int().positive().safe().optional(),
        terms: z.string().max(2000).optional(),
      })
      .parse(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
    const db = getSupabaseAdminClient();
    // Honor responses accepted before server-derived keys were introduced too.
    // Validate the capability first; an expired/revoked link never gets a replay acknowledgement.
    const capability = await db
      .from("bm_response_tokens")
      .select("exposure_id")
      .eq("token_hash", hashToken(input.token))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (capability.error || !capability.data)
      return res.status(400).json({ error: "Response link unavailable." });
    const prior =
      input.kind === "offer"
        ? db
            .from("bm_offers")
            .select("id")
            .eq("exposure_id", capability.data.exposure_id)
            .eq("amount_cents", input.amountCents || 0)
            .eq("terms", (input.terms || "").trim())
        : db
            .from("bm_responses")
            .select("id")
            .eq("exposure_id", capability.data.exposure_id)
            .eq("kind", input.kind);
    const previous = await prior.limit(1);
    if (previous.error) throw new Error("Response lookup unavailable");
    if (previous.data?.length) return res.status(200).json({ recorded: true });
    const { data, error } = await db.rpc("bm_buyer_response", {
      p_hash: hashToken(input.token),
      p_key: responseOperationKey(input),
      p_kind: input.kind,
      p_amount: input.amountCents || null,
      p_terms: (input.terms || "").trim(),
    });
    if (error)
      return res.status(400).json({
        error:
          "Response link is expired, unavailable, or this response is invalid.",
      });
    if (data?.recorded !== true)
      return res.status(400).json({ error: "Response link unavailable." });
    // Never pass database response fields through this public capability endpoint.
    return res.status(200).json({ recorded: true });
  } catch {
    return res.status(400).json({ error: "Response link unavailable." });
  }
}
