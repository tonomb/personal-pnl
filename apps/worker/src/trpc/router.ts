import { initTRPC, TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";
import { WorkersLogger } from "workers-tagged-logger";
import { z } from "zod";

import {
  categories,
  categorizeInputSchema,
  columnMappings,
  createCategoryInputSchema,
  deleteCategoryInputSchema,
  insertColumnMappingSchema,
  transactionGroupedInputSchema,
  transactionInputSchema,
  transactionListInputSchema,
  transactions,
  updateCategoryInputSchema
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

    create: publicProcedure.input(createCategoryInputSchema).mutation(async ({ input, ctx }) => {
      const [created] = await ctx.db.insert(categories).values(input).returning();
      return created;
    }),

    update: publicProcedure.input(updateCategoryInputSchema).mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      const [updated] = await ctx.db.update(categories).set(patch).where(eq(categories.id, id)).returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Category ${id} not found` });
      }
      return updated;
    }),

    delete: publicProcedure.input(deleteCategoryInputSchema).mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .delete(categories)
        .where(eq(categories.id, input.id))
        .returning({ id: categories.id });
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Category ${input.id} not found` });
      }
      return { deletedId: deleted.id };
    })
  }),

  transactions: router({
    list: publicProcedure.input(transactionListInputSchema).query(async ({ input, ctx }) => {
      const filters: SQL[] = [];
      if (input.month) filters.push(like(transactions.date, `${input.month}%`));
      if (input.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
      if (input.uncategorized) filters.push(isNull(transactions.categoryId));
      const whereClause = filters.length ? and(...filters) : undefined;

      const rows = await ctx.db
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
        .where(whereClause)
        .orderBy(desc(transactions.date))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await ctx.db.select({ total: count() }).from(transactions).where(whereClause);

      return { rows, total: total ?? 0 };
    }),

    grouped: publicProcedure.input(transactionGroupedInputSchema).query(async ({ input, ctx }) => {
      const filters: SQL[] = [];
      if (input?.month) filters.push(like(transactions.date, `${input.month}%`));
      if (input?.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
      if (input?.uncategorized) filters.push(isNull(transactions.categoryId));
      const whereClause = filters.length ? and(...filters) : undefined;

      const rows = await ctx.db
        .select({
          description: transactions.description,
          count: count(),
          totalAmount: sql<number>`SUM(${transactions.amount})`
        })
        .from(transactions)
        .where(whereClause)
        .groupBy(transactions.description)
        .orderBy(desc(count()));

      const categoryCounts = await ctx.db
        .select({
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categoryGroupType: categories.groupType,
          categoryColor: categories.color,
          cnt: count()
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .groupBy(
          transactions.description,
          transactions.categoryId,
          categories.name,
          categories.groupType,
          categories.color
        );

      const modeByDesc = new Map<
        string,
        {
          categoryId: number | null;
          categoryName: string | null;
          categoryGroupType: string | null;
          categoryColor: string | null;
        }
      >();
      const topCountByDesc = new Map<string, number>();
      for (const row of categoryCounts) {
        const prevTop = topCountByDesc.get(row.description) ?? -1;
        if (row.cnt > prevTop) {
          topCountByDesc.set(row.description, row.cnt);
          modeByDesc.set(row.description, {
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            categoryGroupType: row.categoryGroupType,
            categoryColor: row.categoryColor
          });
        } else if (row.cnt === prevTop) {
          modeByDesc.set(row.description, {
            categoryId: null,
            categoryName: null,
            categoryGroupType: null,
            categoryColor: null
          });
        }
      }

      return rows.map((r) => {
        const mode = modeByDesc.get(r.description);
        return {
          description: r.description,
          count: r.count,
          totalAmount: Number(r.totalAmount ?? 0),
          categoryId: mode?.categoryId ?? null,
          categoryName: mode?.categoryName ?? null,
          categoryGroupType: mode?.categoryGroupType ?? null,
          categoryColor: mode?.categoryColor ?? null
        };
      });
    }),

    categorize: publicProcedure.input(categorizeInputSchema).mutation(async ({ input, ctx }) => {
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
