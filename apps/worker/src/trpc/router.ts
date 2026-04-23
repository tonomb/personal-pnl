import { initTRPC } from '@trpc/server'
import { eq, inArray } from 'drizzle-orm'
import { WorkersLogger } from 'workers-tagged-logger'
import { z } from 'zod'

import {
	categories,
	columnMappings,
	insertCategorySchema,
	insertColumnMappingSchema,
	insertTransactionSchema,
	transactions,
} from '@pnl/types'

import type { TRPCContext } from './context'

const logger = new WorkersLogger()

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

	categories: router({
		list: publicProcedure.query(async ({ ctx }) => {
			const rows = await ctx.db.select().from(categories).orderBy(categories.sortOrder)
			return {
				INCOME: rows.filter((c) => c.groupType === 'INCOME'),
				FIXED: rows.filter((c) => c.groupType === 'FIXED'),
				VARIABLE: rows.filter((c) => c.groupType === 'VARIABLE'),
				IGNORED: rows.filter((c) => c.groupType === 'IGNORED'),
			}
		}),

		create: publicProcedure
			.input(insertCategorySchema.pick({ name: true, groupType: true }))
			.mutation(async ({ input, ctx }) => {
				const [created] = await ctx.db.insert(categories).values(input).returning()
				return created
			}),
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
				const startMs = Date.now()
				const event: Record<string, unknown> = {
					procedure: 'transactions.upload',
					sourceFile: input.sourceFile,
					submittedCount: input.transactions.length,
					fingerprint: input.mapping.fileFingerprint,
				}

				try {
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
					event.mappingUpserted = true

					if (input.transactions.length === 0) {
						event.outcome = 'success'
						return { inserted: 0, duplicates: 0 }
					}

					const submittedIds = input.transactions.map((tx) => tx.id)
					event.submittedIds = submittedIds.length

					// Find which IDs already exist — chunk to stay within D1's 100-param limit
					const existingIds = new Set<string>()
					for (const idChunk of chunks(submittedIds, 90)) {
						const rows = await ctx.db
							.select({ id: transactions.id })
							.from(transactions)
							.where(inArray(transactions.id, idChunk))
						for (const row of rows) existingIds.add(row.id)
					}
					const newTransactions = input.transactions.filter((tx) => !existingIds.has(tx.id))
					event.duplicates = existingIds.size
					event.newCount = newTransactions.length

					// D1 allows max 100 bound parameters per statement.
					// This INSERT has 8 bound params per row (category_id is a null literal).
					// floor(100 / 8) = 12 rows max — use 10 for headroom.
					const insertChunks = chunks(newTransactions, 10)
					event.chunkCount = insertChunks.length
					event.chunkSizes = insertChunks.map((c) => c.length)

					for (let i = 0; i < insertChunks.length; i++) {
						event.currentChunk = i
						await ctx.db.insert(transactions).values(insertChunks[i])
					}

					event.outcome = 'success'
					return {
						inserted: newTransactions.length,
						duplicates: existingIds.size,
					}
				} catch (err) {
					event.outcome = 'error'
					event.error = {
						message: err instanceof Error ? err.message : String(err),
						name: err instanceof Error ? err.name : 'UnknownError',
						cause: err instanceof Error && err.cause ? String(err.cause) : undefined,
					}
					throw err
				} finally {
					event.durationMs = Date.now() - startMs
					logger.info(event)
				}
			}),
	}),
})

export type AppRouter = typeof appRouter
