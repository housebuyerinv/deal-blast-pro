import { createHmac, createHash } from "node:crypto";
import process from "node:process";
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
// Reopening a capability in another tab must not manufacture a new response.
// Changed offer terms/amounts remain distinct submissions. No browser storage is needed.
/** @param {{token: string, kind: string, amountCents?: number, terms?: string}} input */
export function responseOperationKey({ token, kind, amountCents, terms }) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "bm-response-v1",
        hashToken(token),
        kind,
        kind === "offer" ? amountCents : null,
        ["offer", "message"].includes(kind) ? (terms || "").trim() : "",
      ]),
    )
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
export function responseToken(exposureId, env = process.env) {
  if ((env.BM_RESPONSE_SECRET || "").length < 32)
    throw new Error("Response secret required");
  return createHmac("sha256", env.BM_RESPONSE_SECRET)
    .update(`bm-response-v1:${exposureId}`)
    .digest("base64url");
}
