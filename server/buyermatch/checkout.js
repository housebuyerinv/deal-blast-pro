import process from "node:process";
import Stripe from "stripe";
import { stagingOrigin } from "./staging.js";
import { billingConfig, isPlanPrice, isLiveSoftwarePrice } from "./billing-config.js";
const conflict = (message) => {
  throw Object.assign(new Error(message), { status: 409 });
};
const validCheckoutUrl = (url) =>
  typeof url === "string" && url.startsWith("https://checkout.stripe.com/");
export function isTestPlanPrice(price) {
  return (
    price.livemode === false &&
    price.active &&
    price.type === "recurring" &&
    price.currency === "usd" &&
    Number.isSafeInteger(price.unit_amount) &&
    price.unit_amount >= 0 &&
    price.recurring?.usage_type === "licensed"
  );
}
export function testStripe(env = process.env) {
  stagingOrigin(env);
  if (!/^(sk|rk)_test_/.test(env.BM_STRIPE_TEST_SECRET_KEY || ""))
    throw new Error("Stripe test key required");
  return new Stripe(env.BM_STRIPE_TEST_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia",
    maxNetworkRetries: 2,
  });
}
export function checkoutStripe(env = process.env) {
  const config = billingConfig(env);
  if (!config.live) return testStripe(env);
  return new Stripe(config.key, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 2 });
}
export async function createCheckout(
  db,
  user,
  version,
  operationKey,
  env = process.env,
  stripe = checkoutStripe(env),
) {
  const { origin, live } = billingConfig(env);
  if (env.BM_CHECKOUT_ENABLED !== "true")
    throw new Error("BuyerMatch checkout disabled");
  if (live) {
    const config = await db.from('bm_live_billing_config').select('enabled,verified').eq('id', true).single();
    if (config.error || !config.data?.enabled || !config.data?.verified) throw new Error('Live BuyerMatch billing disabled');
  }
  const { data: plan, error } = await db
    .from("bm_plans")
    .select("*")
    .eq("version", version)
    .eq("approved", true)
    .single();
  if (error || !plan?.stripe_price_id)
    throw new Error("Approved plan required");
  const price = await stripe.prices.retrieve(plan.stripe_price_id);
  if (!isPlanPrice(price, live) || (live && (!isLiveSoftwarePrice(price, plan) || !(plan.allowance > 0))))
    throw new Error("Active fixed USD recurring TEST price required");
  const reservation = await db.rpc("bm_begin_checkout", {
    p_owner: user.id,
    p_product: plan.product,
    p_version: plan.version,
    p_key: operationKey,
    p_email: user.email,
  });
  if (reservation.error)
    conflict(
      "Checkout unavailable. An existing subscription or pending checkout may require review.",
    );
  const record = reservation.data;
  if (record.state !== "pending")
    conflict(
      "Checkout completed or expired; refresh before starting a new purchase",
    );
  if (record.session_id) {
    const existing = await stripe.checkout.sessions.retrieve(record.session_id);
    if (
      existing.livemode !== live ||
      existing.metadata?.dbpCheckoutId !== record.id ||
      existing.client_reference_id !== user.id
    )
      throw new Error("Checkout ownership mapping invalid");
    if (["complete", "expired"].includes(existing.status)) {
      const reconciled = await db.rpc("bm_checkout_event", {
        p_id: record.id,
        p_owner: user.id,
        p_session: existing.id,
        p_state: existing.status === "complete" ? "completed" : "expired",
      });
      if (reconciled.error) throw new Error("Checkout reconciliation required");
      conflict(
        "Checkout completed or expired; refresh before starting a new purchase",
      );
    }
    if (existing.status !== "open" || !validCheckoutUrl(existing.url))
      throw new Error("Invalid checkout");
    return { url: existing.url, testMode: !live };
  }
  if (Date.now() - Date.parse(record.created_at) > 23 * 3600000)
    throw new Error("Checkout requires reconciliation before retry");
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      integration_identifier: live ? "dbp_buyermatch_live_isfanzpg" : "dbp_buyermatch_test_isfanzpg",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: record.email,
      subscription_data: {
        metadata: {
          dbpProduct: plan.product,
          dealBlastUserId: user.id,
          dbpCheckoutId: record.id,
        },
      },
      metadata: {
        dbpProduct: plan.product,
        dealBlastUserId: user.id,
        dbpCheckoutId: record.id,
      },
      success_url: `${origin}/app/buyermatch/plans?checkout=returned`,
      cancel_url: `${origin}/app/buyermatch/plans?checkout=canceled`,
    },
    { idempotencyKey: `bm-checkout-${record.id}` },
  );
  if (session.livemode !== live || !validCheckoutUrl(session.url))
    throw new Error("Invalid checkout");
  const saved = await db
    .from("bm_checkouts")
    .update({ session_id: session.id, session_url: session.url })
    .eq("id", record.id);
  if (saved.error)
    throw new Error("Retry checkout with the same operation key");
  return { url: session.url, testMode: !live };
}
