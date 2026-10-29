// Pure owner-scoped analytics. Never infer a sale, EMD or fee from email traffic.
import { propertyIdentity } from "./conversion.js";
const time = (value) =>
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const unique = (values) => [...new Set(values)];
const addCents = (a, b) => {
  const result = a + b;
  if (!Number.isSafeInteger(result))
    throw Object.assign(
      Error("Financial aggregate exceeds safe precision; narrow the cohort."),
      { status: 409 },
    );
  return result;
};
function duplicateReviewCandidates(rows, transactions, links) {
  const included = new Set(transactions.flatMap((t) => t.submissionIds));
  const parents = new Set([...links.values()].filter(Boolean));
  const buckets = new Map(),
    result = [],
    seen = new Set();
  for (const row of rows.values())
    if (included.has(row.id) && !links.get(row.id)) {
      for (const key of [
        row.physical.candidateKey.replaceAll("|", "")
          ? "address:" + row.physical.candidateKey
          : null,
        row.physical.propertyKey
          ? "property:" + row.physical.propertyKey
          : null,
      ].filter(Boolean)) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
      }
    }
  for (const bucket of buckets.values())
    for (let i = 0; i < bucket.length; i++)
      for (let j = i + 1; j < bucket.length; j++) {
        const first = bucket[i],
          second = bucket[j],
          key = [first.id, second.id].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        if (result.length === 200) return { candidates: result, hasMore: true };
        const a = parents.has(first.id) ? second : first,
          b = a === first ? second : first;
        result.push({
          sourceId: a.id,
          targetId: b.id,
          address: a.property.address,
          safeToMerge:
            !parents.has(a.id) &&
            a.physical.verifiedIdentity &&
            b.physical.verifiedIdentity &&
            [
              "propertyKey",
              "unit",
              "contractRef",
              "interestRef",
              "transactionRef",
            ].every(
              (k) =>
                (k === "propertyKey" ? a.physical[k] : a.identity[k]) ===
                (k === "propertyKey" ? b.physical[k] : b.identity[k]),
            ),
        });
      }
  return { candidates: result, hasMore: false };
}
const outcomes = new Set([
  "closed",
  "lost",
  "stalled",
  "withdrawn",
  "canceled",
  "reopened",
  "expired",
]);
export function conversionReport(snapshot, filters = {}, now = Date.now()) {
  const days = Number(filters.windowDays || 90);
  if (!Number.isInteger(days) || days < 1 || days > 1095)
    throw Object.assign(Error("Conversion window must be 1–1095 days"), {
      status: 400,
    });
  const from = filters.from ? time(filters.from) : null,
    to = filters.to ? time(filters.to + "T23:59:59.999Z") : now;
  if (
    (filters.from &&
      (from === null ||
        new Date(from).toISOString().slice(0, 10) !== filters.from)) ||
    (filters.to &&
      (to === null ||
        new Date(to).toISOString().slice(0, 10) !== filters.to)) ||
    to === null ||
    (from !== null && from > to)
  )
    throw Object.assign(Error("Invalid date cohort"), { status: 400 });
  const rows = new Map(
    (snapshot.deals || []).map((deal) => [
      deal.id,
      { ...deal, events: [], receivedAt: deal.created_at },
    ]),
  );
  const latestLinks = new Map();
  for (const review of snapshot.reviews || [])
    if (time(review.created_at) <= now)
      latestLinks.set(review.source_deal_id, review.target_deal_id);
  const identities = new Map();
  for (const event of snapshot.events || [])
    if (event.kind === "identity" && time(event.occurred_at) <= now)
      identities.set(event.deal_id, event.payload);
  for (const row of rows.values()) {
    row.identity = identities.get(row.id) || {};
    row.physical = propertyIdentity(row.property, row.identity);
    row.events.push({
      id: `deal:${row.id}`,
      kind: "received",
      at: row.created_at,
      origin: "existing_submission",
    });
  }
  const add = (id, event) => {
    if (rows.has(id) && time(event.at) !== null)
      rows.get(id).events.push(event);
  };
  for (const event of snapshot.events || [])
    add(event.deal_id, {
      id: event.id,
      kind: event.kind,
      at: event.occurred_at,
      recordedAt: event.recorded_at,
      ordinal: event.ordinal || 0,
      evidenceRef: event.evidence_ref,
      ...event.payload,
      origin: "owner_evidence",
    });
  for (const record of snapshot.analyses || [])
    add(record.deal_id, {
      id: `analysis:${record.id}`,
      kind: "matched",
      at: record.at,
      eligible: typeof record.eligible === "number" ? record.eligible : null,
      version: record.version || "unknown",
      origin: "existing_analysis",
    });
  for (const record of snapshot.recipients || [])
    if (record.delivered_at)
      add(record.deal_id, {
        id: `recipient:${record.ref}`,
        kind: "distributed",
        at: record.delivered_at,
        counterpartyRef: record.ref,
        origin: "provider_delivery",
      });
  for (const record of snapshot.responses || [])
    add(record.deal_id, {
      id: `response:${record.id}`,
      kind: record.kind === "interested" ? "interested" : "response",
      at: record.at,
      counterpartyRef: record.ref,
      responseKind: record.kind,
      origin: "existing_response",
    });
  for (const record of snapshot.workflow || [])
    add(record.deal_id, {
      id: `workflow:${record.id}`,
      kind:
        record.kind === "admin_review"
          ? "inventory_verified"
          : record.kind === "buyer_interest"
            ? "interested"
            : record.kind,
      at: record.at,
      counterpartyRef: record.ref || null,
      origin: "existing_workflow",
    });
  for (const record of snapshot.offers || [])
    add(record.deal_id, {
      id: `offer:${record.id}`,
      kind: "offer_recorded",
      at: record.at,
      offerRef: record.id,
      amountCents: record.amountCents,
      counterpartyRef: record.ref,
      origin: "existing_offer_written_evidence_unconfirmed",
    });
  for (const record of snapshot.closings || [])
    if (record.verified_at)
      add(record.deal_id, {
        id: `closing:${record.deal_id}`,
        kind: "closed",
        at: record.verified_at,
        amountCents: null,
        origin: "existing_verified_closing_volume_unknown",
      });
  // Reuse actual closing verification dates; never infer received fee amounts.
  const groups = new Map();
  for (const row of rows.values()) {
    const target = latestLinks.get(row.id),
      root = target && rows.has(target) ? target : row.id;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  }
  const transactions = [];
  for (const [id, submissions] of groups) {
    const canonical = rows.get(id),
      received = Math.min(...submissions.map((row) => time(row.created_at)));
    const cutoff = Math.min(now, received + days * 86400000);
    const identity = canonical.identity;
    const history = submissions
      .flatMap((row) => row.events)
      .filter((event) => time(event.at) <= now)
      .sort(
        (a, b) =>
          time(a.at) - time(b.at) ||
          (a.ordinal || 0) - (b.ordinal || 0) ||
          a.id.localeCompare(b.id),
      );
    const voided = new Set(
      history.filter((e) => e.kind === "void").map((e) => e.eventId),
    );
    const active = history.filter(
      (e) => e.kind !== "void" && !voided.has(e.id),
    );
    const events = active.filter((e) => time(e.at) <= cutoff);
    const statusEvents = active.filter((e) => outcomes.has(e.kind)),
      lastOutcome = statusEvents.at(-1);
    const outcome = lastOutcome?.kind || "open";
    const market =
      identity.market ||
      [canonical.property.city, canonical.property.state]
        .filter(Boolean)
        .join(", ");
    if (
      (from !== null && received < from) ||
      received > to ||
      (filters.market && market !== filters.market) ||
      (filters.source && identity.source !== filters.source) ||
      (filters.jvPartner && identity.jvPartner !== filters.jvPartner) ||
      (filters.outcome && outcome !== filters.outcome)
    )
      continue;
    const first = (kind) => events.find((e) => e.kind === kind)?.at || null;
    const stages = Object.fromEntries(
      [
        "received",
        "inventory_verified",
        "matched",
        "distributed",
        "interested",
        "written_offer",
        "emd_confirmed",
        "closed",
      ].map((kind) => [kind, first(kind)]),
    );
    const financial = (kind) => {
      if (kind === "fee_projected")
        return active.filter((e) => e.kind === kind).at(-1)?.amountCents || 0;
      const seen = new Set();
      return active
        .filter((e) => e.kind === kind)
        .reduce((sum, e) => {
          const key = `${kind}:${e.evidenceRef}`;
          if (seen.has(key)) return sum;
          seen.add(key);
          return addCents(sum, e.amountCents || 0);
        }, 0);
    };
    const latestAnalysis = events.filter((e) => e.kind === "matched").at(-1);
    const recipientRefs = unique(
      events
        .filter((e) => e.kind === "distributed")
        .map((e) => e.counterpartyRef),
    );
    const responseRefs = unique(
      events
        .filter(
          (e) =>
            ["interested", "response"].includes(e.kind) && e.counterpartyRef,
        )
        .map((e) => e.counterpartyRef),
    );
    const interestedRefs = unique(
      events
        .filter((e) => e.kind === "interested" && e.counterpartyRef)
        .map((e) => e.counterpartyRef),
    );
    const closed = active
      .filter((e) => e.kind === "closed" && e.amountCents != null)
      .at(-1);
    transactions.push({
      id,
      address: canonical.property.address || "Address unrecorded",
      identity,
      market,
      receivedAt: new Date(received).toISOString(),
      propertyKey: canonical.physical.propertyKey || `unresolved:${id}`,
      provisionalIdentity: !canonical.physical.verifiedIdentity,
      submissionIds: submissions.map((s) => s.id),
      stages,
      outcome,
      reason: lastOutcome?.reason || null,
      daysObserved: Math.min(days, Math.max(0, (now - received) / 86400000)),
      mature: cutoff < now,
      eligibleMatches: latestAnalysis?.eligible ?? null,
      matchVersion: latestAnalysis?.version || null,
      recipients: recipientRefs.length,
      responses: responseRefs.length,
      deliveredResponses: responseRefs.filter((ref) =>
        recipientRefs.includes(ref),
      ).length,
      interestedBuyers: interestedRefs.length,
      existingOffers: active.filter((e) => e.kind === "offer_recorded"),
      writtenOffers: active.filter((e) => e.kind === "written_offer"),
      offerStatuses: active.filter((e) => e.kind === "offer_status"),
      emd: active.filter((e) =>
        ["emd_pending", "emd_confirmed", "emd_failed"].includes(e.kind),
      ),
      closings: (snapshot.closings || []).filter((c) =>
        submissions.some((s) => s.id === c.deal_id),
      ),
      projectedFeesCents: financial("fee_projected"),
      invoicedFeesCents: financial("fee_invoiced"),
      receivedFeesCents: financial("fee_received"),
      refundedFeesCents: financial("fee_refunded"),
      closedVolumeCents: outcome === "closed" ? closed?.amountCents || 0 : 0,
      closingVolumeKnown: outcome !== "closed" || closed?.amountCents != null,
      history: history.map((e) => ({
        ...e,
        voided: voided.has(e.id),
        outsideObservationWindow: time(e.at) > cutoff,
      })),
      recommendations: [
        !stages.inventory_verified
          ? "Verify contract or inventory control before outreach."
          : null,
        latestAnalysis && latestAnalysis.eligible === 0
          ? "Review recorded match constraints and asking price; no eligible matches recorded."
          : null,
        recipientRefs.length >= 5 &&
        responseRefs.length === 0 &&
        events
          .filter((e) => e.kind === "distributed")
          .some((e) => time(e.at) <= cutoff - 7 * 86400000)
          ? "Review offer presentation and recorded recipient fit; no responses recorded after at least seven observed days."
          : null,
        active.some((e) => e.kind === "written_offer") &&
        !active.some((e) => e.kind === "emd_confirmed")
          ? "Confirm escrow/title earnest-money evidence; written offer has no confirmed EMD."
          : null,
        lastOutcome?.reason
          ? `Review documented bottleneck: ${lastOutcome.reason.replaceAll("_", " ")}.`
          : null,
      ].filter(Boolean),
    });
  }
  const propertyGroups = new Map();
  for (const transaction of transactions) {
    if (!propertyGroups.has(transaction.propertyKey))
      propertyGroups.set(transaction.propertyKey, []);
    propertyGroups.get(transaction.propertyKey).push(transaction);
  }
  const properties = [...propertyGroups.values()];
  const count = (kind) =>
    properties.filter((group) => group.some((t) => t.stages[kind])).length;
  const metric = (numerator, denominator) => ({
    numerator,
    denominator,
    percent: denominator ? (numerator / denominator) * 100 : null,
  });
  const stages = [
    "received",
    "inventory_verified",
    "matched",
    "distributed",
    "interested",
    "written_offer",
    "emd_confirmed",
    "closed",
  ];
  const funnel = stages.map((stage, index) => ({
    stage,
    reached: count(stage),
    ...metric(
      index
        ? properties.filter(
            (group) =>
              group.some((t) => t.stages[stage]) &&
              group.some((t) => t.stages[stages[index - 1]]),
          ).length
        : count(stage),
      index ? count(stages[index - 1]) : properties.length,
    ),
    cohort: metric(count(stage), properties.length),
    note: "Observed independent evidence; conditional numerator includes only properties with both stages. Missing intermediate stages are not inferred.",
  }));
  const intervals = stages.slice(1).map((stage, index) => {
    const prior = stages[index];
    const samples = transactions
      .filter(
        (t) =>
          t.stages[prior] &&
          t.stages[stage] &&
          time(t.stages[stage]) >= time(t.stages[prior]),
      )
      .map((t) => (time(t.stages[stage]) - time(t.stages[prior])) / 86400000);
    return {
      from: prior,
      to: stage,
      samples: samples.length,
      averageDays: samples.length
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : null,
    };
  });
  const reasons = {};
  for (const t of transactions)
    if (t.reason) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  const duplicateReview = duplicateReviewCandidates(
    rows,
    transactions,
    latestLinks,
  );
  return {
    filters: { ...filters, windowDays: days },
    asOf: new Date(now).toISOString(),
    properties: properties.length,
    transactions: transactions.length,
    submissions: transactions.reduce((n, t) => n + t.submissionIds.length, 0),
    unresolvedIdentities: transactions.filter((t) => t.provisionalIdentity)
      .length,
    matureTransactions: transactions.filter((t) => t.mature).length,
    eligiblePropertyMatches: metric(
      properties.filter((group) => group.some((t) => t.eligibleMatches > 0))
        .length,
      count("matched"),
    ),
    buyerEngagement: metric(
      transactions.reduce((n, t) => n + t.deliveredResponses, 0),
      transactions.reduce((n, t) => n + t.recipients, 0),
    ),
    funnel,
    intervals,
    reasons,
    closedTransactions: transactions.filter((t) => t.outcome === "closed")
      .length,
    closedVolumeCents: transactions.reduce(
      (n, t) => addCents(n, t.closedVolumeCents),
      0,
    ),
    unknownClosingVolumes: transactions.filter((t) => !t.closingVolumeKnown)
      .length,
    receivedFeesCents: transactions.reduce(
      (n, t) => addCents(n, t.receivedFeesCents),
      0,
    ),
    refundedFeesCents: transactions.reduce(
      (n, t) => addCents(n, t.refundedFeesCents),
      0,
    ),
    projectedFeesCents: transactions.reduce(
      (n, t) => addCents(n, t.projectedFeesCents),
      0,
    ),
    invoicedFeesCents: transactions.reduce(
      (n, t) => addCents(n, t.invoicedFeesCents),
      0,
    ),
    rows: transactions,
    duplicateCandidates: duplicateReview.candidates,
    moreDuplicateCandidates: duplicateReview.hasMore,
  };
}
