import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  const server = process.env.CODEX_SANDBOX === "seatbelt"
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined;

  if (process.env.SITES_BUILD !== "1") {
    return {
      base: "./",
      plugins: [react()],
      server,
      build: { outDir: "dist" },
    };
  }

  const [{ default: vinext }, { cloudflare }, { sites }] = await Promise.all([
    import("vinext"),
    import("@cloudflare/vite-plugin"),
    import("./build/sites-vite-plugin"),
  ]);

  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  return {
    server,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: [],
          r2_buckets: [],
        },
      }),
    ],
  };
});
