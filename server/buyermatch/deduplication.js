import { decryptIdentity } from "./security.js";
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const company = (value) =>
  normalize(
    String(value || "").replace(
      /\b(llc|incorporated|inc|corp|ltd|limited)\b/gi,
      "",
    ),
  );
const phone = (value) => {
  const n = String(value || "").replace(/\D/g, "");
  return n.length === 11 && n[0] === "1" ? n.slice(1) : n;
};
export function duplicateReasons(a, b) {
  const reasons = [];
  if (
    a.email &&
    b.email &&
    a.email.trim().toLowerCase() === b.email.trim().toLowerCase()
  )
    reasons.push("same_email");
  if (phone(a.phone).length >= 10 && phone(a.phone) === phone(b.phone))
    reasons.push("same_phone");
  if (
    company(a.company).length >= 3 &&
    company(a.company) === company(b.company)
  )
    reasons.push(
      normalize(a.name) && normalize(a.name) === normalize(b.name)
        ? "same_company_principal"
        : "same_company_review",
    );
  return reasons;
}
export async function findDuplicates(db, identity, excludeId = null) {
  const candidates = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("bm_buyers")
      .select("id,identity_ciphertext,merged_into")
      .is("merged_into", null)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Duplicate review unavailable");
    for (const row of data) {
      if (row.id === excludeId) continue;
      const target = decryptIdentity(row.identity_ciphertext);
      const reasons = duplicateReasons(identity, target);
      if (reasons.length)
        candidates.push({
          id: row.id,
          name: target.name,
          email: target.email,
          reasons,
        });
    }
    if (data.length < 500) break;
  }
  return candidates;
}
