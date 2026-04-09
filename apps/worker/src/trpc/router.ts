import { initTRPC } from '@trpc/server'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import {
	columnMappings,
	insertColumnMappingSchema,
	insertTransactionSchema,
	transactions,
} from '@pnl/types'

import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

function chunks<T>(arr: T[], size: number): T[][] {
	const result: T[][] = []
	for (let i = 0; i < arr.length; i += size) {
		result.push(arr.slice(i, i + size))
	}
	return result
}

export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({ pong: true })),
	}),

	transactions: router({
		getMapping: publicProcedure
			.input(z.object({ fingerprint: z.string() }))
			.query(async ({ input, ctx }) => {
				const result = await ctx.db
					.select()
					.from(columnMappings)
					.where(eq(columnMappings.fileFingerprint, input.fingerprint))
					.limit(1)

				return result[0] ?? null
			}),

		upload: publicProcedure
			.input(
				z.object({
					transactions: z.array(insertTransactionSchema),
					sourceFile: z.string(),
					mapping: insertColumnMappingSchema,
				}),
			)
			.mutation(async ({ input, ctx }) => {
				// Upsert column mapping
				await ctx.db
					.insert(columnMappings)
					.values(input.mapping)
					.onConflictDoUpdate({
						target: columnMappings.fileFingerprint,
						set: {
							dateCol: input.mapping.dateCol,
							descriptionCol: input.mapping.descriptionCol,
							amountCol: input.mapping.amountCol,
							debitCol: input.mapping.debitCol,
							creditCol: input.mapping.creditCol,
						},
					})

				if (input.transactions.length === 0) {
					return { inserted: 0, duplicates: 0 }
				}

				const submittedIds = input.transactions.map((tx) => tx.id)

				// Find which IDs already exist
				const existing = await ctx.db
					.select({ id: transactions.id })
					.from(transactions)
					.where(inArray(transactions.id, submittedIds))

				const existingIds = new Set(existing.map((r) => r.id))
				const newTransactions = input.transactions.filter((tx) => !existingIds.has(tx.id))

				// Insert only new ones in chunks to stay within D1 limits
				for (const chunk of chunks(newTransactions, 100)) {
					await ctx.db.insert(transactions).values(chunk)
				}

				return {
					inserted: newTransactions.length,
					duplicates: existingIds.size,
				}
			}),
	}),
})

export type AppRouter = typeof appRouter
