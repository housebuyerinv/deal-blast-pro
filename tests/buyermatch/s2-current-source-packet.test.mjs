// Actual local committed Git objects; no providers or credentials and no mutations.
import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import {
  prepareCurrentSourcePacket,
  prepareBillingOnlySourcePacket,
  preparePaymentFreePreflightPacket,
  CANDIDATE,
  REVIEWED_REMOTE,
  MIGRATION_HASH,
} from "../../scripts/testing/s2-current-source-packet.mjs";
import { REQUIRED_S2_ENV } from "../../scripts/buyermatch-s2-release.mjs";
const input = {
  repo: process.cwd(),
  remoteHead: REVIEWED_REMOTE,
  sourceDirectory: "C:\\SYNTHETIC-PREPARATION\\source",
  databaseDirectory: "C:\\SYNTHETIC-PREPARATION\\database",
  runId: "ae730359-8330-4580-8e55-a49673f9a4fd",
};

test("offline packet pins actual committed source, migration, ancestor and buyer route", () => {
  const p = prepareCurrentSourcePacket(input);
  assert.equal(p.source, CANDIDATE);
  assert.equal(p.ahead, 24);
  assert.equal(p.changedFileCount, 158);
  assert.match(p.tree, /^[a-f0-9]{40}$/);
  assert.ok(p.changedFiles.includes("server/buyermatch/buyer-account.js"));
  assert.equal(p.migration.sha256, MIGRATION_HASH);
  assert.equal(p.executionReady, false);
  assert.equal(p.commandsAreDataOnly, true);
});

test("reviewed newer candidate cannot silently revert to historical canary or remote drift", () => {
  for (const source of [
    "b99830596080eef2b24472e71bdcb061c855bf57",
    "HEAD",
    CANDIDATE + ":vercel.json",
  ])
    assert.throws(
      () => prepareCurrentSourcePacket({ ...input, source }),
      /pin changed/,
    );
  assert.throws(
    () => prepareCurrentSourcePacket({ ...input, remoteHead: CANDIDATE }),
    /pin changed/,
  );
});

test("rejects ambiguous, shell-injected and overlapping preparation paths", () => {
  for (const sourceDirectory of [
    "relative",
    "\\\\server\\share",
    "C:\\safe\\..\\unknown",
    "C:\\safe\nother",
    "C:\\safe:file",
    "C:\\safe\\trailing.",
  ])
    assert.throws(
      () => prepareCurrentSourcePacket({ ...input, sourceDirectory }),
      /directories required/,
    );
  assert.throws(
    () =>
      prepareCurrentSourcePacket({
        ...input,
        databaseDirectory: input.sourceDirectory.toLowerCase() + "\\nested",
      }),
    /separate/,
  );
});

test("paused Preview argv supplies all 17 settings twice and binds exact attestation identity", () => {
  const p = prepareCurrentSourcePacket(input),
    a = p.commands.deploy;
  assert.equal(Object.keys(REQUIRED_S2_ENV).length, 17);
  assert.ok(!a.includes("--prod"));
  assert.equal(a[a.indexOf("--target") + 1], "preview");
  for (const [key, value] of Object.entries(REQUIRED_S2_ENV)) {
    for (const flag of ["--env", "--build-env"])
      assert.equal(
        a.filter((x, i) => x === flag && a[i + 1] === key + "=" + value).length,
        1,
      );
  }
  assert.ok(a.includes("githubCommitSha=" + CANDIDATE));
  assert.ok(a.includes("BM_S2_ATTESTATION_SOURCE_SHA=" + CANDIDATE));
  assert.ok(a.includes("BM_S2_ATTESTATION_RUN_ID=" + input.runId));
});

test("one migration only, non-force exact ref push and no generated provisioning commands", () => {
  const p = prepareCurrentSourcePacket(input);
  assert.deepEqual(p.commands.push, [
    "git",
    "push",
    "origin",
    CANDIDATE + ":refs/heads/codex/buyermatch-1b-integration",
  ]);
  assert.equal(
    p.commands.linkIsolatedCli[
      p.commands.linkIsolatedCli.indexOf("--project-ref") + 1
    ],
    "qxhhlprentrufobpcgna",
  );
  assert.equal(p.migration.replayPrivateIntake, false);
  assert.equal(p.migration.bulkPush, false);
  assert.ok(!JSON.stringify(p.commands).includes("20261024000845"));
  assert.ok(
    !Object.keys(p.commands).some((key) => /secret|payment|alias/i.test(key)),
  );
  assert.ok(
    p.mandatoryGates.some((gate) =>
      gate.includes("Historical b998305 launcher is incompatible"),
    ),
  );
});

test("payment-free packet forbids activation, Portal sessions, event generation and alias moves", () => {
  const p = preparePaymentFreePreflightPacket(input);
  assert.equal(p.approvalScope,'payment-free-preflight');
  for (const k of [
    "checkoutActivationPermitted",
    "portalSessionsPermitted",
    "webhookEventsPermitted",
    "aliasMovePermitted",
    "paymentAuthorized",
    "executionReady",
  ])
    assert.equal(p[k], false);
  assert.deepEqual(Object.keys(p.commands).sort(), [
    "archive",
    "deploy",
    "extract",
    "push",
  ]);
  assert.deepEqual(p.migration, { required: false, apply: false });
  assert.equal(p.cleanupScope.existingDeployments, "preserve");
  assert.equal(p.source, CANDIDATE);
});

test("invalid run identity cannot produce deployment instructions", () => {
  assert.throws(
    () => prepareCurrentSourcePacket({ ...input, runId: "$(unsafe)" }),
    /identity/,
  );
});

test("billing-only packet excludes migration, crypto restoration and portal activation", () => {
  const p = prepareBillingOnlySourcePacket(input);
  assert.deepEqual(Object.keys(p.commands).sort(), [
    "archive",
    "deploy",
    "extract",
    "push",
  ]);
  assert.deepEqual(p.migration, { required: false, apply: false });
  assert.equal(p.identityKeysRequired, false);
  assert.equal(p.buyerRoutesPermitted, false);
  assert.equal(p.portalOperationsPermitted, false);
  assert.equal(p.privateProviderAdaptersVerified, false);
  assert.equal(p.executionReady, false);
  assert.equal(p.source, CANDIDATE);
  assert.ok(
    p.mandatoryGates.some((g) =>
      g.includes("223 identity/9 provenance/8 nonstandard-hash"),
    ),
  );
  assert.ok(p.mandatoryGates.some((g) => g.includes("BM_S2_BILLING_*")));
});
