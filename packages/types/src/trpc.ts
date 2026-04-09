import { initTRPC } from '@trpc/server'

import type { ColumnMapping, NewColumnMapping, NewTransaction } from './schema'

const t = initTRPC.create()

const router = t.router
const publicProcedure = t.procedure

export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({ pong: true as const })),
	}),
	transactions: router({
		getMapping: publicProcedure
			.input((v: unknown) => v as { fingerprint: string })
			.query((): ColumnMapping | null => null as unknown as ColumnMapping | null),
		upload: publicProcedure
			.input(
				(v: unknown) =>
					v as {
						transactions: NewTransaction[]
						sourceFile: string
						mapping: NewColumnMapping
					},
			)
			.mutation((): { inserted: number; duplicates: number } => ({ inserted: 0, duplicates: 0 })),
	}),
})

export type AppRouter = typeof appRouter
