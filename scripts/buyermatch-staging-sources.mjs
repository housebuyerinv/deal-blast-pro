import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export const canonicalSql = (sql) => sql.replace(/\r\n/g, "\n");
export const sourceHash = (sql) =>
  createHash("sha256").update(canonicalSql(sql)).digest("hex");
export function stagingSources() {
  return [
    "supabase/staging/000_baseline_prerequisites.sql",
    ...readdirSync("supabase/migrations")
      .filter((x) => x.endsWith(".sql"))
      .sort()
      .map((x) => "supabase/migrations/" + x),
    "supabase/staging/999_staging_access.sql",
  ].map((path) => ({
    path,
    sql: canonicalSql(readFileSync(path, "utf8")),
    hash: sourceHash(readFileSync(path, "utf8")),
  }));
}
export const stripTransaction = (sql) =>
  sql
    .replace(/^\s*(?:(?:--[^\n]*\n)\s*)*begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "");
