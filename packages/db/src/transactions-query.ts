import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";

import { centsToAmount } from "@pnl/money";
import { accounts, categories, transactions } from "@pnl/types";

import { loadFxContext } from "./fx";

import type {
  ListTransactionsInput,
  ListTransactionsResult,
  SearchTransactionsInput,
  SpendingByCategoryResult,
  TopMerchantsInput,
  TopMerchantsResult,
  TransactionRow
} from "@pnl/types";
import type { PnlDb } from "./client";

// Raw transaction rows are returned in their account's original currency —
// only aggregates convert to the base currency (ADR-0003).

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

export async function listTransactions(db: PnlDb, input: ListTransactionsInput): Promise<ListTransactionsResult> {
  const filters: SQL[] = [];
  if (input.month) filters.push(like(transactions.date, `${input.month}%`));
  if (input.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
  if (input.uncategorized) filters.push(isNull(transactions.categoryId));
  const whereClause = filters.length ? and(...filters) : undefined;

  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

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
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ total: count() }).from(transactions).where(whereClause);

  return {
    rows: rows.map(({ amountCents, ...row }) => ({ ...row, amount: centsToAmount(amountCents) })),
    total: totalRow?.total ?? 0
  };
}

/**
 * Expense-category totals for one month, converted to the base currency.
 * Spend is every transaction in FIXED/VARIABLE categories — the bank
 * DEBIT/CREDIT type is ignored (ADR-0002; this fixes the last LAG-46 gap).
 */
export async function getSpendingByCategory(db: PnlDb, month: string): Promise<SpendingByCategoryResult> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      currency: accounts.currency,
      cents: sql<number>`SUM(${transactions.amountCents})`
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(like(transactions.date, `${month}%`), inArray(categories.groupType, ["FIXED", "VARIABLE"])))
    .groupBy(transactions.categoryId, categories.name, categories.groupType, accounts.currency);

  const fx = await loadFxContext(
    db,
    rows.map((r) => ({ month, currency: r.currency }))
  );

  const centsByCategory = new Map<number, { categoryName: string; groupType: "FIXED" | "VARIABLE"; cents: number }>();
  for (const r of rows) {
    const categoryId = r.categoryId as number;
    const cents = fx.toBaseCents(Number(r.cents ?? 0), month, r.currency);
    const existing = centsByCategory.get(categoryId);
    if (existing) {
      existing.cents += cents;
    } else {
      centsByCategory.set(categoryId, {
        categoryName: r.categoryName,
        groupType: r.groupType as "FIXED" | "VARIABLE",
        cents
      });
    }
  }

  return {
    currency: fx.baseCurrency,
    rows: [...centsByCategory.entries()]
      .map(([categoryId, bucket]) => ({
        categoryId,
        categoryName: bucket.categoryName,
        groupType: bucket.groupType,
        total: centsToAmount(bucket.cents)
      }))
      .sort((a, b) => b.total - a.total)
  };
}

/**
 * Merchants ranked by total transaction volume, converted to the base
 * currency per (month, account currency) before ranking so mixed-currency
 * histories rank honestly.
 */
export async function getTopMerchants(db: PnlDb, input: TopMerchantsInput): Promise<TopMerchantsResult> {
  const limit = Math.min(input.limit ?? 10, 200);
  const merchant = sql<string>`UPPER(TRIM(${transactions.description}))`;
  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;

  const rows = await db
    .select({
      merchant,
      month: monthExpr,
      currency: accounts.currency,
      count: count(),
      cents: sql<number>`SUM(${transactions.amountCents})`
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(input.month ? like(transactions.date, `${input.month}%`) : undefined)
    .groupBy(merchant, monthExpr, sql`${accounts.currency}`);

  const fx = await loadFxContext(
    db,
    rows.map((r) => ({ month: r.month, currency: r.currency }))
  );

  const byMerchant = new Map<string, { count: number; cents: number }>();
  for (const r of rows) {
    const bucket = byMerchant.get(r.merchant) ?? { count: 0, cents: 0 };
    bucket.count += r.count;
    bucket.cents += fx.toBaseCents(Number(r.cents ?? 0), r.month, r.currency);
    byMerchant.set(r.merchant, bucket);
  }

  return {
    currency: fx.baseCurrency,
    rows: [...byMerchant.entries()]
      .map(([name, bucket]) => ({ merchant: name, count: bucket.count, total: centsToAmount(bucket.cents) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
  };
}
