import test from "node:test";
import assert from "node:assert/strict";
import { verifyStagingLedger } from "../../scripts/buyermatch-staging-ledger.mjs";
import { sourceHash } from "../../scripts/buyermatch-staging-sources.mjs";
test("migration checksums normalize Windows line endings but reject SQL edits", () => {
  assert.equal(sourceHash("select 1;\r\n"), sourceHash("select 1;\n"));
  assert.notEqual(sourceHash("select 1;\n"), sourceHash("select 2;\n"));
});
const sources = [
  { path: "baseline.sql", hash: "a" },
  { path: "migration.sql", hash: "b" },
];
test("staging ledger requires every checksum with no unknown or duplicate sources", () => {
  assert.equal(verifyStagingLedger(sources, [...sources].reverse()), 2);
  assert.throws(
    () => verifyStagingLedger(sources, sources.slice(1)),
    /Missing/,
  );
  assert.throws(
    () => verifyStagingLedger(sources, [...sources, sources[0]]),
    /duplicate/,
  );
  assert.throws(
    () =>
      verifyStagingLedger(sources, [
        ...sources,
        { path: "unknown", hash: "x" },
      ]),
    /Unexpected/,
  );
  assert.throws(
    () =>
      verifyStagingLedger(sources, [
        { ...sources[0], hash: "changed" },
        sources[1],
      ]),
    /checksum mismatch/,
  );
});
