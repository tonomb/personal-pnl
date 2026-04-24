import { initTRPC } from '@trpc/server'

import type { Category, ColumnMapping, NewColumnMapping, NewTransaction, Transaction } from './schema'

export type TransactionWithCategory = Transaction & {
	categoryName: string | null
	categoryGroupType: string | null
	categoryColor: string | null
}

const t = initTRPC.create()

const router = t.router
const publicProcedure = t.procedure

export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({ pong: true as const })),
	}),
	categories: router({
		list: publicProcedure
			.input((v: unknown) => v as void)
			.query(
				(): { INCOME: Category[]; FIXED: Category[]; VARIABLE: Category[]; IGNORED: Category[] } =>
					null as unknown as {
						INCOME: Category[]
						FIXED: Category[]
						VARIABLE: Category[]
						IGNORED: Category[]
					},
			),
		create: publicProcedure
			.input((v: unknown) => v as { name: string; groupType: string })
			.mutation((): Category => null as unknown as Category),
	}),
	transactions: router({
		list: publicProcedure
			.input((v: unknown) => v as { month?: string })
			.query((): TransactionWithCategory[] => null as unknown as TransactionWithCategory[]),
		categorize: publicProcedure
			.input((v: unknown) => v as { ids: string[]; categoryId: number | null })
			.mutation((): { updated: number } => ({ updated: 0 })),
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
