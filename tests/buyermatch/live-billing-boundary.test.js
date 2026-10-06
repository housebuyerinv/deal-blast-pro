import test from 'node:test';
import assert from 'node:assert/strict';
import { billingConfig, isLiveSoftwarePrice } from '../../server/buyermatch/billing-config.js';
const env = {
  BM_ENVIRONMENT: 'production', VERCEL_ENV: 'production', BM_LIVE_BILLING_ENABLED: 'true',
  BM_BILLING_VERIFIED: 'true', BM_CHECKOUT_ENABLED: 'true', BM_PRODUCTION_PROJECT_REF: 'aigvnbxiydbzzqbetlhl',
  SUPABASE_URL: 'https://aigvnbxiydbzzqbetlhl.supabase.co', BM_STRIPE_LIVE_SECRET_KEY: 'rk_live_fixture',
  BM_APP_ORIGIN: 'https://deal-blast-pro.vercel.app', PUBLIC_APP_URL: 'https://deal-blast-pro.vercel.app',
};
test('live checkout requires explicit verified production configuration and never accepts test keys', () => {
  assert.equal(billingConfig(env).live, true);
  for (const [key, value] of Object.entries({ BM_LIVE_BILLING_ENABLED: 'false', BM_BILLING_VERIFIED: 'false', BM_CHECKOUT_ENABLED: 'false',
    VERCEL_ENV: 'preview', SUPABASE_URL: 'https://staging.supabase.co', BM_STRIPE_LIVE_SECRET_KEY: 'sk_test_fixture',
    VITE_SUPABASE_URL: 'https://staging.supabase.co', PUBLIC_APP_URL: 'https://other.example',
  })) assert.throws(() => billingConfig({ ...env, [key]: value }), key);
});
test('live catalog permits only approved software tier price semantics, never network success fees', () => {
  const plan={product:'buyermatch',version:'buyermatch-starter-v1'};
  const price={livemode:true,active:true,type:'recurring',currency:'usd',unit_amount:5900,recurring:{usage_type:'licensed',interval:'month',interval_count:1}};
  assert.equal(isLiveSoftwarePrice(price,plan),true);
  for(const patch of [{livemode:false},{unit_amount:11900},{currency:'eur'},{active:false},{recurring:{usage_type:'metered'}}])
    assert.equal(isLiveSoftwarePrice({...price,...patch},plan),false);
  assert.equal(isLiveSoftwarePrice(price,{...plan,product:'network'}),false);
  assert.equal(isLiveSoftwarePrice(price,{...plan,version:'unapproved'}),false);
});


test('conversation payload filtering withholds email and phone details', async () => {
 const {safeConversationText}=await import('../../server/buyermatch/conversation.js');
 assert.equal(safeConversationText('Contact jane@example.invalid or (202) 555-0101'), 'Contact [contact withheld] or [contact withheld]');
 assert.equal(safeConversationText('Can we close Friday?'), 'Can we close Friday?');
});
