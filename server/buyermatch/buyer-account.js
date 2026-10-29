import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  criteriaSchema,
  identityHash,
  encryptIdentity,
  decryptIdentity,
} from "./security.js";
import { hashToken } from "./tokens.js";
import { safeConversationText } from "./conversation.js";

export const buyerConsent = Object.freeze({
  version: "buyer-maintenance-v1",
  text: "I confirm these criteria are accurate and authorize BuyerMatch to store these updates and private proof documents for buyer review. Invitation consent is optional. Changing criteria requires review; uploading proof does not verify funds or activate delivery.",
});
const base = {
  operationKey: z.string().uuid(),
  revision: z.number().int().nonnegative().safe(),
};
export const buyerAccountInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account") }).strict(),
  z
    .object({
      action: z.literal("profile"),
      ...base,
      name: z.string().trim().min(1).max(120),
      company: z.string().trim().max(120),
      phone: z.string().trim().max(40),
    })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      operationKey: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      criteria: criteriaSchema,
      consentVersion: z.literal(buyerConsent.version),
      accurate: z.literal(true),
      invitations: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("claim"),
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("criteria"),
      ...base,
      criteria: criteriaSchema,
      consentVersion: z.literal(buyerConsent.version),
      accurate: z.literal(true),
      invitations: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("proof"),
      ...base,
      content: z.string().min(4).max(2796204),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z.object({ action: z.literal("proof-link"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("withdraw"), ...base }).strict(),
  z
    .object({
      action: z.literal("history"),
      before: z.string().datetime({ offset: true }).optional(),
      beforeId: z.string().uuid().optional(),
    })
    .strict(),
]);
const bucket = "bm-buyer-self-service";
function assertResult(result) {
  if (result.error || result.data == null) throw new Error("Unavailable");
  return result.data;
}
export function proofBytes(content, mime) {
  const bytes = Buffer.from(content, "base64");
  if (
    bytes.length < 1 ||
    bytes.length > 2097152 ||
    bytes.toString("base64") !== content
  )
    throw new Error("Invalid proof");
  const valid =
    mime === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw new Error("Invalid proof");
  return bytes;
}

