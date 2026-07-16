import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";

import { centsToAmount } from "@pnl/money";
import { accounts, categories, tags, transactions, transactionTags } from "@pnl/types";

import { batchChunked } from "./batch";
import { loadFxContext } from "./fx";

import type { GroupedTransactionsResult, Tag, TransactionListResult } from "@pnl/types";
import type { PnlDb } from "./client";

export type TransactionListQuery = {
  month?: string;
  categoryId?: number;
  uncategorized?: boolean;
  tagId?: string;
  limit?: number;
  offset?: number;
};

function listFilters(input: TransactionListQuery | undefined, db: PnlDb): SQL[] {
  const filters: SQL[] = [];
  if (input?.month) filters.push(like(transactions.date, `${input.month}%`));
  if (input?.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
  if (input?.uncategorized) filters.push(isNull(transactions.categoryId));
  if (input?.tagId) {
    filters.push(
      inArray(
        transactions.id,
        db
          .select({ id: transactionTags.transactionId })
          .from(transactionTags)
          .where(eq(transactionTags.tagId, input.tagId))
      )
    );
  }
  return filters;
}

/**
 * The web app's transaction list: category join, per-row tags, and the
 * account's original currency (rows are never FX-converted, ADR-0003).
 */
export async function listTransactionsWithTags(db: PnlDb, input: TransactionListQuery): Promise<TransactionListResult> {
  const filters = listFilters(input, db);
  const whereClause = filters.length ? and(...filters) : undefined;

  const rows = await db
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
    .limit(input.limit ?? 100)
    .offset(input.offset ?? 0);

  const [totalRow] = await db.select({ total: count() }).from(transactions).where(whereClause);

  const txIds = rows.map((r) => r.id);
  const tagsByTx = new Map<string, Tag[]>();
  if (txIds.length > 0) {
    type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
    const tagRowsBatched = (await batchChunked(db, txIds, 90, (chunk) =>
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
    )) as TagJoinRow[][];
    for (const tagRow of tagRowsBatched.flat()) {
      const { transactionId, ...tag } = tagRow;
      const list = tagsByTx.get(transactionId) ?? [];
      list.push(tag);
      tagsByTx.set(transactionId, list);
    }
  }

  return {
    rows: rows.map(({ amountCents, ...r }) => ({
      ...r,
      amount: centsToAmount(amountCents),
      tags: tagsByTx.get(r.id) ?? []
    })),
    total: totalRow?.total ?? 0
  };
}

/**
 * Transactions grouped by description for bulk categorization: totals are
 * FX-converted to the base currency per (month, account currency) cell, and
 * each description carries its most-common category (ties break to null).
 */
export async function groupedTransactions(
  db: PnlDb,
  input: Omit<TransactionListQuery, "limit" | "offset"> | undefined
): Promise<GroupedTransactionsResult> {
  const filters = listFilters(input, db);
  const whereClause = filters.length ? and(...filters) : undefined;

  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;
  const rows = await db
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
    db,
    rows.map((r) => ({ month: r.month, currency: r.currency }))
  );

  const byDescription = new Map<string, { count: number; cents: number }>();
  for (const r of rows) {
    const bucket = byDescription.get(r.description) ?? { count: 0, cents: 0 };
    bucket.count += r.count;
    bucket.cents += fx.toBaseCents(Number(r.cents ?? 0), r.month, r.currency);
    byDescription.set(r.description, bucket);
  }

  const categoryCounts = await db
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
}
