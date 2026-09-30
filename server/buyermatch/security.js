import { Buffer } from "node:buffer";
import process from "node:process";
import { z } from "zod";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "node:crypto";
export const states =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  );
const text = z.string().trim().max(500);
const number = z.number().finite().nonnegative().max(1e12).optional();
export const dealSchema = z.object({
  address: text.min(3),
  city: text.min(1),
  state: z.enum(states),
  zip: z.string().regex(/^\d{5}$/),
  assetType: z.enum([
    "sfh",
    "condo",
    "townhouse",
    "land",
    "multifamily",
    "commercial",
    "stnl",
  ]),
  price: z.number().finite().positive().max(1e12),
  arv: number,
  repairs: number,
  beds: number,
  baths: number,
  sqft: number,
  units: number,
  noi: number,
  capRate: number,
  tenant: text.optional(),
  leaseEnd: text.optional(),
  condition: text.optional(),
  occupancy: text.optional(),
  dealType: text.optional(),
  closingTimeline: text.optional(),
  financing: text.optional(),
  leaseYears: number,
  debtServiceCoverage: number,
});
export const titleSchema = z.object({
  company: text,
  name: text,
  email: z.string().email(),
  phone: text.min(7),
  eoc: z.string().date(),
});
export function safeAnalysis(result) {
  const bucket = (n) =>
    n < 5
      ? "Fewer than 5"
      : `${Math.floor(n / 5) * 5}–${Math.floor(n / 5) * 5 + 4}`;
  return {
    engineVersion: result.engineVersion,
    analyzedAt: result.analyzedAt,
    score: result.totalMatches < 5 ? null : Math.round(result.score / 10) * 10,
    strongMatches: bucket(result.strongMatches),
    possibleMatches: bucket(result.possibleMatches),
    verifiedClosers: bucket(result.verifiedClosers),
    recentlyActive: bucket(result.recentlyActive),
    explanation:
      "Criteria fit with the private network, not a probability of closing. Small cohorts (including zero) and scores are suppressed to protect buyer privacy. Unknown criteria cannot establish a strong match.",
  };
}
export function assertOwner(deal, userId) {
  if (!deal || deal.owner_id !== userId)
    throw Object.assign(new Error("Deal not found"), { status: 404 });
}
export function assertAdmin(account) {
  if (!account.isOwnerAdmin)
    throw Object.assign(new Error("Network administrator required"), {
      status: 403,
    });
}
function key() {
  const value = Buffer.from(
    process.env.BUYERMATCH_IDENTITY_KEY || "",
    "base64",
  );
  if (value.length !== 32)
    throw new Error("Identity encryption is not configured");
  return value;
}
export function encryptIdentity(identity) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  return [
    iv.toString("base64"),
    Buffer.concat([
      cipher.update(JSON.stringify(identity), "utf8"),
      cipher.final(),
    ]).toString("base64"),
    cipher.getAuthTag().toString("base64"),
  ].join(".");
}
export function decryptIdentity(value) {
  const [iv, data, tag] = value.split(".").map((x) => Buffer.from(x, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
  );
}
export function identityHash(email) {
  return createHmac("sha256", key())
    .update(email.trim().toLowerCase())
    .digest("hex");
}
export function normalizeImport(rows, mapping) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500)
    throw new Error("Import 1–500 rows per batch");
  const seen = new Set();
  return rows.map((row, index) => {
    const get = (k) => String(row[mapping[k]] ?? "").trim();
    const email = get("email").toLowerCase();
    const errors = [];
    if (!z.string().email().safeParse(email).success)
      errors.push("Valid email required");
    const state = get("state").toUpperCase();
    if (!states.includes(state)) errors.push("Review state");
    const assetTypes = get("assetTypes")
      .toLowerCase()
      .split(/[;,|]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      !assetTypes.length ||
      assetTypes.some(
        (x) =>
          ![
            "sfh",
            "condo",
            "townhouse",
            "land",
            "multifamily",
            "commercial",
            "stnl",
          ].includes(x),
      )
    )
      errors.push("Review asset types");
    const zips = get("zips")
      .split(/[;,|]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (zips.some((x) => !/^\d{5}$/.test(x))) errors.push("Review ZIP codes");
    const criteria = {
      markets: state
        ? [
            {
              state,
              ...(get("city") ? { city: get("city") } : {}),
              ...(zips.length ? { zips } : {}),
            },
          ]
        : [],
      assetTypes,
    };
    for (const field of [
      "minPrice",
      "maxPrice",
      "maxArvRatio",
      "maxRepairs",
      "minBeds",
      "minBaths",
      "minSqft",
      "minUnits",
      "minCapRate",
      "minNoi",
    ]) {
      const raw = get(field);
      if (raw) {
        const n = Number(raw.replace(/[$,]/g, ""));
        if (!Number.isFinite(n) || n < 0 || (field === "maxArvRatio" && n > 1))
          errors.push(`Review ${field}`);
        else criteria[field] = n;
      }
    }
    if (criteria.minPrice > criteria.maxPrice)
      errors.push("Minimum price exceeds maximum");
    for (const field of [
      "excludedZips",
      "excludedCities",
      "excludedConditions",
      "excludedOccupancies",
      "conditions",
      "occupancies",
      "dealTypes",
      "financingPreferences",
    ]) {
      const value = get(field);
      if (value)
        criteria[field] = value
          .split(/[;|]/)
          .map((x) => x.trim())
          .filter(Boolean);
    }
    const duplicate = seen.has(email);
    seen.add(email);
    return {
      row: index + 1,
      identity: {
        name: get("name"),
        email,
        phone: get("phone").replace(/[^+\d]/g, ""),
        company: get("company"),
      },
      criteria,
      notes: get("notes"),
      consentEvidence: get("consentEvidence"),
      errors,
      duplicate,
    };
  });
}
export function reminderDates(eoc) {
  return [-14, -7, -3, 0, 3].map((offset) => ({
    offset,
    date: new Date(Date.parse(eoc + "T12:00:00Z") + offset * 86400000)
      .toISOString()
      .slice(0, 10),
  }));
}
export const criteriaSchema = z
  .object({
    markets: z
      .array(
        z.object({
          state: z.enum(states),
          city: text.min(1).optional(),
          zips: z.array(z.string().regex(/^\d{5}$/)).optional(),
        }),
      )
      .max(500)
      .default([]),
    assetTypes: z
      .array(
        z.enum([
          "sfh",
          "condo",
          "townhouse",
          "land",
          "multifamily",
          "commercial",
          "stnl",
        ]),
      )
      .default([]),
    minPrice: number,
    maxPrice: number,
    minBeds: number,
    minBaths: number,
    minSqft: number,
    maxSqft: number,
    minUnits: number,
    maxUnits: number,
    minCapRate: number,
    minNoi: number,
    maxRepairs: number,
    minLeaseYears: number,
    minDebtServiceCoverage: number,
    maxArvRatio: z.number().min(0).max(1).optional(),
    excludedZips: z.array(z.string().regex(/^\d{5}$/)).optional(),
    excludedCities: z.array(text).optional(),
    excludedConditions: z.array(text).optional(),
    excludedOccupancies: z.array(text).optional(),
    conditions: z.array(text).optional(),
    occupancies: z.array(text).optional(),
    dealTypes: z.array(text).optional(),
    financingPreferences: z.array(text).optional(),
  })
  .strict()
  .refine(
    (c) =>
      c.minPrice === undefined ||
      c.maxPrice === undefined ||
      c.minPrice <= c.maxPrice,
    "Invalid price range",
  );
