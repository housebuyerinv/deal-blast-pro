import test from "node:test";
import assert from "node:assert/strict";
import { executeBillingPreflight } from "../../scripts/testing/s2-billing-preflight.mjs";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
import { S2_PRO_OWNER } from "../../server/buyermatch/s2-billing-window.js";
function fixture() {
  const source = "c00d59f048282343af5d81afe9655556aa285e75",
    now = Date.now();
  const p = {
    source,
    runId: "05a02678-ad8c-443e-8aa5-1ab8f93bbf88",
    project: S2.project,
    team: S2.team,
    database: S2.staging,
    account: S2.account,
    endpoint: S2.endpoint,
    owner: S2_PRO_OWNER,
    mode: "LOCAL_SYNTHETIC",
    profile: "activation",
    startedAt: now - 1000,
    expiresAt: now + 60000,
  };
  const facts = {
    ...p,
    livemode: false,
    target: "preview",
    ready: true,
    deploymentId: "dpl_SyntheticOnly",
    leaseRunId: p.runId,
  };
  for (const k of [
    "registrationPaused",
    "checkoutPaused",
    "liveBillingPaused",
    "deliveryDisabled",
    "endpointDisabled",
    "receiverPaused",
    "protected",
    "fallbackVerified",
    "freeQuotaVerified",
    "credentialProvenanceVerified",
    "normalProLoginVerified",
    "agreementsVerified",
    "serviceRoleOnlyBilling",
    "completedCheckoutRequired",
    "subscriptionOwnershipRequired",
    "ownerLockingRequired",
    "allReachablePortalEntryPointsDenied",
    "allReachableCheckoutEntryPointsDenied",
    "providerPortalLoginDisabled",
    "sharedCoordinationRootVerified",
  ])
    facts[k] = true;
  const preserved = {
    buyers: 223,
    provenance: 9,
    nonstandardHashes: 8,
    buyerDigest: "a".repeat(64),
    dependenciesDigest: "b".repeat(64),
    unrelatedAccountsDigest: "c".repeat(64),
  };
  const watch = {
    ...p,
    independent: true,
    providerReadbacksVerified: true,
    canCloseBothGates: true,
    canExpireOwnedCheckouts: true,
    canRestoreAndRemoveOwnedPreview: true,
    noPortalIssuedVerified: true,
  };
  const journal = [];
  const ports = {
    verifyApproval: async (_, digest) => ({
      approved: true,
      planDigest: digest,
      mode: p.mode,
      scope: "payment-free-preflight",
    }),
    readFacts: async () => facts,
    readOperatorIdentity: async () => ({ account: p.account, mode: "test" }),
    readAttestation: async (_, id) => ({
      source,
      runId: p.runId,
      deploymentId: id,
      verified: true,
    }),
    readPreservation: async () => preserved,
    readWatchdogAuthority: async () => watch,
    journal: async (_, entry) => {
      journal.push(entry);
      return { durable: true };
    },
  };
  return {
    p,
    ports,
    facts,
    watch,
    preserved,
    journal,
    run: () =>
      executeBillingPreflight(p, ports, {
        approvedSource: source,
        timeoutMs: 20,
      }),
  };
}
test("preflight requires its own source-bound approval before provider fact reads", async () => {
  const f = fixture();
  f.ports.verifyApproval = async (_, digest) => ({
    approved: true,
    planDigest: digest,
    mode: f.p.mode,
    scope: "subscription-activation",
  });
  let reads = 0;
  f.ports.readFacts = async () => {
    reads++;
    return f.facts;
  };
  assert.equal((await f.run()).status, "PREFLIGHT_UNVERIFIED");
  assert.equal(reads, 0);
});

test("complete read-only preflight never grants payment authorization or opens processing", async () => {
  const f = fixture(),
    r = await f.run();
  assert.equal(r.status, "LOCAL_SYNTHETIC_PREFLIGHT_PASS");
  assert.equal(r.paymentAuthorized, false);
  assert.equal(r.activationPerformed, false);
});
for (const key of [
  "normalProLoginVerified",
  "allReachablePortalEntryPointsDenied",
  "allReachableCheckoutEntryPointsDenied",
  "providerPortalLoginDisabled",
  "sharedCoordinationRootVerified",
  "freeQuotaVerified",
])
  test("missing " + key + " remains unverified", async () => {
    const f = fixture();
    delete f.facts[key];
    assert.equal((await f.run()).status, "PREFLIGHT_UNVERIFIED");
  });
test("old watchdog source, simulated provider receipt or missing exact endpoint cannot pass", async () => {
  for (const patch of [
    { source: "b".repeat(40) },
    { providerReadbacksVerified: false },
    { endpoint: "foreign" },
  ]) {
    const f = fixture();
    Object.assign(f.watch, patch);
    assert.equal((await f.run()).status, "PREFLIGHT_UNVERIFIED");
  }
});
test("preservation drift, journal failure and timeout stop proof without raw evidence disclosure", async () => {
  const f = fixture();
  let count = 0;
  f.ports.readPreservation = async () => ({
    ...f.preserved,
    buyers: ++count === 1 ? 223 : 222,
  });
  assert.equal((await f.run()).status, "PREFLIGHT_UNVERIFIED");
  const g = fixture();
  g.ports.readFacts = async () => new Promise(() => {});
  assert.equal((await g.run()).status, "PREFLIGHT_UNVERIFIED");
  const h = fixture();
  h.ports.journal = async () => {
    throw Error("DUMMY_PRIVATE");
  };
  const r = await h.run();
  assert.equal(r.status, "PREFLIGHT_UNVERIFIED");
  assert.ok(!JSON.stringify(r).includes("DUMMY_PRIVATE"));
});
