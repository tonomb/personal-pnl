import Decimal from "decimal.js";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { divide, multiply, safeDivide, subtract, toStorable } from "@pnl/money";

import { buildMonthlyPnL, getSavingsRateBenchmark } from "./pnl";
import { categories, transactions } from "./schema";

import type { PnlDb, PnlRow } from "./pnl";
import type { KpiSummary } from "./trpc";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type DataQuality = {
  uncategorized_count: number;
  uncategorized_pct: number;
  warning: boolean;
};

function pct(part: number, whole: number): number {
  const ratio = safeDivide(part, whole);
  return ratio === null ? 0 : toStorable(multiply(ratio, 100));
}

function buildDataQuality(uncategorized: number, total: number): DataQuality {
  const uncategorized_pct = pct(uncategorized, total);
  return {
    uncategorized_count: uncategorized,
    uncategorized_pct,
    warning: uncategorized_pct > 5
  };
}

// Returns YYYY-MM for `monthsAgo` calendar months before `from` (default: today UTC).
function shiftMonth(from: { year: number; month: number }, deltaMonths: number): { year: number; month: number } {
  const date = new Date(Date.UTC(from.year, from.month - 1 + deltaMonths, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function formatMonth(ym: { year: number; month: number }): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

function parseMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y!, month: m! };
}

// ---------------------------------------------------------------------------
// get_financial_health_snapshot
// ---------------------------------------------------------------------------

export type FinancialHealthSnapshot = {
  month: string;
  net: number;
  netLabel: KpiSummary["netLabel"];
  savingsRate: number | null;
  savingsLabel: KpiSummary["savingsLabel"];
  biggestExpense: { name: string; total: number } | null;
  vsLastMonth: { delta: number; label: "BETTER" | "WORSE" | "SAME" } | null;
  data_quality: DataQuality;
};

export async function getFinancialHealthSnapshot(
  db: PnlDb,
  today: Date = new Date()
): Promise<FinancialHealthSnapshot> {
  const currYm = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const prevYm = shiftMonth(currYm, -1);
  const currMonth = formatMonth(currYm);
  const prevMonth = formatMonth(prevYm);

  const rows = (await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      creditTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'CREDIT' THEN ${transactions.amount} ELSE 0 END)`,
      debitTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`,
      rowCount: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(sql`strftime('%Y-%m', ${transactions.date}) IN (${currMonth}, ${prevMonth})`)
    .groupBy(sql`strftime('%Y-%m', ${transactions.date})`, transactions.categoryId)) as PnlRow[];

  const curr = buildMonthlyPnL(currMonth, rows);

  const netLabel: KpiSummary["netLabel"] = curr.net > 0 ? "IN_THE_GREEN" : curr.net < 0 ? "IN_THE_RED" : "NEUTRAL";
  const savingsLabel = getSavingsRateBenchmark(curr.savingsRate);

  const expenseItems = [...curr.fixed.items, ...curr.variable.items];
  const biggestExpense =
    expenseItems.length === 0 ? null : expenseItems.reduce((max, item) => (item.total > max.total ? item : max));

  const hasPrevData = rows.some((r) => r.month === prevMonth && r.categoryId !== null);
  const vsLastMonth: FinancialHealthSnapshot["vsLastMonth"] = (() => {
    if (!hasPrevData) return null;
    const prev = buildMonthlyPnL(prevMonth, rows);
    const delta = toStorable(subtract(curr.net, prev.net));
    const label: "BETTER" | "WORSE" | "SAME" = delta > 0 ? "BETTER" : delta < 0 ? "WORSE" : "SAME";
    return { delta, label };
  })();

  const currRows = rows.filter((r) => r.month === currMonth);
  const totalTx = currRows.reduce((s, r) => s + (r.rowCount ?? 0), 0);
  const uncategorizedTx = currRows.filter((r) => r.categoryId === null).reduce((s, r) => s + (r.rowCount ?? 0), 0);

  return {
    month: currMonth,
    net: curr.net,
    netLabel,
    savingsRate: curr.savingsRate,
    savingsLabel,
    biggestExpense: biggestExpense ? { name: biggestExpense.categoryName, total: biggestExpense.total } : null,
    vsLastMonth,
    data_quality: buildDataQuality(uncategorizedTx, totalTx)
  };
}

// ---------------------------------------------------------------------------
// get_budget_variance
// ---------------------------------------------------------------------------

export type BudgetVarianceLabel = "OVER" | "UNDER" | "ON_TRACK";

export type BudgetVarianceRow = {
  categoryId: number;
  categoryName: string;
  groupType: "FIXED" | "VARIABLE";
  trailingAvg: number;
  actual: number;
  variance: number;
  status: BudgetVarianceLabel;
};

export type BudgetVarianceResult = {
  month: string;
  trailingMonths: string[];
  rows: BudgetVarianceRow[];
  data_quality: DataQuality;
};

// Threshold for variance label. ±10% relative to the trailing average.
const BUDGET_VARIANCE_THRESHOLD = 0.1;

