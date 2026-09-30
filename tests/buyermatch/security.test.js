import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  safeAnalysis,
  assertOwner,
  assertAdmin,
  dealSchema,
  normalizeImport,
  encryptIdentity,
  decryptIdentity,
  identityHash,
  reminderDates,
} from "../../server/buyermatch/security.js";
import { analyzeDeal } from "../../server/buyermatch/matching.js";
process.env.BUYERMATCH_IDENTITY_KEY = randomBytes(32).toString("base64");
const property = {
  address: "123 Test St",
  state: "MA",
  city: "Boston",
  zip: "02108",
  assetType: "sfh",
  price: 100000,
};
test("public small cohort output reveals neither zero nor single buyer nor score", () => {
  const empty = safeAnalysis(analyzeDeal(property, []));
  const one = safeAnalysis(
    analyzeDeal(property, [
      {
        id: "secret",
        status: "active",
        markets: [{ state: "MA" }],
        assetTypes: ["sfh"],
        maxPrice: 200000,
      },
    ]),
  );
  assert.equal(empty.strongMatches, one.strongMatches);
  assert.equal(empty.possibleMatches, one.possibleMatches);
  assert.equal(one.score, null);
  assert.equal(JSON.stringify(one).includes("secret"), false);
});
test("server rejects cross-user access and workspace Admin is not network admin", () => {
  assert.throws(() => assertOwner({ owner_id: "a" }, "b"));
  assert.throws(() => assertOwner(null, "a"));
  assert.throws(() => assertAdmin({ role: "Admin", isOwnerAdmin: false }));
  assert.doesNotThrow(() => assertAdmin({ isOwnerAdmin: true }));
});
test("strict property schema retains ZIP and rejects nonfinite and negative numbers", () => {
  assert.equal(dealSchema.parse(property).zip, "02108");
  for (const price of [-1, 0, Infinity, NaN, "100"])
    assert.equal(dealSchema.safeParse({ ...property, price }).success, false);
  assert.equal(
    dealSchema.safeParse({ ...property, state: "XX" }).success,
    false,
  );
});
test("imports normalize and flag duplicates without turning missing criteria into broad markets", () => {
  const rows = normalizeImport(
    [
      {
        email: " PERSON@example.com ",
        state: "ma",
        types: "sfh",
        zip: "02108",
      },
      { email: "person@example.com", state: "MA", types: "sfh" },
      { email: "x@example.com" },
    ],
    { email: "email", state: "state", assetTypes: "types", zips: "zip" },
  );
  assert.equal(rows[0].identity.email, "person@example.com");
  assert.deepEqual(rows[0].criteria.markets[0].zips, ["02108"]);
  assert.equal(rows[1].duplicate, true);
  assert.ok(rows[2].errors.length);
  assert.deepEqual(rows[2].criteria.markets, []);
});
test("identity encryption authenticates data; dedupe HMAC normalizes email", () => {
  const input = { email: "private@example.com", name: "Private" };
  const cipher = encryptIdentity(input);
  assert.equal(cipher.includes(input.email), false);
  assert.deepEqual(decryptIdentity(cipher), input);
  assert.throws(() => decryptIdentity(cipher.slice(0, -4) + "AAAA"));
  assert.equal(identityHash(" X@example.com "), identityHash("x@example.com"));
});
test("blank price criteria never creates strong matches; repair limits are enforced", () => {
  const buyer = {
    id: "a",
    status: "active",
    markets: [{ state: "MA" }],
    assetTypes: ["sfh"],
    criteriaVerifiedAt: new Date().toISOString(),
  };
  assert.equal(analyzeDeal(property, [buyer]).strongMatches, 0);
  assert.equal(
    analyzeDeal({ ...property, repairs: 50000 }, [
      { ...buyer, maxPrice: 200000, maxRepairs: 20000 },
    ]).totalMatches,
    0,
  );
});
test("EOC reminders follow extensions and have correct offsets", () => {
  assert.deepEqual(
    reminderDates("2026-10-20").map((x) => x.date),
    ["2026-10-06", "2026-10-13", "2026-10-17", "2026-10-20", "2026-10-23"],
  );
  assert.notDeepEqual(reminderDates("2026-10-20"), reminderDates("2026-11-20"));
});
