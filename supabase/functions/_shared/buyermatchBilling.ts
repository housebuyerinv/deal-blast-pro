// Runs only after the existing webhook has verified Stripe's raw-body signature.
// Separate products never enter the CRM plan/credit mutation path.
import plans from './buyermatchPlans.json' with { type: 'json' };
export async function handleBuyerMatchBilling(
  event: any,
  stripeGet: (path: string) => Promise<any>,
  url: string,
  serviceKey: string,
  environment: { name?: string; projectRef?: string; stripeKey?: string; liveEnabled?: string; verified?: string } = {},
) {
  const object = event?.data?.object || {};
  const type = String(event.type || "");
  let subscription: any = null;
  const subscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : object.subscription?.id ||
        object.parent?.subscription_details?.subscription;
  if (type.startsWith("customer.subscription.")) subscription = object;
  else if (subscriptionId)
    subscription = await stripeGet(`/v1/subscriptions/${subscriptionId}`);
  else if (type.startsWith("charge.refund") && object.invoice) {
    const invoice = await stripeGet(
      `/v1/invoices/${typeof object.invoice === "string" ? object.invoice : object.invoice.id}`,
    );
    const id =
      invoice?.subscription ||
      invoice?.parent?.subscription_details?.subscription;
    if (id)
      subscription = await stripeGet(
        `/v1/subscriptions/${typeof id === "string" ? id : id.id}`,
      );
  }
  const product =
    subscription?.metadata?.dbpProduct || object.metadata?.dbpProduct;
  if (!["buyermatch", "network"].includes(product)) return null;
  const live = event.livemode === true;
  const liveAllowed = live && product === 'buyermatch' && environment.name === 'production' &&
    environment.projectRef === 'aigvnbxiydbzzqbetlhl' && url === 'https://aigvnbxiydbzzqbetlhl.supabase.co' &&
    environment.liveEnabled === 'true' && environment.verified === 'true' && /^(sk|rk)_live_/.test(environment.stripeKey || '');
  if (!liveAllowed && (
    event.livemode !== false ||
    environment.name !== "staging" ||
    !environment.projectRef ||
    environment.projectRef === "aigvnbxiydbzzqbetlhl" ||
    url !== "https://" + environment.projectRef + ".supabase.co" ||
    !/^(sk|rk)_test_/.test(environment.stripeKey || "")
  ))
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "BuyerMatch billing environment disabled" },
    };
  const headers = {
    apikey: serviceKey,
    Authorization: "Bearer " + serviceKey,
    "Content-Type": "application/json",
  };
  if (
    ["checkout.session.completed", "checkout.session.expired"].includes(type)
  ) {
    const response = await fetch(url + "/rest/v1/rpc/bm_checkout_event", {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_id: object.metadata?.dbpCheckoutId,
        p_owner: object.metadata?.dealBlastUserId,
        p_session: object.id,
        p_state: type.endsWith("expired") ? "expired" : "completed",
      }),
    });
    if (!response.ok)
      return { status: 503, body: { error: "Checkout reconciliation failed" } };
    if (type.endsWith("expired"))
      return { status: 200, body: { ok: true, product } };
  }
  if (
    type.startsWith("checkout.session.") &&
    !["paid", "no_payment_required"].includes(object.payment_status)
  )
    return { status: 200, body: { ok: true, product, awaitingPayment: true } };
  const supported = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "invoice.payment_action_required",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "charge.refunded",
  ];
  if (!supported.includes(type))
    return { status: 200, body: { ok: true, ignored: true, product } };
  if (!subscription?.id)
    return {
      status: 503,
      body: { ok: false, error: "Product subscription unavailable" },
    };
  // Fetch current authoritative state to avoid resurrecting canceled subscriptions with delayed events.
  const current = await stripeGet(`/v1/subscriptions/${subscription.id}`);
  if (!current)
    return {
      status: 503,
      body: { ok: false, error: "Subscription lookup failed" },
    };
  const item = current.items?.data?.[0];
  const start = item?.current_period_start || current.current_period_start;
  const end = item?.current_period_end || current.current_period_end;
  const owner = current.metadata?.dealBlastUserId;
  const price = item?.price?.id;
  if (
    current.livemode !== live ||
    current.metadata?.dbpProduct !== product ||
    !current.metadata?.dbpCheckoutId ||
    !owner ||
    !price ||
    !start ||
    !end
  )
    return {
      status: 503,
      body: { ok: false, error: "Product billing mapping incomplete" },
    };
  if (live) {
    const canonicalPrice = await stripeGet(`/v1/prices/${price}`);
    if (current.items.data.length !== 1 || item.quantity !== 1 ||
      canonicalPrice?.livemode !== true || canonicalPrice?.active !== true ||
      canonicalPrice.currency !== 'usd' || !plans.some(plan => plan.amountCents === canonicalPrice.unit_amount) ||
      canonicalPrice.recurring?.interval !== 'month' || canonicalPrice.recurring?.interval_count !== 1 ||
      canonicalPrice.recurring?.usage_type !== 'licensed')
      return { status: 503, body: { error: 'Live software price verification failed' } };
  }
  const active =
    (live ? current.status === 'active' : ["active", "trialing"].includes(current.status)) &&
    ![
      "invoice.payment_failed",
      "invoice.payment_action_required",
      "charge.refunded",
      "customer.subscription.deleted",
    ].includes(type);
  const response = await fetch(`${url}/rest/v1/rpc/${live ? 'bm_apply_live_billing' : 'bm_apply_test_billing'}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_checkout: current.metadata.dbpCheckoutId,
      p_event: event.id,
      p_created: event.created,
      p_owner: owner,
      p_product: product,
      p_price: price,
      p_subscription: current.id,
      p_status: active ? "active" : "inactive",
      p_start: new Date(start * 1000).toISOString(),
      p_end: new Date(end * 1000).toISOString(),
    }),
  });
  if (!response.ok)
    return {
      status: 503,
      body: { ok: false, error: "Product entitlement update failed" },
    };
  return { status: 200, body: { ok: true, product, updated: true } };
}
