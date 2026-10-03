import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  encryptIdentity,
  identityHash,
} from "../server/buyermatch/security.js";
import { assertStaging } from "../server/buyermatch/staging.js";
const env = process.env;
const url = assertStaging(env);
if (env.BM_STAGING_CONFIRM !== "I_HAVE_VERIFIED_THIS_IS_NOT_PRODUCTION")
  throw new Error("Explicit staging confirmation required");
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.BUYERMATCH_IDENTITY_KEY)
  throw new Error("Server secrets required");
const fixtureId = (value) => {
  const h = createHash("sha256")
    .update("bm-staging-v2:" + value)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const accounts = [
  {
    email: env.BM_TEST_USER_EMAIL,
    password: env.BM_TEST_USER_PASSWORD,
    label: "Regular User",
  },
  {
    email: env.BM_TEST_OTHER_EMAIL,
    password: env.BM_TEST_OTHER_PASSWORD,
    label: "Other User",
  },
  {
    email: env.BM_TEST_ADMIN_EMAIL,
    password: env.BM_TEST_ADMIN_PASSWORD,
    label: "Network Admin",
  },
];
if (
  accounts.some(
    (x) =>
      !x.email?.endsWith("@example.invalid") ||
      !x.password ||
      x.password.length < 16,
  ) ||
  new Set(accounts.map((x) => x.email)).size !== 3
)
  throw new Error(
    "Three unique @example.invalid fixture emails and separate 16+ character passwords required",
  );
const admins = (env.DEALBLAST_OWNER_ADMIN_EMAILS || "")
  .toLowerCase()
  .split(",")
  .map((x) => x.trim());
if (
  !admins.includes(accounts[2].email.toLowerCase()) ||
  accounts.slice(0, 2).some((x) => admins.includes(x.email.toLowerCase()))
)
  throw new Error("Only the admin fixture may be in the owner-admin allowlist");
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = ({ data, error }) => {
  if (error)
    throw new Error(
      "Staging fixture operation failed. Verify schema and secure environment configuration.",
    );
  return data;
};
const marker = checked(
  await db.from("dbp_staging_installation").select("project_ref").single(),
);
if (marker.project_ref !== env.BM_STAGING_PROJECT_REF)
  throw new Error("Staging database marker mismatch");
const users = [];
for (let page = 1; ; page++) {
  const data = checked(await db.auth.admin.listUsers({ page, perPage: 1000 }));
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const ids = [];
for (const account of accounts) {
  let user = users.find(
    (u) => u.email?.toLowerCase() === account.email.toLowerCase(),
  );
  if (user && !user.user_metadata?.bm_staging_fixture)
    throw new Error("Refusing to reuse a non-fixture account");
  if (!user)
    user = checked(
      await db.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          full_name: `SYNTHETIC ${account.label}`,
          bm_staging_fixture: true,
        },
      }),
    ).user;
  ids.push(user.id);
  checked(
    await db
      .from("account_profiles")
      .upsert(
        {
          user_id: user.id,
          email: account.email,
          full_name: `SYNTHETIC ${account.label}`,
          display_name: account.label,
          role: "Admin",
          account_status: "Active",
          onboarding_version_completed: 999,
        },
        { onConflict: "user_id" },
      ),
  );
  const workspace = checked(
    await db
      .from("workspaces")
      .upsert(
        {
          owner_user_id: user.id,
          owner_email: account.email,
          name: `SYNTHETIC ${account.label} Workspace`,
        },
        { onConflict: "owner_user_id" },
      )
      .select("id")
      .single(),
  );
  checked(
    await db
      .from("workspace_plan_assignments")
      .upsert(
        {
          workspace_id: workspace.id,
          user_id: user.id,
          plan_name: "Free",
          billing_status: "Free Active",
          payment_status: "No payment required",
          current_plan: "Free",
          effective_access_plan: "Free",
        },
        { onConflict: "workspace_id", ignoreDuplicates: true },
      ),
  );
  for (const product of ["buyermatch", "network"])
    checked(
      await db
        .from("bm_entitlements")
        .upsert(
          {
            owner_id: user.id,
            product,
            plan_version: "staging-only-v2",
            status: "active",
            period_start: new Date().toISOString(),
            period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
            allowance: 50,
          },
          { onConflict: "owner_id,product", ignoreDuplicates: true },
        ),
    );
  const property = {
    address: "123 SYNTHETIC TEST STREET",
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
  checked(
    await db
      .from("bm_deals")
      .upsert(
        { id: fixtureId(account.email + ":deal"), owner_id: user.id, property },
        { onConflict: "id", ignoreDuplicates: true },
      ),
  );
  console.log(`${account.label} fixture ready; no email sent.`);
}
for (let index = 1; index <= 6; index++) {
  const identity = {
    name: `SYNTHETIC BUYER ${index}`,
    email: `qa-buyer-${index}@example.invalid`,
    phone: `20255501${String(index).padStart(2, "0")}`,
    company: `Synthetic Fixture ${index}`,
  };
  checked(
    await db
      .from("bm_buyers")
      .upsert(
        {
          id: fixtureId(identity.email),
          identity_hash: identityHash(identity.email),
          identity_ciphertext: encryptIdentity(identity),
          criteria: {
            markets: [{ state: "TN", city: "Memphis" }],
            assetTypes: ["sfh"],
            maxPrice: 70000,
            maxArvRatio: 0.7,
          },
          status: "active",
          criteria_verified_at: new Date().toISOString(),
          verification_level: "unverified",
          synthetic: true,
          consent_evidence: "SYNTHETIC QA consent. Test sink only.",
        },
        { onConflict: "identity_hash", ignoreDuplicates: true },
      ),
  );
}
for (const kind of [
  "platform_terms",
  "privacy",
  "network",
  "fee_schedule",
  "deal_certification",
  "closing_authorization",
]) {
  const content = `SYNTHETIC QA FIXTURE ONLY — ${kind}. This is not a legal agreement, fee authorization, contract, or approval to contact real buyers. Used only to exercise version acceptance in isolated staging. No success fees are payable.`;
  const id = fixtureId("doc:" + kind);
  checked(
    await db
      .from("bm_documents")
      .upsert(
        {
          id,
          kind,
          version: "staging-fixture-v2",
          content,
          document_hash: createHash("sha256").update(content).digest("hex"),
          approved: true,
          current: true,
        },
        { onConflict: "id", ignoreDuplicates: true },
      ),
  );
}
checked(
  await db
    .from("bm_fee_policies")
    .upsert(
      {
        id: fixtureId("fee-policy"),
        state: "TN",
        plan_version: "staging-only-v2",
        version: "staging-zero-fee-v2",
        approved: true,
        enabled: false,
        formula: { mode: "fixed", fixedCents: 0 },
        document_id: fixtureId("doc:fee_schedule"),
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
);
checked(
  await db
    .from("bm_configuration")
    .update({
      distribution_enabled: true,
      provider_verified: true,
      permissions_verified: true,
      agreements_verified: true,
      success_fees_enabled: false,
    })
    .eq("id", true),
);
console.log(
  "Synthetic deals, unverified buyers and clearly labeled QA documents ready. Test distributions require mock/resend-test worker mode. No real sends, prices, charges or success fees enabled.",
);
