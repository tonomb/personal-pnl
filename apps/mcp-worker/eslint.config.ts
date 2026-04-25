import { defineConfig, getConfig } from "@repo/eslint-config";

import type { Config } from "@repo/eslint-config";

const config = getConfig(import.meta.url);

export default defineConfig([
  config,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // The MCP SDK uses wildcard `./*` subpath exports which the
      // typescript import resolver doesn't follow. Imports work at
      // runtime; silence the false positive for SDK and Cloudflare
      // agents subpaths.
      "import/no-unresolved": [
        "error",
        {
          ignore: ["^cloudflare:", "^virtual:", "^astro:", "^node:", "^@modelcontextprotocol/sdk/", "^agents/"]
        }
      ]
    }
  }
]) as Config;
