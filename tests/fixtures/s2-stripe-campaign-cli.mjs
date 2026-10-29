// Synthetic subprocess protocol only; never authenticates or uses a network.
import process from "node:process";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { S2_RELEASE as S2 } from "../../scripts/buyermatch-s2-release.mjs";
const [file, ...args] = process.argv.slice(2),
  s = JSON.parse(await readFile(file, "utf8"));
await appendFile(file + ".calls", JSON.stringify(args) + "\n");
let value;
if (args[0] === "whoami")
  value = { authorized_accounts: [{ id: s.plan.account, modes: ["test"] }] };
else if (args[0] === "webhook_endpoints")
  value = {
    id: s.plan.endpoint,
    livemode: false,
    status: "disabled",
    url: `https://${s.plan.database}.supabase.co/functions/v1/stripe-webhook`,
  };
else if (args[0] === "get") {
  if (s.completeRuntime) {
    if (args[1] === "/v1/checkout/sessions")
      value = { has_more: false, data: s.created ? [s.session] : [] };
    else if (args[1] === "/v1/prices/" + S2.pro)
      value = {
        id: S2.pro,
        livemode: false,
        currency: "usd",
        unit_amount: 11900,
        active: true,
        recurring: { interval: "month" },
      };
    else if (args[1] === "/v1/billing_portal/configurations/" + S2.portal)
      value = {
        id: S2.portal,
        livemode: false,
        login_page: { enabled: false },
      };
    else if (args[1] === "/v1/subscriptions") {
      const customer = args.find((a) => a.startsWith("customer="))?.slice(9);
      const all = [
        s.crm,
        ...(s.created && s.scenario !== "open" && s.scenario !== "preexisting"
          ? [s.subscription]
          : []),
      ];
      value = {
        has_more: false,
        data: customer ? all.filter((x) => x.customer === customer) : all,
      };
    }
  }
  if (!value && args[1].includes("/checkout/sessions/"))
    value = args[1].endsWith("/cs_test_Prior") ? s.priorSession : s.session;
  else if (!value && args[1].includes("/customers/")) value = s.customer;
  else if (!value && args[1] === "/v1/subscriptions")
    value = {
      has_more: false,
      data: [
        { id: s.subscription.id },
        ...(s.scenario === "shared" ? [{ id: "sub_Crm" }] : []),
      ],
    };
  else if (!value && args[1] === "/v1/invoices")
    value = { has_more: false, data: [] };
  else if (!value && args[1].includes("/subscriptions/")) {
    if (
      s.scenario === "readback-failure" &&
      s.subscription?.status === "canceled"
    )
      process.exit(1);
    value = s.subscription;
  }
} else if (args[0] === "post") {
  s.session.status = "expired";
  await writeFile(file, JSON.stringify(s));
  value = s.session;
} else if (args[0] === "delete") {
  if (s.scenario === "unknown") process.exit(1);
  s.subscription.status = "canceled";
  s.subscription.canceled_at = Math.floor(
    (s.completeRuntime ? s.now : Date.now()) / 1000,
  );
  await writeFile(file, JSON.stringify(s));
  value = s.subscription;
}
if (!value) process.exit(1);
console.log(JSON.stringify(value));
