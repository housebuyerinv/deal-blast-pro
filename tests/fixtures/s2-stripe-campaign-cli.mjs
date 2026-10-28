// Synthetic subprocess protocol only; never authenticates or uses a network.
import process from "node:process";
import { readFile, writeFile, appendFile } from "node:fs/promises";
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
  if (args[1].includes("/checkout/sessions/")) value = s.session;
  else if (args[1].includes("/customers/")) value = s.customer;
  else if (args[1] === "/v1/subscriptions")
    value = {
      has_more: false,
      data: [
        { id: s.subscription.id },
        ...(s.scenario === "shared" ? [{ id: "sub_Crm" }] : []),
      ],
    };
  else if (args[1] === "/v1/invoices") value = { has_more: false, data: [] };
  else if (args[1].includes("/subscriptions/")) value = s.subscription;
} else if (args[0] === "delete") {
  if (s.scenario === "unknown") process.exit(1);
  s.subscription.status = "canceled";
  s.subscription.canceled_at = Math.floor(Date.now() / 1000);
  await writeFile(file, JSON.stringify(s));
  value = s.subscription;
}
if (!value) process.exit(1);
console.log(JSON.stringify(value));
