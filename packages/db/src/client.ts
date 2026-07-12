import type { drizzle } from "drizzle-orm/d1";
import type * as schema from "@pnl/types";

export type PnlDb = ReturnType<typeof drizzle<typeof schema>>;
