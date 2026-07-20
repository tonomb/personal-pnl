import { createTRPCReact } from "@trpc/react-query";
// Type-only import of the worker's real router — no runtime worker code
// reaches the browser bundle, and the API contract can't drift.
import type { AppRouter } from "pnl-api/router";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> = createTRPCReact<AppRouter>();
