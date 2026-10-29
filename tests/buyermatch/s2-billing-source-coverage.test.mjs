import test from "node:test";
import assert from "node:assert/strict";
import {
  portalSourceMatches,
  ownsCampaignPreview,
} from "../../scripts/testing/s2-billing-native-provider.mjs";
import {
  assembleBillingExecution,
  BILLING_COORDINATION_ROOT,
} from "../../scripts/testing/s2-billing-execution.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
const now = Date.now(),
  plan = {
    source: "68c5cf9f4d8fcd590e45dd536eab1eb29edecccc",
    runId: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
    project: S2.project,
    team: S2.team,
    database: S2.staging,
    account: S2.account,
    endpoint: S2.endpoint,
    owner: S2_PRO_OWNER,
    mode: "HOSTED",
    profile: "activation",
    startedAt: now,
    expiresAt: now + 60000,
  };
test("approved immutable application has the exact reviewed Portal/window guards", () =>
  assert.equal(
    portalSourceMatches("68c5cf9f4d8fcd590e45dd536eab1eb29edecccc"),
    true,
  ));
test("older preserved application cannot be asserted to have those guards", () =>
  assert.equal(
    portalSourceMatches("b99830596080eef2b24472e71bdcb061c855bf57"),
    false,
  ));
test("unknown, malformed and option-like source identifiers fail closed", () => {
  for (const source of [
    "0".repeat(40),
    "--all",
    "",
    null,
    "68c5cf9; echo secret",
  ])
    assert.equal(portalSourceMatches(source), false);
});
const preview = () => ({
  id: "dpl_Campaign",
  projectId: S2.project,
  ownerId: S2.team,
  target: null,
  meta: { githubCommitSha: plan.source, s2RunId: plan.runId },
  createdAt: now + 1000,
  alias: [],
});
test("unaliased exact run-created Preview is eligible for cleanup", () =>
  assert.equal(
    ownsCampaignPreview(preview(), { ids: [S2.fallback] }, plan, S2.fallback),
    true,
  ));
test("owned temporary alias is eligible only while it targets that exact Preview", () => {
  const p = preview();
  p.alias = [new URL(S2.origin).hostname];
  assert.equal(
    ownsCampaignPreview(p, { ids: [S2.fallback] }, plan, p.id),
    true,
  );
  assert.equal(
    ownsCampaignPreview(p, { ids: [S2.fallback] }, plan, "dpl_Foreign"),
    false,
  );
});
for (const [name, change] of [
  ["existing ID", (p) => (p.id = S2.fallback)],
  ["wrong project", (p) => (p.projectId = "foreign")],
  ["wrong run", (p) => (p.meta.s2RunId = "foreign")],
  ["wrong source", (p) => (p.meta.githubCommitSha = "0".repeat(40))],
  ["pre-campaign time", (p) => (p.createdAt = plan.startedAt - 1)],
  ["foreign alias", (p) => (p.alias = ["production.example.com"])],
])
  test("Preview cleanup rejects " + name, () => {
    const p = preview();
    change(p);
    assert.equal(
      ownsCampaignPreview(p, { ids: [S2.fallback] }, plan, p.id),
      false,
    );
  });
test("HOSTED cannot inject synthetic success providers", async () =>
  await assert.rejects(
    assembleBillingExecution(
      {
        plan,
        directory: BILLING_COORDINATION_ROOT,
        operatorSource: "a".repeat(40),
        intent: "verify-runtime",
      },
      {
        evidence: () => {
          throw Error("Must not run");
        },
      },
    ),
  ));
test("LOCAL_SYNTHETIC cannot fall through to native provider defaults", async () =>
  await assert.rejects(
    assembleBillingExecution(
      {
        plan: { ...plan, mode: "LOCAL_SYNTHETIC" },
        directory: BILLING_COORDINATION_ROOT,
        operatorSource: "a".repeat(40),
        intent: "watch",
      },
      {},
    ),
  ));
