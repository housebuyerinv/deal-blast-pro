import { z } from "zod";
const uuid = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("admin-buyer-proof-queue"),
      after: uuid.optional(),
    })
    .strict(),
  z.object({ action: z.literal("admin-buyer-proof-link"), id: uuid }).strict(),
  z
    .object({
      action: z.literal("admin-buyer-proof-review"),
      id: uuid,
      decision: z.enum(["approved", "rejected"]),
    })
    .strict(),
]);
const checked = (r) => {
  if (r.error || r.data == null) throw Error("Proof review unavailable");
  return r.data;
};
export async function buyerProofReview(db, user, body) {
  if (
    !user?.email_confirmed_at ||
    user.email?.toLowerCase() !== "housebuyerinv@gmail.com"
  )
    throw Error("Owner review required");
  if (
    checked(
      await db.rpc("bm_buyer_account_authorized", { p_user: user.id }),
    ) !== true
  )
    throw Error("Owner review required");
  const profile = checked(
    await db
      .from("account_profiles")
      .select("role,account_status")
      .eq("user_id", user.id)
      .single(),
  );
  if (profile.role !== "Admin" || profile.account_status !== "Active")
    throw Error("Owner review required");
  const input = schema.parse(body);
  if (input.action === "admin-buyer-proof-review")
    return checked(
      await db.rpc("bm_buyer_proof_review", {
        p_actor: user.id,
        p_proof: input.id,
        p_decision: input.decision,
      }),
    );
  if (input.action === "admin-buyer-proof-link") {
    const proof = checked(
      await db
        .from("bm_buyer_proofs")
        .select("storage_path")
        .eq("id", input.id)
        .single(),
    );
    return {
      url: checked(
        await db.storage
          .from("bm-buyer-self-service")
          .createSignedUrl(proof.storage_path, 60, { download: true }),
      ).signedUrl,
    };
  }
  let query = db
    .from("bm_buyer_proofs")
    .select("id,buyer_id,expires_on,created_at")
    .order("id")
    .limit(26);
  if (input.after) query = query.gt("id", input.after);
  const proofs = checked(await query);
  const reviews = proofs.length
    ? checked(
        await db
          .from("bm_buyer_proof_reviews")
          .select("proof_id,decision")
          .in(
            "proof_id",
            proofs.map((p) => p.id),
          ),
      )
    : [];
  return {
    items: proofs.slice(0, 25).map((p) => ({
      id: p.id,
      buyerId: p.buyer_id,
      expiresOn: p.expires_on,
      createdAt: p.created_at,
      decision: reviews.find((r) => r.proof_id === p.id)?.decision || null,
    })),
    next: proofs.length > 25 ? proofs[24].id : null,
  };
}
