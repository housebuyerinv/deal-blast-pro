// SERVER ONLY. Never bundle this module or its buyer inputs into the client.
export const ENGINE_VERSION = "1.0.0";
const present = (x) => x !== undefined && x !== null && x !== "";
const normalized = (x) => String(x).trim().toLowerCase();
const includes = (xs, x) => xs?.some((v) => normalized(v) === normalized(x));
const numericFields = [
  "price",
  "beds",
  "baths",
  "sqft",
  "units",
  "capRate",
  "repairs",
  "arv",
];
export function validateDeal(deal) {
  for (const key of ["state", "city", "assetType"])
    if (!present(deal[key])) throw new Error(`Missing ${key}`);
  for (const key of numericFields)
    if (
      present(deal[key]) &&
      (typeof deal[key] !== "number" ||
        !Number.isFinite(deal[key]) ||
        deal[key] < 0)
    )
      throw new Error(`Invalid ${key}`);
  if (!(deal.price > 0)) throw new Error("Price must be positive");
  if (present(deal.zip) && !/^\d{5}$/.test(String(deal.zip)))
    throw new Error("ZIP must have five digits");
}
export function matchBuyer(deal, buyer, now = new Date()) {
  validateDeal(deal);
  const failed = [],
    unknown = [],
    checks = [];
  const check = (name, weight, value) => {
    if (value === null) unknown.push(name);
    else {
      checks.push({ name, weight, value });
      if (!value) failed.push(name);
    }
  };
  if (buyer.status !== "active")
    return {
      buyerId: buyer.id,
      eligible: false,
      score: 0,
      confidence: 0,
      reasons: ["Buyer not active"],
      unknown: [],
    };
  // Explicit exclusions always override positive criteria.
  for (const [field, list] of [
    ["zip", buyer.excludedZips],
    ["city", buyer.excludedCities],
    ["condition", buyer.excludedConditions],
    ["occupancy", buyer.excludedOccupancies],
  ]) {
    if (list?.length)
      check(
        `Excluded ${field}`,
        1,
        present(deal[field]) ? !includes(list, deal[field]) : null,
      );
  }
  // Markets are alternatives; restrictions within each market are conjunctive.
  const markets = buyer.markets || [];
  const marketFit = markets.map((m) => {
    if (normalized(m.state) !== normalized(deal.state)) return false;
    if (m.city && normalized(m.city) !== normalized(deal.city)) return false;
    if (m.zips?.length)
      return present(deal.zip) ? includes(m.zips, deal.zip) : null;
    return true;
  });
  check(
    "Market",
    30,
    !markets.length
      ? null
      : marketFit.includes(true)
        ? true
        : marketFit.includes(null)
          ? null
          : false,
  );
  check(
    "Asset type",
    20,
    buyer.assetTypes?.length
      ? includes(buyer.assetTypes, deal.assetType)
      : null,
  );
  if (
    !present(buyer.minPrice) &&
    !present(buyer.maxPrice) &&
    !present(buyer.maxArvRatio)
  )
    check("Price criteria", 20, null);
  const ranges = [
    ["price", "minPrice", "maxPrice", 20],
    ["beds", "minBeds", null, 5],
    ["baths", "minBaths", null, 5],
    ["sqft", "minSqft", "maxSqft", 5],
    ["units", "minUnits", "maxUnits", 5],
    ["capRate", "minCapRate", null, 5],
    ["repairs", null, "maxRepairs", 5],
    ["noi", "minNoi", null, 5],
    ["leaseYears", "minLeaseYears", null, 5],
    ["debtServiceCoverage", "minDebtServiceCoverage", null, 5],
  ];
  for (const [field, min, max, weight] of ranges) {
    if (!present(buyer[min]) && !(max && present(buyer[max]))) continue;
    check(
      field,
      weight,
      !present(deal[field])
        ? null
        : (!present(buyer[min]) || deal[field] >= buyer[min]) &&
            (!max || !present(buyer[max]) || deal[field] <= buyer[max]),
    );
  }
  for (const [field, list] of [
    ["condition", buyer.conditions],
    ["occupancy", buyer.occupancies],
    ["dealType", buyer.dealTypes],
    ["financing", buyer.financingPreferences],
  ]) {
    if (list?.length)
      check(
        field,
        5,
        present(deal[field]) ? includes(list, deal[field]) : null,
      );
  }
  if (present(buyer.maxArvRatio))
    check(
      "ARV formula",
      20,
      deal.arv > 0 && present(deal.repairs)
        ? deal.price + deal.repairs <= deal.arv * buyer.maxArvRatio
        : null,
    );
  const verifiedTime = Date.parse(buyer.criteriaVerifiedAt);
  const age = Number.isFinite(verifiedTime)
    ? Math.max(0, (now - verifiedTime) / 86400000)
    : null;
  const freshness =
    age === null ? 0 : age <= 30 ? 100 : age <= 90 ? 80 : age <= 180 ? 50 : 20;
  const weight = checks.reduce((s, c) => s + c.weight, 0);
  const criteriaScore = weight
    ? (checks.reduce((s, c) => s + c.weight * Number(c.value), 0) / weight) *
      100
    : 0;
  const confidence = Math.round(
    (weight / (weight + unknown.length * 10 || 1)) * 100,
  );
  const eligible = failed.length === 0 && marketFit.includes(true);
  const score = eligible
    ? Math.round(criteriaScore * 0.85 + freshness * 0.15)
    : 0;
  return {
    buyerId: buyer.id,
    eligible,
    score,
    confidence,
    freshness,
    reasons: failed,
    unknown,
    verified: buyer.verificationLevel === "closing_verified",
    recentlyActive:
      Number.isFinite(Date.parse(buyer.lastActiveAt)) &&
      (now - Date.parse(buyer.lastActiveAt)) / 86400000 >= 0 &&
      (now - Date.parse(buyer.lastActiveAt)) / 86400000 <= 30,
  };
}
export function analyzeDeal(deal, buyers, now = new Date()) {
  const seen = new Set();
  const matches = buyers
    .filter((b) => {
      if (!b.id || seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    })
    .map((b) => matchBuyer(deal, b, now));
  const eligible = matches.filter((m) => m.eligible);
  const strong = eligible.filter(
    (m) => m.score >= 80 && m.confidence >= 80 && !m.unknown.length,
  );
  return {
    engineVersion: ENGINE_VERSION,
    analyzedAt: now.toISOString(),
    score: eligible.length
      ? Math.round(eligible.reduce((s, m) => s + m.score, 0) / eligible.length)
      : 0,
    strongMatches: strong.length,
    possibleMatches: eligible.length - strong.length,
    totalMatches: eligible.length,
    verifiedClosers: eligible.filter((m) => m.verified).length,
    recentlyActive: eligible.filter((m) => m.recentlyActive).length,
    missingCriteriaCount: eligible.filter((m) => m.unknown.length).length,
    matches,
  };
}
// Explicit allowlist prevents names, IDs, contact data or private criteria leaking.
export function publicAnalysis(result) {
  const {
    engineVersion,
    analyzedAt,
    score,
    strongMatches,
    possibleMatches,
    totalMatches,
    verifiedClosers,
    recentlyActive,
    missingCriteriaCount,
  } = result;
  return {
    engineVersion,
    analyzedAt,
    score,
    strongMatches,
    possibleMatches,
    totalMatches,
    verifiedClosers,
    recentlyActive,
    missingCriteriaCount,
    scoreMeaning:
      "Criteria fit with this network, not a probability of closing.",
  };
}
export function priceSensitivity(deal, buyers, prices, now = new Date()) {
  return [...new Set(prices)].map((price) => ({
    price,
    ...publicAnalysis(analyzeDeal({ ...deal, price }, buyers, now)),
  }));
}
