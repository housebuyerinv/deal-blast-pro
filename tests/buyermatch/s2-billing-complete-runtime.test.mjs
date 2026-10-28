import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
for (const scenario of [
  "success",
  "interrupted",
  "deadline",
  "unknown",
  "shared",
  "preexisting",
  "preservation-drift",
  "foreign-preview",
  "open",
  "limits",
  "journal-failure",
  "readback-failure",
  "prior-open",
])
  test("complete independent billing runtime: " + scenario, async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "bm-complete-runtime-"),
    );
    try {
      const launcher = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              "../fixtures/s2-billing-complete-runtime.mjs",
              import.meta.url,
            ),
          ),
          "launcher",
          root,
          scenario,
        ],
        { windowsHide: true, stdio: "ignore" },
      );
      assert.equal(
        await new Promise((resolve, reject) => {
          launcher.once("error", reject);
          launcher.once("exit", resolve);
        }),
        0,
      );
      let result;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        try {
          result = JSON.parse(
            await readFile(path.join(root, "result.json"), "utf8"),
          );
          break;
        } catch (e) {
          if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
        }
        await delay(100);
      }
      assert.ok(result, "Detached worker must finish with durable evidence");
      if (scenario === "prior-open") {
        assert.equal(result.status, "UNVERIFIED");
        assert.equal(result.stage, "CHECKOUT_POLICY");
        assert.deepEqual(result.calls, []);
        return;
      }
      const expected = [
        "success",
        "interrupted",
        "deadline",
        "open",
        "limits",
      ].includes(scenario);
      assert.equal(
        result.result?.closureVerified,
        expected,
        JSON.stringify(result),
      );
      assert.equal(
        result.deleteCount,
        [
          "success",
          "interrupted",
          "deadline",
          "unknown",
          "limits",
          "journal-failure",
          "readback-failure",
        ].includes(scenario)
          ? 1
          : 0,
      );
      assert.equal(result.crmUnchanged, true);
      assert.equal(result.hasLock, !expected);
      if (expected) {
        assert.equal(result.result.results.length, 8);
        assert.ok(result.result.results.every((r) => r.verified));
      }
      if (scenario === "open") assert.equal(result.checkoutStatus, "expired");
      if (["success", "interrupted", "deadline"].includes(scenario))
        assert.equal(result.subscriptionStatus, "canceled");
    } finally {
      assert.equal(path.dirname(root), await realpath(tmpdir()));
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });
