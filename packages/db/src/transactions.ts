import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";

import { buildSpendingByCategoryRows, rankMerchantsByVolume, summarizeMerchants } from "@pnl/engine";
import { centsToAmount } from "@pnl/money";
import { accounts, categories, transactions, transactionTags } from "@pnl/types";

import { fetchMerchantCells, fetchRollup } from "./rollup";
import { tagsByTransactionId } from "./tags";

import type {
  GroupedTransactionsResult,
  ListTransactionsInput,
  ListTransactionsResult,
  SearchTransactionsInput,
  SpendingByCategoryResult,
  TopMerchantsInput,
  TopMerchantsResult,
  TransactionListResult,
  TransactionRow
} from "@pnl/types";
import type { PnlDb } from "./client";

// Raw transaction rows are returned in their account's original currency —
// only aggregates convert to the base currency (ADR-0003).

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

  const tagsByTx = await tagsByTransactionId(
    db,
    rows.map((r) => r.id)
  );

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
 * Transactions grouped by description for bulk categorization: totals are a
 * pure fold over Merchant Cells (raw-description grain, base currency), and
 * each description carries its most-common category (ties break to null).
 */
export async function groupedTransactions(
  db: PnlDb,
  input: Omit<TransactionListQuery, "limit" | "offset"> | undefined
): Promise<GroupedTransactionsResult> {
  const filters = listFilters(input, db);
  const whereClause = filters.length ? and(...filters) : undefined;

  const { currency, cells } = await fetchMerchantCells(db, { where: whereClause });
  const totals = summarizeMerchants(cells);

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
    currency,
    rows: [...totals]
      .sort((a, b) => b.count - a.count)
      .map(({ merchant: description, count: txCount, cents }) => {
        const mode = modeByDesc.get(description);
        return {
          description,
          count: txCount,
          totalAmount: centsToAmount(cents),
          categoryId: mode?.categoryId ?? null,
          categoryName: mode?.categoryName ?? null,
          categoryGroupType: mode?.categoryGroupType ?? null,
          categoryColor: mode?.categoryColor ?? null
        };
      })
  };
}

/** MCP full-text search over descriptions, rows in original currency. */
export async function searchTransactions(db: PnlDb, input: SearchTransactionsInput): Promise<TransactionRow[]> {
  const limit = Math.min(input.limit ?? 50, 200);
  const filters: SQL[] = [sql`UPPER(${transactions.description}) LIKE UPPER('%' || ${input.query} || '%')`];
  if (input.month) filters.push(like(transactions.date, `${input.month}%`));

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      currency: accounts.currency,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...filters))
    .orderBy(desc(transactions.date))
    .limit(limit);

  return rows.map(({ amountCents, ...row }) => ({ ...row, amount: centsToAmount(amountCents) }));
}

/** MCP paged list, rows in original currency (no tags enrichment). */
export async function listTransactions(db: PnlDb, input: ListTransactionsInput): Promise<ListTransactionsResult> {
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
      categoryName: categories.name
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(transactions.date))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);

  const [totalRow] = await db.select({ total: count() }).from(transactions).where(whereClause);

  return {
    rows: rows.map(({ amountCents, ...row }) => ({ ...row, amount: centsToAmount(amountCents) })),
    total: totalRow?.total ?? 0
  };
}

/**
 * Expense-category totals for one month: a pure engine fold over the month's
 * Rollup Cells (direction from category, ADR-0002; base currency, ADR-0003).
 */
export async function getSpendingByCategory(db: PnlDb, month: string): Promise<SpendingByCategoryResult> {
  const { currency, cells } = await fetchRollup(db, { months: [month] });
  return { currency, rows: buildSpendingByCategoryRows(cells) };
}

/**
 * Merchants ranked by total transaction volume: a pure engine fold over
 * Merchant Cells (normalized-merchant grain, base currency) so
 * mixed-currency histories rank honestly.
 */
export async function getTopMerchants(db: PnlDb, input: TopMerchantsInput): Promise<TopMerchantsResult> {
  const limit = Math.min(input.limit ?? 10, 200);
  const { currency, cells } = await fetchMerchantCells(db, {
    where: input.month ? like(transactions.date, `${input.month}%`) : undefined,
    normalizeMerchant: true
  });
  return { currency, rows: rankMerchantsByVolume(cells, limit) };
}
