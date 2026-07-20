import { drizzle } from "drizzle-orm/d1";

import * as schema from "@pnl/types";

import type { Env } from "../context";
import type { TRPCContext } from "./trpc-context";

export type { TRPCContext } from "./trpc-context";

export function createContext(env: Env): TRPCContext {
  return { db: drizzle(env.DB, { schema }) };
}
