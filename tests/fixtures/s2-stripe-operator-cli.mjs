// Synthetic CLI protocol fixture only. No Stripe SDK, credentials or network.
import process from "node:process";
import { setTimeout } from "node:timers";
const [scenario, ...args] = process.argv.slice(2);
if (scenario === "error") {
  process.stderr.write("DUMMY_PRIVATE_PROVIDER_ERROR");
  process.exit(1);
}
if (scenario === "hang") {
  setTimeout(() => {}, 10000);
} else {
  if (args.at(-1) !== "buyermatch-s2" || args.at(-2) !== "--project-name")
    process.exit(2);
  let value;
  if (args[0] === "whoami")
    value = {
      authorized_accounts: [{ id: "acct_1UTRcRL6efr9LhPI", modes: ["test"] }],
    };
  else {
    if (
      !args.includes("--stripe-context") ||
      args[args.indexOf("--stripe-context") + 1] !== "acct_1UTRcRL6efr9LhPI"
    )
      process.exit(2);
    value = {
      id: "we_1UTTc1L6efr9LhPICbZjgCHA",
      livemode: false,
      status: "disabled",
      url: "https://qxhhlprentrufobpcgna.supabase.co/functions/v1/stripe-webhook",
      secret: "DUMMY_DO_NOT_REPORT",
    };
  }
  process.stdout.write(JSON.stringify(value));
}
