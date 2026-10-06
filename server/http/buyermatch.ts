import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  getSupabaseAdminClient,
  getBearerToken,
  isOwnerAdminEmail,
} from "../../api/_accountAuth.js";
import { analyzeDeal } from "../buyermatch/matching.js";
import { calculateFee } from "../buyermatch/workflow.js";
import {
  createCheckout,
  checkoutStripe,
  isTestPlanPrice,
} from "../buyermatch/checkout.js";
import { assertStaging, stagingOrigin } from "../buyermatch/staging.js";
import { findDuplicates } from "../buyermatch/deduplication.js";
import { dispatchOutbox } from "../buyermatch/outbox.js";
import { testProvider } from "../buyermatch/provider.js";
import { responseToken, responseOperationKey } from "../buyermatch/tokens.js";
import { productionDeliveryConfig } from "../buyermatch/production-delivery.js";
import { deliveryAvailability } from "../buyermatch/availability.js";
import { hasBuyerMatchAccess } from "../../src/lib/buyerMatchAccess.js";
import { safeConversationText } from '../buyermatch/conversation.js';
import { billingConfig, isLiveSoftwarePrice } from "../buyermatch/billing-config.js";
import { simulatePlans } from '../buyermatch/usage.js';
import {
  dealSchema,
  criteriaSchema,
  titleSchema,
  safeAnalysis,
  assertOwner,
  assertAdmin,
  normalizeImport,
  encryptIdentity,
  decryptIdentity,
  identityHash,
  reminderDates,
} from "../buyermatch/security.js";

