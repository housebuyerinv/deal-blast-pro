import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
    sql: readFileSync(path, "utf8"),
    hash: createHash("sha256").update(readFileSync(path)).digest("hex"),
  }));
}
export const stripTransaction = (sql) =>
  sql
    .replace(/^\s*(?:(?:--[^\n]*\n)\s*)*begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "");
