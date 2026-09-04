import path from "node:path";

import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "../../packages/types/drizzle"));

  return {
    test: {
      setupFiles: ["./src/test-setup.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
          // wrangler.jsonc marks the D1 binding `remote: true` for `wrangler dev`; tests must
          // always run against local D1 emulation, never the real remote database.
          remoteBindings: false,
          miniflare: {
            bindings: {
              ENVIRONMENT: "VITEST",
              TEST_MIGRATIONS: JSON.stringify(migrations)
            }
          }
        }
      }
    }
  };
});
