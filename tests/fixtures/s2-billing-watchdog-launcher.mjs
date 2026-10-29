import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("./s2-billing-watchdog-worker.mjs", import.meta.url)),
    process.argv[2],
    String(process.pid),
    process.argv[3],
  ],
  { detached: true, windowsHide: true, stdio: "ignore" },
);
child.unref(); // Launcher exits; the watchdog must continue independently.
