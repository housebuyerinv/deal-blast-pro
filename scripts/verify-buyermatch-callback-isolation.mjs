// Synthetic signed callback rehearsal, never sends email or connects to Production.
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
const env = process.env,
  ref = "qxhhlprentrufobpcgna";
if (
  env.SUPABASE_URL !== `https://${ref}.supabase.co` ||
  env.BM_STAGING_CONFIRM !== "I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION" ||
  !env.BM_RESEND_WEBHOOK_SECRET ||
  !env.RESEND_WEBHOOK_SECRET
)
  throw Error("Explicit staging fixture configuration required");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checks = [];
function check(ok, label) {
  if (!ok) throw Error(label);
  checks.push(label);
}
function data(r) {
  if (r.error) throw Error("Staging fixture database operation failed");
  return r.data;
}
const marker = data(
  await db.from("dbp_staging_installation").select("project_ref"),
);
check(marker.length === 1 && marker[0].project_ref === ref, "staging marker");
const session = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
if (!env.BM_TEST_OTHER_EMAIL?.endsWith("@example.invalid"))
  throw Error("Synthetic owner required");
const auth = await session.auth.signInWithPassword({
  email: env.BM_TEST_OTHER_EMAIL,
  password: env.BM_TEST_OTHER_PASSWORD,
});
check(!auth.error, "synthetic owner authentication");
const owner = auth.data.user.id;
const tables = [
  "bm_outbox",
  "bm_exposures",
  "bm_buyers",
  "bm_provider_events",
  "bm_events",
  "bm_responses",
  "bm_closings",
  "bm_billing_events",
  "email_outbox",
  "email_delivery_events",
  "email_suppressions",
];
async function snapshot() {
  const result = {};
  for (const table of tables) {
    const rows = data(await db.from(table).select("*"));
    result[table] = createHash("sha256")
      .update(JSON.stringify(rows.map((x) => JSON.stringify(x)).sort()))
      .digest("hex");
  }
  return JSON.stringify(result);
}
async function signed(
  path,
  kind,
  message,
  event = randomUUID(),
  valid = true,
  extra = {},
) {
  const body = JSON.stringify({
    type: kind,
    created_at: new Date().toISOString(),
    data: { email_id: message, ...extra },
  });
  const date = new Date();
  const secret =
    path === "buyermatch-delivery"
      ? env.BM_RESEND_WEBHOOK_SECRET
      : env.RESEND_WEBHOOK_SECRET;
  return fetch(`${env.SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": event,
      "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
      "svix-signature": valid
        ? new Webhook(secret).sign(event, date, body)
        : "invalid",
    },
  });
}
for (const path of ["buyermatch-delivery", "resend-webhook"]) {
  const before = await snapshot();
  check(
    [400, 401].includes(
      (await signed(path, "email.delivered", randomUUID(), randomUUID(), false))
        .status,
    ),
    `${path} invalid signature rejected`,
  );
  for (const kind of [
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.failed",
    "email.delivery_delayed",
    "email.opened",
    "email.clicked",
  ]) {
    const r = await signed(path, kind, randomUUID());
    check(
      r.status === 200 && (await r.json()).ignored === true,
      `${path} unknown ${kind} safe acknowledgement`,
    );
    check(
      (await snapshot()) === before,
      `${path} unknown ${kind} zero mutation`,
    );
  }
}
const deal = randomUUID(),
  buyer = randomUUID(),
  exposure = randomUUID(),
  outbox = randomUUID(),
  operation = randomUUID(),
  message = "fixture-" + randomUUID();
data(
  await db
    .from("bm_deals")
    .insert({
      id: deal,
      owner_id: owner,
      property: {
        address: "SYNTHETIC CALLBACK ISOLATION QA",
        state: "TN",
        serviceType: "managed_dispo",
      },
      status: "distributing",
    }),
);
data(
  await db
    .from("bm_buyers")
    .insert({
      id: buyer,
      identity_ciphertext: "SYNTHETIC CALLBACK FIXTURE NO CONTACT DATA",
      identity_hash: randomUUID(),
      criteria: {},
      synthetic: true,
      status: "active",
    }),
);
data(
  await db
    .from("bm_distribution_requests")
    .insert({ owner_id: owner, deal_id: deal, operation_key: operation }),
);
data(
  await db
    .from("bm_exposures")
    .insert({
      id: exposure,
      owner_id: owner,
      deal_id: deal,
      buyer_id: buyer,
      operation_key: operation,
      frozen_terms: { fixture: "callback-isolation" },
    }),
);
data(
  await db
    .from("bm_response_tokens")
    .insert({
      token_hash: randomUUID(),
      exposure_id: exposure,
      environment: "staging",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
);
data(
  await db
    .from("bm_outbox")
    .insert({
      id: outbox,
      exposure_id: exposure,
      provider_message_id: message,
      test_delivery: true,
      accepted_at: new Date().toISOString(),
      state: "accepted",
    }),
);
const fixture = {
  deal,
  buyer,
  exposure,
  outbox,
  message,
  syntheticProviderReceipt: true,
};
writeFileSync(
  "test-artifacts/callback-hosted-fixture.json",
  JSON.stringify(fixture),
);
const before = await snapshot();
const inverse = await db.rpc("bm_record_provider_event_scoped", {
  p_event: randomUUID(),
  p_message: message,
  p_kind: "email.complained",
  p_at: new Date().toISOString(),
  p_environment: "production",
});
check(
  data(inverse) === false,
  "staging receipt rejected by Production scope in staging DB",
);
check((await snapshot()) === before, "cross-scope zero mutation");
const event = randomUUID();
const responses = await Promise.all(
  Array.from({ length: 3 }, () =>
    signed("buyermatch-delivery", "email.delivered", message, event, true, {
      owner_id: randomUUID(),
      deal_id: randomUUID(),
      buyer_id: randomUUID(),
      workspace_id: randomUUID(),
      to: ["forged@example.invalid"],
      from: "forged@example.invalid",
      subject: "forged",
    }),
  ),
);
for (const r of responses)
  check(
    r.status === 200 && (await r.json()).recorded === true,
    "concurrent signed delivery acknowledged",
  );
check(
  data(
    await db
      .from("bm_provider_events")
      .select("event_id")
      .eq("event_id", event),
  ).length === 1,
  "one provider event after concurrent replay",
);
check(
  data(await db.from("bm_outbox").select("state").eq("id", outbox))[0].state ===
    "delivered",
  "known staging delivery applied",
);
const after = await snapshot();
await signed("buyermatch-delivery", "email.complained", message, event);
check(
  (await snapshot()) === after,
  "same event cannot replay with different mutation",
);
const bounce = await signed("buyermatch-delivery", "email.bounced", message);
check(bounce.status === 200, "known bounce accepted");
check(
  data(await db.from("bm_buyers").select("status").eq("id", buyer))[0]
    .status === "suppressed",
  "only correlated fixture buyer suppressed",
);
const denied = await session.from("bm_buyers").select("id");
check(!!denied.error, "regular account cannot retrieve private buyer database");
writeFileSync(
  "test-artifacts/callback-hosted-report.json",
  JSON.stringify(
    {
      status: "passed",
      assertions: checks.length,
      checks,
      method:
        "Real staging HTTP with synthetic signed envelopes and synthetic receipt; no Resend sends or Production requests",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: "passed",
    assertions: checks.length,
    providerSends: 0,
    productionRequests: 0,
  }),
);
