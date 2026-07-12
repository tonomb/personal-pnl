import { initTRPC, TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";
import { WorkersLogger } from "workers-tagged-logger";
import { z } from "zod";

import {
  batchChunked,
  buildTagReport,
  computeKpiSummary,
  computeMonthlyPnl,
  computePnlReport,
  deleteFxRate,
  findTagByName,
  FxRateMissingError,
  getSettings,
  insertTransactions,
  listFxRates,
  loadFxContext,
  updateSettings,
  upsertFxRate
} from "@pnl/db";
import { centsToAmount } from "@pnl/money";
import type { CardBenefit, GroupedTransactionsResult, KpiSummary, Tag } from "@pnl/types";
import {
  accounts,
  assignTagInputSchema,
  cardBenefits,
  categories,
  categorizeInputSchema,
  columnMappings,
  createAccountInputSchema,
  createCardBenefitInputSchema,
  createCategoryInputSchema,
  createTagInputSchema,
  deleteAccountInputSchema,
  deleteCardBenefitInputSchema,
  deleteCategoryInputSchema,
  deleteFxRateInputSchema,
  deleteTagInputSchema,
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
  updateCategoryInputSchema,
  updateSettingsInputSchema,
  upsertCardBenefitInputSchema,
  upsertFxRateInputSchema
} from "@pnl/types";

import type { TRPCContext } from "./trpc-context";

const logger = new WorkersLogger();

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    // Missing FX rates hard-error with the exact pairs to fix (ADR-0003);
    // expose them structurally so clients can prompt "add a rate for USD 2026-03".
    if (error.cause instanceof FxRateMissingError) {
      return { ...shape, data: { ...shape.data, missingFxRates: error.cause.missing } };
    }
    return shape;
  }
});

export const router = t.router;
export const publicProcedure = t.procedure;

