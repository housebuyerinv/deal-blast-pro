import test from "node:test";
import assert from "node:assert/strict";
import { deliveryAvailability } from "../../server/buyermatch/availability.js";
const approved = {
  distribution_enabled: true,
  provider_verified: true,
  permissions_verified: true,
  agreements_verified: true,
};
const staging = {
  BM_ENVIRONMENT: "staging",
  BM_STAGING_PROJECT_REF: "fixture",
  SUPABASE_URL: "https://fixture.supabase.co",
  BM_APP_ORIGIN: "https://fixture.vercel.app",
  BM_DELIVERY_MODE: "mock",
};
test("delivery UI fails closed when database or environment approval is missing", () => {
  assert.equal(
    deliveryAvailability(null, null, staging).distributionEnabled,
    false,
  );
  for (const key of Object.keys(approved))
    assert.equal(
      deliveryAvailability({ ...approved, [key]: false }, null, staging)
        .distributionEnabled,
      false,
    );
  assert.equal(
    deliveryAvailability(approved, null, {}).distributionEnabled,
    false,
  );
});
test("synthetic delivery availability is staging-only, even with forged Production flags", () => {
  assert.deepEqual(deliveryAvailability(approved, null, staging), {
    distributionEnabled: true,
    testDeliveryEnabled: true,
    deliveryMode: "test",
  });
  assert.deepEqual(
    deliveryAvailability(
      approved,
      { enabled: true },
      { ...staging, VERCEL_ENV: "production" },
    ),
    {
      distributionEnabled: false,
      testDeliveryEnabled: false,
      deliveryMode: "disabled",
    },
  );
});
test("core Production advertises disabled delivery regardless of database approval", () => {
  const env = {
    VERCEL_ENV: "production",
    BM_ENVIRONMENT: "production",
    BM_RESPONSE_ENABLED: "true",
    BM_PRODUCTION_PROJECT_REF: "aigvnbxiydbzzqbetlhl",
    SUPABASE_URL: "https://aigvnbxiydbzzqbetlhl.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    BM_CHECKOUT_ENABLED: "false",
    BM_DELIVERY_MODE: "disabled",
    BM_LIVE_DELIVERY_ENABLED: "false",
  };
  assert.deepEqual(deliveryAvailability(approved, { enabled: true }, env), {
    distributionEnabled: false,
    testDeliveryEnabled: false,
    deliveryMode: "disabled",
  });
});
