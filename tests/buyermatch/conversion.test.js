import test from "node:test";
import assert from "node:assert/strict";
import {
  conversionRecord,
  propertyIdentity,
  conversionRequest,
} from "../../server/buyermatch/conversion.js";
import { conversionReport } from "../../server/buyermatch/conversion-report.js";
import { randomUUID } from "node:crypto";
const day = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
const now = Date.parse(day(100));
const a = randomUUID(),
  b = randomUUID();
const property = {
  address: "123 Main St",
  city: "Austin",
  state: "TX",
  zip: "78701",
};
const event = (
  kind,
  payload = {},
  at = day(3),
  deal_id = a,
  evidence = randomUUID(),
) => ({
  id: randomUUID(),
  deal_id,
  kind,
  payload,
  occurred_at: at,
  recorded_at: at,
  evidence_ref: evidence,
});
const base = () => ({
  deals: [{ id: a, property, created_at: day(1) }],
  events: [],
  recipients: [],
  analyses: [],
  responses: [],
  closings: [],
  reviews: [],
});
test("strict event validation forbids owner override, personal contacts, undocumented receipts and invalid amounts", () => {
  const input = {
    dealId: a,
    operationKey: randomUUID(),
    kind: "fee_received",
    occurredAt: day(3),
    evidenceRef: "receipt-1",
    payload: { amountCents: 100, confirmed: true },
  };
  assert.equal(conversionRecord(input).payload.amountCents, 100);
  for (const patch of [
    { ownerId: randomUUID() },
    { payload: { amountCents: 100 } },
    { payload: { amountCents: 0, confirmed: true } },
    { evidenceRef: "https://private.invalid/token" },
    { evidenceRef: "buyer@example.com" },
  ])
    assert.throws(() => conversionRecord({ ...input, ...patch }));
});
test("same address never verifies missing units or collapses distinct interests/contracts", () => {
  assert.equal(propertyIdentity(property).propertyKey, null);
  assert.notEqual(
    propertyIdentity(property, { unit: "2" }).propertyKey,
    propertyIdentity(property, { unit: "3" }).propertyKey,
  );
  const s = base();
  s.deals.push({ id: b, property, created_at: day(1) });
  const r = conversionReport(s, {}, now);
  assert.equal(r.properties, 2);
  assert.equal(r.unresolvedIdentities, 2);
  assert.equal(r.duplicateCandidates[0].safeToMerge, false);
});
test("empty report supplies denominators and insufficient data, not invented zero rates", () => {
  const r = conversionReport({ deals: [] }, {}, now);
  assert.equal(r.funnel[7].percent, null);
  assert.equal(r.intervals[0].averageDays, null);
  assert.equal(r.properties, 0);
});
test("email acceptance, provider delivery and offer signals never fabricate EMD/closing/receipt", () => {
  const s = base();
  s.recipients = [
    { deal_id: a, ref: "B-1", accepted_at: day(2), delivered_at: null },
  ];
  s.responses = [
    { id: randomUUID(), deal_id: a, ref: "B-1", kind: "offer", at: day(3) },
  ];
  s.closings = [
    {
      deal_id: a,
      paid_at: day(4),
      fee_due_cents: 9000,
      payment_recorded: true,
    },
  ];
  const r = conversionReport(s, {}, now);
  assert.equal(r.rows[0].recipients, 0);
  assert.equal(r.funnel[5].reached, 0);
  assert.equal(r.closedTransactions, 0);
  assert.equal(r.receivedFeesCents, 0);
});
test("independent stages preserve nonlinear history and use conditional denominators", () => {
  const s = base();
  s.events = [event("closed", { amountCents: 100000, confirmed: true })];
  const r = conversionReport(s, {}, now);
  assert.equal(r.funnel[7].reached, 1);
  assert.equal(r.funnel[7].denominator, 0);
  assert.equal(r.funnel[7].percent, null);
  assert.equal(r.closedVolumeCents, 100000);
});
test("recorded offer/EMD/fee facts, corrections, refunds, reopening and source filters are accurate", () => {
  const s = base(),
    fee = event("fee_received", { amountCents: 5000, confirmed: true });
  s.events = [
    event("identity", {
      unit: "whole",
      contractRef: "contract-1",
      interestRef: "fee-simple",
      transactionRef: "tx-1",
      source: "JV",
      jvPartner: "PartnerA",
      market: "Austin",
    }),
    event("written_offer", {
      amountCents: 100000,
      offerRef: "offer-1",
      counterpartyRef: "B-1",
    }),
    event("emd_confirmed", { amountCents: 1000, offerRef: "offer-1" }),
    fee,
    event("fee_projected", { amountCents: 20000 }),
    event("fee_invoiced", { amountCents: 10000 }),
    event("fee_refunded", { amountCents: 1000, confirmed: true }),
    event("closed", { amountCents: 100000 }),
    event("reopened", { reason: "title_issue" }, day(4)),
  ];
  let r = conversionReport(
    s,
    {
      market: "Austin",
      source: "JV",
      jvPartner: "PartnerA",
      outcome: "reopened",
    },
    now,
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.closedTransactions, 0);
  assert.equal(r.closedVolumeCents, 0);
  assert.equal(r.receivedFeesCents, 5000);
  assert.equal(r.refundedFeesCents, 1000);
  assert.equal(r.invoicedFeesCents, 10000);
  s.events.push(
    event("void", { eventId: fee.id, reason: "other_documented" }, day(5)),
  );
  r = conversionReport(s, {}, now);
  assert.equal(r.receivedFeesCents, 0);
  assert.equal(r.rows[0].history.find((e) => e.id === fee.id).voided, true);
  assert.equal(conversionReport(s, { source: "Other" }, now).rows.length, 0);
});
test("actual source analyses/interest/delivery are reused without contacts; legacy closing volume is unknown", () => {
  const s = base();
  s.analyses = [
    {
      id: randomUUID(),
      deal_id: a,
      at: day(2),
      eligible: 8,
      version: "engine-v1",
    },
  ];
  s.recipients = [{ deal_id: a, ref: "B-hash", delivered_at: day(3) }];
  s.responses = [
    {
      id: randomUUID(),
      deal_id: a,
      ref: "B-hash",
      kind: "interested",
      at: day(4),
    },
  ];
  s.closings = [{ deal_id: a, verified_at: day(5) }];
  const r = conversionReport(s, {}, now);
  assert.equal(r.rows[0].eligibleMatches, 8);
  assert.equal(r.buyerEngagement.percent, 100);
  assert.equal(r.closedTransactions, 1);
  assert.equal(r.unknownClosingVolumes, 1);
  assert.equal(r.rows[0].stages.emd_confirmed, null);
});
test("observation windows and received-date cohorts do not invent later conversion", () => {
  const s = base();
  s.events = [event("closed", { amountCents: 50000 }, day(20))];
  assert.equal(
    conversionReport(s, { windowDays: 7 }, now).funnel[7].reached,
    0,
  );
  assert.equal(conversionReport(s, { from: "2026-01-02" }, now).rows.length, 0);
  assert.equal(
    conversionReport(s, { windowDays: 30 }, now).closedTransactions,
    1,
  );
});
test("manual duplicate links preserve both submissions and deduplicate the same receipt", () => {
  const s = base();
  s.deals.push({ id: b, property, created_at: day(1) });
  s.reviews = [{ source_deal_id: b, target_deal_id: a, created_at: day(3) }];
  s.events = [
    event("fee_received", { amountCents: 1000 }, day(3), a, "receipt-1"),
    event("fee_received", { amountCents: 1000 }, day(3), b, "receipt-1"),
  ];
  const r = conversionReport(s, {}, now);
  assert.equal(r.transactions, 1);
  assert.equal(r.submissions, 2);
  assert.equal(r.receivedFeesCents, 1000);
  s.reviews.push({
    source_deal_id: b,
    target_deal_id: null,
    created_at: day(4),
  });
  assert.equal(conversionReport(s, {}, now).transactions, 2);
});
test("RPC owner always comes from authenticated caller, never payload", async () => {
  const owner = randomUUID();
  let calls = 0;
  const db = {
    rpc: async (name, args) => {
      calls++;
      assert.equal(name, "bm_conversion_snapshot");
      assert.equal(args.p_owner, owner);
      return { data: base() };
    },
  };
  await conversionRequest(db, owner, "conversion-report", {
    ownerId: randomUUID(),
  });
  assert.equal(calls, 1);
});
test("same parcel number in different jurisdictions is not the same property; edits invalidate review", () => {
  const metadata = {
    unit: "whole",
    parcelRef: "parcel-1",
    contractRef: "c1",
    interestRef: "i1",
    transactionRef: "t1",
    propertySnapshot: property,
  };
  assert.equal(propertyIdentity(property, metadata).verifiedIdentity, true);
  assert.notEqual(
    propertyIdentity(property, metadata).propertyKey,
    propertyIdentity(
      { ...property, state: "CA" },
      { ...metadata, propertySnapshot: { ...property, state: "CA" } },
    ).propertyKey,
  );
  assert.equal(
    propertyIdentity({ ...property, address: "999 Other" }, metadata)
      .verifiedIdentity,
    false,
  );
});
test("scheduled closing is a future plan, never an occurred closing or receipt", () => {
  const record = conversionRecord({
    dealId: a,
    operationKey: randomUUID(),
    kind: "closing_scheduled",
    occurredAt: day(2),
    evidenceRef: "schedule-1",
    payload: { scheduledDate: "2027-01-01" },
  });
  const s = base();
  s.events = [event(record.kind, record.payload, record.occurredAt)];
  const r = conversionReport(s, {}, now);
  assert.equal(r.closedTransactions, 0);
  assert.equal(r.rows[0].history.at(-1).scheduledDate, "2027-01-01");
});
test("late corrections and reopenings stay truthful outside the funnel window", () => {
  const s = base(),
    cash = event(
      "fee_received",
      { amountCents: 2000, confirmed: true },
      day(2),
    );
  s.events = [
    cash,
    event("closed", { amountCents: 100000, confirmed: true }, day(3)),
    event("void", { eventId: cash.id, reason: "other_documented" }, day(20)),
    event("reopened", { reason: "title_issue" }, day(21)),
    event("fee_received", { amountCents: 1500, confirmed: true }, day(22)),
  ];
  const r = conversionReport(s, { windowDays: 7 }, now);
  assert.equal(r.funnel[7].reached, 1);
  assert.equal(r.closedTransactions, 0);
  assert.equal(r.rows[0].outcome, "reopened");
  assert.equal(r.receivedFeesCents, 1500);
  assert.equal(r.rows[0].history.find((e) => e.id === cash.id).voided, true);
  assert.equal(r.rows[0].history.at(-1).outsideObservationWindow, true);
});
