import { z } from "zod";
import { createHash } from "node:crypto";
const ref = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/);
const cents = z.number().int().positive().max(1000000000000);
export const conversionReasons = [
  "inventory_control",
  "unrealistic_price",
  "poor_matching",
  "low_response",
  "missing_emd",
  "closing_execution",
  "seller_withdrew",
  "buyer_withdrew",
  "title_issue",
  "financing",
  "other_documented",
];
const reason = z.enum(conversionReasons);
const identity = z
  .object({
    unit: ref,
    parcelRef: ref.optional(),
    contractRef: ref,
    interestRef: ref,
    transactionRef: ref,
    source: z.string().trim().min(1).max(80),
    jvPartner: z.string().trim().max(80),
    market: z.string().trim().min(1).max(80),
    crmDealRef: z.string().uuid().optional(),
  })
  .strict();
const payloads = {
  identity,
  inventory_verified: z.object({ confirmed: z.literal(true) }).strict(),
  interested: z.object({ counterpartyRef: ref }).strict(),
  written_offer: z
    .object({
      offerRef: ref,
      counterpartyRef: ref,
      amountCents: cents,
      confirmed: z.literal(true),
    })
    .strict(),
  offer_status: z
    .object({
      offerRef: ref,
      status: z.enum(["accepted", "rejected", "withdrawn"]),
    })
    .strict(),
  emd_pending: z.object({ offerRef: ref }).strict(),
  emd_confirmed: z
    .object({
      offerRef: ref,
      amountCents: cents,
      confirmed: z.literal(true),
      verifier: z.enum(["escrow", "title", "bank"]),
    })
    .strict(),
  emd_failed: z.object({ offerRef: ref, reason }).strict(),
  closing_scheduled: z.object({ scheduledDate: z.string().date() }).strict(),
  closed: z.object({ amountCents: cents, confirmed: z.literal(true) }).strict(),
  lost: z.object({ reason }).strict(),
  stalled: z.object({ reason }).strict(),
  withdrawn: z.object({ reason }).strict(),
  canceled: z.object({ reason }).strict(),
  reopened: z.object({ reason }).strict(),
  fee_projected: z.object({ amountCents: cents }).strict(),
  fee_invoiced: z.object({ amountCents: cents }).strict(),
  fee_received: z
    .object({ amountCents: cents, confirmed: z.literal(true) })
    .strict(),
  fee_refunded: z
    .object({ amountCents: cents, confirmed: z.literal(true) })
    .strict(),
  void: z.object({ eventId: z.string().uuid(), reason }).strict(),
};
export const conversionKinds = Object.keys(payloads);
export function conversionRecord(value) {
  const input = z
    .object({
      dealId: z.string().uuid(),
      operationKey: z.string().uuid(),
      kind: z.enum(conversionKinds),
      occurredAt: z.string().datetime({ offset: true }),
      evidenceRef: ref,
      payload: z.unknown(),
    })
    .strict()
    .parse(value);
  return { ...input, payload: payloads[input.kind].parse(input.payload) };
}
const normalized = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
const stable = (value) =>
  JSON.stringify(
    value && typeof value === "object"
      ? Array.isArray(value)
        ? value.map((v) => JSON.parse(stable(v)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, JSON.parse(stable(value[k]))]),
          )
      : value,
  );
export function propertyIdentity(property, metadata = {}) {
  const stale =
    metadata.propertySnapshot &&
    stable(metadata.propertySnapshot) !== stable(property);
  const unit = normalized(metadata.unit || property.unit);
  const address = normalized(property.address),
    city = normalized(property.city),
    state = normalized(property.state),
    zip = normalized(property.zip);
  const physical = [
    state,
    city,
    zip,
    metadata.parcelRef
      ? "parcel:" + normalized(metadata.parcelRef)
      : [address, city, state, zip].join("|"),
    unit,
  ].join("|");
  return {
    propertyKey:
      !stale && unit && address && city && state && zip
        ? createHash("sha256").update(physical).digest("hex")
        : null,
    candidateKey: [address, city, state, zip].join("|"),
    verifiedIdentity: Boolean(
      !stale &&
      unit &&
      metadata.contractRef &&
      metadata.interestRef &&
      metadata.transactionRef,
    ),
  };
}
export async function conversionRequest(db, owner, action, body) {
  if (action === "conversion-report") {
    const result = await db.rpc("bm_conversion_snapshot", { p_owner: owner });
    if (result.error)
      throw Error(
        "Conversion records unavailable. Verify the local migration and report size.",
      );
    return result.data;
  }
  if (action === "conversion-record") {
    const value = { ...body };
    delete value.action;
    const record = conversionRecord(value);
    const deal = await db
      .from("bm_deals")
      .select("property")
      .eq("id", record.dealId)
      .eq("owner_id", owner)
      .maybeSingle();
    if (deal.error || !deal.data)
      throw Object.assign(Error("Deal not found"), { status: 404 });
    if (record.kind === "identity") {
      record.payload.propertySnapshot = deal.data.property;
      record.payload.propertyKey = propertyIdentity(
        deal.data.property,
        record.payload,
      ).propertyKey;
    }
    const result = await db.rpc("bm_conversion_record", {
      p_owner: owner,
      p_deal: record.dealId,
      p_key: record.operationKey,
      p_kind: record.kind,
      p_at: record.occurredAt,
      p_evidence: record.evidenceRef,
      p_payload: record.payload,
    });
    if (result.error)
      throw Object.assign(
        Error(
          "Evidence not saved. Refresh before retrying the same operation; verify ownership, reference and occurrence time.",
        ),
        { status: 409 },
      );
    return result.data;
  }
  const value = z
    .object({
      action: z.literal("conversion-review"),
      sourceId: z.string().uuid(),
      targetId: z.string().uuid().nullable(),
      operationKey: z.string().uuid(),
      reason: z.enum([
        "same_submission",
        "duplicate_contract",
        "separate_transactions",
        "incorrect_merge",
      ]),
    })
    .strict()
    .parse(body);
  const result = await db.rpc("bm_conversion_review", {
    p_owner: owner,
    p_source: value.sourceId,
    p_target: value.targetId,
    p_key: value.operationKey,
    p_reason: value.reason,
  });
  if (result.error)
    throw Object.assign(
      Error(
        "Duplicate review not saved. Identities must identify the same unit, contract, interest and transaction; chains and cross-owner links are forbidden.",
      ),
      { status: 409 },
    );
  return result.data;
}
