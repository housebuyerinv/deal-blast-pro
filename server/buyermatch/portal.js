import process from 'node:process';
import { billingConfig, isSoftwarePrice } from './billing-config.js';
import { checkoutStripe } from './checkout.js';
const deny = () => { throw Object.assign(new Error('BuyerMatch billing requires verified subscription ownership. Contact support if this persists.'), { status: 409 }); };
const id = value => typeof value === 'string' ? value : value?.id;
// Never accept a client customer/subscription ID or reuse CRM billing assignments.
export async function subscriberPortal(db, user, operation = 'payment', version, env = process.env, stripe = checkoutStripe(env)) {
  const { origin, live } = billingConfig(env);
  const configuration = env.BM_STRIPE_PORTAL_CONFIGURATION_ID;
  if (!configuration || !['payment', 'cancel', 'change'].includes(operation)) deny();
  const entitlement = await db.from('bm_entitlements').select('stripe_subscription_id').eq('owner_id', user.id).eq('product', 'buyermatch').maybeSingle();
  if (entitlement.error || !entitlement.data?.stripe_subscription_id) deny();
  const subscription = await stripe.subscriptions.retrieve(entitlement.data.stripe_subscription_id);
  if (subscription.livemode !== live || subscription.metadata?.dbpProduct !== 'buyermatch' || subscription.metadata?.dealBlastUserId !== user.id) deny();
  const checkout = await db.from('bm_checkouts').select('id,owner_id,product,session_id').eq('id', subscription.metadata.dbpCheckoutId).eq('owner_id', user.id).eq('product', 'buyermatch').maybeSingle();
  if (checkout.error || !checkout.data?.session_id) deny();
  const session = await stripe.checkout.sessions.retrieve(checkout.data.session_id);
  const customer = id(subscription.customer);
  if (!customer || session.livemode !== live || session.client_reference_id !== user.id ||
      session.metadata?.dbpCheckoutId !== checkout.data.id || id(session.subscription) !== subscription.id || id(session.customer) !== customer) deny();
  // A portal customer must contain only this owner's BuyerMatch subscriptions.
  // Shared CRM/foreign customers fail closed, including incomplete pagination.
  const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
  if (subscriptions.has_more || !subscriptions.data.length || subscriptions.data.some(s => s.livemode !== live || s.metadata?.dbpProduct !== 'buyermatch' || s.metadata?.dealBlastUserId !== user.id)) deny();
  const config = await stripe.billingPortal.configurations.retrieve(configuration);
  if (!config.active || config.livemode !== live) deny();
  let flow = { type: 'payment_method_update' };
  if (operation === 'cancel') flow = { type: 'subscription_cancel', subscription_cancel: { subscription: subscription.id } };
  if (operation === 'change') {
    const plan = await db.from('bm_plans').select('*').eq('version', version).eq('product', 'buyermatch').eq('approved', true).single();
    if (plan.error || !plan.data?.stripe_price_id || !['buyermatch-starter-v1', 'buyermatch-pro-v1'].includes(version)) deny();
    const price = await stripe.prices.retrieve(plan.data.stripe_price_id);
    if (!isSoftwarePrice(price, plan.data, live) || subscription.items.data.length !== 1) deny();
    flow = { type: 'subscription_update_confirm', subscription_update_confirm: { subscription: subscription.id, items: [{ id: subscription.items.data[0].id, price: price.id, quantity: 1 }] } };
  }
  const returnUrl = `${origin}/app/buyermatch/plans?billing=returned`;
  const portal = await stripe.billingPortal.sessions.create({ customer, configuration, return_url: returnUrl,
    flow_data: { ...flow, after_completion: { type: 'redirect', redirect: { return_url: returnUrl } } } });
  if (portal.livemode !== live || !portal.url?.startsWith('https://billing.stripe.com/')) deny();
  return { url: portal.url };
}
