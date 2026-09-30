// Real staging HTTP verification. Synthetic fixtures only; never prints credentials or private responses.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { stagingOrigin } from "../server/buyermatch/staging.js";
const env = process.env;
const origin = stagingOrigin(env);
const checks = [];
const ensure = (ok, label) => {
  if (!ok) throw new Error(label);
  checks.push({ check: label, status: "passed" });
};
if (env.BM_STAGING_CONFIRM !== "I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION")
  throw new Error("Explicit staging confirmation required");
const headers = env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET }
  : {};
async function account(prefix) {
  const email = env[`BM_TEST_${prefix}_EMAIL`];
  if (!email?.endsWith("@example.invalid"))
    throw new Error("Synthetic account required");
  const db = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await db.auth.signInWithPassword({
    email,
    password: env[`BM_TEST_${prefix}_PASSWORD`],
  });
  ensure(!result.error, `${prefix} fixture authentication`);
  return { db, token: result.data.session.access_token };
}
async function api(account, action, data = {}, expected = 200) {
  const r = await fetch(origin + "/api/buyermatch", {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${account.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...data }),
  });
  ensure(r.status === expected, `${action}: HTTP ${expected}`);
  return r.json();
}
function syntheticPdf() {
  const stream =
    "BT /F1 14 Tf 40 750 Td (SYNTHETIC QA ONLY - NOT A CONTRACT OR SETTLEMENT) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}
let failure = null;
try {
  const user = await account("USER"),
    other = await account("OTHER"),
    admin = await account("ADMIN");
  const list = await api(admin, "admin-list");
  ensure(
    list.buyers.length >= 6 &&
      list.buyers.every(
        (b) => b.synthetic && b.identity.email.endsWith("@example.invalid"),
      ),
    "Only synthetic network fixtures present",
  );
  const secrets = list.buyers.flatMap((b) => [
    b.id,
    b.identity.email,
    b.identity.name,
    b.identity.phone,
  ]);
  const privateSafe = (data) =>
    ensure(
      !secrets.some((value) => value && JSON.stringify(data).includes(value)),
      "Regular-user response contains no buyer identity",
    );
  const property = {
    address: "123 SYNTHETIC QA STREET",
    city: "Memphis",
    state: "TN",
    zip: "38111",
    assetType: "sfh",
    price: 60000,
    arv: 125000,
    repairs: 25000,
    beds: 3,
    baths: 2,
    sqft: 1200,
  };
  const { id } = await api(user, "save", { property });
  for (const action of [
    "detail",
    "upload",
    "analyze",
    "title",
    "accept",
    "distribution",
    "update",
  ])
    await api(other, action, { id }, 404);
  for (const action of [
    "admin-list",
    "admin-detail",
    "admin-import",
    "admin-duplicates",
    "admin-duplicate-review",
    "admin-test-dispatch",
    "admin-progress",
    "admin-configure",
  ])
    await api(user, action, { id }, 403);
  for (const table of [
    "bm_buyers",
    "bm_deals",
    "bm_exposures",
    "bm_response_tokens",
  ]) {
    const result = await user.db.from(table).select("*").limit(1);
    ensure(Boolean(result.error), `Browser table access denied: ${table}`);
  }
  const before = await api(user, "plans");
  const operationKey = randomUUID();
  const first = await api(user, "analyze", { id, operationKey });
  const retry = await api(user, "analyze", { id, operationKey });
  ensure(
    JSON.stringify(first) === JSON.stringify(retry),
    "Analysis retry replays original result",
  );
  privateSafe(first);
  const after = await api(user, "plans");
  ensure(
    before.entitlements.find((x) => x.product === "buyermatch").remaining -
      after.entitlements.find((x) => x.product === "buyermatch").remaining ===
      1,
    "Exactly one analysis allowance consumed",
  );
  const pdf = syntheticPdf();
  mkdirSync("test-artifacts", { recursive: true });
  writeFileSync("test-artifacts/buyermatch-synthetic.pdf", pdf);
  async function upload(purpose) {
    const result = await api(user, "upload", { id, purpose });
    const saved = await user.db.storage
      .from("buyermatch-private")
      .uploadToSignedUrl(result.path, result.token, pdf, {
        contentType: "application/pdf",
      });
    ensure(!saved.error, `${purpose} signed PDF upload`);
    const foreign = await other.db.storage
      .from("buyermatch-private")
      .download(result.path);
    ensure(Boolean(foreign.error), `${purpose} cross-owner download denied`);
    const url = user.db.storage
      .from("buyermatch-private")
      .getPublicUrl(result.path).data.publicUrl;
    ensure(!(await fetch(url)).ok, `${purpose} public storage download denied`);
    return result.path;
  }
  await upload("contract");
  const date = (days) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const title = {
    company: "SYNTHETIC Title",
    name: "QA Agent",
    email: "qa-title@example.invalid",
    phone: "2025550199",
    eoc: date(30),
  };
  await api(user, "title", { id, title });
  const { documents } = await api(user, "documents");
  ensure(
    documents.every((d) => d.content.includes("SYNTHETIC QA FIXTURE ONLY")),
    "Only synthetic QA agreements used",
  );
  for (const kind of ["network", "fee_schedule", "deal_certification"])
    await api(user, "accept", {
      id,
      documentId: documents.find((d) => d.kind === kind).id,
      signature: "Synthetic QA Owner",
    });
  await api(admin, "admin-review", { id });
  const key = randomUUID();
  const queued = await api(user, "distribution", { id, operationKey: key });
  ensure(
    (await api(user, "distribution", { id, operationKey: key })).requestId ===
      queued.requestId,
    "Distribution retry reuses reservation",
  );
  const sent = await api(admin, "admin-test-dispatch");
  ensure(sent.sent > 0 && sent.retry === 0, "Synthetic delivery accepted");
  await api(admin, "admin-test-dispatch");
  const detail = await api(admin, "admin-detail", { id });
  ensure(detail.exposures.length > 0, "Immutable exposures exist");
  const exposure = detail.exposures[0];
  ensure(exposure.bm_outbox[0].accepted_at, "Provider acceptance persisted");
  const link = await api(admin, "admin-test-response-link", {
    exposureId: exposure.id,
  });
  const responseBody = {
    token: new URL(link.url).hash.slice(1),
    operationKey: randomUUID(),
    kind: "offer",
    amountCents: 6000000,
    terms: "SYNTHETIC QA offer",
  };
  for (let i = 0; i < 2; i++) {
    const response = await fetch(origin + "/api/buyermatch-response", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(responseBody),
    });
    ensure(response.ok, "Buyer offer capability and replay accepted");
  }
  let publicDetail = await api(user, "detail", { id });
  privateSafe(publicDetail);
  ensure(
    publicDetail.offers.length === 1,
    "Buyer offer replay creates one offer",
  );
  await api(user, "title", { id, title: { ...title, eoc: date(45) } });
  await api(admin, "admin-review", { id });
  const extended = await api(user, "detail", { id });
  ensure(
    extended.deal.title.eoc === date(45),
    "EOC extension saved and review restored",
  );
  for (const [kind, evidence] of [
    ["buyer_selected", { exposureId: exposure.id }],
    ["title_open", {}],
    ["closing_scheduled", { date: date(15) }],
  ])
    await api(admin, "admin-progress", { id, kind, evidence });
  await api(user, "accept", {
    id,
    documentId: documents.find((d) => d.kind === "closing_authorization").id,
    signature: "Synthetic QA Owner",
  });
  publicDetail = await api(user, "detail", { id });
  ensure(
    publicDetail.closing.user_signed_at &&
      !publicDetail.closing.title_acknowledged_at,
    "Signature does not imply title acknowledgement",
  );
  await api(admin, "admin-progress", {
    id,
    kind: "title_acknowledged",
    evidence: { reference: "SYNTHETIC QA title confirmation" },
  });
  const settlementKey = await upload("settlement");
  await api(user, "update", {
    id,
    kind: "closing_reported",
    note: "SYNTHETIC QA reported close",
    settlementKey,
  });
  ensure(
    !(await api(user, "detail", { id })).closing.verified_at,
    "Reported close remains pending",
  );
  await api(admin, "admin-progress", {
    id,
    kind: "closing_verified",
    evidence: { settlementKey },
  });
  publicDetail = await api(user, "detail", { id });
  ensure(
    publicDetail.closing.verified_at && !publicDetail.closing.paid_at,
    "Verified closing and payment remain separate",
  );
  privateSafe(publicDetail);
  console.log(
    "Staging HTTP checks passed. Stripe checkout completion, delivery callback receipt and browser interactions still require the handoff checks.",
  );
} catch (error) {
  failure = error.message;
  console.error("Staging verification stopped: " + failure);
  process.exitCode = 1;
} finally {
  mkdirSync("test-artifacts", { recursive: true });
  writeFileSync(
    "test-artifacts/buyermatch-staging-report.json",
    JSON.stringify(
      {
        previewUrl: origin,
        checkedAt: new Date().toISOString(),
        checks,
        failure,
        notCovered: [
          "Stripe hosted test payment",
          "Provider delivery callback receipt",
          "Browser visual and interaction checks",
        ],
      },
      null,
      2,
    ),
  );
}
