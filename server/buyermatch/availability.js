import process from "node:process";
import { productionDeliveryConfig } from "./production-delivery.js";
import { stagingOrigin } from "./staging.js";

// Informational UI capabilities only. Mutation routes retain their own guards.
export function deliveryAvailability(
  configuration,
  productionConfiguration,
  env = process.env,
) {
  let testDeliveryEnabled = false;
  let productionDeliveryEnabled = false;
  try {
    if (env.VERCEL_ENV === "production") {
      productionDeliveryConfig(env);
      productionDeliveryEnabled = productionConfiguration?.enabled === true;
    } else {
      stagingOrigin(env);
      testDeliveryEnabled =
        env.BM_DELIVERY_MODE === "mock" ||
        (env.BM_DELIVERY_MODE === "resend-test" && Boolean(env.RESEND_API_KEY));
    }
  } catch {
    /* Missing configuration advertises no available delivery. */
  }
  const approved = [
    "distribution_enabled",
    "provider_verified",
    "permissions_verified",
    "agreements_verified",
  ].every((key) => configuration?.[key] === true);
  return {
    distributionEnabled:
      approved && (testDeliveryEnabled || productionDeliveryEnabled),
    testDeliveryEnabled: approved && testDeliveryEnabled,
    deliveryMode:
      approved && productionDeliveryEnabled
        ? "live"
        : approved && testDeliveryEnabled
          ? "test"
          : "disabled",
  };
}