async function withFxErrorMapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FxRateMissingError) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message, cause: err });
    }
    throw err;
  }
}

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({ pong: true }))
  }),

  settings: router({
    get: publicProcedure.query(({ ctx }) => getSettings(ctx.db)),

    update: publicProcedure.input(updateSettingsInputSchema).mutation(async ({ input, ctx }) => {
      return updateSettings(ctx.db, input);
    })
  }),

  fxRates: router({
    list: publicProcedure.query(({ ctx }) => listFxRates(ctx.db)),

    upsert: publicProcedure.input(upsertFxRateInputSchema).mutation(async ({ input, ctx }) => {
      try {
        return await upsertFxRate(ctx.db, input);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : String(err) });
      }
    }),

    delete: publicProcedure.input(deleteFxRateInputSchema).mutation(async ({ input, ctx }) => {
      const deleted = await deleteFxRate(ctx.db, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: `FX rate ${input.id} not found` });
      return deleted;
    })
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

  cardBenefits: router({
    list: publicProcedure.query(async ({ ctx }) => {
      return ctx.db.select().from(cardBenefits).orderBy(cardBenefits.accountId, cardBenefits.categoryGroup);
    }),

    upsert: publicProcedure.input(upsertCardBenefitInputSchema).mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      const [result] = await ctx.db
        .insert(cardBenefits)
        .values({ id, ...input })
        .onConflictDoUpdate({
          target: [cardBenefits.accountId, cardBenefits.categoryGroup],
          set: {
            rewardType: input.rewardType,
            rewardRate: input.rewardRate,
            notes: input.notes ?? null
          }
        })
        .returning();
      return result!;
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

      const rows = input.transactionIds.map((transactionId) => ({ transactionId, tagId: input.tagId }));
      // 2 bound params per row.
      await batchChunked(ctx.db, rows, 45, (chunk) =>
        ctx.db
          .insert(transactionTags)
          .values(chunk)
          .onConflictDoNothing({ target: [transactionTags.transactionId, transactionTags.tagId] })
      );
      return { assigned: input.transactionIds.length };
    }),

    removeFromTransactions: publicProcedure.input(removeTagInputSchema).mutation(async ({ input, ctx }) => {
      // 1 (tagId) + N (transactionIds) params per statement.
      await batchChunked(ctx.db, input.transactionIds, 90, (chunk) =>
        ctx.db
          .delete(transactionTags)
          .where(and(eq(transactionTags.tagId, input.tagId), inArray(transactionTags.transactionId, chunk)))
      );
      return { removed: input.transactionIds.length };
    }),

    getReport: publicProcedure.input(tagGetReportInputSchema).query(async ({ input, ctx }) => {
      const [tag] = await ctx.db.select().from(tags).where(eq(tags.id, input.tagId)).limit(1);
      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Tag ${input.tagId} not found` });
      }
      return withFxErrorMapped(() => buildTagReport(ctx.db, tag));
    }),

    getReportByName: publicProcedure.input(tagGetReportByNameInputSchema).query(async ({ input, ctx }) => {
      const tag = await findTagByName(ctx.db, input.name);
      if (!tag) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No tag matches "${input.name}"` });
      }
      return withFxErrorMapped(() => buildTagReport(ctx.db, tag));
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
          amountCents: transactions.amountCents,
          currency: accounts.currency,
          type: transactions.type,
          categoryId: transactions.categoryId,
          sourceFile: transactions.sourceFile,
          createdAt: transactions.createdAt,
          categoryName: categories.name,
          categoryGroupType: categories.groupType,
          categoryColor: categories.color
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(whereClause)
        .orderBy(desc(transactions.date))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await ctx.db.select({ total: count() }).from(transactions).where(whereClause);

      const txIds = rows.map((r) => r.id);
      const tagsByTx = new Map<string, Tag[]>();
      if (txIds.length > 0) {
        type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
        const tagRowsBatched = (await batchChunked(ctx.db, txIds, 90, (chunk) =>
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
        )) as TagJoinRow[][];
        for (const tagRow of tagRowsBatched.flat()) {
          const { transactionId, ...tag } = tagRow;
          const list = tagsByTx.get(transactionId) ?? [];
          list.push(tag);
          tagsByTx.set(transactionId, list);
        }
      }
      const enrichedRows = rows.map(({ amountCents, ...r }) => ({
        ...r,
        amount: centsToAmount(amountCents),
        tags: tagsByTx.get(r.id) ?? []
      }));
      return { rows: enrichedRows, total: total ?? 0 };
    }),

    grouped: publicProcedure
      .input(transactionGroupedInputSchema)
      .query(async ({ input, ctx }): Promise<GroupedTransactionsResult> => {
        return withFxErrorMapped(async () => {
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

          const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;
          const rows = await ctx.db
            .select({
              description: transactions.description,
              month: monthExpr,
              currency: accounts.currency,
              count: count(),
              cents: sql<number>`SUM(${transactions.amountCents})`
            })
            .from(transactions)
            .innerJoin(accounts, eq(transactions.accountId, accounts.id))
            .where(whereClause)
            .groupBy(transactions.description, monthExpr, sql`${accounts.currency}`);

          const fx = await loadFxContext(
            ctx.db,
            rows.map((r) => ({ month: r.month, currency: r.currency }))
          );

          const byDescription = new Map<string, { count: number; cents: number }>();
          for (const r of rows) {
            const bucket = byDescription.get(r.description) ?? { count: 0, cents: 0 };
            bucket.count += r.count;
            bucket.cents += fx.toBaseCents(Number(r.cents ?? 0), r.month, r.currency);
            byDescription.set(r.description, bucket);
          }

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

          return {
            currency: fx.baseCurrency,
            rows: [...byDescription.entries()]
              .sort((a, b) => b[1].count - a[1].count)
              .map(([description, bucket]) => {
                const mode = modeByDesc.get(description);
                return {
                  description,
                  count: bucket.count,
                  totalAmount: centsToAmount(bucket.cents),
                  categoryId: mode?.categoryId ?? null,
                  categoryName: mode?.categoryName ?? null,
                  categoryGroupType: mode?.categoryGroupType ?? null,
                  categoryColor: mode?.categoryColor ?? null
                };
              })
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
        await batchChunked(ctx.db, input.ids, 90, (chunk) =>
          ctx.db.update(transactions).set({ categoryId: input.categoryId }).where(inArray(transactions.id, chunk))
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
          accountId: z.string()
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

          const { inserted, duplicates } = await insertTransactions(ctx.db, input.transactions, input.accountId);
          event.duplicates = duplicates;
          event.newCount = inserted;
          event.outcome = "success";
          return { inserted, duplicates, total: input.transactions.length };
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
      return withFxErrorMapped(() => computePnlReport(ctx.db, input.year));
    }),

    getKpis: publicProcedure.input(pnlGetKpisInputSchema).query(({ input, ctx }): Promise<KpiSummary> => {
      return withFxErrorMapped(() => computeKpiSummary(ctx.db, input.month));
    }),

    getMonth: publicProcedure.input(pnlGetMonthInputSchema).query(async ({ input, ctx }) => {
      const { pnl } = await withFxErrorMapped(() => computeMonthlyPnl(ctx.db, input.month));
      return pnl;
    })
  })
});

export type AppRouter = typeof appRouter;
