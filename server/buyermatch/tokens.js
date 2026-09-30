import { createHmac, createHash } from "node:crypto";
import process from "node:process";
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export function responseToken(exposureId, env = process.env) {
  if ((env.BM_RESPONSE_SECRET || "").length < 32)
    throw new Error("Response secret required");
  return createHmac("sha256", env.BM_RESPONSE_SECRET)
    .update(`bm-response-v1:${exposureId}`)
    .digest("base64url");
}
