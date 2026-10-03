import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeDeal,
  publicAnalysis,
  priceSensitivity,
  matchBuyer,
} from "../../server/buyermatch/matching.js";
import {
  distributionReadiness,
  calculateFee,
  closingAuthorizationStatus,
} from "../../server/buyermatch/workflow.js";
const now = new Date("2026-09-30T16:00:00Z");
const deal = {
  state: "TN",
  city: "Memphis",
  zip: "38111",
  assetType: "sfh",
  price: 60000,
  beds: 3,
  arv: 125000,
  repairs: 25000,
};
const buyer = {
  id: "private-1",
  name: "Secret Buyer",
  email: "private@example.com",
  status: "active",
  markets: [{ state: "TN", city: "Memphis", zips: ["38111"] }],
  assetTypes: ["sfh"],
  maxPrice: 70000,
  minBeds: 3,
  maxArvRatio: 0.7,
  criteriaVerifiedAt: "2026-09-20",
  lastActiveAt: "2026-09-25",
  verificationLevel: "closing_verified",
};
test("exact verified criteria produce a strong match", () =>
  assert.equal(analyzeDeal(deal, [buyer], now).strongMatches, 1));
test("hard price and explicit exclusion remove buyer", () => {
  assert.equal(
    matchBuyer({ ...deal, price: 80000 }, buyer, now).eligible,
    false,
  );
  assert.equal(
    matchBuyer(deal, { ...buyer, excludedZips: ["38111"] }, now).eligible,
    false,
  );
});
test("unknown rehabilitation cost cannot count as strong", () => {
  const r = analyzeDeal({ ...deal, repairs: undefined }, [buyer], now);
  assert.equal(r.strongMatches, 0);
  assert.equal(r.possibleMatches, 1);
});
test("missing ZIP cannot satisfy ZIP restricted market", () =>
  assert.equal(
    matchBuyer({ ...deal, zip: undefined }, buyer, now).eligible,
    false,
  ));
test("inactive and duplicate buyers never inflate counts", () => {
  assert.equal(analyzeDeal(deal, [buyer, buyer], now).totalMatches, 1);
  assert.equal(
    analyzeDeal(deal, [{ ...buyer, status: "inactive" }], now).totalMatches,
    0,
  );
});
test("public result contains no buyer identity or private criteria", () => {
  const result = publicAnalysis(analyzeDeal(deal, [buyer], now));
  const s = JSON.stringify(result);
  for (const v of [
    buyer.id,
    buyer.name,
    buyer.email,
    "38111",
    "markets",
    "matches",
  ])
    assert.equal(s.includes(v), false);
});
test("price simulator applies actual acquisition formula", () => {
  const r = priceSensitivity(deal, [buyer], [60000, 70000], now);
  assert.equal(r[0].totalMatches, 1);
  assert.equal(r[1].totalMatches, 0);
});
test("invalid prices rejected", () =>
  assert.throws(() => analyzeDeal({ ...deal, price: NaN }, [buyer], now)));
test("unconfigured exposure cannot proceed", () =>
  assert.equal(distributionReadiness({}).ready, false));
test("fees default disabled, cap applied using cents", () => {
  assert.equal(calculateFee(1000000, { enabled: false }).amountCents, null);
  assert.equal(
    calculateFee(3000000, {
      approved: true,
      enabled: true,
      mode: "percentage",
      basisPoints: 1000,
      minimumCents: 50000,
      maximumCents: 250000,
    }).amountCents,
    250000,
  );
});
test("signature alone does not mean title accepted", () =>
  assert.equal(
    closingAuthorizationStatus({ buyerSelected: true, userSigned: true }),
    "signed_awaiting_title",
  ));
