import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { verifyLauncherExited } from "../../scripts/testing/s2-billing-watchdog.mjs";

for (const scenario of [
  "success",
  "hung",
  "journal-failure",
  "deadline",
  "close-request",
  "unknown-stop",
  "denied-approval",
  "wrong-authority",
])
  test(
    "actual detached watchdog survives launcher exit: " + scenario,
    async () => {
      const base = await mkdtemp(path.join(tmpdir(), "bm-watchdog-public-"));
      try {
        const launcher = spawn(
          process.execPath,
          [
            fileURLToPath(
              new URL(
                "../fixtures/s2-billing-watchdog-launcher.mjs",
                import.meta.url,
              ),
            ),
            base,
            scenario,
          ],
          { windowsHide: true, stdio: "ignore" },
        );
        const code = await new Promise((resolve, reject) => {
          launcher.once("error", reject);
          launcher.once("exit", resolve);
        });
        assert.equal(code, 0);
        let result;
        const deadline = Date.now() + 7000;
        while (Date.now() < deadline) {
          try {
            result = JSON.parse(
              await readFile(path.join(base, "result.json"), "utf8"),
            );
            break;
          } catch (error) {
            if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
              throw error;
          }
          await delay(30);
        }
        assert.ok(
          result,
          "Actual child must finish; no simulated independence",
        );
        if (["denied-approval", "wrong-authority"].includes(scenario)) {
          assert.equal(result.stopped, true);
          await assert.rejects(
            readFile(path.join(base, "actual-operations.jsonl")),
            { code: "ENOENT" },
          );
          return;
        }
        assert.equal(result.launcherExited, true);
        assert.equal(
          result.cleanupCallsVerified,
          !["hung", "journal-failure"].includes(scenario),
        );
        assert.equal(result.independentReadbackRequired, true);
        if (scenario === "deadline") assert.equal(result.reason, "DEADLINE");
        if (scenario === "close-request")
          assert.equal(result.reason, "CLOSE_REQUEST");
        if (scenario === "unknown-stop")
          assert.equal(result.reason, "UNKNOWN_STOP_STATE");
        assert.equal(result.results.length, 5);
        const operations = (
          await readFile(path.join(base, "actual-operations.jsonl"), "utf8")
        )
          .trim()
          .split("\n")
          .map((s) => JSON.parse(s).operation);
        for (const method of [
          "disableEndpoint",
          "pauseReceiver",
          "closeNewCheckoutSessions",
          "closePortalSessions",
          "restoreRoutingAndRemoveTemporaryPreview",
        ])
          assert.equal(operations.filter((n) => n === method).length, 1);
        if (scenario === "hung")
          assert.ok(operations.includes("abort-observed"));
      } finally {
        // Only this test's newly created, resolved temporary directory is removable.
        assert.equal(path.dirname(path.resolve(base)), path.resolve(tmpdir()));
        assert.ok(path.basename(base).startsWith("bm-watchdog-public-"));
        await rm(base, { recursive: true, force: true });
      }
    },
  );
test("EPERM and generic probe errors are UNKNOWN, never proof of launcher exit", async () => {
  for (const code of ["EPERM", "EACCES", undefined])
    await assert.rejects(
      verifyLauncherExited(123, {
        probe: () => {
          throw Object.assign(Error(), { code });
        },
        waitMs: 1,
      }),
      /UNKNOWN/,
    );
});
test("active or self launcher cannot authorize independent cleanup", async () => {
  await assert.rejects(verifyLauncherExited(process.pid), /invalid/);
  await assert.rejects(
    verifyLauncherExited(123, { probe: () => {}, waitMs: 1 }),
    /active/,
  );
});