const fail = (message: string, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const checked = (result: any) => {
  if (result.error) throw result.error;
  return result.data;
};
const uuid = z.string().uuid();
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!["GET", "POST"].includes(req.method))
      return res.status(405).json({ error: "Method not allowed" });
    const token = getBearerToken(req);
    if (!token) fail("Sign in required", 401);
    const db = getSupabaseAdminClient();
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) fail("Invalid session", 401);
    const user = auth.data.user!;
    const profile = checked(
      await db
        .from("account_profiles")
        .select("account_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    );
    if (!profile || ["Deactivated", "Deleted"].includes(profile.account_status))
      fail("Active account required", 403);
    const workspace = checked(
      await db
        .from("workspaces")
        .select("account_status")
        .eq("owner_user_id", user.id)
        .maybeSingle(),
    );
    const access = checked(
      await db
        .from("workspace_plan_assignments")
        .select("access_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    );
    if (
      [workspace?.account_status, access?.access_status].some((status) =>
        ["Deactivated", "Deleted"].includes(status),
      )
    )
      fail("Active account required", 403);
    const account = { isOwnerAdmin: isOwnerAdminEmail(user.email || "") };
    const body =
      req.method === "POST"
        ? typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {}
        : req.query;
    const action = String(body.action || "list");
    const readActions = new Set([
      "list",
      "detail",
      "plans",
      "access",
      "admin-list",
      "admin-usage",
      "documents",
    ]);
    if (req.method === "GET" && !readActions.has(action))
      fail("POST required", 405);
    if (action === "access" || (!account.isOwnerAdmin && !["plans", "checkout"].includes(action) && !action.startsWith("admin-"))) {
      const entitlements = checked(await db.from("bm_entitlements")
        .select("product,status,period_start,period_end").eq("owner_id", user.id));
      const active = account.isOwnerAdmin || hasBuyerMatchAccess(entitlements);
      if (action === "access") return res.status(200).json({ active,
        subscribed: entitlements.some((item: any) => item.product === "buyermatch") });
      if (!active) fail("An active BuyerMatch subscription is required. View BuyerMatch plans.", 403);
    }
    const owned = async (id: string) => {
      uuid.parse(id);
      const deal = checked(
        await db
          .from("bm_deals")
          .select("*")
          .eq("id", id)
          .eq("owner_id", user.id)
          .maybeSingle(),
      );
      assertOwner(deal, user.id);
      return deal;
    };
    const emit = (value: any) => res.status(200).json(value);
    if (action.startsWith("admin-")) {
      assertAdmin(account);
      if (action === 'admin-usage') {
        const metrics = checked(await db.rpc('bm_operating_metrics', { p_owner: body.ownerId ? uuid.parse(body.ownerId) : null }));
        return emit({ ...metrics, accounts: metrics.accounts.map((item: any) => ({ ...item, hypothetical: simulatePlans(item.usage) })) });
      }
      if (action === "admin-test-dispatch") {
        assertStaging();
        const provider = testProvider();
        const jobs = checked(
          await db
            .from("bm_outbox")
            .select("id")
            .in("state", ["pending", "processing"])
            .is("accepted_at", null)
            .order("created_at")
            .limit(20),
        );
        let sent = 0,
          retry = 0;
        for (const job of jobs) {
          try {
            if ((await dispatchOutbox(db, job.id, provider)).sent) sent++;
          } catch {
            retry++;
          }
        }
        return emit({ sent, retry, testMode: true });
      }
      if (action === "admin-duplicates") {
        const source = checked(
          await db
            .from("bm_buyers")
            .select("id,identity_ciphertext")
            .eq("id", uuid.parse(body.id))
            .single(),
        );
        return emit({
          candidates: await findDuplicates(
            db,
            decryptIdentity(source.identity_ciphertext),
            source.id,
          ),
        });
      }
      if (action === "admin-duplicate-review") {
        checked(
          await db.rpc("bm_review_duplicate", {
            p_actor: user.id,
            p_source: uuid.parse(body.id),
            p_target: uuid.parse(body.targetId),
            p_decision: z.enum(["merge", "distinct"]).parse(body.decision),
            p_note: z.string().trim().min(3).max(2000).parse(body.note),
          }),
        );
        return emit({ saved: true });
      }
      if (action === "admin-test-response-link") {
        const origin = stagingOrigin();
        const exposure = checked(
          await db
            .from("bm_exposures")
            .select("id,buyer_id")
            .eq("id", uuid.parse(body.exposureId))
            .single(),
        );
        const buyer = checked(
          await db
            .from("bm_buyers")
            .select("synthetic")
            .eq("id", exposure.buyer_id)
            .single(),
        );
        if (!buyer.synthetic) fail("Synthetic exposure required", 403);
        return emit({
          url: `${origin}/buyer-response#${responseToken(exposure.id)}`,
        });
      }
      if (action === "admin-configure") {
        const kind = z
          .enum(["plan", "entitlement", "document", "fee_policy"])
          .parse(body.kind);
        const config = body.config || {};
        if (kind === "plan") {
          const plan = z
            .object({
              version: z.string().min(1).max(100),
              label: z.string().min(1).max(100),
              product: z.enum(["buyermatch", "network"]),
              allowance: z.number().int().min(0).max(10000),
              stripe_price_id: z.string().startsWith("price_").nullable(),
              approved: z.boolean(),
            })
            .parse(config);
          checked(await db.from("bm_plans").insert(plan));
        } else if (kind === "entitlement") {
          const input = z
            .object({
              owner_id: uuid,
              product: z.enum(["buyermatch", "network"]),
              plan_version: z.string(),
              period_start: z.string().datetime(),
              period_end: z.string().datetime(),
              status: z.enum(["active", "inactive"]),
            })
            .parse(config);
          const plan = checked(
            await db
              .from("bm_plans")
              .select("*")
              .eq("version", input.plan_version)
              .eq("product", input.product)
              .eq("approved", true)
              .single(),
          );
          const existing = checked(
            await db
              .from("bm_entitlements")
              .select("stripe_subscription_id")
              .eq("owner_id", input.owner_id)
              .eq("product", input.product)
              .maybeSingle(),
          );
          if (existing?.stripe_subscription_id)
            fail("Manage a paid entitlement through Stripe", 409);
          checked(
            await db
              .from("bm_entitlements")
              .upsert(
                { ...input, allowance: plan.allowance },
                { onConflict: "owner_id,product" },
              ),
          );
        } else if (kind === "document") {
          const input = z
            .object({
              kind: z.enum([
                "platform_terms",
                "privacy",
                "network",
                "fee_schedule",
                "deal_certification",
                "closing_authorization",
              ]),
              version: z.string().min(1).max(100),
              content: z.string().min(20).max(100000),
              approved: z.boolean(),
            })
            .parse(config);
          // Never write placeholder legal language. Admin supplies the exact reviewed document.
          checked(
            await db.rpc("bm_publish_document", {
              p_kind: input.kind,
              p_version: input.version,
              p_content: input.content,
              p_hash: createHash("sha256").update(input.content).digest("hex"),
              p_approved: input.approved,
            }),
          );
        } else {
          const input = z
            .object({
              state: z.string().regex(/^[A-Z]{2}$/),
              plan_version: z.string().min(1),
              version: z.string().min(1),
              approved: z.boolean(),
              document_id: uuid,
              formula: z.object({
                mode: z.enum(["fixed", "percentage"]),
                fixedCents: z.number().int().nonnegative().optional(),
                basisPoints: z.number().int().min(0).max(10000).optional(),
                minimumCents: z.number().int().nonnegative().optional(),
                maximumCents: z.number().int().nonnegative().optional(),
              }),
            })
            .parse(config);
          calculateFee(0, { ...input.formula, approved: true, enabled: true });
          checked(
            await db
              .from("bm_fee_policies")
              .insert({ ...input, enabled: false }),
          );
        }
        return emit({ saved: true, chargesEnabled: false });
      }
      if (action === "admin-list") {
        const page = z.coerce
          .number()
          .int()
          .min(0)
          .max(100000)
          .parse(body.page || 0);
        const buyers = checked(
          await db
            .from("bm_buyers")
            .select("*")
            .order("created_at", { ascending: false })
            .range(page * 100, page * 100 + 99),
        );
        const closings = checked(await db.from("bm_closings").select("*"));
        const deals = checked(
          await db
            .from("bm_deals")
            .select("*")
            .order("created_at", { ascending: false })
            .range(page * 100, page * 100 + 99),
        );
        const imports = checked(
          await db
            .from("bm_imports")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50),
        );
        const reminders = checked(
          await db
            .from("bm_reminders")
            .select("id,deal_id,day_offset,due_date,acknowledged_at")
            .is("acknowledged_at", null)
            .lte("due_date", new Date().toISOString().slice(0, 10))
            .order("due_date")
            .limit(100),
        );
        return emit({
          dueReminders: reminders,
          buyers: buyers.map((b: any) => ({
            ...b,
            identity: decryptIdentity(b.identity_ciphertext),
            identity_ciphertext: undefined,
            source_ciphertext: undefined,
            identity_hash: undefined,
          })),
          deals: deals.map((d: any) => ({
            ...d,
            closing: closings.find((c: any) => c.deal_id === d.id),
            reminders: d.title?.eoc ? reminderDates(d.title.eoc) : [],
          })),
          imports,
        });
      }
      if (action === "admin-preview" || action === "admin-import") {
        const rows = normalizeImport(body.rows, body.mapping || {});
        const existing = checked(
          await db
            .from("bm_buyers")
            .select("identity_hash")
            .in(
              "identity_hash",
              rows
                .filter((r: any) => !r.errors.length)
                .map((r: any) => identityHash(r.identity.email)),
            ),
        );
        const hashes = new Set(existing.map((r: any) => r.identity_hash));
        for (const row of rows)
          if (
            !row.errors.length &&
            hashes.has(identityHash(row.identity.email))
          )
            row.duplicate = true;
        if (action === "admin-preview") return emit({ rows });
        const valid = rows.filter((r: any) => !r.errors.length && !r.duplicate);
        if (!valid.length) return emit({ inserted: 0, skipped: rows.length });
        const result = checked(
          await db.rpc("bm_import_buyers", {
            p_actor: user.id,
            p_submitted: rows.length,
            p_rows: valid.map((r: any) => ({
              identity_hash: identityHash(r.identity.email),
              identity_ciphertext: encryptIdentity(r.identity),
              criteria: criteriaSchema.parse(r.criteria),
              consent_evidence: r.consentEvidence || null,
              source_ciphertext: encryptIdentity({
                row: body.rows[r.row - 1],
                mapping: body.mapping,
                notes: r.notes,
                importedAt: new Date().toISOString(),
              }),
            })),
          }),
        );
        return emit(result);
      }
      if (action === "admin-sync-buyer") {
        const identity = z.object({
          name: z.string().trim().max(200).default(""),
          email: z.string().trim().email(),
          phone: z.string().trim().max(100).default(""),
          company: z.string().trim().max(200).default(""),
        }).parse(body.identity || {});
        const criteria = criteriaSchema.parse(body.criteria || {});
        if (!criteria.markets.length || !criteria.assetTypes.length)
          fail("BuyerMatch requires at least one supported market and property type");
        const hash = identityHash(identity.email);
        const payload = {
          identity_hash: hash,
          identity_ciphertext: encryptIdentity(identity),
          criteria,
          status: "active",
          criteria_verified_at: new Date().toISOString(),
          synthetic: process.env.BM_ENVIRONMENT === 'staging' && identity.email.endsWith('@example.invalid'),
          consent_evidence: String(body.consentEvidence || "Approved Buyer Portal submission").slice(0, 2000),
          source_ciphertext: encryptIdentity({
            source: "buyer_portal",
            sourceId: String(body.sourceId || ""),
            syncedAt: new Date().toISOString(),
          }),
        };
        return emit(checked(await db.rpc('bm_sync_portal_buyer', {
          p_actor: user.id,
          p_key: responseOperationKey({ token: hash, kind: 'message', terms: JSON.stringify({identity,criteria,sourceId:body.sourceId || '',consent:payload.consent_evidence}) }),
          p_value: payload,
        })));
      }
      if (action === "admin-buyer") {
        uuid.parse(body.id);
        const status = z
          .enum(["inactive", "active", "suppressed"])
          .parse(body.status);
        const criteria = criteriaSchema.parse(body.criteria);
        const buyer = checked(
          await db
            .from("bm_buyers")
            .select("id,identity_ciphertext,merged_into")
            .eq("id", body.id)
            .single(),
        );
        if (status === "active") {
          if (buyer.merged_into) fail("Merged aliases cannot be activated");
          const candidates = await findDuplicates(
            db,
            decryptIdentity(buyer.identity_ciphertext),
            body.id,
          );
          const reviews = checked(
            await db
              .from("bm_duplicate_reviews")
              .select("target_id,decision")
              .eq("source_id", body.id),
          );
          if (
            candidates.some(
              (c: any) =>
                !reviews.some(
                  (r: any) => r.target_id === c.id && r.decision === "distinct",
                ),
            )
          )
            fail("Resolve duplicate candidates before activation", 409);
        }
        if (
          status === "active" &&
          (!Array.isArray(criteria.markets) ||
            !criteria.markets.length ||
            !Array.isArray(criteria.assetTypes) ||
            !criteria.assetTypes.length)
        )
          fail("Review markets and property types before activation");
        const verification = z
          .enum(["unverified", "closing_verified"])
          .parse(body.verificationLevel || "unverified");
        if (
          verification === "closing_verified" &&
          !String(body.verificationEvidence || "").trim()
        )
          fail("Closing verification evidence required");
        checked(
          await db
            .from("bm_buyers")
            .update({
              status,
              criteria,
              criteria_verified_at: new Date().toISOString(),
              verification_level: verification,
              verification_evidence: String(
                body.verificationEvidence || "",
              ).slice(0, 4000),
              ...(status === "suppressed"
                ? { opted_out_at: new Date().toISOString() }
                : {}),
            })
            .eq("id", body.id),
        );
        return emit({ saved: true });
      }
      if (action === "admin-detail") {
        uuid.parse(body.id);
        const deal = checked(
          await db.from("bm_deals").select("*").eq("id", body.id).single(),
        );
        const analyses = checked(
          await db
            .from("bm_analyses")
            .select("*")
            .eq("deal_id", body.id)
            .order("created_at", { ascending: false })
            .limit(10),
        );
        const exposures = checked(
          await db
            .from("bm_exposures")
            .select("*,bm_outbox(*)")
            .eq("deal_id", body.id),
        );
        const events = checked(
          await db
            .from("bm_events")
            .select("*")
            .eq("deal_id", body.id)
            .order("created_at"),
        );
        return emit({
          deal,
          analyses,
          exposures: exposures.map((exposure: any) => ({
            ...exposure,
            // PostgREST embeds the UNIQUE exposure_id relationship as an object.
            // Keep the admin API's existing array contract for its consumers.
            bm_outbox: Array.isArray(exposure.bm_outbox)
              ? exposure.bm_outbox
              : exposure.bm_outbox
                ? [exposure.bm_outbox]
                : [],
          })),
          events,
        });
      }
      if (action === "admin-document") {
        const deal = checked(
          await db
            .from("bm_deals")
            .select("*")
            .eq("id", uuid.parse(body.id))
            .single(),
        );
        const key = String(body.path || deal.contract_key || "");
        if (!key.startsWith(`${deal.owner_id}/${deal.id}/`))
          fail("Invalid document path", 403);
        const link = checked(
          await db.storage.from("buyermatch-private").createSignedUrl(key, 60),
        );
        return emit({ url: link.signedUrl });
      }
      if (action === "admin-reminder") {
        checked(
          await db
            .from("bm_reminders")
            .update({ acknowledged_at: new Date().toISOString() })
            .eq("id", uuid.parse(body.reminderId)),
        );
        return emit({ saved: true });
      }
      if (action === "admin-progress") {
        uuid.parse(body.id);
        if (body.kind === "fee_due") {
          const closing = checked(
            await db
              .from("bm_closings")
              .select("selected_exposure_id")
              .eq("deal_id", body.id)
              .single(),
          );
          const exposure = checked(
            await db
              .from("bm_exposures")
              .select("frozen_terms")
              .eq("id", closing.selected_exposure_id)
              .single(),
          );
          const policy = exposure.frozen_terms.policy;
          const estimate = calculateFee(
            z
              .number()
              .int()
              .nonnegative()
              .safe()
              .parse(body.evidence?.grossCents),
            {
              ...policy.formula,
              approved: policy.approved,
              enabled: policy.enabled,
            },
          );
          if (estimate.amountCents === null)
            fail("Accepted fee policy is disabled", 409);
          body.evidence = {
            ...body.evidence,
            amountCents: estimate.amountCents,
          };
        }
        const result = await db.rpc("bm_admin_progress", {
          p_actor: user.id,
          p_deal: body.id,
          p_kind: String(body.kind),
          p_evidence: body.evidence || {},
        });
        if (result.error)
          fail(
            "Progress update rejected. Verify the required exposure, stage and evidence.",
            409,
          );
        return emit({ saved: true });
      }
      if (action === "admin-review") {
        uuid.parse(body.id);
        const deal = checked(
          await db.from("bm_deals").select("*").eq("id", body.id).single(),
        );
        if (["closed", "canceled", "expired"].includes(deal.status))
          fail("Terminal deal cannot be reapproved", 409);
        if (
          !deal.contract_key ||
          !deal.title?.eoc ||
          Date.parse(deal.title.eoc) <= Date.now()
        )
          fail("Uploaded PSA and future EOC required");
        const review = await db.rpc("bm_review_contract", {
          p_actor: user.id,
          p_deal: deal.id,
          p_contract: deal.contract_key,
          p_title: deal.title,
          p_property: deal.property,
        });
        if (review.error)
          fail(
            "Contract review rejected. Reload the current deal and evidence.",
            409,
          );
        return emit({ approved: true, sendingEnabled: false });
      }
      fail("Unknown admin operation", 404);
    }
    if (action === "plans") {
      const entitlements = checked(
        await db
          .from("bm_entitlements")
          .select(
            "product,plan_version,status,period_start,period_end,allowance",
          )
          .eq("owner_id", user.id),
      );
      // Never take a customer-supplied owner/workspace ID for quota reporting.
      const usage = checked(await db.rpc('bm_account_usage', { p_owner: user.id }));
      for (const entitlement of entitlements) {
        const counter = entitlement.product === 'buyermatch' ? usage.analysis : usage.managedDispo;
        entitlement.used = counter.used;
        entitlement.remaining = counter.remaining;
      }
      let catalog: any[] = [];
      let checkoutEnabled = false;
      let checkoutLive = false;
      if (process.env.BM_CHECKOUT_ENABLED === "true") {
        try {
          const { live } = billingConfig();
          checkoutLive = live;
          if (live) {
            const gate = checked(await db.from('bm_live_billing_config').select('enabled,verified').eq('id',true).single());
            if (!gate?.enabled || !gate?.verified) throw new Error('Billing disabled');
          }
          const stripe = checkoutStripe();
          const approved = checked(
            await db
              .from("bm_plans")
              .select("version,product,label,allowance,stripe_price_id")
              .eq("approved", true),
          );
          for (const plan of approved) {
            if (!plan.stripe_price_id) continue;
            const price = await stripe.prices.retrieve(plan.stripe_price_id);
            if (price.recurring && (live ? isLiveSoftwarePrice(price, plan) && plan.allowance > 0 : isTestPlanPrice(price)))
              catalog.push({
                version: plan.version,
                product: plan.product,
                label: plan.label,
                allowance: plan.allowance,
                amount: price.unit_amount,
                currency: price.currency,
                interval: price.recurring.interval,
                intervalCount: price.recurring.interval_count,
              });
          }
          checkoutEnabled = true;
        } catch {
          catalog = [];
        }
      }
      return emit({
        catalog,
        entitlements,
        usage,
        checkoutEnabled,
        checkoutMode: checkoutEnabled ? (checkoutLive ? 'live' : 'test') : 'disabled',
        ...deliveryAvailability(
          checked(
            await db
              .from("bm_configuration")
              .select(
                "distribution_enabled,provider_verified,permissions_verified,agreements_verified",
              )
              .eq("id", true)
              .maybeSingle(),
          ),
          process.env.VERCEL_ENV === "production"
            ? checked(
                await db
                  .from("bm_production_delivery_config")
                  .select("enabled")
                  .eq("id", true)
                  .maybeSingle(),
              )
            : null,
        ),
        successFeesEnabled: false,
        isNetworkAdmin: account.isOwnerAdmin,
      });
    }
    if (action === "checkout")
      return emit(
        await createCheckout(
          db,
          user,
          z.string().min(1).parse(body.planVersion),
          uuid.parse(body.operationKey),
        ),
      );
    if (action === "list")
      return emit({
        deals: checked(
          await db
            .from("bm_deals")
            .select("id,property,status,title,created_at,updated_at")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      });
    if (action === "save") {
      const priorDeal = body.id ? await owned(body.id) : null;
      const property = dealSchema.parse({ ...body.property,
        serviceType: body.property?.serviceType || (priorDeal ? priorDeal.property.serviceType || 'managed_dispo' : 'software') });
      if (body.id) {
        const existing = priorDeal;
        if (!["draft", "analyzed"].includes(existing.status))
          fail("Property is locked after submission for review");
        const saved = await db.rpc("bm_edit_deal", {
          p_owner: user.id,
          p_deal: body.id,
          p_kind: "property",
          p_value: property,
        });
        if (saved.error)
          fail("Deal changed or is locked. Reload before editing.", 409);
        return emit({ id: body.id });
      }
      const id = checked(await db.rpc('bm_create_draft', { p_owner: user.id, p_property: property }));
      return emit({ id });
    }
    if (action === "documents")
      return emit({
        documents: checked(
          await db
            .from("bm_documents")
            .select("id,kind,version,document_hash,content")
            .eq("approved", true)
            .eq("current", true),
        ),
      });
    if (action === "accept") {
      const deal = body.id ? await owned(body.id) : null;
      const document = checked(
        await db
          .from("bm_documents")
          .select("*")
          .eq("id", uuid.parse(body.documentId))
          .eq("approved", true)
          .eq("current", true)
          .single(),
      );
      if (
        createHash("sha256").update(document.content).digest("hex") !==
        document.document_hash
      )
        fail("Agreement integrity check failed", 409);
      const signature = z.string().trim().min(2).max(200).parse(body.signature);
      checked(
        await db.rpc("bm_accept_document", {
          p_owner: user.id,
          p_deal: deal?.id || null,
          p_document: document.id,
          p_hash: document.document_hash,
          p_signature: signature,
        }),
      );
      return emit({ accepted: true });
    }
    const deal = await owned(body.id);
    if (action === "detail") {
      const offers = checked(
        await db
          .from("bm_offers")
          .select("id,amount_cents,created_at")
          .eq("deal_id", deal.id),
      );
      const closing = checked(
        await db
          .from("bm_closings")
          .select(
            "scheduled_date,reported_at,verified_at,user_signed_at,title_acknowledged_at,fee_due_cents,paid_at",
          )
          .eq("deal_id", deal.id)
          .maybeSingle(),
      );
      const analysis = checked(
        await db
          .from("bm_analyses")
          .select("public_result")
          .eq("deal_id", deal.id)
          .order("created_at", { ascending: false })
          .limit(1),
      );
      const events = checked(
        await db
          .from("bm_events")
          .select("id,kind,public_note,created_at")
          .eq("deal_id", deal.id)
          .order("created_at"),
      );
      const messages = checked(
        await db
          .from("bm_messages")
          .select("id,exposure_id,sender_kind,body,created_at")
          .eq("deal_id", deal.id)
          .order("created_at"),
      );
      const conversations = checked(
        await db
          .from("bm_exposures")
          .select("id,buyer_id,created_at")
          .eq("deal_id", deal.id)
          .eq("owner_id", user.id)
          .order("created_at"),
      ).map((exposure: any) => ({
        exposureId: exposure.id,
        buyerRef: `BM-${createHash("sha256").update(exposure.buyer_id).digest("hex").slice(0, 8).toUpperCase()}`,
      }));
      return emit({
        offers,
        closing,
        messages: messages.map((message: any) => ({ ...message, body: safeConversationText(message.body) })),
        conversations,
        deal: {
          id: deal.id,
          property: deal.property,
          status: deal.status,
          title: deal.title,
          hasContract: Boolean(deal.contract_key),
          contractVerified: deal.contract_verified,
        },
        analysis:
          deal.status === "draft" ? null : analysis[0]?.public_result || null,
        events,
      });
    }
    if (action === "analyze") {
      const operationKey = uuid.parse(body.operationKey);
      const prior = checked(
        await db
          .from("bm_analyses")
          .select("deal_id,public_result")
          .eq("owner_id", user.id)
          .eq("operation_key", operationKey)
          .maybeSingle(),
      );
      if (prior) {
        if (prior.deal_id !== deal.id) fail("Operation key conflict", 409);
        return emit(prior.public_result);
      }
      const entitlement = checked(
        await db
          .from("bm_entitlements")
          .select("*")
          .eq("owner_id", user.id)
          .eq("product", "buyermatch")
          .eq("status", "active")
          .lte("period_start", new Date().toISOString())
          .gt("period_end", new Date().toISOString())
          .maybeSingle(),
      );
      if (!entitlement)
        fail("Activate a separate BuyerMatch entitlement to analyze.", 403);
      const property = dealSchema.parse(deal.property);
      const rows: any[] = [];
      for (let offset = 0; offset <= 10000; offset += 1000) {
        const page = checked(
          await db
            .from("bm_buyers")
            .select(
              "id,criteria,status,criteria_verified_at,last_active_at,verification_level,verification_evidence",
            )
            .eq("status", "active")
            .is("opted_out_at", null)
            .order("id")
            .range(offset, offset + 999),
        );
        rows.push(...page);
        if (page.length < 1000) break;
      }
      if (rows.length > 10000)
        fail("Network exceeds configured analysis capacity", 503);
      const buyers = rows.map((b: any) => ({
        ...b.criteria,
        id: b.id,
        status: b.status,
        criteriaVerifiedAt: b.criteria_verified_at,
        lastActiveAt: b.last_active_at,
        verificationLevel: b.verification_evidence
          ? b.verification_level
          : "unverified",
      }));
      const privateResult = analyzeDeal(property, buyers);
      const result = {
        ...safeAnalysis(privateResult),
        missingInformation: [
          "arv",
          "repairs",
          "beds",
          "baths",
          "sqft",
          "condition",
          "occupancy",
        ].filter((key) => property[key] === undefined || property[key] === ""),
        priceSensitivity: [0.9, 1, 1.1].map((factor) => {
          const price = Math.round(property.price * factor);
          return {
            price,
            ...safeAnalysis(analyzeDeal({ ...property, price }, buyers)),
          };
        }),
      };
      const committed = await db.rpc("bm_commit_analysis", {
        p_owner: user.id,
        p_deal: deal.id,
        p_key: operationKey,
        p_private: privateResult,
        p_public: result,
        p_property: property,
      });
      if (committed.error)
        fail(
          "Analysis could not be saved. Check allowance, hourly query limit, and retry with the same operation key.",
          409,
        );
      return emit(committed.data);
    }
    if (action === "upload") {
      const purpose = z
        .enum(["contract", "settlement"])
        .parse(body.purpose || "contract");
      if (
        purpose === "contract" &&
        !["draft", "analyzed", "ready_for_review"].includes(deal.status)
      )
        fail("Contract is locked after approval");
      const key = `${user.id}/${deal.id}/${randomUUID()}.pdf`;
      const upload = checked(
        await db.storage.from("buyermatch-private").createSignedUploadUrl(key),
      );
      if (purpose === "contract") {
        const saved = await db.rpc("bm_edit_deal", {
          p_owner: user.id,
          p_deal: deal.id,
          p_kind: "contract",
          p_value: { key },
        });
        if (saved.error)
          fail("Contract changed or is locked. Reload before uploading.", 409);
      }
      return emit({ path: key, token: upload.token });
    }
    if (action === "title") {
      if (["closed", "canceled", "expired"].includes(deal.status))
        fail("Terminal deal cannot be edited", 409);
      const title = titleSchema.parse(body.title);
      const saved = await db.rpc("bm_edit_deal", {
        p_owner: user.id,
        p_deal: deal.id,
        p_kind: "title",
        p_value: title,
      });
      if (saved.error)
        fail("Deal changed or is locked. Reload before editing.", 409);
      return emit({ saved: true });
    }
    if (action === "update") {
      const kind = z
        .enum([
          "progress_update",
          "closing_reported",
          "cancellation_requested",
          "review_requested",
        ])
        .parse(body.kind);
      const note = z.string().trim().min(1).max(2000).parse(body.note);
      const settlementKey = String(body.settlementKey || "");
      if (settlementKey && !settlementKey.startsWith(`${user.id}/${deal.id}/`))
        fail("Invalid evidence path", 403);
      checked(
        await db.from("bm_events").insert({
          deal_id: deal.id,
          actor_id: user.id,
          kind,
          public_note: note,
          evidence: settlementKey ? { settlementKey } : {},
        }),
      );
      if (kind === "review_requested")
        checked(
          await db
            .from("bm_deals")
            .update({ status: "ready_for_review" })
            .eq("id", deal.id)
            .in("status", ["draft", "analyzed"]),
        );
      return emit({ saved: true, closingVerified: false });
    }
    if (action === "message") {
      const message = z.string().trim().min(1).max(2000).parse(body.message);
      const exposureId = uuid.parse(body.exposureId);
      const result = await db.rpc('bm_owner_message', {
        p_owner: user.id, p_deal: deal.id, p_exposure: exposureId,
        p_key: responseOperationKey({ token: user.id + ':' + deal.id + ':' + exposureId, kind: 'message', terms: message }),
        p_body: message,
      });
      if (result.error) fail('Conversation unavailable or message limit reached.', 409);
      return emit({ sent: true });
    }
    if (action === "distribution") {
      const production = process.env.VERCEL_ENV === "production";
      if (production) productionDeliveryConfig();
      else assertStaging();
      const result = await db.rpc(
        production
          ? "bm_queue_production_distribution"
          : "bm_queue_distribution",
        {
          p_owner: user.id,
          p_deal: deal.id,
          p_key: uuid.parse(body.operationKey),
        },
      );
      if (result.error)
        fail(
          "Distribution unavailable. Verified provider, permissions, approved agreements, entitlement, contract review and jurisdiction policy are required. No charges created.",
          409,
        );
      return emit(result.data);
    }
    fail("Unknown operation", 404);
  } catch (error: any) {
    // Never serialize Supabase errors, private records or request bodies into logs/responses.
    const status =
      error instanceof z.ZodError ? 400 : Number(error.status) || 503;
    return res.status(status).json({
      error:
        error instanceof z.ZodError
          ? "Check required fields and valid numeric values."
          : error.status
            ? error.message
            : "BuyerMatch is unavailable. An administrator must verify database and server configuration.",
    });
  }
}
