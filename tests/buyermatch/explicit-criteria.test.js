import test from 'node:test';
import assert from 'node:assert/strict';
import { matchBuyer, validateDeal } from '../../server/buyermatch/matching.js';

const property = { state: 'TX', city: 'Austin', assetType: 'sfh', price: 100000 };
const buyer = { id: 'synthetic', status: 'active', markets: [{ state: 'TX' }], assetTypes: ['sfh'] };
for (const [field, rule] of [['beds', 'minBeds'], ['baths', 'minBaths'], ['sqft', 'minSqft'], ['sqft', 'maxSqft'], ['units', 'minUnits'], ['units', 'maxUnits'], ['leaseYears', 'minLeaseYears']]) {
  test(`explicit ${rule} requires an actual ${field} fact`, () => {
    const criteria = { ...buyer, [rule]: 2 };
    for (const missing of [undefined, null, '']) {
      const result = matchBuyer({ ...property, [field]: missing }, criteria);
      assert.equal(result.eligible, false);
      assert.equal(result.score, 0);
      assert.ok(result.unknown.includes(field));
    }
    assert.equal(matchBuyer({ ...property, [field]: 2 }, criteria).eligible, true);
    assert.equal(matchBuyer({ ...property, [field]: rule.startsWith('max') ? 3 : 1 }, criteria).eligible, false);
  });
}
for (const field of ['noi', 'leaseYears', 'debtServiceCoverage']) {
  test(`${field} rejects invalid numeric input at the engine boundary`, () => {
    for (const value of [NaN, Infinity, -1, '2']) assert.throws(() => validateDeal({ ...property, [field]: value }), /Invalid/);
    assert.doesNotThrow(() => validateDeal({ ...property, [field]: 0 }));
  });
}
test('unspecified buyer dimensions remain advisory confidence gaps', () => {
  const result = matchBuyer(property, buyer);
  assert.equal(result.eligible, true);
  assert.ok(result.unknown.includes('Price criteria'));
});
