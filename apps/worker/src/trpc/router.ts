import { initTRPC, TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";
import { WorkersLogger } from "workers-tagged-logger";
import { z } from "zod";

import { add, subtract, toStorable } from "@pnl/money";
import type {
  CardBenefit,
  KpiSummary,
  Tag,
  TagReport,
  TagReportCategoryBreakdown,
  TagReportTransaction
} from "@pnl/types";
import {
  accounts,
  assignTagInputSchema,
  buildMonthlyPnL,
  cardBenefits,
  categories,
  categorizeInputSchema,
  columnMappings,
  computeMonthlyPnl,
  computePnlReport,
  createAccountInputSchema,
  createCardBenefitInputSchema,
  createCategoryInputSchema,
  createTagInputSchema,
  deleteAccountInputSchema,
  deleteCardBenefitInputSchema,
  deleteCategoryInputSchema,
  deleteTagInputSchema,
  getSavingsRateBenchmark,
  insertColumnMappingSchema,
  pnlGetKpisInputSchema,
  pnlGetMonthInputSchema,
  pnlGetReportInputSchema,
  removeTagInputSchema,
  tagGetReportByNameInputSchema,
  tagGetReportInputSchema,
  tags,
  transactionGroupedInputSchema,
  transactionInputSchema,
  transactionListInputSchema,
  transactions,
  transactionTags,
  updateAccountInputSchema,
  updateCardBenefitInputSchema,
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

async function buildTagReport(db: TRPCContext["db"], tag: Tag): Promise<TagReport> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      sourceFile: transactions.sourceFile,
      rawRow: transactions.rawRow,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryGroupType: categories.groupType
    })
    .from(transactions)
    .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactionTags.tagId, tag.id))
    .orderBy(transactions.date);

  const txIds = rows.map((r) => r.id);
  const tagsByTx = new Map<string, Tag[]>();
  if (txIds.length > 0) {
    const idChunks = chunks(txIds, 90);
    type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
    const tagRowsBatched = (await (db.batch as unknown as (s: unknown[]) => Promise<unknown>)(
      idChunks.map((chunk) =>
        db
          .select({
            transactionId: transactionTags.transactionId,
            id: tags.id,
            name: tags.name,
            color: tags.color,
            createdAt: tags.createdAt
          })
          .from(transactionTags)
          .innerJoin(tags, eq(tags.id, transactionTags.tagId))
          .where(inArray(transactionTags.transactionId, chunk))
      )
    )) as TagJoinRow[][];
    for (const row of tagRowsBatched.flat()) {
      const { transactionId, ...t } = row;
      const list = tagsByTx.get(transactionId) ?? [];
      list.push(t);
      tagsByTx.set(transactionId, list);
    }
  }

  const txTransaction = rows.map(({ categoryName: _n, categoryGroupType: _g, ...t }) => ({
    ...t,
    tags: tagsByTx.get(t.id) ?? [tag]
  })) satisfies TagReportTransaction[];

  type CategoryBucket = {
    categoryId: number;
    categoryName: string;
    groupType: "INCOME" | "FIXED" | "VARIABLE";
    totalD: Decimal;
  };
  const byCatMap = new Map<number, CategoryBucket>();
  let totalIncomeD = new Decimal(0);
  let totalSpendD = new Decimal(0);
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    if (minDate === null || row.date < minDate) minDate = row.date;
    if (maxDate === null || row.date > maxDate) maxDate = row.date;

    const groupType = row.categoryGroupType as "INCOME" | "FIXED" | "VARIABLE" | "IGNORED" | null;
    if (groupType !== "INCOME" && groupType !== "FIXED" && groupType !== "VARIABLE") continue;
    if (row.categoryId === null || row.categoryName === null) continue;

    if (row.type === "CREDIT" && groupType === "INCOME") {
      totalIncomeD = add(totalIncomeD, row.amount);
    }
    if (row.type === "DEBIT") {
      totalSpendD = add(totalSpendD, row.amount);
    }

    const existing = byCatMap.get(row.categoryId);
    if (existing) {
      existing.totalD = add(existing.totalD, row.amount);
    } else {
      byCatMap.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        groupType,
        totalD: new Decimal(row.amount)
      });
    }
  }

  const byCategory: TagReportCategoryBreakdown[] = [...byCatMap.values()].map(({ totalD, ...rest }) => ({
    ...rest,
    total: toStorable(totalD)
  }));

  return {
    tag,
    totalIncome: toStorable(totalIncomeD),
    totalSpend: toStorable(totalSpendD),
    net: toStorable(subtract(totalIncomeD, totalSpendD)),
    byCategory,
    transactions: txTransaction,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null
  };
}

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({ pong: true }))
  }),

  accounts: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const accs = await ctx.db.select().from(accounts).orderBy(accounts.createdAt);
      if (accs.length === 0) return [];
      const benefits = await ctx.db
        .select()
        .from(cardBenefits)
        .where(
          inArray(
            cardBenefits.accountId,
            accs.map((a) => a.id)
          )
        );
      const benefitsByAccount = new Map<string, CardBenefit[]>();
      for (const b of benefits) {
        const list = benefitsByAccount.get(b.accountId) ?? [];
        list.push(b);
        benefitsByAccount.set(b.accountId, list);
      }
      return accs.map((a) => ({ ...a, benefits: benefitsByAccount.get(a.id) ?? [] }));
    }),

    create: publicProcedure.input(createAccountInputSchema).mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      const [created] = await ctx.db
        .insert(accounts)
        .values({ id, ...input })
        .returning();
      return { ...created!, benefits: [] };
    }),

    update: publicProcedure.input(updateAccountInputSchema).mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      const [updated] = await ctx.db.update(accounts).set(patch).where(eq(accounts.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: `Account ${id} not found` });
      return updated;
    }),

    delete: publicProcedure.input(deleteAccountInputSchema).mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db.delete(accounts).where(eq(accounts.id, input.id)).returning({ id: accounts.id });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: `Account ${input.id} not found` });
      return { deletedId: deleted.id };
    }),

    addBenefit: publicProcedure.input(createCardBenefitInputSchema).mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      const [created] = await ctx.db
        .insert(cardBenefits)
        .values({ id, ...input })
        .returning();
      return created!;
    }),

    updateBenefit: publicProcedure.input(updateCardBenefitInputSchema).mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(filtered).length === 0) {
        const [existing] = await ctx.db.select().from(cardBenefits).where(eq(cardBenefits.id, id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: `Card benefit ${id} not found` });
        return existing;
      }
      const [updated] = await ctx.db.update(cardBenefits).set(filtered).where(eq(cardBenefits.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: `Card benefit ${id} not found` });
      return updated;
    }),

    deleteBenefit: publicProcedure.input(deleteCardBenefitInputSchema).mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .delete(cardBenefits)
        .where(eq(cardBenefits.id, input.id))
        .returning({ id: cardBenefits.id });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: `Card benefit ${input.id} not found` });
      return { deletedId: deleted.id };
    })
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

  tags: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          createdAt: tags.createdAt,
          transactionCount: count(transactionTags.transactionId)
        })
        .from(tags)
        .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
        .groupBy(tags.id)
        .orderBy(tags.name);
      return rows;
    }),

    create: publicProcedure.input(createTagInputSchema).mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      try {
        const [created] = await ctx.db.insert(tags).values({ id, name: input.name, color: input.color }).returning();
        return created!;
      } catch (err) {
        const causeMessage = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
        if (/UNIQUE constraint failed.*tags\.name/i.test(causeMessage)) {
          throw new TRPCError({ code: "CONFLICT", message: `Tag name "${input.name}" already exists` });
        }
        throw err;
      }
    }),

    delete: publicProcedure.input(deleteTagInputSchema).mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db.delete(tags).where(eq(tags.id, input.id)).returning({ id: tags.id });
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Tag ${input.id} not found` });
      }
      return { deletedId: deleted.id };
    }),

    assignToTransactions: publicProcedure.input(assignTagInputSchema).mutation(async ({ input, ctx }) => {
      const tagExists = await ctx.db.select({ id: tags.id }).from(tags).where(eq(tags.id, input.tagId)).limit(1);
      if (tagExists.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Tag ${input.tagId} not found` });
      }

      // D1 allows max 100 bound params per statement. transaction_tags inserts
      // 2 params per row → use 45 rows/statement for headroom.
      const idChunks = chunks(input.transactionIds, 45);
      const rowChunks = idChunks.map((chunk) => chunk.map((transactionId) => ({ transactionId, tagId: input.tagId })));
      for (const batchGroup of chunks(rowChunks, 100)) {
        await (ctx.db.batch as unknown as (s: unknown[]) => Promise<unknown>)(
          batchGroup.map((rowsForChunk) =>
            ctx.db
              .insert(transactionTags)
              .values(rowsForChunk)
              .onConflictDoNothing({ target: [transactionTags.transactionId, transactionTags.tagId] })
          )
        );
      }
      return { assigned: input.transactionIds.length };
    }),

    removeFromTransactions: publicProcedure.input(removeTagInputSchema).mutation(async ({ input, ctx }) => {
      // DELETE statement uses 1 (tagId) + N (transactionIds) params; chunk to 90 ids
      // for a hard 91-param ceiling per statement.
      const idChunks = chunks(input.transactionIds, 90);
      await (ctx.db.batch as unknown as (s: unknown[]) => Promise<unknown>)(
        idChunks.map((chunk) =>
          ctx.db
            .delete(transactionTags)
            .where(and(eq(transactionTags.tagId, input.tagId), inArray(transactionTags.transactionId, chunk)))
        )
      );
      return { removed: input.transactionIds.length };
    }),

    getReport: publicProcedure.input(tagGetReportInputSchema).query(async ({ input, ctx }) => {
      const [tag] = await ctx.db.select().from(tags).where(eq(tags.id, input.tagId)).limit(1);
      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Tag ${input.tagId} not found` });
      }
      return buildTagReport(ctx.db, tag);
    }),

    getReportByName: publicProcedure.input(tagGetReportByNameInputSchema).query(async ({ input, ctx }) => {
      const [tag] = await ctx.db
        .select()
        .from(tags)
        .where(sql`LOWER(${tags.name}) LIKE LOWER('%' || ${input.name} || '%')`)
        .orderBy(sql`LENGTH(${tags.name}) ASC`)
        .limit(1);
      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No tag matches "${input.name}"` });
      }
      return buildTagReport(ctx.db, tag);
    })
  }),

  transactions: router({
    list: publicProcedure.input(transactionListInputSchema).query(async ({ input, ctx }) => {
      const filters: SQL[] = [];
      if (input.month) filters.push(like(transactions.date, `${input.month}%`));
      if (input.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
      if (input.uncategorized) filters.push(isNull(transactions.categoryId));
      if (input.tagId) {
        filters.push(
          inArray(
            transactions.id,
            ctx.db
              .select({ id: transactionTags.transactionId })
              .from(transactionTags)
              .where(eq(transactionTags.tagId, input.tagId))
          )
        );
      }
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

      const txIds = rows.map((r) => r.id);
      const tagsByTx = new Map<string, Tag[]>();
      if (txIds.length > 0) {
        const idChunks = chunks(txIds, 90);
        type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
        const tagRowsBatched = (await (ctx.db.batch as unknown as (s: unknown[]) => Promise<unknown>)(
          idChunks.map((chunk) =>
            ctx.db
              .select({
                transactionId: transactionTags.transactionId,
                id: tags.id,
                name: tags.name,
                color: tags.color,
                createdAt: tags.createdAt
              })
              .from(transactionTags)
              .innerJoin(tags, eq(tags.id, transactionTags.tagId))
              .where(inArray(transactionTags.transactionId, chunk))
          )
        )) as TagJoinRow[][];
        for (const tagRow of tagRowsBatched.flat()) {
          const { transactionId, ...tag } = tagRow;
          const list = tagsByTx.get(transactionId) ?? [];
          list.push(tag);
          tagsByTx.set(transactionId, list);
        }
      }
      const enrichedRows = rows.map((r) => ({ ...r, tags: tagsByTx.get(r.id) ?? [] }));
      return { rows: enrichedRows, total: total ?? 0 };
    }),

    grouped: publicProcedure.input(transactionGroupedInputSchema).query(async ({ input, ctx }) => {
      const filters: SQL[] = [];
      if (input?.month) filters.push(like(transactions.date, `${input.month}%`));
      if (input?.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
      if (input?.uncategorized) filters.push(isNull(transactions.categoryId));
      if (input?.tagId) {
        filters.push(
          inArray(
            transactions.id,
            ctx.db
              .select({ id: transactionTags.transactionId })
              .from(transactionTags)
              .where(eq(transactionTags.tagId, input.tagId))
          )
        );
      }
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
          mapping: insertColumnMappingSchema,
          accountId: z.string().nullable().optional()
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
          const newTransactions = input.transactions
            .filter((tx) => !existingIds.has(tx.id))
            .map((tx) => ({ ...tx, accountId: input.accountId ?? null }));
          event.duplicates = existingIds.size;
          event.newCount = newTransactions.length;

          // D1 allows max 100 bound parameters per statement.
          // This INSERT has 10 params per row — use 9 rows/stmt for headroom.
          // Group up to 100 statements per db.batch() call = 900 rows per roundtrip.
          const insertChunks = chunks(newTransactions, 9);
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
  }),

  pnl: router({
    getReport: publicProcedure.input(pnlGetReportInputSchema).query(({ input, ctx }) => {
      return computePnlReport(ctx.db, input.year);
    }),

    getKpis: publicProcedure.input(pnlGetKpisInputSchema).query(async ({ input, ctx }): Promise<KpiSummary> => {
      const [y, m] = input.month.split("-").map(Number);
      const prevDate = new Date(y!, m! - 1, 1);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const rows = await ctx.db
        .select({
          month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          groupType: categories.groupType,
          creditTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'CREDIT' THEN ${transactions.amount} ELSE 0 END)`,
          debitTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(sql`strftime('%Y-%m', ${transactions.date}) IN (${input.month}, ${prevMonth})`)
        .groupBy(sql`strftime('%Y-%m', ${transactions.date})`, transactions.categoryId);

      const curr = buildMonthlyPnL(input.month, rows);

      const netLabel: KpiSummary["netLabel"] = curr.net > 0 ? "IN_THE_GREEN" : curr.net < 0 ? "IN_THE_RED" : "NEUTRAL";

      const savingsLabel = getSavingsRateBenchmark(curr.savingsRate);

      const expenseItems = [...curr.fixed.items, ...curr.variable.items];
      const biggestExpense =
        expenseItems.length === 0 ? null : expenseItems.reduce((max, item) => (item.total > max.total ? item : max));

      const hasPrevData = rows.some((r) => r.month === prevMonth && r.categoryId !== null);
      const vsLastMonth: KpiSummary["vsLastMonth"] = (() => {
        if (!hasPrevData) return null;
        const prev = buildMonthlyPnL(prevMonth, rows);
        const delta = toStorable(subtract(curr.net, prev.net));
        const label: "BETTER" | "WORSE" | "SAME" = delta > 0 ? "BETTER" : delta < 0 ? "WORSE" : "SAME";
        return { delta, label };
      })();

      return {
        month: input.month,
        net: curr.net,
        netLabel,
        savingsRate: curr.savingsRate,
        savingsLabel,
        biggestExpense: biggestExpense ? { name: biggestExpense.categoryName, total: biggestExpense.total } : null,
        vsLastMonth
      };
    }),

    getMonth: publicProcedure.input(pnlGetMonthInputSchema).query(async ({ input, ctx }) => {
      const { pnl } = await computeMonthlyPnl(ctx.db, input.month);
      return pnl;
    })
  })
});

export type AppRouter = typeof appRouter;
