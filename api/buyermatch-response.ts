import { z } from "zod";
import { getSupabaseAdminClient } from "./_accountAuth.js";
import { hashToken } from "../server/buyermatch/tokens.js";
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
    const { data, error } = await getSupabaseAdminClient().rpc(
      "bm_buyer_response",
      {
        p_hash: hashToken(input.token),
        p_key: input.operationKey,
        p_kind: input.kind,
        p_amount: input.amountCents || null,
        p_terms: input.terms || "",
      },
    );
    if (error)
      return res
        .status(400)
        .json({
          error:
            "Response link is expired, unavailable, or this response is invalid.",
        });
    return res.status(200).json(data);
  } catch {
    return res.status(400).json({ error: "Response link unavailable." });
  }
}
