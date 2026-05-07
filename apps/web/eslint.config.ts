import { defineConfig } from "@repo/eslint-config";
import { getReactConfig } from "@repo/eslint-config/react";

import type { Config } from "@repo/eslint-config";

const config = getReactConfig(import.meta.url);

export default defineConfig([config]) as Config;
