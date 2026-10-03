import test from "node:test";
import { execFileSync } from "node:child_process";
import process from "node:process";

test("complete BuyerMatch chain preserves captured Production legacy schema and private grants", () => {
  execFileSync(
    process.execPath,
    ["scripts/rehearse-buyermatch-production.mjs"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 60000,
    },
  );
});
