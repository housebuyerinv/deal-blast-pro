// Named CLI profile owns authentication; no key/config-file extraction or output.
import { spawn } from "node:child_process";
import { readFile, lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import path from "node:path";
import process from "node:process";
import { validateBillingPlan } from "./s2-billing-runner.mjs";
import { closeCampaignSubscription } from "./s2-billing-subscription-cleanup.mjs";
import {
  campaignRequestArgs,
  campaignStripeArgs,
} from "./s2-stripe-campaign-args.mjs";
import {
  scopedStripeArgs,
  stripeProfileAccount,
} from "./s2-canary-provider.mjs";
import { S2_RELEASE as S2 } from "../buyermatch-s2-release.mjs";

export function combineBillingStripeTransports(operator, runtime) {
  if (
    typeof operator?.stripeRequest !== "function" ||
    typeof runtime?.stripeRequest !== "function"
  )
    throw Error("Stripe transports incomplete");
  return (request) =>
    request?.path === "/v1/webhook_endpoints/" + S2.endpoint
      ? operator.stripeRequest(request)
      : runtime.stripeRequest(request);
}
const deny = () => {
  throw Error("S2_STRIPE_OPERATOR_UNVERIFIED; no automatic retry");
};
export function makeStripeOperator(
  input,
  {
    approvedSource,
    tool,
    cwd,
    verifyToolCustody,
    verifyApproval,
    journal,
    spawnProcess = spawn,
    environment = process.env,
    timeoutMs = 10000,
    operatorSource,
    subscriptionEvidenceStore,
    readCheckoutPolicy,
    verifyPreservation,
  } = {},
) {
  const plan = validateBillingPlan(input, approvedSource, input.startedAt);
  if (
    !path.isAbsolute(tool?.path || "") ||
    !/^[a-f0-9]{64}$/.test(tool?.sha256 || "") ||
    !path.isAbsolute(cwd || "") ||
    [verifyToolCustody, verifyApproval, journal, spawnProcess].some(
      (f) => typeof f !== "function",
    ) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    (plan.mode === "HOSTED" &&
      path.basename(tool.path).toLowerCase() !== "stripe.exe")
  )
    deny();
  const executable = tool.path,
    hash = tool.sha256,
    root = path.resolve(cwd),
    digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const names = [
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "COMSPEC",
    "PATHEXT",
    "PATH",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "HOMEDRIVE",
    "HOMEPATH",
    "USERNAME",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
  ];
  const env = Object.fromEntries(
    names
      .filter((k) => typeof environment[k] === "string")
      .map((k) => [k, environment[k]]),
  );
  async function run(args, external, campaign = false) {
    const signal = globalThis.AbortSignal.any([
      globalThis.AbortSignal.timeout(timeoutMs),
      ...(external ? [external] : []),
    ]);
    let abort;
    try {
      return await Promise.race([
        execute(args, signal, campaign),
        new Promise((_, reject) => {
          abort = () =>
            reject(Error("S2_STRIPE_OPERATOR_UNVERIFIED; no automatic retry"));
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
  async function execute(args, signal, campaign) {
    let timer, child;
    try {
      if (signal?.aborted) deny();
      const consent = await verifyApproval(plan, digest, signal);
      if (
        consent?.approved !== true ||
        consent.planDigest !== digest ||
        consent.mode !== plan.mode ||
        ![
          "payment-free-preflight",
          "subscription-activation",
          "subscription-lifecycle",
        ].includes(consent.scope)
      )
        deny();
      if (campaign && (args[0] === "delete" || args[0] === "post")) {
        if (
          consent.scope !== "subscription-activation" ||
          consent.cleanupOperatorSource !== operatorSource ||
          consent.cancelCampaignCreatedTestSubscription !== true ||
          typeof verifyPreservation !== "function"
        )
          deny();
        const p = await verifyPreservation(plan, signal);
        if (
          p?.verified !== true ||
          p.planDigest !== digest ||
          p.unchanged !== true
        )
          deny();
      }
      const [file, folder] = await Promise.all([
        lstat(executable),
        lstat(root),
      ]);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        !folder.isDirectory() ||
        folder.isSymbolicLink() ||
        (await realpath(executable)).toLowerCase() !==
          path.resolve(executable).toLowerCase() ||
        (await realpath(root)).toLowerCase() !== root.toLowerCase() ||
        createHash("sha256")
          .update(await readFile(executable))
          .digest("hex") !== hash
      )
        deny();
      const custody = await verifyToolCustody(executable, root, signal);
      if (
        custody?.ownerVerified !== true ||
        custody.restrictiveAclVerified !== true ||
        custody.sha256 !== hash
      )
        deny();
      if (
        (
          await journal({
            runId: plan.runId,
            source: plan.source,
            mode: plan.mode,
            stage: "closure",
            status: "STARTED",
          })
        )?.durable !== true ||
        signal?.aborted
      )
        deny();
      const argv = campaign ? campaignStripeArgs(args) : scopedStripeArgs(args);
      const raw = await new Promise((resolve, reject) => {
        let stdout = "",
          bytes = 0,
          stopped = false;
        child = spawnProcess(executable, argv, {
          cwd: root,
          env,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const abort = () => {
          stopped = true;
          child.kill();
        };
        timer = setTimeout(abort, timeoutMs);
        signal?.addEventListener("abort", abort, { once: true });
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        child.stdout.on("data", (b) => {
          bytes += b.length;
          if (bytes > 65536) abort();
          else stdout += b;
        });
        child.stderr.on("data", (b) => {
          bytes += b.length;
          if (bytes > 65536) abort();
        }); // Never retain provider stderr.
        child.once("error", () => {
          cleanup();
          reject(Error());
        });
        child.once("close", (code) => {
          cleanup();
          if (stopped || code !== 0) reject(Error());
          else resolve(stdout);
        });
      });
      const body = JSON.parse(raw);
      if (body?.error) deny();
      if (signal?.aborted) deny();
      if (
        (
          await journal({
            runId: plan.runId,
            source: plan.source,
            mode: plan.mode,
            stage: "closure",
            status: "PASS",
          })
        )?.durable !== true
      )
        deny();
      return body;
    } catch {
      deny();
    } finally {
      clearTimeout(timer);
    }
  }
  const endpoint = (e) => {
    if (
      e?.id !== plan.endpoint ||
      e.livemode !== false ||
      e.url !==
        `https://${plan.database}.supabase.co/functions/v1/stripe-webhook` ||
      !["enabled", "disabled"].includes(e.status)
    )
      deny();
    return { id: e.id, livemode: false, url: e.url, status: e.status };
  };
  return {
    async readPriorCheckoutStates(rows, signal) {
      if (!Array.isArray(rows) || rows.length > 100) deny();
      const statuses = [];
      for (const r of rows) {
        if (
          !/^cs_test_[A-Za-z0-9]+$/.test(r.id || "") ||
          !/^[a-f0-9-]{36}$/.test(r.checkoutId || "")
        )
          deny();
        if (
          stripeProfileAccount(
            await run(["whoami", "--format", "json"], signal),
          ) !== plan.account
        )
          deny();
        const s = await run(
          ["get", "/v1/checkout/sessions/" + r.id],
          signal,
          true,
        );
        if (
          s.id !== r.id ||
          s.livemode !== false ||
          s.mode !== "subscription" ||
          s.client_reference_id !== plan.owner ||
          s.metadata?.dealBlastUserId !== plan.owner ||
          s.metadata?.dbpProduct !== "buyermatch" ||
          s.metadata?.dbpCheckoutId !== r.checkoutId
        )
          deny();
        statuses.push(s.status);
      }
      return statuses;
    },
    async listCampaignCheckouts(signal) {
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const r = await run(
        [
          "get",
          "/v1/checkout/sessions",
          "-d",
          "created[gte]=" + Math.floor(plan.startedAt / 1000),
          "-d",
          "limit=100",
        ],
        signal,
        true,
      );
      if (
        r.has_more !== false ||
        !Array.isArray(r.data) ||
        r.data.some((s) => s.livemode !== false)
      )
        deny();
      return r.data.filter((s) => s.metadata?.dbpS2RunId === plan.runId);
    },
    async readSubscriptionInventory(signal) {
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const ids = [];
      let cursor;
      for (let i = 0; i < 10; i++) {
        const r = await run(
          [
            "get",
            "/v1/subscriptions",
            "-d",
            "limit=100",
            "-d",
            "status=all",
            ...(cursor ? ["-d", "starting_after=" + cursor] : []),
          ],
          signal,
          true,
        );
        if (
          !Array.isArray(r.data) ||
          typeof r.has_more !== "boolean" ||
          r.data.some(
            (s) => s.livemode !== false || !/^sub_[A-Za-z0-9]+$/.test(s.id),
          )
        )
          deny();
        ids.push(...r.data.map((s) => s.id));
        if (new Set(ids).size !== ids.length) deny();
        if (!r.has_more) return ids;
        if (!r.data.length) deny();
        cursor = r.data.at(-1).id;
      }
      deny();
    },
    async readSubscriptionSentinels(signal) {
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const result = [];
      let cursor;
      for (let i = 0; i < 10; i++) {
        const r = await run(
          [
            "get",
            "/v1/subscriptions",
            "-d",
            "limit=100",
            "-d",
            "status=all",
            ...(cursor ? ["-d", "starting_after=" + cursor] : []),
          ],
          signal,
          true,
        );
        if (
          !Array.isArray(r.data) ||
          typeof r.has_more !== "boolean" ||
          r.data.some(
            (s) => s.livemode !== false || !/^sub_[A-Za-z0-9]+$/.test(s.id),
          )
        )
          deny();
        result.push(
          ...r.data
            .filter((s) => s.metadata?.dbpS2RunId !== plan.runId)
            .map((s) => ({
              id: s.id,
              customer: s.customer,
              status: s.status,
              cancel_at_period_end: s.cancel_at_period_end,
              latest_invoice: s.latest_invoice,
              items: s.items,
            })),
        );
        if (!r.has_more) {
          if (new Set(result.map((x) => x.id)).size !== result.length) deny();
          return result.sort((a, b) => a.id.localeCompare(b.id));
        }
        if (!r.data.length) deny();
        cursor = r.data.at(-1).id;
      }
      deny();
    },
    async readPortalConfiguration(signal) {
      const p = await run(
        ["get", "/v1/billing_portal/configurations/" + S2.portal],
        signal,
        true,
      );
      if (
        p.id !== S2.portal ||
        p.livemode !== false ||
        typeof p.login_page?.enabled !== "boolean"
      )
        deny();
      return { loginDisabled: p.login_page.enabled === false };
    },
    async closeCampaignCheckouts(receipt, signal) {
      if (
        receipt?.source !== plan.source ||
        receipt.runId !== plan.runId ||
        !Array.isArray(receipt.checkouts) ||
        receipt.checkouts.length > 1 ||
        typeof readCheckoutPolicy !== "function"
      )
        deny();
      const p = await readCheckoutPolicy(signal);
      if (
        p?.source !== plan.source ||
        p.runId !== plan.runId ||
        p.issuanceJournalComplete !== true ||
        p.inflightReconciled !== true ||
        JSON.stringify([...p.sessionIds].sort()) !==
          JSON.stringify(receipt.checkouts.map((x) => x.id).sort())
      )
        deny();
      const validate = (s, r) => {
        if (
          s?.id !== r.id ||
          s.livemode !== false ||
          s.mode !== "subscription" ||
          s.client_reference_id !== plan.owner ||
          s.metadata?.dealBlastUserId !== plan.owner ||
          s.metadata?.dbpS2RunId !== plan.runId ||
          s.metadata?.dbpCheckoutId !== r.checkoutId ||
          s.metadata?.dbpProduct !== "buyermatch" ||
          s.created * 1000 < Math.floor(plan.startedAt / 1000) * 1000 ||
          s.created * 1000 > plan.expiresAt ||
          !["open", "expired", "complete"].includes(s.status)
        )
          deny();
      };
      for (const r of receipt.checkouts) {
        if (!/^cs_test_[A-Za-z0-9]+$/.test(r.id)) deny();
        if (
          stripeProfileAccount(
            await run(["whoami", "--format", "json"], signal),
          ) !== plan.account
        )
          deny();
        const p = "/v1/checkout/sessions/" + r.id,
          s = await run(["get", p], signal, true);
        validate(s, r);
        if (s.status === "open") {
          if (s.payment_status !== "unpaid") deny();
          validate(
            await run(["post", p + "/expire", "--confirm"], signal, true),
            r,
          );
        }
        const after = await run(["get", p], signal, true);
        validate(after, r);
        if (after.status === "open") deny();
      }
      return { verified: true };
    },
    async readConnection(signal) {
      // Read-only actual credential proof; does not assert subscription_write.
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const e = endpoint(
        await run(["webhook_endpoints", "retrieve", plan.endpoint], signal),
      );
      const p = await run(["get", "/v1/prices/" + S2.pro], signal, true);
      const s = await run(
        ["get", "/v1/subscriptions", "-d", "limit=1", "-d", "status=all"],
        signal,
        true,
      );
      if (
        p.id !== S2.pro ||
        p.livemode !== false ||
        p.currency !== "usd" ||
        p.unit_amount !== 11900 ||
        !p.active ||
        p.recurring?.interval !== "month" ||
        !Array.isArray(s.data) ||
        typeof s.has_more !== "boolean"
      )
        deny();
      return {
        account: plan.account,
        livemode: false,
        endpointDisabled: e.status === "disabled",
        priceVerified: true,
        subscriptionReadVerified: true,
        cancellationWriteVerified: false,
      };
    },
    async closeCampaignSubscription(
      requested,
      receipt,
      approvedOperator,
      signal,
    ) {
      if (
        JSON.stringify(requested) !== JSON.stringify(plan) ||
        approvedOperator !== operatorSource ||
        !subscriptionEvidenceStore ||
        typeof readCheckoutPolicy !== "function" ||
        typeof verifyPreservation !== "function"
      )
        deny();
      const approval = async (d, s) => {
        const a = await verifyApproval(plan, d, s);
        if (
          a?.cleanupOperatorSource !== operatorSource ||
          a.cancelCampaignCreatedTestSubscription !== true ||
          a.scope !== "subscription-activation"
        )
          deny();
        return a;
      };
      const preservation = async (s) => {
        const p = await verifyPreservation(plan, s);
        if (
          p?.verified !== true ||
          p.planDigest !== digest ||
          p.unchanged !== true
        )
          deny();
      };
      return closeCampaignSubscription(
        plan,
        receipt,
        {
          readSubscriptionEvidence:
            subscriptionEvidenceStore.readSubscriptionEvidence,
          recordSubscriptionCreation:
            subscriptionEvidenceStore.recordSubscriptionCreation,
          claimSubscriptionCancellation:
            subscriptionEvidenceStore.claimSubscriptionCancellation,
          readCheckoutPolicy,
          readApproval: approval,
          readAuthority: async (s) => {
            await approval(digest, s);
            await preservation(s);
            if (
              stripeProfileAccount(
                await run(["whoami", "--format", "json"], s),
              ) !== plan.account
            )
              deny();
            endpoint(
              await run(["webhook_endpoints", "retrieve", plan.endpoint], s),
            );
            return {
              project: plan.project,
              team: plan.team,
              database: plan.database,
              account: plan.account,
              endpoint: plan.endpoint,
              livemode: false,
              ownerAuthorized: true,
            };
          },
          stripeRequest: async (r) => {
            if (
              r.account !== plan.account ||
              r.mode !== "test" ||
              r.retries !== 0
            )
              deny();
            if (r.method === "DELETE") {
              await approval(digest, r.signal);
              await preservation(r.signal);
            }
            return run(campaignRequestArgs(r), r.signal, true);
          },
        },
        operatorSource,
        signal,
      );
    },
    async readIdentity(signal) {
      const who = await run(["whoami", "--format", "json"], signal);
      return { account: stripeProfileAccount(who), mode: "test" };
    },
    async stripeRequest({
      method,
      path: requestPath,
      body,
      account,
      mode,
      retries,
      signal,
    }) {
      if (
        account !== plan.account ||
        mode !== "test" ||
        retries !== 0 ||
        requestPath !== "/v1/webhook_endpoints/" + plan.endpoint
      )
        deny();
      if (
        method !== "GET" &&
        !(
          method === "POST" &&
          body?.disabled === true &&
          Object.keys(body).length === 1
        )
      )
        deny();
      if (
        stripeProfileAccount(
          await run(["whoami", "--format", "json"], signal),
        ) !== plan.account
      )
        deny();
      const current = endpoint(
        await run(["webhook_endpoints", "retrieve", plan.endpoint], signal),
      );
      if (method === "GET") return current;
      const updated = endpoint(
        await run(
          [
            "webhook_endpoints",
            "update",
            plan.endpoint,
            "--disabled=true",
            "--confirm",
          ],
          signal,
        ),
      );
      if (updated.status !== "disabled") deny();
      return updated; // Containment adapter does independent final readback.
    },
  };
}
