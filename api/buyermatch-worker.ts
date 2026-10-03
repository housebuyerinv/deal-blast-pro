import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdminClient } from "./_accountAuth.js";
import { assertStaging } from "../server/buyermatch/staging.js";
import { testProvider } from "../server/buyermatch/provider.js";
import { dispatchOutbox } from "../server/buyermatch/outbox.js";
import {
  productionDeliveryConfig,
  productionProvider,
  deliverProductionInvitation,
} from "../server/buyermatch/production-delivery.js";
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (!["POST", "GET"].includes(req.method)) return res.status(405).end();
  const expected = process.env.BM_WORKER_SECRET || "";
  const actual = String(req.headers.authorization || "").replace(
    /^Bearer /,
    "",
  );
  if (
    expected.length < 32 ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return res.status(401).json({ error: "Unauthorized" });
  try {
    if (process.env.VERCEL_ENV === "production") {
      productionDeliveryConfig();
      const db = getSupabaseAdminClient();
      const provider = productionProvider();
      const { data, error } = await db
        .from("bm_outbox")
        .select("bm_exposures!inner(id,deal_id,owner_id)")
        .in("state", ["pending", "processing"])
        .is("accepted_at", null)
        .order("created_at")
        .limit(20);
      if (error) throw error;
      let accepted = 0,
        failed = 0;
      for (const row of data || []) {
        const exposure = Array.isArray(row.bm_exposures)
          ? row.bm_exposures[0]
          : row.bm_exposures;
        try {
          if (
            (
              await deliverProductionInvitation(
                db,
                {
                  ownerId: exposure.owner_id,
                  dealId: exposure.deal_id,
                  exposureId: exposure.id,
                },
                provider,
              )
            ).accepted
          )
            accepted++;
        } catch {
          failed++;
        }
      }
      return res.status(200).json({ accepted, failed });
    }
    assertStaging();
    const db = getSupabaseAdminClient();
    const provider = testProvider();
    const { data, error } = await db
      .from("bm_outbox")
      .select("id")
      .in("state", ["pending", "processing"])
      .is("accepted_at", null)
      .order("created_at")
      .limit(20);
    if (error) throw error;
    let accepted = 0,
      failed = 0;
    for (const row of data || [])
      try {
        if ((await dispatchOutbox(db, row.id, provider)).sent) accepted++;
      } catch {
        failed++;
      }
    return res.status(200).json({ accepted, failed, testMode: true });
  } catch {
    return res.status(503).json({ error: "Worker configuration unavailable" });
  }
}
