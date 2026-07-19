import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { accounts, categories, transactions } from "@pnl/types";

import { loadFxContext } from "./fx";

import type { CategoryGroup, MerchantCell, RollupCell } from "@pnl/engine";
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

export type MerchantRollup = {
  /** The base currency every cell's cents are denominated in. */
  currency: string;
  cells: MerchantCell[];
};

/**
 * The Rollup Cell's merchant-grain sibling: the ONLY other query + FX seam.
 * Groups transactions by merchant × month (× account currency, folded away
 * during conversion) so merchant reports are pure engine folds over cells.
 * `normalizeMerchant` groups by UPPER(TRIM(description)); otherwise the raw
 * description is the key.
 */
export async function fetchMerchantCells(
  db: PnlDb,
  opts: { where?: SQL; normalizeMerchant?: boolean } = {}
): Promise<MerchantRollup> {
  const merchantExpr = opts.normalizeMerchant
    ? sql<string>`UPPER(TRIM(${transactions.description}))`
    : sql<string>`${transactions.description}`;
  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;

  const rows = await db
    .select({
      merchant: merchantExpr,
      month: monthExpr,
      currency: accounts.currency,
      cents: sql<number>`SUM(${transactions.amountCents})`,
      rowCount: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(opts.where)
    .groupBy(merchantExpr, monthExpr, sql`${accounts.currency}`);

  const fx = await loadFxContext(
    db,
    rows.map((r) => ({ month: r.month, currency: r.currency }))
  );

  const cells: MerchantCell[] = rows.map((r) => ({
    merchant: r.merchant,
    month: r.month,
    cents: fx.toBaseCents(Number(r.cents ?? 0), r.month, r.currency),
    rowCount: Number(r.rowCount ?? 0)
  }));

  return { currency: fx.baseCurrency, cells };
}
