// Only exact public comparisons leave the private provider-env child.
const e=process.env,s='https://qxhhlprentrufobpcgna.supabase.co';
process.stdout.write(JSON.stringify({registrationPaused:e.DBP_REGISTRATION_PAUSED==='true',checkoutPaused:e.BM_CHECKOUT_ENABLED==='false',liveBillingPaused:e.BM_LIVE_BILLING_ENABLED==='false',deliveryDisabled:e.BM_LIVE_DELIVERY_ENABLED==='false',stagingOnly:e.SUPABASE_URL===s&&e.VITE_SUPABASE_URL===s}));
