import { Webhook } from "npm:svix@2.6.1";
export async function deliveryHandler(
  req: Request,
  env: { get: (key: string) => string | undefined },
  sendFetch = fetch,
) {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  const production = env.get("BM_ENVIRONMENT") === "production";
  const ref = env.get(
    production ? "BM_PRODUCTION_PROJECT_REF" : "BM_STAGING_PROJECT_REF",
  );
  const url = env.get("SUPABASE_URL");
  if (
    !ref ||
    (production
      ? ref !== "aigvnbxiydbzzqbetlhl"
      : env.get("BM_ENVIRONMENT") !== "staging" ||
        ref === "aigvnbxiydbzzqbetlhl") ||
    url !== `https://${ref}.supabase.co`
  )
    return respond({ error: "Delivery environment unavailable" }, 503);
  let event: any;
  try {
    const raw = await req.text();
    if (raw.length > 100000) throw new Error();
    new Webhook(env.get("BM_RESEND_WEBHOOK_SECRET") || "").verify(raw, {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    });
    event = JSON.parse(raw);
  } catch {
    return respond({ error: "Invalid webhook" }, 400);
  }
  // An authenticated shared-team event is harmless while delivery is disabled.
  // Do not cause endless provider retries or touch the database in this mode.
  if (
    production &&
    (env.get("BM_LIVE_DELIVERY_ENABLED") !== "true" ||
      env.get("BM_DELIVERY_MODE") !== "resend")
  )
    return respond({ ignored: true });
  if (
    ![
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.bounced",
      "email.failed",
      "email.complained",
      "email.suppressed",
      "email.opened",
      "email.clicked",
    ].includes(event.type)
  )
    return respond({ ignored: true });
  const key = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return respond({ error: "Server configuration required" }, 503);
  const result = await sendFetch(
    `${url}/rest/v1/rpc/bm_record_provider_event_scoped`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_event: req.headers.get("svix-id"),
        p_message: event.data?.email_id,
        p_kind: event.type,
        p_at: event.created_at,
        p_environment: production ? "production" : "staging",
      }),
    },
  );
  if (!result.ok)
    return respond({ error: "Awaiting provider receipt reconciliation" }, 503);
  if ((await result.json()) !== true) return respond({ ignored: true });
  return respond({ recorded: true });
}
Deno.serve((req) => deliveryHandler(req, Deno.env));
