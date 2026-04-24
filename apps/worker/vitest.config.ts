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
