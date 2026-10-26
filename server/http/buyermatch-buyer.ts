import {
  getBearerToken,
  getSupabaseAdminClient,
} from "../../api/_accountAuth.js";
import {
  buyerAccountInput,
  buyerAccountOperation,
} from "../buyermatch/buyer-account.js";
import { responseEnvironment } from "../buyermatch/response-config.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  try {
    const db = getSupabaseAdminClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at || data.user.is_anonymous)
      return res.status(401).json({ error: "Confirmed sign in required" });
    const authorized = await db.rpc("bm_buyer_account_authorized", {
      p_user: data.user.id,
    });
    if (authorized.error || authorized.data !== true)
      return res.status(403).json({ error: "Account unavailable" });
    // Existing disabled application identities cannot obtain a second access path.
    const profile = await db
      .from("account_profiles")
      .select("account_status")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (
      profile.error ||
      (profile.data &&
        !["active", "Active"].includes(profile.data.account_status))
    )
      return res.status(403).json({ error: "Account unavailable" });
    const [workspace, assignment] = await Promise.all([
      db
        .from("workspaces")
        .select("account_status")
        .eq("owner_user_id", data.user.id)
        .maybeSingle(),
      db
        .from("workspace_plan_assignments")
        .select("access_status")
        .eq("user_id", data.user.id)
        .maybeSingle(),
    ]);
    if (
      workspace.error ||
      assignment.error ||
      [workspace.data?.account_status, assignment.data?.access_status].some(
        (value) => ["Deactivated", "Deleted"].includes(value || ""),
      )
    )
      return res.status(403).json({ error: "Account unavailable" });
    if (typeof req.body === "string" && Buffer.byteLength(req.body) > 2900000)
      return res.status(413).json({ error: "File too large" });
    const input = buyerAccountInput.parse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body,
    );
    if (
      input.action === "create" &&
      process.env.DBP_REGISTRATION_PAUSED !== "false"
    )
      return res.status(503).json({
        error:
          "New buyer profiles are paused. Existing linked profiles remain available.",
      });
    return res
      .status(200)
      .json(
        await buyerAccountOperation(
          db,
          data.user,
          input,
          responseEnvironment(),
        ),
      );
  } catch {
    // No database details, identifiers, tokens, file paths or submitted values in errors.
    return res.status(400).json({
      error:
        "Buyer account unavailable or update not saved. Check your invitation, reload the latest profile, and try again only after reviewing the error.",
    });
  }
}
