import { assertAdmin } from './security.js';

export function confirmedNetworkOwner(user, emailAllowed) {
  return !!user && user.is_anonymous !== true &&
    Number.isFinite(Date.parse(user.email_confirmed_at || '')) && emailAllowed(user.email || '');
}
export function activityPage(value = 0) {
  if (!/^(0|[1-9]\d{0,5})$/.test(String(value)))
    throw Object.assign(new Error('Invalid page'), { status: 400 });
  const page = Number(value);
  if (page > 100000) throw Object.assign(new Error('Invalid page'), { status: 400 });
  return page;
}
const fields = {
  entitlements: ['owner_id','product','plan_version','status','period_start','period_end','allowance'],
  reconciliations: ['event_id','event_created','owner_id','product','created_at'],
  deliveryErrors: ['id','state','attempts','last_error_code','created_at'],
  audit: ['id','deal_id','kind','created_at'],
};
const errorCode = value => typeof value === 'string' && (
  ['test_delivery_retry','production_delivery_retry','idempotency_window_expired'].includes(value) ||
  /^test_provider_http_[1-5][0-9]{2}_(validation_error|restricted_api_key|invalid_api_key|missing_api_key|rate_limit_exceeded|daily_quota_exceeded|application_error|unclassified)$/.test(value)
) ? value : 'unclassified_failure';

// No actions, private documents, customer contacts, Stripe payloads or credentials.
export async function networkOperations(db, account, value = 0) {
  assertAdmin(account);
  const page = activityPage(value), start = page * 25;
  const specs = [
    ['entitlements','bm_entitlements','owner_id'],
    ['reconciliations','bm_billing_events','event_id'],
    ['deliveryErrors','bm_outbox','id'],
    ['audit','bm_events','id'],
  ];
  const result = { page, hasMore: false };
  for (const [name, table, tie] of specs) {
    let query = db.from(table).select(fields[name].join(','));
    if (name === 'entitlements' || name === 'reconciliations') query = query.eq('product','buyermatch');
    if (name === 'deliveryErrors') query = query.not('last_error_code','is',null);
    query = query.order(name === 'entitlements' ? 'period_end' : 'created_at', { ascending: false }).order(tie, { ascending: false }).range(start,start+25);
    const response = await query;
    if (response.error || !Array.isArray(response.data)) throw new Error('Operating records unavailable');
    result.hasMore ||= response.data.length > 25;
    result[name] = response.data.slice(0,25).map(row => {
      const item = Object.fromEntries(fields[name].map(key => [key,row[key]]));
      if (name === 'deliveryErrors') item.last_error_code = errorCode(item.last_error_code);
      return item;
    });
  }
  return result;
}
