export function verifyStagingLedger(sources, rows) {
  const expected = new Map(sources.map((source) => [source.path, source.hash]));
  const seen = new Set();
  for (const row of rows) {
    if (!expected.has(row.path) || seen.has(row.path))
      throw new Error("Unexpected or duplicate staging ledger entry");
    if (expected.get(row.path) !== row.hash)
      throw new Error(`Applied migration checksum mismatch: ${row.path}`);
    seen.add(row.path);
  }
  for (const path of expected.keys())
    if (!seen.has(path)) throw new Error(`Missing staging migration: ${path}`);
  return seen.size;
}
