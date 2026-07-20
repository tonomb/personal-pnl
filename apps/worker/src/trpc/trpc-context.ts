import type { PnlDb } from "@pnl/db";

// Deliberately free of Cloudflare ambient types: the web app type-imports
// AppRouter from router.ts, and everything router.ts reaches must typecheck
// in a DOM tsconfig.
export type TRPCContext = {
  db: PnlDb;
};
