import { mergeConfig } from "vite";
import { build } from "esbuild";
import { createRequire } from "node:module";
import base from "../../vite.config.mjs";
import { localSyntheticOrigin } from "../../server/buyermatch/local-synthetic.js";
import { localApiMiddleware } from "./buyermatch-local-api.mjs";
if (
  !localSyntheticOrigin(process.env) ||
  !process.env.BM_LOCAL_PUBLIC_KEY ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.PUBLIC_APP_URL !== "http://127.0.0.1:5189"
)
  throw Error(
    "Private local-stack configuration required; no environment files are loaded",
  );
export default mergeConfig(base, {
  envDir: false,
  envPrefix: [],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      "http://127.0.0.1:55321",
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.BM_LOCAL_PUBLIC_KEY,
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 5189,
    strictPort: true,
    open: false,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/test-artifacts/**",
        "**/acceptance/**",
      ],
    },
  },
  plugins: [
    {
      name: "isolated-real-api",
      async configureServer(server) {
        const handlers = {};
        for (const [route, source] of Object.entries({
          "/api/buyermatch": "server/http/buyermatch.ts",
          "/api/buyermatch-buyer": "server/http/buyermatch-buyer.ts",
          "/api/buyermatch-response": "server/http/buyermatch-response.ts",
          "/api/register-account": "api/register-account.ts",
          "/api/account-status": "api/account-status.ts",
        })) {
          const output = await build({
            entryPoints: [source],
            bundle: true,
            write: false,
            platform: "node",
            format: "cjs",
            packages: "external",
          });
          const module = { exports: {} };
          new Function(
            "require",
            "module",
            "exports",
            output.outputFiles[0].text,
          )(createRequire(import.meta.url), module, module.exports);
          handlers[route] = module.exports.default;
        }
        server.middlewares.use(localApiMiddleware(handlers));
      },
    },
  ],
});