// Service client is injected only by the authenticated HTTP adapter, never by input.
export async function buyerAccountOperation(db, user, input, environment) {
  if (!user?.id || !user.email || !user.email_confirmed_at || user.is_anonymous)
    throw new Error("Unavailable");
  if (input.action === "create")
    return assertResult(
      await db.rpc("bm_buyer_account_create", {
        p_user: user.id,
        p_key: input.operationKey,
        p_identity_hash: identityHash(user.email),
        p_ciphertext: encryptIdentity({
          name: input.name,
          email: user.email.trim().toLowerCase(),
        }),
        p_environment: environment,
        p_payload: {
          name: input.name,
          criteria: input.criteria,
          consentVersion: input.consentVersion,
          accurate: true,
          invitations: input.invitations,
        },
      }),
    );
  if (input.action === "claim") {
    return assertResult(
      await db.rpc("bm_buyer_account_claim", {
        p_user: user.id,
        p_hash: hashToken(input.token),
        p_identity_hash: identityHash(user.email),
        p_environment: environment,
      }),
    );
  }
  const found = await db
    .from("bm_buyer_accounts")
    .select("buyer_id,revision")
    .eq("user_id", user.id)
    .maybeSingle();
  if (found.error) throw new Error("Unavailable");
  if (!found.data && input.action === "account")
    return { linked: false, consent: buyerConsent };
  const account = assertResult(found);
  const buyer = assertResult(
    await db
      .from("bm_buyers")
      .select(
        "criteria,status,opted_out_at,synthetic,identity_ciphertext,identity_hash",
      )
      .eq("id", account.buyer_id)
      .single(),
  );
  if (environment === "production" && buyer.synthetic)
    throw new Error("Unavailable");
  let identity;
  if (input.action === "account" || input.action === "profile") {
    identity = decryptIdentity(buyer.identity_ciphertext);
    if (
      typeof identity.email !== "string" ||
      identityHash(identity.email) !== buyer.identity_hash
    )
      throw new Error("Unavailable");
  }
  if (input.action === "account") {
    const proofs = assertResult(
      await db
        .from("bm_buyer_proofs")
        .select("id,expires_on,created_at")
        .eq("buyer_id", account.buyer_id)
        .order("created_at", { ascending: false }),
    );
    const reviews = proofs.length
      ? assertResult(
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
      linked: true,
      revision: Number(account.revision),
      criteria: buyer.criteria,
      profile: (() => {
        return {
          name: String(identity.name || ""),
          company: String(identity.company || ""),
          phone: String(identity.phone || ""),
        };
      })(),
      status: buyer.status,
      optedOut: !!buyer.opted_out_at,
      consent: buyerConsent,
      proofs: proofs.map((p) => ({
        id: p.id,
        expiresOn: p.expires_on,
        createdAt: p.created_at,
        status:
          p.expires_on <= new Date().toISOString().slice(0, 10)
            ? "expired"
            : reviews.find((r) => r.proof_id === p.id)?.decision ||
              "pending_review",
      })),
    };
  }
  if (input.action === "history") {
    if (!!input.before !== !!input.beforeId) throw new Error("Invalid cursor");
    const rows = assertResult(
      await db.rpc("bm_buyer_account_history", {
        p_user: user.id,
        p_before: input.before || null,
        p_before_id: input.beforeId || null,
      }),
    );
    return {
      items: rows.slice(0, 25).map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        status: row.status,
        property: row.property,
        responses: row.responses || [],
        messages: (row.messages || []).map((m) => ({
          sender: m.sender,
          body: safeConversationText(m.body),
          createdAt: m.createdAt,
        })),
        offers: (row.offers || []).map((o) => ({
          amountCents: o.amountCents,
          terms: safeConversationText(o.terms),
          createdAt: o.createdAt,
        })),
      })),
      next:
        rows.length > 25
          ? { before: rows[24].createdAt, beforeId: rows[24].id }
          : null,
    };
  }
  if (input.action === "proof-link") {
    const proof = assertResult(
      await db
        .from("bm_buyer_proofs")
        .select("storage_path")
        .eq("id", input.id)
        .eq("buyer_id", account.buyer_id)
        .single(),
    );
    const signed = assertResult(
      await db.storage
        .from(bucket)
        .createSignedUrl(proof.storage_path, 60, { download: true }),
    );
    return { url: signed.signedUrl }; // Short-lived private download; never logged or persisted.
  }
  let payload;
  let ciphertext;
  if (input.action === "criteria")
    payload = {
      criteria: input.criteria,
      consentVersion: input.consentVersion,
      accurate: true,
      invitations: input.invitations,
    };
  else if (input.action === "withdraw") payload = {};
  else if (input.action === "profile") {
    payload = { name: input.name, company: input.company, phone: input.phone };
    ciphertext = encryptIdentity({
      ...identity,
      ...payload,
    });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const expiration = Date.parse(`${input.expiresOn}T00:00:00Z`);
    if (
      !Number.isFinite(expiration) ||
      new Date(expiration).toISOString().slice(0, 10) !== input.expiresOn ||
      input.expiresOn <= today ||
      expiration > Date.now() + 366 * 86400000
    )
      throw new Error("Invalid expiration");
    const bytes = proofBytes(input.content, input.mime);
    payload = {
      id: input.operationKey,
      path: `${user.id}/${input.operationKey}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mime: input.mime,
      bytes: bytes.length,
      expiresOn: input.expiresOn,
    };
    // Replay is checked before touching immutable storage, and then atomically by RPC.
    const prior = await db
      .from("bm_buyer_account_events")
      .select("payload")
      .eq("user_id", user.id)
      .eq("operation_key", input.operationKey)
      .maybeSingle();
    if (prior.error) throw new Error("Unavailable");
    if (!prior.data) {
      assertResult(
        await db.rpc("bm_buyer_account_reserve_proof", {
          p_user: user.id,
          p_key: input.operationKey,
          p_revision: input.revision,
          p_payload: payload,
        }),
      );
      assertResult(
        await db.storage.from(bucket).upload(payload.path, bytes, {
          contentType: input.mime,
          upsert: false,
        }),
      );
    }
  }
  const result = await db.rpc("bm_buyer_account_mutate", {
    p_user: user.id,
    p_key: input.operationKey,
    p_revision: input.revision,
    p_kind: input.action,
    p_payload: payload,
    ...(ciphertext ? { p_ciphertext: ciphertext } : {}),
  });
  // Failed mutations retain any new immutable object for scoped orphan review, never overwrite/delete proof.
  return assertResult(result);
}
