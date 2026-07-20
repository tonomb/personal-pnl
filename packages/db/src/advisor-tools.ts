import { count, isNull } from "drizzle-orm";

import {
  buildBudgetVarianceRows,
  buildCashflowTrend,
  buildDataQuality,
  buildKpiSummary,
  countTransactions,
  countUncategorized,
  currentMonth,
  formatMonth,
  lastNMonths,
  parseMonth,
  previousMonth,
  shiftMonth
} from "@pnl/engine";
import { categories, transactions } from "@pnl/types";

import { fetchRollup } from "./rollup";

import type {
  BudgetVarianceResult,
  CashflowTrendResult,
  CategoryListResult,
  CategoryListRow,
  FinancialHealthSnapshot
} from "@pnl/types";
import type { PnlDb } from "./client";

// ---------------------------------------------------------------------------
// get_financial_health_snapshot
// ---------------------------------------------------------------------------

export async function getFinancialHealthSnapshot(
  db: PnlDb,
  today: Date = new Date()
): Promise<FinancialHealthSnapshot> {
  const month = formatMonth(currentMonth(today));
  const prevMonth = previousMonth(month);

  const { currency, cells } = await fetchRollup(db, { months: [month, prevMonth] });
  const kpi = buildKpiSummary(month, prevMonth, cells, currency);

  return {
    ...kpi,
    data_quality: buildDataQuality(countUncategorized(cells, month), countTransactions(cells, month))
  };
}

// ---------------------------------------------------------------------------
// get_budget_variance
// ---------------------------------------------------------------------------

const TRAILING_MONTHS = 3;

export async function getBudgetVariance(db: PnlDb, month: string): Promise<BudgetVarianceResult> {
  const ym = parseMonth(month);
  const trailingMonths = Array.from({ length: TRAILING_MONTHS }, (_, i) =>
    formatMonth(shiftMonth(ym, i - TRAILING_MONTHS))
  );

  const { currency, cells } = await fetchRollup(db, { months: [...trailingMonths, month] });

  return {
    month,
    currency,
    trailingMonths,
    rows: buildBudgetVarianceRows(month, TRAILING_MONTHS, cells),
    data_quality: buildDataQuality(countUncategorized(cells), countTransactions(cells))
  };
}

// ---------------------------------------------------------------------------
// get_cashflow_trend
// ---------------------------------------------------------------------------

export async function getCashflowTrend(
  db: PnlDb,
  monthsRequested: number,
  today: Date = new Date()
): Promise<CashflowTrendResult> {
  const months = Math.max(1, Math.min(24, Math.floor(monthsRequested)));
  const periodMonths = lastNMonths(currentMonth(today), months);

  const { currency, cells } = await fetchRollup(db, { months: periodMonths });

  return {
    currency,
    months: buildCashflowTrend(periodMonths, cells),
    data_quality: buildDataQuality(countUncategorized(cells), countTransactions(cells))
  };
}

// ---------------------------------------------------------------------------
// get_category_list
// ---------------------------------------------------------------------------

export async function getCategoryList(db: PnlDb): Promise<CategoryListResult> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      group_type: categories.groupType,
      color: categories.color
    })
    .from(categories)
    .orderBy(categories.sortOrder, categories.name);

  // No money is aggregated here, so no FX involvement — plain counts keep the
  // category list available even while rates are missing (ADR-0003 hard
  // errors apply to money aggregates only).
  const [totalRow] = await db.select({ total: count() }).from(transactions);
  const [uncatRow] = await db.select({ total: count() }).from(transactions).where(isNull(transactions.categoryId));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      group_type: r.group_type as CategoryListRow["group_type"],
      color: r.color
    })),
    data_quality: buildDataQuality(uncatRow?.total ?? 0, totalRow?.total ?? 0)
  };
}
