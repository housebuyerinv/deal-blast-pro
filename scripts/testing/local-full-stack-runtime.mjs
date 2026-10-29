// Dedicated local runtime only. Never loads dotenv or copies hosted credentials.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { localSyntheticOrigin } from "../../server/buyermatch/local-synthetic.js";
import { setupLocalAcceptance } from "../setup-local-buyermatch-acceptance.mjs";
const privatePath = "test-artifacts/local-full-stack-private.json";
export function localEnvironment() {
  const status = JSON.parse(
    readFileSync(
      "test-artifacts/local-stack-status-private.json",
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
  if (status.API_URL !== "http://127.0.0.1:55321")
    throw Error("DEDICATED_LOCAL_STACK_REQUIRED");
  const prior = existsSync(privatePath)
    ? JSON.parse(readFileSync(privatePath, "utf8"))
    : null;
  const privateValues = prior || {
    identityKey: randomBytes(32).toString("base64"),
    responseSecret: randomBytes(32).toString("hex"),
    password: randomBytes(24).toString("base64url"),
  };
  if (!prior)
    writeFileSync(privatePath, JSON.stringify(privateValues), { mode: 0o600 });
  const env = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
    "PATHEXT",
  ])
    if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, {
    NODE_ENV: "development",
    BM_LOCAL_SYNTHETIC: "true",
    BM_ENVIRONMENT: "staging",
    BM_STAGING_PROJECT_REF: "buyermatch-local-synthetic",
    SUPABASE_URL: status.API_URL,
    VITE_SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
    BM_LOCAL_PUBLIC_KEY: status.ANON_KEY,
    BM_APP_ORIGIN: "http://127.0.0.1:5189",
    PUBLIC_APP_URL: "http://127.0.0.1:5189",
    BM_LOCAL_SIGNUP_ALLOWED: "true",
    DBP_REGISTRATION_PAUSED: "false",
    BM_CHECKOUT_ENABLED: "false",
    BM_DELIVERY_MODE: "disabled",
    BM_LIVE_DELIVERY_ENABLED: "false",
    BM_LIVE_BILLING_ENABLED: "false",
    BUYERMATCH_IDENTITY_KEY: privateValues.identityKey,
    BM_RESPONSE_SECRET: privateValues.responseSecret,
    BM_LOCAL_DATABASE_PASSWORD: new URL(status.DB_URL).password,
  });
  localSyntheticOrigin(env);
  return { env, privateValues };
}
if (process.argv[2] === "schema") {
  const { env } = localEnvironment();
  console.log(JSON.stringify(await setupLocalAcceptance(env)));
} else if (process.argv[2] === "serve") {
  const { env } = localEnvironment();
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "scripts/testing/buyermatch-local-stack.config.mjs",
      "--configLoader",
      "native",
    ],
    { env, stdio: "inherit" },
  );
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
}
