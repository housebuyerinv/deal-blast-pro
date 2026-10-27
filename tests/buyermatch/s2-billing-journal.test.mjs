import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { billingEvidenceStore } from "../../scripts/testing/s2-billing-journal.mjs";
const plan = {
  runId: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
  source: "a".repeat(40),
  mode: "LOCAL_SYNTHETIC",
};
const entry = { ...plan, stage: "checkout", status: "STARTED" };
async function fixture(fn) {
  const base = await mkdtemp(path.join(tmpdir(), "bm-public-evidence-"));
  try {
    await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

test("actual disk claim and fsynced journal survive process-store recreation", () =>
  fixture(async (base) => {
    const store = await billingEvidenceStore(base, plan);
    assert.deepEqual(await store.claimRun(), { claimed: true });
    assert.deepEqual(await store.journal(entry), { durable: true });
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(base, plan.runId + ".0000.json"), "utf8"),
      ),
      entry,
    );
    const resumed = await billingEvidenceStore(base, plan);
    await assert.rejects(resumed.claimRun(), { code: "EEXIST" });
    assert.equal((await readdir(base)).length, 2);
  }));
test("unclaimed, wrong-scope and secret-bearing entries create no evidence files", () =>
  fixture(async (base) => {
    const store = await billingEvidenceStore(base, plan);
    await assert.rejects(store.journal(entry));
    await store.claimRun();
    for (const change of [
      { runId: "00000000-0000-4000-8000-000000000000" },
      { source: "b".repeat(40) },
      { url: "DUMMY_SECRET" },
      { status: "secret" },
    ])
      await assert.rejects(store.journal({ ...entry, ...change }));
    assert.equal((await readdir(base)).length, 1);
  }));
test("preexisting journal evidence is never overwritten", () =>
  fixture(async (base) => {
    const file = path.join(base, plan.runId + ".0000.json");
    await writeFile(file, "preserve");
    const store = await billingEvidenceStore(base, plan);
    await store.claimRun();
    await assert.rejects(store.journal(entry), { code: "EEXIST" });
    assert.equal(await readFile(file, "utf8"), "preserve");
  }));
test("invalid or missing evidence root fails without creating directories", async () => {
  await assert.rejects(billingEvidenceStore("relative", plan));
  await fixture(async (base) => {
    await assert.rejects(
      billingEvidenceStore(path.join(base, "absent"), plan),
      { code: "ENOENT" },
    );
    assert.deepEqual(await readdir(base), []);
  });
});

test("caller mutation cannot redirect the validated evidence scope", () =>
  fixture(async (base) => {
    const mutable = { ...plan },
      store = await billingEvidenceStore(base, mutable);
    mutable.runId = "../outside";
    await store.claimRun();
    await store.journal(entry);
    assert.deepEqual(
      (await readdir(base)).sort(),
      [plan.runId + ".0000.json", plan.runId + ".claim.json"].sort(),
    );
  }));
