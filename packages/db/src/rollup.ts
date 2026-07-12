import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { accounts, categories, transactions } from "@pnl/types";

import { loadFxContext } from "./fx";

import type { CategoryGroup, RollupCell } from "@pnl/engine";
import type { PnlDb } from "./client";

export type RollupFilter = { year: number } | { months: string[] } | { startMonth: string; endMonth: string };

export type Rollup = {
  /** The base currency every cell's cents are denominated in. */
  currency: string;
  cells: RollupCell[];
};

/**
 * THE monthly rollup: the single query + FX seam behind every money
 * aggregate (P&L report/month/KPIs, advisor tools, card optimization).
 * Groups transactions by month × category × account, converts each cell's
 * cents into the base currency at that month's rate, and hard-errors with
 * every missing (month, currency) pair (ADR-0003). Cells include
 * uncategorized transactions (categoryId null) so callers can derive
 * data-quality counts without extra queries.
 */
export async function fetchRollup(db: PnlDb, filter: RollupFilter): Promise<Rollup> {
  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;
  const where =
    "year" in filter
      ? sql`strftime('%Y', ${transactions.date}) = ${String(filter.year)}`
      : "months" in filter
        ? inArray(monthExpr, filter.months)
        : and(gte(monthExpr, filter.startMonth), lte(monthExpr, filter.endMonth));

  const rows = await db
    .select({
      month: monthExpr,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      accountId: transactions.accountId,
      accountName: accounts.name,
      currency: accounts.currency,
      cents: sql<number>`SUM(${transactions.amountCents})`,
      rowCount: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(where)
    .groupBy(monthExpr, transactions.categoryId, transactions.accountId)
    .orderBy(monthExpr);

  const fx = await loadFxContext(
    db,
    rows.map((r) => ({ month: r.month, currency: r.currency }))
  );

  const cells: RollupCell[] = rows.map((r) => ({
    month: r.month,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    groupType: (r.groupType as CategoryGroup | null) ?? null,
    accountId: r.accountId,
    accountName: r.accountName,
    cents: fx.toBaseCents(Number(r.cents ?? 0), r.month, r.currency),
    rowCount: Number(r.rowCount ?? 0)
  }));

  return { currency: fx.baseCurrency, cells };
}
