import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "../../vite.config.mjs";

// Local UI verification deliberately loads no .env files, credentials or APIs.
// This is not an authentication bypass: real protected routes remain protected.
export default mergeConfig(base, {
  root: fileURLToPath(new URL("../../", import.meta.url)),
  envDir: false,
  envPrefix: [],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      "http://127.0.0.1:5188",
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      "synthetic-ui-no-provider-key",
    ),
  },
  plugins: [
    {
      name: "buyer-match-no-provider-ui",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (/^\/(api\/|auth\/|rest\/|storage\/)/.test(req.url || "")) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "Provider operations are disabled in this local UI preview.",
              }),
            );
            return;
          }
          next();
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5188, strictPort: true, open: false },
});
