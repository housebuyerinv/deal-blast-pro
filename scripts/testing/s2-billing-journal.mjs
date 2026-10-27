// Sanitized operational evidence only. Never store credentials, URLs or API bodies.
import { open, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const entry = z
  .object({
    runId: z.string().uuid(),
    source: z.string().regex(/^[a-f0-9]{40}$/),
    mode: z.enum(["LOCAL_SYNTHETIC", "HOSTED"]),
    stage: z.enum([
      "preflight",
      "activation",
      "checkout",
      "boundaries",
      "signature",
      "replay",
      "payment",
      "change",
      "renewal",
      "failure",
      "cancel",
      "operation",
      "closure",
    ]),
    status: z.enum(["STARTED", "PASS", "FAILED_OR_UNKNOWN", "VERIFIED"]),
  })
  .strict();

// Caller must independently approve filesystem ownership/ACLs. This module
// additionally rejects redirection and never overwrites/removes a prior claim.
export async function billingEvidenceStore(directory, plan) {
  if (
    !path.isAbsolute(directory) ||
    !z.string().uuid().safeParse(plan.runId).success ||
    !/^[a-f0-9]{40}$/.test(plan.source || "") ||
    !["LOCAL_SYNTHETIC", "HOSTED"].includes(plan.mode)
  )
    throw Error("Invalid evidence scope");
  const base = path.resolve(directory);
  for (let item = base; ; item = path.dirname(item)) {
    const info = await lstat(item);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw Error("Redirected or invalid evidence directory");
    if (item === path.dirname(item)) break;
  }
  if ((await realpath(base)).toLowerCase() !== base.toLowerCase())
    throw Error("Evidence path mismatch");
  let claimed = false,
    sequence = 0;
  const scope = { runId: plan.runId, source: plan.source, mode: plan.mode };
  const write = async (filename, flags, value) => {
    // wx prevents existing claims being replaced; append handles use no truncation.
    const handle = await open(path.join(base, filename), flags, 0o600);
    try {
      await handle.writeFile(JSON.stringify(value) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  return {
    async claimRun() {
      await write(scope.runId + ".claim.json", "wx", scope);
      claimed = true;
      return { claimed: true };
    },
    async journal(value) {
      const data = entry.parse(value);
      if (
        !claimed ||
        data.runId !== scope.runId ||
        data.source !== scope.source ||
        data.mode !== scope.mode
      )
        throw Error("Unclaimed or mismatched evidence");
      // No resume of a different process. Journals are per-claim; exclusive create
      // on first entry prevents following a previously placed file or link.
      await write(
        scope.runId + "." + String(sequence++).padStart(4, "0") + ".json",
        "wx",
        data,
      );
      return { durable: true };
    },
  };
}
