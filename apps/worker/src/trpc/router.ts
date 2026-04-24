import { initTRPC } from "@trpc/server";
import { desc, eq, inArray, like } from "drizzle-orm";
import { WorkersLogger } from "workers-tagged-logger";
import { z } from "zod";

import {
  categories,
  columnMappings,
  insertCategorySchema,
  insertColumnMappingSchema,
  transactionInputSchema,
  transactions
} from "@pnl/types";

import type { TRPCContext } from "./context";

const logger = new WorkersLogger();

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({ pong: true }))
  }),

  categories: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db.select().from(categories).orderBy(categories.sortOrder);
      return {
        INCOME: rows.filter((c) => c.groupType === "INCOME"),
        FIXED: rows.filter((c) => c.groupType === "FIXED"),
        VARIABLE: rows.filter((c) => c.groupType === "VARIABLE"),
        IGNORED: rows.filter((c) => c.groupType === "IGNORED")
      };
    }),

    create: publicProcedure
      .input(insertCategorySchema.pick({ name: true, groupType: true }))
      .mutation(async ({ input, ctx }) => {
        const [created] = await ctx.db.insert(categories).values(input).returning();
        return created;
      })
  }),

  transactions: router({
    list: publicProcedure
      .input(
        z.object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional()
        })
      )
      .query(async ({ input, ctx }) => {
        return ctx.db
          .select({
            id: transactions.id,
            date: transactions.date,
            description: transactions.description,
            amount: transactions.amount,
            type: transactions.type,
            categoryId: transactions.categoryId,
            sourceFile: transactions.sourceFile,
            createdAt: transactions.createdAt,
            categoryName: categories.name,
            categoryGroupType: categories.groupType,
            categoryColor: categories.color
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .where(input.month ? like(transactions.date, `${input.month}%`) : undefined)
          .orderBy(desc(transactions.date));
      }),

    categorize: publicProcedure
      .input(
        z.object({
          ids: z.array(z.string()).min(1).max(500),
          categoryId: z.number().int().nullable()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const startMs = Date.now();
        const event: Record<string, unknown> = {
          procedure: "transactions.categorize",
          count: input.ids.length,
          categoryId: input.categoryId
        };
        try {
          const idChunks = chunks(input.ids, 90);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx.db.batch as any)(
            idChunks.map((chunk) =>
              ctx.db.update(transactions).set({ categoryId: input.categoryId }).where(inArray(transactions.id, chunk))
            )
          );
          event.outcome = "success";
          return { updated: input.ids.length };
        } catch (err) {
          event.outcome = "error";
          event.error = {
            message: err instanceof Error ? err.message : String(err),
            name: err instanceof Error ? err.name : "UnknownError"
          };
          throw err;
        } finally {
          event.durationMs = Date.now() - startMs;
          logger.info(event);
        }
      }),

    getMapping: publicProcedure.input(z.object({ fingerprint: z.string() })).query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select()
        .from(columnMappings)
        .where(eq(columnMappings.fileFingerprint, input.fingerprint))
        .limit(1);

      return result[0] ?? null;
    }),

    upload: publicProcedure
      .input(
        z.object({
          transactions: z.array(transactionInputSchema),
          sourceFile: z.string(),
          mapping: insertColumnMappingSchema
        })
      )
      .mutation(async ({ input, ctx }) => {
        const startMs = Date.now();
        const event: Record<string, unknown> = {
          procedure: "transactions.upload",
          sourceFile: input.sourceFile,
          submittedCount: input.transactions.length,
          fingerprint: input.mapping.fileFingerprint
        };

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
                creditCol: input.mapping.creditCol
              }
            });
          event.mappingUpserted = true;

          if (input.transactions.length === 0) {
            event.outcome = "success";
            return { inserted: 0, duplicates: 0, total: 0 };
          }

          const submittedIds = input.transactions.map((tx) => tx.id);
          event.submittedIds = submittedIds.length;

          // Find which IDs already exist — batch all SELECT chunks into one D1 roundtrip
          const idChunks = chunks(submittedIds, 90);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dedupeResults: { id: string }[][] = await (ctx.db.batch as any)(
            idChunks.map((idChunk) =>
              ctx.db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, idChunk))
            )
          );
          const existingIds = new Set<string>();
          for (const rows of dedupeResults) {
            for (const row of rows) existingIds.add(row.id);
          }
          const newTransactions = input.transactions.filter((tx) => !existingIds.has(tx.id));
          event.duplicates = existingIds.size;
          event.newCount = newTransactions.length;

          // D1 allows max 100 bound parameters per statement.
          // This INSERT has 9 params per row — use 10 rows/stmt for headroom.
          // Group up to 100 statements per db.batch() call = 1,000 rows per roundtrip.
          const insertChunks = chunks(newTransactions, 10);
          event.chunkCount = insertChunks.length;
          event.chunkSizes = insertChunks.map((c) => c.length);

          for (const batchGroup of chunks(insertChunks, 100)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (ctx.db.batch as any)(batchGroup.map((rows) => ctx.db.insert(transactions).values(rows)));
          }

          event.outcome = "success";
          return {
            inserted: newTransactions.length,
            duplicates: existingIds.size,
            total: input.transactions.length
          };
        } catch (err) {
          event.outcome = "error";
          event.error = {
            message: err instanceof Error ? err.message : String(err),
            name: err instanceof Error ? err.name : "UnknownError",
            cause: err instanceof Error && err.cause ? String(err.cause) : undefined
          };
          throw err;
        } finally {
          event.durationMs = Date.now() - startMs;
          logger.info(event);
        }
      })
  })
});

export type AppRouter = typeof appRouter;
