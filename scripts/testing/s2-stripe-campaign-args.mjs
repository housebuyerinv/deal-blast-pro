// Private CLI grammar. Credentials remain inside the named CLI profile.
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";
const deny = () => {
  throw Error("Campaign Stripe command denied");
};
export function campaignRequestArgs({ method, path, body }) {
  if (method === "GET" && body === undefined) {
    if (
      /^\/v1\/(checkout\/sessions\/cs_test_|customers\/cus_|subscriptions\/sub_)[A-Za-z0-9]+$/.test(
        path,
      )
    )
      return ["get", path];
    const m =
      /^\/v1\/(subscriptions|invoices)\?customer=(cus_[A-Za-z0-9]+)&limit=100(&status=all)?$/.exec(
        path,
      );
    if (m && (m[1] === "subscriptions") === Boolean(m[3]))
      return [
        "get",
        "/v1/" + m[1],
        "-d",
        "customer=" + m[2],
        "-d",
        "limit=100",
        ...(m[3] ? ["-d", "status=all"] : []),
      ];
  }
  if (
    method === "DELETE" &&
    /^\/v1\/subscriptions\/sub_[A-Za-z0-9]+$/.test(path) &&
    body?.invoice_now === false &&
    body.prorate === false &&
    Object.keys(body).length === 2
  )
    return [
      "delete",
      path,
      "-d",
      "invoice_now=false",
      "-d",
      "prorate=false",
      "--confirm",
    ];
  deny();
}
export function campaignStripeArgs(args) {
  const probe =
    JSON.stringify(args) === JSON.stringify(["get", "/v1/prices/" + S2.pro]) ||
    JSON.stringify(args) ===
      JSON.stringify([
        "get",
        "/v1/subscriptions",
        "-d",
        "limit=1",
        "-d",
        "status=all",
      ]);
  if (!probe) {
    let request;
    if (args?.[0] === "delete")
      request = {
        method: "DELETE",
        path: args[1],
        body: { invoice_now: false, prorate: false },
      };
    else if (args?.[0] === "get") {
      let p = args[1];
      if (args.length > 2) {
        const params = [];
        for (let i = 2; i < args.length; i += 2) {
          if (args[i] !== "-d") deny();
          params.push(args[i + 1]);
        }
        p += "?" + params.join("&");
      }
      request = { method: "GET", path: p };
    } else deny();
    if (JSON.stringify(campaignRequestArgs(request)) !== JSON.stringify(args))
      deny();
  }
  return [
    ...args,
    "--stripe-context",
    S2.account,
    "--project-name",
    "buyermatch-s2",
    "--stripe-version",
    "2026-08-26.dahlia",
  ];
}