export async function getBudgetVariance(db: PnlDb, month: string): Promise<BudgetVarianceResult> {
  const ym = parseMonth(month);
  const trailingMonths = [shiftMonth(ym, -3), shiftMonth(ym, -2), shiftMonth(ym, -1)].map(formatMonth);
  const periodMonths = [...trailingMonths, month];

  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;
  const debitSum = sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`;

  const spendRows = await db
    .select({
      month: monthExpr,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      total: debitSum
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(inArray(monthExpr, periodMonths), inArray(categories.groupType, ["FIXED", "VARIABLE"])))
    .groupBy(monthExpr, transactions.categoryId, categories.name, categories.groupType);

  type Bucket = {
    categoryId: number;
    categoryName: string;
    groupType: "FIXED" | "VARIABLE";
    trailingTotal: number;
    actual: number;
  };
  const byCategory = new Map<number, Bucket>();

  for (const r of spendRows) {
    const id = r.categoryId as number;
    const bucket: Bucket = byCategory.get(id) ?? {
      categoryId: id,
      categoryName: r.categoryName,
      groupType: r.groupType as "FIXED" | "VARIABLE",
      trailingTotal: 0,
      actual: 0
    };
    const total = Number(r.total ?? 0);
    if (r.month === month) {
      bucket.actual += total;
    } else {
      bucket.trailingTotal += total;
    }
    byCategory.set(id, bucket);
  }

  const rows: BudgetVarianceRow[] = [...byCategory.values()]
    .map((b) => {
      const trailingAvgD = divide(b.trailingTotal, 3);
      const actualD = new Decimal(b.actual);
      const varianceD = subtract(actualD, trailingAvgD);
      const trailingAvg = toStorable(trailingAvgD);
      const actual = toStorable(actualD);
      const variance = toStorable(varianceD);
      const status: BudgetVarianceLabel = (() => {
        if (trailingAvg === 0) {
          if (actual === 0) return "ON_TRACK";
          return "OVER";
        }
        const ratio = divide(varianceD, trailingAvgD);
        if (ratio.gt(BUDGET_VARIANCE_THRESHOLD)) return "OVER";
        if (ratio.lt(-BUDGET_VARIANCE_THRESHOLD)) return "UNDER";
        return "ON_TRACK";
      })();
      return {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        groupType: b.groupType,
        trailingAvg,
        actual,
        variance,
        status
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  // Data quality across the analysed period (trailing 3 months + current).
  const [totalRow] = await db.select({ total: count() }).from(transactions).where(inArray(monthExpr, periodMonths));
  const [uncatRow] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(inArray(monthExpr, periodMonths), isNull(transactions.categoryId)));

  return {
    month,
    trailingMonths,
    rows,
    data_quality: buildDataQuality(uncatRow?.total ?? 0, totalRow?.total ?? 0)
  };
}

// ---------------------------------------------------------------------------
// get_cashflow_trend
// ---------------------------------------------------------------------------

export type CashflowTrendPoint = {
  month: string;
  income: number;
  expenses: number;
  net: number;
};

export type CashflowTrendResult = {
  months: CashflowTrendPoint[];
  data_quality: DataQuality;
};

export async function getCashflowTrend(
  db: PnlDb,
  monthsRequested: number,
  today: Date = new Date()
): Promise<CashflowTrendResult> {
  const months = Math.max(1, Math.min(24, Math.floor(monthsRequested)));
  const currYm = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const periodMonths: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    periodMonths.push(formatMonth(shiftMonth(currYm, -i)));
  }

  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;

  const rows = await db
    .select({
      month: monthExpr,
      groupType: categories.groupType,
      creditTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'CREDIT' THEN ${transactions.amount} ELSE 0 END)`,
      debitTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(inArray(monthExpr, periodMonths), inArray(categories.groupType, ["INCOME", "FIXED", "VARIABLE"])))
    .groupBy(monthExpr, categories.groupType);

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const m of periodMonths) byMonth.set(m, { income: 0, expenses: 0 });

  for (const r of rows) {
    const bucket = byMonth.get(r.month);
    if (!bucket) continue;
    if (r.groupType === "INCOME") {
      bucket.income += Number(r.creditTotal ?? 0);
    } else if (r.groupType === "FIXED" || r.groupType === "VARIABLE") {
      bucket.expenses += Number(r.debitTotal ?? 0);
    }
  }

  const series: CashflowTrendPoint[] = periodMonths.map((m) => {
    const b = byMonth.get(m)!;
    const incomeD = new Decimal(b.income);
    const expensesD = new Decimal(b.expenses);
    return {
      month: m,
      income: toStorable(incomeD),
      expenses: toStorable(expensesD),
      net: toStorable(subtract(incomeD, expensesD))
    };
  });

  const [totalRow] = await db.select({ total: count() }).from(transactions).where(inArray(monthExpr, periodMonths));
  const [uncatRow] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(inArray(monthExpr, periodMonths), isNull(transactions.categoryId)));

  return {
    months: series,
    data_quality: buildDataQuality(uncatRow?.total ?? 0, totalRow?.total ?? 0)
  };
}

// ---------------------------------------------------------------------------
// get_category_list
// ---------------------------------------------------------------------------

export type CategoryListRow = {
  id: number;
  name: string;
  group_type: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";
  color: string | null;
};

export type CategoryListResult = {
  rows: CategoryListRow[];
  data_quality: DataQuality;
};

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
