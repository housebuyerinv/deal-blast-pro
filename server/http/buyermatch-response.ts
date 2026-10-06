import { z } from "zod";
import { getSupabaseAdminClient } from "../../api/_accountAuth.js";
import {
  hashToken,
  responseOperationKey,
} from "../buyermatch/tokens.js";
import { responseEnvironment } from "../buyermatch/response-config.js";
import { safeConversationText } from '../buyermatch/conversation.js';
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  try {
    const environment = responseEnvironment();
    const input = z
      .object({
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        operationKey: z.string().uuid(),
        kind: z.enum(["interested", "offer", "declined", "unsubscribe", "message", "conversation"]),
        amountCents: z.number().int().positive().safe().optional(),
        terms: z.string().max(2000).optional(),
      })
      .parse(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
    const db = getSupabaseAdminClient();
    if (input.kind === 'conversation') {
      const result = await db.rpc('bm_buyer_conversation', { p_hash: hashToken(input.token), p_environment: environment });
      if (result.error || !result.data) throw new Error('Link unavailable');
      const value = result.data;
      return res.status(200).json({
        address: String(value.address || ''), city: String(value.city || ''), state: String(value.state || ''),
        messages: (Array.isArray(value.messages) ? value.messages : []).slice(-100).map((item: any) => ({
          sender: item.sender === 'buyer' ? 'Buyer' : 'Deal team', body: safeConversationText(item.body), createdAt: String(item.createdAt || ''),
        })),
      });
    }
    // Validate scope and replay atomically under the database token lock.
    const { data, error } =
      input.kind === "message"
        ? await db.rpc("bm_buyer_message_scoped", {
            p_hash: hashToken(input.token),
            p_key: responseOperationKey(input),
            p_body: (input.terms || "").trim(),
            p_environment: environment,
          })
        : await db.rpc("bm_buyer_response_scoped", {
            p_hash: hashToken(input.token),
            p_key: responseOperationKey(input),
            p_kind: input.kind,
            p_amount: input.amountCents || null,
            p_terms: (input.terms || "").trim(),
            p_environment: environment,
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
