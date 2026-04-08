import { drizzle } from 'drizzle-orm/d1'

import * as schema from '@pnl/types'

import type { Env } from '../context'

type DB = ReturnType<typeof drizzle<typeof schema>>

export type TRPCContext = {
	db: DB
}

export function createContext(env: Env): TRPCContext {
	return { db: drizzle(env.DB, { schema }) }
}
