import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/persistedWorkspaceSync.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { shouldApplyWorkspaceSync } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("an unscoped/new tab cannot reset an authenticated workspace's onboarding or plan", () => {
  const current = {
    settings: { onboarding: { planSelectionCompleted: true } },
    trial: { plan: "Free" },
  };
  const reset = {
    settings: { onboarding: { planSelectionCompleted: false } },
    trial: { plan: "Trial" },
  };
  assert.equal(shouldApplyWorkspaceSync(current, reset, false), false);
});
test("identical cross-tab snapshots stop echo writes while same-workspace changes sync", () => {
  const current = {
    settings: { onboarding: { planSelectionCompleted: true } },
    deals: [{ id: "fixture" }],
  };
  assert.equal(
    shouldApplyWorkspaceSync(current, JSON.parse(JSON.stringify(current)), true),
    false,
  );
  assert.equal(
    shouldApplyWorkspaceSync(
      current,
      { ...current, deals: [...current.deals, { id: "new-fixture" }] },
      true,
    ),
    true,
  );
});
