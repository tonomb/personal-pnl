import { drizzle } from 'drizzle-orm/d1'
import type { DrizzleD1Database } from 'drizzle-orm/d1'

import type { Env } from '../context'

export type TRPCContext = {
	db: DrizzleD1Database
}

export function createContext(env: Env): TRPCContext {
	return { db: drizzle(env.DB) }
}
